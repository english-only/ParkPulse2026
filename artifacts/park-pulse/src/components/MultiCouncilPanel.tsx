import { useEffect, useMemo } from "react";
import L from "leaflet";
import { councilColor, unionBBox, type CouncilIndexEntry } from "../utils/councils";

/**
 * Boundary rendering + legend for FR1.4–1.5 and FR1.7.
 *
 * Owns nothing itself: Explore holds the selection and the loaded features,
 * this component draws them on the map (colour stable per lga_id, 0.12 fill,
 * 2 px stroke, sticky tooltip carrying the display name) and renders the
 * legend chips with per-chip removal. Tooltip text is written with
 * `textContent` — council names come from a dataset and are never passed to
 * `innerHTML` (§3.7-3).
 */
export interface MultiCouncilPanelProps {
  map: L.Map | null;
  entries: readonly CouncilIndexEntry[];
  selectedIds: readonly string[];
  /** Loaded boundary features, keyed by lga_id. */
  features: ReadonlyMap<string, GeoJSON.Feature>;
  /** Ids whose boundary fetch is still in flight. */
  pendingIds: readonly string[];
  /** Ids whose boundary fetch failed — kept selected, marked unavailable. */
  failedIds: readonly string[];
  onRemove: (lgaId: string) => void;
  onClear: () => void;
}

export default function MultiCouncilPanel({
  map,
  entries,
  selectedIds,
  features,
  pendingIds,
  failedIds,
  onRemove,
  onClear,
}: MultiCouncilPanelProps) {
  const selectedKey = selectedIds.join(",");

  // The Explore map opts into `preferCanvas`, which would render these
  // boundaries onto a canvas (uninspectable, and no per-path tooltip
  // positioning). Boundaries are few and large, so they get their own SVG
  // renderer instead.
  const renderer = useMemo(() => L.svg({ padding: 0.5 }), []);

  const selectedEntries = useMemo(
    () =>
      selectedIds
        .map(id => entries.find(e => e.lga_id === id))
        .filter((e): e is CouncilIndexEntry => Boolean(e)),
    [entries, selectedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Draw the boundaries. Rebuilt whenever the selection or the loaded
  // feature set changes; the previous group is removed with it.
  useEffect(() => {
    if (!map || selectedIds.length === 0) return;
    const group = L.layerGroup();
    let drawn = 0;

    for (const id of selectedIds) {
      const feature = features.get(id);
      if (!feature || !feature.geometry) continue;
      const entry = entries.find(e => e.lga_id === id);
      const color = councilColor(id);
      const geojson = L.geoJSON(feature as GeoJSON.GeoJsonObject, {
        style: {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          renderer,
        },
      });
      geojson.eachLayer(child => {
        if (child instanceof L.Path) {
          const label = document.createElement("span");
          label.textContent = entry?.display_name ?? id;
          child.bindTooltip(label, { sticky: true, direction: "top", opacity: 1 });
        }
      });
      geojson.addTo(group);
      drawn++;
    }

    if (drawn > 0) group.addTo(map);
    return () => {
      map.removeLayer(group);
    };
    // `selectedKey` (not the array identity) is the meaningful dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedKey, features, entries, renderer]);

  // Fit the viewport to the union bbox on every selection change (FR1.5).
  useEffect(() => {
    if (!map || selectedEntries.length === 0) return;
    const [south, west, north, east] = unionBBox(selectedEntries);
    if (![south, west, north, east].every(Number.isFinite)) return;
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [48, 48], maxZoom: 14 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedKey]);

  const hidden =
    selectedIds.length === 0 && pendingIds.length === 0 && failedIds.length === 0;
  if (hidden) return null;

  return (
    <section className="pp-council-legend" aria-label="Selected council boundaries">
      <div className="pp-council-legend-head">
        <h3>Boundaries</h3>
        {selectedIds.length > 0 && (
          <button type="button" className="pp-council-legend-clear" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      <ul className="pp-council-chips">
        {selectedEntries.map(entry => {
          const failed = failedIds.includes(entry.lga_id);
          const pending = pendingIds.includes(entry.lga_id);
          return (
            <li key={entry.lga_id}>
              <span
                className={`pp-council-chip${failed ? " unavailable" : ""}`}
                title={
                  failed
                    ? `${entry.display_name} — boundary unavailable`
                    : pending
                      ? `${entry.display_name} — loading boundary…`
                      : entry.display_name
                }
              >
                <span
                  className="pp-council-chip-dot"
                  style={{ background: councilColor(entry.lga_id) }}
                  aria-hidden="true"
                />
                <span className="pp-council-chip-name">{entry.display_name}</span>
                {failed && <span className="pp-council-chip-flag">boundary unavailable</span>}
                {pending && <span className="pp-council-chip-flag">loading…</span>}
                <button
                  type="button"
                  className="pp-council-chip-remove"
                  aria-label={`Remove ${entry.display_name} from selection`}
                  onClick={() => onRemove(entry.lga_id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {pendingIds.length > 0 && (
        <p className="pp-council-legend-note" role="status">
          Loading {pendingIds.length} boundar{pendingIds.length === 1 ? "y" : "ies"}…
        </p>
      )}
      {failedIds.length > 0 && (
        <p className="pp-council-legend-note warn" role="status">
          {failedIds.length === 1 ? "Boundary unavailable" : "Some boundaries unavailable"} —
          selection kept.
        </p>
      )}
    </section>
  );
}
