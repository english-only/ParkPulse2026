export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Average of the outer ring's vertices. Adequate for labelling a park with a
 * point; it is deliberately not a true centroid because the GeoJSON rings are
 * not area-weighted and the difference is irrelevant at map-icon scale.
 */
export function calcCentroid(coords: number[][]): LatLng {
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

/**
 * Uniform-grid nearest-neighbour index.
 *
 * The map asks "which park is nearest to this tree?" once per visible tree,
 * and the naive answer is a linear scan over every park. With ~49k trees and
 * ~420 parks that is ~20M distance computations on the main thread, which
 * locks the tab. This builds a grid once and answers each query by expanding
 * rings of cells around the query point until a hit is found and no closer
 * candidate can still be hiding further out.
 *
 * The search is exact, not approximate: expansion stops only once the current
 * best distance is no larger than the distance to the edge of the unsearched
 * ring.
 */
export class NearestIndex<T extends LatLng> {
  private readonly cells = new Map<string, T[]>();
  private readonly cellDeg: number;
  private readonly origin: LatLng;

  constructor(points: readonly T[], cellDeg = 0.02) {
    this.cellDeg = cellDeg;
    if (!points.length) {
      this.origin = { lat: 0, lng: 0 };
      return;
    }
    let minLat = Infinity;
    let minLng = Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
    }
    // Store the origin as min minus a few cells so negative coordinates (west
    // of Greenwich / south of the equator) still map to non-negative indices.
    this.origin = { lat: minLat - cellDeg * 4, lng: minLng - cellDeg * 4 };

    for (const p of points) {
      const key = this.keyFor(p.lat, p.lng);
      let bucket = this.cells.get(key);
      if (!bucket) this.cells.set(key, (bucket = []));
      bucket.push(p);
    }
  }

  get size(): number {
    let total = 0;
    for (const bucket of this.cells.values()) total += bucket.length;
    return total;
  }

  private colOf(lng: number): number {
    return Math.floor((lng - this.origin.lng) / this.cellDeg);
  }

  private rowOf(lat: number): number {
    return Math.floor((lat - this.origin.lat) / this.cellDeg);
  }

  private keyFor(lat: number, lng: number): string {
    return `${this.colOf(lng)}:${this.rowOf(lat)}`;
  }

  /**
   * Exact nearest point to (lat, lng), or null when the index is empty.
   *
   * The `maxRadiusKm` bound makes the result deterministic and lets callers
   * stop searching once they know nothing interesting is nearby.
   */
  nearest(lat: number, lng: number, maxRadiusKm = Infinity): T | null {
    if (this.size === 0) return null;

    const col = this.colOf(lng);
    const row = this.rowOf(lat);
    let best: T | null = null;
    let bestDist = maxRadiusKm;

    // Widest ring we may need to reach, derived from the caller's bound. The
    // +1 keeps a query that is already inside a populated cell honest.
    const maxRing = Number.isFinite(maxRadiusKm)
      ? Math.ceil((maxRadiusKm / 111) / this.cellDeg) + 1
      : Number.POSITIVE_INFINITY;

    for (let ring = 0; ring <= maxRing; ring++) {
      // Once we have a hit, a ring can be skipped only if its inner edge is
      // already farther away than the best hit.
      if (best !== null && (ring - 1) * this.cellDeg * 111 > bestDist) break;

      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          // Only the perimeter of the ring is new at this radius.
          if (ring > 0 && Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
          const bucket = this.cells.get(`${col + dc}:${row + dr}`);
          if (!bucket) continue;
          for (const candidate of bucket) {
            const d = haversineKm(lat, lng, candidate.lat, candidate.lng);
            if (d < bestDist) {
              bestDist = d;
              best = candidate;
            }
          }
        }
      }
    }
    return best;
  }
}
