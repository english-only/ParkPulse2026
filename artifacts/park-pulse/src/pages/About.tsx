import { useState, useEffect } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const BASE = import.meta.env.BASE_URL;

export default function About() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}data/meta.json`)
      .then(r => r.json())
      .then(d => {
        if (d.lastUpdated) {
          setLastUpdated(new Date(d.lastUpdated).toLocaleDateString("en-AU", {
            year: "numeric", month: "long", day: "numeric",
          }));
        }
      }).catch(() => {});
  }, []);

  const sources = [
    {
      title: "City of Sydney Parks",
      desc: "Comprehensive dataset of 400+ parks including location boundaries, park types, and playground information.",
      href: "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::parks-1",
      badge: "GeoJSON",
    },
    {
      title: "Blacktown City Parks",
      desc: "Parks and playground locations across the Blacktown local government area.",
      href: "https://data.nsw.gov.au/",
      badge: "GeoJSON",
    },
    {
      title: "NPWS Facilities — Greater Sydney",
      desc: "1,795 National Parks & Wildlife Service facility points across Greater Sydney including BBQ areas, shelters, picnic tables and more.",
      href: "https://data.nsw.gov.au/",
      badge: "GeoJSON · 1,795 pts",
      highlight: true,
    },
    {
      title: "Dog Off-Leash Parks",
      desc: "City of Sydney off-leash dog areas including hours, prohibited zones, and full descriptions.",
      href: "https://data.cityofsydney.nsw.gov.au/",
      badge: "GeoJSON · 29 parks",
      highlight: true,
    },
    {
      title: "Drinking Fountains",
      desc: "Locations of public drinking fountains and water stations throughout Sydney.",
      href: "https://data.cityofsydney.nsw.gov.au/",
      badge: "GeoJSON",
    },
    {
      title: "NSW Open Data Portal",
      desc: "Additional park data, public toilet locations, and transport stops from the NSW Government open data portal.",
      href: "https://data.nsw.gov.au/",
      badge: "JSON",
    },
  ];

  const techStack = [
    { name: "React 19", desc: "UI framework with hooks and functional components", icon: "⚛️" },
    { name: "Vite", desc: "Next-generation frontend tooling and dev server", icon: "⚡" },
    { name: "Leaflet.js", desc: "Open-source interactive maps library", icon: "🗺️" },
    { name: "Leaflet.markercluster", desc: "Marker clustering for dense data layers", icon: "📍" },
    { name: "TypeScript", desc: "Type-safe JavaScript for reliable code", icon: "🔷" },
    { name: "OpenStreetMap / CARTO", desc: "Map tile providers with 5 visual themes", icon: "🌍" },
  ];

  return (
    <div className="pp-page">
      <Navbar />
      <main className="pp-about-main">
        <section className="pp-about-hero">
          <div className="pp-container">
            <h1>About Park Pulse</h1>
            <p className="pp-about-subtitle">Connecting communities with their local parks and green spaces</p>
            {lastUpdated && (
              <p className="pp-about-updated">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Data last updated: {lastUpdated}
              </p>
            )}
          </div>
        </section>

        <section className="pp-about-content">
          <div className="pp-container">
            <div className="pp-about-grid">
              <div className="pp-about-text">
                <h2>Our Mission</h2>
                <p>
                  Park Pulse was created to help Sydney residents and visitors discover the incredible
                  variety of parks, playgrounds, and recreational facilities available throughout the city.
                  We believe that everyone should have easy access to information about their local green spaces.
                </p>
                <p>
                  Version 2.0 adds 1,795 NPWS facilities, 29 dog off-leash parks, 5 visual themes,
                  a "Locate Me" feature, marker clustering, and a toast notification system — all while
                  keeping the experience fast and intuitive.
                </p>
                <h2>How It Works</h2>
                <ul className="pp-feature-list">
                  {[
                    "View all parks and playgrounds on an interactive map",
                    "Filter by 12 different layer types including dog parks and NPWS facilities",
                    "Search parks by name, suburb, or type with debounced instant results",
                    "Switch between 5 visual themes — your preference is remembered",
                    "Use Locate Me to find parks near your current position",
                    "Share any park with a direct link via the detail modal",
                    "Get directions to any park with one click via Google Maps",
                  ].map(item => (
                    <li key={item}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pp-about-image">
                <img src="https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&q=80"
                  alt="Children playing in a park playground" />
              </div>
            </div>
          </div>
        </section>

        <section className="pp-data-sources">
          <div className="pp-container">
            <h2>Data Sources</h2>
            <p className="pp-data-intro">
              Park Pulse uses open public datasets to provide accurate and up-to-date information
              about parks, recreational facilities, and amenities across Sydney.
            </p>
            <div className="pp-sources-grid">
              {sources.map(s => (
                <div key={s.title} className={`pp-source-card${s.highlight ? " highlight" : ""}`}>
                  <div className="pp-source-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                  </div>
                  <h3>{s.title}{s.highlight && <span className="pp-new-badge">New</span>}</h3>
                  <p>{s.desc}</p>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="pp-source-link">
                    View Dataset ↗
                  </a>
                  <span className="pp-source-badge">{s.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="pp-tech-stack">
          <div className="pp-container">
            <h2>Tech Stack</h2>
            <p className="pp-data-intro">Built with modern open-source tools and government open data.</p>
            <div className="pp-tech-grid">
              {techStack.map(t => (
                <div key={t.name} className="pp-tech-card">
                  <span className="pp-tech-emoji">{t.icon}</span>
                  <h4>{t.name}</h4>
                  <p>{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-about-cta">
          <div className="pp-container">
            <h2>Ready to Explore?</h2>
            <p>Start discovering parks and playgrounds in your area today.</p>
            <Link href="/explore" className="pp-btn pp-btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              Explore Parks
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
