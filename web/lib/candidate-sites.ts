/** Candidate empty parcels — OSM open land via API, with local fallback. */

import { API_BASE } from "@/lib/flags";

export interface CandidateSite {
  id: string;
  label: string;
  kind?: string;
  center: { lng: number; lat: number };
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

const LABELS = ["A", "B", "C", "D", "E"] as const;

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
    return {
      id,
      label,
      kind: "approx",
      center: { lng: clng, lat: clat },
      polygon: rectPolygon(clng, clat, off.w, off.h, { id, label, kind: "approx" }),
    };
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
        sites: data.sites,
        note:
          data.note ??
          "OSM open land / parking — not buildings or roads.",
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
