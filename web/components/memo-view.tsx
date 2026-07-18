"use client";

import { MemoDualLoadChart } from "@/components/memo-dual-load-chart";
import { STRESS_SCENARIOS, scenarioLabel } from "@/lib/scenarios";
import { useAuth } from "@/lib/use-auth";
import type { Memo, MemoOption, PortfolioRow } from "@/lib/types";

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

function strainColour(cls: string): string {
  if (cls === "CRITICAL") return "#b3261e";
  if (cls === "ELEVATED") return "#8a5a00";
  return "#0d7a55";
}

export function MemoView({ memo, onClose, onNeedSignIn }: MemoViewProps) {
  const auth = useAuth();
  const needsLogin = auth.enabled && !auth.loggedIn;
  const needsMfa = auth.enabled && auth.loggedIn && !auth.mfaVerified;
  const isYearPack = memo.kind === "year_pack";

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

  const optionA = memo.options.find((o) => o.key === "A");
  const optionB = memo.options.find((o) => o.key === "B");
  const env = memo.environmental_summary;
  const portfolio = memo.portfolio_table || [];

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 overflow-y-auto bg-[#0b1420]/70 p-5 backdrop-blur-sm print:overflow-visible print:bg-white print:p-0">
      <div
        id="memo-card"
        className="memo-print mx-auto max-w-4xl rounded-lg bg-white p-6 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none"
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

        {/* Screen header */}
        <header className="print:hidden">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-text-strong">
            {memo.title}
          </h1>
          <p className="mt-1 text-[12px] text-text-soft">
            {isYearPack
              ? "Year-pack Green AI memo: carbon, peak grid, and five extreme-weekend stress charts. Figures from the deterministic engine; Export / print includes the charts."
              : `Stress case: ${memo.scenario}. All figures computed by the INN-SIGHT deterministic engine; sources footnoted below.`}
          </p>
        </header>

        {/* Print letterhead */}
        <header className="memo-letterhead hidden print:block">
          <div className="memo-letterhead-row">
            <p className="memo-brand">INN-SIGHT</p>
            <p className="memo-meta">
              {isYearPack
                ? "Green AI · year-pack portfolio memo"
                : "Comparative development memo"}
            </p>
          </div>
          <h1 className="memo-title">{memo.title}</h1>
          <p className="memo-deck">
            {isYearPack
              ? "Five extreme weekends (not 8760h). Carbon and peak-grid outcomes from the deterministic sim; narrative over computed numbers"
              : `Stress case: ${memo.scenario}. Figures from the deterministic engine; narrative over computed numbers`}
            {memo.narrative.generator !== "deterministic-fallback"
              ? ` (${memo.narrative.generator})`
              : ""}
            .
          </p>
        </header>

        {/* Environmental / Green AI strip */}
        {(env || (optionA && optionB)) && (
          <section className="memo-env mt-4 rounded border border-[#c8e6d8] bg-[#f3faf6] p-3.5 print:mt-3 print:break-inside-avoid">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0d7a55]">
              Environmental impact (Green AI track)
            </p>
            <p className="mt-1 text-[11px] leading-snug text-text-soft">
              {env?.climate?.note ||
                env?.note ||
                "Sim is source of truth for tCO2e and peak strain; agents only narrate."}
            </p>
            {env?.climate && (
              <p className="mt-1 text-[10.5px] text-text-soft">
                Climate source:{" "}
                <span className="font-semibold text-text-strong">
                  {env.climate.source}
                </span>
                {env.climate.provider ? ` · ${env.climate.provider}` : ""}
                {env.site?.lat != null && env.site?.lng != null
                  ? ` · site (${env.site.lat.toFixed(4)}, ${env.site.lng.toFixed(4)})`
                  : ""}
                . Not 8760h.
              </p>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
              <EnvStat
                label="Option A tCO2e/yr"
                value={(env?.tco2e_a ?? optionA?.tco2e_per_year.total ?? 0).toFixed(
                  1,
                )}
              />
              <EnvStat
                label="Option B tCO2e/yr"
                value={(env?.tco2e_b ?? optionB?.tco2e_per_year.total ?? 0).toFixed(
                  1,
                )}
              />
              <EnvStat
                label="Δ tCO2e (A−B)"
                value={(
                  env?.tco2e_delta ?? memo.comparison.tco2e_delta
                ).toFixed(1)}
              />
              <EnvStat
                label="Abatement vs $170/t"
                value={
                  (env?.abatement_cost ?? memo.comparison.abatement_cost) == null
                    ? "n/a"
                    : `$${(
                        env?.abatement_cost ?? memo.comparison.abatement_cost!
                      ).toFixed(0)}/t`
                }
              />
            </div>
            {isYearPack && env && (
              <p className="mt-2 text-[11px] text-text-soft">
                Worst peak weekend:{" "}
                <span className="font-semibold text-text-strong">
                  {scenarioLabel(env.worst_peak_scenario || "")}
                </span>
                . Coldest HP feeder stress:{" "}
                <span className="font-semibold text-text-strong">
                  {scenarioLabel(env.coldest_hp_stress_scenario || "")}
                </span>
                .
              </p>
            )}
          </section>
        )}

        {/* Screen option table */}
        <div className="mt-4 overflow-x-auto print:hidden">
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

        {/* Print comparison */}
        {optionA && optionB && (
          <section className="memo-compare hidden print:block">
            <PrintCompare
              a={optionA}
              b={optionB}
              recommended={memo.comparison.recommended}
            />
          </section>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px] print:mt-4 print:gap-3">
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

        {/* Year-pack portfolio + printable stress charts */}
        {isYearPack && portfolio.length > 0 && (
          <YearPackAppendix
            rows={portfolio}
            flipScenarios={memo.matrix_summary?.flip_scenarios || []}
          />
        )}

        <div className="memo-rec mt-4 rounded border border-panel-border bg-panel-muted p-3.5 print:break-inside-avoid">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
            Recommendation
            {memo.narrative.generator !== "deterministic-fallback" && (
              <span className="ml-2 font-normal normal-case tracking-normal">
                narrative by {memo.narrative.generator}
              </span>
            )}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed print:text-[12.5px]">
            {memo.narrative.summary}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-snug print:text-[11.5px]">
            {memo.narrative.reasoning.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="memo-caveats mt-3 text-[11px] leading-snug text-text-soft print:break-inside-avoid">
          <p className="font-semibold uppercase tracking-wider">Caveats</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {memo.narrative.caveats.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="memo-sources mt-4 border-t border-panel-border pt-3 print:mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-soft">
            Sources
          </p>
          <ol className="mt-1.5 space-y-1 text-[10.5px] leading-snug text-text-soft print:columns-2 print:gap-x-5 print:text-[9px]">
            {memo.footnotes.map((f) => (
              <li key={f.index} className="flex gap-1.5 break-inside-avoid">
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
                      className="break-all text-[#1d4ed8] underline print:text-[#334155] print:no-underline"
                    >
                      {f.source}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <footer className="memo-footer hidden print:block">
          <p>
            INN-SIGHT · 45 The Esplanade, Toronto · Green AI stress appendix
            included when year pack · Generated for investor review
          </p>
        </footer>
      </div>
    </div>
  );
}

function YearPackAppendix({
  rows,
  flipScenarios,
}: {
  rows: PortfolioRow[];
  flipScenarios: string[];
}) {
  const flips = new Set(flipScenarios);
  return (
    <section className="memo-year-appendix mt-5 print:mt-6">
      <h2 className="text-[14px] font-semibold text-text-strong">
        Year-pack stress results
      </h2>
      <p className="mt-1 text-[11px] leading-snug text-text-soft">
        Peak feeder load and strain under five extreme 48h weekends. Charts
        print with Export / print; use them for data-driven A/B decisions
        alongside the carbon case above. Not a full 8760h weather year.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-panel-muted text-left">
              <th className="border border-panel-border px-2.5 py-2 font-semibold">
                Scenario
              </th>
              <th className="border border-panel-border px-2.5 py-2 font-semibold">
                A peak / strain
              </th>
              <th className="border border-panel-border px-2.5 py-2 font-semibold">
                B peak / strain
              </th>
              <th className="border border-panel-border px-2.5 py-2 font-semibold">
                Peak Δ (B−A)
              </th>
              <th className="border border-panel-border px-2.5 py-2 font-semibold">
                Pick
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isFlip = flips.has(row.scenario_key);
              const meta = STRESS_SCENARIOS.find((s) => s.key === row.scenario_key);
              const delta = row.peak_kw_b - row.peak_kw_a;
              return (
                <tr
                  key={row.scenario_key}
                  className={isFlip ? "bg-amber-50" : undefined}
                >
                  <td className="border border-panel-border px-2.5 py-2">
                    <span className="font-semibold">{row.scenario_name}</span>
                    {meta && (
                      <span className="mt-0.5 block text-[10px] text-text-soft">
                        {meta.blurb}
                      </span>
                    )}
                  </td>
                  <td
                    className="border border-panel-border px-2.5 py-2 font-medium"
                    style={{ color: strainColour(row.strain_a) }}
                  >
                    {row.peak_kw_a.toFixed(0)} kW · {row.strain_a}
                  </td>
                  <td
                    className="border border-panel-border px-2.5 py-2 font-medium"
                    style={{ color: strainColour(row.strain_b) }}
                  >
                    {row.peak_kw_b.toFixed(0)} kW · {row.strain_b}
                  </td>
                  <td className="border border-panel-border px-2.5 py-2">
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(0)} kW
                  </td>
                  <td className="border border-panel-border px-2.5 py-2 font-semibold">
                    {row.recommended}
                    {isFlip ? " (flip)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="memo-chart-grid mt-4 space-y-4">
        {rows.map((row) => {
          if (!row.hourly_kw_a?.length || !row.hourly_kw_b?.length) return null;
          const meta = STRESS_SCENARIOS.find((s) => s.key === row.scenario_key);
          const isFlip = flips.has(row.scenario_key);
          return (
            <article
              key={`chart-${row.scenario_key}`}
              className="memo-scenario-chart break-inside-avoid rounded border border-panel-border p-3 print:border-[#d0d5dd]"
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-[13px] font-semibold text-text-strong">
                    {meta?.label ?? row.scenario_name}
                  </h3>
                  <p className="text-[10.5px] text-text-soft">
                    {meta?.blurb ?? "48h stress window"} · A{" "}
                    {row.peak_kw_a.toFixed(0)} kW ({row.strain_a}) vs B{" "}
                    {row.peak_kw_b.toFixed(0)} kW ({row.strain_b}) · pick{" "}
                    <strong>{row.recommended}</strong>
                    {isFlip ? " · flip vs heat-wave" : ""}
                  </p>
                </div>
              </div>
              <MemoDualLoadChart
                seriesA={row.hourly_kw_a}
                seriesB={row.hourly_kw_b}
                labelA={`A · ${row.peak_kw_a.toFixed(0)} kW`}
                labelB={`B · ${row.peak_kw_b.toFixed(0)} kW`}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EnvStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#c8e6d8] bg-white px-2.5 py-2">
      <p className="text-[9.5px] uppercase tracking-wider text-[#0d7a55]">
        {label}
      </p>
      <p className="mt-0.5 text-[14px] font-semibold text-text-strong">{value}</p>
    </div>
  );
}

function PrintCompare({
  a,
  b,
  recommended,
}: {
  a: MemoOption;
  b: MemoOption;
  recommended: string;
}) {
  const rows: { label: string; av: string; as?: string; bv: string; bs?: string }[] =
    [
      {
        label: "Construction",
        av: money(a.construction_cost.mid),
        as: `${money(a.construction_cost.low)}–${money(a.construction_cost.high)}`,
        bv: money(b.construction_cost.mid),
        bs: `${money(b.construction_cost.low)}–${money(b.construction_cost.high)}`,
      },
      {
        label: "Annual energy",
        av: money(a.annual_energy_cost.value),
        as: `${Math.round(a.annual_energy_cost.elec_kwh / 1000)} MWh`,
        bv: money(b.annual_energy_cost.value),
        bs: `${Math.round(b.annual_energy_cost.elec_kwh / 1000)} MWh`,
      },
      {
        label: "Annual water",
        av: money(a.annual_water.cost),
        as: `${Math.round(a.annual_water.m3).toLocaleString("en-CA")} m³`,
        bv: money(b.annual_water.cost),
        bs: `${Math.round(b.annual_water.m3).toLocaleString("en-CA")} m³`,
      },
      {
        label: "tCO₂e / year",
        av: a.tco2e_per_year.total.toFixed(1),
        as: `${a.tco2e_per_year.operational.toFixed(1)} op + ${a.tco2e_per_year.embodied_amortized.toFixed(1)} emb`,
        bv: b.tco2e_per_year.total.toFixed(1),
        bs: `${b.tco2e_per_year.operational.toFixed(1)} op + ${b.tco2e_per_year.embodied_amortized.toFixed(1)} emb`,
      },
      {
        label: "Peak grid strain",
        av: a.peak_grid_strain.class,
        as: `${Math.round(a.peak_grid_strain.peak_kw)} kW`,
        bv: b.peak_grid_strain.class,
        bs: `${Math.round(b.peak_grid_strain.peak_kw)} kW`,
      },
      {
        label: "Community friction",
        av: `${a.community_friction.score.toFixed(1)} / 10`,
        as: "heuristic",
        bv: `${b.community_friction.score.toFixed(1)} / 10`,
        bs: "heuristic",
      },
    ];

  return (
    <table className="memo-compare-table">
      <thead>
        <tr>
          <th className="metric">Metric</th>
          <th className={recommended === "A" ? "pick" : undefined}>
            <span className="opt-label">Option A</span>
            {recommended === "A" && <span className="rec-pill">Recommended</span>}
            <span className="opt-sub">
              {a.rooms} rooms · {Math.round(a.floor_area_sqft).toLocaleString("en-CA")}{" "}
              sqft · {a.structure.replace("_", " ")} · {a.hvac.replace("_", " ")}
            </span>
          </th>
          <th className={recommended === "B" ? "pick" : undefined}>
            <span className="opt-label">Option B</span>
            {recommended === "B" && <span className="rec-pill">Recommended</span>}
            <span className="opt-sub">
              {b.rooms} rooms · {Math.round(b.floor_area_sqft).toLocaleString("en-CA")}{" "}
              sqft · {b.structure.replace("_", " ")} · {b.hvac.replace("_", " ")}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="metric">{r.label}</td>
            <td className={recommended === "A" ? "pick" : undefined}>
              <strong>{r.av}</strong>
              {r.as && <span className="sub">{r.as}</span>}
            </td>
            <td className={recommended === "B" ? "pick" : undefined}>
              <strong>{r.bv}</strong>
              {r.bs && <span className="sub">{r.bs}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MemoRow({
  option,
  recommended,
}: {
  option: MemoOption;
  recommended: boolean;
}) {
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
          {option.rooms} rooms,{" "}
          {Math.round(option.floor_area_sqft).toLocaleString("en-CA")} sqft
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
        style={{ color: strainColour(option.peak_grid_strain.class) }}
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
    <div className="memo-kpi rounded border border-panel-border px-2.5 py-2">
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
