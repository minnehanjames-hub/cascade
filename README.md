# Cascade — Hydro-Semiconductor Risk Engine

**A research engine that asks whether hydrological stress in the semiconductor supply chain is a tradeable, underpriced systemic risk — and then honestly tests the answer.**

🔗 **Live dashboard:** https://minnehanjames-hub.github.io/cascade/

---

## In plain terms

The world's most advanced computer chips need *enormous* amounts of clean water to make — and almost all of them are built in just two drought-prone places (Taiwan and Arizona). This project asks: **if those places run dry, can you see it coming and make money betting on it?**

It pulls 16 years of real reservoir data and stress-tests the idea honestly. The verdict it reached: **you *can* predict the droughts months ahead — but you *can't* profitably trade them**, because the chip factories keep running through droughts anyway (trucking water in, recycling, desalination). The real achievement is a research engine disciplined enough to disprove its own moneymaking idea *before* any money was at risk.

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

## The agents behind the verdict

Cascade doesn't reach a conclusion from one model — it runs the thesis past a simulated **investment committee** of five independent agents, each with a different mandate. They deliberately disagree, and the final call is the *reconciliation* of their views, not a single voice. (Their full write-ups live in `docs/analysis.json` and the "Desk" tab of the dashboard.)

| Agent | Role | Their job in the verdict | Current stance |
|---|---|---|---|
| **Derek Voss** | Fundamental Single-Name / Short-Seller | Bottom-up: is a specific stock's water dependency *underpriced* vs. what's already in the price? Flags NVDA's near-total reliance on TSMC. | SHORT |
| **Priya Nair** | Event-Driven / Special Situations | Hunts asymmetric payoffs — cheap "tail insurance" (put options) that pays off big if a drought actually bites. | LONG PUTS |
| **Marcus Reid** | Global Macro | Top-down: the mispricing is real, but is there a *catalyst now*? Watches ENSO, reservoir levels, the cycle. Says "real risk, wrong moment." | FLAT-WATCH |
| **Helena Koh** | Chief Risk Officer / Skeptic | Capital preservation. Argues that when the engine's *own* stress score reads near-zero, you don't bet — and shorting a refilling reservoir is shorting your own thesis. | FLAT-WATCH |
| **Model-Auditor** | Independent red-team (in `validation.json`) | Doesn't trade. Attacks the *methodology* — catches that the headline "26-week lead" was a seasonality artifact, that the sample is just 6 events in 16 years, and that the reservoir→stock link is unproven. Its unedited verdict: **PARTIAL-BUT-LIMITED**. |

**How they combine into the conclusion:** the two bulls (Voss, Nair) make the case for a position; the macro and risk seats (Reid, Koh) gate it on timing and base rates; and the red-team auditor invalidates any "edge" that's really just seasonality or too small a sample to trust. The net result is the project's honest headline — **a real early-warning signal, but zero validated tradeable signals today** — sized at "starter / optionality only" precisely because the committee never reaches consensus to do more.

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
