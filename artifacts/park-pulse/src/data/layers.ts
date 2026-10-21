/**
 * Layer registry — the single source of truth for what Park Pulse publishes.
 *
 * Every surface that names a dataset (Home snapshot, About coverage table,
 * Explore category controls, Insights) reads from here. A layer is only
 * described as `published` when this build actually serves its artifact;
 * otherwise it carries the reason it is unavailable instead of a zero.
 *
 * Counts are not stored here. They are generated into `public/data/stats.json`
 * and looked up by `countKey`, so a number cannot drift from the file it
 * describes (PRD §18.2, F-03, F-08, F-10).
 */

export type LicenceStatus = "attribution" | "review-required" | "not-confirmed";

/** Whether the artifact is served by this build. */
export type LayerStatus = "published" | "gated" | "unavailable";

export interface LayerSource {
  publisher: string;
  /** Publisher or catalogue URL. Rendered with rel="noopener noreferrer". */
  url: string;
  /** Attribution text required by the source, when known. */
  attribution?: string;
}

export interface DataLayer {
  id: string;
  label: string;
  /** What one row is: a park polygon, a facility, a tree. Never "a park". */
  recordNoun: string;
  description: string;
  source: LayerSource;
  /** Geographic and thematic extent of the served extract. */
  coverage: string;
  licence: { status: LicenceStatus; label: string; note?: string };
  limitations: string[];
  status: LayerStatus;
  /** Why a gated/unavailable layer is not on the map. */
  statusNote?: string;
  /** Whether Explore shows it before the visitor asks for it. */
  defaultVisible: boolean;
  /** Served artifact path, relative to the app base. */
  artifact?: string;
  /** Dot path into the generated stats snapshot, e.g. "parks.total". */
  countKey?: string;
  /** Shape of the served records, for the atlas and the generic map loader. */
  geometry?: "point" | "polygon" | "tiles" | "dataset";
  /**
   * How Explore renders the layer. `bespoke` layers have a loader with their
   * own popup and fields; `generic` layers are drawn from the registry with no
   * page change; `none` layers are never put on the map.
   */
  explore?: "bespoke" | "generic" | "none";
  /** Marker colour for a generic map layer. */
  mapColor?: string;
}

/**
 * Ordered for the coverage table: the layers most people meet first, then the
 * opt-in amenity layers, then anything not published in this build.
 */
export const LAYERS: readonly DataLayer[] = [
  {
    id: "parks",
    label: "City of Sydney parks",
    recordNoun: "park area",
    description:
      "Park and green-space polygons with park type, area and playground flag.",
    source: {
      publisher: "City of Sydney Open Data",
      url: "https://data.cityofsydney.nsw.gov.au/",
      attribution: "City of Sydney",
    },
    coverage: "City of Sydney local government area only.",
    licence: {
      status: "review-required",
      label: "Attribution shown; exact licence record not confirmed",
      note: "Confirm the licence for this specific dataset before redistribution.",
    },
    limitations: [
      "Park areas are polygons; a map pin is their representative centre, not a gate or entrance.",
      "A record here does not prove a facility exists on site today.",
    ],
    status: "published",
    defaultVisible: true,
    artifact: "data/Parks.geojson",
    countKey: "parks.total",
    geometry: "polygon",
    explore: "bespoke",
  },
  {
    id: "dogs",
    label: "Off-leash dog areas",
    recordNoun: "off-leash area",
    description:
      "Designated off-leash areas with hours, prohibited areas and a short description.",
    source: {
      publisher: "City of Sydney Open Data",
      url: "https://data.cityofsydney.nsw.gov.au/",
      attribution: "City of Sydney",
    },
    coverage: "City of Sydney local government area only.",
    licence: {
      status: "review-required",
      label: "Attribution shown; exact licence record not confirmed",
    },
    limitations: [
      "Hours are the source's published hours, not live opening status.",
      "Areas outside the City of Sydney are not covered by this layer.",
    ],
    status: "published",
    defaultVisible: true,
    artifact: "data/Dog_off-leash_parks.geojson",
    countKey: "dogs.total",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "fountains",
    label: "Drinking fountains",
    recordNoun: "drinking fountain",
    description: "Public drinking fountains and water refill points.",
    source: {
      publisher: "City of Sydney Open Data",
      url: "https://data.cityofsydney.nsw.gov.au/",
      attribution: "City of Sydney",
    },
    coverage: "City of Sydney local government area only.",
    licence: {
      status: "review-required",
      label: "Attribution shown; exact licence record not confirmed",
    },
    limitations: [
      "The accessibility flag is recorded by the publisher; it is not verified on site.",
      "Working order is not reported, so a mapped fountain may be out of service.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/drinking-fountains.geojson",
    countKey: "fountains.total",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "npws",
    label: "NPWS facilities",
    recordNoun: "facility",
    description:
      "National Parks and Wildlife Service facilities such as picnic tables, seats and barbecues.",
    source: {
      publisher: "NSW National Parks & Wildlife Service (SEED)",
      url: "https://datasets.seed.nsw.gov.au/",
      attribution: "NSW National Parks & Wildlife Service",
    },
    coverage: "Greater Sydney park estates managed by NPWS.",
    licence: {
      status: "review-required",
      label: "Attribution shown; exact licence record not confirmed",
    },
    limitations: [
      "Facilities are points inside park estates; they are not parks themselves.",
      "The source's modification dates have not been reconciled with the served extract.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/npws-facilities-greater-sydney.geojson",
    countKey: "npws.total",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "toilets",
    label: "Public toilets",
    recordNoun: "toilet",
    description:
      "Public toilet locations with suburb, opening hours and accessible / baby-change flags where published.",
    source: {
      publisher: "National Public Toilet Map",
      url: "https://toiletmap.gov.au/",
      attribution: "National Public Toilet Map",
    },
    coverage: "Greater Sydney extract of a national directory.",
    licence: {
      status: "review-required",
      label: "Reuse rights not confirmed for this extract",
      note: "Public availability of the directory is not by itself an open reuse licence.",
    },
    limitations: [
      "The app keeps a subset of the publisher's fields, so a missing flag is not proof a facility lacks it.",
      "Hours come from the publisher and may not reflect temporary closures.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/toilets-sydney.json",
    countKey: "toilets.total",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "trees",
    label: "Street and park trees",
    recordNoun: "tree",
    description:
      "Individual tree records with species, trunk diameter and canopy measurements.",
    source: {
      publisher: "City of Sydney Open Data",
      url: "https://data.cityofsydney.nsw.gov.au/",
      attribution: "City of Sydney",
    },
    coverage: "City of Sydney local government area extract.",
    licence: {
      status: "review-required",
      label: "Attribution shown; exact licence record not confirmed",
    },
    limitations: [
      "Shown only from zoom 16, as sharded tiles rather than one dataset.",
      "An extract of a live asset register: recently planted or removed trees may be missing.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/trees.geojson",
    countKey: "trees.total",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "community",
    label: "Community contributions",
    recordNoun: "contribution",
    description:
      "Places added by the public, checked against a source and accepted by a reviewer before publication.",
    source: {
      publisher: "Park Pulse contributors",
      url: "/contribute",
      attribution: "Individual contributors, credited in each record",
    },
    coverage:
      "Individual records across Greater Sydney. Not a complete inventory of any area, and not evenly distributed.",
    licence: {
      status: "attribution",
      label: "Licence recorded per record by its contributor",
      note: "Each feature carries its own licence and provenance properties.",
    },
    limitations: [
      "A contribution is one person's report, reviewed against its stated source — not a council inventory.",
      "If no batch has been accepted and published in this build, the dataset is legitimately empty.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/contributions.geojson",
    countKey: "contributions.total",
    geometry: "point",
    explore: "generic",
    mapColor: "#8B5CF6",
  },
  {
    id: "osm",
    label: "OpenStreetMap mapped places",
    recordNoun: "mapped place",
    description:
      "Community-mapped park and playground features from OpenStreetMap, including tags for access, hours and dog rules.",
    source: {
      publisher: "OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      attribution: "© OpenStreetMap contributors (ODbL)",
    },
    coverage:
      "A partly overlapping region spanning Blacktown, Cumberland and Parramatta; not an inventory of any one council.",
    licence: {
      status: "attribution",
      label: "ODbL — attribution required",
      note: "Database combination and redistribution still need a licensing review.",
    },
    limitations: [
      "Not council data, and not evidence that a council area is fully mapped.",
      "Most records in this extract carry no suburb field.",
      "Coverage is uneven: community mapping is denser where contributors have worked.",
    ],
    status: "gated",
    statusNote:
      "Available as a separate opt-in layer while its provenance and ODbL obligations are reviewed.",
    defaultVisible: false,
    artifact: "data/blacktown.geojson",
    countKey: "blacktown.total",
    geometry: "point",
    explore: "none",
  },
  {
    id: "transport",
    label: "Public transport stops",
    recordNoun: "stop",
    description: "Bus, train, ferry, metro and light rail stop locations.",
    source: {
      publisher: "Transport for NSW",
      url: "https://opendata.transport.nsw.gov.au/",
      attribution: "Transport for NSW",
    },
    coverage: "Greater Sydney, from a GTFS extract.",
    licence: {
      status: "review-required",
      label: "Feed version and licence record not confirmed",
    },
    limitations: [
      "Arrival times and frequencies are out of scope; this is stop location only.",
      "A stop is not a service guarantee at the time you visit.",
    ],
    status: "published",
    defaultVisible: false,
    artifact: "data/transport/stops.geojson",
    countKey: "transport.stops",
    geometry: "point",
    explore: "bespoke",
  },
  {
    id: "councils",
    label: "Council boundaries",
    recordNoun: "boundary",
    description:
      "Council boundary geometry used to scope the map to one or more local government areas.",
    source: {
      publisher: "NSW Spatial Services / ABS boundary sources",
      url: "https://data.nsw.gov.au/",
      attribution: "Boundary data as published by the source agency",
    },
    coverage:
      "Boundary index entries for the Greater Sydney area; the official planning-region definition is still being confirmed.",
    licence: {
      status: "not-confirmed",
      label: "Licence and boundary definition not confirmed",
    },
    limitations: [
      "Boundary definitions differ between agencies; “Greater Sydney” is not one fixed extent.",
      "The index carries 35 boundary entries from the NSW LGA extract; it is not an official 38-council planning-region list.",
    ],
    status: "published",
    artifact: "data/boundaries/councils-index.json",
    countKey: "councils.total",
    defaultVisible: false,
    geometry: "dataset",
    explore: "none",
  },
  {
    id: "canopy",
    label: "Tree canopy",
    recordNoun: "canopy measurement",
    description:
      "Council-level canopy percentage derived from NSW urban tree canopy data.",
    source: {
      publisher: "NSW Department of Planning, Housing and Infrastructure",
      url: "https://www.planning.nsw.gov.au/the-planning-system/urban-greening/urban-heat-and-canopy-data",
      attribution: "NSW urban heat and canopy data",
    },
    coverage: "Council-level summaries; derivations differ between sources.",
    licence: {
      status: "not-confirmed",
      label: "No-derivatives terms — publication not cleared",
      note: "Derived figures may not be published without the data owner's clearance.",
    },
    limitations: [
      "Two project documents report different averages (16% and 22.2%) for different universes.",
      "The formula, denominator and council set must be reconciled before any figure is shown.",
    ],
    status: "unavailable",
    statusNote:
      "No canopy figure or geometry is shown while the licence and the 16% / 22.2% discrepancy are unresolved.",
    defaultVisible: false,
  },
  {
    id: "jobs",
    label: "Jobs and employment listings",
    recordNoun: "listing",
    description:
      "Council job listings and employment statistics that an earlier Insights page assumed.",
    source: {
      publisher: "Not established",
      url: "https://data.nsw.gov.au/",
    },
    coverage: "None. The served job index is empty.",
    licence: {
      status: "not-confirmed",
      label: "No licensed dataset",
    },
    limitations: [
      "No schema, rights, coverage or refresh cadence has been agreed for this data.",
      "An empty index is not a measurement of zero jobs.",
    ],
    status: "unavailable",
    statusNote:
      "No job content is shown anywhere in the product until a licensed, current dataset exists.",
    defaultVisible: false,
  },
] as const;

export function getLayer(id: string): DataLayer | undefined {
  return LAYERS.find((layer) => layer.id === id);
}

export function layersByStatus(status: LayerStatus): DataLayer[] {
  return LAYERS.filter((layer) => layer.status === status);
}

/**
 * Splits "parks.total" into a lookup against the flattened snapshot map.
 * Returns null rather than 0 when the count is absent, so an ungenerated
 * layer can never render as "0 records" (PRD §7.1).
 */
export function countFor(
  layer: DataLayer,
  counts: Readonly<Record<string, number>>,
): number | null {
  if (!layer.countKey) return null;
  const value = counts[layer.countKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolves a layer's declared status against the generated snapshot.
 *
 * A layer is only "published" in a given build if its count actually came out
 * of that build's stats file. This keeps a fresh checkout that lacks ignored
 * generated artifacts (boundaries, GTFS stops) from advertising a layer it
 * cannot serve, while a loading snapshot keeps the declared status so the page
 * does not flash "unavailable" before the data arrives.
 */
export function resolveLayerStatus(
  layer: DataLayer,
  counts: Readonly<Record<string, number>> | null,
): LayerStatus {
  if (!counts) return layer.status;
  if (layer.status === "published" && layer.countKey && countFor(layer, counts) === null) {
    return "unavailable";
  }
  return layer.status;
}

const numberFormat = new Intl.NumberFormat("en-AU");

export function formatCount(value: number | null): string {
  return value === null ? "Not provided" : numberFormat.format(value);
}
