import "leaflet";

declare module "leaflet" {
  interface Map {
    /**
     * The attribution control, or null when the map was created with the
     * `attributionControl: false` option. Not declared by the Leaflet types even
     * though it is part of the public API.
     */
    attributionControl: AttributionControl | null;
  }
}