import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import { useTheme } from "../hooks/useTheme";
import { useToast } from "../context/ToastContext";
import { fetchWithCache, clearAllCache } from "../utils/dataCache";
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fuzzyScore(park: Park, q: string): number {
  if (!q) return 100;
  const name = park.name.toLowerCase();
  const suburb = (park.suburb || "").toLowerCase();
  const type = (park.type || "").toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 82;
  if (name.includes(q)) return 62;
  if (suburb === q) return 55;
  if (suburb.startsWith(q)) return 46;
  if (suburb.includes(q)) return 35;
  if (type.includes(q)) return 25;
  // Sequential character match
  let qi = 0;
  for (let i = 0; i < name.length && qi < q.length; i++) {
    if (name[i] === q[qi]) qi++;
  }
  if (qi === q.length) return Math.max(8, 18 - (name.length - q.length));
  return 0;
}

function calcCentroid(coords: number[][]): { lat: number; lng: number } {
  let sumLat = 0, sumLng = 0;
  coords.forEach(([lng, lat]) => { sumLng += lng; sumLat += lat; });
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

function parkMarkerColor(park: Park): string {
  if (park.hasPlayground) return "#E76F51";
  if (park.type === "Iconic") return "#FFD166";
  if (park.type === "Sportsfield" || park.type === "Sports") return "#F4A261";
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

// ── Types ─────────────────────────────────────────────────────────────────────
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

interface NpwsRaw { name: string; subtype: string; lat: number; lng: number }
interface DogRaw  { name: string; lat: number; lng: number }

// ── Component ────────────────────────────────────────────────────────────────
export default function Explore() {
  const { theme } = useTheme();
  const { toast } = useToast();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const mapRef             = useRef<L.Map | null>(null);
  const mapContainerRef    = useRef<HTMLDivElement>(null);
  const tileLayerRef       = useRef<L.TileLayer | null>(null);
  const markersRef         = useRef<L.Marker[]>([]);
  const fountainLayerRef   = useRef<L.LayerGroup | null>(null);
  const transportLayerRef  = useRef<L.LayerGroup | null>(null);
  const treeLayerRef       = useRef<L.LayerGroup | null>(null);
  const toiletLayerRef     = useRef<L.LayerGroup | null>(null);
  const blacktownLayerRef  = useRef<L.LayerGroup | null>(null);
  const dogLayerRef        = useRef<L.LayerGroup | null>(null);
  const npwsLayerRef       = useRef<L.LayerGroup | null>(null);
  const locationMarkerRef  = useRef<L.Marker | null>(null);
  const locationCircleRef  = useRef<L.Circle | null>(null);
  const treeRendererRef    = useRef<L.Canvas | null>(null);

  // Stable refs for map callbacks
  const filteredRef        = useRef<Park[]>([]);
  const geocodeNearbyRef   = useRef<Park[] | null>(null);
  const setSelectedParkRef = useRef<(p: Park) => void>(() => {});
  const searchInputRef     = useRef<HTMLInputElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [allParks,        setAllParks]        = useState<Park[]>([]);
  const [filtered,        setFiltered]        = useState<Park[]>([]);
  const [searchInput,     setSearchInput]     = useState("");
  const [search,          setSearch]          = useState("");
  const [filters,         setFilters]         = useState<Filters>(defaultFilters);
  const [selectedPark,    setSelectedPark]    = useState<Park | null>(null);
  const [sidebarCollapsed,setSidebarCollapsed]= useState(false);
  const [treeZoomHint,    setTreeZoomHint]    = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [geocodeNearby,   setGeocodeNearby]   = useState<Park[] | null>(null);
  const [geocodePlace,    setGeocodePlace]    = useState("");
  const [sortBy,          setSortBy]          = useState<"default"|"name"|"nearest">("default");
  const [userLocation,    setUserLocation]    = useState<{lat:number;lng:number}|null>(null);
  const [searchHistory,   setSearchHistory]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("parkpulse_history") || "[]"); } catch { return []; }
  });
  const [showHistory,     setShowHistory]     = useState(false);
  const [layerCounts,     setLayerCounts]     = useState<Record<string,number>>({});
  const [visibleCount,    setVisibleCount]    = useState(100);
  const [fromCache,       setFromCache]       = useState(false);
  const [npwsRawData,     setNpwsRawData]     = useState<NpwsRaw[]>([]);
  const [dogRawData,      setDogRawData]      = useState<DogRaw[]>([]);
  const [filtersOpen,     setFiltersOpen]     = useState(false);
  const [favoriteIds,     setFavoriteIds]     = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("parkpulse_favs") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [showFavOnly,     setShowFavOnly]     = useState(false);

  setSelectedParkRef.current = setSelectedPark;

  // ── Viewport-culled marker renderer ──────────────────────────────────────
  const renderMarkersForBounds = useCallback((parksToRender: Park[]) => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds().pad(0.5);
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    parksToRender.forEach(park => {
      if (!bounds.contains([park.lat, park.lng])) return;
      const marker = L.marker([park.lat, park.lng], {
        icon: makeIcon(parkMarkerColor(park)),
        title: park.name,
      });
      marker.bindPopup(() => {
        const div = document.createElement("div");
        div.className = "pp-popup";
        div.innerHTML = `
          <span class="pp-popup-type">${park.type}</span>
          <h3>${park.name}</h3>
          ${park.area ? `<p>Area: ${park.area >= 10000 ? (park.area / 10000).toFixed(2) + " ha" : park.area.toLocaleString() + " m²"}</p>` : ""}
          ${park.hasPlayground ? `<p style="font-size:12px;margin-top:4px">🛝 Has Playground</p>` : ""}
          <button class="pp-popup-btn" style="margin-top:8px">View Details</button>`;
        setTimeout(() => {
          div.querySelector(".pp-popup-btn")?.addEventListener("click", () =>
            setSelectedParkRef.current(park)
          );
        }, 0);
        return div;
      }, { maxWidth: 280 });
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, []);

  useEffect(() => { filteredRef.current = filtered; }, [filtered]);
  useEffect(() => { geocodeNearbyRef.current = geocodeNearby; }, [geocodeNearby]);

  // ── Debounce search + history ─────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      if (searchInput.trim().length >= 2) {
        setSearchHistory(prev => {
          const updated = [searchInput.trim(), ...prev.filter(h => h !== searchInput.trim())].slice(0, 5);
          try { localStorage.setItem("parkpulse_history", JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Clear geocode on new search
  useEffect(() => {
    setGeocodeNearby(null);
    setGeocodePlace("");
  }, [search]);

  // Reset visible count on search/filter/sort change
  useEffect(() => { setVisibleCount(100); }, [search, filters, sortBy, geocodeNearby]);

  // ── URL params ────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter && filter in defaultFilters) {
      setFilters(prev => ({ ...prev, [filter as keyof Filters]: true }));
    }
    if (params.get("locate") === "1") {
      setTimeout(() => handleLocate(), 1500);
    }
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-33.8688, 151.2093],
      zoom: 13,
      zoomControl: false,
      preferCanvas: true,
    });

    const initialTheme = document.documentElement.getAttribute("data-theme") || "default";
    tileLayerRef.current = L.tileLayer(TILE_URLS[initialTheme] || TILE_URLS.default, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false, metric: true }).addTo(map);

    map.on("moveend zoomend", () => {
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
      const currentParks = geocodeNearbyRef.current ?? filteredRef.current;
      renderMarkersForBounds(currentParks);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [renderMarkersForBounds]);

  // ── Swap tile URL on theme change ─────────────────────────────────────────
  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.default);
  }, [theme]);

  // ── Load parks (cached) ───────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [{ data: geojson, fromCache: cached }, { data: suburbs }] = await Promise.all([
          fetchWithCache<any>(`${BASE}data/Parks.geojson`, "pp_parks"),
          fetchWithCache<Record<string, { suburb: string }>>(`${BASE}data/parks-suburbs.json`, "pp_suburbs")
            .catch(() => ({ data: {} as Record<string, { suburb: string }>, fromCache: false })),
        ]);
        setFromCache(cached);
        const parks: Park[] = geojson.features.map((f: any, i: number) => {
          const p = f.properties; const g = f.geometry;
          let lat = -33.8688, lng = 151.2093;
          if (g.type === "Polygon") { const c = calcCentroid(g.coordinates[0]); lat = c.lat; lng = c.lng; }
          else if (g.type === "MultiPolygon") { const c = calcCentroid(g.coordinates[0][0]); lat = c.lat; lng = c.lng; }
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
        setLayerCounts(prev => ({ ...prev, parks: parks.length }));
      } catch (err) {
        console.error("Failed to load parks:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Blacktown layer (cached) ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    fetchWithCache<any>(`${BASE}data/blacktown.geojson`, "pp_blacktown")
      .then(({ data }) => {
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
        layer.addTo(mapRef.current);
      })
      .catch(() => {});
  }, []);

  // ── Re-render markers when filtered or geocodeNearby changes ──────────────
  useEffect(() => {
    filteredRef.current = filtered;
    const toRender = geocodeNearbyRef.current ?? filtered;
    renderMarkersForBounds(toRender);
  }, [filtered, renderMarkersForBounds]);

  useEffect(() => {
    geocodeNearbyRef.current = geocodeNearby;
    if (geocodeNearby !== null) renderMarkersForBounds(geocodeNearby);
    else renderMarkersForBounds(filteredRef.current);
  }, [geocodeNearby, renderMarkersForBounds]);

  // ── Overlay layers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loadFountains = async () => {
      if (fountainLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<any>(`${BASE}data/drinking-fountains.geojson`, "pp_fountains");
        const layer = L.layerGroup();
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const m = L.marker([lat, lng], { icon: makeIcon("#0077B6", 16), title: f.properties?.name || "Water Fountain" });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#0077B6">Drinking Fountain</span><h3>${f.properties?.name || "Water Fountain"}</h3></div>`, { maxWidth: 200 });
          layer.addLayer(m);
        });
        fountainLayerRef.current = layer;
        setLayerCounts(prev => ({ ...prev, fountains: data.features?.length ?? 0 }));
      } catch {}
    };

    const loadTransport = async () => {
      if (transportLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<any>(`${BASE}data/public-transports.json`, "pp_transport");
        const items = Array.isArray(data) ? data : (data.features || []);
        const layer = L.layerGroup();
        items.forEach((item: any) => {
          const lat = item.lat ?? item.geometry?.coordinates?.[1];
          const lng = item.lng ?? item.geometry?.coordinates?.[0];
          if (!lat || !lng) return;
          const name = item.name || item.properties?.stop_name || "Transport Stop";
          const m = L.marker([lat, lng], { icon: makeIcon("#9B2335", 16, "3px"), title: name });
          m.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#9B2335">Transport</span><h3>${name}</h3></div>`, { maxWidth: 200 });
          layer.addLayer(m);
        });
        transportLayerRef.current = layer;
        setLayerCounts(prev => ({ ...prev, transport: items.length }));
      } catch {}
    };

    // Trees: canvas renderer + circleMarker for maximum performance
    const loadTrees = async () => {
      if (treeLayerRef.current) return;
      try {
        if (!treeRendererRef.current) {
          treeRendererRef.current = L.canvas({ padding: 0.5 });
        }
        const renderer = treeRendererRef.current;
        const { data } = await fetchWithCache<any>(`${BASE}data/trees.geojson`, "pp_trees");
        if (!data.features?.length) return;
        const layer = L.layerGroup();
        const features = (data.features as any[]).filter(f => f.geometry?.coordinates);
        features.forEach((f: any) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const circle = L.circleMarker([lat, lng], {
            renderer,
            radius: 3,
            color: "#2D6A4F",
            fillColor: "#52B788",
            fillOpacity: 0.78,
            weight: 0.5,
            interactive: true,
          });
          if (p.common_name || p.species || p.genus) {
            circle.bindPopup(
              `<div class="pp-popup"><span class="pp-popup-type" style="background:#40916C">🌳 Tree</span><h3>${p.common_name || p.species || "Tree"}</h3>${p.genus ? `<p style="font-size:11px;color:var(--pp-text-muted)">${p.genus}</p>` : ""}${p.location ? `<p>${p.location}</p>` : ""}</div>`,
              { maxWidth: 200 }
            );
          }
          layer.addLayer(circle);
        });
        treeLayerRef.current = layer;
        setLayerCounts(prev => ({ ...prev, trees: features.length }));
      } catch {}
    };

    const loadToilets = async () => {
      if (toiletLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<any>(`${BASE}data/toilets-sydney.json`, "pp_toilets");
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
        setLayerCounts(prev => ({ ...prev, toilets: items.length }));
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

  // ── Dog parks layer (cached + raw data for modal cross-ref) ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadDogs = async () => {
      if (dogLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<any>(`${BASE}data/Dog_off-leash_parks.geojson`, "pp_dogs");
        const layer = L.layerGroup();
        const raw: DogRaw[] = [];
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          raw.push({ name: p.ParkName, lat, lng });
          const always = p.OffLeashTime === "At all times";
          const marker = L.marker([lat, lng], { icon: makeIcon("#AACC00", 26, "50%", "🐾"), title: p.ParkName });
          const badge = always
            ? `<span class="pp-popup-badge-green">Always Off-Leash</span>`
            : `<span class="pp-popup-badge-orange">${p.OffLeashTime}</span>`;
          marker.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:#AACC00;color:#000">🐕 Dog Park</span><h3>${p.ParkName}</h3><p>${p.Suburb}</p>${badge}${p.ProhibitedAreas ? `<p style="font-size:11px;margin-top:4px;color:#666">⚠ Not allowed: ${p.ProhibitedAreas}</p>` : ""}<p style="font-size:12px;margin-top:4px">${p.OffLeashDescription}</p></div>`, { maxWidth: 280 });
          layer.addLayer(marker);
        });
        dogLayerRef.current = layer;
        setDogRawData(raw);
        setLayerCounts(prev => ({ ...prev, dogs: raw.length }));
      } catch {}
    };
    if (filters.dogs) { loadDogs().then(() => { if (dogLayerRef.current && !map.hasLayer(dogLayerRef.current)) map.addLayer(dogLayerRef.current); }); }
    else if (dogLayerRef.current && map.hasLayer(dogLayerRef.current)) map.removeLayer(dogLayerRef.current);
  }, [filters.dogs]);

  // ── NPWS facilities layer (clustered, cached + raw for modal) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadNPWS = async () => {
      if (npwsLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<any>(`${BASE}data/npws-facilities-greater-sydney.geojson`, "pp_npws");
        const cluster = (L as any).markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 17, chunkedLoading: true });
        const raw: NpwsRaw[] = [];
        (data.features || []).forEach((f: any) => {
          if (!f.geometry?.coordinates) return;
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          raw.push({ name: p.AssetName || "NPWS Facility", subtype: p.d_SubtypeC || "Facility", lat, lng });
          const color = npwsColor(p.d_SubtypeC || "");
          const marker = L.marker([lat, lng], { icon: makeIcon(color, 14), title: p.AssetName });
          marker.bindPopup(`<div class="pp-popup"><span class="pp-popup-type" style="background:${color}">${p.d_SubtypeC || "Facility"}</span><h3>${p.AssetName || "NPWS Facility"}</h3>${p.d_LGA ? `<p>${p.d_LGA}</p>` : ""}${p.d_Branch ? `<p style="font-size:11px;color:#888">${p.d_Branch}</p>` : ""}${p.Comments ? `<p style="font-size:11px;margin-top:4px">${p.Comments}</p>` : ""}</div>`, { maxWidth: 260 });
          cluster.addLayer(marker);
        });
        npwsLayerRef.current = cluster;
        setNpwsRawData(raw);
        setLayerCounts(prev => ({ ...prev, npws: raw.length }));
      } catch {}
    };
    if (filters.npws) { loadNPWS().then(() => { if (npwsLayerRef.current && !map.hasLayer(npwsLayerRef.current)) map.addLayer(npwsLayerRef.current); }); }
    else if (npwsLayerRef.current && map.hasLayer(npwsLayerRef.current)) map.removeLayer(npwsLayerRef.current);
  }, [filters.npws]);

  // ── Filter parks list (with fuzzy scoring) ────────────────────────────────
  useEffect(() => {
    const q = search.toLowerCase().trim();
    const parkKeys: (keyof Filters)[] = ["playground", "sports", "iconic", "neighbourhood", "pocket", "sportsfield"];
    const anyParkFilter = parkKeys.some(k => filters[k]);

    const typeMatch = (park: Park) =>
      (filters.playground && park.hasPlayground) ||
      (filters.sports && (park.type === "Sportsfield" || park.type === "Sports")) ||
      (filters.iconic && park.type === "Iconic") ||
      (filters.neighbourhood && park.type === "Neighbourhood") ||
      (filters.pocket && park.type === "Pocket") ||
      (filters.sportsfield && park.type === "Sportsfield");

    if (!q) {
      setFiltered(anyParkFilter ? allParks.filter(typeMatch) : allParks);
      return;
    }

    const scored = allParks
      .map(park => ({ park, score: fuzzyScore(park, q) }))
      .filter(x => x.score > 0 && (!anyParkFilter || typeMatch(x.park)))
      .sort((a, b) => b.score - a.score)
      .map(x => x.park);

    setFiltered(scored);
  }, [allParks, search, filters]);

  // ── Geocode fallback ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim() || filtered.length > 0 || geocodeNearby !== null || allParks.length === 0) return;
    const controller = new AbortController();
    (async () => {
      try {
        const q = encodeURIComponent(`${search}, New South Wales, Australia`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1&countrycodes=au`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (data[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          const place = data[0].display_name.split(",")[0].trim();
          mapRef.current?.flyTo([lat, lng], 14, { duration: 1.2, easeLinearity: 0.25 });
          const nearby = [...allParks]
            .sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng))
            .slice(0, 20);
          setGeocodeNearby(nearby);
          setGeocodePlace(place);
          toast(`Showing parks near "${place}"`, "info");
        }
      } catch {}
    })();
    return () => controller.abort();
  }, [search, filtered.length, geocodeNearby, allParks, toast]);

  // ── Computed values ───────────────────────────────────────────────────────
  const sortedDisplayParks = useMemo(() => {
    let list = geocodeNearby ?? filtered;
    if (showFavOnly) list = list.filter(p => favoriteIds.has(p.id));
    if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "nearest" && userLocation) {
      const { lat, lng } = userLocation;
      return [...list].sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng));
    }
    return list;
  }, [filtered, geocodeNearby, sortBy, userLocation, showFavOnly, favoriteIds]);

  const suggestions = useMemo(() => {
    if (sortedDisplayParks.length > 0 || !search.trim() || geocodeNearby !== null) return [];
    const q = search.toLowerCase().trim();
    return allParks
      .map(p => ({ park: p, score: fuzzyScore(p, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.park);
  }, [allParks, search, sortedDisplayParks.length, geocodeNearby]);

  const nearbyNPWSFacilities = useMemo(() => {
    if (!selectedPark || npwsRawData.length === 0) return [];
    return npwsRawData
      .map(f => ({ ...f, distKm: haversineKm(selectedPark.lat, selectedPark.lng, f.lat, f.lng) }))
      .filter(f => f.distKm < 2)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 5);
  }, [selectedPark, npwsRawData]);

  const nearbyDogParkName = useMemo(() => {
    if (!selectedPark || dogRawData.length === 0) return null;
    const nearest = dogRawData
      .map(d => ({ ...d, distKm: haversineKm(selectedPark.lat, selectedPark.lng, d.lat, d.lng) }))
      .filter(d => d.distKm < 0.5)
      .sort((a, b) => a.distKm - b.distKm)[0];
    return nearest?.name ?? null;
  }, [selectedPark, dogRawData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const selectPark = useCallback((park: Park) => {
    if (!mapRef.current) return;
    setSelectedPark(park);
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
        setUserLocation({ lat, lng });
        setSortBy("nearest");
        if (!mapRef.current) return;
        if (locationMarkerRef.current) mapRef.current.removeLayer(locationMarkerRef.current);
        if (locationCircleRef.current) mapRef.current.removeLayer(locationCircleRef.current);
        locationMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ className: "", html: `<div class="pp-location-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
          title: "Your location",
        }).addTo(mapRef.current);
        locationCircleRef.current = L.circle([lat, lng], {
          radius: accuracy, color: "#4A90E2", fillColor: "#4A90E2", fillOpacity: 0.1, weight: 1,
        }).addTo(mapRef.current);
        mapRef.current.flyTo([lat, lng], 15, { duration: 1.5, easeLinearity: 0.25 });
        toast("Location found! Results sorted by distance.", "success");
      },
      () => toast("Could not get your location. Check browser permissions.", "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [toast]);

  const clearAll = useCallback(() => {
    setSearchInput(""); setSearch(""); setFilters(defaultFilters);
    setGeocodeNearby(null); setGeocodePlace("");
    setSortBy("default");
    setVisibleCount(100);
    setShowFavOnly(false);
    searchInputRef.current?.focus();
  }, []);

  const handleClearCache = useCallback(() => {
    clearAllCache();
    setFromCache(false);
    toast("Cache cleared. Reload the page to re-fetch fresh data.", "info");
  }, [toast]);

  const toggleFilter = (key: keyof Filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id); else next.delete(id);
      localStorage.setItem("parkpulse_favs", JSON.stringify([...next]));
      const name = allParks.find(p => p.id === id)?.name ?? "Park";
      toast(adding ? `Saved "${name}"` : `Removed "${name}" from saved`, adding ? "success" : "info");
      return next;
    });
  }, [allParks, toast]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0) + (showFavOnly ? 1 : 0);
  const totalCount = allParks.length + 1605;
  const displayParks = sortedDisplayParks;

  // ── Filter items config ───────────────────────────────────────────────────
  const filterItems = [
    { key: "playground" as const, label: "Playgrounds",   countKey: "playground",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
    { key: "sports" as const, label: "Sports Parks",      countKey: "sports",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: "iconic" as const, label: "Iconic Parks",      countKey: "iconic",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { key: "neighbourhood" as const, label: "Neighbourhood", countKey: "",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: "pocket" as const, label: "Pocket Parks",      countKey: "",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { key: "sportsfield" as const, label: "Sportsfields",  countKey: "",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg> },
    { key: "dogs" as const, label: "Dog Parks",            countKey: "dogs",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7.5" cy="6.5" r="2"/><circle cx="16.5" cy="6.5" r="2"/><circle cx="4.5" cy="11" r="2"/><circle cx="19.5" cy="11" r="2"/><path d="M12 22c-4.5 0-7.5-2.5-7.5-6 0-2.5 2-4 5-4h5c3 0 5 1.5 5 4 0 3.5-3 6-7.5 6z"/></svg> },
    { key: "npws" as const, label: "NPWS Facilities",      countKey: "npws",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: "fountains" as const, label: "Drinking Fountains", countKey: "fountains",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12"/><path d="M5 12C5 8 8 4 12 4s7 4 7 8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg> },
    { key: "toilets" as const, label: "Public Toilets",    countKey: "toilets",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 7h10v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V7z"/><path d="M5 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg> },
    { key: "transport" as const, label: "Public Transport", countKey: "transport",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M8 21l-2 2M18 21l-2 2"/></svg> },
    { key: "trees" as const, label: "Trees",               countKey: "trees",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22v-7l-2-2"/><path d="M17 8v.8A6 6 0 0 1 13.8 20v0H10v0A6.5 6.5 0 0 1 7 8h0a5 5 0 0 1 10 0Z"/></svg> },
  ];

  const quickPills = [
    { label: "🛝 Playgrounds", key: "playground" as keyof Filters },
    { label: "🐕 Dog Parks",   key: "dogs"       as keyof Filters },
    { label: "🍖 NPWS/BBQ",    key: "npws"       as keyof Filters },
    { label: "⛲ Fountains",   key: "fountains"  as keyof Filters },
    { label: "🚻 Toilets",     key: "toilets"    as keyof Filters },
  ];

  const favCount = [...allParks].filter(p => favoriteIds.has(p.id)).length;

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="pp-explore-page">
      <Navbar />
      <main className="pp-explore-main">

        {/* ── Sidebar ── */}
        <aside className={`pp-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>

          {/* Header */}
          <div className="pp-sidebar-header">
            <h2>
              Find Parks{" "}
              {activeFilterCount > 0 && <span className="pp-active-badge">{activeFilterCount}</span>}
            </h2>
            <button
              className="pp-sidebar-toggle"
              aria-label="Collapse sidebar"
              onClick={() => { setSidebarCollapsed(true); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          </div>

          {/* Search */}
          <div className="pp-search-container" style={{ position: "relative" }}>
            <div className="pp-search-wrapper">
              <svg className="pp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="pp-search-input"
                placeholder="Search parks, suburbs, types…"
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setShowHistory(false); }}
                onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
                onBlur={() => setTimeout(() => setShowHistory(false), 160)}
                onKeyDown={e => { if (e.key === "Escape") { clearAll(); } }}
                aria-label="Search parks"
                autoComplete="off"
              />
              {searchInput && (
                <button className="pp-clear-btn" onClick={clearAll} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            {showHistory && searchHistory.length > 0 && !searchInput && (
              <div className="pp-history-dropdown" role="listbox" aria-label="Recent searches">
                <div className="pp-history-header">
                  <span>Recent</span>
                  <button onClick={() => { setSearchHistory([]); localStorage.removeItem("parkpulse_history"); setShowHistory(false); }}>
                    Clear
                  </button>
                </div>
                {searchHistory.map((h, i) => (
                  <button
                    key={i}
                    className="pp-history-item"
                    role="option"
                    onMouseDown={() => { setSearchInput(h); setShowHistory(false); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, opacity: .5 }}>
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick pills */}
          <div className="pp-quick-pills-container">
            <button
              className={`pp-quick-pill pp-quick-pill-saved${showFavOnly ? " active" : ""}`}
              onClick={() => setShowFavOnly(v => !v)}
              title={favCount ? `${favCount} saved park${favCount !== 1 ? "s" : ""}` : "No saved parks yet"}
            >
              {showFavOnly ? "♥" : "♡"} Saved{favCount > 0 && <span className="pp-pill-count">{favCount}</span>}
            </button>
            {quickPills.map(p => (
              <button
                key={p.key}
                className={`pp-quick-pill${filters[p.key] ? " active" : ""}`}
                onClick={() => toggleFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filters (collapsible) */}
          <div className={`pp-filters-container${filtersOpen ? " open" : ""}`}>
            <button
              className="pp-filters-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(v => !v)}
            >
              <span className="pp-filters-toggle-left">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                Filters
                {Object.values(filters).some(Boolean) && (
                  <span className="pp-active-badge" style={{ fontSize: ".65rem" }}>
                    {Object.values(filters).filter(Boolean).length}
                  </span>
                )}
              </span>
              <svg
                className={`pp-filters-chevron${filtersOpen ? " rotated" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {filtersOpen && (
              <>
                <div className="pp-filter-group">
                  {filterItems.map(item => (
                    <label key={item.key} className="pp-filter-checkbox">
                      <input type="checkbox" checked={filters[item.key]} onChange={() => toggleFilter(item.key)} />
                      <span className="pp-checkmark" />
                      <span className="pp-filter-label">
                        {item.icon}
                        {item.label}
                        {item.key === "trees" && filters.trees && treeZoomHint && (
                          <small style={{ color: "#999", fontSize: 10, marginLeft: 4 }}>(zoom in)</small>
                        )}
                        {item.countKey && layerCounts[item.countKey] !== undefined && (
                          <span className="pp-layer-count">{layerCounts[item.countKey].toLocaleString()}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <button className="pp-btn pp-btn-outline pp-btn-small" style={{ marginTop: ".375rem" }} onClick={clearAll}>
                  Clear All
                </button>
              </>
            )}
          </div>

          {/* Results */}
          <div className="pp-results-container">
            <div className="pp-results-header">
              <h3>Results</h3>
              <span className="pp-results-count">
                {geocodePlace
                  ? `Near "${geocodePlace}"`
                  : activeFilterCount > 0
                    ? `${displayParks.length.toLocaleString()} parks`
                    : `${totalCount.toLocaleString()} locations`}
              </span>
            </div>

            {/* Sort bar */}
            <div className="pp-sort-bar" role="group" aria-label="Sort order">
              <span className="pp-sort-label">Sort:</span>
              {(["default", "name", "nearest"] as const).map(s => (
                <button
                  key={s}
                  className={`pp-sort-btn${sortBy === s ? " active" : ""}${s === "nearest" && !userLocation ? " disabled" : ""}`}
                  onClick={() => { if (s === "nearest" && !userLocation) { handleLocate(); } else setSortBy(s); }}
                  title={s === "nearest" && !userLocation ? "Click to enable location" : ""}
                >
                  {s === "default" ? "Default" : s === "name" ? "A–Z" : "Nearest"}
                </button>
              ))}
            </div>

            {/* Cache indicator */}
            {fromCache && (
              <div className="pp-cache-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.49"/>
                </svg>
                Cached data
                <button onClick={handleClearCache} title="Clear cache and reload fresh data">↺ refresh</button>
              </div>
            )}

            {geocodePlace && (
              <div className="pp-geocode-hint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Showing {displayParks.length} parks near <strong>{geocodePlace}</strong>
              </div>
            )}

            <div className="pp-results-list">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <div key={i} className="pp-skeleton-card" />)
              ) : displayParks.length === 0 && suggestions.length === 0 ? (
                <div className="pp-empty-state">
                  {showFavOnly && favoriteIds.size === 0 ? (
                    <>
                      <span style={{ fontSize: "2rem" }}>♡</span>
                      <p>No saved parks yet.</p>
                      <p style={{ fontSize: ".8rem" }}>Hover a park card and tap the heart to save it.</p>
                      <button className="pp-btn pp-btn-outline pp-btn-small" onClick={() => setShowFavOnly(false)}>Browse all parks</button>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <p>No parks found.</p>
                      {activeFilterCount > 0 && (
                        <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear filters</button>
                      )}
                    </>
                  )}
                </div>
              ) : displayParks.length === 0 && suggestions.length > 0 ? (
                <div className="pp-did-you-mean">
                  <p className="pp-dym-label">Did you mean…</p>
                  {suggestions.map(p => (
                    <button key={p.id} className="pp-dym-item" onClick={() => { setSearchInput(p.name); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13, opacity: .5 }}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>{p.name}</span>
                      {p.suburb && <span className="pp-dym-suburb">{p.suburb}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {displayParks.slice(0, visibleCount).map((park, i) => {
                    const dist = userLocation
                      ? haversineKm(userLocation.lat, userLocation.lng, park.lat, park.lng)
                      : null;
                    const typeClass = park.type.toLowerCase().replace(/\s+/g, "-");
                    return (
                      <div
                        key={park.id}
                        className="pp-park-card pp-card-stagger"
                        style={{ animationDelay: `${Math.min(i, 15) * 35}ms` }}
                        onClick={() => selectPark(park)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPark(park); } }}
                        aria-label={`View ${park.name}`}
                      >
                        <button
                          className={`pp-fav-btn${favoriteIds.has(park.id) ? " active" : ""}`}
                          onClick={e => toggleFavorite(park.id, e)}
                          aria-label={favoriteIds.has(park.id) ? `Remove ${park.name} from saved` : `Save ${park.name}`}
                          title={favoriteIds.has(park.id) ? "Remove from saved" : "Save park"}
                        >
                          {favoriteIds.has(park.id) ? "♥" : "♡"}
                        </button>
                        <div className="pp-park-card-header">
                          <h4>{park.name}</h4>
                          <span className={`pp-park-type-badge ${typeClass}`}>{park.type}</span>
                        </div>
                        <div className="pp-park-card-meta">
                          {park.suburb && <span className="pp-park-suburb-pill">{park.suburb}</span>}
                          {dist !== null && (
                            <span className="pp-park-distance">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10 }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                              </svg>
                              {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
                            </span>
                          )}
                        </div>
                        {(park.hasPlayground || park.area) && (
                          <div className="pp-park-card-facilities">
                            {park.hasPlayground && (
                              <span className="pp-facility-tag">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>
                                Playground
                              </span>
                            )}
                            {park.area && (
                              <span className="pp-facility-tag">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                                {park.area >= 10000 ? `${(park.area / 10000).toFixed(1)} ha` : `${Math.round(park.area / 100) * 100} m²`}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="pp-card-hover-hint">View on map →</div>
                      </div>
                    );
                  })}

                  {displayParks.length > visibleCount && (
                    <button
                      className="pp-load-more-btn"
                      onClick={() => setVisibleCount(v => v + 100)}
                    >
                      Show {Math.min(100, displayParks.length - visibleCount)} more
                      <span className="pp-load-more-count">({displayParks.length - visibleCount} remaining)</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ── Map ── */}
        <div className="pp-map-container">
          {sidebarCollapsed && (
            <button
              className="pp-sidebar-open-btn"
              aria-label="Open sidebar"
              onClick={() => { setSidebarCollapsed(false); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
          <button className="pp-locate-btn" aria-label="Locate me" onClick={handleLocate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/>
              <line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/>
              <line x1="12" y1="22" x2="12" y2="18"/>
            </svg>
          </button>
          <div id="park-map" ref={mapContainerRef} />
        </div>

        {/* Mobile FAB — opens sidebar on small screens */}
        {sidebarCollapsed && (
          <button
            className="pp-mobile-fab"
            aria-label="Open filters"
            onClick={() => { setSidebarCollapsed(false); setTimeout(() => mapRef.current?.invalidateSize(), 330); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filters{activeFilterCount > 0 && <span className="pp-mobile-fab-count">{activeFilterCount}</span>}
          </button>
        )}

      </main>

      {/* Modal */}
      {selectedPark && (
        <ParkModal
          park={selectedPark}
          onClose={() => setSelectedPark(null)}
          nearbyNPWS={nearbyNPWSFacilities}
          nearbyDogPark={nearbyDogParkName}
          isFavorite={favoriteIds.has(selectedPark.id)}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  );
}
