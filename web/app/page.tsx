"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { RailThumb } from "@/components/component-icons";
import {
  DesignPanel,
  UI_TYPES,
  type UiBuildingType,
} from "@/components/design-panel";
import { Landing } from "@/components/landing";
import { MemoView } from "@/components/memo-view";
import { PastRunsPanel } from "@/components/past-runs-panel";
import { PhysicsLog } from "@/components/physics-log";
import { ProfilesPanel } from "@/components/profiles-panel";
import { SignInPrompt, type SignInReason } from "@/components/sign-in-prompt";
import { StressView } from "@/components/stress-view";
import { TopBar } from "@/components/top-bar";
import {
  fetchYearBriefing,
  type OptionOverrides,
} from "@/lib/api";
import {
  OPTION_PRESETS,
  deriveHvac,
  deriveStructure,
  structureLog,
  type BuildComponents,
} from "@/lib/build-config";
import { FLAGS } from "@/lib/flags";
import { ENTERED_KEY } from "@/lib/auth0-shared";
import {
  fetchEmptySites,
  generateFallbackSites,
  type CandidateSite,
} from "@/lib/candidate-sites";
import { fetchAreaBrief, type GeocodeResult } from "@/lib/geocode";
import type { AreaBrief } from "@/components/area-brief-panel";
import {
  DEFAULT_SCENARIO,
  type StressScenarioKey,
} from "@/lib/scenarios";
import { defaultActiveSite, type ActiveSite } from "@/lib/site";
import { useAuth } from "@/lib/use-auth";
import type {
  AgentBrief,
  BossSynthesis,
  BuildingType,
  ClimateMeta,
  Comparison,
  MatrixSummary,
  Memo,
  OptionKey,
} from "@/lib/types";

const SiteMap = dynamic(
  () => import("@/components/site-map").then((m) => m.SiteMap),
  { ssr: false },
);

const VoiceController = dynamic(
  () => import("@/components/voice-controller").then((m) => m.VoiceController),
  { ssr: false },
);

const ENGINE_TYPE: Record<UiBuildingType, BuildingType> = {
  hotel: "boutique",
  homestay: "homestay",
  bnb: "homestay",
};

const UI_FLOORS: Record<UiBuildingType, number> = {
  hotel: 8,
  homestay: 3,
  bnb: 3,
};

type Overlay = "none" | "stress" | "memo" | "profiles" | "runs";

// Next.js App Router requires a default export for page files.
export default function HomePage() {
  const auth = useAuth();
  const [entered, setEntered] = useState(false);
  const [signIn, setSignIn] = useState<{ open: boolean; reason: SignInReason }>(
    { open: false, reason: "start" },
  );
  const [placed, setPlaced] = useState(false);
  const [uiType, setUiType] = useState<UiBuildingType>("hotel");
  const [rooms, setRooms] = useState(40);
  const [option, setOption] = useState<OptionKey>("A");
  const [scenario, setScenario] = useState<StressScenarioKey>(DEFAULT_SCENARIO);
  const [componentsByOption, setComponentsByOption] = useState<
    Record<OptionKey, BuildComponents>
  >({ A: { ...OPTION_PRESETS.A }, B: { ...OPTION_PRESETS.B } });
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [yearScenarios, setYearScenarios] = useState<Record<
    string,
    Comparison
  > | null>(null);
  const [matrixSummary, setMatrixSummary] = useState<MatrixSummary | null>(
    null,
  );
  const [climateMeta, setClimateMeta] = useState<ClimateMeta | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [briefs, setBriefs] = useState<Record<string, AgentBrief> | null>(null);
  const [synthesis, setSynthesis] = useState<BossSynthesis | null>(null);
  const [briefingGenerator, setBriefingGenerator] = useState<string | null>(
    null,
  );
  const [briefingFallbackReason, setBriefingFallbackReason] = useState<
    string | null
  >(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  // Default framing stays on the curated, imagery-aligned Esplanade parcel;
  // OSM candidates render as green options and only a click switches to one.
  const [activeSite, setActiveSite] = useState<ActiveSite>(() =>
    defaultActiveSite(),
  );
  const [candidates, setCandidates] = useState<CandidateSite[]>(() => {
    const site = defaultActiveSite();
    return generateFallbackSites(site.lng, site.lat);
  });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [sitesNote, setSitesNote] = useState(
    "Loading empty parcels from OpenStreetMap…",
  );
  const [areaBrief, setAreaBrief] = useState<AreaBrief | null>(null);
  const [areaLoading, setAreaLoading] = useState(false);
  const runToken = useRef(0);

  const enterApp = useCallback(() => {
    sessionStorage.setItem(ENTERED_KEY, "1");
    setEntered(true);
    setSignIn((s) => ({ ...s, open: false }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsEnter = params.get("enter") === "1";
    const wasEntered = sessionStorage.getItem(ENTERED_KEY) === "1";

    if (wantsEnter) {
      if (FLAGS.auth0 && auth.loading) return;
      window.history.replaceState({}, "", "/");
      if (!FLAGS.auth0 || auth.loggedIn) {
        enterApp();
        return;
      }
      setSignIn({ open: true, reason: "start" });
      return;
    }

    // After logout (or expired session), always show landing — never restore the assembler.
    if (FLAGS.auth0) {
      if (auth.loading) return;
      if (!auth.loggedIn) {
        sessionStorage.removeItem(ENTERED_KEY);
        setEntered(false);
        return;
      }
    }

    if (wasEntered) setEntered(true);
  }, [auth.loading, auth.loggedIn, enterApp]);

  const handleGetStarted = useCallback(() => {
    // Don't wait forever on a hung /auth/profile — open sign-in right away.
    if (FLAGS.auth0 && !auth.loggedIn) {
      setSignIn({ open: true, reason: "start" });
      return;
    }
    enterApp();
  }, [auth.loggedIn, enterApp]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-9), line]);
  }, []);

  const invalidate = useCallback(() => {
    runToken.current += 1; // discard any in-flight run for the old parameters
    setComparison(null);
    setYearScenarios(null);
    setMatrixSummary(null);
    setClimateMeta(null);
    setMemo(null);
    setBriefs(null);
    setSynthesis(null);
    setBriefingGenerator(null);
    setBriefingFallbackReason(null);
    if (overlay === "stress" || overlay === "memo") setOverlay("none");
  }, [overlay]);

  const applyEmptySites = useCallback(
    async (
      placeName: string,
      lng: number,
      lat: number,
      zoom = 17.2,
      jumpToFirst = true,
    ) => {
      appendLog(`Finding empty parcels near ${placeName}...`);
      setAreaLoading(true);

      if (jumpToFirst) {
        setActiveSite((prev) => ({
          ...prev,
          name: placeName,
          lng,
          lat,
          zoom,
        }));
      }

      const briefTask = fetchAreaBrief(lat, lng)
        .then((brief) => {
          setAreaBrief(brief);
          setAreaLoading(false);
          appendLog(
            `Area climate: ${brief.climate.weather ?? "—"}, ${brief.climate.temp_c ?? "—"}°C (live Open-Meteo).`,
          );
          return brief;
        })
        .catch(() => {
          setAreaBrief(null);
          setAreaLoading(false);
          return null;
        });

      const { sites, note, fromOsm } = await fetchEmptySites(lng, lat);
      const first = sites[0];
      setCandidates(sites);
      setSitesNote(note);
      if (jumpToFirst) {
        setSelectedCandidateId(first?.id ?? null);
        setActiveSite({
          name: placeName,
          lng: first?.center.lng ?? lng,
          lat: first?.center.lat ?? lat,
          zoom,
          polygon: first?.polygon ?? defaultActiveSite().polygon,
        });
        setPlaced(false);
        invalidate();
      }

      const kinds = [
        ...new Set(
          sites
            .map((s) => s.kind)
            .filter((k): k is string => Boolean(k) && k !== "approx"),
        ),
      ];
      const brief = await briefTask;
      if (brief) {
        setAreaBrief({
          ...brief,
          land: { empty_count: sites.length, kinds },
        });
      }

      appendLog(
        fromOsm
          ? `Found ${sites.length} empty OSM parcels (parking / brownfield / open land); click green to select.`
          : `No OSM empty land nearby; ${sites.length} approximate pads. Check imagery before placing.`,
      );
    },
    [appendLog, invalidate],
  );

  // Load candidate parcels around the default Toronto site without moving
  // the camera off the curated demo framing.
  useEffect(() => {
    if (!entered) return;
    const base = defaultActiveSite();
    void applyEmptySites(base.name, base.lng, base.lat, base.zoom, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  const handlePlace = useCallback(() => {
    setPlaced(true);
    const label =
      candidates.find((c) => c.id === selectedCandidateId)?.label ??
      activeSite.name;
    appendLog(
      `Building massing placed at ${label} (${activeSite.name}) — empty parcel selection.`,
    );
  }, [activeSite.name, appendLog, candidates, selectedCandidateId]);

  const handleSearchPlace = useCallback(
    (place: GeocodeResult) => {
      const shortName =
        place.displayName.split(",")[0]?.trim() || place.displayName;
      void applyEmptySites(shortName, place.lng, place.lat);
    },
    [applyEmptySites],
  );

  const handleSelectCandidate = useCallback(
    (site: CandidateSite) => {
      setSelectedCandidateId(site.id);
      setActiveSite((prev) => ({
        ...prev,
        lng: site.center.lng,
        lat: site.center.lat,
        polygon: site.polygon,
      }));
      setPlaced(false);
      invalidate();
      appendLog(`Selected ${site.label} — open land (not a building/road).`);
    },
    [appendLog, invalidate],
  );

  const handleTypeChange = useCallback(
    (type: UiBuildingType) => {
      const preset = UI_TYPES.find((t) => t.key === type);
      setUiType(type);
      setRooms(preset?.rooms ?? 40);
      invalidate();
      appendLog(`Type set: ${preset?.label ?? type}, ${preset?.rooms ?? 40} rooms.`);
    },
    [appendLog, invalidate],
  );

  const handleRoomsChange = useCallback(
    (value: number) => {
      setRooms(value);
      invalidate();
    },
    [invalidate],
  );

  const handleOptionChange = useCallback(
    (key: OptionKey) => {
      setOption(key);
      appendLog(
        key === "A"
          ? "Option A active: concrete-mass hybrid, central gas plant."
          : "Option B active: mass timber frame, heat pumps.",
      );
    },
    [appendLog],
  );

  const handleComponentChange = useCallback(
    (field: keyof BuildComponents, value: string) => {
      setComponentsByOption((prev) => ({
        ...prev,
        [option]: { ...prev[option], [field]: value },
      }));
      invalidate();
    },
    [invalidate, option],
  );

  const handleRunStressTest = useCallback(async () => {
    if (FLAGS.auth0 && !auth.loggedIn) {
      setSignIn({ open: true, reason: "stress" });
      return;
    }
    const token = ++runToken.current;
    setRunning(true);
    appendLog("Year pack: pulling ERA5 extremes for this site…");
    const engineType = ENGINE_TYPE[uiType];
    const overrides: OptionOverrides = {
      structure_a: deriveStructure(componentsByOption.A),
      hvac_a: deriveHvac(componentsByOption.A),
      structure_b: deriveStructure(componentsByOption.B),
      hvac_b: deriveHvac(componentsByOption.B),
    };
    const auth0Sub = FLAGS.auth0 && auth.sub ? auth.sub : undefined;
    try {
      const year = await fetchYearBriefing(
        engineType,
        rooms,
        overrides,
        auth0Sub,
        {
          lat: activeSite.lat,
          lng: activeSite.lng,
          name: activeSite.name,
        },
      );
      if (runToken.current !== token) return;
      appendLog("Sim matrix ready.");
      const climateSrc = year.climate?.source ?? "benchmark";
      appendLog(
        `Climate curves: ${climateSrc}` +
          (year.climate?.peaks_c?.heatwave_full != null
            ? ` (heat peak ${year.climate.peaks_c.heatwave_full} C)`
            : "") +
          ".",
      );
      setYearScenarios(year.scenarios);
      setMatrixSummary(year.matrix_summary);
      setClimateMeta(year.climate ?? null);
      setComparison(year.comparison);
      setBriefs(year.briefs);
      setSynthesis(year.synthesis);
      setBriefingGenerator(year.generator);
      setBriefingFallbackReason(year.fallback_reason ?? null);
      setMemo(year.memo);
      setOverlay("stress");
      const climate = year.climate;
      if (climate?.heatwave_peak_c != null) {
        appendLog(
          climate.fallback
            ? `Climate fallback: curated pack (peak ${climate.heatwave_peak_c}°C).`
            : `ERA5 site climate: heat peak ${climate.heatwave_peak_c}°C` +
                (climate.deep_cold_floor_c != null
                  ? `, cold floor ${climate.deep_cold_floor_c}°C`
                  : "") +
                ".",
        );
      }
      appendLog(
        `Agents… (${year.generator}): ${Object.keys(year.briefs).length} briefs + year boss.` +
          (year.fallback_reason ? ` Fallback: ${year.fallback_reason}` : ""),
      );
      const flips = year.matrix_summary.flip_scenarios;
      appendLog(
        `Portfolio: baseline ${year.matrix_summary.baseline_recommended}` +
          (flips.length ? `; flips in ${flips.join(", ")}` : "; no flips") +
          `.`,
      );
      appendLog(
        `Portfolio memo ready (${year.memo.narrative.generator}).` +
          (year.memo.narrative.fallback_reason
            ? ` Fallback: ${year.memo.narrative.fallback_reason}`
            : ""),
      );
      if (auth0Sub) {
        appendLog("Year pack saved to your account history.");
      }
    } catch {
      if (runToken.current === token) {
        appendLog("Engine unreachable. Is the API running on port 8000?");
      }
    } finally {
      if (runToken.current === token) setRunning(false);
    }
  }, [
    activeSite.lat,
    activeSite.lng,
    activeSite.name,
    appendLog,
    auth.loggedIn,
    auth.sub,
    componentsByOption,
    rooms,
    uiType,
    activeSite.lat,
    activeSite.lng,
    activeSite.name,
  ]);

  const explainMemo = useCallback(() => {
    if (!memo) {
      return "No memo yet. Run the stress test first and I will walk you through it.";
    }
    return `${memo.narrative.summary} ${memo.narrative.reasoning.join(" ")}`;
  }, [memo]);

  const handleVoiceType = useCallback(
    (type: BuildingType) => {
      setPlaced(true);
      handleTypeChange(type === "homestay" ? "homestay" : "hotel");
    },
    [handleTypeChange],
  );

  const activeComponents = componentsByOption[option];
  const building = placed
    ? {
        structure: deriveStructure(activeComponents),
        floors: UI_FLOORS[uiType],
      }
    : null;

  const optionLabel =
    option === "A"
      ? "Option A: Concrete + Central HVAC"
      : "Option B: Mass Timber + Heat Pumps";
  const logEntries = placed
    ? structureLog(activeComponents, UI_FLOORS[uiType], optionLabel)
    : [];

  if (!entered) {
    return (
      <>
        <Landing onGetStarted={handleGetStarted} />
        <SignInPrompt
          open={signIn.open}
          reason={signIn.reason}
          onClose={() => setSignIn((s) => ({ ...s, open: false }))}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar siteName={activeSite.name} onSearchPlace={handleSearchPlace} />
      {FLAGS.voice && (
        <VoiceController
          onSetOption={handleOptionChange}
          onSetRooms={handleRoomsChange}
          onSetType={handleVoiceType}
          onRunStressTest={handleRunStressTest}
          explainMemo={explainMemo}
        />
      )}
      <div className="relative flex min-h-0 flex-1">
        <IconRail />

        <DesignPanel
          placed={placed}
          siteName={activeSite.name}
          uiType={uiType}
          rooms={rooms}
          option={option}
          components={activeComponents}
          running={running}
          areaBrief={areaBrief}
          areaLoading={areaLoading}
          onPlace={handlePlace}
          onTypeChange={handleTypeChange}
          onRoomsChange={handleRoomsChange}
          onOptionChange={handleOptionChange}
          onComponentChange={handleComponentChange}
          onRunStressTest={handleRunStressTest}
        />

        <main className="relative min-w-0 flex-1">
          <SiteMap
            building={building}
            activeSite={activeSite}
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            sitesNote={sitesNote}
            onSelectCandidate={handleSelectCandidate}
          />
          {(overlay === "stress" || overlay === "memo") && comparison && (
            <div className="absolute inset-0 z-20">
              <StressView
                comparison={comparison}
                active={option}
                onSelect={handleOptionChange}
                onShowMemo={() => memo && setOverlay("memo")}
                memoReady={memo !== null}
                briefs={briefs}
                synthesis={synthesis}
                briefingGenerator={briefingGenerator}
                briefingFallbackReason={briefingFallbackReason}
                matrixSummary={matrixSummary}
                scenarios={yearScenarios}
                focusScenario={scenario}
                siteLat={activeSite.lat}
                siteLng={activeSite.lng}
                climate={climateMeta}
                onFocusScenario={(key) =>
                  setScenario(key as StressScenarioKey)
                }
              />
            </div>
          )}
          {overlay === "memo" && memo && (
            <MemoView
              memo={memo}
              onClose={() => setOverlay("stress")}
              onNeedSignIn={() => setSignIn({ open: true, reason: "export" })}
            />
          )}
          {overlay === "runs" && (
            <PastRunsPanel
              auth0Sub={auth.sub}
              loggedIn={auth.loggedIn}
              onClose={() => setOverlay("none")}
            />
          )}
          {overlay === "profiles" && (
            <ProfilesPanel
              buildingType={ENGINE_TYPE[uiType]}
              onClose={() => setOverlay("none")}
            />
          )}
          {(overlay === "stress" || overlay === "memo") && (
            <button
              type="button"
              onClick={() => setOverlay("none")}
              className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/25 bg-ink/90 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-ink"
            >
              Back to map
            </button>
          )}
          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={() =>
                setOverlay(overlay === "runs" ? "none" : "runs")
              }
              className="rounded border border-panel-border bg-panel/95 px-3 py-2 text-[12px] font-semibold shadow-md backdrop-blur-sm hover:bg-panel-muted"
            >
              Past runs
            </button>
            <button
              type="button"
              onClick={() =>
                setOverlay(overlay === "profiles" ? "none" : "profiles")
              }
              className="rounded border border-panel-border bg-panel/95 px-3 py-2 text-[12px] font-semibold shadow-md backdrop-blur-sm hover:bg-panel-muted"
            >
              Energy load profiles
            </button>
          </div>
        </main>

        {placed ? (
          <PhysicsLog entries={logEntries} runtimeLines={log} />
        ) : (
          <aside className="flex w-72 shrink-0 flex-col border-l border-panel-border bg-panel">
            <div className="border-b border-panel-border px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-soft">
                Activity
              </p>
              <h2 className="text-[14px] font-semibold">Next step</h2>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-[13px] leading-relaxed text-text-soft">
              <p>1. Search a city in the top bar, or keep the Toronto demo.</p>
              <p>2. Click a green empty parcel on the map.</p>
              <p>3. Place the building, then run year stress.</p>
              {log.length > 0 && (
                <ul className="mt-2 space-y-2 border-t border-panel-border pt-3">
                  {log.map((line, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-panel-muted px-2.5 py-2 text-[12px] text-text-strong"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>

      <SignInPrompt
        open={signIn.open}
        reason={signIn.reason}
        onClose={() => setSignIn((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}

function IconRail() {
  return (
    <div className="relative z-10 flex w-11 shrink-0 flex-col items-center gap-2 border-r border-panel-border bg-panel py-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="grid h-8 w-8 place-items-center rounded border border-panel-border bg-panel-muted"
        >
          <RailThumb index={i} />
        </span>
      ))}
    </div>
  );
}
