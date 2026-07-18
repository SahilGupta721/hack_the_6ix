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
  lng: -79.3744,
  lat: 43.6476,
  zoom: 17.2,
} as const;

// Illustrative parcel outline around the site centre (not permit-ready).
export const SITE_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: { id: "default", label: SITE.name },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-79.37485, 43.64775],
        [-79.37405, 43.64795],
        [-79.37375, 43.64745],
        [-79.37455, 43.64725],
        [-79.37485, 43.64775],
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
