import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  getCategory,
  LICENCES,
  type CategoryId,
} from "../../data/contribution/schema";
import {
  ImportError,
  MAX_FILE_BYTES,
  SUPPORTED_FORMATS,
  UNSUPPORTED_FORMATS,
  parseSource,
  suggestMapping,
  type ParseResult,
  type SourceTable,
} from "../../data/contribution/import";
import {
  aliasesFor,
  batchPayload,
  buildDrafts,
  mappingTargets,
  summariseDrafts,
  validDrafts,
  type DraftDefaults,
  type ExistingPlace,
} from "../../data/contribution/pipeline";
import {
  ApiError,
  ApiUnavailableError,
  submitContributions,
  type BatchSummaryResponse,
} from "../../utils/contributionsApi";
import MapCanvas from "./MapCanvas";

/**
 * Bulk import: parse → map → validate → preview → submit.
 *
 * The file never leaves the browser. Only the validated canonical records are
 * posted, which keeps the server's input small and means an unsupported or
 * malformed file cannot reach the storage layer at all.
 */

interface ImportFlowProps {
  onSubmitted: (batch: BatchSummaryResponse) => void;
}

type Stage = "idle" | "parsing" | "ready";

const PREVIEW_LIMIT = 40;

export default function ImportFlow({ onSubmitted }: ImportFlowProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [tableIndex, setTableIndex] = useState(0);
  const [category, setCategory] = useState<CategoryId>("park");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState({
    contributor: "",
    contact: "",
    licence: "cc-by-4.0" as string,
    suburb: "",
    council: "",
    sourceUrl: "",
    observedAt: "",
    note: "",
  });
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<ExistingPlace[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const table: SourceTable | null = parsed?.tables[tableIndex] ?? null;

  // The duplicate index is generated at build time. It is fetched only when
  // the importer is opened, and its absence degrades to "no duplicate checks"
  // rather than blocking the import.
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/contribution-index.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!active) return;
        const places = (data as { places?: unknown } | null)?.places;
        if (!Array.isArray(places)) return;
        setExisting(
          places.filter(
            (place): place is ExistingPlace =>
              Boolean(place) &&
              typeof place === "object" &&
              typeof (place as ExistingPlace).name === "string" &&
              typeof (place as ExistingPlace).lat === "number" &&
              typeof (place as ExistingPlace).lng === "number",
          ),
        );
      })
      .catch(() => setExisting([]));
    return () => {
      active = false;
    };
  }, []);

  function applyCategory(next: CategoryId, sourceTable: SourceTable | null) {
    setCategory(next);
    if (sourceTable) {
      setMapping(suggestMapping(sourceTable.headers, mappingTargets(next).map((target) => target.key), (key) => aliasesFor(next, key)));
    }
    setExcluded(new Set());
  }

  async function handleFile(file: File) {
    setParseError(null);
    setSubmitError(null);
    setParsed(null);
    setStage("parsing");
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new ImportError("too-large", "Files must be 8 MB or smaller. Split the file into several imports.");
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const binary = extension === "xlsx" || extension === "zip";
      const result = await parseSource({
        name: file.name,
        text: binary ? undefined : await file.text(),
        bytes: binary ? new Uint8Array(await file.arrayBuffer()) : undefined,
      });
      setParsed(result);
      setTableIndex(0);
      const firstTable = result.tables[0] ?? null;
      applyCategory(category, firstTable);
      setStage("ready");
      requestAnimationFrame(() => document.getElementById("ct-import-step-2")?.scrollIntoView({ block: "start" }));
    } catch (error) {
      setStage("idle");
      setParseError(error instanceof ImportError ? error.message : "The file could not be read.");
    }
  }

  const draftDefaults: DraftDefaults = useMemo(
    () => ({
      contributor: defaults.contributor,
      contact: defaults.contact,
      licence: defaults.licence,
      suburb: defaults.suburb,
      council: defaults.council,
      sourceUrl: defaults.sourceUrl,
      observedAt: defaults.observedAt,
      format: parsed?.format ?? "import",
      method: "import",
    }),
    [defaults, parsed],
  );

  const drafts = useMemo(() => {
    if (!table) return [];
    return buildDrafts({
      table,
      category,
      mapping,
      defaults: draftDefaults,
      existing,
      limit: 500,
    }).map((draft) => ({
      ...draft,
      excluded: draft.excluded || excluded.has(draft.row),
    }));
  }, [table, category, mapping, draftDefaults, existing, excluded]);

  const summary = useMemo(() => summariseDrafts(drafts), [drafts]);
  const ready = useMemo(() => validDrafts(drafts), [drafts]);
  const mapPoints = useMemo(
    () =>
      ready
        .slice(0, 300)
        .filter((draft) => draft.record)
        .map((draft) => ({
          lat: draft.record!.lat,
          lng: draft.record!.lng,
          label: draft.record!.name,
        })),
    [ready],
  );

  async function handleSubmit() {
    setSubmitError(null);
    const records = batchPayload(drafts);
    if (records.length === 0) {
      setSubmitError("There are no valid, included records to submit.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await submitContributions(records, {
        contributor: defaults.contributor,
        contact: defaults.contact,
        note: defaults.note,
        sourceFormat: parsed?.format ?? "import",
      });
      onSubmitted(response.batch);
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(
          error.issues.length > 0
            ? `${error.message} ${error.issues.slice(0, 3).map((issue) => issue.message).join(" ")}`
            : error.message,
        );
      } else if (error instanceof ApiUnavailableError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Something went wrong while submitting. Your records were not sent.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setParsed(null);
    setStage("idle");
    setParseError(null);
    setSubmitError(null);
    setExcluded(new Set());
    setMapping({});
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="ct-import">
      <section className="ct-form-section" id="ct-import-step-1" aria-labelledby="ct-import-file-heading">
        <h2 className="fa-h3" id="ct-import-file-heading">1. Choose a file</h2>
        <div
          className={`ct-dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            ref={inputRef}
            id="ct-file"
            type="file"
            accept=".csv,.tsv,.json,.geojson,.kml,.gpx,.xlsx,.zip"
            className="ct-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <label htmlFor="ct-file" className="ct-file-label">
            <strong>{stage === "parsing" ? "Reading the file…" : "Choose a file or drop it here"}</strong>
            <span>Up to 8 MB and 500 records per submission. Parsed in this browser.</span>
          </label>
        </div>

        <details className="ct-formats">
          <summary>Supported formats and what is not supported</summary>
          <div className="ct-formats-grid">
            <div>
              <h3 className="ct-formats-title">Read directly</h3>
              <ul>
                {SUPPORTED_FORMATS.map((format) => (
                  <li key={format.extension}>
                    <strong>{format.label}</strong> <code>.{format.extension}</code> — {format.note}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="ct-formats-title">Not parsed, and why</h3>
              <ul>
                {UNSUPPORTED_FORMATS.map((format) => (
                  <li key={format.extension}>
                    <code>.{format.extension}</code> — {format.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        {parseError && (
          <div className="ct-alert ct-alert--error" role="alert">
            <strong>That file could not be read.</strong>
            <p>{parseError}</p>
          </div>
        )}
      </section>

      {stage === "ready" && parsed && table && (
        <>
          <section className="ct-form-section" id="ct-import-step-2" aria-labelledby="ct-import-map-heading">
            <div className="ct-section-head">
              <h2 className="fa-h3" id="ct-import-map-heading">2. Match the columns</h2>
              <button type="button" className="fa-panel-link" onClick={reset}>
                Start over
              </button>
            </div>
            <p className="ct-help">
              Read <strong>{table.rows.length.toLocaleString()}</strong> rows from{" "}
              <strong>{parsed.format.toUpperCase()}</strong>
              {parsed.tables.length > 1 ? ` (${parsed.tables.length} tables)` : ""}. Nothing is sent until you submit.
            </p>

            {parsed.tables.length > 1 && (
              <div className="ct-field">
                <label htmlFor="ct-table">Table</label>
                <select
                  id="ct-table"
                  value={tableIndex}
                  onChange={(event) => {
                    const index = Number(event.target.value);
                    setTableIndex(index);
                    applyCategory(category, parsed.tables[index] ?? null);
                  }}
                >
                  {parsed.tables.map((entry, index) => (
                    <option key={`${entry.name}-${index}`} value={index}>
                      {entry.name} ({entry.rows.length} rows)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="ct-grid-2">
              <div className="ct-field">
                <label htmlFor="ct-import-category">These records are</label>
                <select
                  id="ct-import-category"
                  value={category}
                  onChange={(event) => applyCategory(event.target.value as CategoryId, table)}
                >
                  {CATEGORIES.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.plural}</option>
                  ))}
                </select>
              </div>
              <div className="ct-field">
                <label htmlFor="ct-import-licence">Licence</label>
                <select
                  id="ct-import-licence"
                  value={defaults.licence}
                  onChange={(event) => setDefaults({ ...defaults, licence: event.target.value })}
                >
                  {LICENCES.map((licence) => (
                    <option key={licence.value} value={licence.value}>{licence.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ct-mapping" role="table" aria-label="Source column mapping">
              <div className="ct-mapping-row ct-mapping-head" role="row">
                <span role="columnheader">Park Pulse field</span>
                <span role="columnheader">Column in your file</span>
                <span role="columnheader">Example</span>
              </div>
              {mappingTargets(category).map((target) => {
                const header = mapping[target.key] ?? "";
                const example = header ? table.rows.find((row) => row.values[header])?.values[header] ?? "" : "";
                return (
                  <div className="ct-mapping-row" role="row" key={target.key}>
                    <label role="cell" htmlFor={`ct-map-${target.key}`}>
                      {target.label}
                      {target.required && <span className="ct-required"> required</span>}
                    </label>
                    <select
                      role="cell"
                      id={`ct-map-${target.key}`}
                      value={header}
                      onChange={(event) =>
                        setMapping((previous) => {
                          const next = { ...previous };
                          if (event.target.value) next[target.key] = event.target.value;
                          else delete next[target.key];
                          return next;
                        })
                      }
                    >
                      <option value="">Not mapped</option>
                      {table.headers.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <span role="cell" className="ct-mapping-example">{example || "—"}</span>
                  </div>
                );
              })}
            </div>

            <details className="ct-formats" open>
              <summary>Defaults for this batch</summary>
              <div className="ct-grid-2 ct-defaults">
                <div className="ct-field">
                  <label htmlFor="ct-import-suburb">Suburb (if missing)</label>
                  <input id="ct-import-suburb" value={defaults.suburb} onChange={(event) => setDefaults({ ...defaults, suburb: event.target.value })} />
                </div>
                <div className="ct-field">
                  <label htmlFor="ct-import-council">Council (if missing)</label>
                  <input id="ct-import-council" value={defaults.council} onChange={(event) => setDefaults({ ...defaults, council: event.target.value })} />
                </div>
                <div className="ct-field">
                  <label htmlFor="ct-import-source">Source link (if missing)</label>
                  <input id="ct-import-source" type="url" placeholder="https://" value={defaults.sourceUrl} onChange={(event) => setDefaults({ ...defaults, sourceUrl: event.target.value })} />
                </div>
                <div className="ct-field">
                  <label htmlFor="ct-import-contributor">Your name</label>
                  <input id="ct-import-contributor" value={defaults.contributor} onChange={(event) => setDefaults({ ...defaults, contributor: event.target.value })} />
                </div>
                <div className="ct-field">
                  <label htmlFor="ct-import-contact">Contact email</label>
                  <input id="ct-import-contact" type="email" value={defaults.contact} onChange={(event) => setDefaults({ ...defaults, contact: event.target.value })} />
                  <p className="ct-help">Never published; used only to ask about this batch.</p>
                </div>
                <div className="ct-field">
                  <label htmlFor="ct-import-note">Note for reviewers</label>
                  <input id="ct-import-note" value={defaults.note} onChange={(event) => setDefaults({ ...defaults, note: event.target.value })} maxLength={1000} />
                </div>
              </div>
            </details>
          </section>

          <section className="ct-form-section" id="ct-import-step-3" aria-labelledby="ct-import-preview-heading">
            <h2 className="fa-h3" id="ct-import-preview-heading">3. Check before submitting</h2>
            <dl className="ct-summary">
              <div><dt>Rows</dt><dd>{summary.total}</dd></div>
              <div><dt>Ready</dt><dd>{summary.ready}</dd></div>
              <div><dt>Need fixing</dt><dd>{summary.invalid}</dd></div>
              <div><dt>Possible duplicates</dt><dd>{summary.duplicates}</dd></div>
            </dl>

            {parsed.warnings.length > 0 && (
              <div className="ct-alert" role="status">
                <strong>Notes from the file</strong>
                <ul>
                  {parsed.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {drafts.length === 0 ? (
              <div className="fa-state">
                <strong>No rows were read.</strong>
                Check that the first row contains column headers.
              </div>
            ) : (
              <>
                <div className="ct-preview-table-wrap">
                  <table className="ct-preview-table">
                    <caption>
                      Showing the first {Math.min(PREVIEW_LIMIT, drafts.length)} of {drafts.length} rows. Rows with
                      errors are not submitted; fix them in the source file and import again.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Row</th>
                        <th scope="col">Name</th>
                        <th scope="col">Coordinate</th>
                        <th scope="col">Status</th>
                        <th scope="col">Include</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drafts.slice(0, PREVIEW_LIMIT).map((draft) => {
                        const status =
                          draft.issues.length > 0
                            ? draft.issues[0].message
                            : draft.duplicate
                              ? `Possible duplicate of “${draft.duplicate.existingName}” (${draft.duplicate.distanceM} m)`
                              : "Ready";
                        return (
                          <tr
                            key={draft.row}
                            data-row={draft.row}
                            data-status={
                              draft.issues.length > 0 ? "invalid" : draft.duplicate ? "duplicate" : "ready"
                            }
                          >
                            <td>{draft.row}</td>
                            <td>{draft.name}</td>
                            <td className="fa-numeric">
                              {draft.record
                                ? `${draft.record.lat.toFixed(4)}, ${draft.record.lng.toFixed(4)}`
                                : "—"}
                            </td>
                            <td>
                              {status}
                              {draft.issues.length > 1 && (
                                <span className="ct-more"> (+{draft.issues.length - 1} more)</span>
                              )}
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={!draft.excluded && draft.issues.length === 0}
                                disabled={draft.issues.length > 0}
                                aria-label={`Include row ${draft.row}`}
                                onChange={(event) => {
                                  setExcluded((previous) => {
                                    const next = new Set(previous);
                                    if (event.target.checked) next.delete(draft.row);
                                    else next.add(draft.row);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {mapPoints.length > 0 && (
                  <MapCanvas points={mapPoints} ariaLabel="Preview of the imported points" height={260} />
                )}

                <div className="ct-submit-row">
                  <button type="button" className="fa-btn fa-btn--primary" onClick={handleSubmit} disabled={submitting || summary.ready === 0}>
                    {submitting ? "Submitting…" : `Submit ${summary.ready} record${summary.ready === 1 ? "" : "s"} for review`}
                  </button>
                  <p className="ct-help">
                    {summary.invalid > 0
                      ? `${summary.invalid} row${summary.invalid === 1 ? "" : "s"} with errors will be left out.`
                      : "Nothing is published until a reviewer accepts the batch."}
                  </p>
                </div>
              </>
            )}

            {submitError && (
              <div className="ct-alert ct-alert--error" role="alert">
                {submitError}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
