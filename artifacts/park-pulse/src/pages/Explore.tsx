import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BASE = import.meta.env.BASE_URL;

const TREE_ZOOM_THRESHOLD = 16;

function calcCentroid(coords: number[][]): { lat: number; lng: number } {
  let sumLat = 0, sumLng = 0;
  coords.forEach(([lng, lat]) => { sumLng += lng; sumLat += lat; });
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

function parkMarkerColor(park: Park): string {
  if (park.hasPlayground) return "#E76F51";
  if (park.type === "Iconic") return "#FFD166";
  if (park.type === "Sportsfield") return "#F4A261";
  if (park.type === "Neighbourhood") return "#83C5BE";
  return "#2D6A4F";
}

function makeIcon(color: string, size = 24, radius = "50%") {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:${radius};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

interface Filters {
  playground: boolean;
  sports: boolean;
  iconic: boolean;
  neighbourhood: boolean;
  pocket: boolean;
  sportsfield: boolean;
  fountains: boolean;
  toilets: boolean;
  transport: boolean;
  trees: boolean;
}

const defaultFilters: Filters = {
  playground: false, sports: false, iconic: false, neighbourhood: false,
  pocket: false, sportsfield: false, fountains: false, toilets: false,
  transport: false, trees: false,
};

export default function Explore() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const fountainLayerRef = useRef<L.LayerGroup | null>(null);
  const transportLayerRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const toiletLayerRef = useRef<L.LayerGroup | null>(null);
  const blacktownLayerRef = useRef<L.LayerGroup | null>(null);
  const [allParks, setAllParks] = useState<Park[]>([]);
  const [filtered, setFiltered] = useState<Park[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [treeZoomHint, setTreeZoomHint] = useState(false);
  const [loading, setLoading] = useState(true);

  // Init map
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-33.8688, 151.2093],
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    map.zoomControl.setPosition("bottomright");
    map.on("zoomend", () => {
      const zoom = map.getZoom();
      if (treeLayerRef.current) {
        if (zoom >= TREE_ZOOM_THRESHOLD) {
          if (!map.hasLayer(treeLayerRef.current)) map.addLayer(treeLayerRef.current);
          setTreeZoomHint(false);
        } else {
          if (map.hasLayer(treeLayerRef.current)) map.removeLayer(treeLayerRef.current);
          setTreeZoomHint(true);
        }
      }
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Load parks + suburbs
  useEffect(() => {
    async function load() {
      try {
        const [parkRes, suburbRes] = await Promise.all([
          fetch(`${BASE}data/Parks.geojson`),
          fetch(`${BASE}data/parks-suburbs.json`),
        ]);
        const geojson = await parkRes.json();
        const suburbs: Record<string, { suburb: string }> = suburbRes.ok ? await suburbRes.json() : {};
        const parks: Park[] = geojson.features.map((f: any, i: number) => {
          const p = f.properties;
          const g = f.geometry;
          let lat = -33.8688, lng = 151.2093;
          if (g.type === "Polygon") {
            const c = calcCentroid(g.coordinates[0]);
            lat = c.lat; lng = c.lng;
          } else if (g.type === "MultiPolygon") {
            const c = calcCentroid(g.coordinates[0][0]);
            lat = c.lat; lng = c.lng;
          }
          return {
            id: p.OBJECTID ?? i,
            name: p.Name || "Unnamed Park",
            type: p.Type || "Unknown",
            suburb: (suburbs[String(p.OBJECTID)] || {}).suburb || "",
            hasPlayground: p.Playgrounds === "Yes",
            area: p.Shape__Area ? Math.round(p.Shape__Area) : null,
            assetId: p.Asset_ID || "",
            lat, lng,
          };
        });
        setAllParks(parks);
        setFiltered(parks);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load blacktown always
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}data/blacktown.geojson`);
        const data = await res.json();
        const layer = L.layerGroup();
        data.features.forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          const isPlayground = p.leisure === "playground";
          const color = isPlayground ? "#DC267F" : "#8B1A6B";
          const size = isPlayground ? 16 : 20;
          const marker = L.marker([lat, lng], { icon: makeIcon(color, size, isPlayground ? "50%" : "4px") });
          marker.bindPopup(`
            <div class="pp-popup">
              <span class="pp-popup-type" style="background:${color}">${isPlayground ? "Playground" : "Park"} · Blacktown</span>
              <h3>${p.name || (isPlayground ? "Playground" : "Park")}</h3>
              ${p.website ? `<a href="${p.website}" target="_blank" rel="noopener" style="font-size:11px;color:#2D6A4F">Visit website</a>` : ""}
            </div>`, { maxWidth: 240 });
          layer.addLayer(marker);
        });
        blacktownLayerRef.current = layer;
        if (mapRef.current) layer.addTo(mapRef.current);
      } catch { /* ignore */ }
    }
    if (mapRef.current) load();
  }, [mapRef.current]);

  // Render park markers on map when filtered changes
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => mapRef.current!.removeLayer(m));
    markersRef.current = [];
    filtered.forEach(park => {
      const marker = L.marker([park.lat, park.lng], { icon: makeIcon(parkMarkerColor(park)) });
      marker.bindPopup(() => {
        const div = document.createElement("div");
        div.className = "pp-popup";
        div.innerHTML = `
          <span class="pp-popup-type">${park.type}</span>
          <h3>${park.name}</h3>
          ${park.area ? `<p>Area: ${park.area.toLocaleString()} m²</p>` : ""}
          ${park.hasPlayground ? `<p style="font-size:12px;margin-top:4px"><strong>Has Playground</strong></p>` : ""}
          <button class="pp-popup-btn" data-park-id="${park.id}">View Details</button>
        `;
        // Fix: attach click handler directly to the button element
        setTimeout(() => {
          const btn = div.querySelector<HTMLButtonElement>(".pp-popup-btn");
          if (btn) {
            btn.addEventListener("click", () => setSelectedPark(park));
          }
        }, 0);
        return div;
      }, { maxWidth: 280 });
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
    // Fly to bounds on initial load
    if (markersRef.current.length > 0 && loading === false && filtered.length === allParks.length) {
      const group = L.featureGroup(markersRef.current);
      try { mapRef.current.flyToBounds(group.getBounds().pad(0.1), { duration: 1.4, easeLinearity: 0.25 }); }
      catch { /* bounds may be invalid */ }
    }
  }, [filtered]);

  // Handle overlay filters
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    async function loadFountains() {
      if (fountainLayerRef.current) return;
      const res = await fetch(`${BASE}data/drinking-fountains.geojson`);
      const data = await res.json();
      const layer = L.layerGroup();
      data.features.forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const m = L.marker([lat, lng], { icon: makeIcon("#0077B6", 16) });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#0077B6">Drinking Fountain</span><h3>${f.properties?.name || "Water Fountain"}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      fountainLayerRef.current = layer;
    }
    async function loadTransport() {
      if (transportLayerRef.current) return;
      const res = await fetch(`${BASE}data/public-transports.json`);
      const data = await res.json();
      const layer = L.layerGroup();
      const items = Array.isArray(data) ? data : (data.features || []);
      items.forEach((item: any) => {
        const lat = item.lat ?? item.geometry?.coordinates?.[1];
        const lng = item.lng ?? item.geometry?.coordinates?.[0];
        if (!lat || !lng) return;
        const name = item.name || item.properties?.stop_name || "Transport Stop";
        const m = L.marker([lat, lng], { icon: makeIcon("#9B2335", 16, "3px") });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#9B2335">Transport</span><h3>${name}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      transportLayerRef.current = layer;
    }
    async function loadTrees() {
      if (treeLayerRef.current) return;
      const res = await fetch(`${BASE}data/trees.geojson`);
      const data = await res.json();
      const layer = L.layerGroup();
      data.features.forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const m = L.marker([lat, lng], { icon: makeIcon("#40916C", 10) });
        layer.addLayer(m);
      });
      treeLayerRef.current = layer;
    }
    async function loadToilets() {
      if (toiletLayerRef.current) return;
      const res = await fetch(`${BASE}data/toilets-sydney.json`);
      const data = await res.json();
      const layer = L.layerGroup();
      const items = Array.isArray(data) ? data : (data.features || data.rows || []);
      items.forEach((item: any) => {
        const lat = item.lat ?? item.latitude ?? item.geometry?.coordinates?.[1];
        const lng = item.lng ?? item.longitude ?? item.geometry?.coordinates?.[0];
        if (!lat || !lng) return;
        const name = item.name || item.toilet_name || item.properties?.name || "Public Toilet";
        const m = L.marker([lat, lng], { icon: makeIcon("#6D597A", 16, "3px") });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#6D597A">Public Toilet</span><h3>${name}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      toiletLayerRef.current = layer;
    }

    if (filters.fountains) { loadFountains().then(() => { if (fountainLayerRef.current && !map.hasLayer(fountainLayerRef.current)) map.addLayer(fountainLayerRef.current); }); }
    else { if (fountainLayerRef.current && map.hasLayer(fountainLayerRef.current)) map.removeLayer(fountainLayerRef.current); }

    if (filters.transport) { loadTransport().then(() => { if (transportLayerRef.current && !map.hasLayer(transportLayerRef.current)) map.addLayer(transportLayerRef.current); }); }
    else { if (transportLayerRef.current && map.hasLayer(transportLayerRef.current)) map.removeLayer(transportLayerRef.current); }

    if (filters.trees) {
      loadTrees().then(() => {
        if (treeLayerRef.current) {
          if (map.getZoom() >= TREE_ZOOM_THRESHOLD) { if (!map.hasLayer(treeLayerRef.current)) map.addLayer(treeLayerRef.current); setTreeZoomHint(false); }
          else setTreeZoomHint(true);
        }
      });
    } else { if (treeLayerRef.current && map.hasLayer(treeLayerRef.current)) map.removeLayer(treeLayerRef.current); setTreeZoomHint(false); }

    if (filters.toilets) { loadToilets().then(() => { if (toiletLayerRef.current && !map.hasLayer(toiletLayerRef.current)) map.addLayer(toiletLayerRef.current); }); }
    else { if (toiletLayerRef.current && map.hasLayer(toiletLayerRef.current)) map.removeLayer(toiletLayerRef.current); }
  }, [filters.fountains, filters.transport, filters.trees, filters.toilets]);

  // Compute filtered list
  useEffect(() => {
    const q = search.toLowerCase();
    const parkKeys: (keyof Filters)[] = ["playground", "sports", "iconic", "neighbourhood", "pocket", "sportsfield"];
    const anyParkFilter = parkKeys.some(k => filters[k]);
    const result = allParks.filter(park => {
      if (q) {
        const ok = park.name.toLowerCase().includes(q) ||
          park.type.toLowerCase().includes(q) ||
          park.suburb.toLowerCase().includes(q);
        if (!ok) return false;
      }
      if (anyParkFilter) {
        const match =
          (filters.playground && park.hasPlayground) ||
          (filters.sports && (park.type === "Sportsfield" || park.type === "Sports")) ||
          (filters.iconic && park.type === "Iconic") ||
          (filters.neighbourhood && park.type === "Neighbourhood") ||
          (filters.pocket && park.type === "Pocket") ||
          (filters.sportsfield && park.type === "Sportsfield");
        if (!match) return false;
      }
      return true;
    });
    setFiltered(result);
  }, [allParks, search, filters]);

  const selectPark = useCallback((park: Park) => {
    if (!mapRef.current) return;
    mapRef.current.setView([park.lat, park.lng], 17);
    const marker = markersRef.current.find(m => {
      const ll = m.getLatLng();
      return ll.lat === park.lat && ll.lng === park.lng;
    });
    if (marker) marker.openPopup();
  }, []);

  const clearAll = useCallback(() => {
    setSearch("");
    setFilters(defaultFilters);
  }, []);

  const toggleFilter = (key: keyof Filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalCount = !search && Object.values(filters).every(v => !v)
    ? filtered.length + 1605
    : filtered.length;
  const countLabel = !search && Object.values(filters).every(v => !v) ? "locations" : `park${totalCount !== 1 ? "s" : ""}`;

  const filterItems = [
    { key: "playground" as const, label: "Playgrounds", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
    { key: "sports" as const, label: "Sports Facilities", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: "iconic" as const, label: "Iconic Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { key: "neighbourhood" as const, label: "Neighbourhood", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: "pocket" as const, label: "Pocket Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { key: "sportsfield" as const, label: "Sportsfields", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: "fountains" as const, label: "Drinking Fountains", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12"/><path d="M5 12C5 8 8 4 12 4s7 4 7 8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg> },
    { key: "toilets" as const, label: "Public Toilets", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 7h10v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V7z"/><path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg> },
    { key: "transport" as const, label: "Public Transport", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M8 21l-2 2M18 21l-2 2"/></svg> },
    { key: "trees" as const, label: "Trees", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/></svg> },
  ];

  return (
    <div className="pp-explore-page">
      <Navbar />
      <main className="pp-explore-main">
        <aside className={`pp-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <div className="pp-sidebar-header">
            <h2>Find Parks</h2>
            <button className="pp-sidebar-toggle" aria-label="Toggle sidebar" onClick={() => { setSidebarCollapsed(true); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>

          <div className="pp-search-container">
            <div className="pp-search-wrapper">
              <svg className="pp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="pp-search-input"
                placeholder="Search parks or suburbs..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                aria-label="Search parks"
              />
              {search && (
                <button className="pp-clear-btn" onClick={() => setSearch("")} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="pp-filters-container">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter by Facilities
            </h3>
            <div className="pp-filter-group">
              {filterItems.map(item => (
                <label key={item.key} className="pp-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filters[item.key]}
                    onChange={() => toggleFilter(item.key)}
                  />
                  <span className="pp-checkmark" />
                  <span className="pp-filter-label">
                    {item.icon}
                    {item.label}
                    {item.key === "trees" && filters.trees && treeZoomHint && (
                      <small style={{ color: "#999", fontSize: 10, display: "block", marginLeft: 24 }}>
                        (zoom in to see)
                      </small>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>
              Clear All Filters
            </button>
          </div>

          <div className="pp-results-container">
            <div className="pp-results-header">
              <h3>Results</h3>
              <span className="pp-results-count">{totalCount.toLocaleString()} {countLabel} found</span>
            </div>
            <div className="pp-results-list">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <div key={i} className="pp-skeleton-card" />)
              ) : filtered.length === 0 ? (
                <div className="pp-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  <p>No parks found matching your criteria.</p>
                </div>
              ) : (
                filtered.slice(0, 100).map(park => (
                  <div
                    key={park.id}
                    className="pp-park-card"
                    onClick={() => selectPark(park)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === "Enter" && selectPark(park)}
                  >
                    <div className="pp-park-card-header">
                      <h4>{park.name}</h4>
                      <span className={`pp-park-type-badge ${park.type.toLowerCase().replace(/\s+/g, "-")}`}>
                        {park.type}
                      </span>
                    </div>
                    <div className="pp-park-card-facilities">
                      {park.hasPlayground && (
                        <span className="pp-facility-tag">Playground</span>
                      )}
                      {park.type === "Sportsfield" && (
                        <span className="pp-facility-tag">Sports Field</span>
                      )}
                      {park.suburb && (
                        <span className="pp-facility-tag">{park.suburb}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="pp-map-container">
          <div id="park-map" ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
          {sidebarCollapsed && (
            <button
              className="pp-sidebar-open-btn"
              aria-label="Open sidebar"
              onClick={() => { setSidebarCollapsed(false); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </section>
      </main>

      <ParkModal park={selectedPark} onClose={() => setSelectedPark(null)} />
    </div>
  );
}
