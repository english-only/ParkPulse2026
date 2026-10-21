import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { NAV_DESTINATIONS, isCurrentRoute } from "../data/navigation";
import { THEMES, useTheme, type ThemeIcon } from "../hooks/useTheme";

/**
 * Shared header.
 *
 * Every primary destination in the product, from the same list the footer
 * renders, plus the two-theme switch. The header is the sitemap now: Amenities,
 * Compare and the Atlas are reachable at the top of every page, not only from
 * the footer. The current route is exposed with aria-current rather than a
 * class alone, the mobile panel is a real disclosure that is removed from the
 * tab order when closed, Escape returns focus to its trigger, and the skip link
 * is the first focusable element on every page.
 */

function ThemeGlyph({ icon }: { icon: ThemeIcon }) {
  return icon === "sun" ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.55 1.55M18.25 18.25l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.55-1.55M18.25 5.75l1.55-1.55" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export default function Navbar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // A route change always dismisses the panel.
  useEffect(() => setMenuOpen(false), [location]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="fa-header" ref={headerRef}>
      <a className="fa-skip" href="#main-content">
        Skip to content
      </a>
      <nav className="fa-nav" aria-label="Primary">
        <Link
          href="/"
          className="fa-brand"
          aria-current={isCurrentRoute(location, "/") ? "page" : undefined}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
            <path d="M12 6v6M9 9l3-3 3 3" />
          </svg>
          <span>Park Pulse</span>
        </Link>

        <ul className="fa-nav-links">
          {NAV_DESTINATIONS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="fa-nav-link"
                aria-current={isCurrentRoute(location, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="fa-nav-actions">
          <div className="fa-theme" role="group" aria-label="Colour theme">
            {THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                className="fa-theme-option"
                aria-pressed={theme === option.id}
                title={`${option.label} — ${option.description}`}
                onClick={() => setTheme(option.id)}
              >
                <span className="fa-theme-icon" aria-hidden="true">
                  <ThemeGlyph icon={option.icon} />
                </span>
                <span>{option.label.split(" ")[0]}</span>
                <span className="pp-visually-hidden">{option.label}</span>
              </button>
            ))}
          </div>

          <button
            ref={menuButtonRef}
            type="button"
            className="fa-menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="fa-mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Hidden rather than visually collapsed, so closed links are never
          focusable or announced by a screen reader. */}
      <div className="fa-mobile-nav" id="fa-mobile-nav" hidden={!menuOpen}>
        <ul>
          {NAV_DESTINATIONS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrentRoute(location, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
