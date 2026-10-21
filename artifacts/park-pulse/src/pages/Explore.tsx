import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCulledMarkerLayer } from "../hooks/useCulledMarkerLayer";
import Navbar from "../components/Navbar";
import ParkModal from "../components/ParkModal";
import type { Park } from "../types/park";
import { useTheme, migrateTheme } from "../hooks/useTheme";
import { LAYERS, countFor, getLayer } from "../data/layers";
import { useDataSnapshot } from "../data/snapshot";
import { useToast } from "../context/ToastContext";
import { fetchWithCache, clearAllCache, onCacheNotice } from "../utils/dataCache";
import { haversineKm, calcCentroid, NearestIndex } from "../utils/geo";
import {
  readLatLng,
  readFeatureCentroid,
  type FeatureCollection,
  type MixedCollection,
} from "../utils/geojson";
import { fmtArea, fuzzyScore, searchParks, sizeLabel } from "../utils/search";
import {
  bboxOfGeometry,
  filterByCouncils,
  parseCouncilsParam,
  pointInCouncil,
  serializeCouncilsParam,
  type BBox,
  type CouncilGeometry,
  type CouncilIndex,
  type CouncilMode,
} from "../utils/councils";
import {
  LAYER_TOGGLES,
  PARK_TYPE_KEYS,
  TYPE_FILTERS,
  UNSHIPPED_LAYERS,
  defaultFilters,
  filterLabel,
  type Filters,
  type LayerKey,
} from "../data/exploreFilters";
import CouncilSelector from "../components/CouncilSelector";
import CouncilStats from "../components/CouncilStats";
import MultiCouncilPanel from "../components/MultiCouncilPanel";
import { loadTreesForBounds, type TreeRecord, type TreeSourceInfo } from "../utils/treeData";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const BASE = import.meta.env.BASE_URL;
const TREE_ZOOM_THRESHOLD = 16;

/**
 * Layers the registry adds to the map without a bespoke loader.
 *
 * A dataset with `explore: "generic"` is drawn from its artifact as circle
 * markers with a DOM-built popup. This is what makes "add a point dataset" a
 * registry edit rather than an Explore edit; bespoke layers keep their own
 * loaders for fields and clustering that generic rendering cannot express.
 */
const GENERIC_LAYERS = LAYERS.filter(
  (layer) => layer.status === "published" && layer.explore === "generic" && layer.artifact,
);

/**
 * Basemap tiles.
 *
 * CARTO's hosted basemaps (basemaps.cartocdn.com) now require an API key and
 * return an "API KEY REQUIRED" placeholder without one, so the vector themes
 * are served from OpenStreetMap's standard tiles, which need no key. The dark,
 * sunset and neon looks are applied as CSS filters over the tile pane in
 * index.css rather than by swapping in a second paid provider.
 *
 * Esri World Imagery is keyless and is kept for the satellite theme.
 */
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Basemaps are a map concern, separate from the two UI themes (PRD §8.1):
 * switching between Warm Field and Night Field must not change the provider,
 * and choosing satellite imagery must not repaint the interface.
 */
const TILE_URLS = {
  streets:   OSM_TILES,
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
} as const;

type Basemap = keyof typeof TILE_URLS;
const BASEMAP_STORAGE_KEY = "parkpulse_basemap";

function readStoredBasemap(): Basemap {
  try {
    const stored = localStorage.getItem(BASEMAP_STORAGE_KEY);
    if (stored === "streets" || stored === "satellite") return stored;
  } catch {
    // Private mode: fall through to the default basemap.
  }
  return "streets";
}

const TILE_ATTR_DEFAULT  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_ATTR_SAT      = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, USGS';

// ── Helpers ──────────────────────────────────────────────────────────────────
function parkMarkerColor(park: Park): string {
  if (park.hasPlayground) return "#E76F51";
  if (park.type === "Iconic") return "#FFD166";
  if (park.type === "Sportsfield" || park.type === "Sports") return "#F4A261";
  if (park.type === "Neighbourhood") return "#83C5BE";
  if (park.type === "Pocket") return "#9B59B6";
  return "#2D6A4F";
}

/** Off-leash marker glyph. Drawn, not an emoji, so it renders the same on
 *  every platform and inherits the marker's ink colour. */
const PAW_GLYPH =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="7" cy="7.5" r="2.2"/><circle cx="12" cy="6" r="2.3"/><circle cx="17" cy="7.5" r="2.2"/><path d="M12 10c3.4 0 6 2.4 6 5.2 0 2.1-1.7 3.3-3.9 3.3-1 0-1.5-.4-2.1-.4s-1.1.4-2.1.4C7.7 18.5 6 17.3 6 15.2 6 12.4 8.6 10 12 10Z"/></svg>';

function makeIcon(color: string, size = 24, radius = "50%", inner = "") {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:${radius};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:${size * 0.55}px;line-height:1">${inner}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

/**
 * Leaflet reuses an icon's DOM only when handed the same object, so handing it
 * a freshly built divIcon on every render means every icon element is thrown
 * away and rebuilt. There are only a handful of distinct park marker styles,
 * so they are cached by their full appearance signature.
 */
const iconCache = new Map<string, L.DivIcon>();

function cachedIcon(key: string, build: () => L.DivIcon): L.DivIcon {
  const hit = iconCache.get(key);
  if (hit) return hit;
  const icon = build();
  iconCache.set(key, icon);
  return icon;
}

function getParkIcon(park: Park): L.DivIcon {
  const color = parkMarkerColor(park);
  return cachedIcon(`park:${color}`, () => makeIcon(color));
}

/** Cached icon for the fixed-colour overlay layers. */
function getOverlayIcon(color: string, size: number, radius: string): L.DivIcon {
  return cachedIcon(`overlay:${color}:${size}:${radius}`, () => makeIcon(color, size, radius));
}

/** Popup with a coloured type badge, a heading and an optional detail line. */
function buildSimplePopup(color: string, badge: string, name: string, detail?: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "pp-popup";

  const badgeEl = document.createElement("span");
  badgeEl.className = "pp-popup-type";
  badgeEl.style.background = color;
  badgeEl.textContent = badge;
  div.appendChild(badgeEl);

  const heading = document.createElement("h3");
  heading.textContent = name;
  div.appendChild(heading);

  if (detail) {
    const line = document.createElement("p");
    line.style.fontSize = "12px";
    line.style.color = "var(--pp-text-muted)";
    line.textContent = detail;
    div.appendChild(line);
  }

  return div;
}

/**
 * Park popup assembled with DOM APIs. Park names come from an open municipal
 * dataset, so they are set as text rather than interpolated into markup.
 */
function buildParkPopup(park: Park): HTMLElement {
  const div = document.createElement("div");
  div.className = "pp-popup";

  const type = document.createElement("span");
  type.className = "pp-popup-type";
  type.textContent = park.type;
  div.appendChild(type);

  const heading = document.createElement("h3");
  heading.textContent = park.name;
  div.appendChild(heading);

  if (park.suburb) {
    const suburb = document.createElement("p");
    suburb.style.fontSize = "12px";
    suburb.style.color = "var(--pp-text-muted)";
    suburb.style.marginBottom = "2px";
    suburb.textContent = `📍 ${park.suburb}`;
    div.appendChild(suburb);
  }

  if (park.area) {
    const area = document.createElement("p");
    area.style.fontSize = "12px";
    area.textContent = `📐 ${fmtArea(park.area)}`;
    div.appendChild(area);
  }

  if (park.hasPlayground) {
    const playground = document.createElement("p");
    playground.style.fontSize = "12px";
    playground.style.marginTop = "2px";
    playground.textContent = "🛝 Has Playground";
    div.appendChild(playground);
  }

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.marginTop = "8px";

  const button = document.createElement("button");
  button.className = "pp-popup-btn";
  button.textContent = "View Details";
  button.addEventListener("click", () => setSelectedParkRef.current(park));
  row.appendChild(button);

  const link = document.createElement("a");
  link.href = `https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lng}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "pp-popup-dir-link";
  link.textContent = "Directions ↗";
  row.appendChild(link);

  div.appendChild(row);
  return div;
}

function npwsColor(subtype: string): string {
  if (subtype.includes("BBQ") || subtype.includes("Fire")) return "#FF6B35";
  if (subtype.includes("Picnic")) return "#8B5E3C";
  if (subtype.includes("Shelter")) return "#5B8C5A";
  if (subtype.includes("Playground")) return "#E91E8C";
  if (subtype.includes("Seat")) return "#6B8CBA";
  return "#888888";
}

/** Off-leash dog park popup, assembled without interpolating markup. */
function buildDogPopup(p: DogProperties): HTMLElement {
  const div = document.createElement("div");
  div.className = "pp-popup";

  const badge = document.createElement("span");
  badge.className = "pp-popup-type";
  badge.style.background = "#AACC00";
  badge.style.color = "#000";
  badge.textContent = "🐕 Dog Park";
  div.appendChild(badge);

  const heading = document.createElement("h3");
  heading.textContent = p.ParkName || "Dog Park";
  div.appendChild(heading);

  if (p.Suburb) {
    const suburb = document.createElement("p");
    suburb.textContent = p.Suburb;
    div.appendChild(suburb);
  }

  if (p.OffLeashTime) {
    const status = document.createElement("span");
    status.className =
      p.OffLeashTime === "At all times" ? "pp-popup-badge-green" : "pp-popup-badge-orange";
    status.textContent =
      p.OffLeashTime === "At all times" ? "Always Off-Leash" : p.OffLeashTime;
    div.appendChild(status);
  }

  if (p.ProhibitedAreas) {
    const warn = document.createElement("p");
    warn.className = "pp-popup-warn";
    warn.textContent = `⚠ Not allowed: ${p.ProhibitedAreas}`;
    div.appendChild(warn);
  }

  if (p.OffLeashDescription) {
    const desc = document.createElement("p");
    desc.style.fontSize = "12px";
    desc.style.marginTop = "4px";
    desc.textContent = p.OffLeashDescription;
    div.appendChild(desc);
  }

  return div;
}

/** NPWS facility popup, assembled without interpolating markup. */
function buildNpwsPopup(p: NpwsProperties, color: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "pp-popup";

  const badge = document.createElement("span");
  badge.className = "pp-popup-type";
  badge.style.background = color;
  badge.textContent = p.d_SubtypeC || "Facility";
  div.appendChild(badge);

  const heading = document.createElement("h3");
  heading.textContent = p.AssetName || "NPWS Facility";
  div.appendChild(heading);

  if (p.d_LGA) {
    const lga = document.createElement("p");
    lga.textContent = p.d_LGA;
    div.appendChild(lga);
  }

  if (p.d_Branch) {
    const branch = document.createElement("p");
    branch.className = "pp-popup-muted";
    branch.textContent = p.d_Branch;
    div.appendChild(branch);
  }

  if (p.Comments) {
    const comments = document.createElement("p");
    comments.style.fontSize = "11px";
    comments.style.marginTop = "4px";
    comments.textContent = p.Comments;
    div.appendChild(comments);
  }

  return div;
}

/**
 * Set by the Explore component so the module-level popup builders can act
 * without needing the component's closures.
 */
let selectParkFromPopup: ((p: Park) => void) | null = null;
let setSelectedParkRef: { current: (p: Park) => void } = { current: () => {} };
let toastForPopup: (msg: string, type?: "success" | "info" | "error" | "warning") => void = () => {};

/**
 * Tree popup, built on demand and assembled with DOM APIs rather than an HTML
 * string so that species names and asset ids coming from the open dataset are
 * never parsed as markup.
 */
function buildTreePopup(tree: TreeRecord, park: Park | null): HTMLElement {
  const div = document.createElement("div");
  div.className = "pp-popup";

  const badge = document.createElement("span");
  badge.className = "pp-popup-type";
  badge.style.background = "#40916C";
  // FR3.5: council-sourced trees name their council in the overlay popup.
  badge.textContent = tree.councilName ? `🌳 Tree · ${tree.councilName}` : "🌳 Tree";
  div.appendChild(badge);

  const heading = document.createElement("h3");
  heading.textContent = tree.commonName || tree.speciesName || "Tree";
  div.appendChild(heading);

  if (tree.speciesName && tree.speciesName !== tree.commonName) {
    const species = document.createElement("p");
    species.style.fontSize = "11px";
    species.style.color = "var(--pp-text-muted)";
    species.textContent = tree.speciesName;
    div.appendChild(species);
  }

  const details: string[] = [];
  if (tree.treeType) details.push(tree.treeType);
  if (tree.age) details.push(tree.age);
  if (tree.dbhCm != null) details.push(`${tree.dbhCm} cm trunk`);
  if (tree.height != null) details.push(`${tree.height} m`);
  if (details.length) {
    const meta = document.createElement("p");
    meta.style.fontSize = "11px";
    meta.style.color = "var(--pp-text-muted)";
    meta.textContent = details.join(" · ");
    div.appendChild(meta);
  }

  if (park) {
    const nearest = document.createElement("p");
    nearest.style.fontSize = "11px";
    nearest.style.marginTop = "4px";
    nearest.textContent = `Nearest park: ${park.name}`;
    div.appendChild(nearest);
  }

  const button = document.createElement("button");
  button.className = "pp-popup-btn";
  button.style.marginTop = "8px";
  button.textContent = park ? "View nearest park" : "View details";
  button.addEventListener("click", () => {
    if (park) {
      selectParkFromPopup?.(park);
    } else {
      console.info("[trees] no nearest park within range:", tree.assetId);
      toastForPopup(`Tree: ${tree.commonName || tree.speciesName || "unknown"}`, "info");
    }
  });
  div.appendChild(button);

  return div;
}

// ── Types ─────────────────────────────────────────────────────────────────────
// Filters, their defaults, the park-type refinements and the label/colour for
// every category live in one module so the rail, the map key and the result
// chips cannot drift apart.

interface NpwsRaw { name: string; subtype: string; lat: number; lng: number }
interface DogRaw  { name: string; lat: number; lng: number }

/** Properties actually present on the shipped dog off-leash dataset. */
interface DogProperties {
  ParkName?: string;
  Suburb?: string;
  OffLeashTime?: string;
  OffLeashDescription?: string;
  ProhibitedAreas?: string;
}

/** Properties actually present on the shipped NPWS facilities dataset. */
interface NpwsProperties {
  AssetName?: string;
  d_SubtypeC?: string;
  d_LGA?: string;
  d_Branch?: string;
  Comments?: string;
}

/** Properties on public/data/transport/stops.geojson (FR4.1). */
interface TransportStopProperties {
  stop_id?: string;
  stop_name?: string;
  stop_lat?: number;
  stop_lon?: number;
  route_types?: string[];
}

/** Human labels for the five GTFS modes the converter normalises to (FR4.2). */
const ROUTE_MODE_LABELS: Record<string, string> = {
  bus: "Bus",
  rail: "Rail",
  ferry: "Ferry",
  lightrail: "Light rail",
  metro: "Metro",
};

/** Properties actually present on the shipped parks dataset. */
interface ParksProperties {
  OBJECTID?: number;
  Name?: string;
  Type?: string;
  Playgrounds?: string;
  Shape__Area?: number;
  Asset_ID?: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Explore() {
  const { setTheme, toggleTheme } = useTheme();
  const [basemap, setBasemap] = useState<Basemap>(readStoredBasemap);
  // Read once for the map's first tile layer without re-running map init.
  const initialBasemapRef = useRef<Basemap>(basemap);
  const { toast } = useToast();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const mapRef             = useRef<L.Map | null>(null);
  const mapContainerRef    = useRef<HTMLDivElement>(null);
  const tileLayerRef       = useRef<L.TileLayer | null>(null);
  const markersByIdRef     = useRef<Map<number, L.Marker>>(new Map());
  const fountainLayerRef   = useRef<L.LayerGroup | null>(null);
  const transportLayerRef  = useRef<L.LayerGroup | null>(null);
  const treeLayerRef       = useRef<L.LayerGroup | null>(null);
  const toiletLayerRef     = useRef<L.LayerGroup | null>(null);
  const dogLayerRef        = useRef<L.LayerGroup | null>(null);
  const npwsLayerRef       = useRef<L.LayerGroup | null>(null);
  const locationMarkerRef  = useRef<L.Marker | null>(null);
  const locationCircleRef  = useRef<L.Circle | null>(null);
  const treeRendererRef    = useRef<L.Canvas | null>(null);
  const treeIndexRef       = useRef<NearestIndex<Park> | null>(null);
  // Park markers cluster below z16 — 2,000+ pins at city zoom was an
  // unreadable blob; the cluster group owns them so Leaflet can aggregate.
  const parkClusterRef     = useRef<L.MarkerClusterGroup | null>(null);
  const railRef            = useRef<HTMLElement | null>(null);
  const allParksRef        = useRef<Park[]>([]);
  const deepLinkHandledRef = useRef(false);

  // Stable refs for map callbacks
  const filteredRef        = useRef<Park[]>([]);
  const geocodeNearbyRef   = useRef<Park[] | null>(null);
  const setSelectedParkRefLocal = useRef<(p: Park) => void>(() => {});  const userLocationRef    = useRef<{lat:number;lng:number}|null>(null);
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
  const [treeZoomHint,    setTreeZoomHint]    = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [geocodeNearby,   setGeocodeNearby]   = useState<Park[] | null>(null);
  const [geocodePlace,    setGeocodePlace]    = useState("");
  const [sortBy,          setSortBy]          = useState<"default"|"name"|"nearest"|"size">("default");
  const [userLocation,    setUserLocation]    = useState<{lat:number;lng:number}|null>(null);
  const [searchHistory,   setSearchHistory]   = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("parkpulse_history") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("[explore] corrupt search history, starting empty:", err);
      return [];
    }
  });
  const [showHistory,     setShowHistory]     = useState(false);
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [minArea,         setMinArea]         = useState(0);
  const snapshot = useDataSnapshot();
  const [layerCounts,     setLayerCounts]     = useState<Record<string,number>>({});
  const [genericEnabled,  setGenericEnabled]  = useState<Record<string, boolean>>(
    () => Object.fromEntries(GENERIC_LAYERS.filter((layer) => layer.defaultVisible).map((layer) => [layer.id, true])),
  );
  const [genericCounts,   setGenericCounts]   = useState<Record<string, number>>({});
  const [genericError,    setGenericError]    = useState<string | null>(null);
  const genericGroupRef = useRef<L.LayerGroup | null>(null);
  const [visibleCount,    setVisibleCount]    = useState(100);
  const [fromCache,       setFromCache]       = useState(false);
  const [npwsRawData,     setNpwsRawData]     = useState<NpwsRaw[]>([]);
  const [dogRawData,      setDogRawData]      = useState<DogRaw[]>([]);
  const [visibleMapCount, setVisibleMapCount] = useState(0);
  // The map instance is held in state as well as a ref so hooks that depend on
  // it re-run once Leaflet has actually created it.
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [cacheWarning, setCacheWarning] = useState<string | null>(null);
  const [favoriteIds,     setFavoriteIds]     = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem("parkpulse_favs") || "[]")); }
    catch (err) {
      console.warn("[explore] corrupt favourites list, starting empty:", err);
      return new Set<number>();
    }
  });
  const [showFavOnly,     setShowFavOnly]     = useState(false);
  const [recentParks,    setRecentParks]     = useState<Array<{id: number; name: string; type: string; suburb: string}>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("parkpulse_recent") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("[explore] corrupt recent-parks history, starting empty:", err);
      return [];
    }
  });

  // ── Multi-council governance (FR1) ─────────────────────────────────────
  // Session-only by design (FR1.11): nothing here touches localStorage.
  const [councilIndex,     setCouncilIndex]     = useState<CouncilIndex | null>(null);
  const [councilStatus,    setCouncilStatus]    = useState<"loading" | "ready" | "error">("loading");
  const [selectedCouncilIds, setSelectedCouncilIds] = useState<string[]>([]);
  const [councilMode,      setCouncilMode]      = useState<CouncilMode>("single");
  const [councilFeatures,  setCouncilFeatures]  = useState<Map<string, GeoJSON.Feature>>(() => new Map());
  const [pendingBoundaries,setPendingBoundaries]= useState<string[]>([]);
  const [failedBoundaries, setFailedBoundaries] = useState<string[]>([]);

  // Keep the module-level popup bridge and the local refs in step with the
  // committed values, in an effect rather than during render so a discarded
  // concurrent render cannot leave them pointing at stale state.
  useEffect(() => {
    setSelectedParkRef.current = setSelectedPark;
    setSelectedParkRefLocal.current = setSelectedPark;
  }, [setSelectedPark]);
  selectedParkRef.current    = selectedPark;

  // Surface cache pressure instead of silently dropping data.
  useEffect(() =>
    onCacheNotice((notice) => {
      if (notice.kind === "oversized") {
        setCacheWarning("Some map data is too large to cache offline and will reload each visit.");
      } else if (notice.kind === "quota") {
        setCacheWarning("Browser storage is full; map data may not persist between visits.");
      }
    }), []);

  // ── Refresh recents + scroll-to-card when modal closes ───────────────────
  useEffect(() => {
    if (selectedPark !== null) {
      lastViewedParkIdRef.current = selectedPark.id;
    } else {
      try {
        const parsed = JSON.parse(localStorage.getItem("parkpulse_recent") || "[]");
        setRecentParks(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        console.warn("[explore] could not refresh recent parks:", err);
      }
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
        document.getElementById("explore-controls")?.scrollIntoView({ block: "start" });
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      } else if ((e.key === "s" || e.key === "S") && !isInput) {
        e.preventDefault();
        surpriseMeRef.current();
      } else if ((e.key === "c" || e.key === "C") && !isInput) {
        e.preventDefault();
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
        toggleTheme();
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
  }, [toggleTheme]);

  // ── Keyboard: arrow nav between result cards ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!resultsListRef.current) return;
      const cards = Array.from(resultsListRef.current.querySelectorAll<HTMLElement>(".fa-result-title"));
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
  // Reconciles by park id rather than tearing the layer down on every
  // viewport change, so a pan only adds/removes the markers that actually
  // changed instead of destroying and rebuilding every icon in view.
  const renderMarkersForBounds = useCallback((parksToRender: Park[]) => {
    const map = mapRef.current;
    if (!map) return;
    // A resize/pan handler from a torn-down map must not touch the live one's
    // cluster group; the ref is reassigned on remount.
    const clusterAtCall = parkClusterRef.current;
    if (clusterAtCall && !map.hasLayer(clusterAtCall)) return;
    const bounds = map.getBounds().pad(0.5);
    const tightBounds = map.getBounds();

    const visible = parksToRender.filter((park) => bounds.contains([park.lat, park.lng]));
    const visibleIds = new Set(visible.map((p) => p.id));
    // Markers live inside the cluster group when one exists so dense areas
    // aggregate; the group itself is already on the map.
    const cluster = parkClusterRef.current;

    // Remove markers that scrolled out of range.
    for (const [id, marker] of markersByIdRef.current) {
      if (!visibleIds.has(id)) {
        if (cluster) cluster.removeLayer(marker);
        else marker.remove();
        markersByIdRef.current.delete(id);
      }
    }

    let inViewport = 0;
    for (const park of visible) {
      if (tightBounds.contains([park.lat, park.lng])) inViewport++;
      const existing = markersByIdRef.current.get(park.id);
      if (existing) continue;
      const marker = L.marker([park.lat, park.lng], {
        icon: getParkIcon(park),
        title: park.name,
      });
      marker.bindPopup(() => buildParkPopup(park), { maxWidth: 280 });
      if (cluster) cluster.addLayer(marker);
      else map.addLayer(marker);
      markersByIdRef.current.set(park.id, marker);
    }

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
          try {
            localStorage.setItem("parkpulse_history", JSON.stringify(updated));
          } catch (err) {
            // Private browsing can refuse writes; the in-memory list still works.
            console.warn("[explore] could not persist search history:", err);
          }
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


  // ── Infinite scroll sentinel ──────────────────────────────────────────────
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(v => v + 50);
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // ── URL params (on mount) ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter && filter in defaultFilters) {
      setFilters(prev => ({ ...prev, [filter as keyof Filters]: true }));
    } else if (filter && GENERIC_LAYERS.some((layer) => layer.id === filter)) {
      // A registry-driven layer can be deep-linked with the same ?filter= key
      // the atlas and amenities directory use.
      setGenericEnabled((previous) => ({ ...previous, [filter]: true }));
    }
    if (params.get("locate") === "1") {
      setTimeout(() => handleLocate(), 1500);
    }
    const q = params.get("q");
    if (q) { setSearchInput(q); setSearch(q); }
    const sort = params.get("sort");
    if (sort === "name" || sort === "nearest" || sort === "size") setSortBy(sort);
    // ?basemap= is the current key. Older links used ?theme=satellite while
    // satellite imagery was still modelled as a UI theme.
    const basemapParam = params.get("basemap");
    if (basemapParam === "streets" || basemapParam === "satellite") setBasemap(basemapParam);
    const themeParam = params.get("theme");
    if (themeParam === "satellite") setBasemap("satellite");
    const migratedTheme = migrateTheme(themeParam);
    if (migratedTheme) setTheme(migratedTheme);
  }, []);

  // ── URL sync: update ?q= and ?sort= as state changes ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set("q", search); else params.delete("q");
    if (sortBy !== "default") params.set("sort", sortBy); else params.delete("sort");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
  }, [search, sortBy]);

  // ── Council index (FR1.9: deep link read happens once on load) ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await fetchWithCache<CouncilIndex>(
          `${BASE}data/boundaries/councils-index.json`,
          "pp_council_index",
        );
        if (cancelled) return;
        if (!data?.councils?.length) throw new Error("council index is empty");
        setCouncilIndex(data);
        setCouncilStatus("ready");
        const valid = new Set(data.councils.map(c => c.lga_id));
        const params = new URLSearchParams(window.location.search);
        const { ids, mode } = parseCouncilsParam(
          params.get("councils"),
          params.get("mode"),
          valid,
        );
        setSelectedCouncilIds(ids);
        setCouncilMode(mode);
      } catch (err) {
        console.error("[explore] failed to load council index:", err);
        if (!cancelled) {
          setCouncilStatus("error");
          toast("Could not load council index — council controls disabled", "error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  // ── URL sync: write ?councils= / ?mode= (FR1.9) ─────────────────────────
  useEffect(() => {
    // Before the index resolves the deep link, writing would wipe the params
    // we are about to read — so hold off while loading.
    if (councilStatus === "loading") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedCouncilIds.length === 0) {
      params.delete("councils");
      params.delete("mode");
    } else {
      params.set("councils", selectedCouncilIds.join(","));
      if (selectedCouncilIds.length > 1 || councilMode === "multi") params.set("mode", councilMode);
      else params.delete("mode");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? "?" + qs : ""}`);
  }, [selectedCouncilIds, councilMode, councilStatus]);

  // ── Boundary geometry per selection (lazy, cached) ───────────────────────
  useEffect(() => {
    if (councilStatus !== "ready" || selectedCouncilIds.length === 0 || !councilIndex) return;
    const missing = selectedCouncilIds.filter(
      id => !councilFeatures.has(id) && !failedBoundaries.includes(id),
    );
    if (missing.length === 0) return;

    let cancelled = false;
    setPendingBoundaries(prev => [...new Set([...prev, ...missing])]);

    (async () => {
      const results = await Promise.allSettled(
        missing.map(async id => {
          const entry = councilIndex.councils.find(c => c.lga_id === id);
          // geometry_file is relative to public/data/ (e.g.
          // "boundaries/councils/blacktown-city-council.geojson").
          const file = entry?.geometry_file ?? `boundaries/councils/${id}.geojson`;
          const { data } = await fetchWithCache<GeoJSON.Feature>(
            `${BASE}data/${file}`,
            `pp_council_${id}`,
          );
          return { id, data };
        }),
      );
      if (cancelled) return;

      const ok: Array<[string, GeoJSON.Feature]> = [];
      const failed: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") ok.push([result.value.id, result.value.data]);
        else {
          failed.push(missing[i]);
          console.error(`[explore] boundary fetch failed for ${missing[i]}:`, result.reason);
        }
      });

      if (ok.length) {
        setCouncilFeatures(prev => {
          const next = new Map(prev);
          for (const [id, feature] of ok) next.set(id, feature);
          return next;
        });
      }
      if (failed.length) {
        setFailedBoundaries(prev => [...new Set([...prev, ...failed])]);
        toast("Boundary unavailable for selected council", "error");
      }
      setPendingBoundaries(prev => prev.filter(id => !missing.includes(id)));
    })();

    return () => { cancelled = true; };
  }, [councilStatus, selectedCouncilIds, councilFeatures, failedBoundaries, councilIndex, toast]);

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

    const initialBasemap = initialBasemapRef.current;
    const isSat = initialBasemap === "satellite";
    tileLayerRef.current = L.tileLayer(TILE_URLS[initialBasemap], {
      attribution: isSat ? TILE_ATTR_SAT : TILE_ATTR_DEFAULT,
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false, metric: true }).addTo(map);

    // Clustering for the park pin layer: aggregate below z16, spiderfy after.
    // showCoverageOnHover off — the popup on click is the useful affordance.
    const parkCluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(parkCluster);
    parkClusterRef.current = parkCluster;

    // Registry-driven point datasets get one group of their own, so switching
    // one off never touches the bespoke layers' markers.
    const genericGroup = L.layerGroup().addTo(map);
    genericGroupRef.current = genericGroup;

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
    setMapInstance(map);
    return () => { map.remove(); mapRef.current = null; };
  }, [renderMarkersForBounds]);

  // ── Generic registry layers ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance;
    const group = genericGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const enabled = GENERIC_LAYERS.filter((layer) => genericEnabled[layer.id]);
    if (enabled.length === 0) {
      setGenericError(null);
      return;
    }

    let cancelled = false;
    setGenericError(null);

    (async () => {
      for (const layer of enabled) {
        try {
          const { data } = await fetchWithCache<MixedCollection>(
            `${BASE}${layer.artifact}`,
            `pp_generic_${layer.id}`,
          );
          if (cancelled) return;
          let count = 0;
          for (const feature of data.features ?? []) {
            const point = readFeatureCentroid(feature);
            if (!point) continue;
            count += 1;
            const marker = L.circleMarker([point.lat, point.lng], {
              radius: 6,
              color: "#ffffff",
              weight: 2,
              fillColor: layer.mapColor ?? "#8B5CF6",
              fillOpacity: 0.92,
            });
            const props = (feature.properties ?? {}) as Record<string, unknown>;
            // DOM nodes, not an HTML string: a contributed name is untrusted
            // input and must never be parsed as markup.
            const popup = document.createElement("div");
            popup.className = "pp-popup";
            const heading = document.createElement("h3");
            heading.textContent = typeof props.name === "string" ? props.name : layer.label;
            const meta = document.createElement("p");
            meta.textContent = `${layer.label}${typeof props.suburb === "string" ? ` · ${props.suburb}` : ""}`;
            popup.append(heading, meta);
            const credit = document.createElement("p");
            credit.className = "pp-popup-credit";
            const provenance = props.provenance as { contributor?: unknown } | undefined;
            credit.textContent = `Community record${typeof provenance?.contributor === "string" ? ` · ${provenance.contributor}` : ""}`;
            popup.append(credit);
            marker.bindPopup(popup);
            group.addLayer(marker);
          }
          setGenericCounts((previous) => ({ ...previous, [layer.id]: count }));
        } catch {
          if (cancelled) return;
          setGenericCounts((previous) => ({ ...previous, [layer.id]: 0 }));
          setGenericError(`The ${layer.label.toLowerCase()} dataset could not be loaded.`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapInstance, genericEnabled]);

  // ── Swap tile URL on basemap change ───────────────────────────────────────
  useEffect(() => {
    // Drives the `html[data-basemap="satellite"]` rule that keeps Night Field
    // from colour-inverting real satellite imagery.
    document.documentElement.dataset.basemap = basemap;
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, basemap);
    } catch {
      // Persisting the choice is a convenience, not a requirement.
    }
    if (!tileLayerRef.current) return;
    const isSat = basemap === "satellite";
    tileLayerRef.current.setUrl(TILE_URLS[basemap]);
    const map = mapRef.current;
    if (map) {
      const attrCtrl = map.attributionControl;
      if (attrCtrl) {
        attrCtrl.removeAttribution(TILE_ATTR_DEFAULT);
        attrCtrl.removeAttribution(TILE_ATTR_SAT);
        attrCtrl.addAttribution(isSat ? TILE_ATTR_SAT : TILE_ATTR_DEFAULT);
      }
    }
  }, [basemap]);

  // ── Load parks (cached) ───────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [{ data: geojson, fromCache: cached }, { data: suburbs }] = await Promise.all([
          fetchWithCache<MixedCollection<ParksProperties>>(`${BASE}data/Parks.geojson`, "pp_parks"),
          fetchWithCache<Record<string, { suburb: string }>>(`${BASE}data/parks-suburbs.json`, "pp_suburbs")
            .catch(() => ({ data: {} as Record<string, { suburb: string }>, fromCache: false })),
        ]);
        setFromCache(cached);
        const SYDNEY = calcCentroid([[151.2093, -33.8688]]);
        const parks: Park[] = geojson.features.map((f, i) => {
          const p = f.properties ?? {};
          // Parks are area geometry; fall back to the city centre for the rare
          // feature with no usable coordinates so it is still searchable.
          const centre = readFeatureCentroid(f) ?? SYDNEY;
          return {
            id: p.OBJECTID ?? i,
            name: p.Name || "Unnamed Park",
            type: p.Type || "Unknown",
            suburb: suburbs[String(p.OBJECTID)]?.suburb || "",
            hasPlayground: p.Playgrounds === "Yes",
            area: p.Shape__Area ? Math.round(p.Shape__Area) : null,
            assetId: p.Asset_ID || "",
            lat: centre.lat,
            lng: centre.lng,
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

  // ── Blacktown layer (cached, viewport-culled) ────────────────────────────
  // Always-on, and 1,605 features — previously every one of them was added to
  // the DOM on load regardless of whether it was on screen.
  useCulledMarkerLayer<Record<string, unknown>>(mapInstance, {
    // FR1.6: the Blacktown overlay is Blacktown-only data, so it is shown
    // only when nothing is selected or Blacktown itself is selected.
    enabled: selectedCouncilIds.length === 0 || selectedCouncilIds.includes("blacktown-city-council"),
    url: `${BASE}data/blacktown.geojson`,
    cacheId: "pp_blacktown",
    label: "Blacktown parks",
    build: (p, [lat, lng]) => {
      const isPlayground = p.leisure === "playground";
      const color = isPlayground ? "#DC267F" : "#8B1A6B";
      const label = isPlayground ? "Playground" : "Park";
      const name = (p.name as string) || label;
      const marker = L.marker([lat, lng], {
        icon: getOverlayIcon(color, isPlayground ? 16 : 20, isPlayground ? "50%" : "4px"),
        title: name,
      });
      marker.bindPopup(() => buildSimplePopup(color, `${label} · Blacktown`, name), { maxWidth: 240 });
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, blacktown: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

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

  // ── Selected council geometry (FR1.6) and transport scope (FR4.4) ────────
  const selectedGeometries = useMemo(() => {
    const map = new Map<string, CouncilGeometry>();
    for (const id of selectedCouncilIds) {
      const feature = councilFeatures.get(id);
      if (feature?.geometry) map.set(id, feature.geometry as CouncilGeometry);
    }
    return map;
  }, [selectedCouncilIds, councilFeatures]);

  /**
   * FR4.4 scope predicate: only stops inside a selected council render. Bounding
   * boxes are pre-computed because the predicate runs once per visible marker.
   * While boundaries are still loading the filter is undefined and the layer
   * shows every stop — the same degradation FR1.6 applies to the parks list.
   */
  const transportFilter = useMemo(() => {
    if (selectedGeometries.size === 0) return undefined;
    const boxes = new Map<string, BBox>();
    for (const [id, geometry] of selectedGeometries) boxes.set(id, bboxOfGeometry(geometry));
    const geometries = [...selectedGeometries];
    return (_props: TransportStopProperties, [lat, lng]: [number, number]) =>
      geometries.some(([id, geometry]) => pointInCouncil(geometry, lng, lat, boxes.get(id)));
  }, [selectedGeometries]);

  // ── Culled point overlays (fountains, transport, toilets) ──────────────────
  // These datasets hold between 273 and 3,127 points each. They used to be
  // added to the map in one shot, so ticking a filter created thousands of
  // marker DOM nodes whether or not they were on screen.
  useCulledMarkerLayer<Record<string, unknown>>(mapInstance, {
    enabled: filters.fountains,
    url: `${BASE}data/drinking-fountains.geojson`,
    cacheId: "pp_fountains",
    label: "drinking fountains",
    build: (p, [lat, lng]) => {
      const name = (p.name as string) || "Water Fountain";
      const marker = L.marker([lat, lng], { icon: getOverlayIcon("#0077B6", 16, "50%"), title: name });
      marker.bindPopup(() => buildSimplePopup("#0077B6", "Drinking Fountain", name), { maxWidth: 200 });
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, fountains: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

  // FR4.4: the converted stops.geojson (26,198 stations, route_types[] per
  // stop) replaces the legacy 1,164-stop public-transports.json behind the
  // same contract, scoped to the selected councils through the FR1.6 filter.
  useCulledMarkerLayer<TransportStopProperties>(mapInstance, {
    enabled: filters.transport,
    url: `${BASE}data/transport/stops.geojson`,
    cacheId: "pp_transport_stops",
    label: "public transport",
    refreshKey: `${selectedCouncilIds.join(",")}:${selectedGeometries.size}`,
    filter: transportFilter,
    build: (p, [lat, lng]) => {
      const name = p.stop_name || "Transport Stop";
      const modes = (p.route_types ?? []).map((m) => ROUTE_MODE_LABELS[m] ?? m);
      const marker = L.marker([lat, lng], { icon: getOverlayIcon("#9B2335", 16, "3px"), title: name });
      marker.on("add", () => {
        // Test hook: lets e2e verify FR4.4 (every rendered stop is inside the
        // selected council) without reaching into Leaflet internals.
        const el = marker.getElement();
        if (el) {
          el.dataset.ppStopId = p.stop_id ?? "";
          el.dataset.ppLat = String(lat);
          el.dataset.ppLng = String(lng);
        }
      });
      marker.bindPopup(
        () => buildSimplePopup("#9B2335", modes.length ? modes.join(" · ") : "Transport", name),
        { maxWidth: 200 },
      );
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, transport: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

  useCulledMarkerLayer<Record<string, unknown>>(mapInstance, {
    enabled: filters.toilets,
    url: `${BASE}data/toilets-sydney.json`,
    cacheId: "pp_toilets",
    label: "public toilets",
    build: (p, [lat, lng]) => {
      const name =
        (p.name as string) ||
        (p.toilet_name as string) ||
        ((p.properties as Record<string, unknown> | undefined)?.name as string) ||
        "Public Toilet";
      const marker = L.marker([lat, lng], { icon: getOverlayIcon("#6D597A", 16, "3px"), title: name });
      marker.bindPopup(() => buildSimplePopup("#6D597A", "Public Toilet", name), { maxWidth: 200 });
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, toilets: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

  // ── Inner West LGA layers (Sprint 2 POC — static GeoJSON, no DB) ──────────
  // Parks: uses the standard LgaPark shape from @workspace/parks-sydney.
  useCulledMarkerLayer<Record<string, unknown>>(mapInstance, {
    enabled: filters.iwParks,
    url: `${BASE}data/inner-west/parks.geojson`,
    cacheId: "pp_iw_parks",
    label: "Inner West parks",
    build: (p, [lat, lng]) => {
      const name = (p.Name as string) || (p.name as string) || "Park";
      const color = p.Type === "Playground" ? "#DC267F" : "#8B1A6B";
      const marker = L.marker([lat, lng], {
        icon: getOverlayIcon(color, 18, "4px"),
        title: name,
      });
      marker.bindPopup(() => buildSimplePopup(color, "Park · Inner West", name), { maxWidth: 240 });
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, iwParks: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

  // Trees: static GeoJSON — no sharding yet for LGA-level tree data.
  useCulledMarkerLayer<Record<string, unknown>>(mapInstance, {
    enabled: filters.iwTrees,
    url: `${BASE}data/inner-west/trees.geojson`,
    cacheId: "pp_iw_trees",
    label: "Inner West trees",
    build: (p, [lat, lng]) => {
      const name = (p.CommonName as string) || (p.SpeciesName as string) || "Tree";
      const marker = L.marker([lat, lng], {
        icon: getOverlayIcon("#52B788", 12, "50%"),
        title: name,
      });
      marker.bindPopup(() => {
        const div = document.createElement("div");
        div.className = "pp-popup";
        const badge = document.createElement("span");
        badge.className = "pp-popup-type";
        badge.style.background = "#40916C";
        badge.textContent = "🌳 Tree · Inner West";
        div.appendChild(badge);
        const heading = document.createElement("h3");
        heading.textContent = name;
        div.appendChild(heading);
        const species = (p.SpeciesName as string) || "";
        if (species && species !== name) {
          const sp = document.createElement("p");
          sp.style.fontSize = "11px";
          sp.style.color = "var(--pp-text-muted)";
          sp.textContent = species;
          div.appendChild(sp);
        }
        const details: string[] = [];
        if (p.TreeType) details.push(String(p.TreeType));
        if (p.Tree_Age) details.push(String(p.Tree_Age));
        if (typeof p.DBH_in_cm === "number") details.push(`${p.DBH_in_cm} cm trunk`);
        if (typeof p.TreeHeight === "number") details.push(`${p.TreeHeight} m`);
        if (details.length) {
          const meta = document.createElement("p");
          meta.style.fontSize = "11px";
          meta.style.color = "var(--pp-text-muted)";
          meta.textContent = details.join(" · ");
          div.appendChild(meta);
        }
        return div;
      }, { maxWidth: 240 });
      return marker;
    },
    onCount: (total) => setLayerCounts((prev) => ({ ...prev, iwTrees: total })),
    onError: (label) => toast(`Could not load ${label}`, "error"),
  });

  // ── Trees layer (sharded, canvas-rendered; council-aware per FR3.3–3.4) ──
  // The layer is rebuilt whenever the council selection changes so only the
  // selected councils' shard sets are fetched.
  const councilTreeKeyRef = useRef<string>("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const councilKey = selectedCouncilIds.join(",");
    if (councilTreeKeyRef.current !== councilKey) {
      // Selection changed: drop the old layer so loadTrees runs again.
      if (treeLayerRef.current) {
        if (map.hasLayer(treeLayerRef.current)) map.removeLayer(treeLayerRef.current);
        treeLayerRef.current = null;
      }
      councilTreeKeyRef.current = councilKey;
    }

    const loadTrees = async () => {
      if (treeLayerRef.current) return;
      if (!treeRendererRef.current) {
        treeRendererRef.current = L.canvas({ padding: 0.5 });
      }
      const renderer = treeRendererRef.current;
      const bounds = map.getBounds();
      try {
        const { trees, info } = await loadTreesForBounds(
          {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          },
          { councilIds: selectedCouncilIds },
        );
        // The fetch may outlive the map (StrictMode remount, route change).
        if (mapRef.current !== map) return;
        if (!trees.length) return;
        const layer = L.layerGroup();
        const index = treeIndexRef.current ?? new NearestIndex(allParksRef.current);
        treeIndexRef.current = index;
        for (const tree of trees) {
          const circle = L.circleMarker([tree.lat, tree.lng], {
            renderer,
            radius: 3,
            color: "#2D6A4F",
            fillColor: "#52B788",
            fillOpacity: 0.78,
            weight: 0.5,
            interactive: true,
          });
          // Lazy: the nearest-park lookup runs when the popup is opened, not
          // once per tree at load time.
          circle.bindPopup(() => buildTreePopup(tree, index.nearest(tree.lat, tree.lng)), { maxWidth: 240 });
          layer.addLayer(circle);
        }
        treeLayerRef.current = layer;
        setLayerCounts((prev) => ({ ...prev, trees: info.total }));
      } catch (err) {
        console.error("[explore] failed to load tree data:", err);
        toast("Could not load tree data", "error");
      }
    };

    if (filters.trees) {
      void loadTrees().then(() => {
        if (mapRef.current !== map) return;
        if (treeLayerRef.current) {
          if (map.getZoom() >= TREE_ZOOM_THRESHOLD) {
            if (!map.hasLayer(treeLayerRef.current)) map.addLayer(treeLayerRef.current);
            setTreeZoomHint(false);
          } else {
            setTreeZoomHint(true);
          }
        }
      });
    } else {
      if (treeLayerRef.current && map.hasLayer(treeLayerRef.current)) map.removeLayer(treeLayerRef.current);
      setTreeZoomHint(false);
    }
  }, [filters.trees, selectedCouncilIds]);
  // ── Dog parks layer (cached + raw data for modal cross-ref) ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadDogs = async () => {
      if (dogLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<FeatureCollection<DogProperties>>(
          `${BASE}data/Dog_off-leash_parks.geojson`, "pp_dogs",
        );
        // Stale fetch: the map that requested it is gone.
        if (mapRef.current !== map) return;
        const layer = L.layerGroup();
        const raw: DogRaw[] = [];
        (data.features || []).forEach((f) => {
          const at = readLatLng(f);
          if (!at) return;
          const p = f.properties ?? {};
          raw.push({ name: p.ParkName ?? "Dog off-leash area", lat: at.lat, lng: at.lng });
          const marker = L.marker([at.lat, at.lng], {
            icon: makeIcon("#AACC00", 26, "50%", PAW_GLYPH),
            title: p.ParkName,
          });
          marker.bindPopup(() => buildDogPopup(p), { maxWidth: 280 });
          layer.addLayer(marker);
        });
        dogLayerRef.current = layer;
        setDogRawData(raw);
        setLayerCounts(prev => ({ ...prev, dogs: raw.length }));
      } catch (err) {
        console.error("[explore] failed to load dog parks:", err);
        toast("Could not load dog parks", "error");
      }
    };
    if (filters.dogs) { loadDogs().then(() => { if (mapRef.current !== map) return; if (dogLayerRef.current && !map.hasLayer(dogLayerRef.current)) map.addLayer(dogLayerRef.current); }); }
    else if (dogLayerRef.current && map.hasLayer(dogLayerRef.current)) map.removeLayer(dogLayerRef.current);
  }, [filters.dogs]);

  // ── NPWS facilities layer (clustered, cached + raw for modal) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const loadNPWS = async () => {
      if (npwsLayerRef.current) return;
      try {
        const { data } = await fetchWithCache<FeatureCollection<NpwsProperties>>(
          `${BASE}data/npws-facilities-greater-sydney.geojson`, "pp_npws",
        );
        if (mapRef.current !== map) return;
        const cluster = L.markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 17, chunkedLoading: true });
        const raw: NpwsRaw[] = [];
        (data.features || []).forEach((f) => {
          const at = readLatLng(f);
          if (!at) return;
          const p = f.properties ?? {};
          raw.push({
            name: p.AssetName || "NPWS Facility",
            subtype: p.d_SubtypeC || "Facility",
            lat: at.lat, lng: at.lng,
          });
          const color = npwsColor(p.d_SubtypeC || "");
          const marker = L.marker([at.lat, at.lng], { icon: makeIcon(color, 14), title: p.AssetName });
          marker.bindPopup(() => buildNpwsPopup(p, color), { maxWidth: 260 });
          cluster.addLayer(marker);
        });
        npwsLayerRef.current = cluster;
        setNpwsRawData(raw);
        setLayerCounts(prev => ({ ...prev, npws: raw.length }));
      } catch (err) {
        console.error("[explore] failed to load NPWS facilities:", err);
        toast("Could not load NPWS facilities", "error");
      }
    };
    if (filters.npws) { loadNPWS().then(() => { if (mapRef.current !== map) return; if (npwsLayerRef.current && !map.hasLayer(npwsLayerRef.current)) map.addLayer(npwsLayerRef.current); }); }
    else if (npwsLayerRef.current && map.hasLayer(npwsLayerRef.current)) map.removeLayer(npwsLayerRef.current);
  }, [filters.npws]);

  // ── Filter parks list (with fuzzy scoring) ────────────────────────────────
  // FR1.6 geometry (selectedGeometries) is declared above the culled overlays
  // so the FR4.4 transport scope can share the same map.

  /**
   * Parks after point-in-polygon scoping (bbox pre-filter → ray-casting,
   * holes honoured). While boundaries are still loading — or the index failed
   * — the unscoped list is returned so the app degrades to its old behaviour
   * instead of flashing an empty result set.
   */
  const scopedParks = useMemo(() => {
    if (selectedCouncilIds.length === 0 || selectedGeometries.size === 0) return allParks;
    return filterByCouncils(allParks, selectedGeometries);
  }, [allParks, selectedCouncilIds, selectedGeometries]);

  // ── FR4.5 — transit stops in selection ───────────────────────────────────
  // stops.geojson is 5.9 MB, so it is fetched only once someone can use it (a
  // council is selected or the transport layer is on) and then held in the
  // dataCache memory tier; until then the stat renders as "—".
  const [transitPoints, setTransitPoints] = useState<{ lat: number; lng: number }[] | null>(null);
  const [transitLoading, setTransitLoading] = useState(false);

  useEffect(() => {
    if (transitPoints !== null || transitLoading) return;
    if (!filters.transport && selectedCouncilIds.length === 0) return;
    setTransitLoading(true);
    (async () => {
      try {
        const { data } = await fetchWithCache<FeatureCollection>(
          `${BASE}data/transport/stops.geojson`,
          "pp_stops_fc",
        );
        const pts: { lat: number; lng: number }[] = [];
        for (const f of data.features ?? []) {
          const ll = readLatLng(f);
          if (ll) pts.push({ lat: ll.lat, lng: ll.lng });
        }
        setTransitPoints(pts);
      } catch (err) {
        console.error("[explore] failed to load transit stops:", err);
        toast("Could not load transit stops", "error");
      } finally {
        setTransitLoading(false);
      }
    })();
  }, [filters.transport, selectedCouncilIds, transitPoints, transitLoading, toast]);

  /** Stops inside the selection (bbox pre-filter → ray-casting), null until loaded. */
  const transitStopsInSelection = useMemo(() => {
    if (transitPoints === null) return null;
    if (selectedCouncilIds.length === 0 || selectedGeometries.size === 0) return transitPoints.length;
    return filterByCouncils(transitPoints, selectedGeometries).length;
  }, [transitPoints, selectedCouncilIds, selectedGeometries]);

  useEffect(() => {
    const q = search.toLowerCase().trim();
    const anyParkFilter = PARK_TYPE_KEYS.some(k => filters[k]);

    const typeMatch = (park: Park) =>
      (filters.playground && park.hasPlayground) ||
      (filters.sports && (park.type === "Sportsfield" || park.type === "Sports")) ||
      (filters.iconic && park.type === "Iconic") ||
      (filters.neighbourhood && park.type === "Neighbourhood") ||
      (filters.pocket && park.type === "Pocket") ||
      (filters.sportsfield && park.type === "Sportsfield");

    const areaPass = (park: Park) => !minArea || (park.area != null && park.area >= minArea);

    if (!q) {
      setFiltered(scopedParks.filter(p => (!anyParkFilter || typeMatch(p)) && areaPass(p)));
      return;
    }

    const scored = scopedParks
      .map(park => ({ park, score: fuzzyScore(park, q) }))
      .filter(x => x.score > 0 && (!anyParkFilter || typeMatch(x.park)) && areaPass(x.park))
      .sort((a, b) => b.score - a.score)
      .map(x => x.park);

    setFiltered(scored);
  }, [scopedParks, search, filters, minArea]);

  // ── Geocode fallback ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim() || filtered.length > 0 || geocodeNearby !== null || scopedParks.length === 0) return;
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
          const nearby = [...scopedParks]
            .sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng))
            .slice(0, 50);
          setGeocodeNearby(nearby);
          setGeocodePlace(place);
          toast(`Showing parks near "${place}"`, "info");
        }
      } catch (err) {
        // The effect's cleanup aborts this fetch whenever the query moves on
        // (typing, clearing) — that is cancellation, not a failure.
        if ((err as { name?: string })?.name === "AbortError") return;
        console.error("[explore] failed to load geocoding:", err);
        toast("Could not load geocoding", "error");
      }
    })();
    return () => controller.abort();
  }, [search, filtered.length, geocodeNearby, scopedParks, toast]);

  const closeParkModal = useCallback(() => setSelectedPark(null), []);

  // ── Computed values ───────────────────────────────────────────────────────
  const parkStats = useMemo(() => ({
    playgrounds:   allParks.filter(p => p.hasPlayground).length,
    iconic:        allParks.filter(p => p.type === "Iconic").length,
    neighbourhood: allParks.filter(p => p.type === "Neighbourhood").length,
    sports:        allParks.filter(p => p.type === "Sportsfield" || p.type === "Sports").length,
    pocket:        allParks.filter(p => p.type === "Pocket").length,
  }), [allParks]);

  // Seed each layer's record count from the generated snapshot, so a category
  // states how many records it holds before the visitor switches it on. Once a
  // layer loads it reports its own count and overwrites this seed. A layer
  // with no generated count keeps "—" rather than a fabricated zero.
  // Depend on the counts object, not on the hook's wrapper: `useDataSnapshot`
  // returns a fresh `{ status, snapshot, reload }` each render, so depending on
  // it would re-run this effect forever.
  const snapshotCounts = snapshot.status === "ready" ? snapshot.snapshot.counts : null;
  useEffect(() => {
    if (!snapshotCounts) return;
    setLayerCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const toggle of LAYER_TOGGLES) {
        if (next[toggle.key] !== undefined) continue;
        const layer = getLayer(toggle.key);
        const value = layer ? countFor(layer, snapshotCounts) : null;
        if (value !== null) {
          next[toggle.key] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [snapshotCounts]);

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
    return scopedParks
      .map(p => ({ park: p, score: fuzzyScore(p, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.park);
  }, [scopedParks, search, sortedDisplayParks.length, geocodeNearby]);

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
    // Wait for the fly-to animation to settle before revealing the marker.
    setTimeout(() => {
      const marker = markersByIdRef.current.get(park.id);
      const map = mapRef.current;
      if (!marker || !map) return;
      const cluster = parkClusterRef.current;
      // Clustering is off from z16; if the fly-to was interrupted the marker
      // may still be wrapped, and zoomToShowLayer unwraps + reveals it.
      const revealed = map.getZoom() >= 16 && map.getBounds().contains([park.lat, park.lng]);
      if (cluster && !revealed) {
        cluster.zoomToShowLayer(marker, () => marker.openPopup());
      } else {
        marker.openPopup();
      }
    }, 1300);
  }, []);

  // Expose the component's handlers to the module-level popup builders.
  useEffect(() => {
    selectParkFromPopup = selectPark;
    toastForPopup = toast;
  }, [selectPark, toast]);

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
    // Registry-driven layers are not part of `Filters`; reset them too so the
    // button means the same thing for every chip in this panel.
    setGenericEnabled(Object.fromEntries(GENERIC_LAYERS.map((layer) => [layer.id, layer.defaultVisible])));
    setGeocodeNearby(null); setGeocodePlace("");
    setSortBy("default");
    setVisibleCount(100);
    setShowFavOnly(false);
    setMinArea(0);
    searchInputRef.current?.focus();
  }, []);

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

  // Only restrictions on the *results list* count here: park-type chips,
  // search, favourites. Overlay layers (trees/toilets/dogs/…) add map data
  // without narrowing parks, so counting them made a permanent "7" badge and
  // flipped the header into its restricted variant.
  const activeFilterCount = PARK_TYPE_KEYS.filter(k => filters[k]).length + (search ? 1 : 0) + (showFavOnly ? 1 : 0);

  // ── Council selection derived values (FR1) ──────────────────────────────
  const selectedCouncilEntries = useMemo(() => {
    if (!councilIndex) return [];
    return selectedCouncilIds
      .map(id => councilIndex.councils.find(c => c.lga_id === id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
  }, [councilIndex, selectedCouncilIds]);

  const networkParksAreaHa = useMemo(
    () => allParks.reduce((sum, p) => sum + (p.area ?? 0), 0) / 10000,
    [allParks],
  );

  /** Playground total for the hero tiles (parks dataset only). */
  const playgroundCount = useMemo(
    () => allParks.filter(p => p.hasPlayground).length,
    [allParks],
  );

  const selectedPending = useMemo(
    () => selectedCouncilIds.filter(id => pendingBoundaries.includes(id)),
    [selectedCouncilIds, pendingBoundaries],
  );
  const selectedFailed = useMemo(
    () => selectedCouncilIds.filter(id => failedBoundaries.includes(id)),
    [selectedCouncilIds, failedBoundaries],
  );

  /** Stats skeleton while the index — or the first boundary — is in flight. */
  const councilStatsLoading =
    councilStatus === "loading" ||
    (selectedCouncilIds.length > 0 && selectedPending.length > 0 && selectedGeometries.size === 0);

  /** Single entry point for every selection mutation (FR1.3 multi/single). */
  const handleCouncilChange = useCallback((ids: string[]) => {
    setSelectedCouncilIds(ids);
    // Forget fetch outcomes for councils no longer selected, so re-selecting
    // one retries instead of inheriting a stale "unavailable" flag.
    setFailedBoundaries(prev => prev.filter(id => ids.includes(id)));
    setPendingBoundaries(prev => prev.filter(id => ids.includes(id)));
  }, []);
  const displayParks = sortedDisplayParks;

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="fa-shell fa-explore-page">
      <Navbar />
      <main id="main-content" className="fa-explore-main">

        {/* ── Intro: the page's claim, and three verified figures ─────────── */}
        <header className="fa-explore-intro">
          <div className="fa-wrap fa-explore-intro-inner">
            <div className="fa-explore-intro-copy">
              <h1 className="fa-explore-title">
                Parks, trees and facilities, mapped with their sources
              </h1>
              <p className="fa-explore-lede">
                Start with City of Sydney park records and off-leash areas, then add
                facilities, trees or transport. Every layer names its publisher and extent,
                and every count is a record count — never a unique-place total.
              </p>
            </div>
            <dl className="fa-explore-figures">
              {(
                [
                  ["Parks", allParks.length > 0 ? allParks.length.toLocaleString() : "—"],
                  ["Playgrounds", playgroundCount > 0 ? playgroundCount.toLocaleString() : "—"],
                  ["Councils", councilIndex ? councilIndex.total_councils.toLocaleString() : "—"],
                ] as const
              ).map(([label, value]) => (
                <div className="fa-figure" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <div className="fa-wrap fa-explore-body">
          <div className="fa-explore-grid">

            {/* ── Rail: search, scope, categories, results ────────────────── */}
            <aside className="fa-rail" id="explore-controls" aria-label="Search, categories and results">

              <div className="fa-search">
                <svg className="fa-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="fa-search-input"
                  placeholder="Search parks, suburbs, types…"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setShowHistory(false);
                  }}
                  onFocus={() => {
                    setSearchFocused(true);
                    if (!searchInput && searchHistory.length > 0) setShowHistory(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowHistory(false);
                      setSearchFocused(false);
                    }, 160);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      clearAll();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const first = resultsListRef.current?.querySelector<HTMLElement>(".fa-result-title");
                      first?.focus();
                      first?.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  aria-label="Search parks"
                  autoComplete="off"
                />
                {searchInput ? (
                  <button type="button" className="fa-search-clear" onClick={clearAll} aria-label="Clear search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : (
                  <kbd className="fa-kbd" title="Press / to focus search">/</kbd>
                )}

                {showHistory && searchHistory.length > 0 && !searchInput && (
                  <div className="fa-search-menu" role="listbox" aria-label="Recent searches">
                    <div className="fa-search-menu-head">
                      <span>Recent</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchHistory([]);
                          localStorage.removeItem("parkpulse_history");
                          setShowHistory(false);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    {searchHistory.map((historyItem, i) => (
                      <button
                        key={i}
                        type="button"
                        className="fa-search-option"
                        role="option"
                        aria-selected={false}
                        onMouseDown={() => {
                          setSearchInput(historyItem);
                          setShowHistory(false);
                        }}
                      >
                        {historyItem}
                      </button>
                    ))}
                  </div>
                )}

                {!showHistory && autoCompleteSuggestions.length > 0 && (
                  <div className="fa-search-menu" role="listbox" aria-label="Suggestions">
                    {autoCompleteSuggestions.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        className="fa-search-option"
                        role="option"
                        aria-selected={false}
                        onMouseDown={() => {
                          setSearchInput(item.value);
                          setSearchFocused(false);
                        }}
                      >
                        <span className="fa-search-option-label">{item.label}</span>
                        <span className="fa-search-option-kind">
                          {item.kind === "suburb" ? "Suburb" : item.kind === "type" ? "Type" : "Park"}
                        </span>
                        <span className="fa-search-option-sub">{item.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Council scope — shared with Insights through ?councils= */}
              <section className="fa-panel" aria-labelledby="fa-scope-heading">
                <div className="fa-panel-head">
                  <h2 id="fa-scope-heading">Council scope</h2>
                  {selectedCouncilIds.length > 0 && (
                    <button
                      type="button"
                      className="fa-panel-link"
                      onClick={() => handleCouncilChange([])}
                    >
                      Network-wide
                    </button>
                  )}
                </div>
                <div className="fa-panel-body">
                  <CouncilSelector
                    entries={councilIndex?.councils ?? []}
                    status={councilStatus}
                    selectedIds={selectedCouncilIds}
                    mode={councilMode}
                    onModeChange={setCouncilMode}
                    onChange={handleCouncilChange}
                  />
                </div>
                {selectedCouncilIds.length > 0 && (
                  <>
                    <MultiCouncilPanel
                      map={mapInstance}
                      entries={councilIndex?.councils ?? []}
                      selectedIds={selectedCouncilIds}
                      features={councilFeatures}
                      pendingIds={selectedPending}
                      failedIds={selectedFailed}
                      onRemove={(id) => handleCouncilChange(selectedCouncilIds.filter((x) => x !== id))}
                      onClear={() => handleCouncilChange([])}
                    />
                    <div className="fa-panel-divider" role="presentation" />
                  </>
                )}
              </section>

              {/* Categories — every published point layer, with real counts */}
              <section className="fa-panel" aria-labelledby="fa-categories-heading">
                <div className="fa-panel-head">
                  <h2 id="fa-categories-heading">Map layers</h2>
                  <button type="button" className="fa-panel-link" onClick={clearAll}>
                    Reset
                  </button>
                </div>
                <div className="fa-panel-body">
                  <div className="fa-chip-grid">
                    <button
                      type="button"
                      className="fa-chip"
                      aria-pressed="true"
                      disabled
                      title="City of Sydney park areas are always shown"
                    >
                      <span className="fa-chip-swatch" style={{ background: "var(--pp-primary)" }} aria-hidden="true" />
                      <span className="fa-chip-label">Parks</span>
                      <span className="fa-chip-count">
                        {allParks.length > 0 ? allParks.length.toLocaleString() : "—"}
                      </span>
                    </button>
                    {LAYER_TOGGLES.map((toggle) => {
                      const count = layerCounts[toggle.countKey ?? ""];
                      return (
                        <button
                          key={toggle.key}
                          type="button"
                          className="fa-chip"
                          data-layer={toggle.key}
                          aria-pressed={filters[toggle.key]}
                          onClick={() => toggleFilter(toggle.key)}
                          title={`${filters[toggle.key] ? "Hide" : "Show"} ${toggle.label.toLowerCase()} on the map${toggle.hint ? ` (${toggle.hint})` : ""}`}
                        >
                          <span className="fa-chip-swatch" style={{ background: toggle.color }} aria-hidden="true" />
                          <span className="fa-chip-label">{toggle.label}</span>
                          <span className="fa-chip-count">
                            {count !== undefined ? count.toLocaleString() : "—"}
                          </span>
                        </button>
                      );
                    })}
                    {GENERIC_LAYERS.map((layer) => {
                      const loaded = genericCounts[layer.id];
                      const snapshotCount = layer.countKey ? layerCounts[layer.countKey] : undefined;
                      const count = loaded ?? snapshotCount;
                      return (
                        <button
                          key={layer.id}
                          type="button"
                          className="fa-chip"
                          data-layer={layer.id}
                          aria-pressed={Boolean(genericEnabled[layer.id])}
                          onClick={() =>
                            setGenericEnabled((previous) => ({ ...previous, [layer.id]: !previous[layer.id] }))
                          }
                          title={`${genericEnabled[layer.id] ? "Hide" : "Show"} ${layer.label.toLowerCase()} on the map`}
                        >
                          <span className="fa-chip-swatch" style={{ background: layer.mapColor ?? "#8B5CF6" }} aria-hidden="true" />
                          <span className="fa-chip-label">{layer.label}</span>
                          <span className="fa-chip-count">{count !== undefined ? count.toLocaleString() : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {genericError && (
                  <p className="fa-panel-note fa-panel-note--warn" role="status">{genericError}</p>
                )}
                <p className="fa-panel-note">
                  {filters.trees && treeZoomHint
                    ? "Trees appear from zoom 16 — zoom in on the map to load them."
                    : "Layer counts are records in each dataset, not unique places."}{" "}
                  {UNSHIPPED_LAYERS.map((layer) => layer.label).join(" and ")} are registered but not
                  shipped in this build.
                </p>
              </section>

              {/* Park-type refinements + minimum area */}
              <section className="fa-panel" aria-labelledby="fa-types-heading">
                <div className="fa-panel-head">
                  <h2 id="fa-types-heading">Park type</h2>
                  <span className="fa-panel-meta">
                    {activeFilterCount > 0 ? `${activeFilterCount} active` : "All types"}
                  </span>
                </div>
                <div className="fa-panel-body">
                  <div className="fa-chip-grid">
                    {TYPE_FILTERS.map((type) => {
                      const count = layerCounts[type.countKey];
                      return (
                        <button
                          key={type.key}
                          type="button"
                          className="fa-chip"
                          data-type-filter={type.key}
                          aria-pressed={filters[type.key]}
                          onClick={() => toggleFilter(type.key)}
                        >
                          <span className="fa-chip-swatch" style={{ background: type.color }} aria-hidden="true" />
                          <span className="fa-chip-label">{type.label}</span>
                          <span className="fa-chip-count">
                            {count !== undefined ? count.toLocaleString() : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="fa-panel-body fa-panel-body--inline">
                  <span className="fa-panel-meta">Minimum area</span>
                  <div className="fa-seg" role="group" aria-label="Minimum park area">
                    {(
                      [
                        { val: 0, label: "Any" },
                        { val: 500, label: "500m²" },
                        { val: 2000, label: "2,000m²" },
                        { val: 10000, label: "1ha" },
                        { val: 50000, label: "5ha" },
                      ] as const
                    ).map(({ val, label }) => (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={minArea === val}
                        onClick={() => setMinArea(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Results */}
              <section className="fa-results" aria-labelledby="fa-results-heading">
                <div className="fa-results-head">
                  <h2 id="fa-results-heading">Results</h2>
                  <span className="fa-results-count">
                    {geocodePlace
                      ? `Near "${geocodePlace}"`
                      : activeFilterCount > 0 || selectedCouncilIds.length > 0
                        ? (() => {
                            const withArea = displayParks.filter((p) => p.area);
                            const totalHa = withArea.reduce((s, p) => s + (p.area ?? 0), 0) / 10000;
                            return `${displayParks.length.toLocaleString()} parks${
                              withArea.length > 1 ? ` · ${totalHa.toFixed(0)} ha` : ""
                            }`;
                          })()
                        : `${allParks.length.toLocaleString()} park records`}
                  </span>
                </div>

                <div className="fa-toolbar fa-results-tools">
                  <div className="fa-seg" role="group" aria-label="Sort order">
                    {(
                      [
                        { key: "default", label: "Default" },
                        { key: "name", label: "A–Z" },
                        { key: "nearest", label: "Nearest" },
                        { key: "size", label: "Largest" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className="fa-sort-btn"
                        aria-pressed={sortBy === option.key}
                        title={
                          option.key === "nearest" && !userLocation
                            ? "Find your location to sort by distance"
                            : `Sort by ${option.label.toLowerCase()}`
                        }
                        onClick={() => {
                          if (option.key === "nearest" && !userLocation) {
                            handleLocate();
                          } else {
                            setSortBy(option.key);
                          }
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="fa-tool-btn"
                    aria-pressed={showFavOnly}
                    onClick={() => setShowFavOnly((v) => !v)}
                    title="Show saved parks only (D)"
                  >
                    Saved{favoriteIds.size > 0 ? ` ${favoriteIds.size}` : ""}
                  </button>

                  {displayParks.length > 1 && (
                    <button type="button" className="fa-tool-btn" onClick={fitToResults} title="Fit the map to these results (F)">
                      Fit map
                    </button>
                  )}
                  {displayParks.length > 0 && (
                    <button type="button" className="fa-tool-btn" onClick={surpriseMe} title="Open a random park from the results (S)">
                      Surprise
                    </button>
                  )}
                  <button
                    type="button"
                    className="fa-tool-btn"
                    aria-pressed={showShortcuts}
                    onClick={() => setShowShortcuts((v) => !v)}
                    title="Keyboard shortcuts (?)"
                  >
                    Keys
                  </button>
                  {(activeFilterCount > 0 || search || geocodeNearby) && (
                    <button type="button" className="fa-tool-btn" onClick={copySearchLink} title="Copy a link to this search">
                      Copy link
                    </button>
                  )}
                  {showFavOnly && favoriteIds.size > 0 && (
                    <button type="button" className="fa-tool-btn" onClick={exportFavorites} title="Copy the saved list to the clipboard">
                      Export saved
                    </button>
                  )}
                </div>

                {(Object.entries(filters).some(([, v]) => v) || minArea > 0) && (
                  <div className="fa-active-chips">
                    {(Object.entries(filters) as [keyof Filters, boolean][])
                      .filter(([key, value]) => value && key !== "dogs")
                      .map(([key]) => (
                        <button
                          key={key}
                          type="button"
                          className="fa-active-chip"
                          onClick={() => setFilters((prev) => ({ ...prev, [key]: false }))}
                          title={`Remove ${filterLabel(key)}`}
                        >
                          {filterLabel(key)}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      ))}
                    {minArea > 0 && (
                      <button type="button" className="fa-active-chip" onClick={() => setMinArea(0)} title="Remove area filter">
                        ≥{fmtArea(minArea)}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {cacheWarning && (
                  <div className="fa-results-note" role="status">
                    {cacheWarning}
                    <button type="button" className="fa-panel-link" onClick={handleClearCache}>
                      Clear cache
                    </button>
                  </div>
                )}

                {fromCache && (
                  <p className="fa-results-note" role="status">
                    Showing cached data. It will refresh when this page next loads online.
                  </p>
                )}

                {geocodePlace && (
                  <div className="fa-results-note">
                    Results within reach of <strong>{geocodePlace}</strong>.
                    <button
                      type="button"
                      className="fa-panel-link"
                      onClick={() => {
                        setGeocodeNearby(null);
                        setGeocodePlace("");
                        setSearchInput("");
                        setSearch("");
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                {recentParks.length > 0 && (
                  <div className="fa-results-recents">
                    <span className="fa-panel-meta">Recently viewed</span>
                    <div className="fa-recents">
                      {recentParks.slice(0, 5).map((r) => {
                        const park = allParks.find((p) => p.id === r.id);
                        if (!park) return null;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className="fa-recent"
                            onClick={() => selectPark(park)}
                            title={park.suburb || park.type}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="fa-results-list" ref={resultsListRef}>
                  {loading && (
                    <div className="fa-result-skeletons" role="status" aria-live="polite">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="fa-result-skeleton" />
                      ))}
                      <span className="pp-visually-hidden">Loading park records</span>
                    </div>
                  )}

                  {!loading && displayParks.length === 0 && (
                    <div className="fa-state">
                      {showFavOnly && favoriteIds.size === 0 ? (
                        <>
                          <strong>Nothing saved yet.</strong>
                          Open a park and use Save to keep it here — saved places stay in this
                          browser.
                          <div className="fa-state-actions">
                            <button type="button" className="fa-btn fa-btn--secondary" onClick={() => setShowFavOnly(false)}>
                              Browse all parks
                            </button>
                          </div>
                        </>
                      ) : search ? (
                        <>
                          <strong>No parks match “{search}”.</strong>
                          Try a shorter spelling, a suburb, or a park type.
                          <div className="fa-state-actions">
                            <button
                              type="button"
                              className="fa-btn fa-btn--secondary"
                              onClick={() => {
                                setSearchInput("");
                                setSearch("");
                              }}
                            >
                              Clear search
                            </button>
                            {activeFilterCount > 0 && (
                              <button type="button" className="fa-btn fa-btn--secondary" onClick={clearAll}>
                                Clear all filters
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>No parks match these filters.</strong>
                          Widen the park type or lower the minimum area.
                          <div className="fa-state-actions">
                            <button type="button" className="fa-btn fa-btn--secondary" onClick={clearAll}>
                              Clear all filters
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div className="fa-did-you-mean">
                      <p className="fa-panel-meta">Did you mean</p>
                      <div className="fa-toolbar">
                        {suggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="fa-chip-btn"
                            onClick={() => setSearchInput(p.name)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {displayParks.slice(0, visibleCount).map((park, rank) => {
                    const dist = userLocation ? haversineKm(userLocation.lat, userLocation.lng, park.lat, park.lng) : null;
                    const areaLabel = park.area
                      ? park.area >= 10000
                        ? `${(park.area / 10000).toFixed(1)} ha`
                        : `${park.area.toLocaleString()} m²`
                      : null;
                    return (
                      <article
                        className="fa-result"
                        key={park.id}
                        data-park-id={park.id}
                        data-selected={selectedPark?.id === park.id ? "true" : undefined}
                        aria-labelledby={`result-title-${park.id}`}
                      >
                        <div className="fa-result-top">
                          <h3 className="fa-result-heading">
                            <button
                              type="button"
                              className="fa-result-title"
                              id={`result-title-${park.id}`}
                              onClick={() => selectPark(park)}
                            >
                              {park.name}
                            </button>
                          </h3>
                          <button
                            type="button"
                            className="fa-result-save"
                            aria-pressed={favoriteIds.has(park.id)}
                            aria-label={
                              favoriteIds.has(park.id)
                                ? `Remove ${park.name} from saved`
                                : `Save ${park.name}`
                            }
                            onClick={(e) => toggleFavorite(park.id, e)}
                          >
                            <svg viewBox="0 0 24 24" fill={favoriteIds.has(park.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                              <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
                            </svg>
                          </button>
                        </div>

                        <div className="fa-result-meta">
                          <button
                            type="button"
                            className="fa-result-type"
                            onClick={() => {
                              const map: Partial<Record<string, keyof Filters>> = {
                                Playground: "playground",
                                Iconic: "iconic",
                                Sports: "sports",
                                Sportsfield: "sportsfield",
                                Neighbourhood: "neighbourhood",
                                Pocket: "pocket",
                              };
                              const key = map[park.type];
                              if (key) {
                                setFilters((prev) => ({ ...prev, [key]: true }));
                                toast(`Filtered to ${park.type} parks`, "info");
                              }
                            }}
                          >
                            {park.type || "Unclassified"}
                          </button>
                          {park.suburb && (
                            <button
                              type="button"
                              className="fa-result-suburb"
                              onClick={() => {
                                setSearchInput(park.suburb!);
                                setSearch(park.suburb!);
                                setGeocodeNearby(null);
                                setGeocodePlace("");
                              }}
                            >
                              {park.suburb}
                            </button>
                          )}
                          {dist !== null && (
                            <span className="fa-result-distance">
                              {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
                            </span>
                          )}
                          {areaLabel && <span className="fa-result-area">{areaLabel}</span>}
                        </div>

                        <div className="fa-result-foot">
                          <span className="fa-result-facilities">
                            {park.hasPlayground && <span className="fa-facility">Playground</span>}
                            {rank < 100 && sortBy === "size" && <span className="fa-facility">Rank {rank + 1}</span>}
                          </span>
                          <button
                            type="button"
                            className="fa-panel-link"
                            onClick={() => selectPark(park)}
                          >
                            Open details
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  {displayParks.length > visibleCount && (
                    <>
                      <button
                        type="button"
                        className="fa-btn fa-btn--secondary fa-load-more"
                        onClick={() => setVisibleCount((v) => v + 100)}
                      >
                        Show {Math.min(100, displayParks.length - visibleCount)} more
                        <span className="fa-panel-meta">
                          {displayParks.length - visibleCount} remaining
                        </span>
                      </button>
                      <div ref={loadMoreSentinelRef} style={{ height: 1 }} aria-hidden="true" />
                    </>
                  )}
                </div>
              </section>

              {/* Scope totals sit after the results: they qualify the selection,
                  they are not a step in finding a place. Always rendered, so a
                  network-wide view still reports its figures. */}
              <section className="fa-panel fa-panel--totals" aria-labelledby="fa-council-totals-heading">
                <div className="fa-panel-head">
                  <h2 id="fa-council-totals-heading">Scope totals</h2>
                  <span className="fa-panel-meta">
                    {selectedCouncilEntries.length > 0
                      ? `${selectedCouncilEntries.length} council${selectedCouncilEntries.length > 1 ? "s" : ""}`
                      : "Network-wide"}
                  </span>
                </div>
                <CouncilStats
                  selected={selectedCouncilEntries}
                  parksInSelection={scopedParks}
                  transitStops={transitStopsInSelection}
                  transitLoading={transitLoading}
                  totalAreaKm2={councilIndex?.total_area_km2 ?? 0}
                  councilTotal={councilIndex?.total_councils ?? 0}
                  networkParks={allParks.length}
                  networkPlaygrounds={parkStats.playgrounds}
                  networkParksAreaHa={networkParksAreaHa}
                  layerCounts={layerCounts}
                  loading={councilStatsLoading}
                  failed={councilStatus === "error"}
                />
              </section>
            </aside>

            {/* ── Map: the stable right-hand pane ─────────────────────────── */}
            <div className="fa-map-col">
              <section className="fa-map-frame" aria-labelledby="fa-map-heading">
                <div className="fa-map-head">
                  <div>
                    <h2 id="fa-map-heading">Map</h2>
                    <p className="fa-map-sub">
                      {loading
                        ? "Loading park records"
                        : `${visibleMapCount.toLocaleString()} in view · ${displayParks.length.toLocaleString()} in results`}
                    </p>
                  </div>
                  <div className="fa-toolbar">
                    <button
                      type="button"
                      className="fa-tool-btn"
                      aria-pressed={basemap === "satellite"}
                      aria-label={basemap === "satellite" ? "Switch to street map" : "Switch to satellite imagery"}
                      onClick={() => setBasemap((b) => (b === "satellite" ? "streets" : "satellite"))}
                    >
                      {basemap === "satellite" ? "Satellite" : "Street"}
                    </button>
                    <button type="button" className="fa-tool-btn" onClick={handleLocate} title="Find my location (L)">
                      Locate
                    </button>
                    <button
                      type="button"
                      className="fa-tool-btn"
                      onClick={() => mapRef.current?.flyTo([-33.8688, 151.2093], 13, { duration: 1.1, easeLinearity: 0.25 })}
                      title="Recentre on Sydney CBD (M)"
                    >
                      Sydney
                    </button>
                  </div>
                </div>

                <div className="fa-map-canvas">
                  <div id="park-map" ref={mapContainerRef} />
                </div>

                <div className="fa-map-key" aria-label="Layers shown on the map">
                  <span
                    className="fa-key-item"
                    title="City of Sydney park areas are always shown"
                  >
                    <span className="fa-key-swatch" style={{ background: "var(--pp-primary)" }} aria-hidden="true" />
                    Parks
                  </span>
                  {LAYER_TOGGLES.filter((toggle) => filters[toggle.key]).map((toggle) => (
                    <button
                      key={toggle.key}
                      type="button"
                      className="fa-key-item fa-key-toggle"
                      data-map-layer={toggle.key}
                      aria-pressed="true"
                      title={`Hide ${toggle.label.toLowerCase()}`}
                      onClick={() => toggleFilter(toggle.key)}
                    >
                      <span className="fa-key-swatch" style={{ background: toggle.color }} aria-hidden="true" />
                      {toggle.label}
                      <span aria-hidden="true" className="fa-key-close">×</span>
                    </button>
                  ))}
                  {GENERIC_LAYERS.filter((layer) => genericEnabled[layer.id]).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      className="fa-key-item fa-key-toggle"
                      data-map-layer={layer.id}
                      aria-pressed="true"
                      title={`Hide ${layer.label.toLowerCase()}`}
                      onClick={() =>
                        setGenericEnabled((previous) => ({ ...previous, [layer.id]: false }))
                      }
                    >
                      <span className="fa-key-swatch" style={{ background: layer.mapColor ?? "#8B5CF6" }} aria-hidden="true" />
                      {layer.label}
                      <span aria-hidden="true" className="fa-key-close">×</span>
                    </button>
                  ))}
                </div>

                <p className="fa-map-note">
                  Park pins are polygon centres, not gates. Basemap © OpenStreetMap contributors.
                </p>
              </section>
            </div>
          </div>
        </div>

      </main>

      {/* Modal */}
      {selectedPark && (() => {
        const modalParks = geocodeNearby ?? displayParks;
        const modalIdx = modalParks.findIndex((p) => p.id === selectedPark.id);
        return (
          <ParkModal
            park={selectedPark}
            onClose={closeParkModal}
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
                Playground: "playground",
                Iconic: "iconic",
                Sportsfield: "sportsfield",
                Sports: "sports",
                Neighbourhood: "neighbourhood",
                Pocket: "pocket",
                "Off-leash": "dogs",
              };
              const key = typeMap[type];
              if (key) {
                setFilters((prev) => ({ ...prev, [key]: true }));
                toast(`Filtered to ${type} parks`, "info");
              }
              setSelectedPark(null);
            }}
            onFindNearby={(lat, lng, name) => {
              const nearby = [...scopedParks]
                .map((p) => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
                .filter((x) => x.d <= 1)
                .sort((a, b) => a.d - b.d)
                .map((x) => x.p);
              setGeocodeNearby(nearby);
              setGeocodePlace(`Near ${name}`);
              setSearchInput("");
              setSearch("");
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
          <div className="pp-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="fa-shortcuts-title" onClick={(e) => e.stopPropagation()}>
            <div className="pp-shortcuts-header">
              <h2 id="fa-shortcuts-title">Keyboard shortcuts</h2>
              <button className="pp-modal-close-btn" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="fa-shortcut-grid">
              {[
                { keys: ["/"], desc: "Focus search" },
                { keys: ["?"], desc: "Show or hide shortcuts" },
                { keys: ["↑", "↓"], desc: "Move between results" },
                { keys: ["Enter"], desc: "Open the focused park" },
                { keys: ["Esc"], desc: "Close the dialog" },
                { keys: ["S"], desc: "Open a random park" },
                { keys: ["F"], desc: "Fit the map to the results" },
                { keys: ["T"], desc: "Switch theme" },
                { keys: ["L"], desc: "Find my location" },
                { keys: ["D"], desc: "Show saved parks" },
                { keys: ["1", "2", "3", "4"], desc: "Sort the results" },
                { keys: ["M"], desc: "Recentre on Sydney" },
              ].map(({ keys, desc }) => (
                <div key={desc} className="fa-shortcut">
                  <span>
                    {keys.map((k) => (
                      <kbd key={k} className="fa-kbd">{k}</kbd>
                    ))}
                  </span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
            <p className="fa-panel-meta">
              Shortcuts are ignored while you are typing in a field.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
