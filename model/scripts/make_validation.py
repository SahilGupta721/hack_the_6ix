"""Render the validation overlay: our generated hotel load curve vs the
published metered curve from Placet et al. 2010 (ACEEE Summer Study),
"Energy End-Use Patterns in Full-Service Hotels: A Case Study".
https://www.aceee.org/files/proceedings/2010/data/papers/1984.pdf

The study hotel (300+ rooms, 212,000 sqft, full service) shows ~400 kW base
load with ~200 kW of cooling on top in August and "a relatively flat daily
load curve in all seasons": night trough 44-67 percent of seasonal peak.
The August weekday trace below is an approximate visual read of the paper's
Figure 2 (labelled as such on the chart); the base-400 / peak-580 anchor
values are stated in the paper's text.

Output: web/public/validation.png (rendered in-app on the profiles panel).
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from innsight_model.sim import SCENARIOS, BuildingConfig, run_option

# Approximate visual trace of Figure 2, August weekday average (kW).
# Text-anchored: base ~400 kW all night, afternoon peak ~580 kW.
ACEEE_AUGUST_KW = [
    410, 405, 400, 400, 400, 405,
    420, 445, 470, 495, 515, 535,
    555, 570, 580, 578, 565, 545,
    525, 505, 480, 455, 435, 420,
]

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "validation.png"


def main() -> None:
    config = BuildingConfig("tower", 200, "concrete", "central_gas")
    result = run_option(config, SCENARIOS["typical_weekend"])
    ours = list(result.hourly_kw[24:48])  # the Sunday of the typical weekend

    ours_pct = [v / max(ours) * 100 for v in ours]
    pub_pct = [v / max(ACEEE_AUGUST_KW) * 100 for v in ACEEE_AUGUST_KW]
    hours = list(range(24))

    fig, ax = plt.subplots(figsize=(8.6, 4.6), dpi=150)
    fig.patch.set_facecolor("#0d2b45")
    ax.set_facecolor("#0d2b45")

    ax.axhspan(44, 67, color="#ffffff", alpha=0.06, zorder=0)
    ax.text(
        0.3, 45.5, "published night-trough band: 44-67% of peak",
        color="#9fb3c8", fontsize=7.5,
    )

    ax.plot(
        hours, pub_pct,
        color="#9fb3c8", linewidth=2.2, linestyle="--",
        label="Metered full-service hotel, Aug weekday (Placet et al. 2010, approx. trace)",
    )
    ax.plot(
        hours, ours_pct,
        color="#f5c518", linewidth=2.6,
        label="INN-SIGHT generated: 200-room tower, typical July day",
    )

    ax.set_xlim(0, 23)
    ax.set_ylim(0, 110)
    ax.set_xticks(range(0, 24, 3))
    ax.set_xticklabels(
        ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"],
        color="#c9d6e2", fontsize=8,
    )
    ax.tick_params(axis="y", colors="#c9d6e2", labelsize=8)
    ax.set_ylabel("Load (% of daily peak)", color="#c9d6e2", fontsize=9)
    ax.set_title(
        "Validation: generated hospitality load curve vs published metered hotel",
        color="#ffffff", fontsize=11, pad=12,
    )
    for spine in ax.spines.values():
        spine.set_color("#2c4a66")
    ax.grid(color="#1a3a57", linewidth=0.6)
    legend = ax.legend(
        loc="lower center", fontsize=7.5, framealpha=0, labelcolor="#e8eef4"
    )
    fig.text(
        0.99, 0.01,
        "Source: aceee.org/files/proceedings/2010/data/papers/1984.pdf",
        color="#7d93a8", fontsize=6.5, ha="right",
    )
    fig.tight_layout()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, facecolor=fig.get_facecolor())
    print(f"wrote {OUT}")
    trough_pct = min(ours_pct)
    print(f"our tower night trough: {trough_pct:.1f}% of peak (band 44-67)")


if __name__ == "__main__":
    main()
