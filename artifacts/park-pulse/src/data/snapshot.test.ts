import { describe, expect, it } from "vitest";
import { formatSnapshotDate, parseSnapshot } from "./snapshot";
import { LAYERS, countFor, formatCount, getLayer } from "./layers";

/** Shaped like the real generated file, trimmed to the fields we read. */
const STATS = {
  generatedAt: "2026-10-18",
  dataLastUpdated: "2026-05-02",
  parks: {
    total: 418,
    playgrounds: 95,
    areaHa: 204,
    byType: { Pocket: 297, Neighbourhood: 48, Iconic: 24 },
  },
  blacktown: { total: 1605 },
  dogs: { total: 51 },
  fountains: { total: 273 },
  toilets: { total: 3127 },
  npws: { total: 1795 },
  trees: { total: 48999 },
  transport: { stops: 26198 },
  councils: { total: 35, areaKm2: 12396.09 },
  locations: 2023,
};

describe("parseSnapshot", () => {
  it("flattens the count paths the UI actually reads", () => {
    const snapshot = parseSnapshot(STATS, null);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.counts["parks.total"]).toBe(418);
    expect(snapshot?.counts["dogs.total"]).toBe(51);
    expect(snapshot?.counts["trees.total"]).toBe(48999);
    expect(snapshot?.counts["councils.total"]).toBe(35);
  });

  it("does not expose unvalidated top-level numbers such as locations", () => {
    const snapshot = parseSnapshot(STATS, null);
    expect(snapshot?.counts).not.toHaveProperty("locations");
  });

  it("carries both generated and observation dates", () => {
    const snapshot = parseSnapshot(STATS, null);
    expect(snapshot?.generatedAt).toBe("2026-10-18");
    expect(snapshot?.dataLastUpdated).toBe("2026-05-02");
  });

  it("falls back to the manifest date when stats carry none", () => {
    const snapshot = parseSnapshot(
      { parks: { total: 1 } },
      { lastUpdated: "2026-05-02" },
    );
    expect(snapshot?.generatedAt).toBe("2026-05-02");
    expect(snapshot?.dataLastUpdated).toBe("2026-05-02");
  });

  it("omits dates that are not valid ISO days", () => {
    const snapshot = parseSnapshot(
      { generatedAt: "18/10/2026", dataLastUpdated: "2026-13-45" },
      { lastUpdated: "yesterday" },
    );
    expect(snapshot?.generatedAt).toBeNull();
    expect(snapshot?.dataLastUpdated).toBeNull();
  });

  it("treats invalid counts as absent rather than zero", () => {
    const snapshot = parseSnapshot(
      {
        parks: { total: -3, playgrounds: 1.5, areaHa: "204" },
        dogs: { total: null },
      },
      null,
    );
    expect(snapshot?.counts).not.toHaveProperty("parks.total");
    expect(snapshot?.counts).not.toHaveProperty("parks.playgrounds");
    expect(snapshot?.counts).not.toHaveProperty("parks.areaHa");
    expect(snapshot?.counts).not.toHaveProperty("dogs.total");
    expect(snapshot?.playgrounds).toBeNull();
    expect(snapshot?.parkAreaHa).toBeNull();
  });

  it("sorts park types by count and drops entries without a valid count", () => {
    const snapshot = parseSnapshot(
      { parks: { byType: { Pocket: 297, Iconic: 24, Broken: "many", Empty: null } } },
      null,
    );
    expect(snapshot?.parkTypes).toEqual([
      { label: "Pocket", count: 297 },
      { label: "Iconic", count: 24 },
    ]);
  });

  it("returns null when the stats file is not an object", () => {
    expect(parseSnapshot(null, null)).toBeNull();
    expect(parseSnapshot([], null)).toBeNull();
    expect(parseSnapshot("418", null)).toBeNull();
  });

  it("still returns a snapshot when both files are structurally empty", () => {
    const snapshot = parseSnapshot({}, null);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.counts).toEqual({});
    expect(snapshot?.parkTypes).toEqual([]);
  });
});

describe("formatSnapshotDate", () => {
  it("formats an ISO day for Australian readers", () => {
    expect(formatSnapshotDate("2026-05-02")).toBe("2 May 2026");
  });

  it("returns null for missing or invalid dates so callers omit them", () => {
    expect(formatSnapshotDate(null)).toBeNull();
    expect(formatSnapshotDate("2026-05-02T00:00:00Z")).toBeNull();
    expect(formatSnapshotDate("2026-99-99")).toBeNull();
  });
});

describe("layer registry", () => {
  it("uses unique ids", () => {
    const ids = LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only claims published for a layer that names a served artifact", () => {
    for (const layer of LAYERS) {
      if (layer.status === "published") expect(layer.artifact).toBeTruthy();
      else expect(layer.statusNote).toBeTruthy();
    }
  });

  it("never gives an unavailable layer a record count to render", () => {
    for (const layer of LAYERS.filter((l) => l.status === "unavailable")) {
      expect(countFor(layer, { "transport.stops": 26198 })).toBeNull();
    }
  });

  it("reads counts through the registry rather than hard-coding them", () => {
    const parks = getLayer("parks");
    expect(parks).toBeDefined();
    expect(countFor(parks!, { "parks.total": 418 })).toBe(418);
    expect(countFor(parks!, {})).toBeNull();
  });

  it("does not carry the disputed canopy figure anywhere", () => {
    const canopy = getLayer("canopy");
    expect(canopy?.countKey).toBeUndefined();
    expect(formatCount(countFor(canopy!, { "councils.canopyAvgPercent": 22 }))).toBe(
      "Not provided",
    );
  });
});
