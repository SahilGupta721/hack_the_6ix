/** Stress scenarios mirrored from innsight_model.sim.SCENARIOS. */
export const STRESS_SCENARIOS = [
  {
    key: "heatwave_full",
    label: "Heat-wave weekend",
    blurb: "Fully booked · 36.2 C peak (Jul 2026 event)",
  },
  {
    key: "summer_shoulder",
    label: "Summer shoulder",
    blurb: "Busy · ~30 C weekend",
  },
  {
    key: "typical_weekend",
    label: "Typical July",
    blurb: "0.65 occ · mild summer",
  },
  {
    key: "winter_typical",
    label: "Typical winter",
    blurb: "0.70 occ · near 0 C",
  },
  {
    key: "deep_cold_full",
    label: "Deep-cold weekend",
    blurb: "Fully booked · ~−22 C lows",
  },
] as const;

export type StressScenarioKey = (typeof STRESS_SCENARIOS)[number]["key"];

export const DEFAULT_SCENARIO: StressScenarioKey = "heatwave_full";

export function scenarioLabel(key: string): string {
  return STRESS_SCENARIOS.find((s) => s.key === key)?.label ?? key;
}
