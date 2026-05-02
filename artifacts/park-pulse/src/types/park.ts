export interface Park {
  id: number;
  name: string;
  type: string;
  suburb: string;
  hasPlayground: boolean;
  area: number | null;
  assetId: string;
  lat: number;
  lng: number;
}

export interface FountainFeature {
  lat: number;
  lng: number;
  name: string;
}

export interface TransportFeature {
  lat: number;
  lng: number;
  name: string;
  mode: string;
}

export interface TreeFeature {
  lat: number;
  lng: number;
  species: string;
}

export interface ToiletFeature {
  lat: number;
  lng: number;
  name: string;
}

export interface BlacktownFeature {
  lat: number;
  lng: number;
  name: string;
  isPlayground: boolean;
  website?: string;
}
