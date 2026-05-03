import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import { useTheme, THEMES, type Theme } from "../hooks/useTheme";
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
  default:   "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  sunset:    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  neon:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  minimal:   "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const TILE_ATTR_DEFAULT  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const TILE_ATTR_SAT      = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, USGS';

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

function sizeLabel(area: number): { label: string; cls: string } {
  if (area < 1000)  return { label: "Tiny",   cls: "pp-size-tiny" };
  if (area < 5000)  return { label: "Small",  cls: "pp-size-small" };
  if (area < 10000) return { label: "Medium", cls: "pp-size-med" };
  if (area < 50000) return { label: "Large",  cls: "pp-size-large" };
  return                   { label: "Massive",cls: "pp-size-massive" };
}

function fmtArea(area: number): string {
  if (area >= 10000) return `${(area / 10000).toFixed(1)} ha`;
  return `${area >= 1000 ? area.toLocaleString() : Math.round(area)} m²`;
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
  if (park.type === "Pocket") return "#9B59B6";
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
  const { theme, setTheme } = useTheme();
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
  const allParksRef        = useRef<Park[]>([]);
  const deepLinkHandledRef = useRef(false);

  // Stable refs for map callbacks
  const filteredRef        = useRef<Park[]>([]);
  const geocodeNearbyRef   = useRef<Park[] | null>(null);
  const setSelectedParkRef = useRef<(p: Park) => void>(() => {});
  const userLocationRef    = useRef<{lat:number;lng:number}|null>(null);
  const handleLocateRef    = useRef<() => void>(() => {});
  const searchInputRef     = useRef<HTMLInputElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const resultsListRef      = useRef<HTMLDivElement>(null);
  const lastViewedParkIdRef  = useRef<number | null>(null);
  const selectedParkRef      = useRef<Park | null>(null);

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
  const [sortBy,          setSortBy]          = useState<"default"|"name"|"nearest"|"size">("default");
  const [userLocation,    setUserLocation]    = useState<{lat:number;lng:number}|null>(null);
  const [searchHistory,   setSearchHistory]   = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("parkpulse_history") || "[]"); } catch { return []; }
  });
  const [showHistory,     setShowHistory]     = useState(false);
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [minArea,         setMinArea]         = useState(0);
  const [compactView,     setCompactView]     = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [layerCounts,     setLayerCounts]     = useState<Record<string,number>>({});
  const [visibleCount,    setVisibleCount]    = useState(100);
  const [fromCache,       setFromCache]       = useState(false);
  const [npwsRawData,     setNpwsRawData]     = useState<NpwsRaw[]>([]);
  const [dogRawData,      setDogRawData]      = useState<DogRaw[]>([]);
  const [filtersOpen,     setFiltersOpen]     = useState(false);
  const [visibleMapCount, setVisibleMapCount] = useState(0);
  const [favoriteIds,     setFavoriteIds]     = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem("parkpulse_favs") || "[]")); }
    catch { return new Set<number>(); }
  });
  const [showFavOnly,     setShowFavOnly]     = useState(false);
  const [recentParks,    setRecentParks]     = useState<Array<{id: number; name: string; type: string; suburb: string}>>(() => {
    try { return JSON.parse(localStorage.getItem("parkpulse_recent") || "[]"); } catch { return []; }
  });

  setSelectedParkRef.current = setSelectedPark;
  selectedParkRef.current    = selectedPark;

  // ── Refresh recents + scroll-to-card when modal closes ───────────────────
  useEffect(() => {
    if (selectedPark !== null) {
      lastViewedParkIdRef.current = selectedPark.id;
    } else {
      try { setRecentParks(JSON.parse(localStorage.getItem("parkpulse_recent") || "[]")); } catch {}
      const id = lastViewedParkIdRef.current;
      if (id !== null) {
        setTimeout(() => {
          const card = document.querySelector<HTMLElement>(`[data-park-id="${id}"]`);
          if (card) {
            card.scrollIntoView({ block: "nearest", behavior: "smooth" });
            card.classList.add("pp-card-flash");
            card.addEventListener("animationend", () => card.classList.remove("pp-card-flash"), { once: true });
          }
        }, 80);
      }
    }
  }, [selectedPark]);

  // ── Keyboard shortcuts: "/" focuses search, "?" shows help ───────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !isInput) {
        e.preventDefault();
        setSidebarCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      } else if ((e.key === "s" || e.key === "S") && !isInput) {
        e.preventDefault();
        surpriseMeRef.current();
      } else if ((e.key === "c" || e.key === "C") && !isInput) {
        e.preventDefault();
        setCompactView(v => !v);
      } else if ((e.key === "f" || e.key === "F") && !isInput) {
        e.preventDefault();
        const map = mapRef.current;
        if (!map) return;
        const parks = geocodeNearbyRef.current ?? filteredRef.current;
        if (!parks.length) return;
        const bounds = L.latLngBounds(parks.map(p => [p.lat, p.lng] as L.LatLngExpression));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true });
      } else if ((e.key === "t" || e.key === "T") && !isInput) {
        e.preventDefault();
        const currentIdx = THEMES.findIndex(t => t.id === document.documentElement.getAttribute("data-theme"));
        setTheme(THEMES[(currentIdx + 1) % THEMES.length].id);
      } else if (e.key === "1" && !isInput) {
        e.preventDefault(); setSortBy("default");
      } else if (e.key === "2" && !isInput) {
        e.preventDefault(); setSortBy("name");
      } else if (e.key === "3" && !isInput) {
        e.preventDefault();
        if (userLocationRef.current) { setSortBy("nearest"); } else { handleLocateRef.current(); }
      } else if (e.key === "4" && !isInput) {
        e.preventDefault(); setSortBy("size");
      } else if ((e.key === "l" || e.key === "L") && !isInput) {
        e.preventDefault();
        handleLocateRef.current();
      } else if ((e.key === "d" || e.key === "D") && !isInput) {
        e.preventDefault();
        setShowFavOnly(v => !v);
      } else if ((e.key === "w" || e.key === "W") && !isInput) {
        const park = selectedParkRef.current;
        if (park) {
          e.preventDefault();
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}&travelmode=walking`, "_blank", "noopener,noreferrer");
        }
      } else if ((e.key === "g" || e.key === "G") && !isInput) {
        const park = selectedParkRef.current;
        if (park) {
          e.preventDefault();
          window.open(`https://www.google.com/maps/@${park.lat},${park.lng},17z`, "_blank", "noopener,noreferrer");
        }
      } else if ((e.key === "n" || e.key === "N") && !isInput) {
        const park = selectedParkRef.current;
        if (park) {
          e.preventDefault();
          const parks = geocodeNearbyRef.current ?? filteredRef.current;
          const idx = parks.findIndex(p => p.id === park.id);
          if (idx >= 0 && idx < parks.length - 1) selectParkRef.current(parks[idx + 1]);
        }
      } else if ((e.key === "p" || e.key === "P") && !isInput) {
        const park = selectedParkRef.current;
        if (park) {
          e.preventDefault();
          const parks = geocodeNearbyRef.current ?? filteredRef.current;
          const idx = parks.findIndex(p => p.id === park.id);
          if (idx > 0) selectParkRef.current(parks[idx - 1]);
        }
      } else if ((e.key === "m" || e.key === "M") && !isInput) {
        e.preventDefault();
        mapRef.current?.flyTo([-33.8688, 151.2093], 13, { duration: 1.2, easeLinearity: 0.25 });
        toast("Recentred on Sydney CBD", "info");
      } else if (e.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setTheme, theme]);

  // ── Keyboard: arrow nav between result cards ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!resultsListRef.current) return;
      const cards = Array.from(resultsListRef.current.querySelectorAll<HTMLElement>(".pp-park-card[tabindex]"));
      if (!cards.length) return;
      const active = document.activeElement as HTMLElement;
      const idx = cards.indexOf(active);
      if (e.key === "ArrowDown") {
        if (active === searchInputRef.current) {
          e.preventDefault(); cards[0]?.focus(); cards[0]?.scrollIntoView({ block: "nearest" });
        } else if (idx >= 0 && idx < cards.length - 1) {
          e.preventDefault(); cards[idx + 1].focus(); cards[idx + 1].scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "ArrowUp") {
        if (idx === 0) {
          e.preventDefault(); searchInputRef.current?.focus();
        } else if (idx > 0) {
          e.preventDefault(); cards[idx - 1].focus(); cards[idx - 1].scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "Escape" && idx >= 0) {
        e.preventDefault(); searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Viewport-culled marker renderer ──────────────────────────────────────
  const renderMarkersForBounds = useCallback((parksToRender: Park[]) => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds().pad(0.5);
    const tightBounds = map.getBounds();
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    let inViewport = 0;
    parksToRender.forEach(park => {
      if (!bounds.contains([park.lat, park.lng])) return;
      if (tightBounds.contains([park.lat, park.lng])) inViewport++;
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
          ${park.suburb ? `<p style="font-size:12px;color:var(--pp-text-muted);margin-bottom:2px">📍 ${park.suburb}</p>` : ""}
          ${park.area ? `<p style="font-size:12px">📐 ${fmtArea(park.area)}</p>` : ""}
          ${park.hasPlayground ? `<p style="font-size:12px;margin-top:2px">🛝 Has Playground</p>` : ""}
          <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
            <button class="pp-popup-btn">View Details</button>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}" target="_blank" rel="noopener noreferrer" class="pp-popup-dir-link">Directions ↗</a>
          </div>`;
        div.querySelector(".pp-popup-btn")?.addEventListener("click", () =>
          setSelectedParkRef.current(park)
        );
        return div;
      }, { maxWidth: 280 });
      marker.addTo(map);
      markersRef.current.push(marker);
    });
    setVisibleMapCount(inViewport);
  }, []);

  useEffect(() => { filteredRef.current = filtered; }, [filtered]);
  useEffect(() => { geocodeNearbyRef.current = geocodeNearby; }, [geocodeNearby]);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

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

  // ── Results list scroll-to-top visibility ────────────────────────────────
  useEffect(() => {
    const el = resultsListRef.current;
    if (!el) return;
    const handler = () => setShowScrollTop(el.scrollTop > 320);
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // ── Infinite scroll sentinel ──────────────────────────────────────────────
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(v => v + 50);
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  // ── URL params (on mount) ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter && filter in defaultFilters) {
      setFilters(prev => ({ ...prev, [filter as keyof Filters]: true }));
    }
    if (params.get("locate") === "1") {
      setTimeout(() => handleLocate(), 1500);
    }
    const q = params.get("q");
    if (q) { setSearchInput(q); setSearch(q); }
    const sort = params.get("sort");
    if (sort === "name" || sort === "nearest" || sort === "size") setSortBy(sort);
    const themeParam = params.get("theme");
    if (themeParam && THEMES.some(t => t.id === themeParam)) setTheme(themeParam as Theme);
  }, []);

  // ── URL sync: update ?q= and ?sort= as state changes ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set("q", search); else params.delete("q");
    if (sortBy !== "default") params.set("sort", sortBy); else params.delete("sort");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
  }, [search, sortBy]);

  // ── Deep-link: open park from ?park= / ?surprise=1 URL param ─────────────
  useEffect(() => {
    if (deepLinkHandledRef.current || allParks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const parkName = params.get("park");
    const isSurprise = params.get("surprise") === "1";
    if (!parkName && !isSurprise) { deepLinkHandledRef.current = true; return; }
    if (isSurprise) {
      deepLinkHandledRef.current = true;
      const pick = allParks[Math.floor(Math.random() * allParks.length)];
      setSelectedPark(pick);
      setTimeout(() => mapRef.current?.flyTo([pick.lat, pick.lng], 17, { duration: 1.5, easeLinearity: 0.25 }), 200);
      return;
    }
    if (parkName) {
      const decoded = decodeURIComponent(parkName);
      const found = allParks.find(p => p.name === decoded);
      if (found) {
        deepLinkHandledRef.current = true;
        setSelectedPark(found);
        setTimeout(() => mapRef.current?.flyTo([found.lat, found.lng], 17, { duration: 1.5, easeLinearity: 0.25 }), 150);
      }
    }
  }, [allParks]);

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
    const isSat = initialTheme === "satellite";
    tileLayerRef.current = L.tileLayer(TILE_URLS[initialTheme] || TILE_URLS.default, {
      attribution: isSat ? TILE_ATTR_SAT : TILE_ATTR_DEFAULT,
      subdomains: isSat ? "" : "abcd",
      maxZoom: 19,
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
    const isSat = theme === "satellite";
    tileLayerRef.current.setUrl(TILE_URLS[theme] || TILE_URLS.default);
    tileLayerRef.current.options.subdomains = isSat ? "" : "abcd";
    const map = mapRef.current;
    if (map) {
      const attrCtrl = (map as any).attributionControl;
      if (attrCtrl) {
        attrCtrl.removeAttribution(TILE_ATTR_DEFAULT);
        attrCtrl.removeAttribution(TILE_ATTR_SAT);
        attrCtrl.addAttribution(isSat ? TILE_ATTR_SAT : TILE_ATTR_DEFAULT);
      }
    }
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
        allParksRef.current = parks;
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
          const park = allParksRef.current
            .map(candidate => ({ candidate, dist: haversineKm(lat, lng, candidate.lat, candidate.lng) }))
            .sort((a, b) => a.dist - b.dist)[0]?.candidate ?? null;
          const circle = L.circleMarker([lat, lng], {
            renderer,
            radius: 3,
            color: "#2D6A4F",
            fillColor: "#52B788",
            fillOpacity: 0.78,
            weight: 0.5,
            interactive: true,
          });
          const popup = document.createElement("div");
          popup.className = "pp-popup";
          popup.innerHTML = `
            <span class="pp-popup-type" style="background:#40916C">🌳 Tree</span>
            <h3>${p.common_name || p.species || "Tree"}</h3>
            ${p.genus ? `<p style="font-size:11px;color:var(--pp-text-muted)">${p.genus}</p>` : ""}
            ${p.location ? `<p>${p.location}</p>` : ""}
            ${park ? `<p style="font-size:11px;margin-top:4px">Nearest park: ${park.name}</p>` : ""}
            <button class="pp-popup-btn" style="margin-top:8px">${park ? "View nearest park" : "View details"}</button>
          `;
          popup.querySelector(".pp-popup-btn")?.addEventListener("click", () => {
            if (park) setSelectedParkRef.current(park);
            else if (p.common_name || p.species || p.genus) toast(`Tree: ${p.common_name || p.species || "unknown"}`, "info");
          });
          circle.bindPopup(popup, { maxWidth: 240 });
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

    const areaPass = (park: Park) => !minArea || (park.area != null && park.area >= minArea);

    if (!q) {
      setFiltered(allParks.filter(p => (!anyParkFilter || typeMatch(p)) && areaPass(p)));
      return;
    }

    const scored = allParks
      .map(park => ({ park, score: fuzzyScore(park, q) }))
      .filter(x => x.score > 0 && (!anyParkFilter || typeMatch(x.park)) && areaPass(x.park))
      .sort((a, b) => b.score - a.score)
      .map(x => x.park);

    setFiltered(scored);
  }, [allParks, search, filters, minArea]);

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
            .slice(0, 50);
          setGeocodeNearby(nearby);
          setGeocodePlace(place);
          toast(`Showing parks near "${place}"`, "info");
        }
      } catch {}
    })();
    return () => controller.abort();
  }, [search, filtered.length, geocodeNearby, allParks, toast]);

  // ── Computed values ───────────────────────────────────────────────────────
  const parkStats = useMemo(() => ({
    playgrounds:   allParks.filter(p => p.hasPlayground).length,
    iconic:        allParks.filter(p => p.type === "Iconic").length,
    neighbourhood: allParks.filter(p => p.type === "Neighbourhood").length,
    sports:        allParks.filter(p => p.type === "Sportsfield" || p.type === "Sports").length,
    pocket:        allParks.filter(p => p.type === "Pocket").length,
  }), [allParks]);

  // Keep layerCounts in sync with parkStats so filter badges show counts
  useEffect(() => {
    if (!allParks.length) return;
    setLayerCounts(prev => ({
      ...prev,
      playground:         parkStats.playgrounds,
      sports:             parkStats.sports,
      iconic:             parkStats.iconic,
      neighbourhood_stat: parkStats.neighbourhood,
      pocket_stat:        parkStats.pocket,
      sportsfield_stat:   allParks.filter(p => p.type === "Sportsfield").length,
    }));
  }, [parkStats, allParks]);

  const sortedDisplayParks = useMemo(() => {
    let list = geocodeNearby ?? filtered;
    if (showFavOnly) list = list.filter(p => favoriteIds.has(p.id));
    if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "size") return [...list].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    if (sortBy === "nearest" && userLocation) {
      const { lat, lng } = userLocation;
      return [...list].sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng));
    }
    return list;
  }, [filtered, geocodeNearby, sortBy, userLocation, showFavOnly, favoriteIds]);

  const autoCompleteSuggestions = useMemo(() => {
    if (!searchFocused || searchInput.length < 1 || allParks.length === 0) return [];
    const q = searchInput.toLowerCase().trim();
    const uniqueSuburbs = [...new Set(allParks.map(p => p.suburb).filter((s): s is string => !!s))];
    const suburbHits = uniqueSuburbs
      .filter(s => s.toLowerCase().startsWith(q))
      .slice(0, 3)
      .map(s => ({ kind: "suburb" as const, label: s, sub: `Suburb · ${allParks.filter(p => p.suburb === s).length} parks`, value: s }));
    const parkHits = allParks
      .filter(p => p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(` ${q}`))
      .slice(0, 3)
      .map(p => ({ kind: "park" as const, label: p.name, sub: `${p.type}${p.suburb ? ` · ${p.suburb}` : ""}`, value: p.name }));
    const typeKeywords: Array<{ label: string; sub: string; value: string }> = [
      { label: "Pocket Parks",       sub: `${parkStats.pocket} parks`,        value: "pocket"        },
      { label: "Iconic Parks",       sub: `${parkStats.iconic} parks`,         value: "iconic"        },
      { label: "Neighbourhood Parks",sub: `${parkStats.neighbourhood} parks`,  value: "neighbourhood" },
      { label: "Playgrounds",        sub: `${parkStats.playgrounds} parks`,    value: "playground"    },
      { label: "Sportsfields",       sub: `${parkStats.sports} parks`,         value: "sportsfield"   },
      { label: "Dog Parks",          sub: "off-leash areas",                   value: "dog park"      },
    ].filter(t => t.label.toLowerCase().includes(q) || t.value.includes(q));
    const typeHits = typeKeywords.slice(0, 2).map(t => ({ kind: "type" as const, label: t.label, sub: t.sub, value: t.value }));
    const combined = [...suburbHits, ...parkHits, ...typeHits].slice(0, 7);
    return combined;
  }, [allParks, searchInput, searchFocused, parkStats]);

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
      .slice(0, 7);
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
    setMinArea(0);
    searchInputRef.current?.focus();
  }, []);

  const [showScrollTop,   setShowScrollTop]   = useState(false);
  const [showShortcuts,   setShowShortcuts]   = useState(false);
  handleLocateRef.current = handleLocate;
  const selectParkRef = useRef<(park: Park) => void>(() => {});
  selectParkRef.current = selectPark;
  const surpriseMeRef = useRef<() => void>(() => {});
  surpriseMeRef.current = () => {
    const list = sortedDisplayParks;
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * Math.min(list.length, visibleCount))];
    selectPark(pick);
    toast(`🎲 ${pick.name}${pick.suburb ? ` · ${pick.suburb}` : ""}`, "info");
  };
  const surpriseMe = useCallback(() => surpriseMeRef.current(), []);

  const exportFavorites = useCallback(() => {
    const favParks = allParks.filter(p => favoriteIds.has(p.id));
    if (!favParks.length) return;
    const lines = favParks.map(p => {
      const area = p.area ? (p.area >= 10000 ? (p.area / 10000).toFixed(1) + " ha" : p.area.toLocaleString() + " m²") : "";
      const maps = `https://maps.google.com/?q=${p.lat},${p.lng}`;
      return `${p.name}${p.suburb ? ` — ${p.suburb}` : ""} (${p.type}${area ? `, ${area}` : ""})\n  📍 ${maps}`;
    });
    const text = `My Saved Parks (${favParks.length})\n${"─".repeat(30)}\n${lines.join("\n\n")}`;
    navigator.clipboard.writeText(text)
      .then(() => toast(`Copied ${favParks.length} parks to clipboard`, "success"))
      .catch(() => toast("Could not copy to clipboard", "error"));
  }, [allParks, favoriteIds, toast]);

  const copySearchLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => toast("Search link copied!", "success"))
      .catch(() => toast("Could not copy link", "error"));
  }, [toast]);

  const fitToResults = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const parks = geocodeNearbyRef.current ?? filteredRef.current;
    if (!parks.length) return;
    const bounds = L.latLngBounds(parks.map(p => [p.lat, p.lng] as L.LatLngExpression));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true });
  }, []);

  const handleClearCache = useCallback(() => {
    clearAllCache();
    setFromCache(false);
    toast("Cache cleared. Reload the page to re-fetch fresh data.", "info");
  }, [toast]);

  const toggleFilter = (key: keyof Filters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleFavorite = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id); else next.delete(id);
      localStorage.setItem("parkpulse_favs", JSON.stringify([...next]));
      const name = allParks.find(p => p.id === (id as number))?.name ?? "Park";
      toast(adding ? `Saved "${name}"` : `Removed "${name}" from saved`, adding ? "success" : "info");
      return next;
    });
  }, [allParks, toast]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0) + (showFavOnly ? 1 : 0);
  const totalCount = allParks.length + 1605;
  const displayParks = sortedDisplayParks;

  // ── Filter items config ───────────────────────────────────────────────────
  const filterEmoji: Partial<Record<keyof Filters, string>> = {
    playground: "🛝", sports: "⚽", iconic: "⭐", neighbourhood: "🏘",
    pocket: "🌿", sportsfield: "🏟", dogs: "🐕", npws: "🍖",
    fountains: "⛲", toilets: "🚻", transport: "🚌", trees: "🌳",
  };

  const filterItems = [
    { key: "playground" as const, label: "Playgrounds",   countKey: "playground",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
    { key: "sports" as const, label: "Sports Parks",      countKey: "sports",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { key: "iconic" as const, label: "Iconic Parks",      countKey: "iconic",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
    { key: "neighbourhood" as const, label: "Neighbourhood", countKey: "neighbourhood_stat",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: "pocket" as const, label: "Pocket Parks",      countKey: "pocket_stat",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { key: "sportsfield" as const, label: "Sportsfields",  countKey: "sportsfield_stat",
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
    { label: "🐕 Dog Parks",   key: "dogs"          as keyof Filters },
    { label: "⭐ Iconic",       key: "iconic"       as keyof Filters },
    { label: "🌿 Pocket",       key: "pocket"      as keyof Filters },
    { label: "🏘 Neighbourhood",key: "neighbourhood" as keyof Filters },
    { label: "⚽ Sports",       key: "sports"       as keyof Filters },
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
                onFocus={() => { setSearchFocused(true); if (!searchInput && searchHistory.length > 0) setShowHistory(true); }}
                onBlur={() => { setTimeout(() => { setShowHistory(false); setSearchFocused(false); }, 160); }}
                onKeyDown={e => {
                  if (e.key === "Escape") { clearAll(); }
                  else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const first = resultsListRef.current?.querySelector<HTMLElement>(".pp-park-card[tabindex]");
                    first?.focus(); first?.scrollIntoView({ block: "nearest" });
                  }
                }}
                aria-label="Search parks"
                autoComplete="off"
              />
              {searchInput ? (
                <button className="pp-clear-btn" onClick={clearAll} aria-label="Clear search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              ) : (
                <kbd className="pp-search-kbd" title="Press / to focus search">/</kbd>
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
            {!showHistory && autoCompleteSuggestions.length > 0 && (
              <div className="pp-autocomplete-dropdown" role="listbox" aria-label="Suggestions">
                {autoCompleteSuggestions.map((item, i) => (
                  <button
                    key={i}
                    className="pp-autocomplete-item"
                    role="option"
                    onMouseDown={() => { setSearchInput(item.value); setSearchFocused(false); }}
                  >
                    {item.kind === "suburb" ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pp-ac-icon">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                    ) : item.kind === "type" ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pp-ac-icon">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pp-ac-icon">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                    )}
                    <span className="pp-ac-label">{item.label}</span>
                    <span className={`pp-ac-kind pp-ac-kind-${item.kind}`}>
                      {item.kind === "suburb" ? "Suburb" : item.kind === "type" ? "Type" : "Park"}
                    </span>
                    <span className="pp-ac-sub">{item.sub}</span>
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
            <button
              className="pp-quick-pill pp-quick-pill-surprise"
              onClick={surpriseMe}
              title="Open a random park (S)"
            >
              🎲 Surprise
            </button>
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
                {/* Min area filter */}
                <div className="pp-area-filter">
                  <span className="pp-area-filter-label">Min size</span>
                  <div className="pp-area-filter-btns">
                    {([
                      { val: 0,     label: "Any" },
                      { val: 500,   label: "500m²+" },
                      { val: 2000,  label: "2,000m²+" },
                      { val: 10000, label: "1ha+" },
                      { val: 50000, label: "5ha+" },
                    ] as const).map(({ val, label }) => (
                      <button
                        key={val}
                        className={`pp-area-btn${minArea === val ? " active" : ""}`}
                        onClick={() => setMinArea(val)}
                      >{label}</button>
                    ))}
                  </div>
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
              <div style={{ display: "flex", alignItems: "center", gap: ".375rem" }}>
                <span className="pp-results-count">
                  {geocodePlace
                    ? `Near "${geocodePlace}"`
                    : activeFilterCount > 0
                      ? (() => {
                          const withArea = displayParks.filter(p => p.area);
                          const totalHa = withArea.reduce((s, p) => s + (p.area ?? 0), 0) / 10000;
                          return `${displayParks.length.toLocaleString()} parks${withArea.length > 1 ? ` · ${totalHa.toFixed(0)} ha` : ""}`;
                        })()
                      : `${totalCount.toLocaleString()} locations`}
                </span>
                {showFavOnly && favoriteIds.size > 0 && (
                  <button className="pp-export-btn" onClick={exportFavorites} title="Copy saved parks list to clipboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                )}
                {(activeFilterCount > 0 || search || geocodeNearby) && (
                  <button className="pp-fit-btn" onClick={copySearchLink} title="Copy link to this search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </button>
                )}
                {displayParks.length > 0 && (
                  <button className="pp-fit-btn" onClick={surpriseMe} title="Open a random park from results" style={{ borderRadius: "var(--pp-radius-sm)" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                  </button>
                )}
                <button
                  className={`pp-fit-btn${compactView ? " active-btn" : ""}`}
                  onClick={() => setCompactView(v => !v)}
                  title={compactView ? "Switch to normal view" : "Switch to compact view"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
                {(activeFilterCount > 0 || geocodeNearby) && displayParks.length > 1 && (
                  <button className="pp-fit-btn" onClick={fitToResults} title="Fit map to results">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                    </svg>
                  </button>
                )}
                <button
                  className={`pp-fit-btn${showShortcuts ? " active-btn" : ""}`}
                  onClick={() => setShowShortcuts(v => !v)}
                  title="Keyboard shortcuts (?)"
                  style={{ fontFamily: "serif", fontWeight: 700, fontSize: "1rem", lineHeight: 1 }}
                >?</button>
              </div>
            </div>
            {/* Active filter chips — quick-remove individual filters */}
            {(Object.entries(filters).some(([, v]) => v) || minArea > 0) && (
              <div className="pp-active-chips">
                {(Object.entries(filters) as [keyof Filters, boolean][])
                  .filter(([, v]) => v)
                  .map(([key]) => {
                    const item = filterItems.find(f => f.key === key);
                    const emoji = filterEmoji[key];
                    return (
                      <button
                        key={key}
                        className="pp-active-chip"
                        onClick={() => setFilters(prev => ({ ...prev, [key]: false }))}
                        title={`Remove ${item?.label ?? key} filter`}
                      >
                        {emoji && <span style={{ marginRight: ".1rem" }}>{emoji}</span>}
                        {item?.label ?? key}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    );
                  })}
                {minArea > 0 && (
                  <button className="pp-active-chip" onClick={() => setMinArea(0)} title="Remove area filter">
                    ≥{fmtArea(minArea)}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Type breakdown strip — visible when filtered results are non-empty */}
            {!loading && (activeFilterCount > 0 || search || geocodeNearby) && displayParks.length > 3 && (() => {
              const counts: Record<string, number> = {};
              displayParks.forEach(p => { counts[p.type] = (counts[p.type] ?? 0) + 1; });
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const typeColors: Record<string, string> = {
                Park: "var(--pp-primary)", Playground: "#f97316", Iconic: "#f59e0b",
                Sportsfield: "#ef4444", Sports: "#ef4444", Neighbourhood: "#0d9488",
                Pocket: "#8b5cf6", "Off-leash": "#84cc16",
              };
              const typeFilterMap: Partial<Record<string, keyof typeof filters>> = {
                Playground: "playground", Iconic: "iconic",
                Sportsfield: "sportsfield", Sports: "sportsfield",
                Neighbourhood: "neighbourhood", Pocket: "pocket",
              };
              const suburbCounts: Record<string, number> = {};
              displayParks.forEach(p => { if (p.suburb) suburbCounts[p.suburb] = (suburbCounts[p.suburb] ?? 0) + 1; });
              const topSuburb = Object.entries(suburbCounts).sort((a, b) => b[1] - a[1])[0];
              return (
                <div className="pp-type-breakdown">
                  {sorted.map(([type, count]) => {
                    const fKey = typeFilterMap[type];
                    return (
                      <button
                        key={type}
                        className={`pp-type-breakdown-item${fKey && filters[fKey] ? " active" : ""}`}
                        onClick={() => fKey && setFilters(prev => ({ ...prev, [fKey]: !prev[fKey] }))}
                        title={fKey ? `Filter by ${type}` : undefined}
                        style={{ cursor: fKey ? "pointer" : "default" }}
                      >
                        <span className="pp-type-breakdown-dot" style={{ background: typeColors[type] ?? "var(--pp-primary)" }} />
                        {type} <span className="pp-type-breakdown-count">{count}</span>
                      </button>
                    );
                  })}
                  {topSuburb && topSuburb[1] > 1 && (
                    <button
                      className="pp-type-breakdown-item"
                      onClick={() => { setSearchInput(topSuburb[0]); setSearch(topSuburb[0]); setGeocodeNearby(null); setGeocodePlace(""); }}
                      title={`Search parks in ${topSuburb[0]}`}
                      style={{ marginLeft: "auto", color: "var(--pp-primary)" }}
                    >
                      📍 {topSuburb[0]} <span className="pp-type-breakdown-count">{topSuburb[1]}</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Park stats — visible only when idle; each is a filter shortcut */}
            {!loading && !search && !geocodeNearby && !showFavOnly && !activeFilterCount && parkStats.playgrounds > 0 && (
              <div className="pp-park-stats-bar">
                {([
                  { emoji: "🛝", count: parkStats.playgrounds,       filterKey: "playground"    as const, label: "playgrounds" },
                  { emoji: "⭐", count: parkStats.iconic,            filterKey: "iconic"        as const, label: "iconic parks" },
                  { emoji: "🐕", count: layerCounts.dogs ?? 29,      filterKey: "dogs"          as const, label: "dog parks" },
                  { emoji: "🌿", count: parkStats.pocket,            filterKey: "pocket"        as const, label: "pocket parks" },
                  { emoji: "🏘",  count: parkStats.neighbourhood,    filterKey: "neighbourhood" as const, label: "neighbourhood parks" },
                  { emoji: "⚽", count: parkStats.sports,            filterKey: "sportsfield"   as const, label: "sportsfields" },
                ] as const).map(({ emoji, count, filterKey, label }) => (
                  <button
                    key={filterKey}
                    className="pp-stat-pill"
                    title={`Filter to ${label}`}
                    onClick={() => { setFilters(prev => ({ ...prev, [filterKey]: true })); setFiltersOpen(true); }}
                  >
                    {emoji} {count}
                  </button>
                ))}
              </div>
            )}

            {/* Sort bar */}
            <div className="pp-sort-bar" role="group" aria-label="Sort order">
              <span className="pp-sort-label">Sort:</span>
              {(["default", "name", "nearest", "size"] as const).map(s => (
                <button
                  key={s}
                  className={`pp-sort-btn${sortBy === s ? " active" : ""}${s === "nearest" && !userLocation ? " disabled" : ""}`}
                  onClick={() => { if (s === "nearest" && !userLocation) { handleLocate(); } else setSortBy(s); }}
                  title={s === "nearest" && !userLocation ? "Click to enable location" : s === "size" ? "Largest parks first" : ""}
                >
                  {s === "default" ? "Default" : s === "name" ? "A–Z" : s === "nearest" ? "Nearest" : "Largest"}
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
                <span style={{ flex: 1 }}>Showing {displayParks.length} parks near <strong>{geocodePlace}</strong></span>
                <button
                  style={{ marginLeft: ".375rem", color: "var(--pp-text-muted)", lineHeight: 1, flexShrink: 0 }}
                  title="Clear location filter"
                  onClick={() => { setGeocodeNearby(null); setGeocodePlace(""); setSearchInput(""); setSearch(""); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 13, height: 13 }}>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}

            {/* Sort summary banners */}
            {!loading && sortBy === "size" && displayParks.length > 0 && (() => {
              const withArea = displayParks.filter(p => p.area);
              const totalHa = withArea.reduce((sum, p) => sum + (p.area ?? 0), 0) / 10000;
              const top = displayParks[0];
              return (
                <div className="pp-sort-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                  </svg>
                  <span>
                    Largest first · <strong>{top.name}</strong> leads at {top.area ? fmtArea(top.area) : "—"}
                    {withArea.length > 1 && <> · {withArea.length}/{displayParks.length} have area data · combined {totalHa.toFixed(0)} ha</>}
                  </span>
                </div>
              );
            })()}
            {!loading && sortBy === "name" && displayParks.length > 1 && (() => {
              const first = displayParks[0].name;
              const last  = displayParks[displayParks.length - 1].name;
              return (
                <div className="pp-sort-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/>
                  </svg>
                  <span>
                    A–Z · <strong>{first.slice(0, 20)}{first.length > 20 ? "…" : ""}</strong> → <strong>{last.slice(0, 20)}{last.length > 20 ? "…" : ""}</strong> · {displayParks.length} parks
                  </span>
                </div>
              );
            })()}
            {!loading && sortBy === "nearest" && displayParks.length > 0 && userLocation && (() => {
              const within1km = displayParks.filter(p =>
                p.lat != null && haversineKm(userLocation.lat, userLocation.lng, p.lat!, p.lng!) < 1
              ).length;
              const nearest = displayParks[0];
              const nearestDist = nearest.lat != null
                ? haversineKm(userLocation.lat, userLocation.lng, nearest.lat, nearest.lng!)
                : null;
              return (
                <div className="pp-sort-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>
                    Nearest first · <strong>{nearest.name}</strong>
                    {nearestDist !== null && <> is {nearestDist < 1 ? `${Math.round(nearestDist * 1000)} m` : `${nearestDist.toFixed(1)} km`} away
                      {nearestDist < 3 && <> (~{Math.max(1, Math.round(nearestDist / 0.083))} min walk)</>}
                    </>}
                    {within1km > 0 && <> · {within1km} park{within1km !== 1 ? "s" : ""} within 1 km</>}
                  </span>
                </div>
              );
            })()}

            {/* Recently viewed — shown when idle (no search/filter/fav) */}
            {!loading && !search && !geocodeNearby && !showFavOnly && recentParks.length > 0 && (
              <div className="pp-recents-strip">
                <div className="pp-recents-header">
                  <span className="pp-recents-label">Recent</span>
                  <button
                    className="pp-recents-clear"
                    onClick={() => {
                      localStorage.removeItem("parkpulse_recent");
                      setRecentParks([]);
                    }}
                    title="Clear recently viewed"
                  >
                    Clear
                  </button>
                </div>
                <div className="pp-recents-chips">
                  {recentParks.slice(0, 4).map(r => {
                    const park = allParks.find(p => p.id === r.id);
                    if (!park) return null;
                    return (
                      <button key={r.id} className="pp-recent-chip" onClick={() => selectPark(park)} title={park.suburb || park.type}>
                        <span className="pp-recent-chip-name">{r.name}</span>
                        {park.suburb && <span className="pp-recent-chip-sub">{park.suburb}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {showScrollTop && (
              <button
                className="pp-scroll-top-btn"
                onClick={() => resultsListRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                title="Back to top"
                aria-label="Scroll results to top"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            )}
            <div className="pp-results-list" ref={resultsListRef}>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <div key={i} className="pp-skeleton-card" />)
              ) : displayParks.length === 0 && suggestions.length === 0 ? (
                <div className="pp-empty-state">
                  {showFavOnly && favoriteIds.size === 0 ? (
                    <>
                      <span style={{ fontSize: "2rem" }}>♡</span>
                      <p>No saved parks yet.</p>
                      <p style={{ fontSize: ".8rem" }}>Tap the heart on any park card to save it here.</p>
                      <button className="pp-btn pp-btn-outline pp-btn-small" onClick={() => setShowFavOnly(false)}>Browse all parks</button>
                    </>
                  ) : search ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <p>No parks match <strong>"{search}"</strong>.</p>
                      <p style={{ fontSize: ".8rem", marginTop: "-.25rem" }}>Try a suburb name, park type, or check spelling.</p>
                      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", justifyContent: "center" }}>
                        <button className="pp-btn pp-btn-outline pp-btn-small" onClick={() => { setSearchInput(""); setSearch(""); }}>Clear search</button>
                        {activeFilterCount > 0 && <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear all</button>}
                      </div>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <p>No parks match your filters.</p>
                      <p style={{ fontSize: ".8rem", marginTop: "-.25rem" }}>Try removing some filters to see more results.</p>
                      {activeFilterCount > 0 && (
                        <button className="pp-btn pp-btn-outline pp-btn-small" onClick={clearAll}>Clear all filters</button>
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
                    const showRank = sortBy === "size" && i < 10 && park.area;
                    return (
                      <div
                        key={park.id}
                        data-park-id={park.id}
                        className={`pp-park-card pp-card-stagger${compactView ? " compact" : ""}${showRank ? " pp-ranked" : ""}`}
                        style={{ animationDelay: `${Math.min(i, 15) * 35}ms` }}
                        onClick={() => selectPark(park)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPark(park); } }}
                        aria-label={`View ${park.name}`}
                      >
                        {showRank && (
                          <span
                            className="pp-rank-badge"
                            title={`#${i + 1} largest`}
                            style={i === 0 ? { background: "#FFD700", color: "#7A5C00" }
                                 : i === 1 ? { background: "#C0C0C0", color: "#444" }
                                 : i === 2 ? { background: "#CD7F32", color: "#fff" }
                                 : undefined}
                          >#{i + 1}</span>
                        )}
                        <button
                          className={`pp-fav-btn${favoriteIds.has(park.id) ? " active" : ""}`}
                          onClick={e => toggleFavorite(park.id, e)}
                          aria-label={favoriteIds.has(park.id) ? `Remove ${park.name} from saved` : `Save ${park.name}`}
                          title={favoriteIds.has(park.id) ? "Remove from saved" : "Save park"}
                        >
                          {favoriteIds.has(park.id) ? "♥" : "♡"}
                        </button>
                        <button
                          className="pp-card-pin-btn"
                          title={`Fly to ${park.name} on map`}
                          onClick={e => {
                            e.stopPropagation();
                            mapRef.current?.flyTo([park.lat, park.lng], 17, { duration: 1.0, easeLinearity: 0.25 });
                            setSidebarCollapsed(false);
                          }}
                          aria-label={`Show ${park.name} on map`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11 }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                          </svg>
                        </button>
                        <button
                          className="pp-card-share-btn"
                          title="Copy link to this park"
                          onClick={async e => {
                            e.stopPropagation();
                            const url = `${window.location.origin}${window.location.pathname}?park=${encodeURIComponent(park.name)}`;
                            try { await navigator.clipboard.writeText(url); } catch { /* fallback ignored */ }
                            toast("Link copied!", "success");
                          }}
                          aria-label={`Copy link to ${park.name}`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 11, height: 11 }}>
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                          </svg>
                        </button>
                        <div className="pp-park-card-header">
                          <h4>{search ? (() => {
                            const q = search.trim();
                            const idx = park.name.toLowerCase().indexOf(q.toLowerCase());
                            if (idx === -1) return park.name;
                            return (<>{park.name.slice(0, idx)}<mark className="pp-highlight-match">{park.name.slice(idx, idx + q.length)}</mark>{park.name.slice(idx + q.length)}</>);
                          })() : park.name}</h4>
                          <button
                            className={`pp-park-type-badge ${typeClass} pp-type-badge-btn`}
                            onClick={e => {
                              e.stopPropagation();
                              const map: Partial<Record<string, keyof Filters>> = {
                                Pocket: "pocket", Iconic: "iconic",
                                Neighbourhood: "neighbourhood", Sportsfield: "sportsfield", Sports: "sportsfield",
                              };
                              const key = map[park.type];
                              if (key) { setFilters(prev => ({ ...prev, [key!]: true })); setFiltersOpen(true); }
                            }}
                            title={`Filter to ${park.type} parks`}
                          >
                            {park.type}
                          </button>
                        </div>
                        <div className="pp-park-card-meta">
                          {park.suburb && (
                            <button
                              className="pp-park-suburb-pill pp-suburb-clickable"
                              onClick={e => {
                                e.stopPropagation();
                                setSearchInput(park.suburb);
                                setSearch(park.suburb);
                                setGeocodeNearby(null);
                                setGeocodePlace("");
                              }}
                              title={`Search parks in ${park.suburb}`}
                            >
                              {park.suburb}
                            </button>
                          )}
                          {dist !== null && (
                            <span className="pp-park-distance">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10 }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                              </svg>
                              {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
                              {dist < 3 && <span className="pp-walk-time">· ~{Math.max(1, Math.round(dist / 0.083))} min</span>}
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
                            {park.area && (() => {
                              const { label, cls } = sizeLabel(park.area);
                              return (
                                <span className="pp-facility-tag">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                                  {fmtArea(park.area)}
                                  <span className={`pp-size-label ${cls}`}>{label}</span>
                                </span>
                              );
                            })()}
                          </div>
                        )}
                        {compactView && park.area && (() => {
                          const { label, cls } = sizeLabel(park.area);
                          return <span className={`pp-size-label ${cls} pp-compact-size`}>{label}</span>;
                        })()}
                        <div className="pp-card-hover-hint">Open park details →</div>
                      </div>
                    );
                  })}

                  {displayParks.length > visibleCount && (
                    <>
                      <button
                        className="pp-load-more-btn"
                        onClick={() => setVisibleCount(v => v + 100)}
                      >
                        Show {Math.min(100, displayParks.length - visibleCount)} more
                        <span className="pp-load-more-count">({displayParks.length - visibleCount} remaining)</span>
                      </button>
                      <div ref={loadMoreSentinelRef} style={{ height: 1 }} aria-hidden="true" />
                    </>
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
          {visibleMapCount > 0 && !loading && (
            <div className="pp-viewport-count" aria-live="polite">
              {visibleMapCount} park{visibleMapCount === 1 ? "" : "s"} visible
            </div>
          )}
          <button
            className="pp-locate-btn"
            aria-label="Locate me"
            onClick={handleLocate}
            title="Find my location (L)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/>
              <line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/>
              <line x1="12" y1="22" x2="12" y2="18"/>
            </svg>
          </button>
          <button
            className="pp-recenter-btn"
            aria-label="Recenter on Sydney"
            title="Recenter on Sydney CBD"
            onClick={() => mapRef.current?.flyTo([-33.8688, 151.2093], 13, { duration: 1.1, easeLinearity: 0.25 })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/>
              <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          {/* Map Legend */}
          <div className={`pp-map-legend${legendCollapsed ? " collapsed" : ""}`}>
            <button className="pp-map-legend-title" onClick={() => setLegendCollapsed(v => !v)} title={legendCollapsed ? "Show legend" : "Hide legend"}>
              Markers
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10, marginLeft: "auto", transition: "transform .2s", transform: legendCollapsed ? "rotate(-90deg)" : "none" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {!legendCollapsed && [
              { color: "#E76F51", label: "Playground" },
              { color: "#FFD166", label: "Iconic" },
              { color: "#F4A261", label: "Sports" },
              { color: "#83C5BE", label: "Neighbourhood" },
              { color: "#9B59B6", label: "Pocket" },
              { color: "#2D6A4F", label: "Park" },
            ].map(({ color, label }) => (
              <div key={label} className="pp-map-legend-item">
                <div className="pp-map-legend-dot" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
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
      {selectedPark && (() => {
        const modalParks = geocodeNearby ?? displayParks;
        const modalIdx   = modalParks.findIndex(p => p.id === selectedPark.id);
        return (
          <ParkModal
            park={selectedPark}
            onClose={() => setSelectedPark(null)}
            nearbyNPWS={nearbyNPWSFacilities}
            nearbyDogPark={nearbyDogParkName}
            isFavorite={favoriteIds.has(selectedPark.id)}
            onToggleFavorite={toggleFavorite}
            onSuburbSearch={(suburb) => {
              setSearchInput(suburb);
              setSearch(suburb);
              setGeocodeNearby(null);
              setGeocodePlace("");
              setSelectedPark(null);
            }}
            onTypeFilter={(type) => {
              const typeMap: Partial<Record<string, keyof typeof filters>> = {
                Playground: "playground", Iconic: "iconic",
                Sportsfield: "sportsfield", Sports: "sports",
                Neighbourhood: "neighbourhood", Pocket: "pocket",
                "Off-leash": "dogs",
              };
              const key = typeMap[type];
              if (key) {
                setFilters(prev => ({ ...prev, [key]: true }));
                setFiltersOpen(true);
                toast(`Filtered to ${type} parks`, "info");
              }
              setSelectedPark(null);
            }}
            onFindNearby={(lat, lng, name) => {
              const nearby = [...allParks]
                .map(p => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
                .filter(x => x.d <= 1)
                .sort((a, b) => a.d - b.d)
                .map(x => x.p);
              setGeocodeNearby(nearby);
              setGeocodePlace(`Near ${name}`);
              setSearchInput(""); setSearch("");
              mapRef.current?.flyTo([lat, lng], 15, { duration: 1.2, easeLinearity: 0.25 });
              toast(`${nearby.length} park${nearby.length !== 1 ? "s" : ""} within 1 km`, "info");
            }}
            userLocation={userLocation}
            parkIndex={modalIdx >= 0 ? modalIdx : undefined}
            totalParks={modalParks.length}
            onPrev={modalIdx > 0 ? () => selectPark(modalParks[modalIdx - 1]) : null}
            onNext={modalIdx >= 0 && modalIdx < modalParks.length - 1 ? () => selectPark(modalParks[modalIdx + 1]) : null}
          />
        );
      })()}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="pp-shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="pp-shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="pp-shortcuts-header">
              <h3>Keyboard Shortcuts</h3>
              <button className="pp-modal-close-btn" onClick={() => setShowShortcuts(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="pp-shortcuts-grid">
              {[
                { keys: ["/"],        desc: "Focus search" },
                { keys: ["?"],        desc: "Show/hide shortcuts" },
                { keys: ["↑", "↓"],  desc: "Navigate results" },
                { keys: ["Enter"],    desc: "Open selected park" },
                { keys: ["Esc"],      desc: "Close modal / dismiss" },
                { keys: ["S"],        desc: "Surprise me — random park" },
                { keys: ["C"],        desc: "Toggle compact view" },
                { keys: ["F"],        desc: "Fit map to results" },
                { keys: ["T"],        desc: "Cycle map theme" },
                { keys: ["L"],        desc: "Locate me (GPS)" },
                { keys: ["D"],        desc: "Toggle saved parks view" },
                { keys: ["W"],        desc: "Walk directions for open park" },
                { keys: ["G"],        desc: "Google Maps view for open park" },
                { keys: ["N"],        desc: "Next park in list (modal open)" },
                { keys: ["P"],        desc: "Previous park in list (modal open)" },
                { keys: ["←", "→"],  desc: "Navigate parks in modal" },
                { keys: ["M"],        desc: "Recenter map on Sydney CBD" },
                { keys: ["1"],        desc: "Sort: Default" },
                { keys: ["2"],        desc: "Sort: A–Z" },
                { keys: ["3"],        desc: "Sort: Nearest (or locate if no GPS)" },
                { keys: ["4"],        desc: "Sort: Largest" },
              ].map(({ keys, desc }) => (
                <div key={desc} className="pp-shortcut-row">
                  <div className="pp-shortcut-keys">
                    {keys.map(k => <kbd key={k} className="pp-kbd">{k}</kbd>)}
                  </div>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
            <p className="pp-shortcuts-hint">Press <kbd className="pp-kbd">?</kbd> or <kbd className="pp-kbd">Esc</kbd> to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
