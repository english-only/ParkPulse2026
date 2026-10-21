import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CANOPY_TARGET_METERS,
  LAYER_BUDGET_BYTES,
  extractFromFixture,
  normalizeCouncilKey,
  registerProjection,
} from "../../scripts/canopy-extract.mjs";
import {
  canopyPercent,
  canopyWeight,
  computeCanopy,
  fillIntervalsForRow,
  mergeCanopyIntoIndex,
  mergeRunsIntoRectangles,
  overviewTransform,
  pickOverviewLevel,
  rectanglesToFeatures,
  ringsFromGeometry,
} from "../../scripts/lib/canopy.mjs";

/**
 * PRD Phase 5 acceptance #3: the percentage math is asserted on synthetic
 * geometry with hand-computed expected values — no raster I/O, no network.
 *
 * Synthetic grid: 10×10 cells of 1 unit, origin (0, 100) with resY = -1, so
 * pixel (col, row) owns centre (col + 0.5, 99.5 − row).
 */
const GRID = {
  width: 10,
  height: 10,
  transform: { originX: 0, originY: 100, resX: 1, resY: -1 },
};

/** Square ring that selects exactly cols 2–6 and rows 2–6 (25 cells). */
const SQUARE = [
  [2, 98],
  [7, 98],
  [7, 93],
  [2, 93],
  [2, 98],
];

/** 25 cells: 17 canopy (one of them a fractional 0.4), plus decoys outside. */
function syntheticData(): Float32Array {
  const data = new Float32Array(GRID.width * GRID.height);
  const set = (col: number, row: number, value: number) => {
    data[row * GRID.width + col] = value;
  };
  for (const col of [2, 3, 4, 5, 6]) set(col, 2, 1); // row 2: 5 canopy
  for (const col of [2, 3, 4, 5, 6]) set(col, 3, 1); // row 3: 5 canopy
  set(2, 4, 1);
  set(3, 4, 1); // row 4: 2 canopy
  set(4, 5, 0.4); // row 5: fractional (mostly non-canopy cell)
  for (const col of [2, 3, 4, 5, 6]) set(col, 6, 1); // row 6: 5 canopy
  set(0, 0, 1); // outside the polygon — must not be counted
  return data;
}

const identity = (x: number, y: number): [number, number] => [x, y];

const SQUARE_RING = [SQUARE];

describe("canopy percentage math (FR5.2)", () => {
  it("rounds to an integer between 0 and 100", () => {
    expect(canopyPercent(2500, 3600)).toBe(69); // the shipped fixture
    expect(canopyPercent(1, 3)).toBe(33);
    expect(canopyPercent(2, 3)).toBe(67);
    expect(canopyPercent(0, 10)).toBe(0);
    expect(canopyPercent(10, 10)).toBe(100);
    expect(canopyPercent(17.4, 25)).toBe(70); // fractional cell participates
    expect(canopyPercent(120, 100)).toBe(100); // clamped, never > 100
    expect(canopyPercent(-5, 100)).toBe(0); // clamped, never < 0
  });

  it("returns null — never a fabricated 0 — when nothing was measured", () => {
    expect(canopyPercent(0, 0)).toBeNull();
    expect(canopyPercent(5, -1)).toBeNull();
    expect(canopyPercent(5, Number.NaN)).toBeNull();
  });

  it("treats values as a 0–1 mask: binary, fractional and class codes", () => {
    expect(canopyWeight(0)).toBe(0);
    expect(canopyWeight(1)).toBe(1);
    expect(canopyWeight(0.4)).toBe(0.4); // averaged overview cell
    expect(canopyWeight(0.5)).toBe(1); // threshold is inclusive
    expect(canopyWeight(2)).toBe(1); // class code still means "canopy"
    expect(canopyWeight(-1)).toBe(0);
    expect(canopyWeight(Number.NaN)).toBe(0);
  });
});

describe("overview selection (FR5.1/5.3)", () => {
  const pyramid = [[16000], [8000], [4000], [2000], [1000], [500], [250]].map(w => [w[0], w[0]]);

  it("picks the coarsest level whose pixels stay ≤ 30 m", () => {
    // 0.48 m base: level 5 = 15.36 m, level 6 = 30.72 m → level 5 wins.
    expect(pickOverviewLevel(pyramid, 0.48, CANOPY_TARGET_METERS, 1)).toBe(5);
    expect(pickOverviewLevel(pyramid, 0.48, 31, 1)).toBe(6);
    expect(pickOverviewLevel(pyramid, 0.48, 5, 1)).toBe(3); // 3.84 m ≤ 5 m
  });

  it("never goes finer than level 0 when even full res is too coarse", () => {
    expect(pickOverviewLevel(pyramid, 0.48, 0.1, 1)).toBe(0);
  });

  it("converts degrees to metres for geographic rasters", () => {
    // 0.00027° ≈ 30.06 m → the only level that fits is none → 0.
    expect(pickOverviewLevel(pyramid, 0.00027, 30, 111320)).toBe(0);
    // 0.00013° ≈ 14.47 m at level 0, doubling per level: L1 = 28.9 m ≤ 30,
    // L2 = 57.9 m > 30 → level 1 is the coarsest that still fits.
    expect(pickOverviewLevel(pyramid, 0.00013, 30, 111320)).toBe(1);
  });

  it("scales the transform from level 0 to an overview", () => {
    const gt = overviewTransform({ originX: 100, originY: 200, resX: 1, resY: -1, baseWidth: 16000, levelWidth: 1000 });
    expect(gt).toEqual({ originX: 100, originY: 200, resX: 16, resY: -16 });
  });
});

describe("scanline fill and canopy pass", () => {
  const rings = [SQUARE];

  it("fills exactly the columns whose centres are inside the ring", () => {
    expect(fillIntervalsForRow(rings, 97.5, GRID.transform, GRID.width)).toEqual([[2, 7]]);
    expect(fillIntervalsForRow(rings, 93.5, GRID.transform, GRID.width)).toEqual([[2, 7]]);
    expect(fillIntervalsForRow(rings, 98.5, GRID.transform, GRID.width)).toEqual([]); // just above
    expect(fillIntervalsForRow(rings, 92.5, GRID.transform, GRID.width)).toEqual([]); // just below
    expect(fillIntervalsForRow(rings, 97.5, GRID.transform, 4)).toEqual([[2, 4]]); // clamped to width
  });

  it("measures 17.4 / 25 canopy cells → 70% and lists the runs", () => {
    const stats = computeCanopy({ data: syntheticData(), ...GRID, rings });
    expect(stats.totalPixels).toBe(25);
    expect(stats.canopyPixels).toBe(17);
    // Float32 storage makes 0.4 ≈ 0.400000006, so compare to 6 decimals.
    expect(stats.canopyWeight).toBeCloseTo(17.4, 6);
    expect(canopyPercent(stats.canopyWeight, stats.totalPixels)).toBe(70);
    expect(stats.runs).toEqual([
      { row: 2, col0: 2, col1: 7 },
      { row: 3, col0: 2, col1: 7 },
      { row: 4, col0: 2, col1: 4 },
      { row: 6, col0: 2, col1: 7 },
    ]);
  });

  it("honours holes: a ring inside the square removes those cells", () => {
    const hole = [
      [3, 97],
      [5, 97],
      [5, 95],
      [3, 95],
      [3, 97],
    ];
    const stats = computeCanopy({ data: syntheticData(), ...GRID, rings: [...SQUARE_RING, hole] });
    // The hole covers cols 3–4 × rows 3–4 = 4 cells → 25 − 4 = 19 remain.
    expect(stats.totalPixels).toBe(21);
  });

  it("measures nothing (null) when the boundary misses the raster", () => {
    const stats = computeCanopy({ data: syntheticData(), ...GRID, rings: [[[20, 80], [30, 80], [30, 70], [20, 70], [20, 80]]] });
    expect(stats.totalPixels).toBe(0);
    expect(canopyPercent(stats.canopyWeight, stats.totalPixels)).toBeNull();
  });
});

describe("layer emission (FR5.2)", () => {
  it("merges identical runs on consecutive rows into rectangles", () => {
    expect(mergeRunsIntoRectangles(computeCanopy({ data: syntheticData(), ...GRID, rings: [SQUARE] }).runs)).toEqual([
      { row0: 2, row1: 4, col0: 2, col1: 7 },
      { row0: 4, row1: 5, col0: 2, col1: 4 },
      { row0: 6, row1: 7, col0: 2, col1: 7 },
    ]);
    expect(mergeRunsIntoRectangles([])).toEqual([]);
  });

  it("emits closed polygons carrying canopy_percent", () => {
    const rects = [{ row0: 2, row1: 4, col0: 2, col1: 7 }];
    const features = rectanglesToFeatures(rects, GRID.transform as never, identity, { lga_id: "test", canopy_percent: 70 });
    expect(features).toHaveLength(1);
    expect(features[0].properties).toEqual({ lga_id: "test", canopy_percent: 70 });
    expect(features[0].geometry.type).toBe("Polygon");
    const ring = features[0].geometry.coordinates[0];
    expect(ring).toEqual([
      [2, 98],
      [7, 98],
      [7, 96],
      [2, 96],
      [2, 98],
    ]);
  });

  it("projects Polygon and MultiPolygon boundaries into the raster CRS", () => {
    const project = (lng: number, lat: number) => [lng * 2, lat * 2];
    const polygon = ringsFromGeometry({ type: "Polygon", coordinates: [SQUARE] }, project);
    expect(polygon[0][0]).toEqual([4, 196]);
    const multi = ringsFromGeometry(
      { type: "MultiPolygon", coordinates: [[SQUARE], [[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
      project,
    );
    expect(multi).toHaveLength(2);
    expect(() => ringsFromGeometry({ type: "Point", coordinates: [0, 0] }, project)).toThrow(/unsupported geometry/);
  });
});

describe("council index merge (FR5.2 — rebuild, never hand-edit)", () => {
  it("folds measured scalars in and leaves explicit nulls elsewhere", () => {
    const index = { councils: [{ lga_id: "a" }, { lga_id: "b" }] } as { councils: Array<{ lga_id: string; canopy_percent?: number | null }> };
    const canopy = { councils: [{ lga_id: "a", canopy_percent: 42 }] };
    mergeCanopyIntoIndex(index, canopy as never);
    expect(index.councils[0].canopy_percent).toBe(42);
    expect(index.councils[1].canopy_percent).toBeNull();
  });

  it("never fabricates a 0 for missing or malformed values", () => {
    const index = { councils: [{ lga_id: "a" }, { lga_id: "b" }, { lga_id: "c" }] } as { councils: Array<{ lga_id: string; canopy_percent?: number | null }> };
    const canopy = {
      councils: [
        { lga_id: "a", canopy_percent: "17" }, // string → invalid
        { lga_id: "b", canopy_percent: Number.NaN },
      ],
    };
    mergeCanopyIntoIndex(index, canopy as never);
    expect(index.councils.map(c => c.canopy_percent)).toEqual([null, null, null]);
  });

  it("is a no-op when no canopy run exists yet", () => {
    const index = { councils: [{ lga_id: "a" }] } as { councils: Array<{ lga_id: string; canopy_percent?: number | null }> };
    mergeCanopyIntoIndex(index, null);
    expect(index.councils[0].canopy_percent).toBeNull();
  });
});

describe("zip directory naming and CRS registration", () => {
  it("normalises display names to the canopy zip's LGA directories", () => {
    expect(normalizeCouncilKey("Blacktown City Council")).toBe("BLACKTOWN");
    expect(normalizeCouncilKey("The Hills Shire Council")).toBe("HILLS");
    expect(normalizeCouncilKey("City of Sydney")).toBe("SYDNEY");
    expect(normalizeCouncilKey("City of Canada Bay")).toBe("CANADA BAY");
    expect(normalizeCouncilKey("Ku-ring-gai Council")).toBe("KU-RING-GAI");
    expect(normalizeCouncilKey("Lane Cove Municipal Council")).toBe("LANE COVE");
    expect(normalizeCouncilKey("Hunters Hill Council")).toBe("HUNTERS HILL");
    expect(normalizeCouncilKey("Unincorporated Area")).toBe("UNINCORPORATED");
  });

  it("builds a MGA zone 56 definition for GDA2020 tiles", () => {
    const proj = registerProjection(7856);
    expect(proj.def).toContain("+proj=utm");
    expect(proj.def).toContain("+zone=56");
    expect(proj.def).toContain("+south");
    expect(proj.unitsPerMetre).toBe(1);
    expect(registerProjection(7844).unitsPerMetre).toBeGreaterThan(100000); // degrees → metres
    expect(() => registerProjection(123456)).toThrow(/unsupported raster CRS/);
  });
});

describe("fixture run (FR5.3 — offline CI path)", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  async function runFixture() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pp-canopy-test-"));
    dirs.push(dir);
    return { dir, result: await extractFromFixture({ outDir: dir }) };
  }

  it("produces the hand-computed 69% (2500 of 3600 cells)", async () => {
    const { result } = await runFixture();
    expect(result.totalPixels).toBe(3600);
    expect(result.canopyPixels).toBe(2500);
    expect(result.percent).toBe(69);
    expect(result.level).toBe(0); // single-level fixture raster, 10 m ≤ 30 m
    expect(result.epsg).toBe(7856);
  });

  it("writes a valid FeatureCollection whose features carry canopy_percent", async () => {
    const { dir, result } = await runFixture();
    expect(result.files.length).toBeGreaterThan(0);
    const geo = JSON.parse(await readFile(path.join(dir, "fixture-lga.geojson"), "utf8"));
    expect(geo.type).toBe("FeatureCollection");
    expect(geo.features.length).toBeGreaterThan(0);
    for (const feature of geo.features) {
      expect(feature.properties.canopy_percent).toBe(69);
      expect(feature.properties.lga_id).toBe("fixture-lga");
      expect(feature.geometry.type).toBe("Polygon");
      const [lng, lat] = feature.geometry.coordinates[0][0];
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
    expect(result.layer.bytes).toBeLessThanOrEqual(LAYER_BUDGET_BYTES);
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    expect(index.councils).toEqual([
      expect.objectContaining({ lga_id: "fixture-lga", canopy_percent: 69, inside_pixels: 3600, canopy_pixels: 2500 }),
    ]);
  });

  it("is byte-identical when re-run (FR5.5 determinism)", async () => {
    const first = await runFixture();
    const second = await runFixture();
    const a = await readFile(path.join(first.dir, "fixture-lga.geojson"), "utf8");
    const b = await readFile(path.join(second.dir, "fixture-lga.geojson"), "utf8");
    expect(a).toBe(b);
    expect(first.result.percent).toBe(second.result.percent);
  });
});
