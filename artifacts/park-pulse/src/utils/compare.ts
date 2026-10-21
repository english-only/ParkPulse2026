/**
 * Pure helpers for the Compare parks page.
 *
 * Everything here works on the fields the shipped `Parks.geojson` actually
 * carries (`Name`, `Type`, `Playgrounds`, `Shape__Area`, `Asset_ID`). Absent
 * or malformed values stay null so the UI can say "Not provided" instead of
 * inventing an attribute.
 */

export interface ComparePark {
  key: string;
  name: string;
  type: string | null;
  /** Park area in hectares, derived from the published square-metre field. */
  areaHa: number | null;
  playgrounds: string | null;
  assetId: string | null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Normalises one GeoJSON feature's properties into a comparable record. */
export function toComparePark(
  properties: Record<string, unknown>,
  fallbackKey: string,
): ComparePark {
  const areaM2 = readNumber(properties.Shape__Area);
  const assetId =
    readText(properties.Asset_ID) ?? readNumber(properties.OBJECTID)?.toString() ?? null;
  return {
    key: readText(properties.Asset_ID) ?? fallbackKey,
    name: readText(properties.Name) ?? "Unnamed park area",
    type: readText(properties.Type),
    areaHa: areaM2 === null ? null : areaM2 / 10_000,
    playgrounds: readText(properties.Playgrounds),
    assetId,
  };
}

/** "3.9 ha" — one decimal below 10 ha, whole numbers above, never a bare 0. */
export function formatAreaHa(areaHa: number | null): string | null {
  if (areaHa === null) return null;
  if (areaHa <= 0) return null;
  const text = areaHa >= 10 ? String(Math.round(areaHa)) : areaHa.toFixed(1);
  return `${text} ha`;
}

/** Toggle membership with an upper bound; exceeding the bound is a no-op. */
export function toggleSelected(selected: string[], key: string, max = 3): string[] {
  if (selected.includes(key)) return selected.filter((item) => item !== key);
  if (selected.length >= max) return selected;
  return [...selected, key];
}

/** Case-insensitive substring search over park names, capped for the UI. */
export function matchParks(parks: ComparePark[], query: string, limit = 8): ComparePark[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return parks.filter((park) => park.name.toLowerCase().includes(q)).slice(0, limit);
}
