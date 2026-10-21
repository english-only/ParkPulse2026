import { describe, expect, it } from "vitest";
import { formatAreaHa, matchParks, toComparePark, toggleSelected } from "./compare";

describe("toComparePark", () => {
  it("derives hectares from the published square-metre field", () => {
    const park = toComparePark(
      { Asset_ID: "PK1", Name: "Test Park", Type: "Pocket", Playgrounds: "No", Shape__Area: 43478 },
      "fallback",
    );
    expect(park.key).toBe("PK1");
    expect(park.areaHa).toBeCloseTo(4.3478, 4);
  });

  it("keeps absent fields null instead of inventing them", () => {
    const park = toComparePark({}, "fallback-7");
    expect(park.key).toBe("fallback-7");
    expect(park.name).toBe("Unnamed park area");
    expect(park.type).toBeNull();
    expect(park.areaHa).toBeNull();
    expect(park.playgrounds).toBeNull();
  });
});

describe("formatAreaHa", () => {
  it("formats small areas with one decimal and large areas whole", () => {
    expect(formatAreaHa(3.94)).toBe("3.9 ha");
    expect(formatAreaHa(39.04)).toBe("39 ha");
  });

  it("returns null for missing or non-positive areas", () => {
    expect(formatAreaHa(null)).toBeNull();
    expect(formatAreaHa(0)).toBeNull();
  });
});

describe("toggleSelected", () => {
  it("adds, removes and caps the selection", () => {
    expect(toggleSelected([], "a")).toEqual(["a"]);
    expect(toggleSelected(["a"], "a")).toEqual([]);
    expect(toggleSelected(["a", "b", "c"], "d")).toEqual(["a", "b", "c"]);
  });
});

describe("matchParks", () => {
  const parks = [
    { key: "1", name: "Fitzroy Gardens", type: null, areaHa: null, playgrounds: null, assetId: null },
    { key: "2", name: "Hyde Park", type: null, areaHa: null, playgrounds: null, assetId: null },
  ];

  it("needs at least two characters and matches case-insensitively", () => {
    expect(matchParks(parks, "f")).toEqual([]);
    expect(matchParks(parks, "FITZ")).toEqual([parks[0]]);
  });
});
