'use strict';

/**
 * scripts/event-study.js — the keystone test of the whole thesis.
 *
 * Question: when a real Taiwan curtailment-class drought hit, did the
 * watchlist stocks actually move — specifically, did the SHORT basket
 * UNDERPERFORM the semiconductor sector, and the LONG basket outperform?
 *
 * Method (classic market-adjusted event study, monthly):
 *   - Events = the 6 severe drought onsets the forecast model validated against
 *     (combined fill crossing <18%), 2011–2023.
 *   - For each event and each ticker, compute the forward return over +3 and +6
 *     months from the event month, then subtract the sector benchmark's return
 *     (SOXX) over the same window = ABNORMAL return. (Also vs SPY, and raw.)
 *   - A negative abnormal return for a SHORT name = thesis-consistent (it fell
 *     vs peers). Positive for a LONG name = thesis-consistent.
 *   - Aggregate per ticker and per basket; compare event-window abnormal to the
 *     full-sample baseline (which is ~0 by construction).
 *
 * Honesty: 6 events is tiny; several benchmark constituents ARE test names, which
 * dampens measured effect; monthly resolution is coarse. We report sign-hit
 * rates and spreads, not just means, and flag that nothing is significant.
 *
 * Reads research/data/prices-monthly.json. Writes docs/event-study.json.
 */

const fs = require('fs');
const path = require('path');

const PX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'research', 'data', 'prices-monthly.json'), 'utf8'));
const analysis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'analysis.json'), 'utf8'));

const SHORT = analysis.watchlist.short.map((n) => n.ticker);
const LONG = analysis.watchlist.long.map((n) => n.ticker);
const BENCH = 'SOXX';      // semiconductor sector (primary)
const BENCH2 = 'SPY';      // broad market (secondary)
const EVENTS = ['2011-05', '2015-04', '2018-05', '2020-05', '2021-04', '2023-04']; // severe onsets
const HORIZONS = [3, 6];   // months forward

// each series: ascending by date, [{ym, a}]
function series(t) {
  const d = PX[t];
  if (!d) return null;
  return d.map((r) => ({ ym: r.t.slice(0, 7), a: r.a }))
    .filter((r) => Number.isFinite(r.a))
    .sort((x, y) => x.ym.localeCompare(y.ym));
}
const S = {};
for (const t of [...SHORT, ...LONG, BENCH, BENCH2]) S[t] = series(t);

// forward return of ticker t from event month, h months ahead
function fwd(t, ym, h) {
  const s = S[t]; if (!s) return null;
  const i = s.findIndex((r) => r.ym >= ym);
  if (i < 0 || i + h >= s.length) return null;
  return s[i + h].a / s[i].a - 1;
}

function abnormal(t, ym, h, bench) {
  const r = fwd(t, ym, h), b = fwd(bench, ym, h);
  if (r == null || b == null) return null;
  return r - b;
}

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// ── per-ticker results across events (at +6m, vs SOXX) ───────────────────────
function tickerResult(t, sleeve) {
  const perEvent = EVENTS.map((ym) => ({
    event: ym,
    ab6: abnormal(t, ym, 6, BENCH),
    ab3: abnormal(t, ym, 3, BENCH),
    raw6: fwd(t, ym, 6),
  })).filter((e) => e.ab6 != null);
  const ab6s = perEvent.map((e) => e.ab6);
  // thesis-consistent sign: SHORT wants negative abnormal, LONG positive
  const consistent = ab6s.filter((x) => (sleeve === 'short' ? x < 0 : x > 0)).length;
  return {
    ticker: t, sleeve, nEvents: perEvent.length,
    meanAbnormal6m: ab6s.length ? +(mean(ab6s) * 100).toFixed(1) : null,
    meanAbnormal3m: perEvent.length ? +(mean(perEvent.map((e) => e.ab3)) * 100).toFixed(1) : null,
    rangeAbnormal6m: ab6s.length ? [+(Math.min(...ab6s) * 100).toFixed(0), +(Math.max(...ab6s) * 100).toFixed(0)] : null,
    consistentSign: `${consistent}/${perEvent.length}`,
    perEvent: perEvent.map((e) => ({ event: e.event, abnormal6m: +(e.ab6 * 100).toFixed(1) })),
  };
}

const shortRes = SHORT.map((t) => tickerResult(t, 'short'));
const longRes = LONG.map((t) => tickerResult(t, 'long'));

// ── basket-level: equal-weight mean abnormal per event, then across events ───
function basketByEvent(tickers, sleeve) {
  const rows = EVENTS.map((ym) => {
    const vals = tickers.map((t) => abnormal(t, ym, 6, BENCH)).filter((x) => x != null);
    return { event: ym, n: vals.length, meanAbnormal6m: vals.length ? +(mean(vals) * 100).toFixed(1) : null };
  }).filter((r) => r.n > 0);
  const ms = rows.map((r) => r.meanAbnormal6m);
  // simple t-stat across events (underpowered — flagged)
  const m = mean(ms);
  const sd = ms.length > 1 ? Math.sqrt(ms.map((x) => (x - m) ** 2).reduce((a, b) => a + b, 0) / (ms.length - 1)) : null;
  const t = (sd && sd > 0) ? +(m / (sd / Math.sqrt(ms.length))).toFixed(2) : null;
  const consistentEvents = ms.filter((x) => (sleeve === 'short' ? x < 0 : x > 0)).length;
  return { sleeve, perEvent: rows, grandMeanAbnormal6m: +m.toFixed(1), tStat: t,
    consistentEvents: `${consistentEvents}/${ms.length}` };
}
const shortBasket = basketByEvent(SHORT, 'short');
const longBasket = basketByEvent(LONG, 'long');

// long-short spread per event (short underperformance + long outperformance)
const longShort = EVENTS.map((ym) => {
  const s = SHORT.map((t) => abnormal(t, ym, 6, BENCH)).filter((x) => x != null);
  const l = LONG.map((t) => abnormal(t, ym, 6, BENCH)).filter((x) => x != null);
  if (!s.length || !l.length) return null;
  // a profitable book is SHORT the short basket (gain = -shortAbnormal) + LONG the long basket
  return { event: ym, spread6m: +(((-mean(s)) + mean(l)) * 100).toFixed(1) };
}).filter(Boolean);
const lsMean = +mean(longShort.map((x) => x.spread6m)).toFixed(1);

// ── verdict ──────────────────────────────────────────────────────────────────
const shortConsistent = Number(shortBasket.consistentEvents.split('/')[0]);
let verdict;
if (shortBasket.grandMeanAbnormal6m <= -3 && shortConsistent >= 4 && lsMean >= 5) verdict = 'SUPPORTED';
else if (lsMean <= -3 || shortBasket.grandMeanAbnormal6m >= 3) verdict = 'NOT SUPPORTED';
else verdict = 'INCONCLUSIVE';
const verdictText = {
  'SUPPORTED': 'After real Taiwan droughts the short basket underperformed the sector and the long-short book made money — the water→equity link has empirical support (still a tiny sample).',
  'INCONCLUSIVE': 'Thesis-consistent moves in some events, contradictory in others, all well within noise for a 6-event sample. No reliable edge either way.',
  'NOT SUPPORTED': 'After real Taiwan droughts, the watchlist stocks did NOT underperform their sector — if anything they outperformed, and the thesis-structured long-short book LOST money over the following 6 months. The reservoir→equity link is not visible in the price record. The basket is an elegant hypothesis without a measurable market footprint — consistent with the fact that TSMC kept output near-full through every one of these droughts.',
}[verdict];

const out = {
  generatedAt: new Date().toISOString(),
  method: { events: EVENTS, horizonsMonths: HORIZONS, benchmark: BENCH, benchmark2: BENCH2,
    note: 'Market-adjusted forward returns (ticker minus SOXX) over 3 and 6 months from each severe drought onset. Negative=thesis-consistent for shorts; positive for longs.' },
  shortBasket, longBasket, longShortSpread: { perEvent: longShort, grandMean6m: lsMean },
  shortTickers: shortRes, longTickers: longRes,
  verdict, verdictText,
  caveats: [
    'Six events is far too few for statistical significance — treat every number as indicative, not proof. The t-stats are reported but underpowered.',
    'The SOXX benchmark contains several of the test names (NVDA, LRCX, …), which dampens measured under/over-performance — a conservative bias.',
    'Monthly resolution; event = drought onset month, which may already be partly priced (reservoirs were visibly low for months prior).',
    'Coverage varies: GFS only exists from 2021, ACMR from 2017, so early events use fewer names.',
    'This tests correlation of price with reservoir stress, not a clean causal curtailment→revenue→price chain. Confounders (COVID 2020, the 2021 chip boom, 2022–23 rate shock) are not controlled.',
  ],
};

fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'event-study.json'), JSON.stringify(out, null, 2));
console.log('SHORT basket abnormal 6m:', shortBasket.grandMeanAbnormal6m + '%', '| consistent', shortBasket.consistentEvents, '| t', shortBasket.tStat);
console.log('LONG  basket abnormal 6m:', longBasket.grandMeanAbnormal6m + '%', '| consistent', longBasket.consistentEvents);
console.log('LONG-SHORT book 6m:', lsMean + '%');
console.log('per-event short:', shortBasket.perEvent.map((e) => `${e.event}:${e.meanAbnormal6m}%`).join('  '));
console.log('VERDICT:', verdict);
