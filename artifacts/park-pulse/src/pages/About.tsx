import { useEffect, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const BASE = import.meta.env.BASE_URL;

export default function About() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}data/meta.json`).then(r => r.json()).then(data => {
      if (data.lastUpdated) setLastUpdated(new Date(data.lastUpdated).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" }));
    }).catch(() => {});
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
    { name: "OpenStreetMap / CARTO", icon: "🌐", desc: "5 map tile themes including dark mode" },
    { name: "Open Government Data", icon: "🏛️", desc: "NSW & City of Sydney datasets" },
  ];

  return (
    <div className="pp-page">
      <Navbar />
      <main className="pp-about-main">
        <section className="pp-about-hero">
          <div className="pp-container">
            <h1>About Park Pulse</h1>
            <p className="pp-about-subtitle">Connecting communities with their local parks and green spaces</p>
            {lastUpdated && <p className="pp-about-updated">Last updated: {lastUpdated}</p>}
          </div>
        </section>

        <section className="pp-about-content">
          <div className="pp-container">
            <div className="pp-about-grid">
              <div className="pp-about-text">
                <h2>Our Mission</h2>
                <p>Park Pulse was created to help Sydney residents and visitors discover the incredible variety of parks, playgrounds, dog parks, and recreational facilities available throughout the city. We believe everyone should have easy access to their local green spaces.</p>
                <p>Our platform aggregates open government data and presents it in an easy-to-use, interactive map-based format — with smart filters, 5 visual themes, and powerful search.</p>
                <h2>How It Works</h2>
                <p>Use the interactive explorer to:</p>
                <ul className="pp-feature-list">
                  {["Browse 2,000+ parks on an interactive map", "Find off-leash dog parks with hours and restrictions", "Discover 1,795 NPWS facilities across Greater Sydney", "Filter by playgrounds, sports fields, fountains, and more", "Get turn-by-turn directions to any park"].map(item => (
                    <li key={item}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="pp-about-image">
                <img src="https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&q=80" alt="Children playing in a park playground" />
              </div>
            </div>
          </div>
        </section>

        <section className="pp-data-sources">
          <div className="pp-container">
            <h2>Data Sources</h2>
            <p className="pp-data-intro">Park Pulse uses open public datasets to provide accurate and up-to-date information.</p>
            <div className="pp-sources-grid">
              {dataSources.map(s => (
                <div key={s.title} className="pp-source-card">
                  <div className="pp-source-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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

        <section className="pp-tech-stack">
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

        <section className="pp-about-cta">
          <div className="pp-container">
            <h2>Ready to Explore?</h2>
            <p>Start discovering parks and playgrounds in your area today.</p>
            <Link href="/explore" className="pp-btn pp-btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              Explore Parks
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
