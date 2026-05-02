import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../context/ToastContext";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const BASE = import.meta.env.BASE_URL;
const TREE_ZOOM = 16;

const TILE_URLS: Record<string, string> = {
  default: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark:    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  sunset:  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  neon:    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  minimal: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
};

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function calcCentroid(coords: number[][]): { lat: number; lng: number } {
  let sLat = 0, sLng = 0;
  coords.forEach(([lng, lat]) => { sLng += lng; sLat += lat; });
  return { lat: sLat / coords.length, lng: sLng / coords.length };
}

function parkColor(park: Park): string {
  if (park.hasPlayground) return "#E76F51";
  if (park.type === "Iconic") return "#FFD166";
  if (park.type === "Sportsfield") return "#F4A261";
  if (park.type === "Neighbourhood") return "#83C5BE";
  return "#2D6A4F";
}

function npwsColor(subtype: string): string {
  if (subtype.includes("BBQ") || subtype.includes("Fire")) return "#FF6B35";
  if (subtype.includes("Picnic")) return "#8B5E3C";
  if (subtype.includes("Shelter")) return "#5B8C5A";
  if (subtype.includes("Playground")) return "#E91E8C";
  if (subtype.includes("Seat")) return "#6B8CBA";
  return "#888888";
}

function makeCircleIcon(color: string, size = 22, square = false) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:${square ? "4px" : "50%"};border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 5px rgba(0,0,0,0.3)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function makePawIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#AACC00;width:26px;height:26px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;">🐾</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -17],
  });
}

function makeLocIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="pp-user-loc"><div class="pp-user-loc-ring"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

interface Filters {
  playground: boolean; sports: boolean; iconic: boolean;
  neighbourhood: boolean; pocket: boolean; sportsfield: boolean;
  fountains: boolean; toilets: boolean; transport: boolean;
  trees: boolean; dogs: boolean; npws: boolean;
}
const defaultFilters: Filters = {
  playground: false, sports: false, iconic: false, neighbourhood: false,
  pocket: false, sportsfield: false, fountains: false, toilets: false,
  transport: false, trees: false, dogs: false, npws: false,
};

function useDebounce<T>(value: T, delay: number) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export default function Explore() {
  const { theme } = useTheme();
  const { toast } = useToast();

  const mapRef = useRef<L.Map | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const parkMarkersRef = useRef<L.Marker[]>([]);
  const fountainRef = useRef<L.LayerGroup | null>(null);
  const transportRef = useRef<L.LayerGroup | null>(null);
  const treeRef = useRef<L.LayerGroup | null>(null);
  const toiletRef = useRef<L.LayerGroup | null>(null);
  const blacktownRef = useRef<L.LayerGroup | null>(null);
  const dogRef = useRef<L.LayerGroup | null>(null);
  const npwsRef = useRef<L.LayerGroup | null>(null);
  const locationMarkerRef = useRef<L.Marker | null>(null);
  const locationCircleRef = useRef<L.Circle | null>(null);

  const [allParks, setAllParks] = useState<Park[]>([]);
  const [filtered, setFiltered] = useState<Park[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [treeHint, setTreeHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  // Init map
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return;
    const map = L.map(mapEl.current, { center: [-33.8688, 151.2093], zoom: 13, zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", metric: true, imperial: false }).addTo(map);

    const url = TILE_URLS[theme] || TILE_URLS.default;
    tileRef.current = L.tileLayer(url, { attribution: TILE_ATTRIBUTION, subdomains: "abcd", maxZoom: 19 }).addTo(map);

    map.on("zoomend", () => {
      if (!treeRef.current) return;
      if (map.getZoom() >= TREE_ZOOM) {
        if (!map.hasLayer(treeRef.current)) map.addLayer(treeRef.current);
        setTreeHint(false);
      } else {
        if (map.hasLayer(treeRef.current)) map.removeLayer(treeRef.current);
        setTreeHint(true);
      }
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Swap tile on theme change
  useEffect(() => {
    if (!tileRef.current) return;
    tileRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.default);
  }, [theme]);

  // Load parks data
  useEffect(() => {
    async function load() {
      try {
        const [parkRes, subRes] = await Promise.all([
          fetch(`${BASE}data/Parks.geojson`),
          fetch(`${BASE}data/parks-suburbs.json`),
        ]);
        const geojson = await parkRes.json();
        let suburbs: Record<string, { suburb: string }> = {};
        try { if (subRes.ok) suburbs = await subRes.json(); } catch {}
        const parks: Park[] = geojson.features.map((f: any, i: number) => {
          const p = f.properties, g = f.geometry;
          let lat = -33.8688, lng = 151.2093;
          if (g.type === "Polygon") { const c = calcCentroid(g.coordinates[0]); lat = c.lat; lng = c.lng; }
          else if (g.type === "MultiPolygon") { const c = calcCentroid(g.coordinates[0][0]); lat = c.lat; lng = c.lng; }
          return {
            id: p.OBJECTID ?? i, name: p.Name || "Unnamed Park",
            type: p.Type || "Unknown",
            suburb: (suburbs[String(p.OBJECTID)] || {}).suburb || "",
            hasPlayground: p.Playgrounds === "Yes",
            area: p.Shape__Area ? Math.round(p.Shape__Area) : null,
            assetId: p.Asset_ID || "", lat, lng,
          };
        });
        setAllParks(parks);
        setFiltered(parks);
      } catch { /* graceful */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load Blacktown (always)
  useEffect(() => {
    if (!mapRef.current || blacktownRef.current) return;
    fetch(`${BASE}data/blacktown.geojson`)
      .then(r => r.json())
      .then(data => {
        const layer = L.layerGroup();
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const isPg = f.properties.leisure === "playground";
          const color = isPg ? "#DC267F" : "#8B1A6B";
          const m = L.marker([lat, lng], { icon: makeCircleIcon(color, isPg ? 14 : 18) });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:${color}">${isPg ? "Playground" : "Park"} · Blacktown</span><h3>${f.properties.name || (isPg ? "Playground" : "Park")}</h3></div>`, { maxWidth: 220 });
          layer.addLayer(m);
        });
        blacktownRef.current = layer;
        if (mapRef.current) layer.addTo(mapRef.current);
      }).catch(() => {});
  }, [mapRef.current]);

  // Render park markers
  useEffect(() => {
    if (!mapRef.current) return;
    parkMarkersRef.current.forEach(m => mapRef.current!.removeLayer(m));
    parkMarkersRef.current = [];
    filtered.forEach(park => {
      const m = L.marker([park.lat, park.lng], { icon: makeCircleIcon(parkColor(park)), title: park.name });
      m.bindPopup(() => {
        const div = document.createElement("div");
        div.className = "pp-popup";
        div.innerHTML = `
          <span class="pp-popup-type">${park.type}</span>
          <h3>${park.name}</h3>
          ${park.area ? `<p>Area: ${park.area >= 10000 ? (park.area / 10000).toFixed(2) + " ha" : park.area.toLocaleString() + " m²"}</p>` : ""}
          ${park.hasPlayground ? `<p><strong>Has Playground ✓</strong></p>` : ""}
          <button class="pp-popup-btn" style="margin-top:8px">View Details</button>`;
        setTimeout(() => {
          div.querySelector<HTMLButtonElement>(".pp-popup-btn")?.addEventListener("click", () => setSelectedPark(park));
        }, 0);
        return div;
      }, { maxWidth: 280 });
      m.addTo(mapRef.current!);
      parkMarkersRef.current.push(m);
    });
  }, [filtered]);

  // Overlay layers helper
  async function loadFountains() {
    if (fountainRef.current) return;
    try {
      const data = await fetch(`${BASE}data/drinking-fountains.geojson`).then(r => r.json());
      const layer = L.layerGroup();
      (data.features || []).forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const m = L.marker([lat, lng], { icon: makeCircleIcon("#0077B6", 14), title: f.properties?.name || "Fountain" });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#0077B6">Drinking Fountain</span><h3>${f.properties?.name || "Water Fountain"}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      fountainRef.current = layer;
    } catch {}
  }

  async function loadTransport() {
    if (transportRef.current) return;
    try {
      const data = await fetch(`${BASE}data/public-transports.json`).then(r => r.json());
      const layer = L.layerGroup();
      const items = Array.isArray(data) ? data : (data.features || []);
      items.forEach((item: any) => {
        const lat = item.lat ?? item.geometry?.coordinates?.[1];
        const lng = item.lng ?? item.geometry?.coordinates?.[0];
        if (!lat || !lng) return;
        const m = L.marker([lat, lng], { icon: makeCircleIcon("#9B2335", 14, true), title: item.name || "Stop" });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#9B2335">Transport</span><h3>${item.name || "Stop"}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      transportRef.current = layer;
    } catch {}
  }

  async function loadTrees() {
    if (treeRef.current) return;
    try {
      const data = await fetch(`${BASE}data/trees.geojson`).then(r => r.json());
      const layer = L.layerGroup();
      (data.features || []).forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        layer.addLayer(L.marker([lat, lng], { icon: makeCircleIcon("#40916C", 8) }));
      });
      treeRef.current = layer;
    } catch {}
  }

  async function loadToilets() {
    if (toiletRef.current) return;
    try {
      const data = await fetch(`${BASE}data/toilets-sydney.json`).then(r => r.json());
      const layer = L.layerGroup();
      const items = Array.isArray(data) ? data : (data.features || data.rows || []);
      if (!items.length) { toiletRef.current = L.layerGroup(); toast("No toilet data available for this area.", "info"); return; }
      items.forEach((item: any) => {
        const lat = item.lat ?? item.latitude ?? item.geometry?.coordinates?.[1];
        const lng = item.lng ?? item.longitude ?? item.geometry?.coordinates?.[0];
        if (!lat || !lng) return;
        const name = item.name || item.toilet_name || item.properties?.name || "Public Toilet";
        const m = L.marker([lat, lng], { icon: makeCircleIcon("#6D597A", 14), title: name });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#6D597A">Public Toilet</span><h3>${name}</h3></div>`, { maxWidth: 200 });
        layer.addLayer(m);
      });
      toiletRef.current = layer;
    } catch {}
  }

  async function loadDogs() {
    if (dogRef.current) return;
    try {
      const data = await fetch(`${BASE}data/Dog_off-leash_parks.geojson`).then(r => r.json());
      const layer = L.layerGroup();
      (data.features || []).forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const always = p.OffLeashTime === "At all times";
        const badge = always
          ? `<span class="pp-popup-type" style="background:#5A9E27">Always Off-Leash</span>`
          : `<span class="pp-popup-type" style="background:#E07C00">${p.OffLeashTime || "See description"}</span>`;
        const m = L.marker([lat, lng], { icon: makePawIcon(), title: p.ParkName });
        m.bindPopup(`<div class="pp-popup">${badge}<h3>${p.ParkName}</h3><p><strong>${p.Suburb}</strong>${p.Street ? " · " + p.Street : ""}</p>${p.ProhibitedAreas ? `<p style="font-size:11px;color:#c44">Not allowed in: ${p.ProhibitedAreas}</p>` : ""}<p style="font-size:11px;margin-top:4px">${p.OffLeashDescription || ""}</p></div>`, { maxWidth: 280 });
        layer.addLayer(m);
      });
      dogRef.current = layer;
    } catch {}
  }

  async function loadNPWS() {
    if (npwsRef.current) return;
    try {
      const data = await fetch(`${BASE}data/npws-facilities-greater-sydney.geojson`).then(r => r.json());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cluster = (L as any).markerClusterGroup({
        maxClusterRadius: 50,
        disableClusteringAtZoom: 17,
        chunkedLoading: true,
        iconCreateFunction: (c: any) => L.divIcon({
          className: "",
          html: `<div class="pp-cluster-icon">${c.getChildCount()}</div>`,
          iconSize: [34, 34],
        }),
      });
      (data.features || []).forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const color = npwsColor(p.d_SubtypeC || "");
        const m = L.marker([lat, lng], { icon: makeCircleIcon(color, 14), title: p.AssetName });
        m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:${color}">${p.d_SubtypeC || "NPWS Facility"}</span><h3>${p.AssetName || "Facility"}</h3>${p.d_LGA ? `<p><strong>${p.d_LGA}</strong>${p.d_Branch ? " · " + p.d_Branch : ""}</p>` : ""}${p.Comments ? `<p style="font-size:11px;margin-top:4px">${p.Comments}</p>` : ""}</div>`, { maxWidth: 260 });
        cluster.addLayer(m);
      });
      npwsRef.current = cluster;
    } catch {}
  }

  // Toggle overlay layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const toggle = (ref: React.MutableRefObject<L.Layer | null>, on: boolean, loader: () => Promise<void>) => {
      if (on) loader().then(() => { if (ref.current && !map.hasLayer(ref.current)) map.addLayer(ref.current); });
      else if (ref.current && map.hasLayer(ref.current)) map.removeLayer(ref.current);
    };
    toggle(fountainRef, filters.fountains, loadFountains);
    toggle(transportRef, filters.transport, loadTransport);
    toggle(toiletRef, filters.toilets, loadToilets);
    toggle(dogRef, filters.dogs, loadDogs);
    toggle(npwsRef, filters.npws, loadNPWS);

    if (filters.trees) {
      loadTrees().then(() => {
        if (treeRef.current) {
          if (map.getZoom() >= TREE_ZOOM) { if (!map.hasLayer(treeRef.current)) map.addLayer(treeRef.current); setTreeHint(false); }
          else setTreeHint(true);
        }
      });
    } else {
      if (treeRef.current && map.hasLayer(treeRef.current)) map.removeLayer(treeRef.current);
      setTreeHint(false);
    }
  }, [filters.fountains, filters.transport, filters.trees, filters.toilets, filters.dogs, filters.npws]);

  // Park filter computation
  useEffect(() => {
    const parkKeys: (keyof Filters)[] = ["playground", "sports", "iconic", "neighbourhood", "pocket", "sportsfield"];
    const anyPark = parkKeys.some(k => filters[k]);
    const q = search.toLowerCase();
    const result = allParks.filter(park => {
      if (q && !`${park.name} ${park.type} ${park.suburb}`.toLowerCase().includes(q)) return false;
      if (anyPark) {
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

  const flyToPark = useCallback((park: Park) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo([park.lat, park.lng], 17, { duration: 1.2, easeLinearity: 0.3 });
    setTimeout(() => {
      const m = parkMarkersRef.current.find(mk => {
        const ll = mk.getLatLng();
        return Math.abs(ll.lat - park.lat) < 0.00001 && Math.abs(ll.lng - park.lng) < 0.00001;
      });
      m?.openPopup();
    }, 1300);
  }, []);

  const handleLocate = () => {
    if (!navigator.geolocation) { toast("Geolocation is not supported by your browser.", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const map = mapRef.current;
        if (!map) return;
        if (locationMarkerRef.current) map.removeLayer(locationMarkerRef.current);
        if (locationCircleRef.current) map.removeLayer(locationCircleRef.current);
        locationCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: "#4A90E2", fillColor: "#4A90E2", fillOpacity: 0.1, weight: 1 }).addTo(map);
        locationMarkerRef.current = L.marker([lat, lng], { icon: makeLocIcon(), title: "Your location" }).addTo(map);
        map.flyTo([lat, lng], 15, { duration: 1.5 });
        toast("Location found! Flying to your position.", "success");
      },
      () => {
        setLocating(false);
        toast("Could not get your location. Please allow access.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clearAll = () => {
    setSearchInput("");
    setFilters(defaultFilters);
  };
  const toggleFilter = (key: keyof Filters) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  const quickToggle = (key: keyof Filters) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const showCount = !search && !activeFilters;

  const filterItems = [
    { key: "playground" as const, label: "Playgrounds", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
    { key: "sports" as const, label: "Sports Facilities", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: "iconic" as const, label: "Iconic Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { key: "neighbourhood" as const, label: "Neighbourhood", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: "pocket" as const, label: "Pocket Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { key: "sportsfield" as const, label: "Sportsfields", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: "dogs" as const, label: "Dog Parks 🐾", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2 .336-3.5 2.094-3.5 4 0 .823.212 1.592.584 2.253"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2 .336 3.5 2.094 3.5 4 0 .823-.212 1.592-.584 2.253"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.16-2.048-.473-2.866"/></svg> },
    { key: "npws" as const, label: "NPWS Facilities", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> },
    { key: "fountains" as const, label: "Drinking Fountains", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12"/><path d="M5 12C5 8 8 4 12 4s7 4 7 8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg> },
    { key: "toilets" as const, label: "Public Toilets", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 7h10v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V7z"/><path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg> },
    { key: "transport" as const, label: "Public Transport", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M8 21l-2 2M18 21l-2 2"/></svg> },
    { key: "trees" as const, label: "Trees", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/></svg> },
  ];

  const activeKeys = Object.entries(filters).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="pp-explore-page">
      <Navbar />
      <main className="pp-explore-main">
        <aside className={`pp-sidebar${collapsed ? " collapsed" : ""}`} aria-label="Park finder sidebar">
          <div className="pp-sidebar-header">
            <h2>Find Parks</h2>
            <button className="pp-sidebar-toggle" aria-label="Collapse sidebar"
              onClick={() => { setCollapsed(true); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>

          <div className="pp-search-container">
            <div className="pp-search-wrapper">
              <svg className="pp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="text" className="pp-search-input" placeholder="Search parks, suburbs, types…"
                value={searchInput} onChange={e => setSearchInput(e.target.value)} aria-label="Search parks" />
              {searchInput && (
                <button className="pp-clear-btn" onClick={() => setSearchInput("")} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* Quick filter pills */}
          <div className="pp-quick-pills">
            {[
              { key: "playground" as const, emoji: "🛝", label: "Playground" },
              { key: "dogs" as const, emoji: "🐕", label: "Dog Friendly" },
              { key: "npws" as const, emoji: "🍖", label: "BBQ/Picnic" },
              { key: "fountains" as const, emoji: "⛲", label: "Fountain" },
              { key: "toilets" as const, emoji: "🚻", label: "Toilets" },
            ].map(p => (
              <button key={p.key} className={`pp-pill${filters[p.key] ? " active" : ""}`}
                onClick={() => quickToggle(p.key)} aria-pressed={filters[p.key]}>
                {p.emoji} {p.label}
              </button>
            ))}
          </div>

          <div className="pp-filters-container">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filter Layers
              {activeFilters > 0 && <span className="pp-active-badge">{activeFilters}</span>}
            </h3>
            <div className="pp-filter-group">
              {filterItems.map(item => (
                <label key={item.key} className="pp-filter-checkbox">
                  <input type="checkbox" checked={filters[item.key]} onChange={() => toggleFilter(item.key)} />
                  <span className="pp-checkmark" />
                  <span className="pp-filter-label">
                    {item.icon}{item.label}
                    {item.key === "trees" && filters.trees && treeHint && (
                      <small style={{ color: "var(--pp-text-muted)", fontSize: 10, display: "block", marginLeft: 22 }}>zoom in to see</small>
                    )}
                    {item.key === "npws" && <span className="pp-layer-count">1,795</span>}
                    {item.key === "dogs" && <span className="pp-layer-count">29</span>}
                  </span>
                </label>
              ))}
            </div>
            <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>
              Clear All {activeFilters > 0 ? `(${activeFilters})` : ""}
            </button>
          </div>

          <div className="pp-results-container">
            <div className="pp-results-header">
              <h3>Results</h3>
              <span className="pp-results-count">
                {loading ? "Loading…" : `${showCount ? (filtered.length + 1605).toLocaleString() : filtered.length.toLocaleString()} ${showCount ? "locations" : `park${filtered.length !== 1 ? "s" : ""}`}`}
              </span>
            </div>

            <div className="pp-results-list" role="list">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <div key={i} className="pp-skeleton-card" />)
              ) : filtered.length === 0 ? (
                <div className="pp-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <p>No parks match your {activeKeys.length > 0 ? `filters (${activeKeys.join(", ")})` : "search"}.</p>
                  <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear filters</button>
                </div>
              ) : (
                filtered.slice(0, 100).map(park => (
                  <div key={park.id} className="pp-park-card" role="listitem"
                    onClick={() => flyToPark(park)} tabIndex={0} onKeyDown={e => e.key === "Enter" && flyToPark(park)}>
                    <div className="pp-park-card-header">
                      <h4>{park.name}</h4>
                      <span className={`pp-park-type-badge ${park.type.toLowerCase().replace(/\s+/g, "-")}`}>{park.type}</span>
                    </div>
                    <div className="pp-park-card-facilities">
                      {park.hasPlayground && <span className="pp-facility-tag">Playground</span>}
                      {park.suburb && <span className="pp-facility-tag">{park.suburb}</span>}
                      {park.area && park.area >= 10000 && <span className="pp-facility-tag">{(park.area / 10000).toFixed(1)} ha</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="pp-map-container">
          <div ref={mapEl} style={{ width: "100%", height: "100%" }} aria-label="Interactive park map" />

          {/* Locate Me */}
          <button className={`pp-locate-btn${locating ? " locating" : ""}`} onClick={handleLocate}
            aria-label="Find my location" title="Locate me">
            {locating ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pp-spin">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
            )}
          </button>

          {collapsed && (
            <button className="pp-sidebar-open-btn" aria-label="Open sidebar"
              onClick={() => { setCollapsed(false); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
        </section>
      </main>

      <ParkModal park={selectedPark} onClose={() => setSelectedPark(null)} />
    </div>
  );
}
