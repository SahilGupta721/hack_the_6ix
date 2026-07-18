"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { DesignPanel } from "@/components/design-panel";
import { MemoView } from "@/components/memo-view";
import { ProfilesPanel } from "@/components/profiles-panel";
import { StressView } from "@/components/stress-view";
import { TopBar } from "@/components/top-bar";
import { fetchComparison, fetchMemo } from "@/lib/api";
import { FLAGS } from "@/lib/flags";
import type { BuildingType, Comparison, Memo, OptionKey } from "@/lib/types";

const SiteMap = dynamic(
  () => import("@/components/site-map").then((m) => m.SiteMap),
  { ssr: false },
);

const VoiceController = dynamic(
  () => import("@/components/voice-controller").then((m) => m.VoiceController),
  { ssr: false },
);

const FLOORS: Record<BuildingType, number> = {
  homestay: 3,
  boutique: 8,
  tower: 30,
};

const SCENARIO = "heatwave_full";

type Overlay = "none" | "stress" | "memo" | "profiles";

// Next.js App Router requires a default export for page files.
export default function HomePage() {
  const [placed, setPlaced] = useState(false);
  const [buildingType, setBuildingType] = useState<BuildingType>("boutique");
  const [rooms, setRooms] = useState(40);
  const [option, setOption] = useState<OptionKey>("A");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const runToken = useRef(0);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-11), line]);
  }, []);

  const invalidate = useCallback(() => {
    setComparison(null);
    setMemo(null);
    if (overlay === "stress" || overlay === "memo") setOverlay("none");
  }, [overlay]);

  const handlePlace = useCallback(() => {
    setPlaced(true);
    appendLog("Building massing placed at 45 The Esplanade (illustrative).");
  }, [appendLog]);

  const handleTypeChange = useCallback(
    (type: BuildingType, defaultRooms: number) => {
      setBuildingType(type);
      setRooms(defaultRooms);
      invalidate();
      appendLog(`Type set: ${type}, ${defaultRooms} rooms.`);
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
          ? "Option A active: concrete frame, central gas plant."
          : "Option B active: mass timber frame, heat pumps.",
      );
    },
    [appendLog],
  );

  const handleRunStressTest = useCallback(async () => {
    const token = ++runToken.current;
    setRunning(true);
    appendLog("Stress test: fully booked heat-wave weekend, 36.2 C peak...");
    try {
      const comparisonPromise = fetchComparison(buildingType, rooms, SCENARIO);
      const memoPromise = fetchMemo(buildingType, rooms, SCENARIO);
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
  }, [appendLog, buildingType, rooms]);

  const explainMemo = useCallback(() => {
    if (!memo) {
      return "No memo yet. Run the stress test first and I will walk you through it.";
    }
    return `${memo.narrative.summary} ${memo.narrative.reasoning.join(" ")}`;
  }, [memo]);

  const handleVoiceType = useCallback(
    (type: BuildingType) => {
      const defaults: Record<BuildingType, number> = {
        homestay: 6,
        boutique: 40,
        tower: 200,
      };
      setPlaced(true);
      handleTypeChange(type, defaults[type]);
    },
    [handleTypeChange],
  );

  const building = placed
    ? {
        structure: option === "A" ? ("concrete" as const) : ("mass_timber" as const),
        floors: FLOORS[buildingType],
      }
    : null;

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
        <DesignPanel
          placed={placed}
          buildingType={buildingType}
          rooms={rooms}
          option={option}
          running={running}
          onPlace={handlePlace}
          onTypeChange={handleTypeChange}
          onRoomsChange={handleRoomsChange}
          onOptionChange={handleOptionChange}
          onRunStressTest={handleRunStressTest}
        />

        <main className="relative min-w-0 flex-1">
          <SiteMap building={building} />
          {overlay === "stress" && comparison && (
            <div className="absolute inset-0 z-10">
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
            <MemoView memo={memo} onClose={() => setOverlay("stress")} />
          )}
          {overlay === "profiles" && (
            <ProfilesPanel
              buildingType={buildingType}
              onClose={() => setOverlay("none")}
            />
          )}
          {overlay !== "none" && overlay !== "profiles" && (
            <button
              onClick={() => setOverlay("none")}
              className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/25 bg-ink/90 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-ink"
            >
              Back to map
            </button>
          )}
        </main>

        <aside className="flex w-72 shrink-0 flex-col border-l border-panel-border bg-panel">
          <div className="border-b border-panel-border px-4 py-3">
            <h2 className="text-[15px] font-semibold">
              {placed ? "Engine Log" : "Awaiting Building Design Input"}
            </h2>
          </div>
          {placed ? (
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {log.map((line, i) => (
                <p
                  key={i}
                  className="border-b border-panel-border pb-2 text-[12px] leading-snug text-text-strong"
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[13px] text-text-soft">
              Place a building on the site to begin.
            </div>
          )}
          <div className="border-t border-panel-border p-3">
            <button
              onClick={() =>
                setOverlay(overlay === "profiles" ? "none" : "profiles")
              }
              className="w-full rounded border border-panel-border px-3 py-2 text-[12px] font-semibold hover:bg-panel-muted"
            >
              Energy Load Profiles
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
