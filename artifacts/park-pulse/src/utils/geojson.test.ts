import { describe, expect, it, vi } from "vitest";
import { boundsContain, readLatLng, readFeatureCentroid, loadPointsInBounds } from "./geojson";

describe("readLatLng", () => {
  it("reads a GeoJSON Point feature", () => {
    const f = { type: "Feature", geometry: { type: "Point", coordinates: [151.2, -33.87] } };
    expect(readLatLng(f as never)).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("reads flat lat/lng records", () => {
    expect(readLatLng({ lat: -33.87, lng: 151.2 })).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("reads lat/longitude aliases", () => {
    expect(readLatLng({ latitude: -33.87, longitude: 151.2 })).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("reads lat/lon aliases", () => {
    expect(readLatLng({ lat: -33.87, lon: 151.2 })).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("reads numeric strings", () => {
    expect(readLatLng({ lat: "-33.87", lng: "151.2" })).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("falls back to nested geometry when lat/lng are absent", () => {
    expect(readLatLng({ geometry: { coordinates: [151.2, -33.87] } } as never)).toEqual({
      lat: -33.87,
      lng: 151.2,
    });
  });

  it("returns null for records without usable coordinates", () => {
    expect(readLatLng({})).toBeNull();
    expect(readLatLng({ lat: null, lng: null })).toBeNull();
    expect(readLatLng({ lat: "abc", lng: 151 })).toBeNull();
    expect(readLatLng({ type: "Feature", geometry: null } as never)).toBeNull();
  });
});

describe("boundsContain", () => {
  const b = { south: -34, north: -33.5, west: 151, east: 151.5 };

  it("includes points inside", () => {
    expect(boundsContain(b, -33.8, 151.2)).toBe(true);
  });

  it("excludes points outside on each edge", () => {
    expect(boundsContain(b, -34.5, 151.2)).toBe(false);
    expect(boundsContain(b, -33.2, 151.2)).toBe(false);
    expect(boundsContain(b, -33.8, 150)).toBe(false);
    expect(boundsContain(b, -33.8, 152)).toBe(false);
  });

  it("treats the edges as inside", () => {
    expect(boundsContain(b, -34, 151)).toBe(true);
    expect(boundsContain(b, -33.5, 151.5)).toBe(true);
  });
});

describe("loadPointsInBounds", () => {
  const feature = (lat: number, lng: number) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
    properties: {},
  });

  function mockFetch(payload: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns everything when no bounds are supplied", async () => {
    mockFetch({ type: "FeatureCollection", features: [feature(-33.8, 151.2), feature(-34.9, 150)] });
    try {
      const { points, total } = await loadPointsInBounds("data/x.json", "ns", null);
      expect(points).toHaveLength(2);
      expect(total).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps only points inside the viewport but reports the full total", async () => {
    mockFetch({
      type: "FeatureCollection",
      features: [feature(-33.8, 151.2), feature(-33.9, 151.3), feature(-35.0, 150.0)],
    });
    try {
      const { points, total } = await loadPointsInBounds("data/x.json", "ns2", {
        south: -34,
        north: -33.7,
        west: 151.1,
        east: 151.4,
      });
      expect(points).toHaveLength(2);
      // The count badge still reflects the whole dataset, not just the viewport.
      expect(total).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pads the viewport by a fraction of its own span", async () => {
    // Viewport spans 0.3° of latitude, so a 0.3 fraction pads by 0.09°.
    // -33.6 is 0.1 north of the edge, just outside the pad; -33.65 is inside.
    mockFetch({
      type: "FeatureCollection",
      features: [feature(-33.65, 151.2), feature(-33.6, 151.2), feature(-34.6, 151.2)],
    });
    try {
      const { points } = await loadPointsInBounds("data/x.json", "ns3", {
        south: -34,
        north: -33.7,
        west: 151.1,
        east: 151.4,
      });
      expect(points).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("culls much harder when zoomed in, unlike a fixed-degree pad", async () => {
    // 3,127 points spread across the dataset; only a few are near Sydney CBD.
    const features = Array.from({ length: 3127 }, (_, i) => feature(-33.8 - i * 0.01, 151.2 + i * 0.01));
    mockFetch({ type: "FeatureCollection", features });

    const cityWide = { south: -34.2, north: -33.4, west: 150.7, east: 151.7 };
    const zoomedIn = { south: -33.85, north: -33.80, west: 151.15, east: 151.25 };

    try {
      const wide = await loadPointsInBounds("data/toilets.json", "ns6", cityWide);
      const tight = await loadPointsInBounds("data/toilets.json", "ns6", zoomedIn);
      expect(wide.total).toBe(3127);
      expect(tight.points.length).toBeLessThan(wide.points.length / 5);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("accepts a bare array of records", async () => {
    mockFetch([{ lat: -33.8, lng: 151.2, name: "A" }]);
    try {
      const { points } = await loadPointsInBounds("data/y.json", "ns4", null);
      expect(points).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drops records that carry no coordinates", async () => {
    mockFetch({ type: "FeatureCollection", features: [feature(-33.8, 151.2), { type: "Feature", geometry: null }] });
    try {
      const { points, total } = await loadPointsInBounds("data/z.json", "ns5", null);
      expect(points).toHaveLength(1);
      expect(total).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe("readFeatureCentroid", () => {
  it("returns the coordinates of a Point feature", () => {
    const f = { type: "Feature", geometry: { type: "Point", coordinates: [151.2, -33.87] } };
    expect(readFeatureCentroid(f as never)).toEqual({ lat: -33.87, lng: 151.2 });
  });

  it("averages a Polygon ring, which the parks dataset relies on", () => {
    // Closed rings repeat their first position, so the mean counts it twice.
    const f = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[151.0, -34.0], [151.2, -34.0], [151.2, -33.8], [151.0, -33.8], [151.0, -34.0]]] },
    };
    const centre = readFeatureCentroid(f as never)!;
    expect(centre.lat).toBeCloseTo(-33.92, 6);
    expect(centre.lng).toBeCloseTo(151.08, 6);
  });

  it("averages the first ring of a MultiPolygon", () => {
    const f = {
      type: "Feature",
      geometry: { type: "MultiPolygon", coordinates: [[[[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]]]] },
    };
    expect(readFeatureCentroid(f as never)).toEqual({ lat: 1.6, lng: 1.6 });
  });

  it("returns null rather than inventing a location for unusable geometry", () => {
    expect(readFeatureCentroid({ type: "Feature", geometry: null } as never)).toBeNull();
    expect(readFeatureCentroid({ type: "Feature", geometry: { type: "Polygon", coordinates: [] } } as never)).toBeNull();
  });

  it("skips non-numeric ring positions instead of producing NaN", () => {
    const f = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], ["x", 5], [3, 1]]] } };
    expect(readFeatureCentroid(f as never)).toEqual({ lat: 1, lng: 2 });
  });
});
