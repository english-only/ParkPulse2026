import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  findDuplicate,
  getCategory,
  isInAustralia,
  normaliseName,
  toFeature,
  validatePlaceRecord,
  type PlaceRecord,
} from "./schema";
import {
  ImportError,
  detectDelimiter,
  parseDelimited,
  parseSource,
  suggestMapping,
  unzip,
} from "./import";
import { buildDrafts, mappingTargets, summariseDrafts, aliasesFor } from "./pipeline";

const base = {
  category: "drinking-fountain",
  name: "Test Fountain",
  lat: "-33.8688",
  lng: "151.2093",
  attributes: { wheelchairAccessible: "yes" },
  provenance: {
    method: "manual",
    format: "manual",
    contributor: "A tester",
    contact: "tester@example.com",
    licence: "cc-by-4.0",
  },
};

describe("canonical schema", () => {
  it("accepts a complete record and normalises coordinates", () => {
    const result = validatePlaceRecord(base);
    expect(result.ok).toBe(true);
    expect(result.record?.lat).toBe(-33.8688);
    expect(result.record?.attributes.wheelchairAccessible).toBe(true);
    expect(result.record?.provenance.contact).toBe("tester@example.com");
    expect(result.record?.schemaVersion).toBe(1);
  });

  it("rejects a missing name, bad coordinates and unknown categories", () => {
    const result = validatePlaceRecord({ ...base, name: "  ", lat: "north", category: "spaceship" });
    expect(result.ok).toBe(false);
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toContain("name");
    expect(fields).toContain("lat");
    expect(fields).toContain("category");
  });

  it("rejects coordinates outside Australia rather than silently accepting them", () => {
    expect(isInAustralia(51.5, -0.12)).toBe(false);
    const result = validatePlaceRecord({ ...base, lat: "51.5", lng: "-0.12" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "country")).toBe(true);
  });

  it("does not invent values for optional fields", () => {
    const result = validatePlaceRecord(base);
    expect(result.record?.description).toBeNull();
    expect(result.record?.suburb).toBeNull();
    expect(result.record?.attributes.access).toBeUndefined();
  });

  it("only accepts http(s) links", () => {
    const result = validatePlaceRecord({
      ...base,
      provenance: { ...base.provenance, sourceUrl: "javascript:alert(1)" },
    });
    expect(result.record?.provenance.sourceUrl).toBeNull();
  });

  it("strips control characters and collapses whitespace", () => {
    const result = validatePlaceRecord({ ...base, name: "  Test\u0000   Fountain\n" });
    expect(result.record?.name).toBe("Test Fountain");
  });

  it("has a coherent category registry", () => {
    const ids = CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of CATEGORIES) {
      expect(category.fields.length).toBeGreaterThan(0);
      expect(getCategory(category.id)).toBe(category);
      const keys = category.fields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("turns a record into GeoJSON with longitude first", () => {
    const record = validatePlaceRecord(base).record as PlaceRecord;
    const feature = toFeature(record);
    expect(feature.geometry.coordinates).toEqual([151.2093, -33.8688]);
    expect(feature.properties.categoryLabel).toBe("Drinking fountain");
  });

  it("detects exact and near duplicates but not unrelated places", () => {
    const existing = [{ name: "Wentworth Park", category: "park", lat: -33.87, lng: 151.2 }];
    expect(
      findDuplicate({ name: "wentworth  park", category: "park", lat: -33.870001, lng: 151.200001 }, existing)
        ?.kind,
    ).toBe("same");
    expect(
      findDuplicate({ name: "Something Else", category: "park", lat: -33.8701, lng: 151.2001 }, existing)
        ?.kind,
    ).toBe("near");
    expect(
      findDuplicate({ name: "Wentworth Park", category: "toilet", lat: -33.87, lng: 151.2 }, existing),
    ).toBeNull();
    expect(findDuplicate({ name: "Far Away", category: "park", lat: -33.9, lng: 151.2 }, existing)).toBeNull();
  });

  it("normalises names for comparison", () => {
    expect(normaliseName("St. James’ & Green Park")).toBe("st james and green park");
  });
});

describe("delimiter parsing", () => {
  it("handles quoted commas, doubled quotes and embedded newlines", () => {
    const rows = parseDelimited('name,note\n"Park, The","He said ""hi"""\n"Two\nlines",x', ",");
    expect(rows).toEqual([
      ["name", "note"],
      ["Park, The", 'He said "hi"'],
      ["Two\nlines", "x"],
    ]);
  });

  it("picks tab-separated data over a comma inside a value", () => {
    expect(detectDelimiter("name\tnote\na,b\tc\n")).toBe("\t");
  });

  it("strips a byte-order mark", () => {
    const rows = parseDelimited("\uFEFFname,lat\nA,-33.8", ",");
    expect(rows[0]).toEqual(["name", "lat"]);
  });
});

describe("adapters", () => {
  it("parses CSV into a table and keeps duplicate headers distinct", async () => {
    const result = await parseSource({
      name: "places.csv",
      text: "name,lat,lng,access,access\nRotary Park,-33.87,151.2,public,unknown",
    });
    expect(result.format).toBe("csv");
    expect(result.tables[0].headers).toEqual(["name", "lat", "lng", "access", "access_2"]);
    expect(result.tables[0].rows[0].values.name).toBe("Rotary Park");
  });

  it("reads GeoJSON polygons through their representative point", async () => {
    const result = await parseSource({
      name: "parks.geojson",
      text: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Square Park", park_type: "Pocket" },
            geometry: {
              type: "Polygon",
              coordinates: [[[151.2, -33.87], [151.21, -33.87], [151.21, -33.86], [151.2, -33.86], [151.2, -33.87]]],
            },
          },
          { type: "Feature", properties: { name: "No geometry" }, geometry: null },
        ],
      }),
    });
    expect(result.format).toBe("geojson");
    expect(result.tables[0].rows).toHaveLength(1);
    // Centre of the ring, with the repeated closing vertex ignored.
    expect(result.tables[0].rows[0].lat).toBeCloseTo(-33.865, 4);
    expect(result.tables[0].rows[0].lng).toBeCloseTo(151.205, 4);
    expect(result.tables[0].rows[0].values.park_type).toBe("Pocket");
  });

  it("flattens nested JSON objects", async () => {
    const result = await parseSource({
      name: "records.json",
      text: JSON.stringify({ records: [{ name: "A", attributes: { access: "public" } }] }),
    });
    expect(result.tables[0].headers).toContain("attributes.access");
  });

  it("parses KML placemarks and strips markup from descriptions", async () => {
    const result = await parseSource({
      name: "places.kml",
      text: `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Ferry Wharf</name><description>&lt;b&gt;Refill&lt;/b&gt; point</description>
          <Point><coordinates>151.2,-33.86,0</coordinates></Point></Placemark>
      </Document></kml>`,
    });
    expect(result.tables[0].rows[0].values.name).toBe("Ferry Wharf");
    expect(result.tables[0].rows[0].values.description).toBe("Refill point");
    expect(result.tables[0].rows[0].lat).toBeCloseTo(-33.86);
  });

  it("parses GPX waypoints", async () => {
    const result = await parseSource({
      name: "walk.gpx",
      text: `<?xml version="1.0"?><gpx version="1.1"><wpt lat="-33.86" lon="151.2"><name>Bench</name><type>seat</type></wpt></gpx>`,
    });
    expect(result.tables[0].rows[0].values).toMatchObject({ name: "Bench", type: "seat" });
  });

  it("refuses XML with entity declarations", async () => {
    await expect(
      parseSource({
        name: "evil.kml",
        text: `<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml><Placemark><name>&xxe;</name></Placemark></kml>`,
      }),
    ).rejects.toThrow(/document type or entity/i);
  });

  it("reports unsupported formats with a reason", async () => {
    await expect(parseSource({ name: "notes.pdf", text: "x" })).rejects.toMatchObject({
      code: "unsupported",
    });
    try {
      await parseSource({ name: "notes.pdf", text: "x" });
    } catch (error) {
      expect((error as ImportError).message).toContain("PDFs");
    }
  });

  it("rejects malformed JSON", async () => {
    await expect(parseSource({ name: "bad.json", text: "{" })).rejects.toMatchObject({ code: "malformed" });
  });

  it("reads a stored ZIP of CSV files", async () => {
    const zip = makeZip({ "places.csv": "name,lat,lng\nA,-33.86,151.2\n" });
    const result = await parseSource({ name: "bundle.zip", bytes: zip });
    expect(result.tables[0].rows[0].values.name).toBe("A");
  });

  it("reads an XLSX workbook with shared strings", async () => {
    const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>-33.86</v></c><c r="C2"><v>151.2</v></c></row>
    </sheetData></worksheet>`;
    const strings = `<?xml version="1.0"?><sst><si><t>name</t></si><si><t>lat</t></si><si><t>lng</t></si><si><t>XLSX Park</t></si></sst>`;
    const zip = makeZip({
      "xl/worksheets/sheet1.xml": sheet,
      "xl/sharedStrings.xml": strings,
    });
    const result = await parseSource({ name: "places.xlsx", bytes: zip });
    expect(result.format).toBe("xlsx");
    expect(result.tables[0].rows[0].values).toEqual({ name: "XLSX Park", lat: "-33.86", lng: "151.2" });
  });

  it("rejects ZIP path traversal", async () => {
    const zip = makeZip({ "../secret.csv": "name\nx" });
    await expect(unzip(zip)).rejects.toThrow(/unsafe path/i);
  });

  it("suggests a mapping from aliases", () => {
    const mapping = suggestMapping(
      ["Park Name", "Latitude", "Longitude", "Street Address"],
      ["name", "lat", "lng", "address"],
      (key) => aliasesFor("park", key),
    );
    expect(mapping).toEqual({
      name: "Park Name",
      lat: "Latitude",
      lng: "Longitude",
      address: "Street Address",
    });
  });
});

describe("pipeline", () => {
  const table = {
    name: "table",
    headers: ["Name", "Lat", "Lng", "Access", "Playground"],
    rows: [
      { values: { Name: "Good Park", Lat: "-33.87", Lng: "151.2", Access: "public", Playground: "yes" }, sourceRow: 2 },
      { values: { Name: "", Lat: "-33.88", Lng: "151.21", Access: "public", Playground: "" }, sourceRow: 3 },
      { values: { Name: "Bad Lat", Lat: "north", Lng: "151.2", Access: "", Playground: "" }, sourceRow: 4 },
    ],
  };

  it("validates each row and keeps the failures for correction", () => {
    const drafts = buildDrafts({
      table,
      category: "park",
      mapping: { name: "Name", lat: "Lat", lng: "Lng", access: "Access", hasPlayground: "Playground" },
      defaults: { format: "csv", licence: "cc-by-4.0" },
    });
    expect(drafts).toHaveLength(3);
    expect(drafts[0].issues).toEqual([]);
    expect(drafts[0].record?.attributes.hasPlayground).toBe(true);
    expect(drafts[1].issues.map((issue) => issue.field)).toContain("name");
    expect(drafts[2].issues.map((issue) => issue.field)).toContain("lat");
    expect(summariseDrafts(drafts)).toMatchObject({ total: 3, ready: 1, invalid: 2 });
  });

  it("flags duplicates against served data and inside the batch", () => {
    const drafts = buildDrafts({
      table,
      category: "park",
      mapping: { name: "Name", lat: "Lat", lng: "Lng" },
      existing: [{ name: "Good Park", category: "park", lat: -33.870001, lng: 151.200001 }],
    });
    expect(drafts[0].duplicate?.kind).toBe("same");
    expect(drafts[0].excluded).toBe(true);
    expect(summariseDrafts(drafts).duplicates).toBe(1);
  });

  it("caps the rows it examines", () => {
    const drafts = buildDrafts({ table, category: "park", mapping: {}, limit: 2 });
    expect(drafts).toHaveLength(2);
  });

  it("exposes mapping targets for every category", () => {
    for (const category of CATEGORIES) {
      const targets = mappingTargets(category.id);
      expect(targets.some((target) => target.key === "name" && target.required)).toBe(true);
      expect(targets.some((target) => target.key === "lat" && target.required)).toBe(true);
    }
  });
});

/* ── ZIP fixture helper ──────────────────────────────────────────────────── */

function makeZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const entries = Object.entries(files);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const record = new Uint8Array(46 + nameBytes.length);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true);
    recordView.setUint16(6, 20, true);
    recordView.setUint16(8, 0, true);
    recordView.setUint16(10, 0, true);
    recordView.setUint32(16, 0, true);
    recordView.setUint32(20, data.length, true);
    recordView.setUint32(24, data.length, true);
    recordView.setUint16(28, nameBytes.length, true);
    recordView.setUint32(42, offset, true);
    record.set(nameBytes, 46);
    central.push(record);
    offset += local.length;
  }

  const directorySize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, directorySize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + directorySize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, eocd]) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
