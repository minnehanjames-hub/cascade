'use strict';

/**
 * src/monitor/forecast.js — deterministic stress-forecast model.
 *
 * Turns measured hydrological state into a calibrated probability that a
 * curtailment-class reservoir-stress event occurs within a forward horizon,
 * and applies a PRE-REGISTERED decision rule that maps that probability to an
 * action and a position size.
 *
 * DESIGN PHILOSOPHY (this is the important part):
 *
 *   1. Every input is a real, causal measurement — at time t the model only
 *      ever sees data dated <= t. No lookahead.
 *
 *   2. The model is deliberately LOW-PARAMETER and INTERPRETABLE. The feature
 *      weights below are set from first principles (hydrology + the physical
 *      curtailment logic), NOT fitted to maximise backtest accuracy. We refuse
 *      to curve-fit to two historical droughts — that is exactly how a
 *      backtest becomes a trap.
 *
 *   3. The backtest (scripts/backtest.js) is used to CHECK whether this
 *      pre-specified logic has any skill and to coarsely calibrate the
 *      probability scale — never to choose the per-feature weights.
 *
 *   4. Regime humility is built in: when current state sits outside the
 *      historical envelope, the model raises a `novelty` flag, widens its
 *      uncertainty band, and the decision rule caps conviction. A clean
 *      backtest is never allowed to become false certainty.
 *
 *   5. The "critical slowing down" indicators (AR1/variance) are included only
 *      as a small secondary term. Hydrological STATE (how low, how fast,
 *      what season, what ENSO phase) carries the signal; CSD is a minor add
 *      and is reported separately so its (weak) contribution is never hidden.
 *
 * Pure functions, no external deps. The doc comments here are also the source
 * of truth for the front-end "How it works" explainer.
 */

// ── Model parameters (first-principles; see rationale on each line) ───────────

const PARAMS = {
  // Forward horizon we forecast over.
  horizonWeeks: 26, // ~6 months — long enough to pre-position, short enough to be falsifiable

  // Curtailment-class stress is defined on storage-weighted combined fill.
  curtailmentThreshold: 30, // % combined fill; both 2015 & 2021 restriction periods sat well below this

  // Feature weights — MUST sum to 1. Rationale, not optimisation:
  weights: {
    level: 0.42,  // how unusually low storage is vs the seasonal norm — the dominant driver
    trend: 0.18,  // drawdown speed — a fast fall is more dangerous than a low-but-stable level
    season: 0.18, // dry-season phase — low storage with no recharge window ahead is the danger case
    enso: 0.15,   // La Nina is the documented precursor to the 2015 & 2021 droughts
    ews: 0.07,    // critical-slowing-down indicators — deliberately small, secondary
  },

  // Probability calibration (the ONLY two numbers the backtest is allowed to
  // nudge, and only coarsely, to match the observed base rate of events):
  logisticK: 5.0,   // slope — how sharply risk score maps to probability
  logisticR0: 0.55, // risk score that maps to P = 0.50

  // Uncertainty band (small-sample + regime humility):
  baseBandPct: 12,     // ± points from the inherent small-sample uncertainty (only ~2 major events)
  noveltyBandPct: 10,  // extra ± when current state is outside the historical envelope

  // Decision bands (probability -> action). Hand-set, not fitted to maximise a
  // metric. NOTE: the STARTER floor was raised 0.45 -> 0.55 after the reliability
  // check showed the 0.45-0.55 zone is NOT yet predictive (observed ~16% vs a
  // ~50% implied) — a one-time, conservative recalibration in the direction of
  // LESS risk. Real signal only appears at P>=0.60 (see validation reliability).
  bands: [
    { min: 0.00, action: 'STAND DOWN', nominal: 0.0 },
    { min: 0.25, action: 'WATCH',      nominal: 0.0 },
    { min: 0.55, action: 'STARTER',    nominal: 0.02 }, // 2% NAV nominal
    { min: 0.65, action: 'PRESS',      nominal: 0.05 }, // 5% NAV nominal
    { min: 0.80, action: 'MAX',        nominal: 0.07 }, // 7% NAV nominal
  ],

  // Conviction caps — encode the lesson that a clean backtest is not certainty.
  smallSampleCap: 0.60, // never deploy more than 60% of nominal on a 2-event track record
  noveltyCap: 0.70,     // multiply sizing by 0.70 again when state is novel
};

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const logistic = (z) => 1 / (1 + Math.exp(-z));
const isoWeek = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return wk;
};

// ── Combined fill (storage-weighted), consistent with the live build ─────────

function combinedFill(row, full) {
  if (row.shimen_storage == null || row.zengwen_storage == null) return null;
  return ((row.shimen_storage + row.zengwen_storage) / full) * 100;
}

/** Max observed combined storage in a series ≈ "full" denominator. */
function fullStorage(series) {
  let m = 0;
  for (const r of series) {
    if (r.shimen_storage != null && r.zengwen_storage != null) {
      m = Math.max(m, r.shimen_storage + r.zengwen_storage);
    }
  }
  return m || 1;
}

// ── Climatology: per ISO-week distribution of combined fill ──────────────────

/**
 * Build a seasonal climatology (median + 10th/90th percentile of combined fill
 * for each ISO week) from history available UP TO a cutoff. Causal: a backtest
 * at time t only learns the climatology from weeks <= t.
 */
function buildClimatology(series, full, cutoffDate) {
  const buckets = new Map(); // isoWeek -> [fills]
  for (const r of series) {
    if (cutoffDate && r.date > cutoffDate) continue;
    const f = combinedFill(r, full);
    if (f == null) continue;
    const w = isoWeek(r.date);
    if (!buckets.has(w)) buckets.set(w, []);
    buckets.get(w).push(f);
  }
  const clim = new Map();
  for (const [w, arr] of buckets) {
    arr.sort((a, b) => a - b);
    const q = (p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))))];
    clim.set(w, { n: arr.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), min: arr[0], max: arr[arr.length - 1] });
  }
  return clim;
}

/** Percentile rank (0..1) of a value within a week's climatological samples. */
function climPercentile(clim, week, value) {
  const c = clim.get(week);
  if (!c) return 0.5;
  // linear interpolation across p10/p50/p90 anchors
  if (value <= c.p10) return 0.1 * clamp((value - c.min) / Math.max(1e-6, c.p10 - c.min), 0, 1);
  if (value <= c.p50) return 0.1 + 0.4 * (value - c.p10) / Math.max(1e-6, c.p50 - c.p10);
  if (value <= c.p90) return 0.5 + 0.4 * (value - c.p50) / Math.max(1e-6, c.p90 - c.p50);
  return clamp(0.9 + 0.1 * (value - c.p90) / Math.max(1e-6, c.max - c.p90), 0, 1);
}

// ── Seasonal dry-phase risk (first-principles Taiwan hydrology) ──────────────
// Recharge is concentrated May–Oct (plum rains + typhoons). Storage entering
// the Nov–Apr dry season with no recharge window ahead is the danger case.
const MONTH_DRY_RISK = [0.85, 0.95, 0.95, 0.85, 0.55, 0.25, 0.10, 0.10, 0.20, 0.35, 0.60, 0.80];
//                       Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec

// ── EWS (critical slowing down) secondary term ───────────────────────────────
function kendallTau(x) {
  const n = x.length; if (n < 3) return 0;
  let c = 0, d = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const s = Math.sign(x[j] - x[i]); if (s > 0) c++; else if (s < 0) d++;
  }
  const den = c + d; return den === 0 ? 0 : (c - d) / den;
}
function detrendResid(x, w = 5) {
  const half = Math.floor(w / 2), out = [];
  for (let i = 0; i < x.length; i++) {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - half); j < Math.min(x.length, i + half + 1); j++) { s += x[j]; k++; }
    out.push(x[i] - s / k);
  }
  return out;
}
function rollingAr1Tau(fills) {
  if (fills.length < 16) return 0;
  const res = detrendResid(fills, 5);
  const win = 12, ar1s = [];
  for (let end = win; end <= res.length; end++) {
    const s = res.slice(end - win, end), m = s.reduce((a, b) => a + b, 0) / s.length;
    let num = 0, den = 0;
    for (let i = 0; i < s.length; i++) { const dd = s[i] - m; den += dd * dd; if (i < s.length - 1) num += dd * (s[i + 1] - m); }
    ar1s.push(den < 1e-9 ? 0 : num / den);
  }
  return kendallTau(ar1s);
}

// ── Feature extraction (strictly causal) ─────────────────────────────────────

/**
 * Extract model features from history up to and including the last row.
 * @param {object[]} hist  series rows (chronological), only dates <= now
 * @param {number} full    full-storage denominator
 * @param {Map} clim       climatology learned from data <= now
 * @param {number} oni     ONI value for the current month (La Nina precursor)
 */
function features(hist, full, clim, oni) {
  // Use the most recent row with a valid combined fill (latest reading may be a
  // sensor gap); the reported date stays that of the latest valid observation.
  let last = null, fill = null;
  for (let i = hist.length - 1; i >= 0; i--) {
    const f = combinedFill(hist[i], full);
    if (f != null) { last = hist[i]; fill = f; break; }
  }
  if (last == null) throw new Error('features: no valid combined-fill observation in history');
  const week = isoWeek(last.date);
  const month = new Date(last.date + 'T00:00:00Z').getUTCMonth();

  // level: 1 - seasonal percentile (low percentile => high risk)
  const pctile = climPercentile(clim, week, fill);
  const levelRisk = clamp(1 - pctile);

  // trend: drawdown slope over last ~8 weeks (%/week), falling => risk
  const lookback = hist.slice(-8).map((r) => combinedFill(r, full)).filter((v) => v != null);
  let slope = 0;
  if (lookback.length >= 3) slope = (lookback[lookback.length - 1] - lookback[0]) / (lookback.length - 1);
  const trendRisk = clamp(-slope / 3); // 3%/week fall ≈ max

  // season
  const seasonRisk = MONTH_DRY_RISK[month];

  // enso: La Nina (negative ONI) => risk
  const ensoRisk = clamp((0.5 - (oni ?? 0)) / 2);

  // ews secondary
  const fills = hist.map((r) => combinedFill(r, full)).filter((v) => v != null);
  const ewsTau = rollingAr1Tau(fills);
  const ewsRisk = clamp((ewsTau + 0.2) / 0.7); // mild positive trend -> modest risk

  // novelty: current fill below the historical envelope for this week
  const c = clim.get(week);
  const novelty = c ? fill < c.min - 0.5 : false;

  return { date: last.date, fill: +fill.toFixed(2), week, month,
    pctile: +pctile.toFixed(3), slope: +slope.toFixed(3), oni: oni ?? null, ewsTau: +ewsTau.toFixed(3),
    risk: { level: +levelRisk.toFixed(3), trend: +trendRisk.toFixed(3), season: +seasonRisk.toFixed(3), enso: +ensoRisk.toFixed(3), ews: +ewsRisk.toFixed(3) },
    novelty };
}

// ── Probability ──────────────────────────────────────────────────────────────

function probability(feat) {
  const w = PARAMS.weights, r = feat.risk;
  const score = w.level * r.level + w.trend * r.trend + w.season * r.season + w.enso * r.enso + w.ews * r.ews;
  const p = logistic(PARAMS.logisticK * (score - PARAMS.logisticR0));
  const band = (PARAMS.baseBandPct + (feat.novelty ? PARAMS.noveltyBandPct : 0)) / 100;
  return {
    p: +p.toFixed(3),
    riskScore: +score.toFixed(3),
    bandLow: +clamp(p - band).toFixed(3),
    bandHigh: +clamp(p + band).toFixed(3),
    contributions: Object.fromEntries(Object.keys(w).map((k) => [k, +(w[k] * r[k]).toFixed(3)])),
    novelty: feat.novelty,
  };
}

// ── Pre-registered decision rule ─────────────────────────────────────────────

function decision(prob) {
  let band = PARAMS.bands[0];
  for (const b of PARAMS.bands) if (prob.p >= b.min) band = b;
  const convictionCap = PARAMS.smallSampleCap * (prob.novelty ? PARAMS.noveltyCap : 1);
  const sizePctNav = +(band.nominal * convictionCap * 100).toFixed(2);
  return {
    action: band.action,
    nominalPctNav: +(band.nominal * 100).toFixed(2),
    convictionCap: +convictionCap.toFixed(2),
    sizePctNav, // actual capped size
    rationale:
      band.action === 'STAND DOWN' ? 'Probability below the action floor — monitor only, no capital at risk.' :
      band.action === 'WATCH' ? 'Elevated but not actionable — scout structure, take no position yet.' :
      `Probability in the ${band.action} band → defined-risk size ${sizePctNav}% NAV (nominal ${(band.nominal * 100).toFixed(0)}% × conviction cap ${(convictionCap).toFixed(2)}). Sizing is capped because the track record is only two major events and conviction is never allowed to exceed what the evidence supports.`,
  };
}

/** Full forecast at the last point of `hist`. */
function forecast(hist, full, clim, oni) {
  const feat = features(hist, full, clim, oni);
  const prob = probability(feat);
  const dec = decision(prob);
  return { features: feat, probability: prob, decision: dec };
}

module.exports = {
  PARAMS, combinedFill, fullStorage, buildClimatology, climPercentile,
  features, probability, decision, forecast, isoWeek, kendallTau,
};
