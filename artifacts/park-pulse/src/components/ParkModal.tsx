import { useEffect } from "react";
import type { Park } from "../types/park";

interface ParkModalProps {
  park: Park | null;
  onClose: () => void;
}

export default function ParkModal({ park, onClose }: ParkModalProps) {
  useEffect(() => {
    if (!park) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
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
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      ),
    });
  }
  if (park.type === "Sportsfield" || park.type === "Sports") {
    facilities.push({
      name: "Sports Field",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    });
  }
  if (park.type === "Iconic") {
    facilities.push({
      name: "Iconic Landmark",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    });
  }
  if (facilities.length === 0) {
    facilities.push({
      name: "Open green space",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22v-7l-2-2" />
          <path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z" />
        </svg>
      ),
    });
  }

  const typeClass = park.type.toLowerCase().replace(/\s+/g, "-");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}`;

  return (
    <div className="pp-modal active" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="pp-modal-overlay" onClick={onClose} />
      <div className="pp-modal-content">
        <button className="pp-modal-close" aria-label="Close modal" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="pp-modal-header">
          <h2 id="modal-title">{park.name}</h2>
          <span className={`pp-park-type-badge ${typeClass}`}>{park.type}</span>
        </div>
        <div className="pp-modal-body">
          <div className="pp-modal-info">
            <div className="pp-info-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>
                {park.suburb ? `${park.suburb}, NSW` : `Sydney, NSW`}
                {" "}({park.lat.toFixed(4)}, {park.lng.toFixed(4)})
              </span>
            </div>
            {park.area && (
              <div className="pp-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                <span>{park.area.toLocaleString()} square meters</span>
              </div>
            )}
          </div>
          <div className="pp-modal-facilities">
            <h4>Facilities</h4>
            <div className="pp-facilities-list">
              {facilities.map((f) => (
                <span key={f.name} className="pp-facility-badge">
                  {f.icon}
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="pp-modal-footer">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pp-btn pp-btn-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Get Directions
          </a>
        </div>
      </div>
    </div>
  );
}
