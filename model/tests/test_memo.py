import json

from innsight_model.memo import _fallback_narrative, build_memo
from innsight_model.sim import SCENARIOS, compare, demo_pair

HEATWAVE = SCENARIOS["heatwave_full"]


def _demo_memo() -> dict:
    comparison = compare(*demo_pair("boutique", 40), HEATWAVE)
    return build_memo(comparison, "45 The Esplanade")


def test_memo_sniff() -> None:
    """PRD section 8 fix list: computed values only, six-figure hotel energy,
    no stray unit cells, no duplicated rows, friction labelled heuristic."""
    memo = _demo_memo()
    for option in memo["options"]:
        energy = option["annual_energy_cost"]["value"]
        assert energy >= 100_000, "40-room hotel energy must be six figures"
        assert option["construction_cost"]["mid"] > 5_000_000
        assert option["community_friction"]["label"].startswith(
            "documented heuristic"
        )
        assert 1 <= option["community_friction"]["score"] <= 10

    text = json.dumps(memo)
    assert "Turan" not in text  # the prototype typo must never reappear
    assert "placeholder" not in text.lower()
    assert "null" not in json.dumps(memo["options"])  # no empty cells


def test_memo_footnotes_cover_every_section() -> None:
    memo = _demo_memo()
    indices = {f["index"] for f in memo["footnotes"]}
    for option in memo["options"]:
        for section in (
            "construction_cost",
            "annual_energy_cost",
            "annual_water",
            "tco2e_per_year",
            "peak_grid_strain",
        ):
            refs = option[section]["footnotes"]
            assert refs, f"{section} has no footnotes"
            assert set(refs) <= indices
    assert memo["comparison"]["footnotes"]
    for footnote in memo["footnotes"]:
        assert footnote["source"] or footnote["estimate"], (
            f"{footnote['key']} has neither a source nor an estimate flag"
        )


def test_memo_recommends_b_for_demo_hotel() -> None:
    memo = _demo_memo()
    assert memo["comparison"]["recommended"] == "B"
    assert memo["comparison"]["abatement_cost"] is not None
    assert (
        memo["comparison"]["abatement_cost"]
        <= memo["comparison"]["abatement_threshold"]
    )


def test_fallback_narrative_is_complete() -> None:
    memo = _demo_memo()
    narrative = _fallback_narrative(memo)
    assert narrative["generator"] == "deterministic-fallback"
    assert "Option B" in narrative["summary"]
    assert len(narrative["reasoning"]) >= 3
    assert any("heuristic" in c for c in narrative["caveats"])
