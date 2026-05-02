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
            <p>Helping Sydney residents discover and enjoy their local parks and playgrounds.</p>
          </div>
          <div className="pp-footer-links">
            <h4>Quick Links</h4>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/explore">Explore</Link></li>
              <li><Link href="/about">About</Link></li>
            </ul>
          </div>
          <div className="pp-footer-data">
            <h4>Data Sources</h4>
            <p>Data provided by City of Sydney Open Data Portal and NSW Government.</p>
          </div>
        </div>
        <div className="pp-footer-bottom">
          <p>Park Pulse — Open Data Project</p>
          <p>By Raghav Kumawat</p>
        </div>
      </div>
    </footer>
  );
}
