import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../context/ToastContext";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const BASE = import.meta.env.BASE_URL;
const TREE_ZOOM_THRESHOLD = 16;

const TILE_URLS: Record<string, string> = {
  default: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark:    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  sunset:  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  neon:    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  minimal: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
};

const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

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

function makeIcon(color: string, size = 24, radius = "50%", inner = "") {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:${radius};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:${size * 0.55}px;line-height:1">${inner}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function npwsColor(subtype: string): string {
  if (subtype.includes("BBQ") || subtype.includes("Fire")) return "#FF6B35";
  if (subtype.includes("Picnic")) return "#8B5E3C";
  if (subtype.includes("Shelter")) return "#5B8C5A";
  if (subtype.includes("Playground")) return "#E91E8C";
  if (subtype.includes("Seat")) return "#6B8CBA";
  return "#888888";
}

interface Filters {
  playground: boolean; sports: boolean; iconic: boolean; neighbourhood: boolean;
  pocket: boolean; sportsfield: boolean; fountains: boolean; toilets: boolean;
  transport: boolean; trees: boolean; dogs: boolean; npws: boolean;
}

const defaultFilters: Filters = {
  playground: false, sports: false, iconic: false, neighbourhood: false,
  pocket: false, sportsfield: false, fountains: false, toilets: false,
  transport: false, trees: false, dogs: false, npws: false,
};

export default function Explore() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const fountainLayerRef = useRef<L.LayerGroup | null>(null);
  const transportLayerRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const toiletLayerRef = useRef<L.LayerGroup | null>(null);
  const blacktownLayerRef = useRef<L.LayerGroup | null>(null);
  const dogLayerRef = useRef<L.LayerGroup | null>(null);
  const npwsLayerRef = useRef<L.LayerGroup | null>(null);
  const locationMarkerRef = useRef<L.Marker | null>(null);
  const locationCircleRef = useRef<L.Circle | null>(null);

  const [allParks, setAllParks] = useState<Park[]>([]);
  const [filtered, setFiltered] = useState<Park[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selectedPark, setSelectedPark] = useState<Park | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [treeZoomHint, setTreeZoomHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const mapReady = useRef(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Read URL params for pre-applied filters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter && filter in defaultFilters) {
      setFilters(prev => ({ ...prev, [filter as keyof Filters]: true }));
    }
    const locate = params.get("locate");
    if (locate === "1") {
      setTimeout(() => handleLocate(), 1500);
    }
  }, []);

  // Init map
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [-33.8688, 151.2093], zoom: 13, zoomControl: false });

    const initialTheme = document.documentElement.getAttribute("data-theme") || "default";
    tileLayerRef.current = L.tileLayer(TILE_URLS[initialTheme] || TILE_URLS.default, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false, metric: true }).addTo(map);

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
    mapReady.current = true;
    return () => { map.remove(); mapRef.current = null; mapReady.current = false; };
  }, []);

  // Swap tile URL when theme changes
  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.default);
  }, [theme]);

  // Load parks
  useEffect(() => {
    async function load() {
      try {
        const [parkRes, suburbRes] = await Promise.all([
          fetch(`${BASE}data/Parks.geojson`),
          fetch(`${BASE}data/parks-suburbs.json`),
        ]);
        const geojson = await parkRes.json();
        let suburbs: Record<string, { suburb: string }> = {};
        if (suburbRes.ok) {
          try { suburbs = await suburbRes.json(); } catch {}
        }
        const parks: Park[] = geojson.features.map((f: any, i: number) => {
          const p = f.properties; const g = f.geometry;
          let lat = -33.8688, lng = 151.2093;
          if (g.type === "Polygon") { const c = calcCentroid(g.coordinates[0]); lat = c.lat; lng = c.lng; }
          else if (g.type === "MultiPolygon") { const c = calcCentroid(g.coordinates[0][0]); lat = c.lat; lng = c.lng; }
          return {
            id: p.OBJECTID ?? i, name: p.Name || "Unnamed Park", type: p.Type || "Unknown",
            suburb: (suburbs[String(p.OBJECTID)] || {}).suburb || "",
            hasPlayground: p.Playgrounds === "Yes", area: p.Shape__Area ? Math.round(p.Shape__Area) : null,
            assetId: p.Asset_ID || "", lat, lng,
          };
        });
        setAllParks(parks);
        setFiltered(parks);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  // Load blacktown always
  useEffect(() => {
    if (!mapRef.current) return;
    fetch(`${BASE}data/blacktown.geojson`).then(r => r.json()).then(data => {
      if (!mapRef.current) return;
      const layer = L.layerGroup();
      (data.features || []).forEach((f: any) => {
        if (!f.geometry?.coordinates) return;
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const isPlayground = p.leisure === "playground";
        const color = isPlayground ? "#DC267F" : "#8B1A6B";
        const marker = L.marker([lat, lng], { icon: makeIcon(color, isPlayground ? 16 : 20, isPlayground ? "50%" : "4px") });
        marker.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:${color}">${isPlayground ? "Playground" : "Park"} · Blacktown</span><h3>${p.name || (isPlayground ? "Playground" : "Park")}</h3></div>`, { maxWidth: 240 });
        layer.addLayer(marker);
      });
      blacktownLayerRef.current = layer;
      if (mapRef.current) layer.addTo(mapRef.current);
    }).catch(() => {});
  }, [mapRef.current]);

  // Render park markers
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => mapRef.current!.removeLayer(m));
    markersRef.current = [];
    filtered.forEach(park => {
      const marker = L.marker([park.lat, park.lng], { icon: makeIcon(parkMarkerColor(park)), title: park.name });
      marker.bindPopup(() => {
        const div = document.createElement("div");
        div.className = "pp-popup";
        div.innerHTML = `<span class="pp-popup-type">${park.type}</span><h3>${park.name}</h3>${park.area ? `<p>Area: ${park.area >= 10000 ? (park.area/10000).toFixed(2)+" ha" : park.area.toLocaleString()+" m²"}</p>` : ""}${park.hasPlayground ? `<p style="font-size:12px;margin-top:4px">🛝 Has Playground</p>` : ""}<button class="pp-popup-btn" style="margin-top:8px">View Details</button>`;
        setTimeout(() => {
          div.querySelector(".pp-popup-btn")?.addEventListener("click", () => setSelectedPark(park));
        }, 0);
        return div;
      }, { maxWidth: 280 });
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [filtered]);

  // Overlay layers: fountains, transport, toilets, trees
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loadFountains = async () => {
      if (fountainLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/drinking-fountains.geojson`).then(r => r.json());
        const layer = L.layerGroup();
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const m = L.marker([lat, lng], { icon: makeIcon("#0077B6", 16), title: f.properties?.name || "Water Fountain" });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#0077B6">Drinking Fountain</span><h3>${f.properties?.name || "Water Fountain"}</h3></div>`, { maxWidth: 200 });
          layer.addLayer(m);
        });
        fountainLayerRef.current = layer;
      } catch {}
    };
    const loadTransport = async () => {
      if (transportLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/public-transports.json`).then(r => r.json());
        const layer = L.layerGroup();
        (Array.isArray(data) ? data : (data.features || [])).forEach((item: any) => {
          const lat = item.lat ?? item.geometry?.coordinates?.[1];
          const lng = item.lng ?? item.geometry?.coordinates?.[0];
          if (!lat || !lng) return;
          const name = item.name || item.properties?.stop_name || "Transport Stop";
          const m = L.marker([lat, lng], { icon: makeIcon("#9B2335", 16, "3px"), title: name });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#9B2335">Transport</span><h3>${name}</h3></div>`, { maxWidth: 200 });
          layer.addLayer(m);
        });
        transportLayerRef.current = layer;
      } catch {}
    };
    const loadTrees = async () => {
      if (treeLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/trees.geojson`).then(r => r.json());
        if (!data.features?.length) return;
        const layer = L.layerGroup();
        data.features.forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          layer.addLayer(L.marker([lat, lng], { icon: makeIcon("#40916C", 10) }));
        });
        treeLayerRef.current = layer;
      } catch {}
    };
    const loadToilets = async () => {
      if (toiletLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/toilets-sydney.json`).then(r => r.json());
        const items = Array.isArray(data) ? data : (data.features || data.rows || []);
        if (!items.length) return;
        const layer = L.layerGroup();
        items.forEach((item: any) => {
          const lat = item.lat ?? item.latitude ?? item.geometry?.coordinates?.[1];
          const lng = item.lng ?? item.longitude ?? item.geometry?.coordinates?.[0];
          if (!lat || !lng) return;
          const name = item.name || item.toilet_name || item.properties?.name || "Public Toilet";
          const m = L.marker([lat, lng], { icon: makeIcon("#6D597A", 16, "3px"), title: name });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#6D597A">Public Toilet</span><h3>${name}</h3></div>`, { maxWidth: 200 });
          layer.addLayer(m);
        });
        toiletLayerRef.current = layer;
      } catch {}
    };

    if (filters.fountains) { loadFountains().then(() => { if (fountainLayerRef.current && !map.hasLayer(fountainLayerRef.current)) map.addLayer(fountainLayerRef.current); }); }
    else if (fountainLayerRef.current && map.hasLayer(fountainLayerRef.current)) map.removeLayer(fountainLayerRef.current);

    if (filters.transport) { loadTransport().then(() => { if (transportLayerRef.current && !map.hasLayer(transportLayerRef.current)) map.addLayer(transportLayerRef.current); }); }
    else if (transportLayerRef.current && map.hasLayer(transportLayerRef.current)) map.removeLayer(transportLayerRef.current);

    if (filters.toilets) { loadToilets().then(() => { if (toiletLayerRef.current && !map.hasLayer(toiletLayerRef.current)) map.addLayer(toiletLayerRef.current); }); }
    else if (toiletLayerRef.current && map.hasLayer(toiletLayerRef.current)) map.removeLayer(toiletLayerRef.current);

    if (filters.trees) {
      loadTrees().then(() => {
        if (treeLayerRef.current) {
          if (map.getZoom() >= TREE_ZOOM_THRESHOLD) { if (!map.hasLayer(treeLayerRef.current)) map.addLayer(treeLayerRef.current); setTreeZoomHint(false); }
          else setTreeZoomHint(true);
        }
      });
    } else { if (treeLayerRef.current && map.hasLayer(treeLayerRef.current)) map.removeLayer(treeLayerRef.current); setTreeZoomHint(false); }
  }, [filters.fountains, filters.transport, filters.toilets, filters.trees]);

  // Dog parks layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadDogs = async () => {
      if (dogLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/Dog_off-leash_parks.geojson`).then(r => r.json());
        const layer = L.layerGroup();
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          const always = p.OffLeashTime === "At all times";
          const marker = L.marker([lat, lng], { icon: makeIcon("#AACC00", 26, "50%", "🐾"), title: p.ParkName });
          const badge = always
            ? `<span class="pp-popup-badge-green">Always Off-Leash</span>`
            : `<span class="pp-popup-badge-orange">${p.OffLeashTime}</span>`;
          marker.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#AACC00;color:#000">🐕 Dog Park</span><h3>${p.ParkName}</h3><p>${p.Suburb}</p>${badge}${p.ProhibitedAreas ? `<p style="font-size:11px;margin-top:4px;color:#666">⚠ Not allowed: ${p.ProhibitedAreas}</p>` : ""}<p style="font-size:12px;margin-top:4px">${p.OffLeashDescription}</p></div>`, { maxWidth: 280 });
          layer.addLayer(marker);
        });
        dogLayerRef.current = layer;
      } catch {}
    };
    if (filters.dogs) { loadDogs().then(() => { if (dogLayerRef.current && !map.hasLayer(dogLayerRef.current)) map.addLayer(dogLayerRef.current); }); }
    else if (dogLayerRef.current && map.hasLayer(dogLayerRef.current)) map.removeLayer(dogLayerRef.current);
  }, [filters.dogs]);

  // NPWS facilities layer (clustered)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadNPWS = async () => {
      if (npwsLayerRef.current) return;
      try {
        const data = await fetch(`${BASE}data/npws-facilities-greater-sydney.geojson`).then(r => r.json());
        const cluster = (L as any).markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 17, chunkedLoading: true });
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          const color = npwsColor(p.d_SubtypeC || "");
          const marker = L.marker([lat, lng], { icon: makeIcon(color, 14), title: p.AssetName });
          marker.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:${color}">${p.d_SubtypeC || "Facility"}</span><h3>${p.AssetName || "NPWS Facility"}</h3>${p.d_LGA ? `<p>${p.d_LGA}</p>` : ""}${p.d_Branch ? `<p style="font-size:11px;color:#888">${p.d_Branch}</p>` : ""}${p.Comments ? `<p style="font-size:11px;margin-top:4px">${p.Comments}</p>` : ""}</div>`, { maxWidth: 260 });
          cluster.addLayer(marker);
        });
        npwsLayerRef.current = cluster;
      } catch {}
    };
    if (filters.npws) { loadNPWS().then(() => { if (npwsLayerRef.current && !map.hasLayer(npwsLayerRef.current)) map.addLayer(npwsLayerRef.current); }); }
    else if (npwsLayerRef.current && map.hasLayer(npwsLayerRef.current)) map.removeLayer(npwsLayerRef.current);
  }, [filters.npws]);

  // Filter parks list
  useEffect(() => {
    const q = search.toLowerCase();
    const parkKeys: (keyof Filters)[] = ["playground", "sports", "iconic", "neighbourhood", "pocket", "sportsfield"];
    const anyParkFilter = parkKeys.some(k => filters[k]);
    const result = allParks.filter(park => {
      if (q && !park.name.toLowerCase().includes(q) && !park.type.toLowerCase().includes(q) && !park.suburb.toLowerCase().includes(q)) return false;
      if (anyParkFilter) {
        return (filters.playground && park.hasPlayground) ||
          (filters.sports && (park.type === "Sportsfield" || park.type === "Sports")) ||
          (filters.iconic && park.type === "Iconic") ||
          (filters.neighbourhood && park.type === "Neighbourhood") ||
          (filters.pocket && park.type === "Pocket") ||
          (filters.sportsfield && park.type === "Sportsfield");
      }
      return true;
    });
    setFiltered(result);
  }, [allParks, search, filters]);

  const selectPark = useCallback((park: Park) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo([park.lat, park.lng], 17, { duration: 1.2, easeLinearity: 0.25 });
    setTimeout(() => {
      const marker = markersRef.current.find(m => {
        const ll = m.getLatLng();
        return Math.abs(ll.lat - park.lat) < 0.00001 && Math.abs(ll.lng - park.lng) < 0.00001;
      });
      if (marker) marker.openPopup();
    }, 1300);
  }, []);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) { toast("Geolocation not supported by your browser", "error"); return; }
    toast("Locating you…", "info");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!mapRef.current) return;
        if (locationMarkerRef.current) mapRef.current.removeLayer(locationMarkerRef.current);
        if (locationCircleRef.current) mapRef.current.removeLayer(locationCircleRef.current);
        locationMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ className: "", html: `<div class="pp-location-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
          title: "Your location",
        }).addTo(mapRef.current);
        locationCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: "#4A90E2", fillColor: "#4A90E2", fillOpacity: 0.1, weight: 1 }).addTo(mapRef.current);
        mapRef.current.flyTo([lat, lng], 15, { duration: 1.5, easeLinearity: 0.25 });
        toast("Location found!", "success");
      },
      () => toast("Could not get your location. Check browser permissions.", "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [toast]);

  const clearAll = useCallback(() => { setSearchInput(""); setSearch(""); setFilters(defaultFilters); }, []);
  const toggleFilter = (key: keyof Filters) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  const filterItems = [
    { key: "playground" as const, label: "Playgrounds", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
    { key: "sports" as const, label: "Sports", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: "iconic" as const, label: "Iconic Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { key: "neighbourhood" as const, label: "Neighbourhood", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: "pocket" as const, label: "Pocket Parks", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { key: "sportsfield" as const, label: "Sportsfields", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: "dogs" as const, label: "Dog Parks", icon: <span style={{ fontSize: 14 }}>🐕</span> },
    { key: "npws" as const, label: "NPWS Facilities", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: "fountains" as const, label: "Drinking Fountains", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12"/><path d="M5 12C5 8 8 4 12 4s7 4 7 8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg> },
    { key: "toilets" as const, label: "Public Toilets", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 7h10v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V7z"/><path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg> },
    { key: "transport" as const, label: "Public Transport", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/><path d="M8 21l-2 2M18 21l-2 2"/></svg> },
    { key: "trees" as const, label: "Trees", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/></svg> },
  ];

  const quickPills = [
    { label: "🛝 Playgrounds", key: "playground" as keyof Filters },
    { label: "🐕 Dog Parks", key: "dogs" as keyof Filters },
    { label: "🍖 NPWS/BBQ", key: "npws" as keyof Filters },
    { label: "⛲ Fountains", key: "fountains" as keyof Filters },
    { label: "🚻 Toilets", key: "toilets" as keyof Filters },
  ];

  const showingCount = filtered.length;
  const totalCount = allParks.length + 1605;

  return (
    <div className="pp-explore-page">
      <Navbar />
      <main className="pp-explore-main">
        <aside className={`pp-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <div className="pp-sidebar-header">
            <h2>Find Parks {activeFilterCount > 0 && <span className="pp-active-badge">{activeFilterCount}</span>}</h2>
            <button className="pp-sidebar-toggle" aria-label="Collapse sidebar" onClick={() => { setSidebarCollapsed(true); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>

          <div className="pp-search-container">
            <div className="pp-search-wrapper">
              <svg className="pp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text" className="pp-search-input" placeholder="Search parks, suburbs, types…"
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                aria-label="Search parks"
              />
              {searchInput && (
                <button className="pp-clear-btn" onClick={() => { setSearchInput(""); setSearch(""); }} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          </div>

          <div className="pp-quick-pills-container">
            {quickPills.map(p => (
              <button key={p.key} className={`pp-quick-pill${filters[p.key] ? " active" : ""}`} onClick={() => toggleFilter(p.key)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="pp-filters-container">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              All Filters
            </h3>
            <div className="pp-filter-group">
              {filterItems.map(item => (
                <label key={item.key} className="pp-filter-checkbox">
                  <input type="checkbox" checked={filters[item.key]} onChange={() => toggleFilter(item.key)} />
                  <span className="pp-checkmark" />
                  <span className="pp-filter-label">
                    {item.icon}
                    {item.label}
                    {item.key === "trees" && filters.trees && treeZoomHint && (
                      <small style={{ color: "#999", fontSize: 10, display: "block", marginLeft: 24 }}>(zoom in to see)</small>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear All</button>
          </div>

          <div className="pp-results-container">
            <div className="pp-results-header">
              <h3>Results</h3>
              <span className="pp-results-count">
                {activeFilterCount > 0 ? `${showingCount} parks` : `${totalCount.toLocaleString()} locations`}
              </span>
            </div>
            <div className="pp-results-list">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <div key={i} className="pp-skeleton-card" />)
              ) : filtered.length === 0 ? (
                <div className="pp-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <p>No parks found.</p>
                  {activeFilterCount > 0 && <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear filters</button>}
                </div>
              ) : (
                filtered.slice(0, 100).map(park => (
                  <div key={park.id} className="pp-park-card" onClick={() => selectPark(park)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && selectPark(park)} aria-label={`View ${park.name} on map`}>
                    <div className="pp-park-card-header">
                      <h4>{park.name}</h4>
                      <span className={`pp-park-type-badge ${park.type.toLowerCase().replace(/\s+/g, "-")}`}>{park.type}</span>
                    </div>
                    <div className="pp-park-card-facilities">
                      {park.hasPlayground && <span className="pp-facility-tag">🛝 Playground</span>}
                      {park.suburb && <span className="pp-facility-tag">{park.suburb}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="pp-map-container">
          <div id="park-map" ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
          <button className="pp-locate-btn" aria-label="Find my location" onClick={handleLocate} title="Find my location">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
            </svg>
          </button>
          {sidebarCollapsed && (
            <button className="pp-sidebar-open-btn" aria-label="Open sidebar" onClick={() => { setSidebarCollapsed(false); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          )}
        </section>
      </main>
      <ParkModal park={selectedPark} onClose={() => setSelectedPark(null)} />
    </div>
  );
}
