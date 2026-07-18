# Community friction score, documented heuristic

This score is a HEURISTIC, not survey data. It is a transparent, deterministic
formula over public proxies, meant to put neighbourhood impact on the same page
as dollars and tonnes so the decision maker at least asks the question. It is
labelled as a heuristic everywhere it appears.

## Formula

Score = clamp(1 + T + N + H + G, 1, 10), one decimal. Higher = more friction.

| Term | Proxy | Formula | Range |
| --- | --- | --- | --- |
| T, traffic pressure | Check-ins, taxis, deliveries scale with room count | min(2.5, rooms / 40) | 0-2.5 |
| N, noise and operations | Building type in its planning context | homestay 1.8 (guest turnover inside residential fabric), boutique 1.2 (commercial main-street context), tower 2.0 (service traffic and shadowing) | fixed |
| H, housing pressure | Effect on housing stock | homestay 2.0 (removes a dwelling from the rental pool, the documented short-term-rental concern), boutique 0.5 (purpose-built on commercial land), tower 1.0 (land assembly pressure) | fixed |
| G, grid load | Share of the local feeder the stress-test peak consumes | 2.5 x min(1, strain ratio) | 0-2.5 |

## Why these proxies

- Traffic and noise are the two most common objections in Toronto development
  consultations for hospitality uses.
- Housing pressure reflects the short-term-rental debate: converting dwellings
  to guest rooms is the friction driver for small operators, while purpose-built
  hotels on commercial land do not remove housing.
- Grid load uses the same strain ratio the stress test computes, so the score
  responds to design choices (a calmer HVAC system genuinely lowers it).

## Limits

No survey data, no site-specific consultation record, no parking model. The
weights are set by judgment and documented here; changing them changes the
score. Treat the score as a conversation starter, not a measurement.
