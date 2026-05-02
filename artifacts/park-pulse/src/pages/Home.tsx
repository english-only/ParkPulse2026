import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import type { RecentPark } from "../types/park";

function useCountUp(target: number, suffix: string, active: boolean) {
  const [val, setVal] = useState("0");
  useEffect(() => {
    if (!active) return;
    const dur = 1800;
    const start = performance.now();
    const ease = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.round(ease(p) * target).toLocaleString() + suffix);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target, suffix]);
  return val;
}

function StatCard({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const display = useCountUp(value, suffix, active);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(true); }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div className="pp-stat-card" ref={ref}>
      <span className="pp-stat-number">{display}</span>
      <span className="pp-stat-label">{label}</span>
    </div>
  );
}

const QUICK_EXPLORE = [
  { emoji: "🍖", title: "Find a BBQ Spot", desc: "National Parks BBQ & picnic facilities", filter: "npws" },
  { emoji: "🐕", title: "Dog Friendly Parks", desc: "Off-leash areas across Sydney", filter: "dogs" },
  { emoji: "🛝", title: "Playgrounds", desc: "Family-friendly play spaces for kids", filter: "playground" },
  { emoji: "📍", title: "Nearest Park", desc: "Use your location to find parks nearby", filter: "locate" },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [recent, setRecent] = useState<RecentPark[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("parkpulse_recent") || "[]";
      setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  const handleQuickExplore = (filter: string) => {
    if (filter === "locate") {
      navigate("/explore?locate=1");
    } else {
      navigate(`/explore?filter=${filter}`);
    }
  };

  return (
    <div className="pp-page">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="pp-hero">
          <div className="pp-hero-content">
            <div className="pp-hero-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/>
                <path d="M12 6v6M9 9l3-3 3 3"/>
              </svg>
              Sydney Parks Explorer
            </div>
            <h1 className="pp-hero-title">
              Discover the Best <span className="pp-highlight">Parks</span> and{" "}
              <span className="pp-highlight">Playgrounds</span> Near You
            </h1>
            <p className="pp-hero-description">
              Explore Sydney's green spaces with 2,000+ parks, dog-friendly zones, BBQ facilities,
              NPWS recreation areas and playgrounds — all in one interactive map.
            </p>
            <div className="pp-hero-buttons">
              <Link href="/explore" className="pp-btn pp-btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                Start Exploring
              </Link>
              <Link href="/about" className="pp-btn pp-btn-secondary">
                Learn More
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
          </div>
          <div className="pp-hero-image">
            <div className="pp-hero-decoration pp-hero-decoration-1" />
            <div className="pp-hero-decoration pp-hero-decoration-2" />
            <img src="https://images.unsplash.com/photo-1568393691622-c7ba131d63b4?w=800&q=80"
              alt="Green park with trees and open space" loading="eager" />
          </div>
        </section>

        {/* Quick Explore */}
        <section className="pp-quick-explore-section">
          <div className="pp-container">
            <h2 className="pp-section-title">Quick Explore</h2>
            <p className="pp-section-subtitle">Jump straight to what you're looking for</p>
            <div className="pp-quick-explore-grid">
              {QUICK_EXPLORE.map(card => (
                <button key={card.filter} className="pp-quick-explore-card"
                  onClick={() => handleQuickExplore(card.filter)}>
                  <span className="pp-quick-explore-emoji">{card.emoji}</span>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <span className="pp-quick-explore-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="pp-features">
          <div className="pp-container">
            <h2 className="pp-section-title">What You Can Find</h2>
            <div className="pp-features-grid">
              {[
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, title: "Interactive Map", desc: "Explore parks on an interactive map with colour-coded markers by park type and facilities." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>, title: "Smart Filters", desc: "Filter by playgrounds, BBQ areas, dog parks, NPWS facilities, drinking fountains and more." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>, title: "Family Friendly", desc: "Find playgrounds perfect for children, with off-leash dog areas and picnic spots nearby." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>, title: "5 Themes", desc: "Switch between Modern Green, Night Mode, Sunset, Neon and Minimal themes — persisted to your device." },
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

        {/* Stats */}
        <section className="pp-stats">
          <div className="pp-container">
            <div className="pp-stats-grid">
              <StatCard value={2000} suffix="+" label="Parks & Green Spaces" />
              <StatCard value={1795} suffix="" label="NPWS Facilities" />
              <StatCard value={29} suffix="" label="Dog Off-Leash Areas" />
              <StatCard value={30} suffix="+" label="Suburbs Covered" />
            </div>
          </div>
        </section>

        {/* Recently Viewed */}
        {recent.length > 0 && (
          <section className="pp-recent-section">
            <div className="pp-container">
              <h2 className="pp-section-title">Recently Viewed</h2>
              <div className="pp-recent-grid">
                {recent.map(park => (
                  <Link key={park.id} href="/explore" className="pp-recent-card">
                    <span className={`pp-park-type-badge ${park.type.toLowerCase().replace(/\s+/g, "-")}`}>{park.type}</span>
                    <h4>{park.name}</h4>
                    {park.suburb && <p>{park.suburb}</p>}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="pp-cta">
          <div className="pp-container">
            <div className="pp-cta-content">
              <h2>Ready to Find Your Perfect Park?</h2>
              <p>Use our interactive explorer with 5 themes and 12 filter layers to discover parks with exactly the facilities you need.</p>
              <Link href="/explore" className="pp-btn pp-btn-secondary">
                Open Explorer
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
