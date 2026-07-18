"use client";

import { LoadChart } from "@/components/load-chart";
import { MarketPulse } from "@/components/market-pulse";
import { RenderPanel } from "@/components/render-panel";
import { StrainGauge } from "@/components/strain-gauge";
import { FLAGS } from "@/lib/flags";
import type { Comparison, OptionKey, OptionResult } from "@/lib/types";

interface StressViewProps {
  comparison: Comparison;
  active: OptionKey;
  onSelect: (option: OptionKey) => void;
  onShowMemo: () => void;
  memoReady: boolean;
}

export function StressView({
  comparison,
  active,
  onSelect,
  onShowMemo,
  memoReady,
}: StressViewProps) {
  return (
    <div className="pointer-events-auto flex h-full flex-col bg-[#0b1420]/92 p-4 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white">
          Stress test: {comparison.scenario_name}
        </h2>
        <button
          onClick={onShowMemo}
          className="rounded bg-accent px-3.5 py-2 text-[13px] font-semibold text-ink hover:opacity-90"
        >
          {memoReady ? "View memo" : "Preparing memo..."}
        </button>
      </div>
      {FLAGS.stay22 && (
        <div className="mb-2.5">
          <MarketPulse />
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <OptionColumn
          result={comparison.option_a}
          colour="#e5484d"
          active={active === "A"}
          recommended={comparison.recommended === "A"}
          onSelect={() => onSelect("A")}
        />
        <OptionColumn
          result={comparison.option_b}
          colour="#f5c518"
          active={active === "B"}
          recommended={comparison.recommended === "B"}
          onSelect={() => onSelect("B")}
        />
      </div>
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
      className={`flex flex-col items-center gap-1.5 overflow-y-auto rounded-lg border p-3 text-left transition ${
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
