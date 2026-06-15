'use strict';

/**
 * scripts/contrarian-study.js — the contrarian hypothesis through the gauntlet.
 *
 * PRE-REGISTERED HYPOTHESIS (stated before testing, derived from the event study):
 *   "When Taiwan reservoir stress peaks (a severe drought onset), going LONG the
 *    Taiwan-water-EXPOSED semiconductor basket and holding ~6 months earns a
 *    POSITIVE abnormal return vs the semi sector — because the feared curtailment
 *    never materialises (TSMC trucks/recycles water and keeps output near-full),
 *    so the drought discount fades."
 *
 * The honest danger: the +3.8% we saw is in-sample (the hypothesis came from those
 * same 6 events). So we do NOT just re-quote it. We run:
 *   1. Robustness across horizons (3/6/9/12m) and benchmarks (SOXX, SPY).
 *   2. MECHANISM: did the basket actually sell off INTO the drought (a discount to
 *      fade)? If it didn't, the post-gain is just beta/drift, not a contrarian edge.
 *   3. The decisive control — a PERMUTATION TEST: is the post-drought 6m abnormal
 *      return unusual versus entering at a RANDOM month? If the basket beats the
 *      sector entering any month, the drought signal adds nothing.
 *   4. Costs (trivial for an unlevered long) and per-event consistency.
 *
 * Writes docs/contrarian.json.
 */

const fs = require('fs');
const path = require('path');
const PX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'research', 'data', 'prices-monthly.json'), 'utf8'));
const analysis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'analysis.json'), 'utf8'));

const BASKET = analysis.watchlist.short.map((n) => n.ticker); // the Taiwan-water-EXPOSED names
const EVENTS = ['2011-05', '2015-04', '2018-05', '2020-05', '2021-04', '2023-04'];
const BENCH = 'SOXX';

function series(t) {
  const d = PX[t]; if (!d) return null;
  return d.map((r) => ({ ym: r.t.slice(0, 7), a: r.a })).filter((r) => Number.isFinite(r.a)).sort((x, y) => x.ym.localeCompare(y.ym));
}
const S = {}; for (const t of [...BASKET, BENCH, 'SPY']) S[t] = series(t);
const months = S[BENCH].map((r) => r.ym); // benchmark month axis

function fwd(t, ym, h) { const s = S[t]; if (!s) return null; const i = s.findIndex((r) => r.ym >= ym); if (i < 0 || i + h >= s.length || i + h < 0) return null; return s[i + h].a / s[i].a - 1; }
function abn(t, ym, h, bench) { const r = fwd(t, ym, h), b = fwd(bench, ym, h); return (r == null || b == null) ? null : r - b; }
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// basket-mean abnormal return entering at month `ym`, horizon h, vs bench
function basketAbn(ym, h, bench = BENCH) {
  const v = BASKET.map((t) => abn(t, ym, h, bench)).filter((x) => x != null);
  return v.length ? mean(v) : null;
}

// ── 1. horizons & benchmarks at the drought entries ─────────────────────────
const horizons = [3, 6, 9, 12];
const byHorizon = horizons.map((h) => {
  const vals = EVENTS.map((ym) => basketAbn(ym, h)).filter((x) => x != null);
  return { h, meanAbnormalPct: +(mean(vals) * 100).toFixed(1), n: vals.length };
});
const vsSPY = EVENTS.map((ym) => basketAbn(ym, 6, 'SPY')).filter((x) => x != null);

// ── 2. mechanism: run-up (−6m → onset) vs recovery (onset → +6m) ────────────
const runup = EVENTS.map((ym) => basketAbn(ym, -6)).filter((x) => x != null);   // negative h = backward
const recovery = EVENTS.map((ym) => basketAbn(ym, 6)).filter((x) => x != null);

// ── 3. permutation test: drought-entry vs random-entry (6m abnormal) ────────
const allMonthAbn = months.map((ym) => basketAbn(ym, 6)).filter((x) => x != null);
const baseMean = mean(allMonthAbn);                       // basket's avg 6m abnormal at ANY month
const droughtVals = EVENTS.map((ym) => basketAbn(ym, 6)).filter((x) => x != null);
const droughtMean = mean(droughtVals);
const k = droughtVals.length;
let ge = 0; const N = 20000;
for (let i = 0; i < N; i++) {
  let s = 0; for (let j = 0; j < k; j++) s += allMonthAbn[(Math.random() * allMonthAbn.length) | 0];
  if (s / k >= droughtMean) ge++;
}
const pPermutation = +(ge / N).toFixed(3);

// ── per-event detail ────────────────────────────────────────────────────────
const perEvent = EVENTS.map((ym) => ({ event: ym, runup6mPct: basketAbn(ym, -6) == null ? null : +(basketAbn(ym, -6) * 100).toFixed(1), fwd6mPct: basketAbn(ym, 6) == null ? null : +(basketAbn(ym, 6) * 100).toFixed(1) }));
const posEvents = recovery.filter((x) => x > 0).length;
const soldOffInto = runup.filter((x) => x < 0).length;

// ── verdict ──────────────────────────────────────────────────────────────────
const meanRunup = mean(runup), meanRecovery = mean(recovery);
const mechanismPresent = meanRunup < 0;        // did it actually sell off into droughts?
const specialVsRandom = pPermutation < 0.10;   // is the post-drought gain unusual (better than random)?
let verdict;
if (specialVsRandom && mechanismPresent && meanRecovery > 0.03 && posEvents >= 5) verdict = 'SURVIVES';
else if (pPermutation > 0.5 || !mechanismPresent) verdict = 'FAILS';  // drought timing adds nothing (or hurts), or no discount to fade
else verdict = 'INCONCLUSIVE';

const verdictText = {
  'SURVIVES': 'The post-drought gain is mechanistically grounded (the basket sold off into droughts, then recovered) AND beats a random-entry baseline. It survives the gauntlet enough to forward-test live — not yet to fund.',
  'INCONCLUSIVE': `Directionally positive but the permutation test (p=${pPermutation}) can't separate it from the basket's baseline tendency. Forward-test only; do not fund.`,
  'FAILS': `No edge. The decisive control kills it: entering at a RANDOM month beat the sector by +${(baseMean * 100).toFixed(0)}% over 6 months, vs only +${(droughtMean * 100).toFixed(1)}% entering at droughts — so drought timing was actually WORSE than random (permutation p=${pPermutation}). And the mechanism is absent: the basket did NOT sell off into droughts (only ${soldOffInto}/${runup.length}), so there was no fear-discount to fade. The apparent "+${(meanRecovery * 100).toFixed(1)}% contrarian gain" is just basket beta — these are high-growth, high-beta names (NVDA, ACMR, MRVL…) that beat the sector entering almost any time. The drought adds no information.`,
}[verdict];

const out = {
  generatedAt: new Date().toISOString(),
  hypothesis: 'LONG the Taiwan-water-exposed semi basket at a severe drought onset; hold ~6 months; capture the fade of an unrealised-curtailment discount.',
  basket: BASKET, events: EVENTS, benchmark: BENCH,
  horizons: byHorizon,
  vsSPY6mPct: +(mean(vsSPY) * 100).toFixed(1),
  mechanism: {
    meanRunup6mPct: +(meanRunup * 100).toFixed(1), soldOffIntoDroughts: `${soldOffInto}/${runup.length}`,
    meanRecovery6mPct: +(meanRecovery * 100).toFixed(1), roseAfter: `${posEvents}/${recovery.length}`,
    note: 'Contrarian edge needs a discount to fade: the basket should UNDERPERFORM into the drought (negative run-up) then RECOVER. If run-up is not negative, the post-gain is beta/drift, not a fade.',
  },
  permutation: { droughtEntryMean6mPct: +(droughtMean * 100).toFixed(1), randomEntryMean6mPct: +(baseMean * 100).toFixed(1), pValue: pPermutation, draws: N,
    note: 'p = chance that entering at 6 RANDOM months beats this drought-entry result. Small p = the drought signal adds real information beyond the basket\'s baseline tendency.' },
  costs: 'Unlevered long basket: round-trip frictions ~0.1–0.2%, immaterial vs the effect size. No borrow. Costs do not change the verdict.',
  perEvent,
  verdict, verdictText,
  caveats: [
    `${k} events — not enough for statistical proof; the permutation test mitigates but cannot cure this.`,
    'Overlapping 6-month windows are autocorrelated, which makes the permutation p optimistic (too small).',
    'Hypothesis was generated from these same events — only a true forward test (below) is genuinely out-of-sample.',
    'Confounders uncontrolled: 2020 COVID rebound, 2021 AI boom, 2023 AI boom all fell in the post-drought windows.',
  ],
};
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'contrarian.json'), JSON.stringify(out, null, 2));
console.log('horizons:', byHorizon.map((x) => `${x.h}m:${x.meanAbnormalPct}%`).join(' '));
console.log('mechanism: runup', out.mechanism.meanRunup6mPct + '%', `(soldOff ${out.mechanism.soldOffIntoDroughts})`, '-> recovery', out.mechanism.meanRecovery6mPct + '%', `(rose ${out.mechanism.roseAfter})`);
console.log('permutation: drought', droughtMean * 100 | 0, '% vs random baseline', baseMean * 100 | 0, '% | p =', pPermutation);
console.log('VERDICT:', verdict);
