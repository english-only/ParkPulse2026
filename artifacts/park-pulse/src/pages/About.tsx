import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function About() {
  return (
    <div className="pp-page">
      <Navbar />
      <main className="pp-about-main">
        <section className="pp-about-hero">
          <div className="pp-container">
            <h1>About Park Pulse</h1>
            <p className="pp-about-subtitle">Connecting communities with their local parks and green spaces</p>
          </div>
        </section>

        <section className="pp-about-content">
          <div className="pp-container">
            <div className="pp-about-grid">
              <div className="pp-about-text">
                <h2>Our Mission</h2>
                <p>
                  Park Pulse was created to help Sydney residents and visitors discover the incredible
                  variety of parks, playgrounds, and recreational facilities available throughout the
                  city. We believe that everyone should have easy access to information about their
                  local green spaces.
                </p>
                <p>
                  Our platform makes it simple to find parks that match your specific needs — whether
                  you're looking for a playground for your children, a sports facility for your weekend
                  game, or a quiet pocket park for some peaceful time outdoors.
                </p>

                <h2>How It Works</h2>
                <p>
                  Park Pulse aggregates open data from government sources and presents it in an
                  easy-to-use, interactive format. Our map-based explorer allows you to:
                </p>
                <ul className="pp-feature-list">
                  {[
                    "View all parks and playgrounds on an interactive map",
                    "Filter by park type and available facilities",
                    "Search for specific parks or browse by suburb",
                    "Get directions to any park with one click",
                  ].map((item) => (
                    <li key={item}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pp-about-image">
                <img
                  src="https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&q=80"
                  alt="Children playing in a park playground"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="pp-data-sources">
          <div className="pp-container">
            <h2>Data Sources</h2>
            <p className="pp-data-intro">
              Park Pulse uses open public datasets to provide accurate and up-to-date information
              about parks and recreational facilities.
            </p>
            <div className="pp-sources-grid">
              {[
                {
                  title: "City of Sydney Parks",
                  desc: "Comprehensive dataset of over 400 parks including location boundaries, park types, and playground information.",
                  href: "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::parks-1",
                  badge: "GeoJSON",
                },
                {
                  title: "Playgrounds",
                  desc: "Locations of playgrounds and fitness stations managed by the City of Sydney.",
                  href: "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::playgrounds",
                  badge: "JSON",
                },
                {
                  title: "Sports & Recreation",
                  desc: "Information about sports courts, fitness stations, swimming facilities, and other recreational amenities.",
                  href: "https://data.cityofsydney.nsw.gov.au/datasets/cityofsydney::sports-and-recreation-facilities-1",
                  badge: "JSON",
                },
                {
                  title: "Drinking Fountains",
                  desc: "Locations of public drinking fountains and water stations throughout Sydney.",
                  href: "https://data.cityofsydney.nsw.gov.au/",
                  badge: "GeoJSON",
                },
                {
                  title: "NSW Open Data Portal",
                  desc: "Additional playground and park data from the NSW Government open data portal.",
                  href: "https://data.nsw.gov.au/",
                  badge: "JSON",
                },
              ].map((s) => (
                <div key={s.title} className="pp-source-card">
                  <div className="pp-source-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="pp-source-link">
                    View Dataset
                  </a>
                  <span className="pp-source-badge">{s.badge}</span>
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
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
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
