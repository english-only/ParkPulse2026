import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
import {
  LAYER_TOGGLES,
  PARK_TYPE_KEYS,
  TYPE_FILTERS,
  UNSHIPPED_LAYERS,
  defaultFilters,
  filterLabel,
} from "./exploreFilters";

/**
 * The map must be able to reach every point layer this build publishes, and
 * must not offer a layer it cannot serve. These tests read the layer registry
 * (the single source of truth) rather than a hand-kept list.
 *
 * Explore has two ways in: the hand-written `LAYER_TOGGLES` rail for layers
 * with bespoke loaders, and the `GENERIC_LAYERS` chips Explore derives from
 * the registry itself. A published point layer is only unreachable if neither
 * path exposes it, so reachability is asserted across both.
 */
describe("explore categories", () => {
  const published = LAYERS.filter(
    (layer) =>
      layer.status === "published" &&
      layer.geometry === "point" &&
      // Parks is the base map layer: always on, not a toggle.
      layer.id !== "parks" &&
      // Boundaries are council scope, not a marker layer.
      layer.id !== "councils",
  ).map((layer) => layer.id);

  /** Registry-driven layers Explore draws without a bespoke loader. */
  const generic = LAYERS.filter(
    (layer) => layer.status === "published" && layer.explore === "generic" && layer.artifact,
  ).map((layer) => layer.id);

  it("exposes every published point layer from Explore", () => {
    const offered = [...LAYER_TOGGLES.map((toggle) => toggle.key), ...generic];
    for (const id of published) {
      expect(offered, `${id} is published but not reachable from Explore`).toContain(id);
    }
  });

  it("can draw every registry-driven layer it offers", () => {
    // A generic layer with no artifact or colour would render a failed fetch
    // or an invisible marker, so both are part of being reachable.
    for (const layer of LAYERS.filter((entry) => entry.explore === "generic")) {
      expect(layer.status, `${layer.id} is generic but not published`).toBe("published");
      expect(layer.artifact, `${layer.id} has no artifact`).toBeTruthy();
      expect(layer.mapColor, `${layer.id} has no mapColor`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("keeps the hand-written rail and the registry-driven chips disjoint", () => {
    const bespoke = LAYER_TOGGLES.map((toggle) => toggle.key as string);
    for (const id of generic) {
      expect(bespoke, `${id} is offered twice`).not.toContain(id);
    }
  });

  it("does not offer a toggle for a layer this build withholds", () => {
    const withheld = LAYERS.filter((layer) => layer.status !== "published").map(
      (layer) => layer.id,
    );
    for (const toggle of LAYER_TOGGLES) {
      expect(withheld, `${toggle.key} is withheld but toggleable`).not.toContain(toggle.key);
    }
  });

  it("keeps one label and one colour per category", () => {
    const labels = LAYER_TOGGLES.map((toggle) => toggle.label);
    expect(new Set(labels).size).toBe(labels.length);
    const countKeys = LAYER_TOGGLES.map((toggle) => toggle.countKey).filter(Boolean);
    expect(new Set(countKeys).size).toBe(countKeys.length);
  });

  it("matches the documented default visibility", () => {
    // EXP-005: parks (base) and off-leash areas start on; everything else is
    // opt-in, and park-type refinements never start active.
    const on = Object.entries(defaultFilters)
      .filter(([, value]) => value)
      .map(([key]) => key);
    expect(on).toEqual(["dogs"]);
    for (const key of PARK_TYPE_KEYS) {
      expect(defaultFilters[key]).toBe(false);
    }
  });

  it("describes park-type refinements consistently", () => {
    expect(TYPE_FILTERS).toHaveLength(PARK_TYPE_KEYS.length);
    for (const item of TYPE_FILTERS) {
      expect(filterLabel(item.key)).toBe(item.label);
      expect(defaultFilters[item.key]).toBe(false);
    }
  });

  it("names the datasets this build does not ship, with a reason", () => {
    expect(UNSHIPPED_LAYERS.map((layer) => layer.label)).toEqual([
      "Inner West parks",
      "Inner West trees",
    ]);
    for (const layer of UNSHIPPED_LAYERS) {
      expect(layer.reason.length).toBeGreaterThan(0);
    }
    const toggleKeys = LAYER_TOGGLES.map((toggle) => toggle.key as string);
    expect(toggleKeys).not.toContain("iwParks");
    expect(toggleKeys).not.toContain("iwTrees");
  });
});
