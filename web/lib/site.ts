// Demo site: 45 The Esplanade, Toronto. Geometry is illustrative, not a survey.

export interface ActiveSite {
  name: string;
  lng: number;
  lat: number;
  zoom: number;
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

export const SITE = {
  name: "45 The Esplanade",
  projectTitle: "Project: 40-Room Hotel Initiative",
  lng: -79.37361,
  lat: 43.64736,
  zoom: 17.6,
} as const;

// Parcel aligned to the open lot visible on the City of Toronto 2025
// orthophoto beside The Esplanade (corners traced from the 8 cm imagery,
// following the diagonal street grid). Illustrative, not permit-ready.
export const SITE_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: { id: "default", label: SITE.name },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-79.373902, 43.647438],
        [-79.373419, 43.647523],
        [-79.373322, 43.647275],
        [-79.373805, 43.64719],
        [-79.373902, 43.647438],
      ],
    ],
  },
};

export function defaultActiveSite(): ActiveSite {
  return {
    name: SITE.name,
    lng: SITE.lng,
    lat: SITE.lat,
    zoom: SITE.zoom,
    polygon: SITE_POLYGON,
  };
}
