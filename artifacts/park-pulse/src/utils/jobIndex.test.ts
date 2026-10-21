import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/job-index.fixture.json";
import {
  EMPTY_JOB_INDEX,
  computeCouncilDashboard,
  computeSectorShares,
  haversineKm,
  filterListings,
  type Campus,
  type JobIndex,
  type JobListing,
} from "./jobIndex";

/**
 * PRD Phase 6 acceptance #3 — table-driven tests for the five FR6.4 formulas.
 * Every expectation below is hand-computed from the fixture (documented in the
 * comments), so a regression in the maths fails loudly instead of drifting.
 */

const index = fixture as unknown as JobIndex;
const listings = index.listings;

/**
 * Stand-in for FR1.6's point-in-polygon: the fixture marks membership by id,
 * so the maths under test is the dashboard formulas, not the pip routine
 * (which `councils.test.ts` already covers). The page wires the real pip.
 */
const INSIDE = new Set(["j1", "j2", "j3", "j4", "j5", "j6", "j7", "j9", "j10"]);
const inCouncil = (l: JobListing) => INSIDE.has(l.id);

/** TBD-8 open in production → no campuses → overlap must be null. */
const NO_CAMPUSES: Campus[] = [];

/** Test-only campus (coordinates are exactly a cluster of fixture jobs). */
const FIXTURE_CAMPUSES: Campus[] = [{ id: "test-uni", name: "Test University", lng: 151.0, lat: -33.0 }];

function dashboard(campuses: Campus[] = NO_CAMPUSES, pool: JobIndex = index) {
  return computeCouncilDashboard({ index: pool, inCouncil, campuses });
}

describe("fixture sanity", () => {
  it("is a non-empty index for tests and an empty one for production", () => {
    expect(listings.length).toBe(10);
    expect(EMPTY_JOB_INDEX.listings).toEqual([]);
    expect(EMPTY_JOB_INDEX.version).toBe(1);
  });
});

describe("FR6.4 — the five dashboard fields", () => {
  it("job_openings counts only listings whose centroid is inside the council", () => {
    // 10 fixture rows, one flagged outside → 9.
    expect(dashboard().job_openings).toEqual({ value: 9 });
  });

  it("government_pct = round(government / openings × 100)", () => {
    // 2 of 9 government → 22.22 → 22
    expect(dashboard().government_pct).toEqual({ value: 22 });
  });

  it("vacancy_growth_12mo = round((n_m0 − n_m12) / n_m12 × 100)", () => {
    // month 0: 5 listings; month 12: 2 listings → (5−2)/2 = 150 %
    expect(dashboard().vacancy_growth_12mo).toEqual({ value: 150 });
  });

  it("vacancy_growth_12mo is null when n_m12 is 0 (never a fabricated rate)", () => {
    const noHistory: JobIndex = {
      version: 1,
      generated_at: null,
      // Same 10 listings, but nothing posted exactly 12 months ago.
      listings: listings.map(l => ({
        ...l,
        posted_month_offset: l.posted_month_offset === 12 ? 6 : l.posted_month_offset,
      })),
    };
    const result = dashboard(NO_CAMPUSES, noHistory);
    expect(result.vacancy_growth_12mo).toEqual({ value: null });
    // …while openings still report a real number in the same row.
    expect(result.job_openings).toEqual({ value: 9 });
  });

  it("industry_diversity_score = normalised Shannon entropy × 100 (integer)", () => {
    // Inside-council industries: health×3, technology×2, finance×1,
    // education×2, others×1 (k = 5).
    // H = 1.5229551, Hmax = ln 5 = 1.6094379 → 94.6267 → 95
    expect(dashboard().industry_diversity_score).toEqual({ value: 95 });
  });

  it("industry_diversity_score is 0 for a single industry and null for no data", () => {
    const mono: JobIndex = {
      version: 1,
      generated_at: null,
      listings: listings.filter(inCouncil).map(l => ({ ...l, industry: "health" })),
    };
    expect(dashboard(NO_CAMPUSES, mono).industry_diversity_score).toEqual({ value: 0 });
    expect(dashboard(NO_CAMPUSES, EMPTY_JOB_INDEX).industry_diversity_score).toEqual({ value: null });
  });

  it("university_overlap_pct = round(listings within 5 km of a campus / openings × 100)", () => {
    // Campuses missing (TBD-8 in production) → null even though openings exist.
    expect(dashboard().university_overlap_pct).toEqual({ value: null });
    // With the test campus at (151.0, −33.0): 7 of the 9 in-council jobs sit
    // ≤ 5 km away (0 km cluster, one 2.2 km south) → 77.78 → 78.
    expect(dashboard(FIXTURE_CAMPUSES).university_overlap_pct).toEqual({ value: 78 });
  });

  it("every field is { value: number | null } and null — not 0 — without data", () => {
    const empty = dashboard(NO_CAMPUSES, EMPTY_JOB_INDEX);
    expect(Object.values(empty)).toEqual([
      { value: null },
      { value: null },
      { value: null },
      { value: null },
      { value: null },
    ]);
  });

  it("returns all-null when no listing passes the council test", () => {
    const none = computeCouncilDashboard({ index, inCouncil: () => false, campuses: FIXTURE_CAMPUSES });
    for (const field of Object.values(none)) expect(field).toEqual({ value: null });
  });
});

describe("FR6.5 — sector shares", () => {
  it("returns percentages of job_openings for the six chart categories", () => {
    const shares = computeSectorShares(listings.filter(inCouncil));
    // 9 openings: government 2, technology 2, finance 1, health 1,
    // education 2, others 1 → 22/22/11/11/22/11 (rounding may miss 100 by 1–2).
    expect(shares).toEqual([
      { sector: "government", percent: 22 },
      { sector: "technology", percent: 22 },
      { sector: "finance", percent: 11 },
      { sector: "health", percent: 11 },
      { sector: "education", percent: 22 },
      { sector: "others", percent: 11 },
    ]);
  });

  it("returns an empty list for no openings so the chart stays hidden", () => {
    expect(computeSectorShares([])).toEqual([]);
  });
});

describe("FR6.7 — filter composition (also FR6.3 chips)", () => {
  it("applies every filter dimension against the index", () => {
    const all = {
      governmentOnly: false,
      industry: null,
      sector: null,
      degreeLevel: null,
      salaryBand: null,
      maxCampusKm: null,
      suburbs: [] as string[],
      catLevel: null,
      level: null,
      disabilityOnly: false,
    };
    expect(filterListings(index, all)).toHaveLength(10);
    expect(filterListings(index, { ...all, governmentOnly: true })).toHaveLength(3); // incl. the outside-council row
    expect(filterListings(index, { ...all, industry: "technology" })).toHaveLength(3);
    expect(filterListings(index, { ...all, sector: "education" })).toHaveLength(2);
    expect(filterListings(index, { ...all, suburbs: ["glebe"] })).toHaveLength(3);
    expect(filterListings(index, { ...all, degreeLevel: 1 })).toHaveLength(4);
    expect(filterListings(index, { ...all, salaryBand: "100k-150k" })).toHaveLength(4);
    expect(filterListings(index, { ...all, maxCampusKm: 5 })).toHaveLength(8);
    // FR6.1 grid controls: cat level, level and disabled-access eligibility.
    expect(filterListings(index, { ...all, catLevel: 1 })).toHaveLength(3); // j2, j4, j8
    expect(filterListings(index, { ...all, level: 1 })).toHaveLength(3); // j2, j5, j8
    expect(filterListings(index, { ...all, disabilityOnly: true })).toHaveLength(5);
    // filters compose (AND across dimensions)
    expect(filterListings(index, { ...all, governmentOnly: true, suburbs: ["glebe"] })).toHaveLength(2);
  });

  it("is regression-safe against the empty production index", () => {
    expect(
      filterListings(EMPTY_JOB_INDEX, {
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
      }),
    ).toEqual([]);
  });
});

describe("haversineKm (used for campus_km and the 5 km rule)", () => {
  it("measures zero at the same point and ~111.2 km per degree of latitude", () => {
    expect(haversineKm(151, -33, 151, -33)).toBe(0);
    expect(haversineKm(151, -33, 151, -32)).toBeCloseTo(111.19, 1);
  });
});
