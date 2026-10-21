import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  formatAreaHa,
  matchParks,
  toComparePark,
  toggleSelected,
  type ComparePark,
} from "../utils/compare";

const BASE = import.meta.env.BASE_URL;
const MAX_PARKS = 3;

/**
 * Compare parks — up to three park areas side by side.
 *
 * Only attributes the shipped dataset actually publishes are compared: type,
 * area (derived from the published square-metre field), playground flag and
 * asset id. Anything absent renders "Not provided"; nothing is ranked and no
 * winner is declared.
 */

interface ParksFile {
  features?: { properties?: Record<string, unknown> | null }[];
}

async function loadParks(signal: AbortSignal): Promise<ComparePark[]> {
  const response = await fetch(`${BASE}data/Parks.geojson`, { signal });
  if (!response.ok) throw new Error(`Parks.geojson responded ${response.status}`);
  const raw = (await response.json()) as ParksFile;
  if (!Array.isArray(raw.features)) throw new Error("Parks.geojson is not a feature set");
  return raw.features.map((feature, index) =>
    toComparePark(feature.properties ?? {}, `park-${index}`),
  );
}

export default function Compare() {
  const [parks, setParks] = useState<ComparePark[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    loadParks(controller.signal)
      .then((items) => setParks(items))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const matches = useMemo(
    () => (parks ? matchParks(parks, query) : []),
    [parks, query],
  );
  const chosen = useMemo(
    () => selected.flatMap((key) => parks?.find((park) => park.key === key) ?? []),
    [parks, selected],
  );

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <h1 className="fa-display" style={{ maxWidth: "20ch" }}>
              Three parks, side by side.
            </h1>
            <p className="fa-lede">
              Search the City of Sydney park records, pick up to three, and compare what the
              dataset actually publishes. Missing details are labelled, not guessed — and there is
              no score, because the data does not name a winner.
            </p>
          </header>

          {failed && (
            <div className="fa-state" role="alert">
              <strong>We couldn&apos;t load the park records.</strong>
              Comparison needs the served file; nothing is shown rather than guessing.
              <div className="fa-state-actions">
                <button
                  type="button"
                  className="fa-btn fa-btn--secondary"
                  onClick={() => window.location.reload()}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!failed && parks === null && (
            <div className="fa-skeleton" role="status" aria-live="polite">
              <span />
              <span />
              <span />
              <span className="pp-visually-hidden">Loading park records</span>
            </div>
          )}

          {!failed && parks !== null && (
            <>
              <section className="fa-compare" aria-label="Choose parks to compare">
                <div className="fa-compare-picker">
                  <form
                    className="fa-compare-search"
                    role="search"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <label htmlFor="fa-compare-q">Find a park to compare</label>
                    <input
                      id="fa-compare-q"
                      type="search"
                      autoComplete="off"
                      placeholder="Type at least two letters, e.g. Fitzroy"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </form>

                  {query.trim().length >= 2 && (
                    <div className="fa-compare-matches" aria-live="polite">
                      {matches.length === 0 ? (
                        <p className="fa-meta">No park records match “{query.trim()}”.</p>
                      ) : (
                        <ul>
                          {matches.map((park) => {
                            const active = selected.includes(park.key);
                            const full = !active && selected.length >= MAX_PARKS;
                            return (
                              <li key={park.key}>
                                <button
                                  type="button"
                                  className="fa-chip-btn"
                                  aria-pressed={active}
                                  disabled={full}
                                  title={full ? "Remove a park first — three is the most" : undefined}
                                  onClick={() =>
                                    setSelected((prev) => toggleSelected(prev, park.key, MAX_PARKS))
                                  }
                                >
                                  {park.name}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}

                  <p className="fa-meta">
                    {selected.length} of {MAX_PARKS} selected. Press a selected name to remove it.
                  </p>
                </div>

                <aside className="fa-panel fa-compare-reference" aria-labelledby="fa-compare-attrs">
                  <div className="fa-panel-head">
                    <h2 id="fa-compare-attrs">What is compared</h2>
                  </div>
                  <div className="fa-panel-body">
                    <dl className="fa-compare-list">
                      <div>
                        <dt>Park type</dt>
                        <dd>The publisher&apos;s classification for the polygon.</dd>
                      </div>
                      <div>
                        <dt>Recorded area</dt>
                        <dd>Area derived from the published square-metre field.</dd>
                      </div>
                      <div>
                        <dt>Playground</dt>
                        <dd>The publisher&apos;s own playground flag, not a site survey.</dd>
                      </div>
                      <div>
                        <dt>Asset id</dt>
                        <dd>The council&apos;s identifier, so a record can be traced back.</dd>
                      </div>
                    </dl>
                    <p className="fa-note">
                      Source: City of Sydney park polygons. Coverage is the City of Sydney local
                      government area only.
                    </p>
                  </div>
                </aside>
              </section>

              {chosen.length === 0 ? (
                <div className="fa-state">
                  <strong>Nothing selected yet.</strong>
                  Comparison starts once you pick at least one park above — or{" "}
                  <Link href="/explore" className="fa-link">
                    browse the map instead
                  </Link>
                  .
                  <p className="fa-meta" style={{ marginTop: "0.5rem" }}>
                    Every attribute in the table comes from the served file. Where a publisher
                    leaves a field blank, the table says “Not provided”.
                  </p>
                </div>
              ) : (
                <div className="fa-table-wrap">
                  <table className="fa-table">
                    <caption>
                      {chosen.length} of {MAX_PARKS} park areas selected. “Not provided” means the
                      publisher did not supply that field.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Attribute</th>
                        {chosen.map((park) => (
                          <th scope="col" key={park.key}>
                            {park.name}
                            <span className="fa-meta">
                              <button
                                type="button"
                                className="fa-link"
                                onClick={() =>
                                  setSelected((prev) => toggleSelected(prev, park.key, MAX_PARKS))
                                }
                              >
                                Remove
                              </button>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Park type</th>
                        {chosen.map((park) => (
                          <td key={park.key}>{park.type ?? "Not provided"}</td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Recorded area</th>
                        {chosen.map((park) => (
                          <td key={park.key} className="fa-numeric">
                            {formatAreaHa(park.areaHa) ?? "Not provided"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Playground</th>
                        {chosen.map((park) => (
                          <td key={park.key}>{park.playgrounds ?? "Not provided"}</td>
                        ))}
                      </tr>
                      <tr>
                        <th scope="row">Asset id</th>
                        {chosen.map((park) => (
                          <td key={park.key} className="fa-numeric">
                            {park.assetId ?? "Not provided"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
