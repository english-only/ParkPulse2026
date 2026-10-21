import { useEffect, useRef } from "react";

/**
 * A small Leaflet canvas used on the contribution page.
 *
 * Leaflet is imported dynamically, so neither the submission page's first
 * paint nor any other route downloads the map stack. The map is a convenience
 * for placing a point — the latitude and longitude inputs remain the source of
 * truth, and the page is fully usable when the map cannot load.
 */

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
}

interface MapCanvasProps {
  points: MapPoint[];
  /** When provided, clicking the map moves the single selected point. */
  onPick?: (lat: number, lng: number) => void;
  /** Id of the point that gets a draggable marker. */
  selectedIndex?: number;
  ariaLabel: string;
  height?: number;
}

const SYDNEY: [number, number] = [-33.8688, 151.2093];

export default function MapCanvas({
  points,
  onPick,
  selectedIndex,
  ariaLabel,
  height = 240,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const pickRef = useRef(onPick);
  const selectedRef = useRef(selectedIndex);
  const pointsRef = useRef(points);

  pickRef.current = onPick;
  selectedRef.current = selectedIndex;
  pointsRef.current = points;

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    (async () => {
      const [{ default: L }] = await Promise.all([
        import("leaflet"),
        import("leaflet/dist/leaflet.css"),
      ]);
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: SYDNEY,
        zoom: 13,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;

      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        pickRef.current?.(Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6)));
      });

      render(L, layer, map);
    })().catch(() => {
      // Tiles or the map module can fail offline. The coordinate inputs still
      // work, so the page states the map is unavailable rather than blocking.
      if (containerRef.current) containerRef.current.dataset.failed = "true";
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // The map is created once; points are updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    import("leaflet").then(({ default: L }) => {
      if (mapRef.current && layerRef.current) render(L, layerRef.current, mapRef.current);
    });
  }, [points, selectedIndex]);

  function render(
    L: typeof import("leaflet"),
    layer: import("leaflet").LayerGroup,
    map: import("leaflet").Map,
  ) {
    layer.clearLayers();
    const current = pointsRef.current;
    const selected = selectedRef.current;

    current.forEach((point, index) => {
      if (index === selected) return;
      L.circleMarker([point.lat, point.lng], {
        radius: 5,
        color: "#176B43",
        weight: 1,
        fillColor: "#43D18A",
        fillOpacity: 0.75,
      })
        .bindTooltip(point.label ?? "Contributed point")
        .addTo(layer);
    });

    const active = selected !== undefined ? current[selected] : undefined;
    if (active) {
      const marker = L.marker([active.lat, active.lng], { draggable: Boolean(pickRef.current) }).addTo(layer);
      if (pickRef.current) {
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          pickRef.current?.(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)));
        });
      }
      map.setView([active.lat, active.lng], Math.max(map.getZoom(), 15), { animate: false });
      return;
    }

    if (current.length > 0) {
      const bounds = L.latLngBounds(current.map((point) => [point.lat, point.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 16, animate: false });
    }
  }

  return (
    <div className="ct-map" style={{ height }}>
      <div ref={containerRef} className="ct-map-canvas" role="application" aria-label={ariaLabel} />
      <p className="ct-map-hint">
        {onPick ? "Click the map or drag the pin to set the coordinate." : "Preview of the points that will be submitted."}
      </p>
    </div>
  );
}
