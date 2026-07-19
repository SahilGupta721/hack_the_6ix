# INN-SIGHT

The AI consultant that tells you what to build, before you build it.

Place a hotel, homestay, or B&B on a real Toronto map, toggle concrete vs mass timber and central HVAC vs heat pumps, stress-test the design against a fully booked heat-wave weekend, and receive an investor-style memo: construction cost, annual energy cost, tCO2e per year with sources, a documented community-friction heuristic, and a recommendation with reasoning.

Built at Hack the 6ix 2026.

## Stack

- `web/` Next.js (App Router, TypeScript, Tailwind), MapLibre GL satellite assembler
- `api/` FastAPI (Python 3.11+)
- `model/` benchmark library and deterministic stress-test engine, pytest-covered

## Run it

```bash
# api (from repo root)
python3.11 -m venv .venv && .venv/bin/pip install -r api/requirements.txt
.venv/bin/uvicorn main:app --app-dir api --port 8000

# web
cd web && npm install && npm run dev
```

Put secrets in a **single repo-root `.env`** (never commit it). Do not use `web/.env.local` or `api/.env` — both the Next.js app (`web/next.config.ts`) and FastAPI (`api/main.py`) load only that file. Every integration is feature-flagged; the core loop runs with no keys at all.

Auth0 example keys in that same file:

```env
NEXT_PUBLIC_FLAG_AUTH0=true
AUTH0_DOMAIN=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=...
APP_BASE_URL=http://localhost:3000
```

## Demo

![Demo](web/public/demo.gif)

What the capture shows, in order: enter from the landing page, land on the default site (45 The Esplanade on the City of Toronto's 8 cm aerial imagery, with neighbouring buildings extruded at their real OSM heights and live site climate from Open-Meteo), pick from real empty parcels found live on OpenStreetMap (surface parking, brownfield, construction; each cleared against building footprints by polygon intersection), assemble the building component by component (foundation, structure, floors, facade, energy systems) while the physics and structure log narrates each choice, toggle Option A (concrete + central HVAC) against Option B (mass timber + heat pumps), run the year stress (five named extreme weekends in parallel, including the documented 36.2 C July 14, 2026 Toronto heat event), and read the portfolio memo.

The honest numbers under it: for the 40-room boutique, the flip to Option B costs $159 per tonne of CO2e avoided over the RICS 60-year life, under Canada's $170 federal 2030 benchmark; for a 6-room homestay the same swap fails the bar at $358 per tonne and the memo recommends Option A. That flip is enforced by a pytest.

## Real vs Simulated ledger

Honesty first: this table says exactly what is real and what is a labelled simulation. Updated every phase.

| Piece | Status |
| --- | --- |
| Benchmark constants (52: energy intensity, rates, carbon factors, costs) | Real published values (CBECS 2018 tables, Toronto Hydro and Enbridge 2026 rate schedules, TAF emissions guidance, Altus 2025 cost guide, RICS WLCA); every constant in `model/innsight_model/benchmarks.py` carries a source URL or an ESTIMATE flag with its derivation |
| Stress-test engine | Real deterministic model on those constants; 25 pytest including determinism and the homestay/hotel recommendation flip |
| Empty-parcel finder | Live OSM Overpass (surface parking, brownfield, construction, vacant) with real polygon building-exclusion; fallbacks: session cache, then parcels traced from the 2025 orthophoto, then labelled approximate pads |
| 3D context buildings | Neighbouring OSM footprints extruded at tagged heights (`height` / `building:levels`); decorative, hidden when data is unavailable |
| Hourly load curves | Generated from published load-profile behaviour; in-app validation overlay against a metered hotel study (Placet et al. 2010) |
| Stay22 market pulse | Real live demo-mode API calls at the selected parcel lat/lng, forward dates, no listing storage; cache fallback disclosed in-UI |
| Electricity Maps carbon | Live zone intensity when `ELECTRICITYMAPS_API_KEY` is set (lat/lon then CA-ON fallback); else TAF Ontario benchmarks |
| Open-Meteo climate curves | Archive hourly temps at the pin → five named extreme 48h weekends for year-pack sim; Toronto fixed curves if unreachable; **not** 8760h |
| Multi-agent briefing | Specialists (market, environment, neighbourhood, green ratio, friction, compliance) + boss; Gemini structured JSON when keyed, deterministic stubs otherwise; sim remains source of truth for A/B numbers |
| Agent inference footprint | Token usage from Gemini `usage_metadata` when live; energy/gCO2e are labelled estimates (~0.3 Wh/1k tokens × live Electricity Maps or TAF Ontario gCO2e/kWh); shown on year-pack memo + physics log |
| Year-pack parallel stress | One action runs all five extreme weekends in parallel (deterministic sim matrix, location climate when live); shared Stay22/env gather; ~8 Gemini calls total (6 specialists + year boss + one portfolio memo), not 5× full briefing |
| Seasonal stress scenarios | Named extreme weekends (heat-wave, summer shoulder, typical July, typical winter, deep cold); 48h peak curves with heating + cooling; annual energy still CBECS averages, not 8760h weather |
| Per-user past runs | Mongo `memo_runs` metadata + reopenable `report` blob (year memo, multi-agent briefs, scenario matrix) when Auth0 signed in; click Past runs to restore; no Stay22 listings; JWT verification still a follow-up |
| Memo narrative | Gemini structured output over real computed numbers (single-scenario or year portfolio); deterministic fallback without a key, generator labelled in-UI |
| Streetscape renders | Illustrative AI imagery, labelled, static fallback disclosed |
| Community friction score | Documented heuristic (`model/friction.md`), not survey data |
| Building geometry | Illustrative massing, not permit-ready drawings |
| Grid strain class | Published factors as a proxy, not utility telemetry |
| Pixel viewport | Visualization driven by real sim outputs, decorative art style |

## Licences and data credits

Map imagery: City of Toronto 2025 orthophoto (contains information licensed under the Open Government Licence - Toronto) over Esri World Imagery (attribution in-app). Benchmarks: US EIA CBECS, EC3/Building Transparency, OEB, ECCC, IESO (URLs inline in code and memo footnotes).
