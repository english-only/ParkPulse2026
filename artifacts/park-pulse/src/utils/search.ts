import type { Park } from "../types/park";

/**
 * Ranks a park against a lower-cased query. Higher is better; 0 means "no
 * match" and the park is filtered out.
 *
 * The tiers are ordered by how strong a signal they represent: an exact name
 * beats a name prefix, which beats a name substring, which beats a suburb
 * match, which beats a type keyword. The final sequential-character pass is a
 * weak "did the letters appear in order anywhere" fallback.
 */
export function fuzzyScore(park: Park, query: string): number {
  if (!query) return 100;
  // Normalise both sides here rather than relying on the caller to have
  // lowercased the query; otherwise a query with any capital letter silently
  // scores 0 and the park disappears from results.
  const q = query.toLowerCase().trim();
  const name = park.name.toLowerCase();
  const suburb = (park.suburb || "").toLowerCase();
  const type = (park.type || "").toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 82;
  if (name.includes(q)) return 62;
  if (suburb === q) return 55;
  if (suburb.startsWith(q)) return 46;
  if (suburb.includes(q)) return 35;
  if (type.includes(q)) return 25;
  // Sequential character match
  let qi = 0;
  for (let i = 0; i < name.length && qi < q.length; i++) {
    if (name[i] === q[qi]) qi++;
  }
  if (qi === q.length) return Math.max(8, 18 - (name.length - q.length));
  return 0;
}

export interface SizeLabel {
  label: string;
  cls: string;
}

export function sizeLabel(area: number): SizeLabel {
  if (area < 1000) return { label: "Tiny", cls: "pp-size-tiny" };
  if (area < 5000) return { label: "Small", cls: "pp-size-small" };
  if (area < 10000) return { label: "Medium", cls: "pp-size-med" };
  if (area < 50000) return { label: "Large", cls: "pp-size-large" };
  return { label: "Massive", cls: "pp-size-massive" };
}

export function fmtArea(area: number): string {
  if (area >= 10000) return `${(area / 10000).toFixed(1)} ha`;
  return `${area >= 1000 ? area.toLocaleString() : Math.round(area)} m²`;
}

/** Filters and ranks parks against a query and a set of active type filters. */
export function searchParks(
  parks: readonly Park[],
  query: string,
  isTypeMatch: (park: Park) => boolean,
  minArea: number,
): Park[] {
  const areaPass = (park: Park) => !minArea || (park.area != null && park.area >= minArea);

  if (!query.trim()) return parks.filter((p) => areaPass(p));

  return parks
    .map((park) => ({ park, score: fuzzyScore(park, query) }))
    .filter((x) => x.score > 0 && areaPass(x.park))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.park);
}

export type SortKey = "default" | "name" | "nearest" | "size";

export const SORT_KEYS: readonly SortKey[] = ["default", "name", "nearest", "size"] as const;

export function isSortKey(value: string | null): value is SortKey {
  return !!value && (SORT_KEYS as readonly string[]).includes(value);
}