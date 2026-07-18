"""Community friction score: a documented, deterministic heuristic.

The formula, its proxies, and its limits live in model/friction.md. It is
labelled a heuristic (not survey data) everywhere it renders.
"""

from .sim import BuildingConfig, OptionResult

_NOISE_BY_TYPE = {"homestay": 1.8, "boutique": 1.2, "tower": 2.0}
_HOUSING_BY_TYPE = {"homestay": 2.0, "boutique": 0.5, "tower": 1.0}


def friction_score(config: BuildingConfig, result: OptionResult) -> float:
    traffic = min(2.5, config.rooms / 40.0)
    noise = _NOISE_BY_TYPE[config.building_type]
    housing = _HOUSING_BY_TYPE[config.building_type]
    grid = 2.5 * min(1.0, result.strain_ratio)
    return round(min(10.0, max(1.0, 1.0 + traffic + noise + housing + grid)), 1)


def friction_terms(config: BuildingConfig, result: OptionResult) -> dict[str, float]:
    return {
        "traffic": round(min(2.5, config.rooms / 40.0), 2),
        "noise": _NOISE_BY_TYPE[config.building_type],
        "housing": _HOUSING_BY_TYPE[config.building_type],
        "grid": round(2.5 * min(1.0, result.strain_ratio), 2),
    }
