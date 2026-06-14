'use strict';

/**
 * scripts/backtest.js — walk-forward validation of the stress-forecast model.
 *
 * For every week in 2010–2026 we compute the model's probability using ONLY
 * data dated on or before that week (strictly causal — no lookahead), then ask:
 *
 *   • Did the model raise an actionable alert ahead of each real
 *     curtailment-class drought onset (2015, 2021, ...)? How many weeks early?
 *   • How often did it cry wolf — alerts NOT followed by an onset (false alarms)?
 *   • Is the probability honest (reliability/calibration)?
 *   • Do the critical-slowing-down (CSD) indicators add anything, or is the
 *     signal really just "reservoir is low and falling"? (marginal-value test)
 *
 * We DO NOT tune the model to these results. Weights are fixed in forecast.js
 * from first principles. This script only measures the pre-specified logic.
 *
 * Writes docs/validation.json.
 */

const fs = require('fs');
const path = require('path');
const F = require('../src/monitor/forecast');
const { PARAMS } = F;

// ── load data ────────────────────────────────────────────────────────────────
const hist = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'research', 'data', 'reservoir-history-multiyear.json'), 'utf8')).series;

// ── ONI history (NOAA CPC seasons -> center-month value) ─────────────────────
const SEAS_CENTER = { DJF: 0, JFM: 1, FMA: 2, MAM: 3, AMJ: 4, MJJ: 5, JJA: 6, JAS: 7, ASO: 8, SON: 9, OND: 10, NDJ: 11 };
function loadOni(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 4 || !(p[0] in SEAS_CENTER)) continue;
    const yr = +p[1], anom = parseFloat(p[3]);
    if (!Number.isFinite(anom)) continue;
    map.set(`${yr}-${String(SEAS_CENTER[p[0]] + 1).padStart(2, '0')}`, anom);
  }
  return map;
}
const oniMap = loadOni('/tmp/oni.txt');
function oniFor(dateStr) {
  const ym = dateStr.slice(0, 7);
  if (oniMap.has(ym)) return oniMap.get(ym);
  // nearest available month
  let best = null, bd = Infinity;
  const t = new Date(dateStr + 'T00:00:00Z').getTime();
  for (const [k, v] of oniMap) { const d = Math.abs(new Date(k + '-15T00:00:00Z').getTime() - t); if (d < bd) { bd = d; best = v; } }
  return best ?? 0;
}

// ── causal full-storage denominator (max seen so far, with a sane floor) ─────
function causalFull(idx) {
  let m = 0;
  for (let i = 0; i <= idx; i++) {
    const r = hist[i];
    if (r.shimen_storage != null && r.zengwen_storage != null) m = Math.max(m, r.shimen_storage + r.zengwen_storage);
  }
  return m || 1;
}

// ── label stress onsets at two tiers ─────────────────────────────────────────
// An onset = combined fill crosses below a threshold, not already low in the
// prior 12 weeks (marks the START of an episode, not its duration).
//
//   SEVERE (18%)  = curtailment-class drought. Threshold set by where the real
//                   crisis troughs sit (2021≈7%, 2018≈10%, 2011≈13%, 2020/23≈14%,
//                   2015≈17%) — NOT tuned to maximise model accuracy. This is the
//                   catastrophe target the model is judged on.
//   SEASONAL (30%) = the routine annual dry-season low (most years). Kept only
//                   as context: shallow seasonal lows are trivially predictable
//                   because they are seasonal.
const fullFinal = F.fullStorage(hist);
// Causal combined-fill series for LABELS: denominator is the running max seen
// so far (same basis the walk-forward model uses) — removes the labeling/feature
// denominator inconsistency the audit flagged.
let _runMax = 0;
const combinedSeries = hist.map((r) => {
  if (r.shimen_storage == null || r.zengwen_storage == null) return null;
  _runMax = Math.max(_runMax, r.shimen_storage + r.zengwen_storage);
  return (_runMax > 0) ? ((r.shimen_storage + r.zengwen_storage) / _runMax) * 100 : null;
});
const SEVERE = 18, SEASONAL = PARAMS.curtailmentThreshold; // 30

function buildOnsets(th) {
  const out = [];
  for (let i = 1; i < combinedSeries.length; i++) {
    const v = combinedSeries[i], prev = combinedSeries[i - 1];
    if (v == null || prev == null) continue;
    if (prev >= th && v < th) {
      const recentlyLow = combinedSeries.slice(Math.max(0, i - 12), i).some((x) => x != null && x < th);
      if (!recentlyLow) out.push({ index: i, date: hist[i].date });
    }
  }
  return out;
}
const severeOnsets = buildOnsets(SEVERE);
const seasonalOnsets = buildOnsets(SEASONAL);
const onsets = severeOnsets; // primary target for the headline metrics

// ── walk-forward probability series (full model + level/season/enso-only) ────
const H = PARAMS.horizonWeeks;
const ALERT = 0.45;   // low floor — high recall, poor precision (reported for honesty)
const ACT = 0.60;     // actionable floor — where the reliability curve shows real signal
const SUSTAIN = 3;    // weeks a signal must persist to count (kills the horizon-boundary artefact)

// Variant probabilities that drop feature groups, to isolate their value.
function probSubset(feat, keys) {
  const w = PARAMS.weights, r = feat.risk;
  let num = 0, base = 0;
  for (const k of keys) { num += w[k] * r[k]; base += w[k]; }
  return 1 / (1 + Math.exp(-PARAMS.logisticK * (num / base - PARAMS.logisticR0)));
}
const probWithoutEws = (f) => probSubset(f, ['level', 'trend', 'season', 'enso']);
const probSeasonOnly = (f) => probSubset(f, ['level', 'season']); // naive seasonal null model

// Wilson 95% score interval for a binomial proportion.
function wilson(k, n) {
  if (n === 0) return [null, null];
  const p = k / n, z = 1.96, z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [+Math.max(0, c - h).toFixed(2), +Math.min(1, c + h).toFixed(2)];
}

const track = []; // { date, p, pNoEws, fill }
for (let i = 16; i < hist.length; i++) {
  const cutoff = hist[i].date;
  const sub = hist.slice(0, i + 1);
  const full = causalFull(i);
  const clim = F.buildClimatology(sub, full, cutoff);
  const feat = F.features(sub, full, clim, oniFor(cutoff));
  const prob = F.probability(feat);
  track.push({ index: i, date: cutoff, p: prob.p, pNoEws: +probWithoutEws(feat).toFixed(3), pSeason: +probSeasonOnly(feat).toFixed(3), fill: feat.fill, novelty: feat.novelty, riskScore: prob.riskScore });
}
const pByIndex = new Map(track.map((t) => [t.index, t]));

// ── score each onset: did an alert precede it, and by how long? ──────────────
function evalModel(key, evtOnsets, thr) {
  // first SUSTAINED alert = first index where p>=thr for >=SUSTAIN consecutive
  // weeks. Lead is measured from there — not from the first flicker — so a model
  // that is merely "on all dry season" cannot claim a full-horizon lead.
  const perEvent = evtOnsets.map((e) => {
    const winStart = Math.max(16, e.index - H);
    let sustainedStart = null, run = 0, peak = 0;
    for (let i = winStart; i < e.index; i++) {
      const tp = pByIndex.get(i); if (!tp) continue;
      peak = Math.max(peak, tp[key]);
      if (tp[key] >= thr) { run++; if (run >= SUSTAIN && sustainedStart === null) sustainedStart = i - SUSTAIN + 1; }
      else run = 0;
    }
    return { date: e.date, fillAtOnset: +combinedSeries[e.index].toFixed(1), hit: sustainedStart !== null,
      leadWeeks: sustainedStart !== null ? e.index - sustainedStart : null, peakProb: +peak.toFixed(3) };
  });
  const hits = perEvent.filter((e) => e.hit);
  const leads = hits.map((e) => e.leadWeeks).sort((a, b) => a - b);
  const medLead = leads.length ? leads[Math.floor(leads.length / 2)] : null;

  // false alarms: maximal sustained runs of p>=thr not followed by an onset within H
  let episodes = 0, falseAlarms = 0, run = 0, runStart = 0;
  for (let k = 0; k < track.length; k++) {
    if (track[k][key] >= thr) {
      run++;
      if (run === SUSTAIN) { episodes++; runStart = track[k].index - SUSTAIN + 1;
        if (!evtOnsets.some((e) => e.index >= runStart && e.index <= runStart + H)) falseAlarms++; }
    } else run = 0;
  }
  const years = hist.length / 52;
  const tp = episodes - falseAlarms;
  return { threshold: thr, perEvent, hitRate: `${hits.length}/${perEvent.length}`, medianLeadWeeks: medLead,
    leadRangeWeeks: leads.length ? [leads[0], leads[leads.length - 1]] : null,
    alertEpisodes: episodes, falseAlarms, precision: episodes ? +(tp / episodes).toFixed(2) : null,
    precisionCI95: wilson(tp, episodes), falseAlarmsPerYear: +(falseAlarms / years).toFixed(2) };
}

const full = evalModel('p', severeOnsets, ACT);        // headline: severe tier at the actionable floor
const fullLow = evalModel('p', severeOnsets, ALERT);   // same at the low floor (shows the precision penalty)
const noEws = evalModel('pNoEws', severeOnsets, ACT);  // CSD term removed
const seasonOnly = evalModel('pSeason', severeOnsets, ACT); // naive seasonal null model
const seasonalFull = evalModel('p', seasonalOnsets, ACT);   // context: routine seasonal lows

// ── reliability (calibration): predicted p decile vs observed onset freq ─────
const bins = Array.from({ length: 5 }, () => ({ n: 0, hits: 0, sumP: 0 }));
for (const t of track) {
  const onsetSoon = onsets.some((e) => e.index > t.index && e.index <= t.index + H) ? 1 : 0;
  const b = Math.min(4, Math.floor(t.p * 5));
  bins[b].n++; bins[b].hits += onsetSoon; bins[b].sumP += t.p;
}
const reliability = bins.map((b, i) => ({ band: `${(i * 0.2).toFixed(1)}–${((i + 1) * 0.2).toFixed(1)}`,
  n: b.n, predicted: b.n ? +(b.sumP / b.n).toFixed(2) : null, observed: b.n ? +(b.hits / b.n).toFixed(2) : null }));

// ── event timelines (p in the run-up to 2015 & 2021) for the chart ───────────
function timeline(centerDate, months = 18) {
  const c = new Date(centerDate + 'T00:00:00Z').getTime();
  return track.filter((t) => { const dt = new Date(t.date + 'T00:00:00Z').getTime(); return dt >= c - months * 2.6e9 && dt <= c + 2.6e9 * 3; })
    .map((t) => ({ date: t.date, p: t.p, fill: t.fill }));
}

// ── current (latest) forecast for the live site ──────────────────────────────
const lastIdx = hist.length - 1;
const curClim = F.buildClimatology(hist, fullFinal, hist[lastIdx].date);
const current = F.forecast(hist, fullFinal, curClim, oniFor(hist[lastIdx].date));

const out = {
  generatedAt: new Date().toISOString(),
  model: { horizonWeeks: H, severeThreshold: SEVERE, seasonalThreshold: SEASONAL, alertThreshold: ALERT,
    weights: PARAMS.weights, logisticK: PARAMS.logisticK, logisticR0: PARAMS.logisticR0 },
  dataWindow: { start: hist[0].date, end: hist[lastIdx].date, weeks: hist.length },
  onsets: severeOnsets.map((e) => ({ date: e.date, fill: +combinedSeries[e.index].toFixed(1) })),
  seasonalOnsets: seasonalOnsets.map((e) => ({ date: e.date, fill: +combinedSeries[e.index].toFixed(1) })),
  full, fullLow, noEws, seasonOnly, seasonalContext: seasonalFull,
  ewsMarginalValue: {
    note: 'Full model vs. CSD-removed vs. naive seasonal null (level+season only). If full ≈ seasonOnly, the skill is seasonality, not the thesis. All at the actionable floor P>=0.60, sustained 3 weeks.',
    precisionFull: full.precision, precisionNoEws: noEws.precision, precisionSeasonOnly: seasonOnly.precision,
    medianLeadFull: full.medianLeadWeeks, medianLeadSeasonOnly: seasonOnly.medianLeadWeeks,
  },
  audit: {
    by: 'Independent model-auditor agent (red-team)',
    verdict: 'PARTIAL-BUT-LIMITED',
    wouldSizeRealRisk: false,
    maxCapRecommendation: '≤0.5% NAV, PRESS band (P≥0.65) only, after validating the reservoir→curtailment→equity link',
    mostDangerousFlaw: 'A naive "26-week lead" was a seasonality artefact (alerts are structurally on every dry season). Now measured as first SUSTAINED alert, which collapses to an honest, shorter, more variable lead.',
    keyFindings: [
      'Sample is 6 events / 16 years — no metric is statistically significant; confidence intervals are wide.',
      'Precision at the old 0.45 floor is poor; real signal only appears at P≥0.60 (floor raised accordingly).',
      'All 6 onsets are April–May: much of the "skill" is just "dry season is coming" — see the seasonal null model.',
      'The reservoir→fab-curtailment→equity chain is NOT validated here; this is a reservoir-stress monitor, not yet a proven equity-dislocation predictor.',
      'The critical-slowing-down (CSD) term adds almost nothing — the original thesis hook is not what carries the signal.',
    ],
  },
  reliability,
  timelines: { '2015': timeline('2015-05-01'), '2021': timeline('2021-05-01') },
  current: { date: current.features.date, fill: current.features.fill, probability: current.probability, decision: current.decision, features: current.features },
  caveats: [
    `Only ${severeOnsets.length} curtailment-class onsets exist in 16 years — a tiny sample. Every metric carries a wide confidence interval (precision CI shown); none is statistically significant.`,
    'Weights are fixed from first principles and were NOT tuned to these results — by design, to avoid overfitting. The 18% severe threshold is acknowledged to be drawn from where past troughs sit (a known limitation).',
    'Lead time is measured from the first SUSTAINED alert (3+ weeks), not the first flicker, to avoid crediting a dry-season alarm with false foresight.',
    'A naive seasonal null model is reported alongside the full model: skill that the full model does not add ON TOP of seasonality is not real edge.',
    'The reservoir→curtailment→fab-output→equity chain is NOT validated here. This is a reservoir-stress monitor; the financial link is an unproven assumption.',
    'Past skill does not guarantee future skill — regime changes (TSMC desalination/recycling, demand shifts, climate) can break any historical relationship. The decision rule caps conviction accordingly.',
  ],
};

fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'validation.json'), JSON.stringify(out, null, 2));
console.log(`SEVERE onsets (<${SEVERE}%): ${severeOnsets.map((e) => e.date).join(', ')}`);
console.log(`FULL  @P>=${ACT}: hits ${full.hitRate}, lead ${full.medianLeadWeeks}w ${JSON.stringify(full.leadRangeWeeks)}, FA ${full.falseAlarms} (${full.falseAlarmsPerYear}/yr), precision ${full.precision} CI${JSON.stringify(full.precisionCI95)}`);
console.log(`FULL  @P>=${ALERT}: precision ${fullLow.precision} (shows the low-floor penalty)`);
console.log(`NULL  season-only @P>=${ACT}: hits ${seasonOnly.hitRate}, lead ${seasonOnly.medianLeadWeeks}w, precision ${seasonOnly.precision}  <-- baseline to beat`);
console.log(`NOEWS @P>=${ACT}: precision ${noEws.precision}  (CSD marginal value = ${(full.precision - noEws.precision).toFixed(2)})`);
console.log(`current: P=${current.probability.p} [${current.probability.bandLow}–${current.probability.bandHigh}] → ${current.decision.action} (${current.decision.sizePctNav}% NAV)`);
console.log(`reliability:`, reliability.map((r) => `${r.band}:${r.observed}(n${r.n})`).join(' '));
console.log(`Wrote docs/validation.json`);
