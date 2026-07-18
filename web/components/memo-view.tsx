"use client";

import { useAuth } from "@/lib/use-auth";
import type { Memo, MemoOption } from "@/lib/types";

interface MemoViewProps {
  memo: Memo;
  onClose: () => void;
  onNeedSignIn?: () => void;
}

function money(v: number): string {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString("en-CA")}`;
}

function Sup({ refs }: { refs: number[] }) {
  return (
    <sup className="ml-0.5 text-[8.5px] text-text-soft">
      {refs.map((r) => `[${r}]`).join("")}
    </sup>
  );
}

export function MemoView({ memo, onClose, onNeedSignIn }: MemoViewProps) {
  const auth = useAuth();
  const needsLogin = auth.enabled && !auth.loggedIn;
  const needsMfa = auth.enabled && auth.loggedIn && !auth.mfaVerified;

  const exportLabel = needsLogin
    ? "Sign in to export"
    : needsMfa
      ? "Verify identity to export (MFA)"
      : "Export / print";

  const handleExport = () => {
    if (needsLogin) {
      onNeedSignIn?.();
      return;
    }
    if (needsMfa) {
      auth.startStepUp();
      return;
    }
    window.print();
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-[#0b1420]/70 p-5 backdrop-blur-sm print:overflow-visible print:bg-white print:p-0">
      <div
        id="memo-card"
        className="mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-2xl print:shadow-none"
      >
        <div className="flex items-start justify-between print:hidden">
          <div />
          <div className="flex gap-2">
            {auth.enabled && auth.mfaVerified && (
              <span className="rounded bg-mint/20 px-2 py-1.5 text-[11px] font-semibold text-[#0d7a55]">
                Identity verified (MFA)
              </span>
            )}
            <button
              onClick={handleExport}
              className="rounded border border-panel-border px-3 py-1.5 text-[12px] font-semibold hover:bg-panel-muted"
            >
              {exportLabel}
            </button>
            <button
              onClick={onClose}
              className="rounded border border-panel-border px-3 py-1.5 text-[12px] font-semibold hover:bg-panel-muted"
            >
              Close
            </button>
          </div>
        </div>

        <h1 className="text-[19px] font-bold tracking-tight">
          {memo.title.toUpperCase()}
        </h1>
        <p className="mt-0.5 text-[12px] text-text-soft">
          Stress case: {memo.scenario}. All figures computed by the INN-SIGHT
          deterministic engine; sources footnoted below.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-panel-muted text-left">
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Option
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Construction cost
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Annual energy cost
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Annual water
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  tCO2e / year
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Peak grid strain
                </th>
                <th className="border border-panel-border px-2.5 py-2 font-semibold">
                  Community friction (1-10)
                </th>
              </tr>
            </thead>
            <tbody>
              {memo.options.map((option) => (
                <MemoRow
                  key={option.key}
                  option={option}
                  recommended={memo.comparison.recommended === option.key}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
          <SummaryCell
            label="Capex premium (B vs A)"
            value={money(memo.comparison.capex_delta)}
          />
          <SummaryCell
            label="Payback on operating savings"
            value={
              memo.comparison.payback_years === null
                ? "does not pay back at current prices"
                : memo.comparison.payback_years === 0
                  ? "no premium to recover"
                  : `~${memo.comparison.payback_years.toFixed(0)} years`
            }
          />
          <SummaryCell
            label="Implied carbon abatement cost"
            value={
              memo.comparison.abatement_cost === null
                ? "n/a"
                : `$${memo.comparison.abatement_cost.toFixed(0)}/tCO2e vs $${memo.comparison.abatement_threshold.toFixed(0)} benchmark`
            }
            refs={memo.comparison.footnotes}
          />
        </div>

        <div className="mt-4 rounded border border-panel-border bg-panel-muted p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
            Recommendation
            {memo.narrative.generator !== "deterministic-fallback" && (
              <span className="ml-2 normal-case tracking-normal">
                narrative by {memo.narrative.generator} over computed figures
              </span>
            )}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed">
            {memo.narrative.summary}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-snug">
            {memo.narrative.reasoning.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-3 text-[11px] leading-snug text-text-soft">
          <p className="font-semibold uppercase tracking-wider">Caveats</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {memo.narrative.caveats.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-4 border-t border-panel-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
            Sources
          </p>
          <ol className="mt-1.5 space-y-1 text-[10.5px] leading-snug text-text-soft">
            {memo.footnotes.map((f) => (
              <li key={f.index} className="flex gap-1.5">
                <span className="shrink-0 font-semibold">[{f.index}]</span>
                <span>
                  {f.estimate && (
                    <span className="mr-1 rounded bg-amber/20 px-1 py-px text-[9px] font-bold text-[#8a5a00]">
                      ESTIMATE
                    </span>
                  )}
                  {f.value} {f.unit}. {f.note}{" "}
                  {f.source && (
                    <a
                      href={f.source}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-[#1d4ed8] underline"
                    >
                      {f.source}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function MemoRow({
  option,
  recommended,
}: {
  option: MemoOption;
  recommended: boolean;
}) {
  const strainColour =
    option.peak_grid_strain.class === "CRITICAL"
      ? "#b3261e"
      : option.peak_grid_strain.class === "ELEVATED"
        ? "#8a5a00"
        : "#0d7a55";
  return (
    <tr className={recommended ? "bg-[#f5c518]/10" : undefined}>
      <td className="border border-panel-border px-2.5 py-2 font-semibold">
        {option.label}
        {recommended && (
          <span className="ml-1.5 rounded bg-mint/20 px-1 py-px text-[9px] font-bold text-[#0d7a55]">
            RECOMMENDED
          </span>
        )}
        <span className="block text-[10px] font-normal text-text-soft">
          {option.rooms} rooms, {Math.round(option.floor_area_sqft).toLocaleString("en-CA")} sqft
        </span>
      </td>
      <td className="border border-panel-border px-2.5 py-2">
        {money(option.construction_cost.mid)}
        <Sup refs={option.construction_cost.footnotes} />
        <span className="block text-[10px] text-text-soft">
          range {money(option.construction_cost.low)} to{" "}
          {money(option.construction_cost.high)}
        </span>
      </td>
      <td className="border border-panel-border px-2.5 py-2">
        {money(option.annual_energy_cost.value)}
        <Sup refs={option.annual_energy_cost.footnotes} />
        <span className="block text-[10px] text-text-soft">
          {Math.round(option.annual_energy_cost.elec_kwh / 1000)} MWh
          {option.annual_energy_cost.gas_m3 > 0 &&
            ` + ${Math.round(option.annual_energy_cost.gas_m3 / 1000)}k m3 gas`}
        </span>
      </td>
      <td className="border border-panel-border px-2.5 py-2">
        {money(option.annual_water.cost)}
        <Sup refs={option.annual_water.footnotes} />
        <span className="block text-[10px] text-text-soft">
          {Math.round(option.annual_water.m3).toLocaleString("en-CA")} m3
        </span>
      </td>
      <td className="border border-panel-border px-2.5 py-2">
        {option.tco2e_per_year.total.toFixed(1)}
        <Sup refs={option.tco2e_per_year.footnotes} />
        <span className="block text-[10px] text-text-soft">
          {option.tco2e_per_year.operational.toFixed(1)} operational +{" "}
          {option.tco2e_per_year.embodied_amortized.toFixed(1)} embodied
        </span>
      </td>
      <td
        className="border border-panel-border px-2.5 py-2 font-semibold"
        style={{ color: strainColour }}
      >
        {option.peak_grid_strain.class}
        <Sup refs={option.peak_grid_strain.footnotes} />
        <span className="block text-[10px] font-normal text-text-soft">
          {Math.round(option.peak_grid_strain.peak_kw)} kW peak
        </span>
      </td>
      <td className="border border-panel-border px-2.5 py-2">
        {option.community_friction.score.toFixed(1)}/10
        <span className="block text-[10px] text-text-soft">
          heuristic, not survey data
        </span>
      </td>
    </tr>
  );
}

function SummaryCell({
  label,
  value,
  refs,
}: {
  label: string;
  value: string;
  refs?: number[];
}) {
  return (
    <div className="rounded border border-panel-border px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-soft">
        {label}
      </p>
      <p className="mt-0.5 font-semibold">
        {value}
        {refs && <Sup refs={refs} />}
      </p>
    </div>
  );
}
