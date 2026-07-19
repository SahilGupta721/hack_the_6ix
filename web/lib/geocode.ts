/** Geocode via INNSIGHT API (Photon + Nominatim) with client cache. */

import { API_BASE } from "@/lib/flags";
import type { AreaBrief } from "@/components/area-brief-panel";

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // west, south, east, north
}

const clientCache = new Map<string, { at: number; hits: GeocodeResult[] }>();
const CLIENT_TTL_MS = 10 * 60 * 1000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return controller.signal;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = q.toLowerCase();
  const cached = clientCache.get(key);
  if (cached && Date.now() - cached.at < CLIENT_TTL_MS) {
    return cached.hits;
  }

  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/geocode?${params}`, {
    signal: withTimeout(signal, 8000),
  });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const hits = (await res.json()) as GeocodeResult[];
  clientCache.set(key, { at: Date.now(), hits });
  return hits;
}

export async function fetchAreaBrief(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<AreaBrief> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const res = await fetch(`${API_BASE}/area/brief?${params}`, {
    signal: withTimeout(signal, 10000),
  });
  if (!res.ok) throw new Error(`area brief failed: ${res.status}`);
  return (await res.json()) as AreaBrief;
}
