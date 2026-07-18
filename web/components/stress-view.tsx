"use client";

import { AgentBriefingPanel } from "@/components/agent-briefing-panel";
import { LoadChart } from "@/components/load-chart";
import { MarketPulse } from "@/components/market-pulse";
import { PixelViewport } from "@/components/pixel-viewport";
import { RenderPanel } from "@/components/render-panel";
import { StrainGauge } from "@/components/strain-gauge";
import { FLAGS } from "@/lib/flags";
import { STRESS_SCENARIOS, scenarioLabel } from "@/lib/scenarios";
import type {
  AgentBrief,
  BossSynthesis,
  ClimateMeta,
  Comparison,
  MatrixSummary,
  OptionKey,
  OptionResult,
} from "@/lib/types";

interface StressViewProps {
  comparison: Comparison;
  active: OptionKey;
  onSelect: (option: OptionKey) => void;
  onShowMemo: () => void;
  memoReady: boolean;
  briefs?: Record<string, AgentBrief> | null;
  synthesis?: BossSynthesis | null;
  briefingGenerator?: string | null;
  briefingFallbackReason?: string | null;
  /** Year-pack matrix; when set, show multi-scenario dashboard. */
  matrixSummary?: MatrixSummary | null;
  scenarios?: Record<string, Comparison> | null;
  focusScenario?: string;
  onFocusScenario?: (key: string) => void;
  siteLat?: number;
  siteLng?: number;
  climate?: ClimateMeta | null;
}

export function StressView({
  comparison,
  active,
  onSelect,
  onShowMemo,
  memoReady,
  briefs,
  synthesis,
  briefingGenerator,
  briefingFallbackReason,
  matrixSummary,
  scenarios,
  focusScenario,
  onFocusScenario,
  siteLat,
  siteLng,
  climate,
}: StressViewProps) {
  const yearMode = Boolean(matrixSummary && scenarios);
  const focusKey = focusScenario ?? "heatwave_full";
  const focusComparison =
    (yearMode && scenarios?.[focusKey]) || comparison;
  const focusMeta = STRESS_SCENARIOS.find((s) => s.key === focusKey);
  const climateLabel =
    climate?.source === "live"
      ? `Open-Meteo archive ${climate.archive_year ?? ""}`.trim()
      : "Toronto benchmark curves";

  return (
    <div className="pointer-events-auto h-full overflow-y-auto bg-[#0b1420]/92 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-white">
            {yearMode
              ? "Year pack stress"
              : `Stress test: ${comparison.scenario_name}`}
          </h2>
          {yearMode && (
            <p className="mt-1 max-w-2xl text-[11px] leading-snug text-white/55">
              Five extreme 48h weekends from {climateLabel} (not a full 8760h
              year). Annual energy stays CBECS averages. Tap a row to focus the
              load charts below.
              {climate?.peaks_c?.heatwave_full != null && (
                <>
                  {" "}
                  Local heat peak {climate.peaks_c.heatwave_full} C
                  {climate.peaks_c.deep_cold_full != null
                    ? `; deep cold ${climate.peaks_c.deep_cold_full} C`
                    : ""}
                  .
                </>
              )}
            </p>
          )}
        </div>
        <button
          onClick={onShowMemo}
          className="shrink-0 rounded bg-accent px-3.5 py-2 text-[13px] font-semibold text-ink hover:opacity-90"
        >
          {memoReady
            ? yearMode
              ? "View year memo"
              : "View memo"
            : "Preparing memo..."}
        </button>
      </div>

      {yearMode && matrixSummary && (
        <MatrixStrip
          matrix={matrixSummary}
          focusKey={focusKey}
          onFocus={(key) => onFocusScenario?.(key)}
          climatePeaks={climate?.peaks_c}
        />
      )}

      {FLAGS.stay22 && (
        <div className="mb-2.5">
          <MarketPulse lat={siteLat} lng={siteLng} />
        </div>
      )}
      {FLAGS.agents && briefs && synthesis && briefingGenerator && (
        <AgentBriefingPanel
          briefs={briefs}
          synthesis={synthesis}
          generator={briefingGenerator}
          fallbackReason={briefingFallbackReason}
        />
      )}
      {yearMode && (
        <p className="mb-2 text-[11px] text-white/55">
          Charts: {scenarioLabel(focusKey)}
          {focusMeta ? ` — ${focusMeta.blurb}` : ""}.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 pb-16 md:grid-cols-2">
        <OptionColumn
          result={focusComparison.option_a}
          colour="#e5484d"
          active={active === "A"}
          recommended={focusComparison.recommended === "A"}
          onSelect={() => onSelect("A")}
        />
        <OptionColumn
          result={focusComparison.option_b}
          colour="#f5c518"
          active={active === "B"}
          recommended={focusComparison.recommended === "B"}
          onSelect={() => onSelect("B")}
        />
      </div>
    </div>
  );
}

function MatrixStrip({
  matrix,
  focusKey,
  onFocus,
  climatePeaks,
}: {
  matrix: MatrixSummary;
  focusKey: string;
  onFocus: (key: string) => void;
  climatePeaks?: Record<string, number>;
}) {
  const flips = new Set(matrix.flip_scenarios || []);
  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-white/15 bg-black/25">
      <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-white/10 text-white/50">
            <th className="px-2 py-1.5 font-medium">Scenario</th>
            <th className="px-2 py-1.5 font-medium">A peak / strain</th>
            <th className="px-2 py-1.5 font-medium">B peak / strain</th>
            <th className="px-2 py-1.5 font-medium">Pick</th>
          </tr>
        </thead>
        <tbody>
          {STRESS_SCENARIOS.map((s) => {
            const peaks = matrix.peak_kw[s.key];
            const strains = matrix.strain[s.key];
            const rec = matrix.recommended_by_scenario[s.key];
            if (!peaks || !strains || !rec) return null;
            const isFocus = focusKey === s.key;
            const isFlip = flips.has(s.key);
            const outdoor = climatePeaks?.[s.key];
            return (
              <tr
                key={s.key}
                onClick={() => onFocus(s.key)}
                className={`cursor-pointer border-b border-white/5 transition ${
                  isFocus ? "bg-accent/15" : "hover:bg-white/5"
                } ${isFlip ? "outline outline-1 outline-offset-[-1px] outline-amber-400/50" : ""}`}
              >
                <td className="px-2 py-1.5">
                  <span className="font-semibold text-white">{s.label}</span>
                  <span className="mt-0.5 block text-[9.5px] font-normal text-white/45">
                    {s.blurb}
                    {outdoor != null ? ` · outdoor peak ${outdoor} C` : ""}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-white/80">
                  {peaks.A.toFixed(0)} kW · {strains.A}
                </td>
                <td className="px-2 py-1.5 text-white/80">
                  {peaks.B.toFixed(0)} kW · {strains.B}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      isFlip
                        ? "bg-amber-400/25 text-amber-200"
                        : "bg-mint/20 text-mint"
                    }`}
                  >
                    {rec}
                    {isFlip ? " flip" : ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-white/10 px-2 py-1.5 text-[9.5px] leading-snug text-white/40">
        Abatement / memo baseline uses the heat-wave weekend figures; picks and
        peaks above are per scenario. Amber = pick differs from heat-wave.
      </p>
    </div>
  );
}

function OptionColumn({
  result,
  colour,
  active,
  recommended,
  onSelect,
}: {
  result: OptionResult;
  colour: string;
  active: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-left transition ${
        active ? "border-accent bg-white/5" : "border-white/15 hover:bg-white/5"
      }`}
    >
      <p className="text-center text-[15px] font-semibold text-white">
        {result.config.label}
        {recommended && (
          <span className="ml-2 rounded bg-mint/20 px-1.5 py-0.5 text-[10px] font-bold text-mint">
            RECOMMENDED
          </span>
        )}
      </p>
      <p className="text-[11px] text-white/60">
        Toronto {result.config.rooms}-room {result.config.building_type} at 45
        The Esplanade
      </p>
      <StrainGauge
        ratio={result.strain_ratio}
        strainClass={result.strain_class}
        peakKw={result.peak_kw}
      />
      {FLAGS.pixel && (
        <PixelViewport
          hourlyKw={result.hourly_kw}
          peakKw={result.peak_kw}
          occupancy={1.0}
          strainClass={result.strain_class}
          rooms={result.config.rooms}
          colour={colour}
        />
      )}
      <div className="w-full">
        <LoadChart
          title="Hospitality load, 48h stress window (kW)"
          colour={colour}
          series={result.hourly_kw.map((kw, hour) => ({ hour, kw }))}
          height={170}
        />
      </div>
      {FLAGS.renders && (
        <RenderPanel option={result.config.label.includes("Option A") ? "A" : "B"} />
      )}
      <div className="grid w-full grid-cols-3 gap-1.5 text-center">
        <Stat
          label="Annual energy"
          value={`$${Math.round(
            (result.annual_energy_cost + result.annual_demand_cost) / 1000,
          )}k`}
        />
        <Stat label="tCO2e/yr" value={result.tco2e_total.toFixed(1)} />
        <Stat
          label="Capex"
          value={`$${(result.construction_cost / 1e6).toFixed(1)}M`}
        />
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/5 px-1 py-1.5">
      <p className="text-[13px] font-semibold text-white">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-white/50">{label}</p>
    </div>
  );
}
