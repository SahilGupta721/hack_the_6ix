/** Candidate empty parcels — OSM open land via API, with local fallback. */

import { API_BASE } from "@/lib/flags";

export interface CandidateSite {
  id: string;
  label: string;
  kind?: string;
  area_m2?: number;
  area_acres?: number;
  center: { lng: number; lat: number };
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

const LABELS = ["A", "B", "C", "D", "E"] as const;
const M2_PER_ACRE = 4046.8564224;

/** Approx acres from a lon/lat polygon (equirectangular). */
export function polygonAreaAcres(
  polygon:
    | GeoJSON.Feature<GeoJSON.Polygon>
    | GeoJSON.Polygon
    | null
    | undefined,
): number {
  if (!polygon) return 0;
  const ring =
    polygon.type === "Feature"
      ? polygon.geometry.coordinates[0]
      : polygon.coordinates[0];
  if (!ring || ring.length < 4) return 0;
  let clng = 0;
  let clat = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    clng += ring[i][0];
    clat += ring[i][1];
  }
  clng /= n;
  clat /= n;
  const cosLat = Math.cos((clat * Math.PI) / 180) || 1e-6;
  const pts: [number, number][] = ring.map(([lng, lat]) => [
    (lng - clng) * 111_320 * cosLat,
    (lat - clat) * 111_320,
  ]);
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  const m2 = Math.abs(a) * 0.5;
  return Math.round((m2 / M2_PER_ACRE) * 1000) / 1000;
}

function withArea(site: CandidateSite): CandidateSite {
  if (site.area_acres != null && site.area_m2 != null) return site;
  const acres = polygonAreaAcres(site.polygon);
  return {
    ...site,
    area_acres: acres,
    area_m2: Math.round(acres * M2_PER_ACRE * 10) / 10,
  };
}

function offsetDegrees(
  lng: number,
  lat: number,
  eastM: number,
  northM: number,
): [number, number] {
  const dLat = northM / 111_320;
  const dLng = eastM / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  return [lng + dLng, lat + dLat];
}

function rectPolygon(
  lng: number,
  lat: number,
  halfW: number,
  halfH: number,
  props: Record<string, string>,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const sw = offsetDegrees(lng, lat, -halfW, -halfH);
  const se = offsetDegrees(lng, lat, halfW, -halfH);
  const ne = offsetDegrees(lng, lat, halfW, halfH);
  const nw = offsetDegrees(lng, lat, -halfW, halfH);
  return {
    type: "Feature",
    properties: props,
    geometry: {
      type: "Polygon",
      coordinates: [[sw, se, ne, nw, sw]],
    },
  };
}

/** Fallback only if OSM returns nothing — offset into a grid, not on the pin. */
const FALLBACK_OFFSETS = [
  { e: 90, n: 60, w: 24, h: 28 },
  { e: -85, n: 70, w: 26, h: 22 },
  { e: 75, n: -80, w: 22, h: 26 },
  { e: -70, n: -75, w: 28, h: 24 },
];

export function generateFallbackSites(
  lng: number,
  lat: number,
  count = 4,
): CandidateSite[] {
  const n = Math.min(Math.max(count, 3), 4);
  return FALLBACK_OFFSETS.slice(0, n).map((off, i) => {
    const [clng, clat] = offsetDegrees(lng, lat, off.e, off.n);
    const id = `candidate-${LABELS[i]}`;
    const label = `Candidate site ${LABELS[i]} (approx.)`;
    return withArea({
      id,
      label,
      kind: "approx",
      center: { lng: clng, lat: clat },
      polygon: rectPolygon(clng, clat, off.w, off.h, {
        id,
        label,
        kind: "approx",
      }),
    });
  });
}

/** @deprecated use fetchEmptySites or generateFallbackSites */
export function generateCandidateSites(
  lng: number,
  lat: number,
  count = 4,
): CandidateSite[] {
  return generateFallbackSites(lng, lat, count);
}

export async function fetchEmptySites(
  lng: number,
  lat: number,
  signal?: AbortSignal,
): Promise<{ sites: CandidateSite[]; note: string; fromOsm: boolean }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: "700",
    limit: "5",
  });
  try {
    const res = await fetch(`${API_BASE}/sites/empty?${params}`, { signal });
    if (!res.ok) throw new Error(`sites ${res.status}`);
    const data = (await res.json()) as {
      sites: CandidateSite[];
      note?: string;
      count: number;
    };
    if (data.sites?.length) {
      return {
        sites: data.sites.map(withArea),
        note:
          data.note ?? "OSM open land / parking — not buildings or roads.",
        fromOsm: true,
      };
    }
  } catch {
    // fall through
  }
  return {
    sites: generateFallbackSites(lng, lat),
    note: "No OSM empty parcels nearby — showing approximate nearby pads (verify on imagery).",
    fromOsm: false,
  };
}

export function candidatesToFeatureCollection(
  sites: CandidateSite[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: sites.map((s) => s.polygon),
  };
}
