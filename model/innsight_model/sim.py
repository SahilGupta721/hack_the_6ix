"""Deterministic hospitality stress-test engine.

Pure functions of (BuildingConfig, StressScenario): same inputs, same outputs.
No randomness, no wall clock. All constants come from benchmarks.py and carry
sources; anything heuristic is labelled as such all the way into the memo.

Recommendation rule (documented, rendered in the memo):
1. Compute each option's capex, annual operating cost, and tCO2e/yr
   (operational + embodied amortized).
2. If the greener option is also cheaper overall, recommend it outright.
3. Otherwise compute the implied carbon abatement cost: net lifetime premium
   (capex premium plus any lifetime operating-cost penalty) divided by tonnes
   saved over the RICS 60-year reference life. Recommend the greener option
   only when that cost is at or below Canada's federal 2030 carbon-price
   benchmark ($170/t, sourced). Fixed switching costs and the absence of
   demand-charge savings at small scale are what make this flip honestly
   between a 6-room homestay and a 40-room hotel.

Unit notes: 1 sqft = 0.092903 m2.
"""

from dataclasses import dataclass, field
import math

from . import benchmarks as B
from .load_profiles import get_profile

M2_PER_SQFT = 0.092903

STRUCTURES = ("concrete", "mass_timber", "steel")
HVAC_SYSTEMS = ("central_gas", "heat_pump")


@dataclass(frozen=True)
class BuildingConfig:
    building_type: str  # homestay | boutique | tower
    rooms: int
    structure: str  # concrete | mass_timber | steel
    hvac: str  # central_gas | heat_pump
    label: str = ""

    def __post_init__(self) -> None:
        if self.structure not in STRUCTURES:
            raise ValueError(f"unknown structure: {self.structure}")
        if self.hvac not in HVAC_SYSTEMS:
            raise ValueError(f"unknown hvac: {self.hvac}")
        if self.rooms <= 0:
            raise ValueError("rooms must be positive")


@dataclass(frozen=True)
class StressScenario:
    name: str
    occupancy: float  # 0..1 booked fraction across the stress window
    hourly_temps_c: tuple[float, ...]  # outdoor dry bulb per hour

    def __post_init__(self) -> None:
        if not 0.0 <= self.occupancy <= 1.0:
            raise ValueError("occupancy must be within 0..1")
        if len(self.hourly_temps_c) % 24 != 0:
            raise ValueError("scenario length must be whole days")


@dataclass(frozen=True)
class OptionResult:
    config: BuildingConfig
    scenario_name: str
    floor_area_sqft: float
    # stress window
    hourly_kw: tuple[float, ...]
    peak_kw: float
    strain_ratio: float
    strain_class: str  # STABLE | ELEVATED | CRITICAL
    # annual
    annual_elec_kwh: float
    annual_gas_m3: float
    annual_energy_cost: float
    annual_demand_cost: float
    annual_water_m3: float
    annual_water_cost: float
    annual_operating_cost: float
    tco2e_operational: float
    tco2e_embodied_amortized: float
    tco2e_total: float
    # capital
    construction_cost: float
    construction_cost_low: float
    construction_cost_high: float
    notes: tuple[str, ...] = field(default_factory=tuple)


def floor_area_sqft(config: BuildingConfig) -> float:
    return config.rooms * B.SQFT_PER_ROOM[config.building_type].value


@dataclass(frozen=True)
class _EnergySplit:
    elec_kwh: float  # total annual electricity
    gas_m3: float  # annual natural gas
    hp_heat_elec_kwh: float  # electrified heating load inside elec_kwh


def _annual_energy(config: BuildingConfig) -> _EnergySplit:
    """Annual energy at market-average occupancy, from CBECS hotel means."""
    area = floor_area_sqft(config)
    factor = B.EUI_TYPE_FACTOR[config.building_type].value
    elec_kwh = B.HOTEL_ELEC_INTENSITY.value * factor * area
    gas_m3 = B.HOTEL_GAS_INTENSITY_M3.value * factor * area

    if config.hvac != "heat_pump":
        return _EnergySplit(elec_kwh, gas_m3, 0.0)

    # Fuel loads (space heat + DHW) electrify through the heat pump.
    fuel_kwh = gas_m3 * B.GAS_ENERGY_CONTENT_KWH_M3.value
    delivered_heat_kwh = fuel_kwh * B.GAS_BOILER_EFFICIENCY.value
    hp_heat_elec = delivered_heat_kwh / B.HEAT_PUMP_COP.value
    # Better cooling plant trims the cooling slice of electricity.
    cooling_kwh = elec_kwh * B.COOLING_SHARE_OF_ELECTRICITY.value
    cooling_saved = cooling_kwh * (1.0 - 1.0 / B.COOLING_EER_RATIO_HEAT_PUMP.value)
    return _EnergySplit(elec_kwh + hp_heat_elec - cooling_saved, 0.0, hp_heat_elec)


def _peak_cooling_kw(config: BuildingConfig, temp_c: float) -> float:
    """Electric cooling demand at an outdoor temperature, design-sized."""
    area = floor_area_sqft(config)
    design_kw = area * B.PEAK_COOLING_W_PER_SQFT.value / 1000.0
    if config.hvac == "heat_pump":
        design_kw /= B.COOLING_EER_RATIO_HEAT_PUMP.value
    over = max(0.0, temp_c - B.COOLING_BALANCE_POINT_C.value)
    return design_kw * min(1.15, over / B.COOLING_DESIGN_DELTA_C.value)


def _peak_heating_kw(config: BuildingConfig, temp_c: float) -> float:
    """Electric feeder draw for space heating at an outdoor temperature.

    Heat pumps take the full thermal load / COP. Central gas contributes only
    auxiliary electric (pumps/controls); the gas itself is not feeder load.
    """
    area = floor_area_sqft(config)
    thermal_design_kw = area * B.PEAK_HEATING_W_PER_SQFT.value / 1000.0
    under = max(0.0, B.HEATING_BALANCE_POINT_C.value - temp_c)
    thermal_kw = thermal_design_kw * min(
        1.15, under / B.HEATING_DESIGN_DELTA_C.value
    )
    if config.hvac == "heat_pump":
        return thermal_kw / B.HEAT_PUMP_COP.value
    return thermal_kw * B.GAS_HEATING_AUX_ELECTRIC_FRACTION.value


def _hourly_curve(
    config: BuildingConfig, scenario: StressScenario, energy: _EnergySplit
) -> tuple[float, ...]:
    profile = get_profile(config.building_type)
    base_share = (
        B.HOMESTAY_BASE_LOAD_SHARE.value
        if config.building_type == "homestay"
        else B.HOTEL_BASE_LOAD_SHARE.value
    )
    scenario_mean_temp = sum(scenario.hourly_temps_c) / len(scenario.hourly_temps_c)
    cooling_season = scenario_mean_temp > B.COOLING_BALANCE_POINT_C.value
    heating_season = scenario_mean_temp < B.HEATING_BALANCE_POINT_C.value

    # Summer stress windows drop most electrified space heat; winter keeps it.
    if cooling_season and not heating_season:
        base_elec_kwh = energy.elec_kwh - energy.hp_heat_elec_kwh * (
            1.0 - B.DHW_SHARE_OF_FUEL.value
        )
    else:
        base_elec_kwh = energy.elec_kwh

    avg_kw = base_elec_kwh / 8760.0
    occ_ratio = scenario.occupancy / B.AVG_ANNUAL_OCCUPANCY.value
    non_cooling_avg_kw = avg_kw * (1.0 - B.COOLING_SHARE_OF_ELECTRICITY.value)

    design_cool_kw = floor_area_sqft(config) * B.PEAK_COOLING_W_PER_SQFT.value / 1000.0
    if config.hvac == "heat_pump":
        design_cool_kw /= B.COOLING_EER_RATIO_HEAT_PUMP.value
    floor_kw = (
        design_cool_kw * B.COOLING_INTERNAL_FLOOR.value if cooling_season else 0.0
    )

    curve: list[float] = []
    for hour, temp in enumerate(scenario.hourly_temps_c):
        shape = profile.hourly_shape[hour % 24]
        occupancy_kw = non_cooling_avg_kw * (
            base_share + (1.0 - base_share) * occ_ratio * shape
        )
        cooling_kw = max(_peak_cooling_kw(config, temp), floor_kw) * (
            0.6 + 0.4 * occ_ratio
        )
        heating_kw = _peak_heating_kw(config, temp) * (0.7 + 0.3 * occ_ratio)
        curve.append(round(occupancy_kw + cooling_kw + heating_kw, 4))
    return tuple(curve)


def _day_temps(night_low: float, day_high: float) -> list[float]:
    """Simple diurnal: night low near 5am, day high near 3pm."""
    hours: list[float] = []
    for h in range(24):
        if 5 <= h <= 15:
            t = (h - 5) / 10.0
            hours.append(
                night_low
                + (day_high - night_low) * (0.5 - 0.5 * math.cos(math.pi * t))
            )
        elif h < 5:
            hours.append(
                night_low + (day_high - night_low) * 0.15 * (5 - h) / 5.0
            )
        else:
            t = (h - 15) / 14.0
            hours.append(day_high + (night_low - day_high) * min(1.0, t * 1.2))
    return hours


def _weekend_temps(day1: tuple[float, float], day2: tuple[float, float]) -> tuple[float, ...]:
    return tuple(_day_temps(*day1) + _day_temps(*day2))


def weekend_from_day_extremes(
    day1: tuple[float, float],
    day2: tuple[float, float],
) -> tuple[float, ...]:
    """Build a 48-hour outdoor dry-bulb curve from two (night_low, day_high) days."""
    return _weekend_temps(day1, day2)


def make_stress_scenario(
    name: str,
    occupancy: float,
    day1: tuple[float, float],
    day2: tuple[float, float],
) -> StressScenario:
    return StressScenario(
        name=name,
        occupancy=occupancy,
        hourly_temps_c=weekend_from_day_extremes(day1, day2),
    )


# Toronto stress weekends, hour 0 = Saturday midnight. The heat-wave profile
# peaks at 36.2 C, matching the documented July 14, 2026 Toronto heat event
# (benchmarks.HEATWAVE_EVENT_PEAK_C carries the citation).
_HEATWAVE_TEMPS: tuple[float, ...] = tuple(
    [
        25.0, 24.5, 24.0, 23.5, 23.5, 24.0,
        25.5, 27.0, 29.0, 31.0, 32.5, 33.5,
        34.5, 35.0, 35.5, 35.0, 34.0, 32.5,
        31.0, 29.5, 28.0, 27.0, 26.0, 25.5,
    ]
    + [
        25.5, 25.0, 24.5, 24.0, 24.0, 24.5,
        26.0, 27.5, 29.5, 31.5, 33.0, 34.0,
        35.0, 35.8, 36.2, 35.8, 34.5, 33.0,
        31.5, 30.0, 28.5, 27.5, 26.5, 26.0,
    ]
)

_TYPICAL_TEMPS: tuple[float, ...] = tuple(
    [
        19.0, 18.5, 18.0, 17.5, 17.5, 18.0,
        19.0, 20.5, 22.0, 23.5, 24.5, 25.5,
        26.0, 26.5, 27.0, 26.5, 25.5, 24.5,
        23.5, 22.5, 21.5, 20.5, 20.0, 19.5,
    ]
    * 2
)

_SUMMER_SHOULDER_TEMPS = _weekend_temps((22.0, 29.5), (22.5, 30.0))
_DEEP_COLD_TEMPS = _weekend_temps((-22.0, -12.0), (-21.0, -11.0))
_WINTER_TYPICAL_TEMPS = _weekend_temps((-8.0, -1.0), (-7.0, 0.0))

SCENARIOS: dict[str, StressScenario] = {
    "heatwave_full": StressScenario(
        name="Heat-Wave Weekend + Full Occupancy",
        occupancy=1.0,
        hourly_temps_c=_HEATWAVE_TEMPS,
    ),
    "summer_shoulder": StressScenario(
        name="Summer Shoulder Weekend (~30 C)",
        occupancy=0.85,
        hourly_temps_c=_SUMMER_SHOULDER_TEMPS,
    ),
    "typical_weekend": StressScenario(
        name="Typical July Weekend",
        occupancy=0.65,
        hourly_temps_c=_TYPICAL_TEMPS,
    ),
    "winter_typical": StressScenario(
        name="Typical Winter Weekend",
        occupancy=0.70,
        hourly_temps_c=_WINTER_TYPICAL_TEMPS,
    ),
    "deep_cold_full": StressScenario(
        name="Deep-Cold Weekend + Full Occupancy",
        occupancy=1.0,
        hourly_temps_c=_DEEP_COLD_TEMPS,
    ),
}


def _strain(config: BuildingConfig, peak_kw: float) -> tuple[float, str]:
    capacity_kw = (
        floor_area_sqft(config)
        * B.FEEDER_CAPACITY_W_PER_SQFT[config.building_type].value
        / 1000.0
    )
    ratio = peak_kw / capacity_kw if capacity_kw > 0 else 0.0
    # Bands are a documented proxy (see feeder-capacity benchmark note).
    if ratio >= 0.68:
        cls = "CRITICAL"
    elif ratio >= 0.48:
        cls = "ELEVATED"
    else:
        cls = "STABLE"
    return round(ratio, 4), cls


def _construction(config: BuildingConfig) -> tuple[float, float, float]:
    area = floor_area_sqft(config)
    base = area * B.CONSTRUCTION_COST_PER_SQFT[config.building_type].value
    base *= B.STRUCTURE_COST_FACTOR[config.structure].value
    if config.hvac == "heat_pump":
        base += (
            B.HVAC_FIXED_PREMIUM_HEAT_PUMP.value
            + area * B.HVAC_CAPEX_PREMIUM_HEAT_PUMP.value
        )
    return base, base * 0.85, base * 1.15


def _is_demand_billed(config: BuildingConfig) -> bool:
    """Homestays sit under Toronto Hydro's 50 kW demand-billing threshold."""
    return config.building_type != "homestay"


def run_option(config: BuildingConfig, scenario: StressScenario) -> OptionResult:
    area = floor_area_sqft(config)
    energy = _annual_energy(config)
    curve = _hourly_curve(config, scenario, energy)
    peak = max(curve)
    ratio, strain_class = _strain(config, peak)

    if _is_demand_billed(config):
        elec_rate = B.ELEC_RATE_COMMERCIAL.value
        gas_rate = B.GAS_RATE_COMMERCIAL.value
        # Billing demand: nine shoulder months at the typical-weekend peak,
        # three summer months near the stress peak.
        typical_peak = max(
            _hourly_curve(config, SCENARIOS["typical_weekend"], energy)
        )
        stress_peak = max(_hourly_curve(config, SCENARIOS["heatwave_full"], energy))
        billing_kw = (9.0 * typical_peak + 3.0 * stress_peak) / 12.0
        demand_cost = billing_kw * B.DEMAND_CHARGE_PER_KW_MONTH.value * 12.0
    else:
        elec_rate = B.ELEC_RATE_SMALL.value
        gas_rate = B.GAS_RATE_SMALL.value
        demand_cost = 0.0

    energy_cost = (
        energy.elec_kwh * elec_rate + energy.gas_m3 * gas_rate + demand_cost
    )
    water_m3 = (
        config.rooms
        * 365.0
        * B.AVG_ANNUAL_OCCUPANCY.value
        * B.WATER_PER_OCCUPIED_ROOM_NIGHT.value
    )
    water_cost = water_m3 * B.WATER_RATE.value

    op_tco2e = (
        energy.elec_kwh * B.GRID_INTENSITY_AVG.value / 1e6
        + energy.gas_m3 * B.GAS_EMISSION_FACTOR.value / 1e3
    )
    embodied_total_kg = area * M2_PER_SQFT * B.EMBODIED_CARBON[config.structure].value
    embodied_annual = embodied_total_kg / 1e3 / B.BUILDING_LIFE_YEARS.value

    cost, cost_low, cost_high = _construction(config)

    return OptionResult(
        config=config,
        scenario_name=scenario.name,
        floor_area_sqft=round(area, 1),
        hourly_kw=curve,
        peak_kw=peak,
        strain_ratio=ratio,
        strain_class=strain_class,
        annual_elec_kwh=round(energy.elec_kwh, 1),
        annual_gas_m3=round(energy.gas_m3, 1),
        annual_energy_cost=round(energy_cost - demand_cost, 2),
        annual_demand_cost=round(demand_cost, 2),
        annual_water_m3=round(water_m3, 1),
        annual_water_cost=round(water_cost, 2),
        annual_operating_cost=round(energy_cost + water_cost, 2),
        tco2e_operational=round(op_tco2e, 2),
        tco2e_embodied_amortized=round(embodied_annual, 2),
        tco2e_total=round(op_tco2e + embodied_annual, 2),
        construction_cost=round(cost, 0),
        construction_cost_low=round(cost_low, 0),
        construction_cost_high=round(cost_high, 0),
    )


@dataclass(frozen=True)
class Comparison:
    option_a: OptionResult
    option_b: OptionResult
    scenario_name: str
    capex_delta: float  # B minus A
    annual_cost_delta: float  # A minus B (positive = B saves money yearly)
    tco2e_delta: float  # A minus B (positive = B is cleaner)
    payback_years: float | None  # None when the premium never pays back
    abatement_cost: float | None  # $/tCO2e implied by choosing the greener option
    abatement_threshold: float
    recommended: str  # "A" | "B"
    reasoning: tuple[str, ...]


def _payback_years(capex_delta: float, annual_delta: float) -> float | None:
    if capex_delta <= 0:
        return 0.0
    if annual_delta <= 0:
        return None
    remaining = capex_delta
    savings = annual_delta
    years = 0.0
    while remaining > 0 and years < 100:
        remaining -= savings
        savings *= 1.0 + B.ENERGY_PRICE_ESCALATION.value
        years += 1.0
    return years if years < 100 else None


def compare(
    config_a: BuildingConfig,
    config_b: BuildingConfig,
    scenario: StressScenario,
) -> Comparison:
    ra = run_option(config_a, scenario)
    rb = run_option(config_b, scenario)

    capex_delta = rb.construction_cost - ra.construction_cost
    annual_delta = ra.annual_operating_cost - rb.annual_operating_cost
    tco2e_delta = ra.tco2e_total - rb.tco2e_total
    payback = _payback_years(capex_delta, annual_delta)

    life = B.BUILDING_LIFE_YEARS.value
    threshold = B.ABATEMENT_THRESHOLD.value

    greener = "B" if tco2e_delta > 0 else "A"
    g, o = (rb, ra) if greener == "B" else (ra, rb)
    g_capex_premium = g.construction_cost - o.construction_cost
    g_annual_penalty = g.annual_operating_cost - o.annual_operating_cost
    lifetime_tonnes = abs(tco2e_delta) * life
    net_premium = g_capex_premium + g_annual_penalty * life

    abatement: float | None
    if lifetime_tonnes <= 0:
        abatement = None
    elif net_premium <= 0:
        abatement = 0.0
    else:
        abatement = net_premium / lifetime_tonnes

    if abatement is None:
        # No emissions difference to fund: recommend the cheaper option.
        if capex_delta != 0:
            recommended = "A" if capex_delta > 0 else "B"
        else:
            recommended = "A" if annual_delta <= 0 else "B"
    elif abatement <= threshold:
        recommended = greener
    else:
        recommended = "A" if greener == "B" else "B"

    reasoning: list[str] = [
        f"Capex: A ${ra.construction_cost:,.0f} vs B ${rb.construction_cost:,.0f} "
        f"(B premium ${capex_delta:,.0f}).",
        f"Annual operating cost (energy + demand + water): "
        f"A ${ra.annual_operating_cost:,.0f} vs B ${rb.annual_operating_cost:,.0f}.",
        f"Total carbon: A {ra.tco2e_total:,.1f} vs B {rb.tco2e_total:,.1f} tCO2e/yr "
        f"(operational + embodied amortized over {life:.0f} years).",
        f"Peak grid strain under '{scenario.name}': A {ra.strain_class} "
        f"({ra.peak_kw:,.0f} kW) vs B {rb.strain_class} ({rb.peak_kw:,.0f} kW).",
    ]
    if payback == 0.0:
        reasoning.append("Option B is not more expensive upfront; no payback needed.")
    elif payback is not None:
        reasoning.append(
            f"The premium pays back in about {payback:.0f} years at escalated "
            f"energy prices (a {B.PAYBACK_HORIZON_YEARS.value:.0f}-year hold is "
            f"the typical window)."
        )
    else:
        reasoning.append(
            "The premium does not pay back on operating savings alone at "
            "current Ontario prices; delivered gas heat costs roughly a third "
            "of the equivalent electricity."
        )
    if abatement is not None:
        reasoning.append(
            f"Implied carbon abatement cost of choosing Option {greener}: "
            f"${abatement:,.0f}/tCO2e over the {life:.0f}-year RICS reference "
            f"life, vs the ${threshold:,.0f}/tCO2e federal 2030 benchmark. "
            + (
                "Below the benchmark, so the greener option is the rational pick."
                if abatement <= threshold
                else "Above the benchmark at this scale; the premium is better "
                "deployed elsewhere."
            )
        )
    reasoning.append(f"Recommendation: Option {recommended}.")

    return Comparison(
        option_a=ra,
        option_b=rb,
        scenario_name=scenario.name,
        capex_delta=round(capex_delta, 0),
        annual_cost_delta=round(annual_delta, 2),
        tco2e_delta=round(tco2e_delta, 2),
        payback_years=payback,
        abatement_cost=None if abatement is None else round(abatement, 0),
        abatement_threshold=threshold,
        recommended=recommended,
        reasoning=tuple(reasoning),
    )


def demo_pair(building_type: str, rooms: int) -> tuple[BuildingConfig, BuildingConfig]:
    """The canonical A/B pair: conventional vs low-carbon."""
    return (
        BuildingConfig(
            building_type, rooms, "concrete", "central_gas",
            "Option A: Concrete + Central HVAC",
        ),
        BuildingConfig(
            building_type, rooms, "mass_timber", "heat_pump",
            "Option B: Mass Timber + Heat Pumps",
        ),
    )
