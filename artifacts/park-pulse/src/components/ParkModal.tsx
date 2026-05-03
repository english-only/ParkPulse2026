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
}

function formatArea(area: number): string {
  if (area >= 10000) return `${(area / 10000).toFixed(2)} ha`;
  return `${area.toLocaleString()} m²`;
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

export default function ParkModal({ park, onClose, nearbyNPWS, nearbyDogPark }: ParkModalProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!park) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?park=${encodeURIComponent(park.name)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to clipboard!", "success");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = url; document.body.appendChild(el);
        el.select(); document.execCommand("copy");
        document.body.removeChild(el);
        toast("Link copied to clipboard!", "success");
      } catch {
        toast("Could not copy link.", "error");
      }
    }
  };

  const visibleNPWS = nearbyNPWS?.slice(0, 5) ?? [];

  return (
    <div className="pp-modal active" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="pp-modal-overlay" onClick={onClose} />
      <div className="pp-modal-content">
        <button className="pp-modal-close" aria-label="Close modal" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="pp-modal-header">
          <h2 id="modal-title">{park.name}</h2>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".375rem" }}>
            <span className={`pp-park-type-badge ${typeClass}`}>{park.type}</span>
            {park.suburb && (
              <span className="pp-park-suburb-pill" style={{ padding: "2px 8px", background: "var(--pp-bg-alt)", color: "var(--pp-text-secondary)", borderRadius: "var(--pp-radius-full)", fontSize: ".72rem", fontWeight: 500 }}>
                📍 {park.suburb}
              </span>
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
              <div className="pp-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                <span>{formatArea(park.area)}</span>
              </div>
            )}
            <div className="pp-info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--pp-text-muted)" }}>
                {park.lat.toFixed(5)}, {park.lng.toFixed(5)}
              </span>
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
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Get Directions
          </a>
          <button className="pp-btn pp-btn-secondary" onClick={handleShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
