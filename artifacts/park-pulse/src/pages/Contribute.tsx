import { useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ManualForm from "../components/contribute/ManualForm";
import ImportFlow from "../components/contribute/ImportFlow";
import type { BatchSummaryResponse } from "../utils/contributionsApi";
import { categoryLabel } from "../data/contribution/schema";

/**
 * Community contributions.
 *
 * Two ways in — one place at a time, or a file — with the same guarantees:
 * validation before submission, preview before sending, and no publication
 * without review. The page states what it does with the data instead of
 * implying that a submission appears on the map immediately.
 */

function SubmittedPanel({ batch }: { batch: BatchSummaryResponse }) {
  return (
    <section className="ct-success" aria-labelledby="ct-success-heading" role="status">
      <div className="ct-success-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      </div>
      <div>
        <h2 className="fa-h2" id="ct-success-heading">Received. Thank you.</h2>
        <p className="fa-lede">
          {batch.recordCount} record{batch.recordCount === 1 ? " is" : "s are"} waiting for review. Nothing
          appears on the map until a reviewer accepts the batch and it is published in a new build.
        </p>
        <dl className="ct-summary ct-summary--tight">
          <div>
            <dt>Reference</dt>
            <dd><code>{batch.id}</code></dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Awaiting review</dd>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>
              {Object.entries(batch.categories)
                .map(([category, count]) => `${categoryLabel(category)} (${count})`)
                .join(", ")}
            </dd>
          </div>
        </dl>
        <div className="ct-success-actions">
          <Link href={`/contribute/status/${batch.id}`} className="fa-btn fa-btn--secondary">
            Check this submission
          </Link>
          <button type="button" className="fa-panel-link" onClick={() => window.location.reload()}>
            Add another
          </button>
        </div>
        <p className="ct-help">
          Keep the reference. Anyone with the link can see the batch status; contributor contact details are
          never shown.
        </p>
      </div>
    </section>
  );
}

export default function Contribute() {
  const [tab, setTab] = useState<"manual" | "import">("manual");
  const [submitted, setSubmitted] = useState<BatchSummaryResponse | null>(null);

  function select(next: "manual" | "import") {
    setTab(next);
    setSubmitted(null);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "manual" ? "import" : "manual";
    select(next);
    document.getElementById(`ct-tab-${next}`)?.focus();
  }

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <p className="fa-eyebrow">Community contributions</p>
            <h1 className="fa-display" style={{ maxWidth: "20ch" }}>
              Add what you know to the map.
            </h1>
            <p className="fa-lede">
              Park Pulse is built from published datasets. If you know about a place the data misses — a new
              playground, a broken fountain, a bench that is actually a barbecue — you can add it here. Every
              record is checked against a source before it is published.
            </p>
            <ul className="ct-principles">
              <li><strong>Parsed in your browser.</strong> Files are not uploaded; only validated records are sent.</li>
              <li><strong>Reviewed before publication.</strong> A submission never edits the public map directly.</li>
              <li><strong>Uncertainty is allowed.</strong> Leave a field blank instead of guessing; the map shows it as not provided.</li>
            </ul>
          </header>

          {submitted ? (
            <SubmittedPanel batch={submitted} />
          ) : (
            <>
              <div className="ct-tabs" role="tablist" aria-label="How to contribute">
                <button
                  type="button"
                  role="tab"
                  id="ct-tab-manual"
                  aria-selected={tab === "manual"}
                  aria-controls="ct-panel-manual"
                  tabIndex={tab === "manual" ? 0 : -1}
                  className="ct-tab"
                  onClick={() => select("manual")}
                  onKeyDown={onKeyDown}
                >
                  One place
                  <span>Guided form</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="ct-tab-import"
                  aria-selected={tab === "import"}
                  aria-controls="ct-panel-import"
                  tabIndex={tab === "import" ? 0 : -1}
                  className="ct-tab"
                  onClick={() => select("import")}
                  onKeyDown={onKeyDown}
                >
                  Many places
                  <span>CSV, GeoJSON, KML and more</span>
                </button>
              </div>

              <div
                role="tabpanel"
                id="ct-panel-manual"
                aria-labelledby="ct-tab-manual"
                hidden={tab !== "manual"}
                className="ct-panel"
              >
                <ManualForm onSubmitted={setSubmitted} />
              </div>
              <div
                role="tabpanel"
                id="ct-panel-import"
                aria-labelledby="ct-tab-import"
                hidden={tab !== "import"}
                className="ct-panel"
              >
                <ImportFlow onSubmitted={setSubmitted} />
              </div>
            </>
          )}

          <section className="ct-after" aria-labelledby="ct-after-heading">
            <h2 className="fa-h3" id="ct-after-heading">What happens next</h2>
            <ol className="ct-steps">
              <li>
                <strong>Validation.</strong> Coordinates, category and field types are checked again on the
                server — the browser's validation is a convenience, not the authority.
              </li>
              <li>
                <strong>Review.</strong> A moderator compares the record with its source, can leave a note, and
                can exclude an individual record from a batch.
              </li>
              <li>
                <strong>Publication.</strong> Accepted records are exported as GeoJSON, validated again by the
                publish script, and shipped in the community dataset. They then appear on the map and in the
                atlas with their provenance.
              </li>
            </ol>
            <p className="ct-help">
              <Link href="/contribute/status" className="fa-link">Check a submission</Link> ·{" "}
              <Link href="/atlas" className="fa-link">See every dataset</Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
