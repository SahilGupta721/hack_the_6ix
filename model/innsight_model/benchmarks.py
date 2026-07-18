"""Every numeric constant INNSIGHT uses, with its source.

Rules (PRD engineering rule 1):
- Each constant is a Benchmark record carrying value, unit, source URL, and note.
- Values that could not be tied to a published source are estimate=True and
  render as estimates in the memo. No orphan numbers anywhere in the product.
- The memo engine builds its footnotes directly from these records.

Provisional values are being cross-checked by the research pass; a record is
only estimate=False once a URL that states the number is attached.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Benchmark:
    key: str
    value: float
    unit: str
    source: str
    note: str
    estimate: bool = False


_REGISTRY: dict[str, Benchmark] = {}


def _b(
    key: str,
    value: float,
    unit: str,
    source: str,
    note: str,
    estimate: bool = False,
) -> Benchmark:
    bm = Benchmark(key, value, unit, source, note, estimate)
    _REGISTRY[key] = bm
    return bm


def get(key: str) -> Benchmark:
    return _REGISTRY[key]


def all_benchmarks() -> dict[str, Benchmark]:
    return dict(_REGISTRY)


# ---------------------------------------------------------------------------
# Energy use intensity (CBECS 2018 lodging)
# ---------------------------------------------------------------------------

EUI_LODGING_TOTAL = _b(
    "eui_lodging_total",
    100.0,
    "kBtu/sqft/yr",
    "https://www.eia.gov/consumption/commercial/data/2018/",
    "ESTIMATE pending research pass: CBECS 2018 lodging mean site EUI, exact table ref to follow.",
    estimate=True,
)

EUI_LODGING_ELECTRICITY_SHARE = _b(
    "eui_lodging_electricity_share",
    0.55,
    "fraction of site energy",
    "https://www.eia.gov/consumption/commercial/data/2018/",
    "ESTIMATE pending research pass: electricity share of lodging site energy.",
    estimate=True,
)

HOTEL_BASE_LOAD_SHARE = _b(
    "hotel_base_load_share",
    0.60,
    "fraction",
    "https://www.eia.gov/consumption/commercial/data/2018/",
    "ESTIMATE pending research pass: occupancy-independent share of hotel energy "
    "(literature: hotel energy correlates weakly with occupancy).",
    estimate=True,
)

EUI_TYPE_FACTOR = {
    "homestay": _b(
        "eui_factor_homestay",
        0.80,
        "multiplier on lodging EUI",
        "",
        "ESTIMATE pending research pass: residential-style operation, no "
        "commercial kitchen or laundry.",
        estimate=True,
    ),
    "boutique": _b(
        "eui_factor_boutique",
        1.30,
        "multiplier on lodging EUI",
        "",
        "ESTIMATE pending research pass: full-service boutique with F&B and "
        "on-site laundry runs above the lodging mean.",
        estimate=True,
    ),
    "tower": _b(
        "eui_factor_tower",
        1.00,
        "multiplier on lodging EUI",
        "",
        "ESTIMATE pending research pass: scale efficiency offsets full service.",
        estimate=True,
    ),
}

HOMESTAY_BASE_LOAD_SHARE = _b(
    "homestay_base_load_share",
    0.25,
    "fraction",
    "",
    "ESTIMATE: small residential-style operation; most load follows guests "
    "(cooking, showers, room conditioning). Reasoned from residential load studies.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Building sizing
# ---------------------------------------------------------------------------

SQFT_PER_ROOM = {
    "homestay": _b(
        "sqft_per_room_homestay",
        450.0,
        "gross sqft/room",
        "",
        "ESTIMATE: converted residential house, shared common space.",
        estimate=True,
    ),
    "boutique": _b(
        "sqft_per_room_boutique",
        650.0,
        "gross sqft/room",
        "",
        "ESTIMATE pending research pass: boutique/full-service gross area per key "
        "including lobby, F&B, back of house.",
        estimate=True,
    ),
    "tower": _b(
        "sqft_per_room_tower",
        520.0,
        "gross sqft/room",
        "",
        "ESTIMATE pending research pass: high-rise efficiency of scale.",
        estimate=True,
    ),
}

FLOORS_BY_TYPE = {
    "homestay": 3,
    "boutique": 8,
    "tower": 30,
}

# ---------------------------------------------------------------------------
# Ontario prices and emission factors
# ---------------------------------------------------------------------------

ELEC_RATE_BLENDED = _b(
    "elec_rate_blended",
    0.16,
    "$/kWh",
    "https://www.oeb.ca/consumer-information-and-protection/electricity-rates",
    "ESTIMATE pending research pass: effective commercial rate including energy, "
    "delivery, and regulatory charges for a hospitality profile.",
    estimate=True,
)

DEMAND_CHARGE_PER_KW_MONTH = _b(
    "demand_charge_per_kw_month",
    10.5,
    "$/kW/month",
    "https://www.torontohydro.com/business/rates",
    "ESTIMATE pending research pass: Toronto Hydro general-service demand-based "
    "delivery charge.",
    estimate=True,
)

ELEC_RATE_ON_PEAK = _b(
    "elec_rate_on_peak",
    0.158,
    "$/kWh",
    "https://www.oeb.ca/consumer-information-and-protection/electricity-rates",
    "ESTIMATE pending research pass: OEB TOU on-peak rate.",
    estimate=True,
)

GAS_RATE = _b(
    "gas_rate",
    0.50,
    "$/m3",
    "https://www.enbridgegas.com/residential/my-account/rates",
    "ESTIMATE pending research pass: Enbridge delivered total (commodity + "
    "delivery + storage) for Toronto commercial service.",
    estimate=True,
)

WATER_RATE = _b(
    "water_rate",
    4.50,
    "$/m3",
    "https://www.toronto.ca/services-payments/water-environment/",
    "ESTIMATE pending research pass: Toronto commercial water rate.",
    estimate=True,
)

GRID_INTENSITY_AVG = _b(
    "grid_intensity_avg",
    32.0,
    "gCO2e/kWh",
    "https://www.electricitymaps.com/",
    "ESTIMATE pending research pass: Ontario annual average, low thanks to "
    "nuclear + hydro.",
    estimate=True,
)

GRID_INTENSITY_PEAK = _b(
    "grid_intensity_peak",
    450.0,
    "gCO2e/kWh",
    "https://www.ieso.ca/power-data",
    "ESTIMATE pending research pass: marginal intensity when gas peakers set "
    "the margin on hot afternoons.",
    estimate=True,
)

GAS_EMISSION_FACTOR = _b(
    "gas_emission_factor",
    1.92,
    "kgCO2e/m3",
    "https://publications.gc.ca/site/eng/9.506002/publication.html",
    "ESTIMATE pending research pass: ECCC National Inventory Report natural gas "
    "combustion factor.",
    estimate=True,
)

GAS_ENERGY_CONTENT = _b(
    "gas_energy_content",
    35.7,
    "MJ/m3",
    "",
    "ESTIMATE pending research pass: higher heating value of pipeline natural gas.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Embodied carbon (structure, cradle-to-gate A1-A3)
# ---------------------------------------------------------------------------

EMBODIED_CARBON = {
    "concrete": _b(
        "embodied_concrete",
        400.0,
        "kgCO2e/m2 GFA",
        "https://buildingtransparency.org/",
        "ESTIMATE pending research pass: mid-rise reinforced concrete frame, "
        "A1-A3 range midpoint.",
        estimate=True,
    ),
    "mass_timber": _b(
        "embodied_mass_timber",
        220.0,
        "kgCO2e/m2 GFA",
        "https://buildingtransparency.org/",
        "ESTIMATE pending research pass: CLT/glulam frame excluding biogenic "
        "storage credit (credit noted separately in memo).",
        estimate=True,
    ),
    "steel": _b(
        "embodied_steel",
        450.0,
        "kgCO2e/m2 GFA",
        "https://buildingtransparency.org/",
        "ESTIMATE pending research pass: steel frame mid-rise, A1-A3 midpoint.",
        estimate=True,
    ),
}

BUILDING_LIFE_YEARS = _b(
    "building_life_years",
    60.0,
    "years",
    "",
    "Standard reference study period for whole-building LCA (RICS/CLF convention).",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Construction cost (Toronto, hard cost)
# ---------------------------------------------------------------------------

CONSTRUCTION_COST_PER_SQFT = {
    "homestay": _b(
        "cost_sqft_homestay",
        280.0,
        "$/sqft",
        "",
        "ESTIMATE pending research pass: low-rise conversion-grade build, Toronto.",
        estimate=True,
    ),
    "boutique": _b(
        "cost_sqft_boutique",
        420.0,
        "$/sqft",
        "",
        "ESTIMATE pending research pass: Altus-guide mid-rise full-service hotel "
        "range midpoint, Toronto.",
        estimate=True,
    ),
    "tower": _b(
        "cost_sqft_tower",
        480.0,
        "$/sqft",
        "",
        "ESTIMATE pending research pass: high-rise hotel, Toronto.",
        estimate=True,
    ),
}

STRUCTURE_COST_FACTOR = {
    "concrete": _b(
        "cost_factor_concrete",
        1.00,
        "multiplier",
        "",
        "Baseline structural system.",
    ),
    "mass_timber": _b(
        "cost_factor_mass_timber",
        1.01,
        "multiplier",
        "",
        "ESTIMATE pending research pass: mass-timber premium vs concrete; "
        "published mid-rise comparisons run 0-5% with documented near-parity "
        "case studies once schedule savings are counted.",
        estimate=True,
    ),
    "steel": _b(
        "cost_factor_steel",
        1.03,
        "multiplier",
        "",
        "ESTIMATE: steel-frame premium for this typology.",
        estimate=True,
    ),
}

HVAC_CAPEX_PREMIUM_HEAT_PUMP = _b(
    "hvac_capex_premium_heat_pump",
    6.0,
    "$/sqft",
    "",
    "ESTIMATE pending research pass: incremental capex of a heat-pump plant vs "
    "gas boiler + chiller for mid-rise hospitality, net of avoided gas "
    "infrastructure.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# HVAC performance
# ---------------------------------------------------------------------------

HEAT_PUMP_COP = _b(
    "heat_pump_cop",
    3.0,
    "COP (seasonal)",
    "",
    "ESTIMATE pending research pass: cold-climate air-source heat pump seasonal COP.",
    estimate=True,
)

GAS_BOILER_EFFICIENCY = _b(
    "gas_boiler_efficiency",
    0.82,
    "fraction",
    "",
    "ESTIMATE: seasonal efficiency of a code-minimum central gas plant "
    "(baseline Option A).",
    estimate=True,
)

COOLING_BALANCE_POINT_C = _b(
    "cooling_balance_point_c",
    18.0,
    "degC",
    "",
    "ESTIMATE: outdoor temperature above which cooling load grows roughly "
    "linearly (ASHRAE degree-day convention uses 18 C).",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Water
# ---------------------------------------------------------------------------

WATER_PER_OCCUPIED_ROOM_NIGHT = _b(
    "water_per_occupied_room_night",
    0.5,
    "m3/occupied room-night",
    "",
    "ESTIMATE pending research pass: hotel water studies range roughly "
    "0.2-0.9 m3 per occupied room-night.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Operating assumptions used by the stress engine
# ---------------------------------------------------------------------------

AVG_ANNUAL_OCCUPANCY = _b(
    "avg_annual_occupancy",
    0.65,
    "fraction",
    "",
    "ESTIMATE pending research pass: Toronto hotel market average occupancy "
    "(STR-reported range).",
    estimate=True,
)

COOLING_SHARE_OF_ELECTRICITY = _b(
    "cooling_share_of_electricity",
    0.25,
    "fraction",
    "https://www.eia.gov/consumption/commercial/data/2018/",
    "ESTIMATE pending research pass: cooling share of lodging electricity end use.",
    estimate=True,
)

TORONTO_COOLING_DEGREE_HOURS = _b(
    "toronto_cooling_degree_hours",
    9600.0,
    "degC-hours/yr (base 18 C)",
    "https://climate.weather.gc.ca/climate_normals/",
    "ESTIMATE pending research pass: Toronto cooling degree-days near 400 x 24.",
    estimate=True,
)

COOLING_EER_RATIO_HEAT_PUMP = _b(
    "cooling_eer_ratio_heat_pump",
    1.30,
    "ratio",
    "",
    "ESTIMATE pending research pass: modern VRF/heat-pump cooling efficiency vs "
    "baseline packaged central plant (published EER comparisons run 1.15-1.35).",
    estimate=True,
)

FEEDER_CAPACITY_W_PER_SQFT = {
    "homestay": _b(
        "feeder_capacity_homestay",
        12.0,
        "W/sqft",
        "",
        "ESTIMATE: small buildings carry proportionally larger service margins; "
        "strain classification proxy only, labelled as such in the memo.",
        estimate=True,
    ),
    "boutique": _b(
        "feeder_capacity_boutique",
        8.0,
        "W/sqft",
        "",
        "ESTIMATE: typical mid-rise hospitality service sizing allowance; "
        "strain classification proxy only, labelled as such in the memo.",
        estimate=True,
    ),
    "tower": _b(
        "feeder_capacity_tower",
        7.0,
        "W/sqft",
        "",
        "ESTIMATE: high-rise diversity factor; strain classification proxy only.",
        estimate=True,
    ),
}

PEAK_COOLING_W_PER_SQFT = _b(
    "peak_cooling_w_per_sqft",
    2.5,
    "W(electric)/sqft at design conditions",
    "",
    "ESTIMATE: rule-of-thumb hospitality cooling of one ton per 400 sqft at "
    "COP ~3.5 gives about 2.5 electric W/sqft at the design point.",
    estimate=True,
)

COOLING_DESIGN_DELTA_C = _b(
    "cooling_design_delta_c",
    17.0,
    "degC above balance point",
    "",
    "ESTIMATE: Toronto design dry bulb near 35 C minus 18 C balance point.",
    estimate=True,
)

HVAC_FIXED_PREMIUM_HEAT_PUMP = _b(
    "hvac_fixed_premium_heat_pump",
    25000.0,
    "$",
    "",
    "ESTIMATE: fixed design/equipment floor for a heat-pump plant regardless of "
    "building size (drives honest scale sensitivity).",
    estimate=True,
)

ABATEMENT_THRESHOLD = _b(
    "abatement_threshold",
    170.0,
    "$/tCO2e",
    "https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/carbon-pollution-pricing-federal-benchmark-information.html",
    "Canada's federal carbon-price benchmark reaches $170/tCO2e by 2030; the "
    "recommendation rule funds green premiums up to this implied abatement cost.",
)

ENERGY_PRICE_ESCALATION = _b(
    "energy_price_escalation",
    0.03,
    "fraction/yr",
    "https://www.oeb.ca/",
    "ESTIMATE pending research pass: long-run Ontario electricity price escalation.",
    estimate=True,
)

PAYBACK_HORIZON_YEARS = _b(
    "payback_horizon_years",
    15.0,
    "years",
    "",
    "ESTIMATE: decision horizon for the recommendation rule; typical hospitality "
    "hold/refinance window. Documented in the memo.",
    estimate=True,
)

# Recommendation decision weights (documented in memo; deliberately explicit).
DECISION_WEIGHTS = {
    "cost": _b(
        "weight_cost",
        0.35,
        "weight",
        "",
        "Decision-matrix weight, documented heuristic.",
        estimate=True,
    ),
    "carbon": _b(
        "weight_carbon",
        0.30,
        "weight",
        "",
        "Decision-matrix weight, documented heuristic.",
        estimate=True,
    ),
    "strain": _b(
        "weight_strain",
        0.20,
        "weight",
        "",
        "Decision-matrix weight, documented heuristic.",
        estimate=True,
    ),
    "friction": _b(
        "weight_friction",
        0.15,
        "weight",
        "",
        "Decision-matrix weight, documented heuristic.",
        estimate=True,
    ),
}
