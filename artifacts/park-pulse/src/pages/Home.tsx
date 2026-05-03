import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import type { RecentPark } from "../types/park";

const FEATURED_PARKS = [
  { name: "Centennial Park",              suburb: "Centennial Park", type: "Iconic",        emoji: "⭐" },
  { name: "Hyde Park",                    suburb: "Sydney",          type: "Iconic",        emoji: "⭐" },
  { name: "Rushcutters Bay Park",         suburb: "Rushcutters Bay", type: "Neighbourhood", emoji: "🌿" },
  { name: "Moore Park",                   suburb: "Moore Park",      type: "Sportsfield",   emoji: "⚽" },
  { name: "Bicentennial Park",            suburb: "Homebush Bay",    type: "Iconic",        emoji: "🏞" },
  { name: "Jubilee Park",                 suburb: "Glebe",           type: "Neighbourhood", emoji: "🌿" },
  { name: "Prince Alfred Park",           suburb: "Surry Hills",     type: "Iconic",        emoji: "⭐" },
  { name: "Victoria Park",               suburb: "Camperdown",      type: "Iconic",        emoji: "⭐" },
  { name: "Pirrama Park",                 suburb: "Pyrmont",         type: "Iconic",        emoji: "🌊" },
  { name: "Harmony Park",                 suburb: "Darlington",      type: "Pocket",        emoji: "🌿" },
  { name: "Gunyama Park",                 suburb: "Alexandria",      type: "Neighbourhood", emoji: "🏊" },
  { name: "Wentworth Park",               suburb: "Glebe",           type: "Sportsfield",   emoji: "⚽" },
  { name: "Camperdown Memorial Rest Park",suburb: "Newtown",         type: "Iconic",        emoji: "⭐" },
  { name: "Talmadge Park",                suburb: "Ultimo",          type: "Pocket",        emoji: "🌿" },
  { name: "Sydney Park",                  suburb: "St Peters",       type: "Iconic",        emoji: "🏞" },
  { name: "Redfern Park",                 suburb: "Redfern",         type: "Neighbourhood", emoji: "🌿" },
  { name: "Blackwattle Bay Park",         suburb: "Glebe",           type: "Neighbourhood", emoji: "🌊" },
  { name: "Enmore Park",                  suburb: "Marrickville",    type: "Neighbourhood", emoji: "🎶" },
  { name: "Alexandria Park",              suburb: "Alexandria",      type: "Neighbourhood", emoji: "🚂" },
  { name: "The Domain",                   suburb: "Sydney",          type: "Iconic",        emoji: "🎵" },
  { name: "Harold Park",                  suburb: "Glebe",           type: "Neighbourhood", emoji: "🏇" },
  { name: "Erskineville Oval",            suburb: "Erskineville",    type: "Sportsfield",   emoji: "🏏" },
  { name: "Sydney Olympic Park",          suburb: "Homebush Bay",    type: "Iconic",        emoji: "🏅" },
  { name: "Callan Park",                  suburb: "Rozelle",         type: "Iconic",        emoji: "🌳" },
  { name: "Tempe Reserve",                suburb: "Tempe",           type: "Neighbourhood", emoji: "🛶" },
  { name: "Glebe Foreshore Walk",         suburb: "Glebe",           type: "Neighbourhood", emoji: "🌊" },
  { name: "Cooper Park",                  suburb: "Bellevue Hill",   type: "Neighbourhood", emoji: "🌳" },
  { name: "Nielsen Park",                 suburb: "Vaucluse",        type: "Iconic",        emoji: "🏖" },
  { name: "Waverley Park",                suburb: "Waverley",        type: "Sportsfield",   emoji: "🏏" },
  { name: "Waterloo Park",                suburb: "Waterloo",        type: "Neighbourhood", emoji: "🌿" },
];

function getTodayFeatured() {
  const day = Math.floor(Date.now() / 86400000);
  return FEATURED_PARKS[day % FEATURED_PARKS.length];
}

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

const FACTS = [
  "Centennial Park spans 189 hectares — one of Sydney's largest urban parks, opened in 1888.",
  "Sydney has over 29 off-leash dog areas managed by the City of Sydney.",
  "The Royal Botanic Garden in Sydney is Australia's first botanic garden, established in 1816.",
  "Hyde Park is one of Sydney's oldest public parks, gazetted in 1810 by Governor Macquarie.",
  "Sydney has more than 1,795 NPWS-maintained facilities including BBQs, shelters, and picnic areas.",
  "Pocket parks — tiny green spaces under 0.1 ha — make up nearly 40% of Sydney's park count.",
  "Bicentennial Park at Homebush Bay was created on reclaimed wetlands for the 2000 Olympics.",
  "Gunyama Park in Alexandria features a 50-metre outdoor pool and aquatic centre.",
  "Victoria Park in Camperdown covers 9.1 ha and is one of Sydney's most-loved heritage parks.",
  "Sydney's Green Square urban renewal area added Gunyama Park as a major new park in 2019.",
  "The City of Sydney maintains over 400 parks — from tiny pocket parks to large regional reserves.",
  "Rushcutters Bay Park has some of the oldest Moreton Bay Fig trees in Sydney, planted in the 1870s.",
  "Camperdown Memorial Rest Park is famous for its weeping trees and old sandstone church ruins.",
  "Sydney's harbour parks span 240 km of foreshore — one of the world's great urban waterfront landscapes.",
  "Prince Alfred Park in Surry Hills was redesigned in 2013, adding Sydney's first heated outdoor 50m pool.",
  "Moore Park's sporting precinct covers over 57 ha and hosts the SCG, Allianz Stadium, and golf course.",
  "Sydney Park in St Peters sits on a former brick works site and brickfields — now an ecological wetland.",
  "Pirrama Park at Pyrmont opened in 2011 on the former Jones Bay Wharf site on Sydney Harbour.",
  "Wentworth Park in Glebe dates back to 1881 and has hosted greyhound racing since the 1930s.",
  "The Domain in Sydney covers 37 ha and hosts free concerts, Carols by Candlelight, and Sydney Festival.",
  "Blackwattle Bay Park near Glebe sits at the head of the creek that powered early colonial mills.",
  "Enmore Park in Marrickville has a historic rotunda built in 1926, still used for community events.",
  "Alexandria Park in Alexandria features a model railway that has been running since the 1950s.",
  "Redfern Park was the site of Paul Keating's landmark 1992 speech acknowledging Aboriginal history.",
  "Harold Park in Glebe was once Sydney's premier harness-racing venue, operating from 1905 to 2010.",
  "Jubilee Park in Glebe was named to celebrate Queen Victoria's Golden Jubilee in 1887.",
  "Erskineville Oval is one of Sydney's oldest cricket grounds, hosting local competitions since the 1890s.",
  "Reconciliation Place in Alexandria links Redfern and Green Square as part of the urban renewal corridor.",
  "Sydney's parks contain over 700 species of trees, including many heritage-listed specimens.",
  "Gardeners Road Reserve in Rosebery follows the alignment of a former creek channelled underground in 1928.",
  "Nielsen Park in Vaucluse is a popular harbourside beach park known for its shark net and historic picnic grounds.",
  "Cooper Park in Bellevue Hill features natural bushland, a heritage rose garden, and tennis courts.",
  "Glebe Foreshore Walk spans nearly 3 km along the waterfront from Blackwattle Bay to Bicentennial Park.",
  "Waverley Park is one of Sydney's oldest cricket ovals, with the Waverley Club forming in 1869.",
  "Waterloo Park in Waterloo was redesigned as part of the Green Square urban transformation in 2015.",
];

function DidYouKnow() {
  const [idx, setIdx] = useState(() => Math.floor(Date.now() / 86400000) % FACTS.length);
  const [fading, setFading] = useState(false);
  function rotate() {
    setFading(true);
    setTimeout(() => { setIdx(i => (i + 1) % FACTS.length); setFading(false); }, 300);
  }
  return (
    <div className="pp-dyk">
      <span className="pp-dyk-badge">Did you know?</span>
      <p className={`pp-dyk-fact${fading ? " fading" : ""}`}>{FACTS[idx]}</p>
      <button className="pp-dyk-next" onClick={rotate} title="Next fact">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  );
}

function StatCard({ value, label, suffix = "", icon }: { value: number; label: string; suffix?: string; icon?: string }) {
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
      {icon && <span className="pp-stat-icon">{icon}</span>}
      <span className="pp-stat-number">{display}</span>
      <span className="pp-stat-label">{label}</span>
    </div>
  );
}

function getHoursUntilNextPick(): number {
  const now = new Date();
  const msSinceMidnight = now.getTime() % 86400000;
  return Math.round((86400000 - msSinceMidnight) / 3600000);
}

const QUICK_CARDS = [
  { emoji: "🛝", title: "Find a Playground",  desc: "Family-friendly play areas across Sydney",       href: "/explore?filter=playground" },
  { emoji: "🐕", title: "Dog Friendly Parks", desc: "Off-leash areas with hours and restrictions",     href: "/explore?filter=dogs" },
  { emoji: "⭐", title: "Iconic Parks",        desc: "Sydney's most celebrated green spaces",           href: "/explore?filter=iconic" },
  { emoji: "🌿", title: "Pocket Parks",        desc: "Hidden little gems scattered around the city",   href: "/explore?filter=pocket" },
  { emoji: "🏞", title: "Largest Parks",       desc: "Sydney's biggest green spaces sorted by area",   href: "/explore?sort=size" },
  { emoji: "📍", title: "Near Me",             desc: "Parks closest to your current location",         href: "/explore?locate=1" },
  { emoji: "⚽", title: "Sports Parks",        desc: "Sportsfields and courts for active recreation",   href: "/explore?filter=sportsfield" },
  { emoji: "🌲", title: "Neighbourhood Parks", desc: "Community parks in residential suburbs",          href: "/explore?filter=neighbourhood" },
  { emoji: "🎲", title: "Surprise Me",         desc: "Let the app pick a random park for you",          href: "/explore?surprise=1" },
  { emoji: "🗺",  title: "Map Themes",          desc: "Switch between 6 map styles including satellite", href: "/explore?theme=satellite" },
];

export default function Home() {
  const [recentParks, setRecentParks] = useState<RecentPark[]>([]);
  const featured = getTodayFeatured();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("parkpulse_recent");
      if (raw) setRecentParks(JSON.parse(raw));
    } catch {}
  }, []);

  function clearHistory() {
    localStorage.removeItem("parkpulse_recent");
    setRecentParks([]);
  }

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
            <div className="pp-hero-trust">
              {[
                { icon: "🗺️", text: "2,000+ parks" },
                { icon: "🔓", text: "Free & open" },
                { icon: "📡", text: "Live open data" },
                { icon: "📱", text: "No sign-up" },
              ].map(({ icon, text }) => (
                <span key={text} className="pp-hero-trust-badge">
                  <span>{icon}</span>{text}
                </span>
              ))}
            </div>
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

        <section className="pp-featured-day">
          <div className="pp-container">
            <div className="pp-featured-day-card">
              <div className="pp-featured-day-header">
                <div className="pp-featured-day-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Park of the Day
                </div>
                <span className="pp-featured-day-countdown" title="Changes at midnight">
                  ⏱ {getHoursUntilNextPick()}h until next pick
                </span>
              </div>
              <div className="pp-featured-day-content">
                <span className="pp-featured-day-emoji">{featured.emoji}</span>
                <div className="pp-featured-day-info">
                  <h3 className="pp-featured-day-name">{featured.name}</h3>
                  <p className="pp-featured-day-meta">{featured.type} · {featured.suburb}</p>
                </div>
                <Link href={`/explore?park=${encodeURIComponent(featured.name)}`} className="pp-btn pp-btn-primary pp-btn-small">
                  Explore
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {recentParks.length > 0 && (
          <section className="pp-recent">
            <div className="pp-container">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
                <h2 className="pp-section-title" style={{ marginBottom: 0 }}>Recently Viewed</h2>
                <button
                  className="pp-btn pp-btn-ghost pp-btn-small"
                  onClick={clearHistory}
                  style={{ fontSize: ".75rem", color: "var(--pp-text-muted)" }}
                >
                  Clear history
                </button>
              </div>
              <div className="pp-recent-grid">
                {recentParks.map(park => (
                  <Link key={park.id} href={`/explore?park=${encodeURIComponent(park.name)}`} className="pp-recent-card">
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
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, title: "Interactive Map", desc: "Explore parks on a live interactive map with color-coded markers. Click any pin to see details and get directions." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>, title: "Smart Filters", desc: "Filter by playgrounds, sports courts, dog parks, NPWS facilities, drinking fountains, toilets, and more." },
                { icon: <span style={{ fontSize: 24 }}>🐕</span>, title: "Dog Parks", desc: "Find off-leash dog areas with hours, restrictions, and descriptions from the City of Sydney." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, title: "NPWS Facilities", desc: "1,795 National Parks & Wildlife Service facilities — BBQs, shelters, picnic tables, and more." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/></svg>, title: "Near Me", desc: "Instantly sort parks by distance from your current location to find what's closest." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>, title: "Size Sorting", desc: "Sort parks by area to find Sydney's largest green spaces, from pocket parks to massive reserves." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, title: "Save Favourites", desc: "Heart any park to add it to your personal saved list. Your picks are remembered between sessions." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>, title: "Instant Search", desc: "Fuzzy search across 2,000+ parks — by name, suburb, or type — with real-time results and smart autocomplete." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="4" r="2"/><path d="M9 9l3 1.5L15 9"/><path d="M7 13l2-4h6l2 4"/><path d="M9 20l1-4h4l1 4"/></svg>, title: "Walking Directions", desc: "Get walking or driving directions to any park via Google Maps, with estimated walk time shown upfront." },
                { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/><path d="M9 6l6 6-6 6" transform="translate(6,0)"/></svg>, title: "Park Navigation", desc: "Use Prev/Next buttons or N/P keys to browse through parks without closing the detail panel." },
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

        <section className="pp-did-you-know">
          <div className="pp-container">
            <DidYouKnow />
          </div>
        </section>

        <section className="pp-stats">
          <div className="pp-container">
            <div className="pp-stats-grid">
              <StatCard value={2023} suffix="+" label="Parks & Green Spaces" icon="🌳" />
              <StatCard value={29} suffix="" label="Off-Leash Dog Parks" icon="🐕" />
              <StatCard value={1795} suffix="" label="NPWS Facilities" icon="🍖" />
              <StatCard value={418} suffix="" label="Parks in City of Sydney" icon="🗺️" />
              <StatCard value={6} suffix="" label="Map Themes" icon="🎨" />
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
