import { useState } from "react";
import { Link, useLocation } from "wouter";

export default function Navbar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="pp-header">
      <nav className="pp-nav">
        <Link href="/" className="pp-logo">
          <svg className="pp-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
            <path d="M12 6v6M9 9l3-3 3 3" />
          </svg>
          <span>Park Pulse</span>
        </Link>
        <button
          className={`pp-mobile-menu-btn${menuOpen ? " active" : ""}`}
          aria-label="Toggle menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
          <span />
        </button>
        <ul className={`pp-nav-links${menuOpen ? " active" : ""}`}>
          <li>
            <Link href="/" className={location === "/" ? "active" : ""} onClick={() => setMenuOpen(false)}>
              Home
            </Link>
          </li>
          <li>
            <Link href="/explore" className={location === "/explore" ? "active" : ""} onClick={() => setMenuOpen(false)}>
              Explore
            </Link>
          </li>
          <li>
            <Link href="/about" className={location === "/about" ? "active" : ""} onClick={() => setMenuOpen(false)}>
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
