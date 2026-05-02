import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import type { RecentPark } from "../types/park";

function useCounterAnimation(target: number, suffix: string, active: boolean) {
  const [display, setDisplay] = useState("0" + suffix);
  useEffect(() => {
    if (!active) return;
    const duration = 1800;
    const start = performance.now();
    function ease(t: number) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(ease(progress) * target).toLocaleString() + suffix);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [active, target, suffix]);
  return display;
}

function StatCard({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const display = useCounterAnimation(value, suffix, active);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setActive(true); }, { threshold: 0.5 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    <div className="pp-stat-card" ref={ref}>
      <span className="pp-stat-number">{display}</span>
      <span className="pp-stat-label">{label}</span>
    </div>
  );
}

const QUICK_CARDS = [
  { emoji: "🍖", title: "Find a BBQ Spot", desc: "NPWS BBQ facilities & picnic areas", href: "/explore?filter=npws" },
  { emoji: "🐕", title: "Dog Friendly Parks", desc: "Off-leash areas across Sydney", href: "/explore?filter=dogs" },
  { emoji: "🛝", title: "Find a Playground", desc: "Family-friendly play areas", href: "/explore?filter=playground" },
  { emoji: "📍", title: "Near Me", desc: "Parks closest to your location", href: "/explore?locate=1" },
];

export default function Home() {
  const [recentParks, setRecentParks] = useState<RecentPark[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("parkpulse_recent");
      if (raw) setRecentParks(JSON.parse(raw));
    } catch {}
  }, []);

  return (
    <div className="pp-page">
      <Navbar />
      <main>
        <section className="pp-hero">
          <div className="pp-hero-content">
            <div className="pp-hero-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><path d="M12 6v6M9 9l3-3 3 3"/></svg>
              Sydney Parks Explorer
            </div>
            <h1 className="pp-hero-title">
              Discover the Best <span className="pp-highlight">Parks</span> and{" "}
              <span className="pp-highlight">Playgrounds</span> Near You
            </h1>
            <p className="pp-hero-description">
              Explore Sydney's green spaces, find family-friendly playgrounds, discover off-leash dog
              parks, and uncover National Parks facilities. Plan your perfect outdoor adventure.
            </p>
            <div className="pp-hero-buttons">
              <Link href="/explore" className="pp-btn pp-btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                Start Exploring
              </Link>
              <Link href="/about" className="pp-btn pp-btn-secondary">
                Learn More
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </div>
          <div className="pp-hero-image">
            <div className="pp-hero-decoration pp-hero-decoration-1" />
            <div className="pp-hero-decoration pp-hero-decoration-2" />
            <img src="https://images.unsplash.com/photo-1568393691622-c7ba131d63b4?w=800&q=80" alt="Beautiful Sydney park" loading="eager" />
          </div>
        </section>

        <section className="pp-quick-explore">
          <div className="pp-container">
            <h2 className="pp-section-title">Quick Explore</h2>
            <p className="pp-section-subtitle">Jump straight to what you need — one click to filtered results</p>
            <div className="pp-quick-grid">
              {QUICK_CARDS.map(card => (
                <Link key={card.title} href={card.href} className="pp-quick-card">
                  <span className="pp-quick-emoji">{card.emoji}</span>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <span className="pp-quick-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {recentParks.length > 0 && (
          <section className="pp-recent">
            <div className="pp-container">
              <h2 className="pp-section-title" style={{ textAlign: "left" }}>Recently Viewed</h2>
              <div className="pp-recent-grid">
                {recentParks.map(park => (
                  <Link key={park.id} href="/explore" className="pp-recent-card">
                    <div className="pp-recent-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div>
                      <p className="pp-recent-name">{park.name}</p>
                      <p className="pp-recent-meta">{park.type}{park.suburb ? ` · ${park.suburb}` : ""}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="pp-features">
          <div className="pp-container">
            <h2 className="pp-section-title">What You Can Find</h2>
            <div className="pp-features-grid">
              {[
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, title: "Interactive Map", desc: "Explore parks on an interactive map with color-coded markers. Click to see details and get directions." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>, title: "Smart Filters", desc: "Filter by playgrounds, sports courts, dog parks, NPWS facilities, drinking fountains, toilets, and more." },
                { icon: <span style={{ fontSize: 24 }}>🐕</span>, title: "Dog Parks", desc: "Find off-leash dog areas with hours, restrictions, and descriptions from the City of Sydney." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, title: "NPWS Facilities", desc: "1,795 National Parks & Wildlife Service facilities — BBQs, shelters, picnic tables, and more." },
              ].map(f => (
                <div key={f.title} className="pp-feature-card">
                  <div className="pp-feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pp-stats">
          <div className="pp-container">
            <div className="pp-stats-grid">
              <StatCard value={2000} suffix="+" label="Parks & Green Spaces" />
              <StatCard value={29} suffix="" label="Off-Leash Dog Parks" />
              <StatCard value={1795} suffix="" label="NPWS Facilities" />
              <StatCard value={30} suffix="+" label="Suburbs Covered" />
            </div>
          </div>
        </section>

        <section className="pp-cta">
          <div className="pp-container">
            <div className="pp-cta-content">
              <h2>Ready to Find Your Perfect Park?</h2>
              <p>Use our interactive explorer to discover parks with exactly the facilities you need.</p>
              <Link href="/explore" className="pp-btn pp-btn-secondary">
                Open Explorer
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
