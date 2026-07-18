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

## Real vs Simulated ledger

Honesty first: this table says exactly what is real and what is a labelled simulation. Updated every phase.

| Piece | Status |
| --- | --- |
| Benchmark constants (energy intensity, carbon factors, rates) | Real published values, source URL on every constant in `model/innsight_model/benchmarks.py` |
| Stress-test engine | Real deterministic model built on those constants, pytest-covered |
| Hourly load curves | Generated from published load-profile shapes, validation overlay in-app |
| Community friction score | Documented heuristic (`model/friction.md`), not survey data |
| Building geometry | Illustrative massing, not permit-ready drawings |
| Grid strain class | Published factors, not utility telemetry |
| Memo text | Gemini structured output over real computed numbers, deterministic fallback without a key |

## Licences and data credits

Map imagery: Esri World Imagery (attribution in-app). Benchmarks: US EIA CBECS, EC3/Building Transparency, OEB, ECCC, IESO (URLs inline in code and memo footnotes).
