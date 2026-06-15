# Cascade — Hydro-Semiconductor Risk Engine

**A research engine that asks whether hydrological stress in the semiconductor supply chain is a tradeable, underpriced systemic risk — and then honestly tests the answer.**

🔗 **Live dashboard:** https://minnehanjames-hub.github.io/cascade/

---

## The one-paragraph story

Advanced chips are among the most water-intensive products on earth, and >93% of sub-5nm capacity sits in two water-stressed geographies (Taiwan, Arizona). The thesis was that this is a *grossly underpriced* systemic risk that would propagate to markets. We built the engine, pulled 16 years of real reservoir data, and put the thesis through a proper validation gauntlet.

**The honest result: the physical early-warning signal is real, but the *trade* is not.** A calibrated model anticipates Taiwan droughts months ahead — yet when we tested whether the exposed stocks actually moved, they didn't. The water→equity link is **not supported** by the price record, because TSMC keeps output near-full through droughts (trucking, recycling, desalination). The project's value turned out to be the disciplined apparatus that *disproved* its own thesis before any money was at risk.

## What's actually validated (and what isn't)

| Layer | Verdict | Evidence |
|---|---|---|
| Reservoir drought early-warning | ✅ **Real** | 6/6 severe droughts (2010–2026) caught; well-calibrated probabilities (reliability 0%→72%); beats a seasonal-null model ~4.5× |
| "Critical slowing down" indicators | ❌ Adds ~nothing | Full model vs. CSD-removed: precision 0.50 vs 0.48 |
| H1 — short the water-exposed semis on droughts | ❌ **Not supported** | Basket *rose* +3.8% vs sector after droughts (wanted negative); thesis long-short book lost 8.9% over 6 months |
| H2 — long them contrarian (buy the drought scare) | ❌ **Fails** | Permutation test p=0.97 — entering at a *random* month (+14%) beat drought entry (+3.8%); the gain was basket beta, not signal |

**Validated tradeable signals today: 0.** That is the honest state, and the site says so.

## Run it

```bash
npm install
npm run monitor          # live catalyst monitor + risk report (CLI)
npm run build:site       # rebuild docs/data.json from live feeds
node scripts/fetch-history-multiyear.js   # refresh 16y reservoir history (FHY)
node scripts/backtest.js                  # walk-forward validation -> docs/validation.json
node scripts/event-study.js               # H1: does water stress move the stocks? -> docs/event-study.json
node scripts/contrarian-study.js          # H2: the contrarian gauntlet -> docs/contrarian.json
```

All scripts run from committed data (`research/data/`) — no hidden local dependencies.

## Repo map

```
src/
  engine/          # simulation, graph, early-warning signals (AR1, variance, return rate, detrend)
  models/hydro-semi/  # catalysts, fab exposure, regional systems
  monitor/         # catalyst monitor + the deterministic forecast/decision model (forecast.js)
  data/feeds/      # live ingestion: WRA reservoirs, USGS groundwater, NOAA ENSO (real, with fallbacks)
scripts/           # history fetch, site-data build, backtest, event study, contrarian study
research/data/     # committed real datasets (reservoir history, ONI, monthly equity prices)
docs/              # the static dashboard (GitHub Pages) + its JSON artifacts
```

## How it's kept honest (the methodology)

- **Strictly causal walk-forward** — at each past week the model sees only data up to then.
- **First-principles weights**, never tuned to maximise backtest accuracy.
- **A seasonal null model** reported alongside everything — skill that doesn't beat it isn't real.
- **Permutation tests + confidence intervals** — and false-alarm rates shown as loudly as the wins.
- **An independent auditor agent** red-teams the model; its verdict is published unedited.
- **A forward-test gate** — nothing trades until a hypothesis survives the gauntlet *and* earns a live track record.

The dashboard's **"How it works"** tab documents all of this; every math term has an inline explainer.

## Data refresh

A daily GitHub Action (`.github/workflows/refresh-data.yml`) rebuilds the live snapshot (`docs/data.json`) and redeploys — no local machine needed. The validation/event-study/forecast artifacts are point-in-time and regenerate when their scripts are re-run.

## Disclaimer

Cascade is a research model. Nothing here is investment advice, a recommendation, or an offer. Figures are model estimates on a tiny event sample. The headline conclusion of the project is that the tradeable thesis **did not survive validation**. Do your own work.

## License

MIT
