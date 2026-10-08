import { describe, expect, it } from "vitest";
import { NearestIndex, calcCentroid, haversineKm } from "./geo";

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0);
  });

  it("is symmetric", () => {
    const a = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631);
    const b = haversineKm(-37.8136, 144.9631, -33.8688, 151.2093);
    expect(a).toBeCloseTo(b, 9);
  });

  it("matches a known great-circle distance", () => {
    // Sydney CBD -> Melbourne CBD is ~713 km; allow 2% for the spherical model.
    const km = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631);
    expect(km).toBeGreaterThan(700);
    expect(km).toBeLessThan(730);
  });

  it("handles a short intra-city hop", () => {
    // ~1.1 km north.
    const km = haversineKm(-33.8688, 151.2093, -33.8588, 151.2093);
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.3);
  });

  it("does not blow up on antipodal input", () => {
    const km = haversineKm(0, 0, 0, 180);
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeCloseTo(Math.PI * 6371, 0);
  });
});

describe("calcCentroid", () => {
  it("averages the ring vertices", () => {
    const c = calcCentroid([
      [151, -33],
      [153, -33],
      [153, -35],
      [151, -35],
    ]);
    expect(c.lng).toBeCloseTo(152, 9);
    expect(c.lat).toBeCloseTo(-34, 9);
  });

  it("handles a single-vertex ring", () => {
    expect(calcCentroid([[151.2, -33.9]])).toEqual({ lat: -33.9, lng: 151.2 });
  });
});

describe("NearestIndex", () => {
  /** Brute-force reference used to prove the index is exact, not approximate. */
  function bruteForce<T extends { lat: number; lng: number }>(
    points: T[],
    lat: number,
    lng: number,
    maxRadiusKm = Infinity,
  ): T | null {
    let best: T | null = null;
    let bestDist = maxRadiusKm;
    for (const p of points) {
      const d = haversineKm(lat, lng, p.lat, p.lng);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function grid(size: number, spacing = 0.02) {
    const points: { id: number; lat: number; lng: number }[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        points.push({ id: i * size + j, lat: -33.9 + i * spacing, lng: 151.1 + j * spacing });
      }
    }
    return points;
  }

  /** Exactly `count` points scattered over a bounding box, no grid artefacts. */
  function scatter(count: number, seed: number) {
    const rng = mulberry32(seed);
    return Array.from({ length: count }, (_, id) => ({
      id,
      lat: -33.92 + rng() * 0.07,
      lng: 151.17 + rng() * 0.06,
    }));
  }

  it("returns null for an empty index", () => {
    expect(new NearestIndex([]).nearest(-33.8, 151.2)).toBeNull();
  });

  it("finds a point sitting exactly on the query", () => {
    const points = grid(10);
    const index = new NearestIndex(points);
    const target = points[37];
    expect(index.nearest(target.lat, target.lng)?.id).toBe(target.id);
  });

  it("agrees with an exhaustive scan across a dense grid", () => {
    const points = grid(40); // 1,600 points across ~0.8 degrees
    const index = new NearestIndex(points);
    const rng = mulberry32(1234);
    for (let n = 0; n < 500; n++) {
      const lat = -33.95 + rng() * 0.9;
      const lng = 151.05 + rng() * 0.9;
      const viaIndex = index.nearest(lat, lng);
      const viaScan = bruteForce(points, lat, lng);
      if (viaScan === null) {
        expect(viaIndex).toBeNull();
      } else {
        expect(viaIndex?.id, `nearest mismatch at ${lat},${lng}`).toBe(viaScan.id);
      }
    }
  });

  it("agrees with an exhaustive scan when a radius bound excludes the winner", () => {
    const points = grid(20);
    const index = new NearestIndex(points);
    // A tight radius around a point that is not itself in the dataset.
    const lat = -33.87;
    const lng = 151.13;
    const radius = 0.5; // km
    expect(index.nearest(lat, lng, radius)?.id).toBe(bruteForce(points, lat, lng, radius)?.id);
  });

  it("respects maxRadiusKm", () => {
    const points = [{ id: 1, lat: -33.0, lng: 151.0 }];
    const index = new NearestIndex(points);
    expect(index.nearest(-34.5, 151.0, 10)).toBeNull();
    expect(index.nearest(-33.01, 151.0, 10)?.id).toBe(1);
  });

  it("handles points spanning the antimeridian without collapsing the grid", () => {
    const points = [
      { id: "east", lat: 0, lng: 179.9 },
      { id: "west", lat: 0, lng: -179.9 },
    ];
    const index = new NearestIndex(points, 0.5);
    expect(index.nearest(0, 179.95)?.id).toBe("east");
    expect(index.nearest(0, -179.95)?.id).toBe("west");
  });

  it("handles negative coordinates", () => {
    const points = [
      { id: 1, lat: -33.87, lng: -70.6 },
      { id: 2, lat: -33.5, lng: -70.0 },
    ];
    const index = new NearestIndex(points);
    expect(index.nearest(-33.87, -70.6)?.id).toBe(1);
    expect(index.nearest(-33.5, -70.0)?.id).toBe(2);
  });

  it("reports the number of indexed points", () => {
    expect(new NearestIndex(grid(7)).size).toBe(49);
  });

  it("is exact at the real dataset scale used by the tree layer", () => {
    // 418 parks, matching the shipped Parks.geojson, queried 2,000 times
    // against an exhaustive reference scan.
    const points = scatter(418, 99);
    const index = new NearestIndex(points);
    const rng = mulberry32(99);
    let compared = 0;
    for (let n = 0; n < 2000; n++) {
      const lat = -33.92 + rng() * 0.07;
      const lng = 151.17 + rng() * 0.06;
      const a = index.nearest(lat, lng);
      const b = bruteForce(points, lat, lng);
      if (b) {
        expect(a?.id).toBe(b.id);
        compared++;
      }
    }
    expect(compared).toBe(2000);
  }, 30_000);

  it("answers a full-city sweep fast enough for the tree layer", () => {
    // The tree layer asks one question per visible tree. This is the shape of
    // that workload: 418 indexed parks, 5,000 queries.
    const points = scatter(418, 7);
    const index = new NearestIndex(points);
    const rng = mulberry32(21);
    const started = performance.now();
    for (let n = 0; n < 5000; n++) {
      index.nearest(-33.92 + rng() * 0.07, 151.17 + rng() * 0.06);
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
  }, 30_000);
});

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}