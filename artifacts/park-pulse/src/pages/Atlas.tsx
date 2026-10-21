import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { LAYERS, countFor, formatCount, resolveLayerStatus } from "../data/layers";
import { formatSnapshotDate, useDataSnapshot } from "../data/snapshot";

/**
 * Data Atlas — one honest row per dataset.
 *
 * Every cell comes from the layer registry and the generated snapshot the
 * map itself uses: artifact path, record count, publisher, coverage, licence
 * and publication status. Nothing here is measured or estimated for display;
 * sizes and budgets are enforced by the build scripts, not re-derived.
 */

const LICENCE_LABELS = {
  attribution: "Attribution required",
  "review-required": "Review pending",
  "not-confirmed": "Not confirmed",
} as const;

function statusText(status: "published" | "gated" | "unavailable"): string {
  if (status === "published") return "Published";
  if (status === "gated") return "Gated — under review";
  return "Not published";
}

export default function Atlas() {
  const snapshot = useDataSnapshot();
  const counts = snapshot.status === "ready" ? snapshot.snapshot.counts : null;
  const generated = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.generatedAt) : null;
  const observed = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.dataLastUpdated) : null;

  const published = LAYERS.filter((layer) => resolveLayerStatus(layer, counts) === "published");
  const withheld = LAYERS.filter((layer) => resolveLayerStatus(layer, counts) !== "published");

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <h1 className="fa-display" style={{ maxWidth: "22ch" }}>
              Every dataset, one row each.
            </h1>
            <p className="fa-lede">
              The files this build serves, who published them, what they cover and whether
              they are cleared for display. Counts are records in the served files — not
              unique places.
            </p>
            <p className="fa-meta fa-numeric">
              {generated ? `Snapshot generated ${generated}. ` : ""}
              {observed ? `Newest observation ${observed}.` : "Observation dates differ by layer."}
            </p>
          </header>

          {snapshot.status === "loading" && (
            <div className="fa-skeleton" role="status" aria-live="polite">
              <span />
              <span />
              <span />
              <span className="pp-visually-hidden">Loading the data snapshot</span>
            </div>
          )}

          {snapshot.status === "error" && (
            <div className="fa-state">
              <strong>We couldn&apos;t load the data snapshot.</strong>
              Layer names, publishers and coverage below are still accurate; record counts
              are hidden rather than guessed.
              <div className="fa-state-actions">
                <button type="button" className="fa-btn fa-btn--secondary" onClick={snapshot.reload}>
                  Try again
                </button>
              </div>
            </div>
          )}

          <section className="fa-section" aria-labelledby="fa-atlas-served">
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-atlas-served">
                Served in this build
              </h2>
              <p className="fa-sub">
                {published.length} of {LAYERS.length} registered layers have a generated
                artifact and a verified count.
              </p>
            </div>
            <div className="fa-table-wrap">
              <table className="fa-table">
                <caption>
                  Datasets served by this build, with artifact path and record count.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Layer</th>
                    <th scope="col">Records</th>
                    <th scope="col">Publisher</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Licence</th>
                    <th scope="col">Artifact</th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((layer) => (
                    <tr key={layer.id}>
                      <th scope="row">{layer.label}</th>
                      <td className="fa-numeric">
                        {counts ? formatCount(countFor(layer, counts)) : "Not provided"}
                      </td>
                      <td>{layer.source.publisher}</td>
                      <td>{layer.coverage}</td>
                      <td>{LICENCE_LABELS[layer.licence.status]}</td>
                      <td>
                        <code className="fa-code">{layer.artifact ?? "—"}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fa-meta">
              The same records are generated as a machine-readable catalog:{" "}
              <a
                href={`${import.meta.env.BASE_URL}data/catalog.json`}
                download
                className="fa-link"
              >
                catalog.json
              </a>
              . It is produced by the build from the layer registry and the served
              artifacts, so it cannot invent a dataset the app does not have.
            </p>
          </section>

          <section className="fa-section" aria-labelledby="fa-atlas-withheld">
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-atlas-withheld">
                Withheld from this build
              </h2>
              <p className="fa-sub">
                Registered layers that are not displayed, with the reason. Each reason is
                a decision, not an oversight.
              </p>
            </div>
            <div className="fa-prose">
              <ul>
                {withheld.map((layer) => (
                  <li key={layer.id}>
                    <strong>{layer.label}</strong> — {statusText(resolveLayerStatus(layer, counts))}.
                    {layer.statusNote ? ` ${layer.statusNote}` : ""}
                  </li>
                ))}
              </ul>
              <p>
                Size budgets (council index ≤ 25 KB, each boundary ≤ 80 KB) are enforced
                by the build script that generates the files, not estimated here.{" "}
                <Link href="/about#data" className="fa-link">
                  Read the full coverage and sources notes
                </Link>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
