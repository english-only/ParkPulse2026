/**
 * PRD Phase 6 — `JobIndex`: the contract between job-data ingestion and the UI
 * (`contract-first` skill). Nothing in product code may invent a listing:
 * while TBD-7 (the job-listing dataset) is open, production runs against
 * `EMPTY_JOB_INDEX`, every dashboard field renders `{ value: null }` and the
 * UI shows "—" + "pending data" (FR6.4, §3.7-1).
 *
 * The five formulas are implemented exactly as locked in FR6.4 and asserted
 * with hand-computed expectations in `jobIndex.test.ts` against the test-only
 * fixture in `src/test/fixtures/job-index.fixture.json`.
 */

/** The six FR6.5 chart categories, in chart order. */
export const SECTORS = [
  "government",
  "technology",
  "finance",
  "health",
  "education",
  "others",
] as const;
export type JobSector = (typeof SECTORS)[number];

export interface JobListing {
  id: string;
  company: string;
  title: string;
  suburb: string;
  /** Council display name (FR6.7 results column). */
  council: string;
  /** Centroid used by FR6.4's "inside the council" test. */
  lng: number;
  lat: number;
  sector: JobSector;
  industry: string;
  government: boolean;
  cat_level: number;
  level: number;
  degree_level: number;
  disability_access: boolean;
  salary_band: string;
  /** Whole months since posting; 0 = current month, 12 = same month last year. */
  posted_month_offset: number;
  /** Distance to the nearest university campus in km; null until TBD-8 resolves. */
  campus_km: number | null;
}

export interface JobIndex {
  version: 1;
  /** null until a real ingestion run exists (TBD-7). */
  generated_at: string | null;
  listings: JobListing[];
}

/**
 * What production ships while TBD-7 is open. Importing this — never the test
 * fixture — is how "no mock data may leak into production builds" (FR6.7) is
 * enforced mechanically: the fixture is only reachable from `.test.ts` files.
 */
export const EMPTY_JOB_INDEX: JobIndex = {
  version: 1,
  generated_at: null,
  listings: [],
};

export interface Campus {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

/** Every FR6.4 field is `{ value: number | null }`; null renders "—". */
export interface DashboardField {
  value: number | null;
}

export interface CouncilDashboard {
  job_openings: DashboardField;
  government_pct: DashboardField;
  vacancy_growth_12mo: DashboardField;
  industry_diversity_score: DashboardField;
  university_overlap_pct: DashboardField;
}

/** Field keys in FR6.4 table order (drives the dashboard columns). */
export const DASHBOARD_FIELDS = [
  "job_openings",
  "government_pct",
  "vacancy_growth_12mo",
  "industry_diversity_score",
  "university_overlap_pct",
] as const;

/** FR6.4: "within 5 km of UTS/SYD/UNSW/WSU campuses". */
export const UNIVERSITY_RADIUS_KM = 5;

/** Campus names are stated in the PRD itself; only coordinates are TBD-8. */
export const CAMPUS_NAMES = ["UTS", "University of Sydney", "UNSW", "Western Sydney University"] as const;

const none = (): DashboardField => ({ value: null });

/** Great-circle distance in km. */
export function haversineKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance to the nearest known campus; null when no campuses exist (TBD-8). */
export function nearestCampusKm(listing: JobListing, campuses: readonly Campus[]): number | null {
  if (campuses.length === 0) return null;
  let best = Number.POSITIVE_INFINITY;
  for (const campus of campuses) {
    best = Math.min(best, haversineKm(listing.lng, listing.lat, campus.lng, campus.lat));
  }
  return Math.round(best * 100) / 100;
}

/**
 * Shannon entropy of the industry distribution, normalised by ln(k) and
 * scaled to an integer 0–100 (FR6.4). A single industry means zero diversity;
 * no listings means null — never a fabricated 0.
 */
export function industryDiversityScore(listings: readonly JobListing[]): number | null {
  if (listings.length === 0) return null;
  const counts = new Map<string, number>();
  for (const listing of listings) counts.set(listing.industry, (counts.get(listing.industry) ?? 0) + 1);
  const k = counts.size;
  if (k <= 1) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / listings.length;
    entropy -= p * Math.log(p);
  }
  return Math.round((entropy / Math.log(k)) * 100);
}

/**
 * FR6.4 — the five locked formulas for one council.
 *
 * `inCouncil` is the caller's point-in-polygon predicate over each listing's
 * centroid (FR1.6 geometry in production, a stub in unit tests).
 * `campuses` is empty in production because coordinates are gated on TBD-8,
 * which makes `university_overlap_pct` null even when listings exist.
 */
export function computeCouncilDashboard(options: {
  index: JobIndex;
  inCouncil: (listing: JobListing) => boolean;
  campuses?: readonly Campus[];
  radiusKm?: number;
}): CouncilDashboard {
  const { index, inCouncil, campuses = [], radiusKm = UNIVERSITY_RADIUS_KM } = options;
  const inside = index.listings.filter(inCouncil);
  const n = inside.length;
  if (n === 0) {
    return {
      job_openings: none(),
      government_pct: none(),
      vacancy_growth_12mo: none(),
      industry_diversity_score: none(),
      university_overlap_pct: none(),
    };
  }

  const governmentCount = inside.filter(l => l.government).length;
  const n0 = inside.filter(l => l.posted_month_offset === 0).length;
  const n12 = inside.filter(l => l.posted_month_offset === 12).length;
  const withinRadius =
    campuses.length > 0
      ? inside.filter(l => nearestCampusKm(l, campuses)! <= radiusKm).length
      : null;

  return {
    job_openings: { value: n },
    government_pct: { value: Math.round((governmentCount / n) * 100) },
    // FR6.4: null when n_m12 = 0 — a growth rate from a zero base is undefined.
    vacancy_growth_12mo: n12 > 0 ? { value: Math.round(((n0 - n12) / n12) * 100) } : none(),
    industry_diversity_score: { value: industryDiversityScore(inside) },
    university_overlap_pct:
      withinRadius === null ? none() : { value: Math.round((withinRadius / n) * 100) },
  };
}

export interface SectorShare {
  sector: JobSector;
  percent: number;
}

/**
 * FR6.5 — percentages of `job_openings` for the six chart categories.
 * Returns [] for no openings, which is what keeps the chart hidden while
 * `job_openings` is null. Rounding is per category, so the row can miss 100
 * by a point or two; that is disclosed rather than corrected with fudging.
 */
export function computeSectorShares(listings: readonly JobListing[]): SectorShare[] {
  if (listings.length === 0) return [];
  return SECTORS.map(sector => ({
    sector,
    percent: Math.round((listings.filter(l => l.sector === sector).length / listings.length) * 100),
  }));
}

/** Every FR6.7 filter dimension; `null`/empty means "no constraint". */
export interface ListingFilterState {
  governmentOnly: boolean;
  industry: string | null;
  sector: string | null;
  degreeLevel: number | null;
  salaryBand: string | null;
  maxCampusKm: number | null;
  suburbs: string[];
  /** FR6.1 "Cat level equal to one" — exact match on `cat_level`. */
  catLevel: number | null;
  /** FR6.1 "Level equal to one" — exact match on `level`. */
  level: number | null;
  /** FR6.1 "Disabled access eligible". */
  disabilityOnly: boolean;
}

export const EMPTY_FILTER_STATE: ListingFilterState = {
  governmentOnly: false,
  industry: null,
  sector: null,
  degreeLevel: null,
  salaryBand: null,
  maxCampusKm: null,
  suburbs: [],
  catLevel: null,
  level: null,
  disabilityOnly: false,
};

/** A listing with an unknown campus distance cannot satisfy a distance filter. */
export function filterListings(
  index: JobIndex,
  filters: ListingFilterState,
): JobListing[] {
  const suburbs = filters.suburbs.map(s => s.toLowerCase());
  return index.listings.filter(listing => {
    if (filters.governmentOnly && !listing.government) return false;
    if (filters.industry && listing.industry.toLowerCase() !== filters.industry.toLowerCase()) {
      return false;
    }
    if (filters.sector && listing.sector !== filters.sector) return false;
    if (filters.degreeLevel !== null && listing.degree_level !== filters.degreeLevel) return false;
    if (filters.salaryBand && listing.salary_band !== filters.salaryBand) return false;
    if (filters.catLevel !== null && listing.cat_level !== filters.catLevel) return false;
    if (filters.level !== null && listing.level !== filters.level) return false;
    if (filters.disabilityOnly && !listing.disability_access) return false;
    if (filters.maxCampusKm !== null) {
      if (listing.campus_km === null || listing.campus_km > filters.maxCampusKm) return false;
    }
    if (suburbs.length > 0 && !suburbs.includes(listing.suburb.toLowerCase())) return false;
    return true;
  });
}
