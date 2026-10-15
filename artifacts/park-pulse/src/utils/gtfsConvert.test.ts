import { describe, expect, it } from "vitest";
import { createRowStream, parseCsv, parseRecord, toObject } from "../../scripts/lib/csv.mjs";
import { normalizeRouteType, ROUTE_MODES } from "../../scripts/lib/gtfs.mjs";
import { buildPolygonIndex, pointInIndex, pointInRing } from "../../scripts/lib/geo.mjs";

/** Collect every row a stream emits, feeding `text` in fixed-size chunks. */
function streamRows(
  text: string,
  chunkSize = Infinity,
  options: { maxFields?: number } = {},
): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  const stream = createRowStream((fields: string[], meta: { line: number }) => {
    rows.push(fields);
    lines.push(meta.line);
  }, options);
  if (chunkSize === Infinity) {
    stream.write(text);
  } else {
    for (let i = 0; i < text.length; i += chunkSize) stream.write(text.slice(i, i + chunkSize));
  }
  stream.end();
  return { rows, lines };
}

describe("csv.mjs — whole-document parsing", () => {
  it("splits quoted fields, escaped quotes and CRLF", () => {
    const text = 'stop_id,stop_name,note\r\n1,"Station, Main","He said ""hi"""\r\n2,Plain,ok\r\n';
    const { header, rows } = parseCsv(text);
    expect(header).toEqual(["stop_id", "stop_name", "note"]);
    expect(rows).toEqual([
      ["1", "Station, Main", 'He said "hi"'],
      ["2", "Plain", "ok"],
    ]);
  });

  it("strips a UTF-8 BOM from the header", () => {
    const { header } = parseCsv("\ufeffa,b\n1,2\n");
    expect(header).toEqual(["a", "b"]);
  });

  it("pads short rows when zipped with toObject", () => {
    expect(toObject(["a", "b", "c"], ["1", "2"])).toEqual({ a: "1", b: "2", c: "" });
  });

  it("throws on an unterminated quoted field", () => {
    expect(() => parseRecord('a,"never closed')).toThrow(/unterminated quoted field/);
  });

  it("allows a newline inside a quoted field", () => {
    const { rows } = parseCsv('id,note\r\n1,"line one\nline two"\r\n');
    expect(rows).toEqual([["1", "line one\nline two"]]);
  });
});

describe("csv.mjs — streaming reader", () => {
  const fixture = 'id,note\r\n1,"a, b"\r\n2,plain\r\n3,"quote ""x"""\r\n';

  it("matches the non-streaming parser for the same input", () => {
    const streamed = streamRows(fixture);
    const { header, rows } = parseCsv(fixture);
    expect(streamed.rows).toEqual([header, ...rows]);
  });

  it("is chunk-boundary independent (1-char chunks == one write)", () => {
    const whole = streamRows(fixture);
    const one = streamRows(fixture, 1);
    const three = streamRows(fixture, 3);
    expect(one).toEqual(whole);
    expect(three).toEqual(whole);
  });

  it("reports the physical line each record started on", () => {
    const { lines } = streamRows(fixture);
    expect(lines).toEqual([1, 2, 3, 4]);
  });

  it("keeps line numbers correct across a quoted field that spans lines", () => {
    const text = 'id,note\r\n1,"one\ntwo"\r\n2,plain\r\n';
    const { rows, lines } = streamRows(text, 4);
    expect(rows).toEqual([
      ["id", "note"],
      ["1", "one\ntwo"],
      ["2", "plain"],
    ]);
    expect(lines).toEqual([1, 2, 4]);
  });

  it("emits a final record that has no terminator, and nothing after a trailing newline", () => {
    expect(streamRows("a,b\n1,2").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(streamRows("a,b\n1,2\n").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("caps captured fields at maxFields while still terminating correctly", () => {
    const text = "a,b,c,d\r\nx,\"y,1\",\"z\nz\",tail\r\n";
    const { rows, lines } = streamRows(text, 2, { maxFields: 2 });
    expect(rows).toEqual([
      ["a", "b"],
      ["x", "y,1"],
    ]);
    expect(lines).toEqual([1, 2]);
  });

  it("throws with a line number for an unexpected quote inside a field", () => {
    expect(() => streamRows('id,name\n1,ab"cd"\n')).toThrow(/unexpected quote inside field at line 2/);
  });

  it("throws with a line number when the input ends inside a quoted field", () => {
    expect(() => streamRows('id,note\n1,"open')).toThrow(/unterminated quoted field at end of input \(line 2\)/);
  });

  it("throws when a quoted field runs past the end of a chunked stream", () => {
    expect(() => streamRows('id,note\n1,"open\nstill open', 5)).toThrow(/unterminated quoted field/);
  });
});

describe("gtfs.mjs — route_type normalisation", () => {
  it("covers every extended value present in the shipped TfNSW feed", () => {
    expect(normalizeRouteType("700")).toBe("bus"); // Bus Service
    expect(normalizeRouteType("712")).toBe("bus"); // School Bus
    expect(normalizeRouteType("714")).toBe("bus"); // Rail Replacement Bus
    expect(normalizeRouteType("204")).toBe("bus"); // Regional Coach
    expect(normalizeRouteType("205")).toBe("bus"); // Special Coach
    expect(normalizeRouteType("106")).toBe("rail"); // Regional Rail Service
    expect(normalizeRouteType("900")).toBe("lightrail"); // Tram Service
    expect(normalizeRouteType("401")).toBe("metro"); // Metro Service
    expect(normalizeRouteType("4")).toBe("ferry");
    expect(normalizeRouteType("2")).toBe("rail");
  });

  it("maps the basic GTFS enum and known ranges", () => {
    expect(normalizeRouteType("0")).toBe("lightrail");
    expect(normalizeRouteType("1")).toBe("metro");
    expect(normalizeRouteType("3")).toBe("bus");
    expect(normalizeRouteType("702")).toBe("bus");
    expect(normalizeRouteType("800")).toBe("bus");
    expect(normalizeRouteType("402")).toBe("metro");
    expect(normalizeRouteType("403")).toBe("rail");
    expect(normalizeRouteType("1200")).toBe("ferry");
  });

  it("returns null rather than guessing for unknown or empty values", () => {
    expect(normalizeRouteType("")).toBeNull();
    expect(normalizeRouteType(null)).toBeNull();
    expect(normalizeRouteType(undefined)).toBeNull();
    expect(normalizeRouteType("abc")).toBeNull();
    expect(normalizeRouteType("1300")).toBeNull(); // aerial lift — not a UI mode
    expect(normalizeRouteType("9999")).toBeNull();
  });

  it("only ever returns one of the five UI modes", () => {
    for (const raw of ["0", "1", "2", "3", "4", "106", "204", "401", "712", "900"]) {
      expect(ROUTE_MODES).toContain(normalizeRouteType(raw));
    }
  });
});

describe("geo.mjs — boundary index and point-in-polygon", () => {
  const square = (min: number, max: number) => [
    [min, min],
    [max, min],
    [max, max],
    [min, max],
    [min, min],
  ];

  it("accepts points inside a polygon and rejects points outside", () => {
    const index = buildPolygonIndex([{ type: "Polygon", coordinates: [square(0, 10)] }]);
    expect(pointInIndex(index, 5, 5)).toBe(true);
    expect(pointInIndex(index, 15, 5)).toBe(false);
    expect(pointInIndex(index, -1, -1)).toBe(false);
  });

  it("short-circuits on the bounding box before ray casting", () => {
    // Diagonal ring whose bbox covers (9, 9) but whose interior does not.
    const diamond = [
      [0, 10],
      [10, 0],
      [0, -10],
      [-10, 0],
      [0, 10],
    ];
    const index = buildPolygonIndex([{ type: "Polygon", coordinates: [diamond] }]);
    expect(pointInIndex(index, 9, 9)).toBe(false);
    expect(pointInIndex(index, 0, 0)).toBe(true);
  });

  it("treats a point inside a hole as outside the polygon", () => {
    const index = buildPolygonIndex([
      { type: "Polygon", coordinates: [square(0, 10), square(3, 7)] },
    ]);
    expect(pointInIndex(index, 5, 5)).toBe(false); // inside the hole
    expect(pointInIndex(index, 1, 1)).toBe(true); // in the ring, outside the hole
  });

  it("handles MultiPolygon and FeatureCollection inputs", () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiPolygon",
            coordinates: [[square(0, 2)], [square(20, 22)]],
          },
        },
      ],
    };
    const index = buildPolygonIndex([collection]);
    expect(pointInIndex(index, 1, 1)).toBe(true);
    expect(pointInIndex(index, 21, 21)).toBe(true);
    expect(pointInIndex(index, 10, 10)).toBe(false);
  });

  it("pointInRing uses even-odd casting on a closed ring", () => {
    expect(pointInRing(square(0, 4), 2, 2)).toBe(true);
    expect(pointInRing(square(0, 4), 3.5, 2)).toBe(true);
    expect(pointInRing(square(0, 4), 8, 8)).toBe(false);
  });
});
