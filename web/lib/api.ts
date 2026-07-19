import { API_BASE } from "@/lib/flags";
import type {
  Briefing,
  BuildingType,
  Comparison,
  Hvac,
  LoadProfileInfo,
  Memo,
  Structure,
  YearBriefing,
} from "@/lib/types";

export interface OptionOverrides {
  structure_a: Structure;
  hvac_a: Hvac;
  structure_b: Structure;
  hvac_b: Hvac;
}

// When Auth0 is on, API calls carry the SDK-minted access token so the
// backend can verify identity itself (AUTH0_AUDIENCE mode). Cached briefly.
let cachedToken: { value: string; until: number } | null = null;

async function authHeader(): Promise<Record<string, string>> {
  if (process.env.NEXT_PUBLIC_FLAG_AUTH0 !== "true") return {};
  const now = Date.now();
  if (cachedToken && cachedToken.until > now) {
    return { authorization: `Bearer ${cachedToken.value}` };
  }
  try {
    const res = await fetch("/auth/access-token");
    if (!res.ok) return {};
    const data = (await res.json()) as { token?: string };
    if (!data.token) return {};
    cachedToken = { value: data.token, until: now + 30_000 };
    return { authorization: `Bearer ${data.token}` };
  } catch {
    return {};
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function fetchComparison(
  buildingType: BuildingType,
  rooms: number,
  scenario: string,
  overrides?: OptionOverrides,
): Promise<Comparison> {
  return post<Comparison>("/compare", {
    building_type: buildingType,
    rooms,
    scenario,
    ...overrides,
  });
}

export function fetchMemo(
  buildingType: BuildingType,
  rooms: number,
  scenario: string,
  overrides?: OptionOverrides,
  auth0Sub?: string,
): Promise<Memo> {
  return post<Memo>("/memo", {
    building_type: buildingType,
    rooms,
    scenario,
    ...overrides,
    ...(auth0Sub ? { auth0_sub: auth0Sub } : {}),
  });
}

export function fetchBriefing(
  buildingType: BuildingType,
  rooms: number,
  scenario: string,
  overrides?: OptionOverrides,
  auth0Sub?: string,
): Promise<Briefing> {
  return post<Briefing>("/briefing", {
    building_type: buildingType,
    rooms,
    scenario,
    ...overrides,
    ...(auth0Sub ? { auth0_sub: auth0Sub } : {}),
  });
}

export function fetchYearBriefing(
  buildingType: BuildingType,
  rooms: number,
  overrides?: OptionOverrides,
  auth0Sub?: string,
  site?: { lat: number; lng: number; name?: string; acres?: number },
  planning?: { storeys?: number; shape?: string },
  forceRefresh?: boolean,
): Promise<YearBriefing> {
  return post<YearBriefing>("/briefing/year", {
    building_type: buildingType,
    rooms,
    ...overrides,
    ...(auth0Sub ? { auth0_sub: auth0Sub } : {}),
    ...(site
      ? {
          lat: site.lat,
          lng: site.lng,
          ...(site.name ? { site_name: site.name } : {}),
          ...(site.acres != null && site.acres > 0 ? { acres: site.acres } : {}),
        }
      : {}),
    ...(planning?.storeys != null ? { storeys: planning.storeys } : {}),
    ...(planning?.shape ? { shape: planning.shape } : {}),
    ...(forceRefresh ? { force_refresh: true } : {}),
  });
}

export function fetchProfiles(): Promise<Record<string, LoadProfileInfo>> {
  return get<Record<string, LoadProfileInfo>>("/profiles");
}

export interface PastRun {
  id: string;
  ts: string;
  scenario: string;
  building_type: string;
  rooms: number;
  structure_a?: string;
  hvac_a?: string;
  structure_b?: string;
  hvac_b?: string;
  recommended: string;
  abatement_cost: number | null;
  tco2e_delta: number | null;
  capex_delta: number | null;
  narrative_generator?: string | null;
  fallback_reason?: string | null;
  briefing_generator?: string | null;
  briefing_fallback_reason?: string | null;
  agent_source_statuses: string[];
  honesty_note: string;
  kind: string;
  has_report?: boolean;
  flip_scenarios?: string[];
  worst_peak_scenario?: string | null;
}

/** Reopenable blob stored on newer runs (year_pack / briefing / memo). */
export type PastRunReport =
  | {
      kind: "year_pack";
      scenarios: YearBriefing["scenarios"];
      matrix_summary: YearBriefing["matrix_summary"];
      briefs: YearBriefing["briefs"];
      synthesis: YearBriefing["synthesis"];
      memo: Memo;
      generator: string;
      fallback_reason?: string | null;
      comparison: Comparison;
      climate?: YearBriefing["climate"];
      ai_energy?: YearBriefing["ai_energy"];
    }
  | {
      kind: "briefing";
      comparison: Comparison;
      briefs: Briefing["briefs"];
      synthesis: Briefing["synthesis"];
      generator: string;
      fallback_reason?: string | null;
      ai_energy?: Briefing["ai_energy"];
    }
  | {
      kind: "memo";
      memo: Memo;
    };

export interface PastRunDetail extends PastRun {
  report: PastRunReport | null;
}

export function fetchMyRuns(
  auth0Sub: string,
): Promise<{ available: boolean; runs: PastRun[]; note?: string }> {
  return get(`/runs/mine?auth0_sub=${encodeURIComponent(auth0Sub)}`);
}

export function fetchRun(
  runId: string,
  auth0Sub: string,
): Promise<PastRunDetail> {
  return get(
    `/runs/${encodeURIComponent(runId)}?auth0_sub=${encodeURIComponent(auth0Sub)}`,
  );
}

/** Upsert Auth0 profile into MongoDB InnSight.auth (signup / login sync). */
export function syncAuthUser(user: {
  sub: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  role?: string | null;
}): Promise<{ saved: boolean; upserted?: boolean; reason?: string }> {
  return post("/users/upsert", {
    sub: user.sub,
    email: user.email ?? null,
    name: user.name ?? null,
    picture: user.picture ?? null,
    role: user.role ?? null,
  });
}

export interface ChatReply {
  reply: string;
  citations: string[];
  generator: string;
  fallback_reason?: string | null;
}

/** App-scoped chat grounded on handbook + optional live memo. */
export function sendChatMessage(body: {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  memo?: Memo;
  briefs?: Briefing["briefs"] | YearBriefing["briefs"];
  synthesis?: Briefing["synthesis"] | YearBriefing["synthesis"];
  site?: { name?: string; lat?: number; lng?: number };
}): Promise<ChatReply> {
  return post<ChatReply>("/chat", body);
}
