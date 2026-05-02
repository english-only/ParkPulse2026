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

export interface DogPark {
  id: number;
  name: string;
  suburb: string;
  street: string;
  postcode: number;
  agency: string;
  offLeashTime: string;
  alwaysOffLeash: boolean;
  prohibitedAreas: string;
  description: string;
  lat: number;
  lng: number;
}

export interface NPWSFacility {
  id: number;
  name: string;
  subtype: string;
  branch: string;
  lga: string;
  comments: string;
  lat: number;
  lng: number;
}

export interface RecentPark {
  id: number;
  name: string;
  type: string;
  suburb: string;
}
