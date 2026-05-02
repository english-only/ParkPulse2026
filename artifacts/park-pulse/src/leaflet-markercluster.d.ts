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
  interface MarkerClusterGroup extends FeatureGroup {}

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
