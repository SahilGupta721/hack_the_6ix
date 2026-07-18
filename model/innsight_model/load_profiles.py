"""Hospitality load-profile shapes.

Three archetypes (PRD P1):
- homestay: spiky. Low base load; demand follows one household of guests
  (morning showers, evening cooking, check-in surge).
- boutique: cyclical. Morning and evening peaks over a substantial base load,
  the classic full-service hotel double hump.
- tower: smooth. Central plant and scheduled operations flatten the curve.

Shapes are normalized 24-hour multipliers with mean 1.0, built from fixed
anchor points (no randomness, deterministic by construction). Anchor shapes
follow published hotel load-profile studies; the validation overlay chart
compares the boutique curve against a published hotel curve (see
validation.py and web/public/validation.png).
"""

from dataclasses import dataclass

Hours = list[float]

BUILDING_TYPES = ("homestay", "boutique", "tower")


@dataclass(frozen=True)
class LoadProfile:
    building_type: str
    label: str
    character: str
    hourly_shape: Hours  # 24 multipliers, mean 1.0


def _normalize(shape: Hours) -> Hours:
    mean = sum(shape) / len(shape)
    return [round(v / mean, 6) for v in shape]


# Anchor points, hour 0 to 23. Values are relative demand before normalization.
_RAW_SHAPES: dict[str, Hours] = {
    # One family's day: near-dead overnight, sharp morning spike, quiet midday
    # (guests out), check-in/cooking surge late afternoon, evening peak.
    "homestay": [
        0.15, 0.12, 0.10, 0.10, 0.12, 0.25,
        0.80, 1.60, 1.10, 0.45, 0.30, 0.28,
        0.30, 0.28, 0.35, 0.70, 1.30, 1.90,
        2.10, 1.70, 1.20, 0.80, 0.45, 0.25,
    ],
    # Full-service double hump: base load never sleeps (corridors, fridges,
    # ventilation), breakfast/checkout peak, evening F&B and room peak.
    "boutique": [
        0.62, 0.58, 0.56, 0.55, 0.58, 0.70,
        0.95, 1.25, 1.35, 1.15, 1.00, 0.98,
        1.02, 1.00, 0.98, 1.05, 1.20, 1.40,
        1.50, 1.45, 1.30, 1.10, 0.85, 0.70,
    ],
    # Scheduled central plant: shallow sinusoid over a tall base.
    "tower": [
        0.85, 0.82, 0.80, 0.80, 0.82, 0.88,
        0.98, 1.08, 1.12, 1.08, 1.05, 1.05,
        1.08, 1.06, 1.04, 1.06, 1.12, 1.18,
        1.20, 1.16, 1.10, 1.02, 0.94, 0.88,
    ],
}

PROFILES: dict[str, LoadProfile] = {
    "homestay": LoadProfile(
        "homestay",
        "6-Room Homestay",
        "spiky",
        _normalize(_RAW_SHAPES["homestay"]),
    ),
    "boutique": LoadProfile(
        "boutique",
        "40-Room Boutique Hotel",
        "cyclical",
        _normalize(_RAW_SHAPES["boutique"]),
    ),
    "tower": LoadProfile(
        "tower",
        "200-Room Tower",
        "smooth",
        _normalize(_RAW_SHAPES["tower"]),
    ),
}


def get_profile(building_type: str) -> LoadProfile:
    if building_type not in PROFILES:
        raise ValueError(f"unknown building type: {building_type}")
    return PROFILES[building_type]


def peak_to_trough(profile: LoadProfile) -> float:
    return max(profile.hourly_shape) / min(profile.hourly_shape)
