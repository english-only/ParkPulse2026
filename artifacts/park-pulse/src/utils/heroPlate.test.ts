import { describe, expect, it } from "vitest";
import {
  countPlateTypes,
  describePlate,
  groupPlateParks,
  parseHeroPlate,
  scaleBarMetres,
  scaleBarPercent,
  type HeroPlate,
} from "./heroPlate";

const TYPES = [
  { label: "Pocket", count: 2, color: "#9B59B6" },
  { label: "Civic", count: 0, color: "#2D6A4F" },
];

const SQUARE = "M12.0 12.0L40.0 12.0L40.0 40.0L12.0 40.0Z";

function plate(parks: HeroPlate["parks"]): HeroPlate {
  return {
    generatedAt: "2026-10-21",
    viewBox: [596, 860],
    metresPerUnit: 10,
    types: TYPES,
    parks,
  };
}

describe("parseHeroPlate", () => {
  it("rejects anything that is not a usable drawing", () => {
    expect(parseHeroPlate(null)).toBeNull();
    expect(parseHeroPlate([])).toBeNull();
    expect(parseHeroPlate({})).toBeNull();
    // A viewBox is required: without it the outlines are unitless.
    expect(parseHeroPlate({ types: TYPES, parks: [] })).toBeNull();
    // Types with invalid colours cannot be rendered.
    expect(
      parseHeroPlate({
        viewBox: [100, 100],
        types: [{ label: "Park", color: "green" }],
        parks: [],
      }),
    ).toBeNull();
    expect(parseHeroPlate({ viewBox: [100, 100], types: TYPES, parks: [] })).toBeNull();
  });

  it("reads the real generated shape", () => {
    const parsed = parseHeroPlate({
      generatedAt: "2026-10-21",
      source: "City of Sydney Open Data",
      viewBox: [596, 860],
      metresPerUnit: 10.2,
      types: TYPES,
      parks: [{ name: "The Green", typeIndex: 0, paths: [SQUARE] }],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.generatedAt).toBe("2026-10-21");
    expect(parsed!.viewBox).toEqual([596, 860]);
    expect(parsed!.metresPerUnit).toBe(10.2);
    expect(parsed!.types).toHaveLength(2);
    expect(parsed!.parks).toEqual([{ name: "The Green", typeIndex: 0, paths: [SQUARE] }]);
  });

  it("drops bad parks instead of drawing them somewhere false", () => {
    const parsed = parseHeroPlate({
      viewBox: [596, 860],
      types: TYPES,
      parks: [
        { name: "Good", typeIndex: 0, paths: [SQUARE] },
        // Type index out of range.
        { name: "Wrong type", typeIndex: 9, paths: [SQUARE] },
        // Path data that is not a closed move/line ring.
        { name: "Open", typeIndex: 0, paths: ["M12 12L40 40"] },
        { name: "Injected", typeIndex: 0, paths: ['M0 0"/><script>alert(1)</script>'] },
        // No drawable geometry at all.
        { name: "Empty", typeIndex: 0, paths: [] },
      ],
    });

    expect(parsed!.parks).toEqual([{ name: "Good", typeIndex: 0, paths: [SQUARE] }]);
  });

  it("keeps an unknown generated date as null rather than a guess", () => {
    const parsed = parseHeroPlate({
      generatedAt: "last build",
      viewBox: [596, 860],
      types: TYPES,
      parks: [{ name: "", typeIndex: 0, paths: [SQUARE] }],
    });
    expect(parsed!.generatedAt).toBeNull();
  });
});

describe("countPlateTypes", () => {
  it("counts what is actually drawn, per type", () => {
    const counts = countPlateTypes(
      plate([
        { name: "A", typeIndex: 0, paths: [SQUARE] },
        { name: "B", typeIndex: 0, paths: [SQUARE] },
        { name: "C", typeIndex: 1, paths: [SQUARE] },
      ]),
    );
    expect(counts).toEqual([2, 1]);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(3);
  });

  it("groups parks by type in palette order", () => {
    const groups = groupPlateParks(
      plate([
        { name: "A", typeIndex: 1, paths: [SQUARE] },
        { name: "B", typeIndex: 0, paths: [SQUARE] },
      ]),
    );
    expect(groups.map((group) => group.type.label)).toEqual(["Pocket", "Civic"]);
    expect(groups.map((group) => group.parks.map((park) => park.name))).toEqual([["B"], ["A"]]);
  });

  it("captions the resting plate without repeating the head count", () => {
    expect(describePlate()).toBe("Real park boundaries, drawn to scale");
  });
});

describe("scale bar", () => {
  it("picks a round distance that stays under 30% of the plate", () => {
    // 10 m per unit over 860 units: 2 km is 200 units (23%), 5 km is 500 (58%).
    expect(scaleBarMetres({ metresPerUnit: 10, viewBox: [596, 860] })).toBe(2000);
  });

  it("returns no bar when the file does not state a ground scale", () => {
    expect(scaleBarMetres({ metresPerUnit: null, viewBox: [596, 860] })).toBeNull();
  });

  it("sizes the bar against the square frame's width", () => {
    // 2 km at 10 m/unit = 200 units of 860 = 23.26% of the plot's width.
    expect(scaleBarPercent({ metresPerUnit: 10, viewBox: [596, 860] }, 2000)).toBeCloseTo(23.26, 2);
  });
});
