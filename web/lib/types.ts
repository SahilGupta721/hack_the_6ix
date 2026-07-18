export type BuildingType = "homestay" | "boutique" | "tower";
export type Structure = "concrete" | "mass_timber" | "steel";
export type Hvac = "central_gas" | "heat_pump";
export type OptionKey = "A" | "B";
export type StrainClass = "STABLE" | "ELEVATED" | "CRITICAL";

export interface OptionResult {
  scenario_name: string;
  floor_area_sqft: number;
  hourly_kw: number[];
  peak_kw: number;
  strain_ratio: number;
  strain_class: StrainClass;
  annual_elec_kwh: number;
  annual_gas_m3: number;
  annual_energy_cost: number;
  annual_demand_cost: number;
  annual_water_m3: number;
  annual_water_cost: number;
  annual_operating_cost: number;
  tco2e_operational: number;
  tco2e_embodied_amortized: number;
  tco2e_total: number;
  construction_cost: number;
  construction_cost_low: number;
  construction_cost_high: number;
  config: {
    building_type: BuildingType;
    rooms: number;
    structure: Structure;
    hvac: Hvac;
    label: string;
  };
}

export interface Comparison {
  option_a: OptionResult;
  option_b: OptionResult;
  scenario_name: string;
  capex_delta: number;
  annual_cost_delta: number;
  tco2e_delta: number;
  payback_years: number | null;
  abatement_cost: number | null;
  abatement_threshold: number;
  recommended: OptionKey;
  reasoning: string[];
}

export interface Footnote {
  index: number;
  key: string;
  value: number;
  unit: string;
  source: string;
  note: string;
  estimate: boolean;
}

export interface MemoOption {
  key: OptionKey;
  label: string;
  building_type: BuildingType;
  rooms: number;
  structure: Structure;
  hvac: Hvac;
  floor_area_sqft: number;
  construction_cost: {
    low: number;
    mid: number;
    high: number;
    method: string;
    footnotes: number[];
  };
  annual_energy_cost: {
    value: number;
    energy_portion: number;
    demand_portion: number;
    elec_kwh: number;
    gas_m3: number;
    footnotes: number[];
  };
  annual_water: { m3: number; cost: number; footnotes: number[] };
  tco2e_per_year: {
    operational: number;
    embodied_amortized: number;
    total: number;
    footnotes: number[];
    biogenic_note?: string;
  };
  peak_grid_strain: {
    class: StrainClass;
    ratio: number;
    peak_kw: number;
    label: string;
    footnotes: number[];
  };
  community_friction: {
    score: number;
    terms: Record<string, number>;
    label: string;
    formula: string;
  };
}

export interface Memo {
  title: string;
  scenario: string;
  options: MemoOption[];
  comparison: {
    capex_delta: number;
    annual_cost_delta: number;
    tco2e_delta: number;
    payback_years: number | null;
    abatement_cost: number | null;
    abatement_threshold: number;
    recommended: OptionKey;
    footnotes: number[];
  };
  reasoning_chain: string[];
  narrative: {
    summary: string;
    reasoning: string[];
    caveats: string[];
    generator: string;
    fallback_reason?: string;
  };
  footnotes: Footnote[];
  kind?: string;
  portfolio_table?: PortfolioRow[];
  environmental_summary?: {
    tco2e_a: number;
    tco2e_b: number;
    tco2e_delta: number;
    abatement_cost: number | null;
    abatement_threshold: number;
    worst_peak_scenario?: string;
    coldest_hp_stress_scenario?: string;
    note?: string;
    climate?: ClimateMeta;
    site?: { name?: string; lat?: number; lng?: number };
  };
  matrix_summary?: {
    flip_scenarios?: string[];
    worst_peak_scenario?: string;
    coldest_hp_stress_scenario?: string;
    recommended_by_scenario?: Record<string, OptionKey>;
    baseline_recommended?: OptionKey;
  };
}

export interface PortfolioRow {
  scenario_key: string;
  scenario_name: string;
  peak_kw_a: number;
  peak_kw_b: number;
  strain_a: StrainClass;
  strain_b: StrainClass;
  abatement_cost: number | null;
  recommended: OptionKey;
  hourly_kw_a?: number[];
  hourly_kw_b?: number[];
}

export interface LoadProfileInfo {
  label: string;
  character: string;
  hourly_shape: number[];
}

export type SourceStatus =
  | "live"
  | "cached"
  | "benchmark"
  | "heuristic"
  | "estimate";

export interface SourceRef {
  label: string;
  status: SourceStatus;
  url?: string | null;
}

export interface AgentBrief {
  agent_id: string;
  title: string;
  findings: string[];
  metrics: Record<string, unknown>;
  risks: string[];
  sources: SourceRef[];
  confidence: number;
}

export interface BossSynthesis {
  environmental_impact: string[];
  business_impact: string[];
  recommendation_alignment: string;
  reinforces_sim: boolean;
  open_questions: string[];
  summary: string;
}

export interface Briefing {
  comparison: Comparison;
  briefs: Record<string, AgentBrief>;
  synthesis: BossSynthesis;
  generator: string;
  fallback_reason?: string | null;
}

export interface MatrixSummary {
  recommended_by_scenario: Record<string, OptionKey>;
  flip_scenarios: string[];
  peak_kw: Record<string, { A: number; B: number }>;
  strain: Record<string, { A: string; B: string }>;
  abatement: Record<string, number | null>;
  worst_peak_scenario: string;
  coldest_hp_stress_scenario: string;
  baseline_scenario: string;
  baseline_recommended: OptionKey;
}

export interface ClimateMeta {
  source: string;
  provider?: string;
  note?: string;
  url?: string | null;
  archive_year?: number | null;
  lat?: number | null;
  lng?: number | null;
  peaks_c?: Record<string, number>;
  fallback?: boolean;
  heatwave_peak_c?: number;
  deep_cold_floor_c?: number;
  picks?: Record<
    string,
    { dates?: string[]; peak_c?: number; floor_c?: number }
  >;
}

export interface YearBriefing {
  scenarios: Record<string, Comparison>;
  matrix_summary: MatrixSummary;
  briefs: Record<string, AgentBrief>;
  synthesis: BossSynthesis;
  memo: Memo;
  generator: string;
  fallback_reason?: string | null;
  comparison: Comparison;
  climate?: ClimateMeta | null;
}
