import { describe, expect, it } from "vitest";
import {
  COUNCIL_PALETTE,
  bboxOfGeometry,
  computeSelectionStats,
  councilColor,
  filterByCouncils,
  filterCouncils,
  hashString,
  parseCouncilsParam,
  pointInCouncil,
  pointInPolygon,
  pointInRing,
  resolveCouncilQuery,
  serializeCouncilsParam,
  sortCouncils,
  unionBBox,
  type CouncilGeometry,
  type CouncilIndexEntry,
} from "./councils";

function entry(over: Partial<CouncilIndexEntry> = {}): CouncilIndexEntry {
  return {
    id: 1,
    lga_id: "council-a",
    name: "COUNCIL A",
    display_name: "Council A",
    priority: false,
    priority_rank: null,
    area_km2: 100,
    bbox: [-34, 150, -33, 151],
    centroid: [-33.5, 150.5],
    geometry_file: "boundaries/councils/council-a.geojson",
    ...over,
  };
}

// 0–0.1° square ring (closed), in [lng, lat].
const square: Array<[number, number]> = [
  [0, 0],
  [0.1, 0],
  [0.1, 0.1],
  [0, 0.1],
  [0, 0],
];

// Same square with a 0.04×0.04 hole in the middle.
const squareWithHole: Array<[number, number]> = [
  square,
  [
    [0.03, 0.03],
    [0.07, 0.03],
    [0.07, 0.07],
    [0.03, 0.07],
    [0.03, 0.03],
  ],
];

const squareGeom: CouncilGeometry = { type: "Polygon", coordinates: [square] };
const holedGeom: CouncilGeometry = { type: "Polygon", coordinates: squareWithHole };

const farSquare: Array<[number, number]> = square.map(([lng, lat]) => [lng + 5, lat]);
const multiGeom: CouncilGeometry = {
  type: "MultiPolygon",
  coordinates: [[square], [farSquare]],
};

describe("sortCouncils", () => {
  it("orders priority councils by rank then the rest alphabetically", () => {
    const input = [
      entry({ lga_id: "z", display_name: "Zed Council", priority_rank: null }),
      entry({ lga_id: "b", display_name: "Blacktown City Council", priority_rank: 3 }),
      entry({ lga_id: "a", display_name: "aardvark council", priority_rank: null }),
      entry({ lga_id: "s", display_name: "City of Sydney", priority_rank: 0 }),
      entry({ lga_id: "p", display_name: "City of Parramatta Council", priority_rank: 1 }),
    ];
    expect(sortCouncils(input).map(e => e.lga_id)).toEqual([
      "s",
      "p",
      "b",
      "a",
      "z",
    ]);
  });

  it("breaks equal ranks by display name and does not mutate the input", () => {
    const input = [
      entry({ lga_id: "second", display_name: "Bee Council", priority_rank: 2 }),
      entry({ lga_id: "first", display_name: "Aye Council", priority_rank: 2 }),
    ];
    const sorted = sortCouncils(input);
    expect(sorted.map(e => e.lga_id)).toEqual(["first", "second"]);
    expect(input[0].lga_id).toBe("second");
  });

  it("sorts case- and diacritic-insensitively by display name", () => {
    const input = [
      entry({ lga_id: "2", display_name: "Ku-ring-gai Council" }),
      entry({ lga_id: "1", display_name: "kogarah council" }),
      entry({ lga_id: "3", display_name: "Ashfield Council" }),
    ];
    expect(sortCouncils(input).map(e => e.lga_id)).toEqual(["3", "1", "2"]);
  });
});

describe("councilColor", () => {
  it("is stable for the same lga_id", () => {
    expect(councilColor("blacktown-city-council")).toBe(
      councilColor("blacktown-city-council"),
    );
  });

  it("always returns a colour from the fixed 8-colour palette", () => {
    for (const id of ["a", "lga-3", "city-of-sydney", "x".repeat(50)]) {
      expect(COUNCIL_PALETTE).toContain(councilColor(id));
    }
  });

  it("distributes ids across more than one palette slot", () => {
    const used = new Set(
      ["lga-1", "lga-2", "lga-3", "lga-4", "lga-5", "lga-6", "lga-7", "lga-8", "lga-9", "lga-10"]
        .map(councilColor),
    );
    expect(used.size).toBeGreaterThan(1);
  });

  it("hashes deterministically", () => {
    expect(hashString("blacktown-city-council")).toBe(
      hashString("blacktown-city-council"),
    );
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("resolveCouncilQuery / filterCouncils", () => {
  const entries = [
    entry({ lga_id: "council-of-the-city-of-sydney", display_name: "City of Sydney", name: "COUNCIL OF THE CITY OF SYDNEY" }),
    entry({ lga_id: "the-council-of-the-shire-of-hornsby", display_name: "Hornsby Shire Council" }),
    entry({ lga_id: "ku-ring-gai-council", display_name: "Ku-ring-gai Council" }),
    entry({ lga_id: "blacktown-city-council", display_name: "Blacktown City Council" }),
  ];

  it("resolves PRD aliases to exact councils", () => {
    expect(resolveCouncilQuery("sydney", entries)?.lga_id).toBe("council-of-the-city-of-sydney");
    expect(resolveCouncilQuery("Hornsby", entries)?.lga_id).toBe("the-council-of-the-shire-of-hornsby");
    expect(resolveCouncilQuery("Ku-ring-gai", entries)?.lga_id).toBe("ku-ring-gai-council");
  });

  it("matches display name, raw name and lga_id", () => {
    expect(resolveCouncilQuery("blacktown city council", entries)?.lga_id).toBe("blacktown-city-council");
    expect(resolveCouncilQuery("council of the city of sydney", entries)?.lga_id).toBe("council-of-the-city-of-sydney");
    expect(resolveCouncilQuery("ku-ring-gai-council", entries)?.lga_id).toBe("ku-ring-gai-council");
  });

  it("returns null for unknown or empty queries", () => {
    expect(resolveCouncilQuery("nowhere", entries)).toBeNull();
    expect(resolveCouncilQuery("   ", entries)).toBeNull();
  });

  it("filters on display name, raw name and lga_id substrings", () => {
    expect(filterCouncils(entries, "blacktown").map(e => e.lga_id)).toEqual([
      "blacktown-city-council",
    ]);
    expect(filterCouncils(entries, "shire").map(e => e.lga_id)).toEqual([
      "the-council-of-the-shire-of-hornsby",
    ]);
    expect(filterCouncils(entries, "")).toHaveLength(4);
  });
});

describe("point-in-polygon", () => {
  it("ray-casts a simple ring", () => {
    expect(pointInRing(0.05, 0.05, square)).toBe(true);
    expect(pointInRing(0.2, 0.05, square)).toBe(false);
    expect(pointInRing(-0.01, 0.05, square)).toBe(false);
  });

  it("honours holes", () => {
    expect(pointInPolygon(0.05, 0.05, squareWithHole)).toBe(false); // inside hole
    expect(pointInPolygon(0.015, 0.05, squareWithHole)).toBe(true); // in the frame
    expect(pointInPolygon(0.5, 0.5, squareWithHole)).toBe(false); // outside outer
  });

  it("handles multipolygon geometries", () => {
    expect(pointInCouncil(multiGeom, 0.05, 0.05)).toBe(true);
    expect(pointInCouncil(multiGeom, 5.05, 0.05)).toBe(true);
    expect(pointInCouncil(multiGeom, 2.5, 0.05)).toBe(false);
  });

  it("rejects bbox misses before walking rings", () => {
    // Far outside the geometry's bbox.
    expect(pointInCouncil(multiGeom, 100, 100)).toBe(false);
    expect(bboxOfGeometry(multiGeom)).toEqual([0, 0, 0.1, 5.1]);
  });

  it("computes the bbox of a polygon", () => {
    expect(bboxOfGeometry(holedGeom)).toEqual([0, 0, 0.1, 0.1]);
  });
});

describe("filterByCouncils", () => {
  const geoms = new Map<string, CouncilGeometry>([["inside", squareGeom]]);
  const points = [
    { lat: 0.05, lng: 0.05, name: "in" },
    { lat: 0.5, lng: 0.5, name: "out" },
    { lat: 0.01, lng: 0.09, name: "in2" },
  ];

  it("keeps only points inside a selected geometry", () => {
    expect(filterByCouncils(points, geoms).map(p => p.name)).toEqual(["in", "in2"]);
  });

  it("returns the full list when no geometries are loaded", () => {
    expect(filterByCouncils(points, new Map())).toHaveLength(3);
  });
});

describe("unionBBox", () => {
  it("unions entry bboxes", () => {
    const a = entry({ bbox: [-34, 150, -33, 151] });
    const b = entry({ bbox: [-35, 149, -32, 152] });
    expect(unionBBox([a, b])).toEqual([-35, 149, -32, 152]);
    expect(unionBBox([])).toEqual([0, 0, 0, 0]);
  });
});

describe("computeSelectionStats", () => {
  const selected = [entry({ area_km2: 100.25 }), entry({ area_km2: 49.75 })];

  it("sums area, coverage, parks, playgrounds and hectares", () => {
    const stats = computeSelectionStats({
      selected,
      totalAreaKm2: 12396.09,
      parksInSelection: [
        { lat: 0, lng: 0, hasPlayground: true, area: 10000 },
        { lat: 0, lng: 0, hasPlayground: false, area: 5000 },
        { lat: 0, lng: 0, hasPlayground: true, area: null },
      ],
    });
    expect(stats.councilCount).toBe(2);
    expect(stats.areaKm2).toBe(150);
    expect(stats.coveragePct).toBe(1.2);
    expect(stats.parks).toBe(3);
    expect(stats.playgrounds).toBe(2);
    expect(stats.parksAreaHa).toBe(1.5);
  });

  it("returns network-wide totals for an empty selection", () => {
    const stats = computeSelectionStats({
      selected: [],
      totalAreaKm2: 12396.09,
      parksInSelection: [],
    });
    expect(stats.councilCount).toBe(0);
    expect(stats.areaKm2).toBe(0);
    expect(stats.coveragePct).toBe(0);
    expect(stats.parks).toBe(0);
    expect(stats.parksAreaHa).toBe(0);
  });

  it("returns null coverage when the network total is unknown", () => {
    const stats = computeSelectionStats({
      selected,
      totalAreaKm2: 0,
      parksInSelection: [],
    });
    expect(stats.coveragePct).toBeNull();
  });
});

describe("deep links", () => {
  const valid = new Set(["lga-3", "lga-30"]);

  it("parses ids and drops invalid ones silently", () => {
    expect(parseCouncilsParam("lga-3,lga-30,bogus", "multi", valid)).toEqual({
      ids: ["lga-3", "lga-30"],
      mode: "multi",
    });
  });

  it("infers mode when absent and honours explicit mode", () => {
    expect(parseCouncilsParam("lga-3,lga-30", null, valid).mode).toBe("multi");
    expect(parseCouncilsParam("lga-3", null, valid).mode).toBe("single");
    expect(parseCouncilsParam("lga-3", "multi", valid).mode).toBe("multi");
  });

  it("deduplicates and tolerates whitespace", () => {
    expect(parseCouncilsParam(" lga-3 , lga-3 ", null, valid).ids).toEqual(["lga-3"]);
  });

  it("yields an empty selection for absent or wholly invalid params", () => {
    expect(parseCouncilsParam(null, null, valid)).toEqual({ ids: [], mode: "single" });
    expect(parseCouncilsParam("nope", "multi", valid)).toEqual({ ids: [], mode: "multi" });
  });

  it("round-trips through the serializer", () => {
    const qs = serializeCouncilsParam(["lga-3", "lga-30"], "multi");
    const params = new URLSearchParams(qs);
    expect(parseCouncilsParam(params.get("councils"), params.get("mode"), valid)).toEqual({
      ids: ["lga-3", "lga-30"],
      mode: "multi",
    });
  });

  it("emits an empty string for an empty selection", () => {
    expect(serializeCouncilsParam([], "single")).toBe("");
    expect(serializeCouncilsParam([], "multi")).toBe("");
  });

  it("omits mode for a single-council single-mode selection", () => {
    expect(serializeCouncilsParam(["lga-3"], "single")).toBe("councils=lga-3");
  });
});
