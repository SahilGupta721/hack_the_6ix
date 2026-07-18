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
import { PhysicsLog } from "@/components/physics-log";
import { ProfilesPanel } from "@/components/profiles-panel";
import { SignInPrompt, type SignInReason } from "@/components/sign-in-prompt";
import { StressView } from "@/components/stress-view";
import { TopBar } from "@/components/top-bar";
import { fetchComparison, fetchMemo, type OptionOverrides } from "@/lib/api";
import {
  OPTION_PRESETS,
  deriveHvac,
  deriveStructure,
  structureLog,
  type BuildComponents,
} from "@/lib/build-config";
import { FLAGS } from "@/lib/flags";
import { useAuth } from "@/lib/use-auth";
import type { BuildingType, Comparison, Memo, OptionKey } from "@/lib/types";

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

const SCENARIO = "heatwave_full";
const ENTERED_KEY = "innsight-entered";

type Overlay = "none" | "stress" | "memo" | "profiles";

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
  const [componentsByOption, setComponentsByOption] = useState<
    Record<OptionKey, BuildComponents>
  >({ A: { ...OPTION_PRESETS.A }, B: { ...OPTION_PRESETS.B } });
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
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

    if (wasEntered) setEntered(true);
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

  const invalidate = useCallback(() => {
    runToken.current += 1; // discard any in-flight run for the old parameters
    setComparison(null);
    setMemo(null);
    if (overlay === "stress" || overlay === "memo") setOverlay("none");
  }, [overlay]);

  const handlePlace = useCallback(() => {
    setPlaced(true);
    appendLog("Building massing placed at 45 The Esplanade (illustrative).");
  }, [appendLog]);

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
    appendLog("Stress test: fully booked heat-wave weekend, 36.2 C peak...");
    const engineType = ENGINE_TYPE[uiType];
    const overrides: OptionOverrides = {
      structure_a: deriveStructure(componentsByOption.A),
      hvac_a: deriveHvac(componentsByOption.A),
      structure_b: deriveStructure(componentsByOption.B),
      hvac_b: deriveHvac(componentsByOption.B),
    };
    try {
      const comparisonPromise = fetchComparison(
        engineType, rooms, SCENARIO, overrides,
      );
      const memoPromise = fetchMemo(engineType, rooms, SCENARIO, overrides);
      const comparisonResult = await comparisonPromise;
      if (runToken.current !== token) return;
      setComparison(comparisonResult);
      setOverlay("stress");
      appendLog(
        `Peak strain: A ${comparisonResult.option_a.strain_class} vs B ${comparisonResult.option_b.strain_class}. Recommended: Option ${comparisonResult.recommended}.`,
      );
      const memoResult = await memoPromise;
      if (runToken.current !== token) return;
      setMemo(memoResult);
      appendLog(`Memo ready (${memoResult.narrative.generator}).`);
    } catch {
      if (runToken.current === token) {
        appendLog("Engine unreachable. Is the API running on port 8000?");
      }
    } finally {
      if (runToken.current === token) setRunning(false);
    }
  }, [appendLog, auth.loggedIn, componentsByOption, rooms, uiType]);

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
        <Landing
          onGetStarted={handleGetStarted}
          busy={FLAGS.auth0 && auth.loading}
        />
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
      <TopBar />
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
        <IconRail placed={placed} />

        <main className="relative min-w-0 flex-1">
          {placed && (
            <div className="absolute left-0 right-0 top-0 z-10 border-b border-panel-border bg-panel/95 px-4 py-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-text-soft">
                Building Assembler - Configure Your Hybrid Structure
              </p>
            </div>
          )}
          <SiteMap building={building} />
          <DesignPanel
            placed={placed}
            uiType={uiType}
            rooms={rooms}
            option={option}
            components={activeComponents}
            running={running}
            onPlace={handlePlace}
            onTypeChange={handleTypeChange}
            onRoomsChange={handleRoomsChange}
            onOptionChange={handleOptionChange}
            onComponentChange={handleComponentChange}
            onRunStressTest={handleRunStressTest}
          />
          {(overlay === "stress" || overlay === "memo") && comparison && (
            <div className="absolute inset-0 z-20">
              <StressView
                comparison={comparison}
                active={option}
                onSelect={handleOptionChange}
                onShowMemo={() => memo && setOverlay("memo")}
                memoReady={memo !== null}
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
          {overlay === "profiles" && (
            <ProfilesPanel
              buildingType={ENGINE_TYPE[uiType]}
              onClose={() => setOverlay("none")}
            />
          )}
          {(overlay === "stress" || overlay === "memo") && (
            <button
              onClick={() => setOverlay("none")}
              className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/25 bg-ink/90 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-ink"
            >
              Back to map
            </button>
          )}
        </main>

        {placed ? (
          <PhysicsLog entries={logEntries} runtimeLines={log} />
        ) : (
          <aside className="flex w-72 shrink-0 flex-col border-l border-panel-border bg-panel">
            <div className="border-b border-panel-border px-4 py-3">
              <h2 className="text-[15px] font-semibold">
                Awaiting Building Design Input
              </h2>
            </div>
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-text-soft">
              Awaiting Building Design Input
            </div>
          </aside>
        )}

        <div className="absolute bottom-3 right-[19.5rem] z-10">
          <button
            onClick={() =>
              setOverlay(overlay === "profiles" ? "none" : "profiles")
            }
            className="rounded border border-panel-border bg-panel px-3 py-2 text-[12px] font-semibold shadow hover:bg-panel-muted"
          >
            Energy Load Profiles
          </button>
        </div>
      </div>

      <SignInPrompt
        open={signIn.open}
        reason={signIn.reason}
        onClose={() => setSignIn((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}

function IconRail({ placed }: { placed: boolean }) {
  return (
    <div className="relative z-10 flex w-12 shrink-0 flex-col items-center gap-2 border-r border-panel-border bg-panel py-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="grid h-9 w-9 place-items-center rounded border border-panel-border bg-panel-muted"
        >
          <RailThumb index={i} />
        </span>
      ))}
      {placed && (
        <span
          className="mt-3 text-[9px] font-medium uppercase tracking-widest text-text-soft"
          style={{ writingMode: "vertical-rl" }}
        >
          Updater metrics updating live
        </span>
      )}
    </div>
  );
}
