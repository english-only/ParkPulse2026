import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  ApiError,
  ApiUnavailableError,
  exportAccepted,
  listSubmissions,
  reviewSubmission,
  setRecordExcluded,
  type ModeratedBatch,
} from "../utils/contributionsApi";
import { categoryLabel } from "../data/contribution/schema";

/**
 * Moderation queue.
 *
 * Not linked from the site navigation and marked noindex: it is an operator
 * surface, and the API enforces the token on every call. The token is kept in
 * sessionStorage (cleared when the tab closes) and never in the URL, so it
 * cannot leak through a shared link or a referrer.
 *
 * Acceptance does not publish anything. Publication is an explicit export plus
 * the `publish-contributions` script, which validates the file again.
 */

const TOKEN_KEY = "parkpulse_moderation_token";

type Filter = "pending" | "accepted" | "rejected";

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-AU");
}

export default function ContributionReview() {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [batches, setBatches] = useState<ModeratedBatch[]>([]);
  const [counts, setCounts] = useState<Record<Filter, number>>({ pending: 0, accepted: 0, rejected: 0 });
  const [state, setState] = useState<"locked" | "loading" | "ready" | "error">("locked");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Contribution review — Park Pulse";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const load = useCallback(
    async (moderationToken: string, status: Filter): Promise<boolean> => {
      setState("loading");
      setError(null);
      try {
        const result = await listSubmissions(moderationToken, status);
        setBatches(result.batches);
        setCounts(result.counts);
        setState("ready");
        return true;
      } catch (reason) {
        setState("error");
        setBatches([]);
        if (reason instanceof ApiError) {
          if (reason.status === 401) setError("That token was not accepted.");
          else if (reason.status === 503) setError(reason.message);
          else setError(reason.message);
        } else if (reason instanceof ApiUnavailableError) {
          setError(reason.message);
        } else {
          setError("The queue could not be loaded.");
        }
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      if (stored) {
        setSavedToken(stored);
        setToken(stored);
        void load(stored, filter);
      }
    } catch {
      // Session storage can be unavailable; the form still works for this view.
    }
    // Load once on mount; filter changes call load explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    const accepted = await load(trimmed, filter);
    if (!accepted) {
      // A rejected token must not replace the form with an empty queue: the
      // operator needs the field back to correct it. The error stays visible.
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // Nothing stored.
      }
      setSavedToken(null);
      return;
    }
    try {
      sessionStorage.setItem(TOKEN_KEY, trimmed);
    } catch {
      // Keep the token in memory only.
    }
    setSavedToken(trimmed);
  }

  function lock() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing else to clear.
    }
    setSavedToken(null);
    setToken("");
    setBatches([]);
    setState("locked");
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    if (savedToken) void load(savedToken, next);
  }

  async function review(batch: ModeratedBatch, status: "accepted" | "rejected") {
    if (!savedToken) return;
    setBusy(batch.id);
    setNotice(null);
    try {
      await reviewSubmission(savedToken, batch.id, status, notes[batch.id] ?? "");
      setNotice(`${status === "accepted" ? "Accepted" : "Rejected"} ${batch.recordCount} record(s).`);
      await load(savedToken, filter);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The decision could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecord(batch: ModeratedBatch, recordId: string, excluded: boolean) {
    if (!savedToken) return;
    setBusy(`${batch.id}:${recordId}`);
    try {
      const updated = await setRecordExcluded(savedToken, batch.id, recordId, excluded);
      setBatches((previous) => previous.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The record could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadExport() {
    if (!savedToken) return;
    setBusy("export");
    setNotice(null);
    try {
      const blob = await exportAccepted(savedToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "parkpulse-contributions.geojson";
      link.click();
      URL.revokeObjectURL(url);
      const text = await blob.text();
      const parsed = JSON.parse(text) as { features?: unknown[] };
      setNotice(
        `Exported ${parsed.features?.length ?? 0} accepted record(s). Publish with: node scripts/publish-contributions.mjs <file>`,
      );
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <p className="fa-eyebrow">Operator surface</p>
            <h1 className="fa-display" style={{ maxWidth: "18ch" }}>
              Contribution review.
            </h1>
            <p className="fa-lede">
              Read each batch against its source, exclude records that do not hold up, then accept or reject.
              Accepting does not publish: export the accepted GeoJSON and run the publish script.
            </p>
          </header>

          {(state === "error" || error) && (
            <div className="ct-alert ct-alert--error" role="alert">
              {error ?? "The queue could not be loaded."}
            </div>
          )}

          {!savedToken ? (
            <form className="ct-lookup" onSubmit={unlock}>
              <div className="ct-field">
                <label htmlFor="ct-token">Moderation token</label>
                <input
                  id="ct-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  aria-describedby="ct-token-help"
                />
                <p className="ct-help" id="ct-token-help">
                  Set on the API server as <code>MODERATION_TOKEN</code>. Held in this tab only; never sent
                  anywhere except the API.
                </p>
              </div>
              <button type="submit" className="fa-btn fa-btn--primary" disabled={!token.trim()}>
                Unlock the queue
              </button>
            </form>
          ) : (
            <section aria-labelledby="ct-queue-heading">
              <div className="ct-review-bar">
                <div className="ct-tabs ct-tabs--compact" role="tablist" aria-label="Queue filter">
                  {(["pending", "accepted", "rejected"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="tab"
                      aria-selected={filter === status}
                      className="ct-tab"
                      onClick={() => changeFilter(status)}
                    >
                      {status === "pending" ? "Awaiting review" : status === "accepted" ? "Accepted" : "Rejected"}
                      <span>{counts[status]}</span>
                    </button>
                  ))}
                </div>
                <div className="ct-review-actions">
                  <button type="button" className="fa-btn fa-btn--secondary fa-btn--small" onClick={() => void downloadExport()} disabled={busy !== null}>
                    {busy === "export" ? "Exporting…" : "Export accepted GeoJSON"}
                  </button>
                  <button type="button" className="fa-panel-link" onClick={lock}>
                    Lock
                  </button>
                </div>
              </div>

              <h2 className="pp-visually-hidden" id="ct-queue-heading">Queue</h2>

              {state === "loading" && (
                <div className="fa-skeleton" role="status" aria-live="polite">
                  <span /><span /><span />
                  <span className="pp-visually-hidden">Loading the review queue</span>
                </div>
              )}

              {state === "ready" && batches.length === 0 && (
                <div className="fa-state">
                  <strong>Nothing {filter === "pending" ? "waiting" : filter}.</strong>
                  {filter === "pending"
                    ? "New submissions will appear here."
                    : "Decisions move a batch into this list."}
                </div>
              )}

              {notice && (
                <div className="ct-alert" role="status">
                  {notice}
                </div>
              )}

              {batches.map((batch) => (
                <article className="ct-review-card" key={batch.id} data-batch={batch.id}>
                  <div className="ct-review-head">
                    <div>
                      <span className={`ct-status-pill is-${batch.status}`}>{batch.status}</span>
                      <h2 className="fa-h3">
                        {batch.recordCount} record{batch.recordCount === 1 ? "" : "s"} · {batch.sourceFormat.toUpperCase()}
                      </h2>
                      <p className="ct-help fa-numeric">
                        {formatDate(batch.createdAt)} · <code>{batch.id}</code>
                      </p>
                    </div>
                    <div className="ct-review-meta">
                      <p><strong>Contributor:</strong> {batch.contributor ?? "Not given"}</p>
                      <p><strong>Contact:</strong> {batch.contact ?? "Not given"}</p>
                      {batch.note && <p><strong>Note:</strong> {batch.note}</p>}
                      {batch.reviewNote && <p><strong>Review note:</strong> {batch.reviewNote}</p>}
                    </div>
                  </div>

                  <div className="ct-preview-table-wrap">
                    <table className="ct-preview-table">
                      <caption>Records in this batch</caption>
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Category</th>
                          <th scope="col">Coordinate</th>
                          <th scope="col">Provenance</th>
                          <th scope="col">Include</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.records.map((record) => {
                          const payload = record.payload as {
                            provenance?: { contributor?: string | null; sourceUrl?: string | null; licence?: string; observedAt?: string | null };
                          } | null;
                          return (
                            <tr key={record.id} data-record={record.id} data-excluded={record.excluded ? "true" : "false"}>
                              <td>{record.name}</td>
                              <td>{categoryLabel(record.category)}</td>
                              <td className="fa-numeric">{record.lat.toFixed(5)}, {record.lng.toFixed(5)}</td>
                              <td>
                                {payload?.provenance?.sourceUrl ? (
                                  <a href={payload.provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="fa-link">
                                    Source ↗
                                  </a>
                                ) : (
                                  "No link"
                                )}
                                {" · "}
                                {payload?.provenance?.licence ?? "No licence"}
                                {payload?.provenance?.observedAt ? ` · checked ${payload.provenance.observedAt}` : ""}
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={!record.excluded}
                                  aria-label={`Include ${record.name}`}
                                  disabled={busy === `${batch.id}:${record.id}`}
                                  onChange={(event) => void toggleRecord(batch, record.id, !event.target.checked)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="ct-review-decision">
                    <div className="ct-field">
                      <label htmlFor={`ct-note-${batch.id}`}>Review note</label>
                      <input
                        id={`ct-note-${batch.id}`}
                        value={notes[batch.id] ?? batch.reviewNote ?? ""}
                        onChange={(event) => setNotes({ ...notes, [batch.id]: event.target.value })}
                        placeholder="Why this decision? Shown on the public status page when rejected."
                        maxLength={1000}
                      />
                    </div>
                    <div className="ct-review-buttons">
                      <button
                        type="button"
                        className="fa-btn fa-btn--secondary"
                        onClick={() => void review(batch, "rejected")}
                        disabled={busy !== null}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="fa-btn fa-btn--primary"
                        onClick={() => void review(batch, "accepted")}
                        disabled={busy !== null}
                      >
                        Accept batch
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              <p className="ct-help">
                Publication: <code>node scripts/publish-contributions.mjs exported.geojson</code> validates the
                export, writes <code>public/data/contributions.geojson</code> and the dataset catalog, then a
                normal build ships it. <Link href="/atlas" className="fa-link">Atlas</Link>
              </p>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
