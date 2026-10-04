import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const BASE = import.meta.env.BASE_URL;

export default function About() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showBackTop, setShowBackTop] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${BASE}data/meta.json`).then(r => r.json()).then(data => {
      if (data.lastUpdated) setLastUpdated(new Date(data.lastUpdated).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = () => setShowBackTop(window.scrollY > 500);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const dataSources = [
    { title: "City of Sydney Parks", desc: "Comprehensive dataset of over 400 parks including location boundaries, park types, and playground information.", href: "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::parks-1", badge: "GeoJSON" },
    { title: "Blacktown City Council", desc: "Parks and playground locations across the Blacktown local government area.", href: "https://www.blacktown.nsw.gov.au/", badge: "GeoJSON" },
    { title: "NPWS Facilities", desc: "1,795 National Parks & Wildlife Service facility points across Greater Sydney — BBQs, shelters, picnic tables, playgrounds and more.", href: "https://datasets.seed.nsw.gov.au/", badge: "GeoJSON", isNew: true },
    { title: "Off-Leash Dog Parks", desc: "City of Sydney off-leash dog areas with hours, restrictions, and descriptions for 29 designated parks.", href: "https://data.cityofsydney.nsw.gov.au/", badge: "GeoJSON", isNew: true },
    { title: "Drinking Fountains", desc: "Locations of public drinking fountains and water stations throughout Sydney.", href: "https://data.cityofsydney.nsw.gov.au/", badge: "GeoJSON" },
    { title: "NSW Open Data Portal", desc: "Additional playground and park data from the NSW Government open data portal.", href: "https://data.nsw.gov.au/", badge: "JSON" },
    { title: "Transport for NSW", desc: "Public transport stop locations for buses, trains, and ferries near parks.", href: "https://opendata.transport.nsw.gov.au/", badge: "JSON" },
  ];

  const techStack = [
    { name: "React 19", icon: "⚛️", desc: "UI framework — component-based, fast HMR" },
    { name: "Vite 7", icon: "⚡", desc: "Build tool — instant dev server" },
    { name: "Leaflet.js", icon: "🗺️", desc: "Interactive maps with clustering" },
    { name: "TypeScript", icon: "📘", desc: "Type-safe components and data models" },
    { name: "OpenStreetMap / CARTO / Esri", icon: "🌐", desc: "6 map tile themes: default, dark, sunset, neon, minimal, satellite" },
    { name: "Open Government Data", icon: "🏛️", desc: "NSW & City of Sydney datasets" },
  ];

  return (
    <div className="pp-page" ref={topRef}>
      <Navbar />
      <main className="pp-about-main">
        {showBackTop && (
          <button
            className="pp-about-back-top"
            aria-label="Back to top"
            title="Back to top"
            onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        )}
        <section className="pp-about-hero" id="top">
          <div className="pp-container">
            <h1>About Park Pulse</h1>
            <p className="pp-about-subtitle">Connecting communities with their local parks and green spaces</p>
            {lastUpdated && <p className="pp-about-updated">Last updated: {lastUpdated}</p>}
          </div>
        </section>

        <nav className="pp-about-jump-nav" aria-label="Page sections">
          <div className="pp-container">
            {[
              { href: "#mission", label: "Mission" },
              { href: "#how-it-works", label: "How It Works" },
              { href: "#data", label: "Data Sources" },
              { href: "#tech", label: "Tech Stack" },
              { href: "#tips", label: "Pro Tips" },
              { href: "#shortcuts", label: "Shortcuts" },
            ].map(({ href, label }) => (
              <a key={href} href={href} className="pp-about-jump-link">{label}</a>
            ))}
          </div>
        </nav>

        {/* ── Mission ── */}
        <section className="pp-about-content pp-about-section-anchor" id="mission" style={{ scrollMarginTop: "3.25rem" }}>
          <div className="pp-container">
            <div className="pp-about-grid">
              <div className="pp-about-text">
                <h2>Our Mission</h2>
                <p>Park Pulse was created to help Sydney residents and visitors discover the incredible variety of parks, playgrounds, dog parks, and recreational facilities available throughout the city. We believe everyone should have easy access to their local green spaces.</p>
                <p>Our platform aggregates open government data and presents it in an easy-to-use, interactive map-based format — with smart filters, 6 visual themes, and powerful search.</p>
                <ul className="pp-feature-list" style={{ marginTop: "1.25rem" }}>
                  {[
                    "2,000+ parks and green spaces across Greater Sydney",
                    "1,795 NPWS facilities — BBQs, picnic tables, shelters and more",
                    "29 off-leash dog parks with hours and restrictions",
                    "6 map themes for every preference: day, night, satellite, and more",
                    "All data sourced from open NSW and City of Sydney government datasets",
                  ].map(item => (
                    <li key={item}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="pp-about-image">
                <img src="https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=80" alt="Aerial view of a green park in the city" />
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="pp-hiw-section pp-about-section-anchor" id="how-it-works" style={{ scrollMarginTop: "3.25rem" }}>
          <div className="pp-container">
            <div className="pp-hiw-header">
              <h2>How It Works</h2>
              <p className="pp-data-intro" style={{ marginBottom: 0 }}>Six steps from opening the app to finding your perfect park.</p>
            </div>
            <div className="pp-hiw-steps">
              {[
                {
                  n: "1",
                  icon: "🗺️",
                  title: "Open the Map",
                  desc: "Visit the Explore page to see 2,000+ Sydney parks plotted as colour-coded markers on an interactive map. Clusters expand as you zoom in.",
                  cta: { label: "Open Explore", href: "/explore" },
                },
                {
                  n: "2",
                  icon: "🔍",
                  title: "Search & Filter",
                  desc: "Type a park name, suburb, or type in the search box. Use quick-filter pills (Playgrounds, Dog Parks, Iconic…) or the full filter panel for fine-grained control.",
                  cta: null,
                },
                {
                  n: "3",
                  icon: "📍",
                  title: "Click a Park",
                  desc: "Tap any map marker or result card to open the full park detail — area, facilities, size category, directions, and nearby NPWS facilities.",
                  cta: null,
                },
                {
                  n: "4",
                  icon: "⭐",
                  title: "Save Favourites",
                  desc: "Heart any park to save it to your private list. Export your saved parks as a clipboard list of Google Maps links for easy sharing.",
                  cta: null,
                },
                {
                  n: "5",
                  icon: "🧭",
                  title: "Get Directions",
                  desc: "Open walking or driving directions to any park in one click — walking time estimate included. Or jump straight to Google Maps or OpenStreetMap.",
                  cta: null,
                },
                {
                  n: "6",
                  icon: "🎲",
                  title: "Discover Randomly",
                  desc: "Press S or click \"Surprise Me\" to jump to a random park from your current filtered results. Great for spontaneous weekend adventures.",
                  cta: { label: "Surprise Me", href: "/explore?surprise=1" },
                },
              ].map(step => (
                <div key={step.n} className="pp-hiw-card">
                  <div className="pp-hiw-number">{step.n}</div>
                  <div className="pp-hiw-icon">{step.icon}</div>
                  <h3 className="pp-hiw-title">{step.title}</h3>
                  <p className="pp-hiw-desc">{step.desc}</p>
                  {step.cta && (
                    <Link href={step.cta.href} className="pp-hiw-cta">{step.cta.label} →</Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-data-sources" id="data">
          <div className="pp-container">
            <h2>Data Sources</h2>
            <p className="pp-data-intro">Park Pulse uses open public datasets to provide accurate and up-to-date information.</p>
            <div className="pp-sources-grid">
              {dataSources.map(s => (
                <div key={s.title} className="pp-source-card">
                  <div className="pp-source-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                  </div>
                  <div className="pp-source-header-row">
                    <h3>{s.title}</h3>
                    {s.isNew && <span className="pp-source-new-badge">New</span>}
                  </div>
                  <p>{s.desc}</p>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="pp-source-link">View Dataset ↗</a>
                  <span className="pp-source-badge">{s.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-tech-stack" id="tech">
          <div className="pp-container">
            <h2>Tech Stack</h2>
            <p className="pp-data-intro">Built with modern open-source tools for performance and reliability.</p>
            <div className="pp-tech-grid">
              {techStack.map(t => (
                <div key={t.name} className="pp-tech-card">
                  <span className="pp-tech-icon">{t.icon}</span>
                  <div>
                    <h4>{t.name}</h4>
                    <p>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-pro-tips" id="tips">
          <div className="pp-container">
            <h2>Pro Tips</h2>
            <p className="pp-data-intro">Get the most out of Park Pulse with these power-user tricks.</p>
            <div className="pp-tips-grid">
              {[
                { icon: "🏷️", tip: "Click any type badge on a park card to instantly filter by that type — Pocket, Iconic, Neighbourhood, and more." },
                { icon: "📍", tip: "Click any suburb pill on a card or in the park detail to search all parks in that suburb at once." },
                { icon: "🎲", tip: "Press S (or click the dice icon) for a Surprise Me random park from your current filtered results." },
                { icon: "🔗", tip: "Hover over any park card to reveal a share button — it copies a direct link to that park in one click." },
                { icon: "🗺️", tip: "Press T repeatedly to cycle through all 6 map themes: Modern Green, Night Mode, Sunset, Neon, Minimal, and Satellite." },
                { icon: "⌨️", tip: "Press ? at any time on the Explore page to pop up the full keyboard shortcuts cheat sheet." },
                { icon: "📐", tip: "Press C to toggle compact view — great for quickly scanning a long list of results." },
                { icon: "🏃", tip: "N and P (or ← →) navigate between parks in the detail panel without closing and reopening the modal." },
                { icon: "🔍", tip: "Press / to instantly jump focus to the search box, then Esc to clear and return to the map." },
                { icon: "📋", tip: "Click the coordinates in any park detail panel to instantly copy lat/lng to your clipboard." },
              ].map(({ icon, tip }) => (
                <div key={icon} className="pp-tip-card">
                  <span className="pp-tip-icon">{icon}</span>
                  <p>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-shortcuts-about" id="shortcuts">
          <div className="pp-container">
            <h2>Keyboard Shortcuts</h2>
            <p className="pp-data-intro">Power-user tips for the Explore page — press <code className="pp-inline-code">?</code> on the explore page to show these at any time.</p>
            <div className="pp-shortcuts-about-grid">
              {[
                { keys: ["/"], desc: "Focus the search box" },
                { keys: ["↑", "↓"], desc: "Navigate through results" },
                { keys: ["Enter"], desc: "Open the selected park" },
                { keys: ["S"], desc: "Surprise me — open a random park" },
                { keys: ["C"], desc: "Toggle compact / normal view" },
                { keys: ["F"], desc: "Fit map to visible results" },
                { keys: ["T"], desc: "Cycle through map themes" },
                { keys: ["L"], desc: "Locate me via GPS" },
                { keys: ["D"], desc: "Toggle saved / favourites view" },
                { keys: ["W"], desc: "Walking directions for the open park" },
                { keys: ["G"], desc: "Open park in Google Maps (while modal open)" },
                { keys: ["N"], desc: "Next park in list (while modal is open)" },
                { keys: ["P"], desc: "Previous park in list (while modal is open)" },
                { keys: ["←", "→"], desc: "Navigate parks in modal (arrow keys)" },
                { keys: ["Esc"], desc: "Close modal or dismiss overlay" },
                { keys: ["?"], desc: "Toggle keyboard shortcuts help" },
                { keys: ["M"], desc: "Recenter map on Sydney CBD" },
                { keys: ["1"], desc: "Sort: Default order" },
                { keys: ["2"], desc: "Sort: A–Z alphabetical" },
                { keys: ["3"], desc: "Sort: Nearest first (triggers locate if no GPS)" },
                { keys: ["4"], desc: "Sort: Largest parks first" },
              ].map(({ keys, desc }) => (
                <div key={desc} className="pp-shortcut-about-row">
                  <div className="pp-shortcut-about-keys">
                    {keys.map(k => <kbd key={k} className="pp-kbd">{k}</kbd>)}
                  </div>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-about-cta">
          <div className="pp-container">
            <h2>Ready to Discover Your Perfect Park?</h2>
            <p>Over 2,000 parks and green spaces — playgrounds, dog areas, NPWS facilities, and more — all on one map.</p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/explore" className="pp-btn pp-btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                Explore Parks
              </Link>
              <Link href="/explore?surprise=1" className="pp-btn pp-btn-secondary">
                <span style={{ fontSize: "1rem" }}>🎲</span>
                Surprise Me
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
