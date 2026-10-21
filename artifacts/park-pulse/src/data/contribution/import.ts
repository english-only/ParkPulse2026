/**
 * Import adapters.
 *
 * One adapter per source shape, behind a single `parseSource` entry point.
 * Every adapter returns the same intermediate representation — tables of
 * string values plus any geometry the format itself established — so the
 * mapping, validation and preview steps never need to know which format they
 * came from. Adding a format means adding one adapter and listing it in
 * `ADAPTERS`; no page, validator or exporter changes.
 *
 * Files are parsed in the browser. Nothing here executes submitted content:
 * XML is read with `DOMParser`, never injected into the document, and cell
 * values are only ever rendered as text.
 */

export type ImportFormat =
  | "csv"
  | "tsv"
  | "json"
  | "geojson"
  | "kml"
  | "gpx"
  | "xlsx"
  | "zip";

export interface SourceRow {
  /** Source field name → raw cell value, exactly as parsed (trimmed). */
  values: Record<string, string>;
  /** Latitude established by the format's geometry, if any. */
  lat?: number;
  lng?: number;
  /** 1-based row number in the source, for error messages. */
  sourceRow: number;
}

export interface SourceTable {
  /** Sheet, layer or file the rows came from. */
  name: string;
  headers: string[];
  rows: SourceRow[];
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseResult {
  format: ImportFormat;
  tables: SourceTable[];
  warnings: string[];
  skipped: SkippedRow[];
}

export class ImportError extends Error {
  code: "unsupported" | "malformed" | "too-large";

  constructor(code: ImportError["code"], message: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
  }
}

/** Hard limits, checked before parsing so a bad file cannot exhaust memory. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_ROWS = 5_000;
export const MAX_HEADERS = 120;

const BOM = "\uFEFF";

export const SUPPORTED_FORMATS: readonly { extension: string; label: string; note: string }[] = [
  { extension: "csv", label: "CSV", note: "Comma-separated, first row as headers" },
  { extension: "tsv", label: "TSV", note: "Tab-separated" },
  { extension: "json", label: "JSON", note: "Array of records, or { records: [...] }" },
  { extension: "geojson", label: "GeoJSON", note: "Points or polygons; coordinates read from geometry" },
  { extension: "kml", label: "KML", note: "Google Earth placemarks with point coordinates" },
  { extension: "gpx", label: "GPX", note: "GPS waypoints" },
  { extension: "xlsx", label: "Excel (XLSX)", note: "First worksheet, first row as headers" },
  { extension: "zip", label: "ZIP archive", note: "One supported file per archive (CSV, JSON, GeoJSON, KML, GPX, XLSX)" },
] as const;

/** Formats we deliberately do not parse, with the honest reason. */
export const UNSUPPORTED_FORMATS: readonly { extension: string; reason: string }[] = [
  {
    extension: "pdf",
    reason: "PDFs carry layout, not tabular fields. Attach a link instead, or export the table to CSV.",
  },
  {
    extension: "shp",
    reason: "Shapefiles are several files that must travel together. Zip them, or convert to GeoJSON first.",
  },
  {
    extension: "docx",
    reason: "Word documents have no field structure to map. Copy the table into CSV.",
  },
] as const;

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

function basename(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

/** Refuses markup that could expand entities or load external resources. */
function assertSafeXml(text: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new ImportError(
      "malformed",
      "This file contains a document type or entity declaration. Remove it and export a plain KML or GPX file.",
    );
  }
}

function parseXml(text: string): Document {
  assertSafeXml(text);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) {
    throw new ImportError("malformed", "The XML could not be read. Check that the file is valid KML or GPX.");
  }
  return doc;
}

function elements(root: Document | Element, localName: string): Element[] {
  const all = Array.from(root.getElementsByTagName("*"));
  return all.filter((element) => element.localName === localName || element.tagName === localName);
}

function childText(element: Element, localName: string): string {
  const child = Array.from(element.children).find(
    (entry) => entry.localName === localName || entry.tagName === localName,
  );
  return child?.textContent?.trim() ?? "";
}

/** RFC 4180-style parse: quoted fields, doubled quotes, embedded newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const clean = text.startsWith(BOM) ? text.slice(1) : text;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"') {
        if (clean[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

/** Picks the delimiter that yields the most consistent column count. */
export function detectDelimiter(text: string): string {
  const sample = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/).slice(0, 20);
  let best = ",";
  let bestScore = -1;
  for (const delimiter of [",", "\t", ";", "|"]) {
    const counts = sample
      .filter((line) => line.trim())
      .map((line) => parseDelimited(line, delimiter)[0]?.length ?? 0);
    const headers = counts[0] ?? 0;
    if (headers < 2) continue;
    const consistent = counts.filter((count) => count === headers).length;
    const score = consistent * 100 + headers;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.slice(0, MAX_HEADERS).map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function tableFromMatrix(name: string, matrix: string[][], warnings: string[]): SourceTable {
  if (matrix.length === 0) throw new ImportError("malformed", "The file has no rows.");
  const [headerRow, ...body] = matrix;
  const headers = uniqueHeaders(headerRow);
  if (headers.length < 2) {
    throw new ImportError(
      "malformed",
      "Only one column was found. A table needs at least a name column and a coordinate column, or latitude and longitude.",
    );
  }
  if (body.length > MAX_ROWS) {
    warnings.push(`Only the first ${MAX_ROWS.toLocaleString()} rows were read. Split the file to import the rest.`);
  }
  const rows = body.slice(0, MAX_ROWS).map((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, column) => {
      values[header] = (cells[column] ?? "").trim();
    });
    return { values, sourceRow: index + 2 };
  });
  return { name, headers, rows };
}

function parseCsvLike(text: string, format: "csv" | "tsv", name: string): ParseResult {
  const delimiter = format === "tsv" ? "\t" : detectDelimiter(text);
  const matrix = parseDelimited(text, delimiter);
  const warnings: string[] = [];
  if (format === "csv" && delimiter !== ",") {
    warnings.push(`Detected “${delimiter === "\t" ? "tab" : delimiter}” as the separator.`);
  }
  return {
    format,
    tables: [tableFromMatrix("table", matrix, warnings)],
    warnings,
    skipped: [],
  };
}

function flatten(value: unknown, prefix: string, out: Record<string, string>, depth = 0): void {
  if (value === null || value === undefined) return;
  if (depth > 3) return;
  if (Array.isArray(value)) {
    const primitive = value.every((entry) => typeof entry !== "object" || entry === null);
    if (primitive) {
      out[prefix] = value.map((entry) => String(entry)).join(" | ");
      return;
    }
    value.slice(0, 20).forEach((entry, index) => flatten(entry, `${prefix}.${index}`, out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      flatten(entry, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return;
  }
  out[prefix] = String(value);
}

function recordsFromJson(raw: unknown, name: string, warnings: string[]): SourceTable {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const candidate = raw as Record<string, unknown>;
    for (const key of ["records", "data", "items", "rows", "features", "places", "results"]) {
      if (Array.isArray(candidate[key])) {
        list = candidate[key] as unknown[];
        break;
      }
    }
    if (list.length === 0) list = [candidate];
  }
  if (list.length === 0) throw new ImportError("malformed", "No records were found in the JSON file.");
  if (list.length > MAX_ROWS) {
    warnings.push(`Only the first ${MAX_ROWS.toLocaleString()} records were read.`);
  }

  const rows: SourceRow[] = [];
  const headerSet = new Set<string>();
  const skipped: SkippedRow[] = [];

  list.slice(0, MAX_ROWS).forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      skipped.push({ row: index + 1, reason: "Not an object" });
      return;
    }
    const values: Record<string, string> = {};
    flatten(entry, "", values);
    const keys = Object.keys(values);
    if (keys.length === 0) {
      skipped.push({ row: index + 1, reason: "Empty record" });
      return;
    }
    if (headerSet.size === 0) keys.forEach((key) => headerSet.add(key));
    else keys.forEach((key) => headerSet.add(key));
    rows.push({ values, sourceRow: index + 1 });
  });

  if (rows.length === 0) throw new ImportError("malformed", "No usable records were found in the JSON file.");
  return { name, headers: [...headerSet].slice(0, MAX_HEADERS), rows };
}

function parseJsonLike(text: string, format: "json" | "geojson", name: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text);
  } catch {
    throw new ImportError("malformed", "The JSON could not be read. Check for a trailing comma or an unclosed brace.");
  }
  const warnings: string[] = [];

  if (format === "geojson") {
    const candidate = raw as { type?: string; features?: unknown[]; geometry?: unknown; properties?: unknown };
    if (candidate?.type === "Feature" && candidate.geometry) {
      raw = { type: "FeatureCollection", features: [candidate] };
    } else if (!Array.isArray(candidate?.features)) {
      throw new ImportError("malformed", "This is not a GeoJSON FeatureCollection.");
    }
    const features = (raw as { features: unknown[] }).features;
    const rows: SourceRow[] = [];
    const headerSet = new Set<string>();
    const skipped: SkippedRow[] = [];
    for (const [index, feature] of features.entries()) {
      if (!feature || typeof feature !== "object") {
        skipped.push({ row: index + 1, reason: "Feature is not an object" });
        continue;
      }
      const entry = feature as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
      const point = representativePoint(entry.geometry);
      if (!point) {
        skipped.push({ row: index + 1, reason: "Geometry has no usable coordinates" });
        continue;
      }
      const values: Record<string, string> = {};
      flatten(entry.properties ?? {}, "", values);
      values.lat = point.lat.toFixed(6);
      values.lng = point.lng.toFixed(6);
      Object.keys(values).forEach((key) => headerSet.add(key));
      rows.push({ values, lat: point.lat, lng: point.lng, sourceRow: index + 1 });
    }
    if (skipped.length > 0) {
      warnings.push(`${skipped.length} feature${skipped.length === 1 ? "" : "s"} had no usable geometry and were skipped.`);
    }
    if (rows.length === 0) throw new ImportError("malformed", "No GeoJSON features with coordinates were found.");
    return {
      format,
      tables: [{ name, headers: [...headerSet].slice(0, MAX_HEADERS), rows: rows.slice(0, MAX_ROWS) }],
      warnings,
      skipped,
    };
  }

  return { format, tables: [recordsFromJson(raw, name, warnings)], warnings, skipped: [] };
}

/** Point for a Point/Polygon/MultiPolygon geometry. Vertex average of the outer ring. */
export function representativePoint(geometry: unknown): { lat: number; lng: number } | null {
  if (!geometry || typeof geometry !== "object") return null;
  const { type, coordinates } = geometry as { type?: string; coordinates?: unknown };
  if (type === "Point" && Array.isArray(coordinates) && coordinates.length >= 2) {
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if ((type === "Polygon" || type === "MultiPolygon") && Array.isArray(coordinates)) {
    const ring = type === "Polygon" ? coordinates[0] : (coordinates as unknown[][])[0]?.[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    const points = (ring as unknown[])
      .filter((point): point is [number, number] => Array.isArray(point) && point.length >= 2)
      // GeoJSON rings repeat the first vertex at the end; averaging it twice
      // would pull the representative point toward the closing corner.
      .filter((point, index, all) => index === 0 || point[0] !== all[0][0] || point[1] !== all[0][1])
      .slice(0, 500);
    if (points.length === 0) return null;
    const sum = points.reduce(
      (accumulator, point) => ({
        lng: accumulator.lng + Number(point[0]),
        lat: accumulator.lat + Number(point[1]),
      }),
      { lat: 0, lng: 0 },
    );
    const lat = sum.lat / points.length;
    const lng = sum.lng / points.length;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  return null;
}

function parseKml(text: string, name: string): ParseResult {
  const doc = parseXml(text);
  const placemarks = elements(doc, "Placemark");
  if (placemarks.length === 0) throw new ImportError("malformed", "No KML placemarks were found.");
  const rows: SourceRow[] = [];
  const headerSet = new Set<string>();
  const skipped: SkippedRow[] = [];

  placemarks.slice(0, MAX_ROWS).forEach((placemark, index) => {
    const values: Record<string, string> = {};
    const nameText = childText(placemark, "name");
    const description = childText(placemark, "description");
    if (nameText) values.name = nameText;
    if (description) values.description = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    for (const data of elements(placemark, "Data")) {
      const key = data.getAttribute("name");
      const value = childText(data, "value");
      if (key && value) values[key] = value;
    }
    for (const simple of elements(placemark, "SimpleData")) {
      const key = simple.getAttribute("name");
      if (key && simple.textContent) values[key] = simple.textContent.trim();
    }
    const pointElement = elements(placemark, "Point")[0];
    const coordText = pointElement ? childText(pointElement, "coordinates") : "";
    const firstPair = coordText.split(/\s+/).filter(Boolean)[0];
    if (firstPair) {
      const [lng, lat] = firstPair.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        values.lat = lat.toFixed(6);
        values.lng = lng.toFixed(6);
      }
    }
    if (!values.lat || !values.lng) {
      skipped.push({ row: index + 1, reason: "Placemark has no point coordinates" });
      return;
    }
    values.name ??= `Placemark ${index + 1}`;
    Object.keys(values).forEach((key) => headerSet.add(key));
    rows.push({ values, lat: Number(values.lat), lng: Number(values.lng), sourceRow: index + 1 });
  });

  if (rows.length === 0) {
    throw new ImportError("malformed", "No KML placemarks with point coordinates were found.");
  }
  return {
    format: "kml",
    tables: [{ name, headers: [...headerSet], rows }],
    warnings: skipped.length ? [`${skipped.length} placemark(s) without coordinates were skipped.`] : [],
    skipped,
  };
}

function parseGpx(text: string, name: string): ParseResult {
  const doc = parseXml(text);
  const waypoints = elements(doc, "wpt");
  if (waypoints.length === 0) throw new ImportError("malformed", "No GPX waypoints were found.");
  const rows: SourceRow[] = [];
  const headerSet = new Set<string>();
  const skipped: SkippedRow[] = [];

  waypoints.slice(0, MAX_ROWS).forEach((waypoint, index) => {
    const lat = Number(waypoint.getAttribute("lat"));
    const lng = Number(waypoint.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.push({ row: index + 1, reason: "Waypoint has no coordinates" });
      return;
    }
    const values: Record<string, string> = {
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      name: childText(waypoint, "name") || `Waypoint ${index + 1}`,
    };
    const description = childText(waypoint, "desc");
    const type = childText(waypoint, "type");
    const symbol = childText(waypoint, "sym");
    if (description) values.description = description;
    if (type) values.type = type;
    if (symbol) values.symbol = symbol;
    Object.keys(values).forEach((key) => headerSet.add(key));
    rows.push({ values, lat, lng, sourceRow: index + 1 });
  });

  return {
    format: "gpx",
    tables: [{ name, headers: [...headerSet], rows }],
    warnings: skipped.length ? [`${skipped.length} waypoint(s) without coordinates were skipped.`] : [],
    skipped,
  };
}

/* ── ZIP / XLSX ──────────────────────────────────────────────────────────── */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_UNCOMPRESSED = 30 * 1024 * 1024;
const MAX_ENTRIES = 200;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer: a subarray may be backed by a SharedArrayBuffer
  // or a resizable buffer, neither of which Blob accepts.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Minimal ZIP reader: central directory only, no encryption, no ZIP64.
 * Bounded by entry count, uncompressed size and compression ratio so a
 * decompression bomb is rejected rather than expanded.
 */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) === EOCD) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new ImportError("malformed", "The ZIP archive is missing its directory.");

  const entryCount = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount > MAX_ENTRIES) {
    throw new ImportError("too-large", `The archive has ${entryCount} entries; at most ${MAX_ENTRIES} are read.`);
  }

  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let totalUncompressed = 0;
  let offset = directoryOffset;

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (view.getUint32(offset, true) !== CENTRAL) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (rawName.endsWith("/")) continue;
    if (rawName.includes("..") || rawName.startsWith("/") || rawName.includes("\\")) {
      throw new ImportError("malformed", "The archive contains an unsafe path.");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED) {
      throw new ImportError("too-large", "The archive expands beyond 30 MB. Split it and import a smaller file.");
    }

    if (view.getUint32(localOffset, true) !== LOCAL) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 8) {
      if (compressedSize > 0 && uncompressedSize / compressedSize > 200) {
        throw new ImportError("too-large", "A file in the archive has an implausible compression ratio.");
      }
      files.set(rawName, await inflateRaw(compressed));
    } else if (method === 0) {
      files.set(rawName, compressed);
    }
  }

  if (files.size === 0) throw new ImportError("malformed", "The ZIP archive has no readable files.");
  return files;
}

function cellColumn(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference)?.[1] ?? "";
  let column = 0;
  for (const letter of letters) column = column * 26 + (letter.charCodeAt(0) - 64);
  return column - 1;
}

async function parseXlsx(bytes: Uint8Array, name: string): Promise<ParseResult> {
  const files = await unzip(bytes);
  const decoder = new TextDecoder();
  const sheetPath =
    [...files.keys()].find((path) => /^xl\/worksheets\/sheet1\.xml$/i.test(path)) ??
    [...files.keys()].find((path) => /^xl\/worksheets\/.*\.xml$/i.test(path));
  if (!sheetPath) throw new ImportError("malformed", "No worksheet was found in the workbook.");

  const sharedStrings: string[] = [];
  const sharedXml = files.get("xl/sharedStrings.xml");
  if (sharedXml) {
    const doc = parseXml(decoder.decode(sharedXml));
    for (const item of elements(doc, "si")) {
      sharedStrings.push(item.textContent ?? "");
    }
  }

  const doc = parseXml(decoder.decode(files.get(sheetPath)!));
  const matrix: string[][] = [];
  for (const row of elements(doc, "row")) {
    const cells: string[] = [];
    for (const cell of Array.from(row.children)) {
      if (cell.localName !== "c") continue;
      const index = cellColumn(cell.getAttribute("r") ?? "");
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        value = cell.textContent ?? "";
      } else {
        const raw = Array.from(cell.children).find((entry) => entry.localName === "v")?.textContent ?? "";
        value = type === "s" ? (sharedStrings[Number(raw)] ?? "") : raw;
      }
      cells[index >= 0 ? index : cells.length] = value.trim();
    }
    if (cells.some((cell) => (cell ?? "").trim() !== "")) {
      matrix.push(Array.from(cells, (cell) => cell ?? ""));
    }
  }

  if (matrix.length === 0) throw new ImportError("malformed", "The worksheet is empty.");
  const warnings: string[] = [];
  const table = tableFromMatrix("sheet1", matrix, warnings);
  return { format: "xlsx", tables: [table], warnings, skipped: [] };
}

const PARSERS: Record<string, (text: string, name: string) => ParseResult> = {
  csv: (text, name) => parseCsvLike(text, "csv", name),
  tsv: (text, name) => parseCsvLike(text, "tsv", name),
  json: (text, name) => parseJsonLike(text, "json", name),
  geojson: (text, name) => parseJsonLike(text, "geojson", name),
  kml: parseKml,
  gpx: parseGpx,
};

/**
 * Parses one file. Text formats arrive as text; binary formats as bytes.
 * Unsupported formats raise `ImportError` with a reason the UI can show.
 */
export async function parseSource(input: {
  name: string;
  text?: string;
  bytes?: Uint8Array;
}): Promise<ParseResult> {
  const name = basename(input.name);
  const extension = extensionOf(name);
  if (!extension) {
    throw new ImportError("unsupported", "The file has no extension, so its format cannot be checked.");
  }
  if (input.bytes && input.bytes.byteLength > MAX_FILE_BYTES) {
    throw new ImportError("too-large", "Files must be 8 MB or smaller. Split large datasets into several files.");
  }

  if (extension === "xlsx") {
    if (!input.bytes) throw new ImportError("malformed", "The workbook could not be read as binary data.");
    return parseXlsx(input.bytes, name);
  }

  if (extension === "zip") {
    if (!input.bytes) throw new ImportError("malformed", "The archive could not be read as binary data.");
    const files = await unzip(input.bytes);
    const decoder = new TextDecoder();
    const tables: SourceTable[] = [];
    const warnings: string[] = [];
    const skipped: SkippedRow[] = [];
    let format: ImportFormat | null = null;

    for (const [path, contents] of files) {
      const entryExtension = extensionOf(path);
      if (entryExtension === "xlsx") {
        const parsed = await parseXlsx(contents, basename(path));
        tables.push(...parsed.tables);
        warnings.push(...parsed.warnings);
        skipped.push(...parsed.skipped);
        format ??= "xlsx";
        continue;
      }
      const parser = PARSERS[entryExtension];
      if (!parser) {
        warnings.push(`Skipped ${basename(path)}: .${entryExtension || "?"} is not a supported table format.`);
        continue;
      }
      const parsed = parser(decoder.decode(contents), basename(path));
      tables.push(...parsed.tables);
      warnings.push(...parsed.warnings);
      skipped.push(...parsed.skipped);
      format ??= parsed.format;
    }

    if (tables.length === 0 || !format) {
      throw new ImportError(
        "unsupported",
        "The archive contains no supported file. Add a CSV, TSV, JSON, GeoJSON, KML, GPX or XLSX file.",
      );
    }
    return { format, tables, warnings, skipped };
  }

  const parser = PARSERS[extension];
  if (!parser) {
    const known = UNSUPPORTED_FORMATS.find((entry) => entry.extension === extension);
    throw new ImportError(
      "unsupported",
      known
        ? `.${extension} is not supported. ${known.reason}`
        : `.${extension} is not a supported format. Use CSV, TSV, JSON, GeoJSON, KML, GPX, XLSX or ZIP.`,
    );
  }
  if (typeof input.text !== "string") {
    throw new ImportError("malformed", "The file could not be read as text. Check that it is not corrupted.");
  }
  return parser(input.text, name);
}

/** Alias lookup used to guess a mapping from arbitrary source headers. */
export function suggestMapping(
  headers: readonly string[],
  fieldKeys: readonly string[],
  aliasesFor: (key: string) => readonly string[] = () => [],
): Record<string, string> {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();
  for (const key of fieldKeys) {
    const accepted = [key, ...aliasesFor(key)].map(normalise);
    const match = headers.find(
      (header) => !taken.has(header) && accepted.includes(normalise(header)),
    );
    if (match) {
      mapping[key] = match;
      taken.add(match);
    }
  }
  return mapping;
}
