from innsight_model.load_profiles import PROFILES, peak_to_trough
from innsight_model.sim import (
    SCENARIOS,
    BuildingConfig,
    compare,
    demo_pair,
    run_option,
)

HEATWAVE = SCENARIOS["heatwave_full"]


def test_profiles_are_normalized() -> None:
    for profile in PROFILES.values():
        assert len(profile.hourly_shape) == 24
        mean = sum(profile.hourly_shape) / 24
        assert abs(mean - 1.0) < 1e-6


def test_profile_characters() -> None:
    spiky = peak_to_trough(PROFILES["homestay"])
    cyclical = peak_to_trough(PROFILES["boutique"])
    smooth = peak_to_trough(PROFILES["tower"])
    assert spiky > cyclical > smooth
    assert spiky > 10  # one household: near-dead overnight, sharp evening spike
    assert smooth < 2  # central plant flattens the tower curve


def test_determinism() -> None:
    config = BuildingConfig("boutique", 40, "concrete", "central_gas")
    first = run_option(config, HEATWAVE)
    second = run_option(config, HEATWAVE)
    assert first == second

    a, b = demo_pair("boutique", 40)
    assert compare(a, b, HEATWAVE) == compare(a, b, HEATWAVE)


def test_curve_covers_whole_weekend() -> None:
    config = BuildingConfig("boutique", 40, "concrete", "central_gas")
    result = run_option(config, HEATWAVE)
    assert len(result.hourly_kw) == 48
    assert result.peak_kw == max(result.hourly_kw)
    assert min(result.hourly_kw) > 0


def test_heatwave_is_harder_than_typical() -> None:
    config = BuildingConfig("boutique", 40, "concrete", "central_gas")
    stress = run_option(config, HEATWAVE)
    typical = run_option(config, SCENARIOS["typical_weekend"])
    assert stress.peak_kw > typical.peak_kw


def test_flip() -> None:
    """The PRD flip test: the recommendation must flip between the 6-room
    homestay and the 40-room boutique for the same A/B option pair."""
    hotel = compare(*demo_pair("boutique", 40), HEATWAVE)
    homestay = compare(*demo_pair("homestay", 6), HEATWAVE)
    assert hotel.recommended == "B"
    assert homestay.recommended == "A"


def test_hotel_memo_sniff() -> None:
    """A 40-room hotel's annual energy bill is six figures, not $1,387."""
    a, _ = demo_pair("boutique", 40)
    result = run_option(a, HEATWAVE)
    annual_energy_total = result.annual_energy_cost + result.annual_demand_cost
    assert 100_000 <= annual_energy_total <= 400_000
    assert 5_000_000 <= result.construction_cost <= 25_000_000
    assert 10 <= result.tco2e_total <= 500


def test_option_b_is_cleaner_and_calmer() -> None:
    a, b = demo_pair("boutique", 40)
    ra = run_option(a, HEATWAVE)
    rb = run_option(b, HEATWAVE)
    assert rb.tco2e_total < ra.tco2e_total
    assert rb.peak_kw < ra.peak_kw
    assert rb.annual_gas_m3 == 0.0


def test_config_validation() -> None:
    import pytest

    with pytest.raises(ValueError):
        BuildingConfig("boutique", 40, "brick", "central_gas")
    with pytest.raises(ValueError):
        BuildingConfig("boutique", 0, "concrete", "central_gas")
