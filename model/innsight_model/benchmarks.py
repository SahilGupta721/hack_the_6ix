"""Every numeric constant INNSIGHT uses, with its source.

Rules (PRD engineering rule 1):
- Each constant is a Benchmark record carrying value, unit, source URL, and note.
- Values that could not be tied to a published source are estimate=True and
  render as estimates in the memo. No orphan numbers anywhere in the product.
- The memo engine builds its footnotes directly from these records.

Values below were pulled from primary sources (CBECS 2018 tables, Toronto Hydro
and Enbridge 2026 rate schedules, TAF 2024 emissions guidance, Altus 2025 cost
guide, RICS WLCA standard) and adversarially fact-checked on 2026-07-18.
Derived or synthesized values keep estimate=True and explain their derivation.
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
# Energy use intensity (CBECS 2018, hotel subtype)
# ---------------------------------------------------------------------------

HOTEL_ELEC_INTENSITY = _b(
    "hotel_elec_intensity",
    13.0,
    "kWh/sqft/yr",
    "https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c22.pdf",
    "CBECS 2018 Table C22, hotel subtype mean electricity intensity.",
)

HOTEL_GAS_INTENSITY_M3 = _b(
    "hotel_gas_intensity_m3",
    0.974,
    "m3/sqft/yr",
    "https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c32.pdf",
    "CBECS 2018 Table C32, hotel subtype mean natural gas intensity of "
    "34.4 cu ft/sqft/yr, converted at 35.3147 cu ft/m3.",
)

EUI_TYPE_FACTOR = {
    "homestay": _b(
        "eui_factor_homestay",
        0.80,
        "multiplier on CBECS hotel mean",
        "",
        "ESTIMATE: residential-style operation without commercial kitchen or "
        "laundry runs below the hotel mean.",
        estimate=True,
    ),
    "boutique": _b(
        "eui_factor_boutique",
        1.40,
        "multiplier on CBECS hotel mean",
        "https://www.eia.gov/consumption/commercial/data/2018/ce/pdf/c12.pdf",
        "ESTIMATE: full-service boutique with F&B and on-site laundry. Anchors: "
        "CBECS 2018 Table C12 hotel 75th-percentile EUI is 1.27x the mean "
        "(98.7 vs 77.7 kBtu/sqft), and CBRE's 2023 survey shows full-service "
        "utility spend 1.64x limited-service; 1.40 sits between.",
        estimate=True,
    ),
    "tower": _b(
        "eui_factor_tower",
        1.00,
        "multiplier on CBECS hotel mean",
        "",
        "CBECS hotel means are dominated by larger properties; tower uses the "
        "mean directly.",
    ),
}

HOTEL_BASE_LOAD_SHARE = _b(
    "hotel_base_load_share",
    0.60,
    "fraction",
    "https://www.aceee.org/files/proceedings/2010/data/papers/1984.pdf",
    "Placet et al. 2010 (ACEEE): metered full-service hotel base load of "
    "~400 kW is 44-67 percent of seasonal peak; 0.60 sits in that band. The "
    "same literature finds hotel energy only weakly correlated with occupancy.",
)

HOMESTAY_BASE_LOAD_SHARE = _b(
    "homestay_base_load_share",
    0.25,
    "fraction",
    "",
    "ESTIMATE: small residential-style operation; most load follows guests "
    "(cooking, showers, room conditioning). Reasoned from residential load "
    "studies.",
    estimate=True,
)

COOLING_SHARE_OF_ELECTRICITY = _b(
    "cooling_share_of_electricity",
    0.25,
    "fraction",
    "",
    "ESTIMATE: cooling share of lodging electricity end use in cooling season "
    "literature.",
    estimate=True,
)

DHW_SHARE_OF_FUEL = _b(
    "dhw_share_of_fuel",
    0.40,
    "fraction",
    "",
    "ESTIMATE: hot water vs space heating split of hotel fuel use; hotels are "
    "DHW-heavy (laundry, showers) relative to offices.",
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
        "ESTIMATE: full-service gross area per key including lobby, F&B, and "
        "back of house; hotel development guides quote 600-700.",
        estimate=True,
    ),
    "tower": _b(
        "sqft_per_room_tower",
        520.0,
        "gross sqft/room",
        "",
        "ESTIMATE: high-rise efficiency of scale on the same guide basis.",
        estimate=True,
    ),
}

FLOORS_BY_TYPE = {
    "homestay": 3,
    "boutique": 8,
    "tower": 30,
}

# ---------------------------------------------------------------------------
# Ontario prices (2026 rate schedules)
# ---------------------------------------------------------------------------

ELEC_RATE_SMALL = _b(
    "elec_rate_small",
    0.222,
    "$/kWh",
    "https://www.oeb.ca/consumer-information-and-protection/electricity-rates",
    "ESTIMATE (computed from sourced components): OEB RPP TOU commodity "
    "(9.8/15.7/20.3 cents, Nov 2025-Oct 2026) plus Toronto Hydro GS<50kW "
    "delivery (4.778 distribution + 2.111 transmission cents/kWh, Jan 2026): "
    "all-in 16.7-27.2 cents by period, simple average 22.2 cents.",
    estimate=True,
)

ELEC_RATE_COMMERCIAL = _b(
    "elec_rate_commercial",
    0.155,
    "$/kWh",
    "https://www.torontohydro.com/for-business/rates",
    "ESTIMATE: TOU-weighted commodity plus volumetric riders for Toronto Hydro "
    "GS 50-999 kW customers, whose delivery is billed mainly through demand "
    "charges (modelled separately).",
    estimate=True,
)

DEMAND_CHARGE_PER_KW_MONTH = _b(
    "demand_charge_per_kw_month",
    17.84,
    "$/kW/month",
    "https://www.torontohydro.com/for-business/rates",
    "Toronto Hydro GS 50-999 kW delivery, Jan 2026: 10.517 $/kVA distribution "
    "+ 2.894 $/kW transmission connection + 4.431 $/peak-kW transmission "
    "network, summed at unity power factor.",
)

GAS_RATE_COMMERCIAL = _b(
    "gas_rate_commercial",
    0.2365,
    "$/m3",
    "https://www.enbridgegas.com/-/media/Extranet-Pages/ontario/business-and-industrial/Business/Rates/EGD---Rate-6---System-Notice.pdf",
    "Enbridge Rate 6 (Toronto commercial), July 2026: delivery 9.156 + "
    "transportation 5.427 + effective gas supply 9.069 cents/m3 for the "
    "typical commercial tier.",
)

GAS_RATE_SMALL = _b(
    "gas_rate_small",
    0.284,
    "$/m3",
    "https://www.enbridgegas.com/-/media/Extranet-Pages/ontario/business-and-industrial/Business/Rates/EGD---Rate-6---System-Notice.pdf",
    "Enbridge Rate 6 first tier (up to 500 m3/month): delivery 13.829 + "
    "transportation 5.427 + effective gas supply 9.069 cents/m3.",
)

WATER_RATE = _b(
    "water_rate",
    4.8629,
    "$/m3",
    "https://www.toronto.ca/services-payments/property-taxes-utilities/utility-bill/water-rates-fees/",
    "Toronto Block 1 combined water + wastewater rate, on-time payment, "
    "effective Jan 2026.",
)

ENERGY_PRICE_ESCALATION = _b(
    "energy_price_escalation",
    0.03,
    "fraction/yr",
    "",
    "ESTIMATE: long-run Ontario utility price escalation, in line with recent "
    "OEB rate trajectories.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Emission factors (TAF 2024 guidance, built on IESO + ECCC NIR)
# ---------------------------------------------------------------------------

GRID_INTENSITY_AVG = _b(
    "grid_intensity_avg",
    145.0,
    "gCO2e/kWh",
    "https://taf.ca/custom/uploads/2024/06/TAF-Ontario-Emissions-Factors-2024.pdf",
    "The Atmospheric Fund forecast annual average for Ontario in 2026 (gas "
    "backfilling nuclear refurbishment). Latest confirmed actuals: 67 (2023), "
    "73.8 (2024). Using the 2026 planning value is conservative against our "
    "own electrification case.",
)

GRID_INTENSITY_PEAK = _b(
    "grid_intensity_peak",
    220.0,
    "gCO2e/kWh",
    "https://taf.ca/custom/uploads/2024/06/TAF-Ontario-Emissions-Factors-2024.pdf",
    "TAF summer on-peak marginal emissions factor (2024), rising toward 499 by "
    "2030; what one kWh shifted out of a heat-wave peak actually avoids.",
)

GAS_EMISSION_FACTOR = _b(
    "gas_emission_factor",
    1.9324,
    "kgCO2e/m3",
    "https://taf.ca/custom/uploads/2024/06/TAF-Ontario-Emissions-Factors-2024.pdf",
    "Natural gas combustion, CO2e including CH4 and N2O; TAF citing ECCC "
    "National Inventory Report.",
)

GAS_ENERGY_CONTENT_KWH_M3 = _b(
    "gas_energy_content_kwh_m3",
    10.67,
    "kWh/m3",
    "",
    "ESTIMATE: 38.4 MJ/m3 typical Enbridge higher heating value, divided by "
    "3.6 MJ/kWh. Consistent with CBECS cu-ft-to-kBtu conversions.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Embodied carbon (structure, cradle-to-gate A1-A3, mid-rise)
# ---------------------------------------------------------------------------

EMBODIED_CARBON = {
    "concrete": _b(
        "embodied_concrete",
        300.0,
        "kgCO2e/m2 GFA",
        "https://doi.org/10.1111/jiec.13139",
        "ESTIMATE (synthesized mid of published range 150-550): Hart et al. "
        "2021 meta-study median 185 (whole-life), Chile mid-rise A1-A3 162, "
        "Australian Monte Carlo mean 465 (A1-A5), Nordic case studies 111-121.",
        estimate=True,
    ),
    "mass_timber": _b(
        "embodied_mass_timber",
        130.0,
        "kgCO2e/m2 GFA",
        "https://doi.org/10.1111/jiec.13139",
        "ESTIMATE (synthesized mid of published range 60-250), gross process "
        "emissions WITHOUT biogenic storage credit: Hart et al. median 119, "
        "Chile A1-A3 90, Nordic 26-40, Australia mean 417. Net-of-credit "
        "figures can reach zero or below and are shown separately in the memo "
        "with the EN 15978 caveat.",
        estimate=True,
    ),
    "steel": _b(
        "embodied_steel",
        300.0,
        "kgCO2e/m2 GFA",
        "https://doi.org/10.1111/jiec.13139",
        "ESTIMATE (synthesized mid of published range 160-500): Hart et al. "
        "median 228 (highest of the three frames), UK SCI benchmarks 32-506 "
        "across typologies.",
        estimate=True,
    ),
}

TIMBER_BIOGENIC_NET = _b(
    "timber_biogenic_net",
    0.0,
    "kgCO2e/m2 GFA",
    "https://doi.org/10.5334/bc.46",
    "ESTIMATE: mass timber net of biogenic storage credit spans roughly -150 "
    "to +200; shown only alongside the gross figure. Hoxha et al. 2020 caveat: "
    "the -1/+1 biogenic convention depends on sustained forest management and "
    "end-of-life pathway.",
    estimate=True,
)

BUILDING_LIFE_YEARS = _b(
    "building_life_years",
    60.0,
    "years",
    "https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/whole-life-carbon-assessment",
    "RICS Whole Life Carbon Assessment standard (2nd ed., 2023) 60-year "
    "reference study period, used to annualize embodied carbon.",
)

# ---------------------------------------------------------------------------
# Construction cost (Altus Group 2025 Canadian Cost Guide, GTA hard costs)
# ---------------------------------------------------------------------------

CONSTRUCTION_COST_PER_SQFT = {
    "homestay": _b(
        "cost_sqft_homestay",
        285.0,
        "$/sqft",
        "https://www.altusgroup.com/featured-insights/canadian-cost-guide/",
        "Altus 2025 Canadian Cost Guide, GTA budget hotel band 245-325 $/sqft "
        "midpoint; conversion-grade small property.",
    ),
    "boutique": _b(
        "cost_sqft_boutique",
        475.0,
        "$/sqft",
        "https://www.altusgroup.com/featured-insights/canadian-cost-guide/",
        "Altus 2025 Canadian Cost Guide, GTA 4-star full-service hotel band "
        "390-565 $/sqft midpoint; excludes site, FF&E, parking.",
    ),
    "tower": _b(
        "cost_sqft_tower",
        500.0,
        "$/sqft",
        "https://www.altusgroup.com/featured-insights/canadian-cost-guide/",
        "Altus 2025 GTA 4-star full-service band upper half for high-rise "
        "form; luxury premium (up to +305) not applied.",
    ),
}

STRUCTURE_SHARE_OF_HARD_COST = _b(
    "structure_share_of_hard_cost",
    0.175,
    "fraction",
    "",
    "ESTIMATE: structural frame share of hotel hard cost, commonly quoted "
    "15-20 percent; used to translate the structure premium to whole-building "
    "cost.",
    estimate=True,
)

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
        1.03,
        "multiplier",
        "https://sbcanada.org/wp-content/uploads/2025/08/FINAL-Mass-Timber-Consultation-Insights-July-2025-Sustainable-Buildings-Canada-1.pdf",
        "Sustainable Buildings Canada (2025): mass timber carries a 10-20 "
        "percent premium over concrete construction; applied to the structural "
        "share of hard cost (~17.5 percent) this is ~2-4 percent of the whole "
        "building, taken at 3 percent. Altus data shows wood cheaper at "
        "low-rise, so this leans conservative.",
        estimate=True,
    ),
    "steel": _b(
        "cost_factor_steel",
        1.03,
        "multiplier",
        "",
        "ESTIMATE: steel-frame premium for this typology on the same "
        "structure-share basis.",
        estimate=True,
    ),
}

HVAC_CAPEX_PREMIUM_HEAT_PUMP = _b(
    "hvac_capex_premium_heat_pump",
    6.0,
    "$/sqft",
    "",
    "ESTIMATE: incremental capex of a heat-pump plant vs gas boiler + chiller "
    "for mid-rise hospitality, net of avoided gas infrastructure.",
    estimate=True,
)

HVAC_FIXED_PREMIUM_HEAT_PUMP = _b(
    "hvac_fixed_premium_heat_pump",
    25000.0,
    "$",
    "",
    "ESTIMATE: fixed design/equipment floor for a heat-pump plant regardless "
    "of building size; the honest reason small properties pencil differently.",
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
    "ESTIMATE: cold-climate air-source heat pump seasonal COP for combined "
    "space heat and DHW.",
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

COOLING_EER_RATIO_HEAT_PUMP = _b(
    "cooling_eer_ratio_heat_pump",
    1.30,
    "ratio",
    "",
    "ESTIMATE: modern VRF/heat-pump cooling efficiency vs baseline packaged "
    "central plant; published EER comparisons run 1.15-1.35.",
    estimate=True,
)

COOLING_BALANCE_POINT_C = _b(
    "cooling_balance_point_c",
    18.0,
    "degC",
    "",
    "ASHRAE degree-day convention balance point.",
    estimate=True,
)

PEAK_COOLING_W_PER_SQFT = _b(
    "peak_cooling_w_per_sqft",
    2.85,
    "W(electric)/sqft at design conditions",
    "",
    "ESTIMATE: rule-of-thumb hospitality cooling of one ton per 350-450 sqft "
    "at COP ~3.5 gives 2.4-3.0 electric W/sqft at design.",
    estimate=True,
)

COOLING_INTERNAL_FLOOR = _b(
    "cooling_internal_floor",
    0.25,
    "fraction of design cooling",
    "https://www.aceee.org/files/proceedings/2010/data/papers/1984.pdf",
    "ESTIMATE: interior-zone cooling driven by internal gains runs through "
    "summer nights; the Placet et al. metered hotel holds ~400 kW overnight "
    "in August against a 580 kW peak. Floor applied when the scenario day "
    "mean exceeds the balance point.",
    estimate=True,
)

COOLING_DESIGN_DELTA_C = _b(
    "cooling_design_delta_c",
    17.0,
    "degC above balance point",
    "",
    "ESTIMATE: Toronto design dry bulb near 35 C minus the 18 C balance point.",
    estimate=True,
)

# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

AVG_ANNUAL_OCCUPANCY = _b(
    "avg_annual_occupancy",
    0.65,
    "fraction",
    "",
    "ESTIMATE: Toronto hotel market average occupancy (STR-reported range).",
    estimate=True,
)

WATER_PER_OCCUPIED_ROOM_NIGHT = _b(
    "water_per_occupied_room_night",
    0.5,
    "m3/occupied room-night",
    "",
    "ESTIMATE: hotel water studies range roughly 0.2-0.9 m3 per occupied "
    "room-night.",
    estimate=True,
)

FEEDER_CAPACITY_W_PER_SQFT = {
    "homestay": _b(
        "feeder_capacity_homestay",
        12.0,
        "W/sqft",
        "",
        "ESTIMATE: small buildings carry proportionally larger service "
        "margins; strain classification proxy only, labelled as such in the "
        "memo.",
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
        "ESTIMATE: high-rise diversity factor; strain classification proxy "
        "only.",
        estimate=True,
    ),
}

# ---------------------------------------------------------------------------
# Decision rule
# ---------------------------------------------------------------------------

PAYBACK_HORIZON_YEARS = _b(
    "payback_horizon_years",
    15.0,
    "years",
    "",
    "ESTIMATE: typical hospitality hold/refinance window, used only for the "
    "payback display; the carbon decision uses the 60-year RICS life.",
    estimate=True,
)

ABATEMENT_THRESHOLD = _b(
    "abatement_threshold",
    170.0,
    "$/tCO2e",
    "https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/carbon-pollution-pricing-federal-benchmark-information.html",
    "Canada's federal carbon-price benchmark reaches $170/tCO2e by 2030; the "
    "recommendation rule funds green premiums up to this implied abatement "
    "cost over the building's 60-year reference life.",
)

# Named stress event backing the heat-wave scenario temperatures.
HEATWAVE_EVENT_PEAK_C = _b(
    "heatwave_event_peak_c",
    36.2,
    "degC",
    "https://www.cbc.ca/news/canada/toronto/near-record-temperature-toronto-heat-wave-9.7270071",
    "Toronto heat wave of July 14, 2026 peaked at 36.2 C (near the 36.7 C "
    "record) under an Environment Canada heat warning; the stress scenario's "
    "diurnal profile peaks at this value. Toronto now averages 14 days over "
    "30 C per year (1991-2020 normals), up from 9.7 (1961-1990).",
)
