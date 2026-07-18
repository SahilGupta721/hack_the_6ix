/** Geocode via INNSIGHT API → Nominatim (no browser API key). */

import { API_BASE } from "@/lib/flags";

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // west, south, east, north
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({ q });
  const res = await fetch(`${API_BASE}/geocode?${params}`, { signal });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  return (await res.json()) as GeocodeResult[];
}
