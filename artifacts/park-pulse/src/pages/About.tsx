import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { LAYERS, countFor, formatCount, resolveLayerStatus, type DataLayer } from "../data/layers";
import { formatSnapshotDate, useDataSnapshot } from "../data/snapshot";

/**
 * About and data trust (PRD ABOUT-001…003).
 *
 * The old page repeated marketing copy, claimed "2,000+ parks", "29 off-leash
 * parks", "6 map themes" and "live" data, and credited an Unsplash photo with
 * no recorded rights. This version answers what the product is, what each
 * layer covers, and what is deliberately not published — all from the same
 * registry and generated snapshot the map uses.
 */

const LICENCE_LABELS = {
  attribution: "Attribution required",
  "review-required": "Review pending",
  "not-confirmed": "Not confirmed",
} as const;

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ["/"], description: "Focus the search box" },
  { keys: ["↑", "↓"], description: "Move through the result list" },
  { keys: ["Enter"], description: "Open the highlighted result" },
  { keys: ["T"], description: "Switch between the two themes" },
  { keys: ["L"], description: "Locate me (asks the browser for permission)" },
  { keys: ["F"], description: "Fit the map to the current results" },
  { keys: ["S"], description: "Open a random place from the current results" },
  { keys: ["D"], description: "Show saved places only" },
  { keys: ["C"], description: "Toggle the compact result list" },
  { keys: ["N", "P"], description: "Next / previous place while a detail is open" },
  { keys: ["Esc"], description: "Close the detail dialog or dismiss an overlay" },
  { keys: ["?"], description: "Show the shortcut sheet" },
];

/** "an off-leash area" / "a park area" — record nouns are data, not prose. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

function statusLabel(layer: DataLayer, status: DataLayer["status"]): string {
  if (status === "published") return layer.defaultVisible ? "On by default" : "Opt-in layer";
  if (status === "gated") return "Opt-in, under review";
  return "Not published";
}

function statusClass(status: DataLayer["status"]): string {
  return status === "published" ? "fa-badge fa-badge--published" : "fa-badge fa-badge--gated";
}

function recordCell(
  layer: DataLayer,
  counts: Readonly<Record<string, number>> | null,
  status: DataLayer["status"],
): string {
  if (status === "unavailable") return "Not published";
  if (!counts) return "Not provided";
  return formatCount(countFor(layer, counts));
}

export default function About() {
  const snapshot = useDataSnapshot();
  const counts = snapshot.status === "ready" ? snapshot.snapshot.counts : null;
  const generated = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.generatedAt) : null;
  const observed = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.dataLastUpdated) : null;

  const statusFor = (layer: DataLayer) => resolveLayerStatus(layer, counts);
  const notPublished = LAYERS.filter((layer) => statusFor(layer) !== "published");

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <h1 className="fa-display" style={{ maxWidth: "22ch" }}>
              A map you can check, not just look at.
            </h1>
            <p className="fa-lede">
              Park Pulse brings together public datasets to help people explore parks and amenities.
              Each layer has its own coverage, update date and limitations.
            </p>
            <nav className="fa-jump" aria-label="On this page">
              <a href="#overview">Overview</a>
              <a href="#data">Coverage and sources</a>
              <a href="#gaps">What is not published</a>
              <a href="#reading">Reading a result</a>
              <a href="#accessibility">Accessibility</a>
              <a href="#attribution">Attribution</a>
              <a href="#shortcuts">Shortcuts</a>
            </nav>
          </header>

          <section className="fa-section" id="overview" aria-labelledby="fa-overview-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-overview-h">
                What Park Pulse does
              </h2>
            </div>
            <div className="fa-prose">
              <p>
                Search for a park or an amenity, filter by what you need, and read the result beside
                a map of the same records. Selecting a result highlights it on the map; selecting a
                pin opens the same detail. Nothing important is map-only.
              </p>
              <p>
                The product is deliberately modest about what it knows. A record can tell you a park
                area exists and what its source published about it. It cannot tell you that a
                playground is open, that a toilet is working, or that a dataset covers every park in
                a region.
              </p>
              <div className="fa-callout">
                <strong>Coverage is part of the answer.</strong> The City of Sydney layers describe
                that council area only. NPWS facilities come from a different publisher with a
                different extent. Where a dataset is not published in this build, the control is
                switched off with a reason instead of returning nothing.
              </div>
            </div>
          </section>

          <section className="fa-section" id="data" aria-labelledby="fa-data-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-data-h">
                Coverage and sources
              </h2>
              <p className="fa-sub">
                {generated ? `Snapshot generated ${generated}. ` : ""}
                {observed ? `Observation dates vary; the newest is ${observed}. ` : ""}
                Counts are record counts from the served files, not unique places.
              </p>
              {snapshot.status === "error" && (
                <div className="fa-state" style={{ marginTop: "1rem" }}>
                  <strong>The data snapshot did not load.</strong>
                  Record counts are hidden rather than guessed. The layer list and its limitations
                  are still accurate.
                  <div className="fa-state-actions">
                    <button type="button" className="fa-btn fa-btn--secondary" onClick={snapshot.reload}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="fa-table-wrap">
              <table className="fa-table">
                <caption>
                  Layers referenced by this build, their publisher, extent and licence status.
                  {snapshot.status === "loading" ? " Loading record counts…" : ""}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Layer</th>
                    <th scope="col">Records</th>
                    <th scope="col">Publisher</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {LAYERS.map((layer) => {
                    const status = statusFor(layer);
                    return (
                    <tr key={layer.id}>
                      <th scope="row">
                        {layer.label}
                        <span className="fa-meta" style={{ marginTop: "0.375rem" }}>
                          <span className={statusClass(status)}>{statusLabel(layer, status)}</span>
                        </span>
                      </th>
                      <td className="fa-numeric">{recordCell(layer, counts, status)}</td>
                      <td>
                        <a
                          href={layer.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fa-link"
                        >
                          {layer.source.publisher} ↗
                        </a>
                        <span className="fa-meta">
                          One row is {article(layer.recordNoun)} {layer.recordNoun}.
                        </span>
                      </td>
                      <td>{layer.coverage}</td>
                      <td>
                        {LICENCE_LABELS[layer.licence.status]}
                        <span className="fa-meta">{layer.licence.label}</span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="fa-note">
              Licence records are being confirmed per dataset. A publisher making a file available
              is not on its own evidence of an open reuse licence, so nothing here is described as
              cleared for redistribution.
            </p>
          </section>

          <section className="fa-section" id="gaps" aria-labelledby="fa-gaps-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-gaps-h">
                What is not published, and why
              </h2>
              <p className="fa-sub">
                These layers exist in the project but are not part of the public product yet. Each
                reason is a decision, not an oversight.
              </p>
            </div>
            <div className="fa-prose">
              <ul>
                {notPublished.map((layer) => (
                  <li key={layer.id}>
                    <strong>{layer.label}</strong> — {layer.statusNote ?? "Not published."}
                    {layer.limitations[0] ? ` ${layer.limitations[0]}` : ""}
                  </li>
                ))}
              </ul>
              <p>
                Canopy is a special case: two project documents report different averages for
                different council sets, and the source&apos;s terms may restrict derived figures. No
                canopy percentage is shown until the formula, the council set and the licence are
                settled together.
              </p>
            </div>
          </section>

          <section className="fa-section" id="reading" aria-labelledby="fa-reading-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-reading-h">
                Reading a result
              </h2>
            </div>
            <div className="fa-prose">
              <ul>
                <li>
                  <strong>Areas and facilities are different things.</strong> A park record is a
                  polygon; a map pin marks its representative centre, not a gate. A facility record
                  is a point inside or near a park.
                </li>
                <li>
                  <strong>Missing is not “no”.</strong> A field the publisher does not provide is
                  labelled as not provided. It is never shown as an absence of the facility.
                </li>
                <li>
                  <strong>Counts are not places.</strong> Cluster numbers and result counts describe
                  records in the current filter. Layers can overlap, so adding them up would not
                  produce a number of unique parks.
                </li>
                <li>
                  <strong>Freshness is per layer.</strong> The snapshot date tells you when these
                  files were generated, not that the source changed that day.
                </li>
              </ul>
            </div>
          </section>

          <section className="fa-section" id="accessibility" aria-labelledby="fa-accessibility-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-accessibility-h">
                Accessibility
              </h2>
            </div>
            <div className="fa-prose">
              <p>
                Every place in the map is also in a searchable, keyboard-operable results list, so a
                pin is never the only way to reach a record. The interface targets WCAG 2.2 AA in
                both themes: visible focus, sufficient text contrast, 24px minimum control targets,
                and reduced-motion support.
              </p>
              <p>
                The site has not been through an independent accessibility audit. Automated checks
                are a signal, not a conformance claim, and manual screen-reader testing is still
                outstanding.
              </p>
            </div>
          </section>

          <section className="fa-section" id="attribution" aria-labelledby="fa-attribution-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-attribution-h">
                Attribution and third parties
              </h2>
            </div>
            <div className="fa-prose">
              <p>
                Map tiles are served by OpenStreetMap. Where the OpenStreetMap-derived places layer
                is shown, it is attributed to © OpenStreetMap contributors under the ODbL. Basemap
                imagery, when switched on, is supplied by Esri and its partners.
              </p>
              <ul>
                <li>
                  <a
                    className="fa-link"
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenStreetMap copyright and licence ↗
                  </a>
                </li>
                <li>
                  <a
                    className="fa-link"
                    href="https://data.cityofsydney.nsw.gov.au/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    City of Sydney Open Data ↗
                  </a>
                </li>
                <li>
                  <a
                    className="fa-link"
                    href="https://datasets.seed.nsw.gov.au/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    NSW NPWS datasets on SEED ↗
                  </a>
                </li>
                <li>
                  <a
                    className="fa-link"
                    href="https://toiletmap.gov.au/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    National Public Toilet Map ↗
                  </a>
                </li>
              </ul>
              <p>
                Outbound links open in a new tab and identify the third party. They are not
                endorsements, and their content and availability are outside this project&apos;s
                control.
              </p>
            </div>
          </section>

          <section className="fa-section" id="shortcuts" aria-labelledby="fa-shortcuts-h" style={{ scrollMarginTop: "5rem" }}>
            <div className="fa-section-head">
              <h2 className="fa-h2" id="fa-shortcuts-h">
                Keyboard shortcuts
              </h2>
              <p className="fa-sub">These apply on the Explore page. Press ? there to see the same list.</p>
            </div>
            <details className="fa-details">
              <summary>Show all shortcuts</summary>
              <div className="fa-shortcut-grid">
                {SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.description} className="fa-shortcut">
                    <span>
                      {shortcut.keys.map((key) => (
                        <kbd key={key} className="fa-kbd">
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span>{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>

          <section className="fa-section">
            <div className="fa-cta">
              <div>
                <h2>Open the explorer</h2>
                <p>Filter by what you need, then check the source note on any result before you go.</p>
              </div>
              <Link href="/explore" className="fa-btn fa-btn--primary">
                Explore parks
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
