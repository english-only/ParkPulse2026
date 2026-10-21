/**
 * Explore's category vocabulary.
 *
 * The explorer used to describe its layers in three places (icon list, chip
 * list, legend) with slightly different labels, which is how "Dog Parks",
 * "Off-leash dogs" and "Off-leash areas" ended up on the same screen. This
 * module is the single description; the rail, the map key and the result chips
 * all read it.
 *
 * Colours are the marker colours the map actually renders, so a swatch in the
 * rail and a dot on the map mean the same thing. They are never used as UI
 * accents.
 */

export type LayerKey =
  | "dogs"
  | "fountains"
  | "toilets"
  | "npws"
  | "trees"
  | "transport"
  | "iwParks"
  | "iwTrees";

export type TypeKey =
  | "playground"
  | "sports"
  | "iconic"
  | "neighbourhood"
  | "pocket"
  | "sportsfield";

export type Filters = Record<LayerKey | TypeKey, boolean>;

/**
 * Defaults follow the redesign contract (EXP-005): the readable primary park
 * layer and core off-leash areas are on; trees, toilets, fountains, NPWS and
 * transport are opt-in so the first map is not a field of thousands of pins.
 * Park-type chips stay off because they *restrict* the park list when active —
 * off = "all types visible".
 */
export const defaultFilters: Filters = {
  playground: false,
  sports: false,
  iconic: false,
  neighbourhood: false,
  pocket: false,
  sportsfield: false,
  fountains: false,
  toilets: false,
  transport: false,
  trees: false,
  dogs: true,
  npws: false,
  // Inner West datasets were never shipped (public/data/inner-west/ is absent)
  // — honest default off rather than a guaranteed 404 + toast.
  iwParks: false,
  iwTrees: false,
};

export interface LayerToggle {
  key: LayerKey;
  label: string;
  /** Marker colour, also the rail swatch. */
  color: string;
  /** `layerCounts` key once the layer has reported its record count. */
  countKey?: string;
  hint?: string;
}

/** Every map layer a visitor can switch on, in the order the map reveals it. */
export const LAYER_TOGGLES: readonly LayerToggle[] = [
  { key: "dogs", label: "Off-leash areas", color: "#AACC00", countKey: "dogs" },
  { key: "fountains", label: "Drinking fountains", color: "#0077B6", countKey: "fountains" },
  { key: "toilets", label: "Public toilets", color: "#6D597A", countKey: "toilets" },
  { key: "npws", label: "NPWS facilities", color: "#FF6B35", countKey: "npws" },
  { key: "transport", label: "Transport stops", color: "#9B2335", countKey: "transport" },
  { key: "trees", label: "Street trees", color: "#2D6A4F", countKey: "trees", hint: "from zoom 16" },
] as const;

export interface TypeFilter {
  key: TypeKey;
  label: string;
  color: string;
  countKey: string;
}

/** Park-type refinements. These narrow the result list; they add no markers. */
export const TYPE_FILTERS: readonly TypeFilter[] = [
  { key: "playground", label: "Playground", color: "#E76F51", countKey: "playground" },
  { key: "sports", label: "Sports", color: "#F4A261", countKey: "sports" },
  { key: "iconic", label: "Iconic", color: "#FFD166", countKey: "iconic" },
  { key: "neighbourhood", label: "Neighbourhood", color: "#83C5BE", countKey: "neighbourhood_stat" },
  { key: "pocket", label: "Pocket", color: "#9B59B6", countKey: "pocket_stat" },
] as const;

/** Park-type keys — the filters that NARROW the result list when active. */
export const PARK_TYPE_KEYS: readonly TypeKey[] = TYPE_FILTERS.map((item) => item.key);

/**
 * Registered layers this build does not ship. They are named, with the reason,
 * instead of being offered as a toggle that can only fail.
 */
export const UNSHIPPED_LAYERS = [
  { label: "Inner West parks", reason: "No dataset in this build" },
  { label: "Inner West trees", reason: "No dataset in this build" },
] as const;

const LABELS: Record<keyof Filters, string> = {
  playground: "Playground",
  sports: "Sports",
  iconic: "Iconic",
  neighbourhood: "Neighbourhood",
  pocket: "Pocket",
  sportsfield: "Sportsfield",
  dogs: "Off-leash areas",
  fountains: "Drinking fountains",
  toilets: "Public toilets",
  npws: "NPWS facilities",
  transport: "Transport stops",
  trees: "Street trees",
  iwParks: "Inner West parks",
  iwTrees: "Inner West trees",
};

export function filterLabel(key: keyof Filters): string {
  return LABELS[key];
}
