import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { countFor, formatCount, getLayer, resolveLayerStatus } from "../data/layers";
import { useDataSnapshot } from "../data/snapshot";

/**
 * Amenities — a directory of the facility layers, not a second map.
 *
 * Each card names one published layer, shows its verified record count and
 * coverage, and hands off to the explorer with that layer's filter already
 * applied. Layers that are not published get a reason instead of a link.
 */

const AMENITY_IDS = ["toilets", "fountains", "dogs", "transport", "npws", "trees"] as const;

/** Registry layer id → the explorer's `?filter=` key for that layer. */
const FILTER_FOR: Record<string, string> = {
  toilets: "toilets",
  fountains: "fountains",
  dogs: "dogs",
  transport: "transport",
  npws: "npws",
  trees: "trees",
};

export default function Amenities() {
  const snapshot = useDataSnapshot();
  const counts = snapshot.status === "ready" ? snapshot.snapshot.counts : null;

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <div className="fa-wrap">
          <header className="fa-page-head">
            <h1 className="fa-display" style={{ maxWidth: "22ch" }}>
              Facilities, on their own terms.
            </h1>
            <p className="fa-lede">
              Toilets, fountains, off-leash areas, transport stops and more — each with
              its publisher, coverage and limits. Pick one to open the map with that
              layer already switched on.
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
              Layer names and coverage below are still accurate; record counts are hidden
              rather than guessed.
              <div className="fa-state-actions">
                <button type="button" className="fa-btn fa-btn--secondary" onClick={snapshot.reload}>
                  Try again
                </button>
              </div>
            </div>
          )}

          <div className="fa-cards" role="list">
            {AMENITY_IDS.map((id) => {
              const layer = getLayer(id);
              if (!layer) return null;
              const status = resolveLayerStatus(layer, counts);
              const filter = FILTER_FOR[layer.id];
              return (
                <article className="fa-card" role="listitem" key={layer.id}>
                  <div>
                    <h2 className="fa-h3">{layer.label}</h2>
                    <p className="fa-card-text">{layer.coverage}</p>
                  </div>
                  <p className="fa-card-count fa-numeric">
                    {counts ? formatCount(countFor(layer, counts)) : "Not provided"}
                    <span> records</span>
                  </p>
                  <div className="fa-card-actions">
                    {status === "published" && filter ? (
                      <Link
                        href={`/explore?filter=${filter}`}
                        className="fa-btn fa-btn--secondary"
                      >
                        Open in Explore
                      </Link>
                    ) : (
                      <span className="fa-meta">
                        {layer.statusNote ?? "Not published in this build."}
                      </span>
                    )}
                  </div>
                  <p className="fa-meta">
                    {layer.source.publisher}
                    {layer.limitations[0] ? ` · ${layer.limitations[0]}` : ""}
                  </p>
                </article>
              );
            })}
          </div>

          <p className="fa-note">
            Counts are dataset records with their own coverage and freshness — not a
            promise that a facility is open or working today.{" "}
            <Link href="/atlas" className="fa-link">
              See every dataset in the atlas
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
