import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { useRevealOnScroll } from "../hooks/useReveal";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ParkFieldPlot from "../components/ParkFieldPlot";
import { formatSnapshotDate, useDataSnapshot, type DataSnapshot } from "../data/snapshot";
import { countFor, formatCount, getLayer } from "../data/layers";
import type { RecentPark } from "../types/park";

/**
 * Home — the atlas cover.
 *
 * The landing page answers three questions in order: what this is (headline and
 * lede), what it actually holds (the park field, then the count ledger), and
 * how to start (the guide and the deep links). Every number is read from the
 * generated snapshot through the layer registry, and the field is drawn from
 * the same park coordinates the map renders — no illustration stands in for
 * data the product can show for real.
 */

const RECENTS_KEY = "parkpulse_recent";

/** The layers that answer "what can I actually find here?" at a glance. */
const SNAPSHOT_LAYER_IDS = ["parks", "dogs", "fountains", "npws"] as const;

/** Real, supported Explore deep links — no equivalent re-implemented here. */
const ENTRY_LINKS = [
  {
    href: "/explore?filter=playground",
    title: "Playgrounds",
    desc: "Park areas with a playground recorded by the City of Sydney.",
  },
  {
    href: "/explore?filter=dogs",
    title: "Off-leash dogs",
    desc: "Designated areas with the publisher's hours and restrictions.",
  },
  {
    href: "/explore?sort=size",
    title: "Largest parks",
    desc: "Sort mapped park areas by recorded area, largest first.",
  },
  {
    href: "/explore?locate=1",
    title: "Near me",
    desc: "Ask your browser for a location, then sort by distance.",
  },
] as const;

const GUIDE = [
  {
    title: "Search or pick a category",
    body: "Type a park, suburb or park type, or start from a need: playgrounds, off-leash areas, drinking fountains.",
  },
  {
    title: "Narrow the map",
    body: "Switch layers on and off in the rail. The result list and the map always describe the same records.",
  },
  {
    title: "Check before you go",
    body: "Each place shows the fields its publisher provides, plus the source and freshness note. Missing details are labelled, not guessed.",
  },
] as const;

function readRecents(): RecentPark[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const recents: RecentPark[] = [];
    for (const item of parsed) {
      if (recents.length >= 6) break;
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<RecentPark>;
      if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;
      if (seen.has(candidate.name)) continue;
      seen.add(candidate.name);
      recents.push({
        id: typeof candidate.id === "number" ? candidate.id : 0,
        name: candidate.name,
        type: typeof candidate.type === "string" ? candidate.type : "",
        suburb: typeof candidate.suburb === "string" ? candidate.suburb : "",
      });
    }
    return recents;
  } catch {
    // Unreadable or malformed storage must not break the landing page.
    return [];
  }
}

function SnapshotLedger({ snapshot }: { snapshot: DataSnapshot }) {
  return (
    <div className="fa-stats">
      {SNAPSHOT_LAYER_IDS.map((id) => {
        const layer = getLayer(id);
        if (!layer) return null;
        const count = countFor(layer, snapshot.counts);
        return (
          <div className="fa-stat" key={id} data-reveal>
            <span className="fa-stat-value">{formatCount(count)}</span>
            <span className="fa-stat-label">{layer.label}</span>
            <span className="fa-stat-source">
              {layer.source.publisher} · {layer.coverage}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const snapshot = useDataSnapshot();
  const [recents, setRecents] = useState<RecentPark[]>([]);
  useRevealOnScroll();

  useEffect(() => setRecents(readRecents()), []);

  function clearRecents() {
    try {
      localStorage.removeItem(RECENTS_KEY);
    } catch {
      // Storage may be unavailable; the list is still cleared for this view.
    }
    setRecents([]);
  }

  const generated = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.generatedAt) : null;
  const observed = snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.dataLastUpdated) : null;

  return (
    <div className="fa-shell">
      <Navbar />
      <main id="main-content" className="fa-main">
        <section className="fa-hero">
          <div data-reveal>
            <h1 className="fa-display">Find your next patch of green.</h1>
            <p className="fa-lede">
              Park Pulse maps public parks and facilities across Greater Sydney, and names the
              source and coverage behind every record.
            </p>
            <div className="fa-hero-actions">
              <Link href="/explore" className="fa-btn fa-btn--primary">
                Explore the map
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link href="/about#data" className="fa-btn fa-btn--secondary">
                How the data works
              </Link>
            </div>
            <p className="fa-hero-note">
              No account, no tracking. Favourites and recently viewed places stay in this browser.
            </p>
          </div>

          <ParkFieldPlot />
        </section>

        <section className="fa-section" aria-labelledby="fa-whats-mapped">
          <div className="fa-wrap">
            <div className="fa-snapshot-head" data-reveal>
              <div className="fa-section-head" style={{ marginBottom: 0 }}>
                <h2 className="fa-h2" id="fa-whats-mapped">
                  What is mapped
                </h2>
                <p className="fa-sub">
                  Counts are records in the dataset this build serves — not unique places, and not a
                  measure of whether a facility is open today.
                </p>
              </div>
              <p className="fa-meta fa-numeric">
                {generated ? `Snapshot generated ${generated}` : "Snapshot date unavailable"}
              </p>
            </div>

            {snapshot.status === "loading" && (
              <div className="fa-skeleton" role="status" aria-live="polite">
                <span />
                <span />
                <span />
                <span />
                <span className="pp-visually-hidden">Loading the data snapshot</span>
              </div>
            )}

            {snapshot.status === "error" && (
              <div className="fa-state">
                <strong>We couldn&apos;t load the data snapshot.</strong>
                The map may still be available. This page will not show a count it cannot verify.
                <div className="fa-state-actions">
                  <button type="button" className="fa-btn fa-btn--secondary" onClick={snapshot.reload}>
                    Try again
                  </button>
                </div>
              </div>
            )}

            {snapshot.status === "ready" && <SnapshotLedger snapshot={snapshot.snapshot} />}

            <p className="fa-note">
              Coverage varies by dataset. The City of Sydney layers cover that local government area
              only; NPWS facilities come from a different source with its own extent, and the
              newest observation is {observed ?? "not recorded in this build"}.{" "}
              <Link href="/about#data" className="fa-link">
                See coverage and sources
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="fa-section" aria-labelledby="fa-how">
          <div className="fa-wrap">
            <div className="fa-guide">
              <div className="fa-section-head" style={{ marginBottom: 0 }} data-reveal>
                <h2 className="fa-h2" id="fa-how">
                  How the map reads
                </h2>
                <p className="fa-sub">
                  Search and filters describe the same records as the map, so a result you can read
                  is always a place you can find. Nothing is ranked, and nothing is filled in when a
                  publisher leaves a field blank.
                </p>
              </div>
              <ol className="fa-guide-steps">
                {GUIDE.map((step, i) => (
                  <li key={step.title} data-reveal style={{ "--reveal-i": i } as CSSProperties}>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="fa-section" aria-labelledby="fa-start">
          <div className="fa-wrap">
            <div className="fa-section-head" data-reveal>
              <h2 className="fa-h2" id="fa-start">
                Start with what you need
              </h2>
              <p className="fa-sub">Each of these opens the explorer with that filter already applied.</p>
            </div>
            <div className="fa-entries">
              {ENTRY_LINKS.map((entry, i) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="fa-entry"
                  data-reveal
                  style={{ "--reveal-i": i } as CSSProperties}
                >
                  <span className="fa-entry-title">{entry.title}</span>
                  <span className="fa-entry-desc">{entry.desc}</span>
                  <span className="fa-entry-arrow" aria-hidden="true">
                    Open →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {recents.length > 0 && (
          <section className="fa-section fa-section--tight" aria-labelledby="fa-recent">
            <div className="fa-wrap">
              <div className="fa-snapshot-head">
                <div>
                  <h2 className="fa-h2" id="fa-recent">
                    Recently viewed
                  </h2>
                  <p className="fa-sub">Stored in this browser only. Clearing them changes nothing else.</p>
                </div>
                <button type="button" className="fa-btn fa-btn--ghost" onClick={clearRecents}>
                  Clear history
                </button>
              </div>
              <ul className="fa-recents">
                {recents.map((park) => (
                  <li key={`${park.name}-${park.suburb}`}>
                    <Link
                      href={`/explore?park=${encodeURIComponent(park.name)}`}
                      className="fa-recent"
                    >
                      {park.name}
                      {park.type ? <span>{park.type}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="fa-section">
          <div className="fa-wrap">
            <div className="fa-cta" data-reveal>
              <div>
                <h2>Ready when you are</h2>
                <p>
                  The explorer works without an account. Every result carries the dataset it came
                  from, so you can judge how much to rely on it.
                </p>
              </div>
              <Link href="/explore" className="fa-btn fa-btn--primary">
                Open the explorer
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
