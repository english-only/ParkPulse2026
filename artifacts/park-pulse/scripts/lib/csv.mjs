/**
 * Minimal RFC-4180 CSV reader shared by the GTFS conversion scripts.
 *
 * GTFS files are quoted CSV with CRLF (and sometimes bare LF) line endings and
 * a UTF-8 BOM on the header. Hand-rolled rather than pulled from npm because
 * the converter needs byte-level row numbers for FR4.1's "exit 1 with row
 * number" contract, which off-the-shelf streaming parsers obscure.
 */

/** Strip a leading UTF-8 BOM if present. */
export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse one CSV record (which may span multiple physical lines when a quoted
 * field contains a newline) starting at `start` within `text`.
 *
 * Returns `{ fields, next }` where `next` is the index just past the record's
 * terminator (or -1 at end of input). Throws on an unterminated quote so a
 * truncated file fails loudly instead of silently dropping rows.
 */
export function parseRecord(text, start = 0) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  let i = start;
  let sawAny = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) {
        throw new SyntaxError(`unexpected quote inside field at offset ${i}`);
      }
      inQuotes = true;
      sawAny = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      fields.push(field);
      field = "";
      sawAny = true;
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      fields.push(field);
      return { fields, next: i + 1 };
    }
    if (ch === "\n") {
      fields.push(field);
      return { fields, next: i + 1 };
    }
    field += ch;
    sawAny = true;
    i += 1;
  }

  if (inQuotes) throw new SyntaxError("unterminated quoted field at end of input");
  if (!sawAny && field === "") return { fields: [], next: -1 };
  fields.push(field);
  return { fields, next: -1 };
}

/** Split a whole CSV document into rows of field arrays. */
export function parseCsv(text) {
  const clean = stripBom(text);
  const header = [];
  {
    const { fields, next } = parseRecord(clean, 0);
    header.push(...fields);
    if (next < 0) return { header, rows: [] };
    let i = next;
    const rows = [];
    while (i < clean.length) {
      const { fields: row, next: nx } = parseRecord(clean, i);
      if (nx < 0) {
        if (row.length > 1 || row[0] !== "") rows.push(row);
        break;
      }
      rows.push(row);
      i = nx;
    }
    return { header, rows };
  }
}

/** Zip a header and row into an object; missing trailing fields become "". */
export function toObject(header, row) {
  const out = {};
  for (let i = 0; i < header.length; i++) out[header[i]] = row[i] ?? "";
  return out;
}

/**
 * Incremental counterpart of `parseCsv` for inputs that arrive as stream
 * chunks (zip members read off a child process, network responses).
 *
 * `createRowStream(onRow, { maxFields })` returns `{ write, end }`.
 * `write(chunk)` feeds UTF-8 text — records are parsed as soon as a terminator
 * outside a quoted field is seen, so a 420 MB file never has to exist in
 * memory, and a quoted field may legitimately straddle chunk boundaries.
 * `onRow(fields, { line })` receives `line` = the 1-based *physical* line the
 * record started on, which is the row number FR4.1 wants logged when a row is
 * malformed.
 *
 * `maxFields` caps how many fields are captured: once reached, the remainder
 * of the record is scanned (quote/terminator aware) but never materialised.
 * That keeps the `stop_times.txt` pass — 420 MB where only `trip_id` and
 * `stop_id` matter — at roughly memcpy speed.
 *
 * Semantics match `parseCsv`/`parseRecord`: BOM stripped, CRLF or LF
 * terminators, `""` escaping, unterminated quotes throw `SyntaxError`.
 */
export function createRowStream(onRow, { maxFields = Infinity } = {}) {
  let field = "";
  let fields = [];
  let inQuotes = false;
  let atFieldStart = true;
  let truncated = false;
  let truncStarted = false;
  let sawAny = false;
  let skipLf = false;
  let pendingQuote = false;
  let line = 1;
  let recordLine = 1;
  let first = true;

  const finishRecord = () => {
    const startedAt = recordLine;
    if (!truncated) fields.push(field);
    const out = fields;
    field = "";
    fields = [];
    atFieldStart = true;
    truncated = false;
    truncStarted = false;
    sawAny = false;
    recordLine = line;
    onRow(out, { line: startedAt });
  };

  return {
    write(chunk) {
      let text = chunk;
      if (first) {
        first = false;
        text = stripBom(text);
      }
      if (pendingQuote) {
        // The previous chunk ended on a quote inside a quoted field; only the
        // first char of this one tells us whether it was an escaped quote
        // (`""`) or the closing one.
        if (text.length === 0) return;
        pendingQuote = false;
        if (text[0] === '"') {
          if (!truncated) field += '"';
          text = text.slice(1);
          if (text.length === 0) return;
        } else {
          inQuotes = false;
        }
      }
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (skipLf) {
          skipLf = false;
          if (ch === "\n") continue; // second half of a CRLF; already counted
        }
        if (!sawAny && fields.length === 0 && field === "" && !inQuotes) {
          recordLine = line;
        }
        sawAny = true;

        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 >= text.length) {
              pendingQuote = true;
              continue;
            }
            if (text[i + 1] === '"') {
              if (!truncated) field += '"';
              i += 1;
              continue;
            }
            inQuotes = false;
            continue;
          }
          if (ch === "\n") line += 1;
          if (!truncated) field += ch;
          continue;
        }

        if (truncated) {
          if (ch === "\r") {
            line += 1;
            finishRecord();
            skipLf = true;
            continue;
          }
          if (ch === "\n") {
            line += 1;
            finishRecord();
            continue;
          }
          if (!truncStarted && ch === '"') {
            inQuotes = true;
            truncStarted = true;
            continue;
          }
          if (ch === ",") {
            truncStarted = false;
            continue;
          }
          truncStarted = true;
          continue;
        }

        if (ch === '"') {
          if (field.length > 0 || !atFieldStart) {
            throw new SyntaxError(`unexpected quote inside field at line ${line}`);
          }
          inQuotes = true;
          atFieldStart = false;
          continue;
        }
        if (ch === ",") {
          fields.push(field);
          field = "";
          atFieldStart = true;
          if (fields.length >= maxFields) truncated = true;
          continue;
        }
        if (ch === "\r") {
          line += 1;
          finishRecord();
          skipLf = true;
          continue;
        }
        if (ch === "\n") {
          line += 1;
          finishRecord();
          continue;
        }
        field += ch;
        atFieldStart = false;
      }
    },

    end() {
      if (pendingQuote) {
        // Input ends right after a quote that closed the field.
        pendingQuote = false;
        inQuotes = false;
      }
      if (inQuotes) {
        throw new SyntaxError(`unterminated quoted field at end of input (line ${recordLine})`);
      }
      if (skipLf) {
        skipLf = false;
        return;
      }
      if (sawAny) finishRecord();
    },
  };
}
