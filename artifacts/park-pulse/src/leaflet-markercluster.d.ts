import "leaflet";

declare module "leaflet" {
  interface MarkerClusterGroupOptions {
    maxClusterRadius?: number;
    disableClusteringAtZoom?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    chunkedLoading?: boolean;
    iconCreateFunction?: (cluster: MarkerCluster) => Icon | DivIcon;
  }

  interface MarkerCluster extends Marker {}
  interface MarkerClusterGroup extends FeatureGroup {
    /** Unwraps a clustered layer and reveals it, then fires the callback once
     *  it is actually visible on the map (leaflet.markercluster). */
    zoomToShowLayer(layer: Layer, callback?: () => void): void;
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
