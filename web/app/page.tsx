"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RailThumb } from "@/components/component-icons";
import {
  DesignPanel,
  UI_TYPES,
  type UiBuildingType,
} from "@/components/design-panel";
import { Landing } from "@/components/landing";
import { ChatPanel } from "@/components/chat-panel";
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
  type PastRunDetail,
} from "@/lib/api";
import {
  OPTION_PRESETS,
  deriveHvac,
  deriveStructure,
  optionSummary,
  structureLog,
  type BuildComponents,
} from "@/lib/build-config";
import {
  defaultShapeId,
  defaultStoreys,
  getShape,
  storeysRange,
  type ShapeId,
} from "@/lib/building-shape";
import { FLAGS } from "@/lib/flags";
import { ENTERED_KEY } from "@/lib/auth0-shared";
import {
  fetchEmptySites,
  polygonAreaAcres,
  type CandidateSite,
} from "@/lib/candidate-sites";
import { fetchAreaBrief, type GeocodeResult } from "@/lib/geocode";
import type { AreaBrief } from "@/components/area-brief-panel";
import {
  DEFAULT_SCENARIO,
  type StressScenarioKey,
} from "@/lib/scenarios";
import {
  mapFrameSite,
  loadSavedActiveSite,
  saveActiveSite,
  type ActiveSite,
} from "@/lib/site";
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

type Overlay = "none" | "stress" | "memo" | "profiles" | "runs";

// Next.js App Router requires a default export for page files.
export default function HomePage() {
  const auth = useAuth();
  const [entered, setEntered] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [landingLeaving, setLandingLeaving] = useState(false);
  const [signIn, setSignIn] = useState<{ open: boolean; reason: SignInReason }>(
    { open: false, reason: "start" },
  );
  const [placed, setPlaced] = useState(false);
  const [uiType, setUiType] = useState<UiBuildingType>("hotel");
  const [rooms, setRooms] = useState(40);
  const [storeys, setStoreys] = useState(() => defaultStoreys("hotel"));
  const [shapeId, setShapeId] = useState<ShapeId>(() => defaultShapeId("hotel"));
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
  // Map framing only until a green OSM parcel is selected (no Esplanade starter).
  const [activeSite, setActiveSite] = useState<ActiveSite>(() =>
    loadSavedActiveSite() ?? mapFrameSite(),
  );
  // No hard-coded boot pads: candidates stay empty until the parcel API
  // answers (live OSM -> session cache -> curated -> labelled approx pads).
  const [candidates, setCandidates] = useState<CandidateSite[]>([]);
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
    setSignIn((s) => ({ ...s, open: false }));
    setEntered(true);
  }, []);

  // Landing slides away once the assembler is mounted underneath.
  useEffect(() => {
    if (!entered || !showLanding) return;
    const frame = requestAnimationFrame(() => setLandingLeaving(true));
    const done = window.setTimeout(() => {
      setShowLanding(false);
      setLandingLeaving(false);
    }, 720);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [entered, showLanding]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsEnter = params.get("enter") === "1";

    // Post-Auth0 return from Get Started → drop into the assembler.
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

    // Always show the landing until Get Started — even when already signed in.
    if (FLAGS.auth0) {
      if (auth.loading) return;
      if (!auth.loggedIn) {
        sessionStorage.removeItem(ENTERED_KEY);
        setEntered(false);
        setShowLanding(true);
        setLandingLeaving(false);
      }
    }
  }, [auth.loading, auth.loggedIn, enterApp]);

  const handleGetStarted = useCallback(() => {
    if (FLAGS.auth0 && auth.loading) return;
    if (FLAGS.auth0 && !auth.loggedIn) {
      setSignIn({ open: true, reason: "start" });
      return;
    }
    enterApp();
  }, [auth.loading, auth.loggedIn, enterApp]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-9), line]);
  }, []);

  const handleOpenPastRun = useCallback(
    (detail: PastRunDetail) => {
      const report = detail.report;
      if (!report) return;

      setYearScenarios(null);
      setMatrixSummary(null);
      setClimateMeta(null);
      setComparison(null);
      setBriefs(null);
      setSynthesis(null);
      setBriefingGenerator(null);
      setBriefingFallbackReason(null);
      setMemo(null);

      if (report.kind === "year_pack") {
        setYearScenarios(report.scenarios);
        setMatrixSummary(report.matrix_summary);
        setClimateMeta(report.climate ?? null);
        setComparison(report.comparison);
        setBriefs(report.briefs);
        setSynthesis(report.synthesis);
        setBriefingGenerator(report.generator);
        setBriefingFallbackReason(report.fallback_reason ?? null);
        setMemo(report.memo);
        setOverlay("stress");
        appendLog(
          `Reopened year pack from ${formatRunTs(detail.ts)} (${report.generator}).`,
        );
        return;
      }

      if (report.kind === "briefing") {
        setComparison(report.comparison);
        setBriefs(report.briefs);
        setSynthesis(report.synthesis);
        setBriefingGenerator(report.generator);
        setBriefingFallbackReason(report.fallback_reason ?? null);
        setOverlay("stress");
        appendLog(
          `Reopened briefing from ${formatRunTs(detail.ts)} (${report.generator}).`,
        );
        return;
      }

      setMemo(report.memo);
      setOverlay("memo");
      appendLog(`Reopened memo from ${formatRunTs(detail.ts)}.`);
    },
    [appendLog],
  );

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
          name: first?.label ?? placeName,
          lng: first?.center.lng ?? lng,
          lat: first?.center.lat ?? lat,
          zoom,
          polygon: first?.polygon ?? null,
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
          ? `Found ${sites.length} OSM open-land / parking parcels (may sit a few metres off the 2025 ortho — click imagery to verify).`
          : `No OSM empty land nearby; ${sites.length} approximate pads. Check imagery before placing.`,
      );
    },
    [appendLog, invalidate],
  );

  // Load OSM empty lands. Jump to the first green parcel unless we already
  // restored a saved selection from this tab.
  useEffect(() => {
    if (!entered) return;
    const frame = loadSavedActiveSite() ?? mapFrameSite();
    const jumpToFirst = !frame.polygon;
    void applyEmptySites(
      frame.name,
      frame.lng,
      frame.lat,
      frame.zoom,
      jumpToFirst,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  useEffect(() => {
    saveActiveSite(activeSite);
  }, [activeSite]);

  const handlePlace = useCallback(() => {
    if (!selectedCandidateId || !activeSite.polygon) {
      appendLog("Click a green empty parcel on the map before placing.");
      return;
    }
    setPlaced(true);
    const label =
      candidates.find((c) => c.id === selectedCandidateId)?.label ??
      activeSite.name;
    appendLog(
      `Building massing placed at ${label} — empty parcel selection.`,
    );
  }, [activeSite.name, activeSite.polygon, appendLog, candidates, selectedCandidateId]);

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
        name: site.label,
        lng: site.center.lng,
        lat: site.center.lat,
        polygon: site.polygon,
      }));
      setPlaced(false);
      invalidate();
      const acres =
        site.area_acres != null ? `${site.area_acres} ac` : null;
      appendLog(
        `Selected ${site.label}${acres ? ` · ${acres}` : ""}, open land (not a building/road).`,
      );

      // Climate follows the selected parcel pin (not the original search center).
      setAreaLoading(true);
      void fetchAreaBrief(site.center.lat, site.center.lng)
        .then((brief) => {
          setAreaBrief((prev) => ({
            ...brief,
            land: prev?.land,
          }));
          setAreaLoading(false);
          appendLog(
            `Area climate: ${brief.climate.weather ?? "n/a"}, ${brief.climate.temp_c ?? "n/a"}°C (live Open-Meteo).`,
          );
        })
        .catch(() => {
          setAreaLoading(false);
        });
    },
    [appendLog, invalidate],
  );

  const handleTypeChange = useCallback(
    (type: UiBuildingType) => {
      const preset = UI_TYPES.find((t) => t.key === type);
      setUiType(type);
      setRooms(preset?.rooms ?? 40);
      setStoreys(defaultStoreys(type));
      setShapeId(defaultShapeId(type));
      invalidate();
      appendLog(
        `Type set: ${preset?.label ?? type}, ${preset?.rooms ?? 40} rooms, ${defaultStoreys(type)} storeys.`,
      );
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

  const handleStoreysChange = useCallback(
    (value: number) => {
      const { min, max } = storeysRange(uiType);
      const next = Math.min(max, Math.max(min, value));
      setStoreys(next);
      invalidate();
      appendLog(`Storeys set: ${next} (${getShape(shapeId).label}).`);
    },
    [appendLog, invalidate, shapeId, uiType],
  );

  const handleShapeChange = useCallback(
    (next: ShapeId) => {
      setShapeId(next);
      invalidate();
      appendLog(
        `Shape set: ${getShape(next).label} (room distribution + massing estimate).`,
      );
    },
    [appendLog, invalidate],
  );

  const handleOptionChange = useCallback(
    (key: OptionKey) => {
      setOption(key);
      const summary = optionSummary(componentsByOption[key]);
      appendLog(`Option ${key} active: ${summary}.`);
    },
    [appendLog, componentsByOption],
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
        { storeys, shape: shapeId },
      );
      if (runToken.current !== token) return;
      if (year.from_cache) {
        appendLog(
          `Mongo cache hit: reused prior year pack` +
            (year.cached_run_id ? ` (${year.cached_run_id.slice(0, 8)}…)` : "") +
            " — skipped Gemini re-run.",
        );
      }
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
          (year.fallback_reason ? ` Fallback: ${year.fallback_reason}` : "") +
          (year.from_cache ? " [cached]" : ""),
      );
      const ai = year.ai_energy ?? year.memo.environmental_summary?.ai_inference;
      if (year.from_cache) {
        appendLog(
          year.cache_note ??
            "Reused prior Mongo run with matching fingerprint; agents not re-invoked.",
        );
      } else if (ai && ai.call_count > 0) {
        appendLog(
          `Agent footprint (est.): ${ai.call_count} calls, ${ai.total_tokens.toLocaleString("en-CA")} tokens, ${ai.est_wh.toFixed(3)} Wh, ${ai.est_gco2e.toFixed(3)} gCO2e (${ai.intensity_source} grid).`,
        );
      } else if (ai) {
        appendLog(
          "Agent footprint: no LLM tokens (deterministic stubs / fallback).",
        );
      }
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
      if (auth0Sub && !year.from_cache) {
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
    shapeId,
    storeys,
    uiType,
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
  const building = useMemo(
    () =>
      placed
        ? {
            structure: deriveStructure(activeComponents),
            floors: storeys,
            shapeId,
            components: activeComponents,
          }
        : null,
    [placed, activeComponents, storeys, shapeId],
  );

  const selectedCandidate =
    candidates.find((c) => c.id === selectedCandidateId) ?? null;
  const siteFacts = {
    area_acres:
      selectedCandidate?.area_acres ??
      polygonAreaAcres(activeSite.polygon),
    kind: selectedCandidate?.kind,
  };

  const optionLabel = `Option ${option}: ${optionSummary(activeComponents)}`;
  const logEntries = placed
    ? [
        ...structureLog(activeComponents, storeys, optionLabel),
        {
          kind: "confirm" as const,
          text: `Massing: ${storeys} storeys · ${getShape(shapeId).label} · ${rooms} rooms (distribution estimate)`,
          icon: "frame" as const,
        },
      ]
    : [];

  return (
    <div className="relative h-full overflow-hidden">
      {entered && (
        <div
          className={`app-enter-shell flex h-full flex-col ${
            landingLeaving || !showLanding ? "app-enter-shell--in" : ""
          }`}
        >
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
      <ChatPanel
        memo={memo}
        briefs={briefs}
        synthesis={synthesis}
        siteName={activeSite.name}
        siteLat={activeSite.lat}
        siteLng={activeSite.lng}
      />
      <div className="relative flex min-h-0 flex-1">
        <IconRail />

        <DesignPanel
          placed={placed}
          siteName={activeSite.name}
          canPlace={Boolean(selectedCandidateId && activeSite.polygon)}
          uiType={uiType}
          rooms={rooms}
          storeys={storeys}
          shapeId={shapeId}
          option={option}
          components={activeComponents}
          componentsByOption={componentsByOption}
          running={running}
          areaBrief={areaBrief}
          areaLoading={areaLoading}
          siteFacts={siteFacts}
          onPlace={handlePlace}
          onTypeChange={handleTypeChange}
          onRoomsChange={handleRoomsChange}
          onStoreysChange={handleStoreysChange}
          onShapeChange={handleShapeChange}
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
                storeys={storeys}
                shapeId={shapeId}
                siteName={activeSite.name}
                facadeA={componentsByOption.A.facade}
                facadeB={componentsByOption.B.facade}
                onFocusScenario={(key) =>
                  setScenario(key as StressScenarioKey)
                }
              />
            </div>
          )}
          {overlay === "memo" && memo && (
            <MemoView
              memo={memo}
              onClose={() => setOverlay(comparison ? "stress" : "none")}
              onNeedSignIn={() => setSignIn({ open: true, reason: "export" })}
            />
          )}
          {overlay === "runs" && (
            <PastRunsPanel
              auth0Sub={auth.sub}
              loggedIn={auth.loggedIn}
              onClose={() => setOverlay("none")}
              onOpenRun={handleOpenPastRun}
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
        </div>
      )}

      {showLanding && (
        <div
          className={`landing-layer absolute inset-0 z-40 ${
            landingLeaving ? "landing-layer--exit" : ""
          }`}
        >
          <Landing
            onGetStarted={handleGetStarted}
            busy={FLAGS.auth0 && auth.loading}
          />
        </div>
      )}

      <SignInPrompt
        open={signIn.open}
        reason={signIn.reason}
        onClose={() => setSignIn((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}

function formatRunTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
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
