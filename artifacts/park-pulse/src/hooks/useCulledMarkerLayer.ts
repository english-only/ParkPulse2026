import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import { loadPointsInBounds, readLatLng, type PointFeature } from "../utils/geojson";

export interface CulledLayerConfig<TProps> {
  /** Whether the layer's filter is on. */
  enabled: boolean;
  url: string;
  cacheId: string;
  /** Optional label used when reporting counts in logs. */
  countKey?: string;
  /** Human name used in error messages. */
  label: string;
  /** Builds the marker for one point. */
  build: (props: TProps, latlng: [number, number]) => L.Marker;
  /** Reported once after the first successful load. */
  onCount?: (total: number) => void;
  onError?: (label: string) => void;
}

function currentBounds(map: L.Map) {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

/**
 * Loads a point dataset into a Leaflet layer, keeping only the markers that
 * fall inside the current viewport and rebuilding as the user pans.
 *
 * The previous implementation added every point at once the moment its filter
 * was ticked — about 6,000 marker DOM nodes across toilets, transport and
 * Blacktown whether or not they were on screen. Culling at load time keeps the
 * cost proportional to what is actually visible.
 *
 * The underlying fetch is cached, so panning re-reads from localStorage rather
 * than re-downloading.
 */
export function useCulledMarkerLayer<TProps>(
  map: L.Map | null,
  config: CulledLayerConfig<TProps>,
): void {
  const { enabled, url, cacheId, label, build, onCount, onError } = config;
  const layerRef = useRef<L.LayerGroup | null>(null);
  const countedRef = useRef(false);
  // Kept in refs so the moveend listener does not need to be torn down and
  // re-registered whenever a callback identity changes.
  const buildRef = useRef(build);
  const onCountRef = useRef(onCount);
  const onErrorRef = useRef(onError);
  buildRef.current = build;
  onCountRef.current = onCount;
  onErrorRef.current = onError;

  const refresh = useCallback(async () => {
    if (!map || !enabled) return;
    try {
      const { points, total } = await loadPointsInBounds<TProps>(url, cacheId, currentBounds(map));

      const layer = L.layerGroup();
      for (const point of points) {
        const ll = readLatLng(point as never);
        if (!ll) continue;
        const marker = buildRef.current((point.properties ?? {}) as TProps, [ll.lat, ll.lng]);
        layer.addLayer(marker);
      }

      // Swap the rebuilt layer in for the old one.
      if (layerRef.current && map.hasLayer(layerRef.current)) map.removeLayer(layerRef.current);
      layerRef.current = layer;
      map.addLayer(layer);

      if (!countedRef.current) {
        countedRef.current = true;
        onCountRef.current?.(total);
      }
    } catch (err) {
      console.error(`[explore] failed to load ${label}:`, err);
      onErrorRef.current?.(label);
    }
  }, [map, enabled, url, cacheId, label]);

  // Rebuild when the layer is switched on or its source changes.
  useEffect(() => {
    if (!map) return;
    if (!enabled) {
      if (layerRef.current && map.hasLayer(layerRef.current)) map.removeLayer(layerRef.current);
      layerRef.current = null;
      countedRef.current = false;
      return;
    }
    countedRef.current = false;
    void refresh();
  }, [map, enabled, refresh]);

  // Re-cull after the user stops panning.
  useEffect(() => {
    if (!map || !enabled) return;
    const handler = () => void refresh();
    map.on("moveend zoomend", handler);
    return () => {
      map.off("moveend zoomend", handler);
    };
  }, [map, enabled, refresh]);

  // Drop the layer from the map on unmount.
  useEffect(
    () => () => {
      if (map && layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
      layerRef.current = null;
    },
    [map],
  );
}

export type { PointFeature };
