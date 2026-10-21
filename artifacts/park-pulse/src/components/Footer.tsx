import { Link } from "wouter";
import { NAV_DESTINATIONS } from "../data/navigation";
import { formatSnapshotDate, useDataSnapshot } from "../data/snapshot";

/**
 * Shared footer.
 *
 * Concise by design (PRD NAV-004): product purpose, the same primary
 * destinations the header renders (from `data/navigation`), the publishers
 * behind each layer, the snapshot date from the generated manifest, and
 * OpenStreetMap attribution. No “built by”, no unverified “data updated 2025”,
 * no duplicated filter deep links, and no invented legal pages.
 */

interface FooterProps {
  compact?: boolean;
}

function scrollToTop() {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

export default function Footer({ compact = false }: FooterProps) {
  const snapshot = useDataSnapshot();
  const snapshotDate =
    snapshot.status === "ready" ? formatSnapshotDate(snapshot.snapshot.dataLastUpdated) : null;

  return (
    <footer className="fa-footer">
      <div className="fa-footer-grid">
        <div>
          <Link href="/" className="fa-footer-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
              <path d="M12 6v6M9 9l3-3 3 3" />
            </svg>
            <span>Park Pulse</span>
          </Link>
          <p>
            Park Pulse brings together public datasets to help people explore parks and amenities.
            Each layer has its own coverage, update date and limitations.
          </p>
        </div>

        <nav aria-labelledby="fa-footer-explore">
          <h2 id="fa-footer-explore">Explore</h2>
          <div className="fa-footer-links">
            {NAV_DESTINATIONS.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.footerLabel}
              </Link>
            ))}
            <Link href="/about#accessibility">Accessibility statement</Link>
          </div>
        </nav>

        <nav aria-labelledby="fa-footer-sources">
          <h2 id="fa-footer-sources">Data sources</h2>
          <div className="fa-footer-links">
            <a href="https://data.cityofsydney.nsw.gov.au/" target="_blank" rel="noopener noreferrer">
              City of Sydney Open Data ↗
            </a>
            <a href="https://datasets.seed.nsw.gov.au/" target="_blank" rel="noopener noreferrer">
              NSW NPWS data (SEED) ↗
            </a>
            <a href="https://toiletmap.gov.au/" target="_blank" rel="noopener noreferrer">
              National Public Toilet Map ↗
            </a>
            <a href="https://opendata.transport.nsw.gov.au/" target="_blank" rel="noopener noreferrer">
              Transport for NSW ↗
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap copyright ↗
            </a>
          </div>
        </nav>
      </div>

      {!compact && (
        <div className="fa-footer-bottom">
          <p>
            {snapshotDate ? `Data snapshot: ${snapshotDate}. ` : ""}
            Not a live feed — check the source note on each result. Mapped records are not unique
            places. Contains © OpenStreetMap contributors (ODbL) where that layer is shown.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <p>© {new Date().getFullYear()} Park Pulse</p>
            <button type="button" className="fa-footer-top" onClick={scrollToTop}>
              ↑ Back to top
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}
