import { describe, expect, it } from "vitest";
import {
  collectAllFeatures,
  esriFeatureToGeoJSON,
  esriRingsToPolygons,
  normalizeProperties,
  queryUrl,
  signedRingArea,
  toFeatureCollection,
} from "../../scripts/lib/arcgis.mjs";
import { validateGeoJSON } from "../../scripts/validate-geojson.mjs";
import { pickRelevantDatasets } from "../../scripts/fetch-council-opendatasoft.mjs";
import { parseArgs } from "../../scripts/fetch-council-arcgis.mjs";

/**
 * Fixture tests for the Phase 2 council fetch pipeline (FR2.6).
 *
 * Everything here runs offline: the pure modules are imported directly and
 * fed fixtures, which is exactly how the CLI scripts behave on a connected
 * machine minus the fetch layer.
 */

// 10×10 clockwise square (ArcGIS outer-ring convention) with a
// counter-clockwise hole in the middle.
const cwSquare: Array<[number, number]> = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
  [0, 0],
];
const ccwHole: Array<[number, number]> = [
  [3, 3],
  [7, 3],
  [7, 7],
  [3, 7],
  [3, 3],
];

describe("signedRingArea / esriRingsToPolygons", () => {
  it("classifies winding by sign", () => {
    expect(signedRingArea(cwSquare)).toBeLessThan(0);
    expect(signedRingArea(ccwHole)).toBeGreaterThan(0);
  });

  it("groups an outer ring with its hole", () => {
    const polygons = esriRingsToPolygons([cwSquare, ccwHole]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
    expect(polygons[0][0]).toHaveLength(5); // closed ring
  });

  it("starts a new polygon at each outer ring", () => {
    const shifted = cwSquare.map(([x, y]) => [x + 100, y] as [number, number]);
    const polygons = esriRingsToPolygons([cwSquare, shifted]);
    expect(polygons).toHaveLength(2);
    expect(polygons[1][0][0]).toEqual([100, 0]);
  });

  it("drops rings too small to be polygons", () => {
    expect(esriRingsToPolygons([[[0, 0], [1, 1]]])).toHaveLength(0);
  });
});

describe("esriFeatureToGeoJSON", () => {
  it("converts esri point geometry", () => {
    const out = esriFeatureToGeoJSON({ geometry: { x: 151.2, y: -33.8 } }, { name: "A" });
    expect(out).toEqual({
      type: "Feature",
      properties: { name: "A" },
      geometry: { type: "Point", coordinates: [151.2, -33.8] },
    });
  });

  it("converts esri polygon rings into a Polygon", () => {
    const out = esriFeatureToGeoJSON({ geometry: { rings: [cwSquare] } }, {});
    expect(out?.geometry.type).toBe("Polygon");
    expect(out?.geometry.coordinates).toHaveLength(1);
  });

  it("returns null for missing geometry", () => {
    expect(esriFeatureToGeoJSON({ geometry: null }, {})).toBeNull();
    expect(esriFeatureToGeoJSON(undefined, {})).toBeNull();
  });
});

describe("normalizeProperties (PRD §5.1 target schema)", () => {
  const raw = {
    PLANLABEL: "  Parramatta Park  ",
    CLASSSUBTY: "Reserve",
    SUBURB: "Parramatta",
    PLAYGROUND: "Yes",
    Shape__Area: 12345.6,
    UNMAPPABLE_FIELD: "ignored",
  };

  it("maps known fields and leaves unknown ones out", () => {
    const props = normalizeProperties({
      id: 7,
      raw,
      lgaId: "city-of-parramatta-council",
      lgaName: "City of Parramatta Council",
    });
    expect(props).toEqual({
      id: 7,
      name: "Parramatta Park",
      type: "Reserve",
      suburb: "Parramatta",
      lga_id: "city-of-parramatta-council",
      lga_name: "City of Parramatta Council",
      has_playground: true,
      area_m2: 12345.6,
    });
    expect("UNMAPPABLE_FIELD" in props).toBe(false);
  });

  it("renders unmappable values as null, never as placeholders", () => {
    const props = normalizeProperties({ id: 1, raw: {}, lgaId: "x", lgaName: "X" });
    expect(props.name).toBeNull();
    expect(props.type).toBeNull();
    expect(props.suburb).toBeNull();
    expect(props.has_playground).toBeNull();
    expect(props.area_m2).toBeNull();
  });

  it("parses playground flags conservatively", () => {
    const yes = normalizeProperties({ id: 1, raw: { PLAYGROUND: "yes" }, lgaId: "x", lgaName: "X" });
    const no = normalizeProperties({ id: 1, raw: { PLAYGROUND: "No" }, lgaId: "x", lgaName: "X" });
    const maybe = normalizeProperties({ id: 1, raw: { PLAYGROUND: "maybe" }, lgaId: "x", lgaName: "X" });
    expect(yes.has_playground).toBe(true);
    expect(no.has_playground).toBe(false);
    expect(maybe.has_playground).toBeNull();
  });
});

describe("queryUrl", () => {
  it("keeps object ids literal so ArcGIS does not 404 on encoded commas", () => {
    const url = queryUrl("https://example.arcgis.com/FeatureServer", 5, [1, 2, 3]);
    expect(url).toBe(
      "https://example.arcgis.com/FeatureServer/5/query?f=geojson&where=1%3D1&outFields=*&outSR=4326&objectIds=1,2,3",
    );
  });

  it("does not double a trailing slash on the service URL", () => {
    const url = queryUrl("https://example.arcgis.com/FeatureServer/", 0, [9]);
    expect(url.startsWith("https://example.arcgis.com/FeatureServer/0/query?")).toBe(true);
  });
});

describe("collectAllFeatures", () => {
  it("pages object ids and collects features", async () => {
    const seen: number[][] = [];
    const { features } = await collectAllFeatures({
      objectIds: [1, 2, 3, 4, 5],
      pageSize: 2,
      queryFn: async (ids) => {
        seen.push(ids);
        return ids.map(id => ({ type: "Feature", properties: { id }, geometry: null } as never));
      },
    });
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
    expect(features).toHaveLength(5);
  });

  it("drops null features rather than emitting broken ones", async () => {
    const { features } = await collectAllFeatures({
      objectIds: [1, 2],
      pageSize: 10,
      queryFn: async () => [null, { type: "Feature", properties: {}, geometry: null } as never],
    });
    expect(features).toHaveLength(1);
  });
});

describe("validateGeoJSON", () => {
  const good = toFeatureCollection([
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [151.2, -33.8] } },
  ]);

  it("accepts a non-empty FeatureCollection in EPSG:4326", () => {
    const result = validateGeoJSON(JSON.stringify(good));
    expect(result.ok).toBe(true);
    expect(result.features).toBe(1);
  });

  it("rejects malformed JSON", () => {
    expect(validateGeoJSON("{oops").ok).toBe(false);
  });

  it("rejects the wrong root type and empty collections", () => {
    expect(validateGeoJSON(JSON.stringify({ type: "Feature" })).ok).toBe(false);
    expect(validateGeoJSON(JSON.stringify({ type: "FeatureCollection", features: [] })).ok).toBe(false);
  });

  it("rejects coordinates outside the WGS84 range", () => {
    const bad = toFeatureCollection([
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [511, -33] } },
    ]);
    const result = validateGeoJSON(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/EPSG:4326/);
  });

  it("enforces a byte budget when one is given", () => {
    const result = validateGeoJSON(JSON.stringify(good), { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/exceeds budget/);
  });
});

describe("pickRelevantDatasets (Opendatasoft probe)", () => {
  const entry = (id: string, title: string, description = "") => ({
    dataset_id: id,
    metas: { default: { title, description, license_id: null } },
  });

  it("keeps datasets titled around parks or trees", () => {
    const out = pickRelevantDatasets([
      entry("parks", "Parks and open spaces"),
      entry("trees", "Street tree inventory"),
      entry("canopy", "Urban tree canopy cover"),
    ]);
    expect(out.map(r => r.dataset_id)).toEqual(["parks", "trees", "canopy"]);
  });

  it("rejects parking/device noise — regression for the Liverpool probe", () => {
    const out = pickRelevantDatasets([
      entry("ncounter", "Devices, people and vehicles counting - Liverpool",
        "Liverpool City Council has device counters deployed throughout the city centre…"),
      entry("carpark", "Liverpool CBD Car Park Map", "Parking occupancy across the CBD."),
      entry("water", "Sydney Water Temperature & Humidity", "Sensor readings from parks network."),
    ]);
    expect(out).toEqual([]);
  });

  it("keeps a description-only hit when it is genuinely about street trees", () => {
    const out = pickRelevantDatasets([
      entry("assets", "Council asset register", "Includes the street tree inventory and pruning schedule."),
    ]);
    expect(out.map(r => r.dataset_id)).toEqual(["assets"]);
  });

  it("records the source licence when the portal states one", () => {
    const out = pickRelevantDatasets([
      { ...entry("parks", "Parks"), metas: { default: { title: "Parks", description: "", license_id: "CC-BY-4.0" } } },
    ]);
    expect(out[0].license_id).toBe("CC-BY-4.0");
  });
});

describe("fetch-council-arcgis parseArgs", () => {
  it("reads flags and defaults the category", () => {
    const opts = parseArgs([
      "node", "script",
      "--service", "https://s/FeatureServer",
      "--layer", "5",
      "--lga-id", "lga-x",
      "--lga-name", "X Council",
      "--out", "out.geojson",
    ]);
    expect(opts.service).toBe("https://s/FeatureServer");
    expect(opts.layer).toBe("5");
    expect(opts.category).toBe("parks");
    expect(opts.pageSize).toBe(100);
  });
});
