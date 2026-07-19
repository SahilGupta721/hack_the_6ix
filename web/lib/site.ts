// Map framing defaults to downtown Toronto. The old curated Esplanade pad is
// no longer auto-selected — users pick a green OSM empty parcel instead.

export interface ActiveSite {
  name: string;
  lng: number;
  lat: number;
  zoom: number;
  /** Selected parcel outline; null until the user (or OSM jump) picks land. */
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
}

export const SITE = {
  name: "Toronto",
  projectTitle: "Project: 40-Room Hotel Initiative",
  lng: -79.37361,
  lat: 43.64736,
  zoom: 16.4,
} as const;

const SITE_SESSION_KEY = "innsight-active-site";

/** Camera framing only — no gold starter parcel on the map. */
export function mapFrameSite(): ActiveSite {
  return {
    name: SITE.name,
    lng: SITE.lng,
    lat: SITE.lat,
    zoom: SITE.zoom,
    polygon: null,
  };
}

/** @deprecated use mapFrameSite — kept for any leftover imports */
export function defaultActiveSite(): ActiveSite {
  return mapFrameSite();
}

function isLegacyEsplanade(site: ActiveSite): boolean {
  const id = site.polygon?.properties?.id;
  if (id === "default") return true;
  const name = site.name.toLowerCase();
  return name.includes("esplanade") && id !== undefined && !String(id).startsWith("empty-");
}

/** Restore last selected OSM/search site; ignore legacy Esplanade starter. */
export function loadSavedActiveSite(): ActiveSite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SITE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSite;
    if (
      typeof parsed?.lng !== "number" ||
      typeof parsed?.lat !== "number" ||
      typeof parsed?.zoom !== "number"
    ) {
      return null;
    }
    if (isLegacyEsplanade(parsed) || !parsed.polygon) {
      sessionStorage.removeItem(SITE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveSite(site: ActiveSite): void {
  if (typeof window === "undefined") return;
  try {
    if (!site.polygon) {
      sessionStorage.removeItem(SITE_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SITE_SESSION_KEY, JSON.stringify(site));
  } catch {
    // ignore quota / private mode
  }
}
