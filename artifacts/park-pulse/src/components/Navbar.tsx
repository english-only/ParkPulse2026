import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useTheme, THEMES } from "../hooks/useTheme";

export default function Navbar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const themeRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [menuOpen]);

  // Close theme picker on outside click
  useEffect(() => {
    if (!themeOpen) return;
    const handler = (e: MouseEvent) => {
      if (!themeRef.current?.contains(e.target as Node)) setThemeOpen(false);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [themeOpen]);

  const currentTheme = THEMES.find(t => t.id === theme);

  return (
    <header className="pp-header">
      <nav className="pp-nav" ref={navRef}>
        <Link href="/" className="pp-logo" aria-label="Park Pulse home">
          <svg className="pp-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
            <path d="M12 6v6M9 9l3-3 3 3" />
          </svg>
          <span>Park Pulse</span>
        </Link>

        <div className="pp-nav-right">
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

          <div className="pp-theme-picker" ref={themeRef}>
            <button
              className="pp-theme-btn"
              aria-label="Change theme"
              aria-expanded={themeOpen}
              onClick={(e) => { e.stopPropagation(); setThemeOpen(o => !o); }}
            >
              <span className="pp-theme-icon">{currentTheme?.icon ?? "🌿"}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
              </svg>
            </button>
            {themeOpen && (
              <div className="pp-theme-dropdown" role="listbox" aria-label="Select theme">
                <p className="pp-theme-dropdown-label">Choose Theme</p>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`pp-theme-option${theme === t.id ? " active" : ""}`}
                    role="option"
                    aria-selected={theme === t.id}
                    onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                    {theme === t.id && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pp-theme-check">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`pp-mobile-menu-btn${menuOpen ? " active" : ""}`}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>
    </header>
  );
}
