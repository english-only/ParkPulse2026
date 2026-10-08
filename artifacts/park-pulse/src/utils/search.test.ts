import { describe, expect, it } from "vitest";
import { fmtArea, fuzzyScore, isSortKey, searchParks, sizeLabel } from "./search";
import type { Park } from "../types/park";

function park(over: Partial<Park> = {}): Park {
  return {
    id: 1,
    name: "Some Park",
    type: "Neighbourhood",
    suburb: "Newtown",
    hasPlayground: false,
    area: 5000,
    assetId: "A1",
    lat: -33.89,
    lng: 151.2,
    ...over,
  };
}

describe("fuzzyScore", () => {
  it("returns the top score for an empty query", () => {
    expect(fuzzyScore(park(), "")).toBe(100);
  });

  it("ranks an exact name above a prefix", () => {
    const exact = fuzzyScore(park({ name: "Hyde Park" }), "hyde park");
    const prefix = fuzzyScore(park({ name: "Hyde Park North" }), "hyde park");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(0);
  });

  it("ranks a name prefix above a name substring", () => {
    const prefix = fuzzyScore(park({ name: "Hyde Park" }), "hyde");
    const substring = fuzzyScore(park({ name: "The Hyde Gardens" }), "hyde");
    expect(prefix).toBeGreaterThan(substring);
  });

  it("ranks a name match above a suburb match", () => {
    const byName = fuzzyScore(park({ name: "Newtown Park", suburb: "Marrickville" }), "newtown");
    const bySuburb = fuzzyScore(park({ name: "Riverside", suburb: "Newtown" }), "newtown");
    expect(byName).toBeGreaterThan(bySuburb);
  });

  it("ranks a suburb match above a type match", () => {
    const bySuburb = fuzzyScore(park({ name: "Riverside", suburb: "Newtown", type: "Iconic" }), "newtown");
    const byType = fuzzyScore(park({ name: "Riverside", suburb: "Marrickville", type: "Newtown Walk" }), "newtown");
    expect(bySuburb).toBeGreaterThan(byType);
  });

  it("matches non-contiguous characters in order", () => {
    // "h y p" appears as a subsequence of "hyde park".
    const score = fuzzyScore(park({ name: "Hyde Park" }), "hyp");
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0 when no tier matches", () => {
    expect(fuzzyScore(park({ name: "Zebra Park", suburb: "Nowhere", type: "Iconic" }), "qqqq")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore(park({ name: "Hyde Park" }), "HYDE")).toBe(
      fuzzyScore(park({ name: "Hyde Park" }), "hyde"),
    );
  });

  it("tolerates missing suburb and type", () => {
    expect(fuzzyScore(park({ name: "Hyde Park", suburb: "", type: "" }), "hyde")).toBeGreaterThan(0);
  });

  it("tolerates a whitespace-padded query", () => {
    expect(fuzzyScore(park({ name: "Hyde Park" }), "  hyde  ")).toBe(
      fuzzyScore(park({ name: "Hyde Park" }), "hyde"),
    );
  });
});

describe("sizeLabel", () => {
  it("uses the documented boundaries", () => {
    expect(sizeLabel(0).label).toBe("Tiny");
    expect(sizeLabel(999).label).toBe("Tiny");
    expect(sizeLabel(1000).label).toBe("Small");
    expect(sizeLabel(4999).label).toBe("Small");
    expect(sizeLabel(5000).label).toBe("Medium");
    expect(sizeLabel(9999).label).toBe("Medium");
    expect(sizeLabel(10000).label).toBe("Large");
    expect(sizeLabel(49999).label).toBe("Large");
    expect(sizeLabel(50000).label).toBe("Massive");
    expect(sizeLabel(10_000_000).label).toBe("Massive");
  });

  it("returns a distinct css class per bucket", () => {
    const classes = [0, 1000, 5000, 10000, 50000].map((a) => sizeLabel(a).cls);
    expect(new Set(classes).size).toBe(classes.length);
  });
});

describe("fmtArea", () => {
  it("switches to hectares at 10,000 m²", () => {
    expect(fmtArea(9999)).toContain("m²");
    expect(fmtArea(10000)).toBe("1.0 ha");
    expect(fmtArea(25000)).toBe("2.5 ha");
  });

  it("rounds sub-1000 values to whole m²", () => {
    expect(fmtArea(999.4)).toBe("999 m²");
  });

  it("thousands-separates above 1000 m²", () => {
    expect(fmtArea(1500)).toMatch(/1,500 m²/);
  });
});

describe("searchParks", () => {
  const parks = [
    park({ id: 1, name: "Hyde Park", suburb: "Sydney", area: 12_000 }),
    park({ id: 2, name: "Hyde Park North", suburb: "Kirribilli", area: 2_000 }),
    park({ id: 3, name: "Riverside Walk", suburb: "Newtown", area: null }),
  ];
  const always = () => true;

  it("returns everything for an empty query", () => {
    expect(searchParks(parks, "", always, 0)).toHaveLength(3);
  });

  it("orders matches by score", () => {
    const out = searchParks(parks, "hyde", always, 0);
    expect(out.map((p) => p.id)).toEqual([1, 2]);
  });

  it("drops parks below the minimum area", () => {
    const out = searchParks(parks, "", always, 5_000);
    expect(out.map((p) => p.id)).toEqual([1]);
  });

  it("excludes parks with no area when a minimum is set", () => {
    const out = searchParks(parks, "", always, 1);
    expect(out.map((p) => p.id)).not.toContain(3);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchParks(parks, "zzzzz", always, 0)).toEqual([]);
  });

  it("combines the query with the area floor", () => {
    expect(searchParks(parks, "hyde", always, 5_000).map((p) => p.id)).toEqual([1]);
  });
});

describe("isSortKey", () => {
  it("accepts the four known keys", () => {
    for (const k of ["default", "name", "nearest", "size"]) {
      expect(isSortKey(k)).toBe(true);
    }
  });

  it("rejects unknown and empty values", () => {
    expect(isSortKey("bogus")).toBe(false);
    expect(isSortKey(null)).toBe(false);
    expect(isSortKey("")).toBe(false);
  });
});