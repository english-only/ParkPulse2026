import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  ApiError,
  ApiUnavailableError,
  getSubmission,
  type BatchSummaryResponse,
} from "../utils/contributionsApi";
import { categoryLabel } from "../data/contribution/schema";

/**
 * Public status lookup.
 *
 * The reference is an unguessable UUID. The response deliberately contains no
 * contributor name, contact address or moderation notes — only what the
 * person who submitted it needs to know.
 */

const STATUS_COPY: Record<BatchSummaryResponse["status"], { label: string; body: string }> = {
  pending: {
    label: "Awaiting review",
    body: "A reviewer has not looked at this batch yet. Nothing is on the map until it is accepted and a new build is published.",
  },
  accepted: {
    label: "Accepted",
    body: "The batch passed review. Its records are published with the next community dataset build.",
  },
  rejected: {
    label: "Not accepted",
    body: "The batch was not accepted this time. The reviewer's note explains why, where one was provided.",
  },
};

export default function ContributionStatus() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [reference, setReference] = useState(params.id ?? "");
  const [batch, setBatch] = useState<BatchSummaryResponse | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReference(params.id ?? "");
    if (!params.id) {
      setBatch(null);
      setState("idle");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    setError(null);
    getSubmission(params.id)
      .then((result) => {
        if (controller.signal.aborted) return;
        setBatch(result);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setBatch(null);
        setState("error");
        if (reason instanceof ApiError && reason.status === 404) {
          setError("No submission has that reference. Check for a missing character.");
        } else if (reason instanceof ApiUnavailableError) {
          setError(reason.message);
        } else {
          setError("The status could not be loaded. Try again.");
        }
      });
    return () => controller.abort();
  }, [params.id]);

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <p className="fa-eyebrow">Submissions</p>
            <h1 className="fa-display" style={{ maxWidth: "18ch" }}>
              Check a submission.
            </h1>
            <p className="fa-lede">
              Enter the reference you received when you submitted, or the one a contributor shared. No account
              is needed.
            </p>
          </header>

          <form
            className="ct-lookup"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = reference.trim();
              if (trimmed) navigate(`/contribute/status/${encodeURIComponent(trimmed)}`);
            }}
          >
            <div className="ct-field">
              <label htmlFor="ct-reference">Submission reference</label>
              <input
                id="ct-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. 3f2b8c1e-…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="fa-btn fa-btn--primary" disabled={state === "loading"}>
              {state === "loading" ? "Checking…" : "Check status"}
            </button>
          </form>

          {state === "error" && (
            <div className="ct-alert ct-alert--error" role="alert">
              {error}
            </div>
          )}

          {batch && (
            <section className="ct-status-card" aria-labelledby="ct-status-heading">
              <div className="ct-status-head">
                <span className={`ct-status-pill is-${batch.status}`}>
                  {STATUS_COPY[batch.status].label}
                </span>
                <span className="ct-help fa-numeric">
                  Submitted {new Date(batch.createdAt).toLocaleString("en-AU")}
                </span>
              </div>
              <h2 className="fa-h2" id="ct-status-heading">
                {batch.recordCount} record{batch.recordCount === 1 ? "" : "s"} from{" "}
                {batch.sourceFormat.toUpperCase()}
              </h2>
              <p className="fa-lede">{STATUS_COPY[batch.status].body}</p>
              <dl className="ct-summary ct-summary--tight">
                <div>
                  <dt>Reference</dt>
                  <dd><code>{batch.id}</code></dd>
                </div>
                <div>
                  <dt>Categories</dt>
                  <dd>
                    {Object.entries(batch.categories)
                      .map(([category, count]) => `${categoryLabel(category)} (${count})`)
                      .join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{new Date(batch.updatedAt).toLocaleString("en-AU")}</dd>
                </div>
              </dl>
              <p className="ct-help">
                Accepted records join the <Link href="/atlas" className="fa-link">community dataset</Link> with
                their provenance and licence. Contributor contact details are never public.
              </p>
            </section>
          )}

          <p className="ct-help">
            Want to add something? <Link href="/contribute" className="fa-link">Contribute a record</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
