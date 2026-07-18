# INN-SIGHT

The AI consultant that tells you what to build, before you build it.

Place a hotel, homestay, or B&B on a real Toronto map, toggle concrete vs mass timber and central HVAC vs heat pumps, stress-test the design against a fully booked heat-wave weekend, and receive an investor-style memo: construction cost, annual energy cost, tCO2e per year with sources, a documented community-friction heuristic, and a recommendation with reasoning.

Built at Hack the 6ix 2026.

## Stack

- `web/` Next.js (App Router, TypeScript, Tailwind), MapLibre GL satellite assembler
- `api/` FastAPI (Python 3.11)
- `model/` benchmark library and deterministic stress-test engine, pytest-covered

## Run it

```bash
# api (from repo root)
python3.11 -m venv .venv && .venv/bin/pip install -r api/requirements.txt
.venv/bin/uvicorn app.main:app --app-dir api --port 8000

# web
cd web && npm install && npm run dev
```

Copy `.env.example` values into `api/.env` and `web/.env.local`. Every integration is feature-flagged; the core loop runs with no keys at all.

## Demo

![Demo](web/public/demo.gif)

Assemble the building component by component (foundation, structure, floors, facade, energy systems) on the City of Toronto's 8 cm aerial imagery, toggle concrete + central HVAC against mass timber + heat pumps, stress-test a fully booked heat-wave weekend (36.2 C, the documented July 14, 2026 Toronto event), and read the memo. A physics and structure log narrates each configuration choice. For the 40-room boutique the flip to Option B costs $159 per tonne of CO2e avoided over the RICS 60-year life, under Canada's $170 federal 2030 benchmark; for a 6-room homestay the same swap fails the bar at $358 per tonne and the memo honestly recommends Option A. That flip is enforced by a pytest.

## Real vs Simulated ledger

Honesty first: this table says exactly what is real and what is a labelled simulation. Updated every phase.

| Piece | Status |
| --- | --- |
| Benchmark constants (52: energy intensity, rates, carbon factors, costs) | Real published values (CBECS 2018 tables, Toronto Hydro and Enbridge 2026 rate schedules, TAF emissions guidance, Altus 2025 cost guide, RICS WLCA); every constant in `model/innsight_model/benchmarks.py` carries a source URL or an ESTIMATE flag with its derivation |
| Stress-test engine | Real deterministic model on those constants; 14 pytest including determinism and the homestay/hotel recommendation flip |
| Hourly load curves | Generated from published load-profile behaviour; in-app validation overlay against a metered hotel study (Placet et al. 2010) |
| Stay22 market pulse | Real live demo-mode API calls, forward dates, no listing storage; cache fallback disclosed in-UI |
| Memo narrative | Gemini structured output over real computed numbers; deterministic fallback without a key, generator labelled in-UI |
| Streetscape renders | Illustrative AI imagery, labelled, static fallback disclosed |
| Community friction score | Documented heuristic (`model/friction.md`), not survey data |
| Building geometry | Illustrative massing, not permit-ready drawings |
| Grid strain class | Published factors as a proxy, not utility telemetry |
| Pixel viewport | Visualization driven by real sim outputs, decorative art style |

## Licences and data credits

Map imagery: City of Toronto 2025 orthophoto (contains information licensed under the Open Government Licence - Toronto) over Esri World Imagery (attribution in-app). Benchmarks: US EIA CBECS, EC3/Building Transparency, OEB, ECCC, IESO (URLs inline in code and memo footnotes).
