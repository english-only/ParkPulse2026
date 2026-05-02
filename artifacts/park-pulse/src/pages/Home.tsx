import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

function useCounterAnimation(target: number, suffix: string, active: boolean) {
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    if (!active) return;
    const duration = 1800;
    const start = performance.now();
    function easeOutExpo(t: number) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(easeOutExpo(progress) * target);
      setDisplay(value.toLocaleString() + suffix);
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
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setActive(true); },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pp-stat-card" ref={ref}>
      <span className="pp-stat-number">{display}</span>
      <span className="pp-stat-label">{label}</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="pp-page">
      <Navbar />
      <main>
        <section className="pp-hero">
          <div className="pp-hero-content">
            <div className="pp-hero-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
                <path d="M12 6v6M9 9l3-3 3 3" />
              </svg>
              Sydney Parks Explorer
            </div>
            <h1 className="pp-hero-title">
              Discover the Best <span className="pp-highlight">Parks</span> and{" "}
              <span className="pp-highlight">Playgrounds</span> Near You
            </h1>
            <p className="pp-hero-description">
              Explore Sydney's green spaces, find family-friendly playgrounds, and discover
              recreational facilities. Plan your perfect outdoor adventure today.
            </p>
            <div className="pp-hero-buttons">
              <Link href="/explore" className="pp-btn pp-btn-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Start Exploring
              </Link>
              <Link href="/about" className="pp-btn pp-btn-secondary">
                Learn More
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
          <div className="pp-hero-image">
            <div className="pp-hero-decoration pp-hero-decoration-1" />
            <div className="pp-hero-decoration pp-hero-decoration-2" />
            <img
              src="https://images.unsplash.com/photo-1568393691622-c7ba131d63b4?w=800&q=80"
              alt="Beautiful park with green trees and open space"
              loading="eager"
            />
          </div>
        </section>

        <section className="pp-features">
          <div className="pp-container">
            <h2 className="pp-section-title">What You Can Find</h2>
            <div className="pp-features-grid">
              {[
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  ),
                  title: "Interactive Map",
                  desc: "Explore parks and playgrounds on an interactive map. Click markers to see details and find exactly what you're looking for.",
                },
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  ),
                  title: "Smart Filters",
                  desc: "Filter parks by facilities like playgrounds, sports courts, drinking fountains, and more. Find the perfect spot for your needs.",
                },
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" />
                      <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                  ),
                  title: "Family Friendly",
                  desc: "Discover playgrounds perfect for children of all ages. Check available equipment and plan safe outdoor fun.",
                },
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                      <line x1="6" y1="1" x2="6" y2="4" />
                      <line x1="10" y1="1" x2="10" y2="4" />
                      <line x1="14" y1="1" x2="14" y2="4" />
                    </svg>
                  ),
                  title: "Recreation Options",
                  desc: "Find sports facilities, fitness stations, and recreational areas. Stay active in Sydney's outdoor spaces.",
                },
              ].map((f) => (
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
              <StatCard value={700} suffix="+" label="Playgrounds" />
              <StatCard value={3400} suffix="+" label="Facilities & Amenities" />
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
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
