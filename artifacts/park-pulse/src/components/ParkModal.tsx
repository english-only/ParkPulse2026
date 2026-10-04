import { useEffect } from "react";
import type { Park } from "../types/park";
import { useToast } from "../context/ToastContext";

interface NearbyFacility {
  name: string;
  subtype: string;
  distKm: number;
}

interface ParkModalProps {
  park: Park | null;
  onClose: () => void;
  nearbyNPWS?: NearbyFacility[];
  nearbyDogPark?: string | null;
  isFavorite?: boolean;
  onToggleFavorite?: (id: number, e: React.MouseEvent) => void;
  onSuburbSearch?: (suburb: string) => void;
  onTypeFilter?: (type: string) => void;
  onFindNearby?: (lat: number, lng: number, name: string) => void;
  userLocation?: { lat: number; lng: number } | null;
  onNext?: (() => void) | null;
  onPrev?: (() => void) | null;
  parkIndex?: number;
  totalParks?: number;
}

function formatArea(area: number): string {
  if (area >= 10000) return `${(area / 10000).toFixed(1)} ha`;
  return `${area >= 1000 ? area.toLocaleString() : Math.round(area)} m²`;
}

function sizeLabel(area: number): string {
  if (area < 1000)  return "Tiny";
  if (area < 5000)  return "Small";
  if (area < 10000) return "Medium";
  if (area < 50000) return "Large";
  return "Massive";
}

function npwsIcon(subtype: string): string {
  if (subtype.includes("BBQ") || subtype.includes("Fire")) return "🔥";
  if (subtype.includes("Picnic")) return "🧺";
  if (subtype.includes("Shelter")) return "⛺";
  if (subtype.includes("Playground")) return "🛝";
  if (subtype.includes("Seat")) return "🪑";
  if (subtype.includes("Toilet")) return "🚻";
  if (subtype.includes("Parking")) return "🅿️";
  return "📍";
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ParkModal({ park, onClose, nearbyNPWS, nearbyDogPark, isFavorite, onToggleFavorite, onSuburbSearch, onTypeFilter, onFindNearby, userLocation, onNext, onPrev, parkIndex, totalParks }: ParkModalProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!park) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft"  && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", handler);

    try {
      const raw = localStorage.getItem("parkpulse_recent") || "[]";
      const recent = JSON.parse(raw).filter((r: any) => r.id !== park.id);
      recent.unshift({ id: park.id, name: park.name, type: park.type, suburb: park.suburb });
      localStorage.setItem("parkpulse_recent", JSON.stringify(recent.slice(0, 5)));
    } catch {}

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [park, onClose]);

  if (!park) return null;

  const facilities: { name: string; icon: React.ReactNode }[] = [];
  if (park.hasPlayground) {
    facilities.push({
      name: "Playground",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
    });
  }
  if (park.type === "Sportsfield" || park.type === "Sports") {
    facilities.push({
      name: "Sports Field",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg>,
    });
  }
  if (park.type === "Iconic") {
    facilities.push({
      name: "Iconic Landmark",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    });
  }
  if (facilities.length === 0) {
    facilities.push({
      name: "Open green space",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/></svg>,
    });
  }

  const typeClass = park.type.toLowerCase().replace(/\s+/g, "-");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}&travelmode=driving`;
  const walkDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}&travelmode=walking`;
  const distKm = userLocation ? haversineKm(userLocation.lat, userLocation.lng, park.lat, park.lng) : null;
  const walkMin = distKm !== null ? Math.max(1, Math.round(distKm / 0.083)) : null;

  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg, "success");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text; document.body.appendChild(el);
        el.select(); document.execCommand("copy");
        document.body.removeChild(el);
        toast(successMsg, "success");
      } catch {
        toast("Could not copy to clipboard.", "error");
      }
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}${window.location.pathname}?park=${encodeURIComponent(park.name)}`;
    copyToClipboard(url, "Link copied to clipboard!");
  };

  const handleCopyCoords = () => {
    copyToClipboard(`${park.lat.toFixed(6)}, ${park.lng.toFixed(6)}`, "Coordinates copied!");
  };

  const visibleNPWS = nearbyNPWS?.slice(0, 7) ?? [];

  return (
    <div className="pp-modal active" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="pp-modal-overlay" onClick={onClose} />
      <div className="pp-modal-content">
        <button className="pp-modal-close" aria-label="Close modal" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {(onPrev || onNext) && (
          <div className="pp-modal-nav">
            <button
              className="pp-modal-nav-btn"
              onClick={onPrev ?? undefined}
              disabled={!onPrev}
              aria-label="Previous park"
              title="Previous park (←)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                <path d="M15 18l-6-6 6-6"/>
              </svg>
              Prev
            </button>
            {parkIndex != null && totalParks != null && (
              <span className="pp-modal-nav-pos">{parkIndex + 1} / {totalParks}</span>
            )}
            <button
              className="pp-modal-nav-btn"
              onClick={onNext ?? undefined}
              disabled={!onNext}
              aria-label="Next park"
              title="Next park (→)"
            >
              Next
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        )}

        <div className="pp-modal-header">
          <h2 id="modal-title">{park.name}</h2>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".375rem" }}>
            {onTypeFilter ? (
              <button
                className={`pp-park-type-badge pp-type-badge-btn ${typeClass}`}
                onClick={() => { onTypeFilter(park.type); onClose(); }}
                title={`Filter to ${park.type} parks`}
              >
                {park.type}
              </button>
            ) : (
              <span className={`pp-park-type-badge ${typeClass}`}>{park.type}</span>
            )}
            {park.suburb && (
              onSuburbSearch ? (
                <button
                  className="pp-park-suburb-pill pp-suburb-clickable"
                  style={{ padding: "2px 8px", fontSize: ".72rem", fontWeight: 500 }}
                  onClick={() => { onSuburbSearch(park.suburb); onClose(); }}
                  title={`Find parks in ${park.suburb}`}
                >
                  📍 {park.suburb}
                </button>
              ) : (
                <span className="pp-park-suburb-pill" style={{ padding: "2px 8px", background: "var(--pp-bg-alt)", color: "var(--pp-text-secondary)", borderRadius: "var(--pp-radius-full)", fontSize: ".72rem", fontWeight: 500 }}>
                  📍 {park.suburb}
                </span>
              )
            )}
          </div>
        </div>

        <div className="pp-modal-body">
          <div className="pp-modal-info">
            <div className="pp-info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span>{park.suburb ? `${park.suburb}, NSW` : "Sydney, NSW"}</span>
            </div>
            {park.area && (
              <div className="pp-info-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".35rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, flexShrink: 0 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                  </svg>
                  <span>{formatArea(park.area)} <span style={{ fontSize: ".72rem", fontWeight: 600, marginLeft: ".25rem", padding: "1px 5px", borderRadius: 3, background: "var(--pp-green-100)", color: "var(--pp-text-secondary)" }}>{sizeLabel(park.area)}</span></span>
                </div>
                <div style={{ width: "100%", paddingLeft: "1.4rem" }}>
                  <div style={{ background: "var(--pp-border-light)", borderRadius: 99, height: 5, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 99,
                      background: "var(--pp-primary)",
                      width: `${Math.min(100, Math.round((park.area / 390000) * 100))}%`,
                      minWidth: 4,
                      transition: "width .4s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: ".65rem", color: "var(--pp-text-muted)", marginTop: 2, display: "block" }}>
                    {Math.min(100, Math.round((park.area / 390000) * 100))}% of Sydney's largest ·{" "}
                    {park.area < 2856
                      ? `≈${Math.max(1, Math.round(park.area / 714))} tennis court${Math.max(1, Math.round(park.area / 714)) !== 1 ? "s" : ""}`
                      : park.area < 142800
                        ? `≈${Math.round(park.area / 7140)} football field${Math.round(park.area / 7140) !== 1 ? "s" : ""}`
                        : `≈${(park.area / 10000).toFixed(1)} ha (${Math.round(park.area / 7140)} football fields)`}
                  </span>
                </div>
              </div>
            )}
            {distKm !== null && (
              <div className="pp-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span>
                  {distKm < 1 ? `${Math.round(distKm * 1000)} m away` : `${distKm.toFixed(1)} km away`}
                  {walkMin !== null && walkMin <= 45 && (
                    <span style={{ color: "var(--pp-text-muted)", marginLeft: ".375rem" }}>
                      · ~{walkMin} min walk
                    </span>
                  )}
                </span>
              </div>
            )}
            <div
              className="pp-info-row pp-coords-row"
              onClick={() => {
                const text = `${park.lat.toFixed(6)}, ${park.lng.toFixed(6)}`;
                navigator.clipboard.writeText(text).catch(() => {});
                toast("Coordinates copied!", "success");
              }}
              title="Click to copy coordinates"
              style={{ cursor: "pointer" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--pp-text-muted)" }}>
                {park.lat.toFixed(5)}, {park.lng.toFixed(5)}
              </span>
              <span className="pp-copy-hint">copy</span>
            </div>
          </div>

          <div className="pp-modal-facilities">
            <h4>Features</h4>
            <div className="pp-facilities-list">
              {facilities.map(f => (
                <span key={f.name} className="pp-facility-badge">
                  {f.icon}{f.name}
                </span>
              ))}
              {nearbyDogPark && (
                <span className="pp-facility-badge" style={{ background: "#f0fdf4", color: "#166534", borderColor: "#86efac" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <circle cx="7.5" cy="6.5" r="2"/><circle cx="16.5" cy="6.5" r="2"/>
                    <path d="M12 22c-4.5 0-7.5-2.5-7.5-6 0-2.5 2-4 5-4h5c3 0 5 1.5 5 4 0 3.5-3 6-7.5 6z"/>
                  </svg>
                  Near dog park
                </span>
              )}
            </div>
          </div>

          {visibleNPWS.length > 0 && (
            <div className="pp-modal-nearby" style={{ marginTop: "1.25rem" }}>
              <h4 style={{ fontSize: ".9rem", fontWeight: 600, marginBottom: ".625rem", display: "flex", alignItems: "center", gap: ".375rem" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, color: "var(--pp-primary)" }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Nearby Facilities
              </h4>
              <div className="pp-nearby-list">
                {visibleNPWS.map((f, i) => (
                  <div key={i} className="pp-nearby-item">
                    <span className="pp-nearby-icon">{npwsIcon(f.subtype)}</span>
                    <div className="pp-nearby-info">
                      <span className="pp-nearby-name">{f.name}</span>
                      <span className="pp-nearby-meta">{f.subtype} · {f.distKm < 1 ? `${Math.round(f.distKm * 1000)}m` : `${f.distKm.toFixed(1)}km`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pp-modal-footer">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-primary" title="Get driving directions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Drive
          </a>
          <a href={walkDirectionsUrl} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-secondary" title={walkMin ? `~${walkMin} min walk` : "Get walking directions"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="4" r="2"/>
              <path d="M9 9l3 1.5L15 9"/>
              <path d="M7 13l2-4h6l2 4"/>
              <path d="M9 20l1-4h4l1 4"/>
            </svg>
            Walk{walkMin !== null && walkMin <= 60 ? ` · ~${walkMin} min` : ""}
          </a>
          <button className="pp-btn pp-btn-secondary" onClick={handleShare} title="Copy share link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
          {onFindNearby && (
            <button
              className="pp-btn pp-btn-secondary"
              onClick={() => { onFindNearby(park.lat, park.lng, park.name); onClose(); }}
              title="Find parks within 1 km of here"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
              </svg>
              Nearby
            </button>
          )}
          {onToggleFavorite && (
            <button
              className={`pp-btn pp-btn-secondary pp-modal-fav-btn${isFavorite ? " active" : ""}`}
              onClick={e => onToggleFavorite(park.id, e)}
              aria-label={isFavorite ? "Remove from saved" : "Save park"}
            >
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>{isFavorite ? "♥" : "♡"}</span>
              {isFavorite ? "Saved" : "Save"}
            </button>
          )}
        </div>
        <div className="pp-modal-osm-link">
          <a
            href={`https://www.openstreetmap.org/?mlat=${park.lat}&mlon=${park.lng}#map=17/${park.lat}/${park.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on OpenStreetMap ↗
          </a>
          <span style={{ color: "var(--pp-border)", userSelect: "none" }}>·</span>
          <a
            href={`https://www.google.com/maps/@${park.lat},${park.lng},17z`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Google Maps ↗
          </a>
          {park.suburb && onSuburbSearch && (
            <>
              <span style={{ color: "var(--pp-border)", userSelect: "none" }}>·</span>
              <button
                className="pp-modal-osm-suburb-btn"
                onClick={() => { onSuburbSearch(park.suburb); onClose(); }}
                title={`Find all parks in ${park.suburb}`}
              >
                More in {park.suburb} ↗
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
