import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="pp-footer">
      <div className="pp-container">
        <div className="pp-footer-content">
          <div className="pp-footer-brand">
            <Link href="/" className="pp-logo">
              <svg className="pp-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
                <path d="M12 6v6M9 9l3-3 3 3" />
              </svg>
              <span>Park Pulse</span>
            </Link>
            <p>Helping Sydney residents discover and enjoy their local parks, playgrounds, and green spaces.</p>
            <div className="pp-footer-badges">
              <span className="pp-footer-badge">🗺 Interactive Map</span>
              <span className="pp-footer-badge">📍 GPS Locate</span>
              <span className="pp-footer-badge">🌿 Open Data</span>
            </div>
          </div>

          <div className="pp-footer-links">
            <h4>Navigate</h4>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/explore">Explore Parks</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/about#shortcuts">Keyboard Shortcuts</Link></li>
              <li><Link href="/about#tips">Pro Tips</Link></li>
            </ul>
          </div>

          <div className="pp-footer-links">
            <h4>Features</h4>
            <ul>
              <li>
                <Link href="/explore?filter=playground">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>
                  Playgrounds
                </Link>
              </li>
              <li>
                <Link href="/explore?filter=dogs">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7.5" cy="6.5" r="2"/><circle cx="16.5" cy="6.5" r="2"/><path d="M12 22c-4.5 0-7.5-2.5-7.5-6 0-2.5 2-4 5-4h5c3 0 5 1.5 5 4 0 3.5-3 6-7.5 6z"/></svg>
                  Dog Parks
                </Link>
              </li>
              <li>
                <Link href="/explore?filter=iconic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Iconic Parks
                </Link>
              </li>
              <li>
                <Link href="/explore?locate=1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
                  Near Me
                </Link>
              </li>
              <li>
                <Link href="/explore?sort=size">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                  Largest Parks
                </Link>
              </li>
              <li>
                <Link href="/explore?surprise=1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
                  Surprise Me
                </Link>
              </li>
            </ul>
          </div>

          <div className="pp-footer-data">
            <h4>Data Sources</h4>
            <ul>
              <li>
                <a href="https://opendata.cityofsydney.nsw.gov.au" target="_blank" rel="noopener noreferrer">
                  City of Sydney Open Data ↗
                </a>
              </li>
              <li>
                <a href="https://data.nsw.gov.au" target="_blank" rel="noopener noreferrer">
                  NSW Government Data ↗
                </a>
              </li>
              <li>
                <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer">
                  OpenStreetMap ↗
                </a>
              </li>
              <li>
                <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener noreferrer">
                  Nominatim Geocoder ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pp-footer-bottom">
          <p>© 2025–{new Date().getFullYear()} Park Pulse — Open Data Project</p>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <p>Built by Raghav Kumawat · Data updated 2025</p>
            <button
              className="pp-footer-back-top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="Back to top"
              title="Scroll to top"
            >
              ↑ Top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
