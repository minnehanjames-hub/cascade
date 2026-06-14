'use strict';

/**
 * signals.js — Early-warning-signal (EWS) analysis for time series produced by
 * the simulation engine.
 *
 * The theory: as a dynamical system approaches a critical transition, the
 * dominant eigenvalue of its linearization approaches zero from below. The
 * system recovers from perturbations ever more slowly — "critical slowing
 * down." That slowdown leaves measurable fingerprints in a state variable's
 * statistics:
 *
 *   - rising lag-1 autocorrelation (AR1 → 1)
 *   - rising variance
 *   - rising coefficient of variation
 *   - changing skewness (the basin of attraction becomes asymmetric)
 *   - falling return rate (≈ -ln(AR1); recovery slope flattens)
 *   - rising spatial correlation across coupled nodes
 *
 * This module computes those indicators, both as whole-series statistics and as
 * rolling-window trajectories, detects threshold crossings, and rolls the whole
 * picture up into a warning summary using Kendall's tau to score the trend of
 * each indicator.
 */

// ---- basic statistics ------------------------------------------------------

function assertSeries(x, min = 1, label = 'series') {
  if (!Array.isArray(x)) throw new Error(`${label} must be an array`);
  if (x.length < min) throw new Error(`${label} needs at least ${min} points`);
  for (const v of x) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`${label} must contain only finite numbers`);
    }
  }
}

function mean(x) {
  assertSeries(x, 1);
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

/** Sample variance (n-1). Returns 0 for length-1 series. */
function variance(x) {
  assertSeries(x, 1);
  const n = x.length;
  if (n < 2) return 0;
  const m = mean(x);
  let s = 0;
  for (const v of x) {
    const d = v - m;
    s += d * d;
  }
  return s / (n - 1);
}

function std(x) {
  return Math.sqrt(variance(x));
}

/** std / |mean|. Returns 0 when the mean is ~0 (CoV undefined). */
function coefficientOfVariation(x) {
  const m = mean(x);
  if (Math.abs(m) < 1e-12) return 0;
  return std(x) / Math.abs(m);
}

/** Fisher–Pearson sample skewness (bias-corrected). */
function skewness(x) {
  assertSeries(x, 1);
  const n = x.length;
  if (n < 3) return 0;
  const m = mean(x);
  const s = std(x);
  if (s < 1e-12) return 0;
  let acc = 0;
  for (const v of x) acc += ((v - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * acc;
}

/**
 * Lag-1 autocorrelation. Computed as the lag-1 autocovariance normalized by the
 * variance — the AR(1) coefficient estimate, bounded to [-1, 1].
 */
function ar1(x) {
  assertSeries(x, 2);
  const n = x.length;
  const m = mean(x);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - m;
    den += d * d;
    if (i < n - 1) num += d * (x[i + 1] - m);
  }
  if (den < 1e-12) return 0;
  const r = num / den;
  return Math.max(-1, Math.min(1, r));
}

/**
 * Return rate ≈ -ln(AR1): the speed at which the system relaxes back to its
 * attractor. Falls toward 0 as a tipping point nears (critical slowing down).
 * Non-positive AR1 (no slowing-down regime) yields Infinity by convention.
 */
function returnRate(x) {
  const r = ar1(x);
  if (r <= 0) return Infinity;
  if (r >= 1) return 0;
  return -Math.log(r);
}

// ---- correlation -----------------------------------------------------------

function covariance(x, y) {
  assertSeries(x, 1, 'x');
  assertSeries(y, 1, 'y');
  if (x.length !== y.length) throw new Error('covariance: length mismatch');
  const n = x.length;
  if (n < 2) return 0;
  const mx = mean(x);
  const my = mean(y);
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (n - 1);
}

function pearson(x, y) {
  const sx = std(x);
  const sy = std(y);
  if (sx < 1e-12 || sy < 1e-12) return 0;
  return covariance(x, y) / (sx * sy);
}

/**
 * Spatial correlation across nodes: the mean pairwise Pearson correlation of a
 * set of equal-length series sampled at the same times. Rising spatial
 * correlation signals that nodes are losing independence and beginning to move
 * as one — a hallmark of an approaching system-wide cascade.
 *
 * @param {number[][]} seriesByNode  Array of node series (each same length).
 * @returns {number} mean pairwise correlation, or 0 if fewer than 2 series.
 */
function spatialCorrelation(seriesByNode) {
  if (!Array.isArray(seriesByNode) || seriesByNode.length < 2) return 0;
  const len = seriesByNode[0].length;
  for (const s of seriesByNode) {
    assertSeries(s, 1, 'node series');
    if (s.length !== len) throw new Error('spatialCorrelation: length mismatch');
  }
  let acc = 0;
  let pairs = 0;
  for (let i = 0; i < seriesByNode.length; i++) {
    for (let j = i + 1; j < seriesByNode.length; j++) {
      acc += pearson(seriesByNode[i], seriesByNode[j]);
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : acc / pairs;
}

// ---- rolling windows -------------------------------------------------------

/**
 * Apply a metric over a sliding window.
 *
 * @param {number[]} x
 * @param {number} window   Window length (>= 1).
 * @param {function} fn     (windowSlice) => number.
 * @param {object} [opts]
 * @param {number} [opts.step=1]
 * @param {boolean} [opts.partial=false]  Emit partial windows at the start.
 * @returns {{index:number[], values:number[]}}  `index` is the end-position of
 *          each window in the original series.
 */
function rolling(x, window, fn, opts = {}) {
  assertSeries(x, 1);
  if (!Number.isInteger(window) || window < 1) {
    throw new Error('rolling: window must be a positive integer');
  }
  const { step = 1, partial = false } = opts;
  const index = [];
  const values = [];
  const start = partial ? 1 : window;
  for (let end = start; end <= x.length; end += step) {
    const from = Math.max(0, end - window);
    const slice = x.slice(from, end);
    index.push(end - 1);
    values.push(fn(slice));
  }
  return { index, values };
}

const ROLLING_METRICS = {
  mean,
  variance,
  std,
  cov: coefficientOfVariation,
  skewness,
  ar1,
  returnRate,
};

/** Convenience: rolling AR1/variance/etc by metric name. */
function rollingMetric(x, window, metric, opts) {
  const fn = ROLLING_METRICS[metric];
  if (!fn) throw new Error(`Unknown rolling metric "${metric}"`);
  return rolling(x, window, fn, opts);
}

// ---- trend (Kendall's tau) -------------------------------------------------

/**
 * Kendall rank correlation between a series and time (its index). Used to score
 * whether an EWS indicator is *trending* up or down over the run. Returns tau in
 * [-1, 1]; +1 means strictly increasing.
 */
function kendallTau(x) {
  const finite = x.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (n < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = finite[j] - finite[i]; // time index j > i
      if (d > 0) concordant += 1;
      else if (d < 0) discordant += 1;
    }
  }
  const denom = (n * (n - 1)) / 2;
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

// ---- threshold crossing detection ------------------------------------------

/**
 * Detect points where a series crosses a threshold.
 *
 * @param {number[]} x
 * @param {number} threshold
 * @param {object} [opts]
 * @param {('up'|'down'|'both')} [opts.direction='up']
 * @returns {Array<{index:number, value:number, prev:number, direction:string}>}
 */
function detectCrossings(x, threshold, opts = {}) {
  assertSeries(x, 1);
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new Error('detectCrossings: threshold must be a finite number');
  }
  const { direction = 'up' } = opts;
  const crossings = [];
  for (let i = 1; i < x.length; i++) {
    const prev = x[i - 1];
    const cur = x[i];
    const up = prev < threshold && cur >= threshold;
    const down = prev > threshold && cur <= threshold;
    if ((direction === 'up' || direction === 'both') && up) {
      crossings.push({ index: i, value: cur, prev, direction: 'up' });
    }
    if ((direction === 'down' || direction === 'both') && down) {
      crossings.push({ index: i, value: cur, prev, direction: 'down' });
    }
  }
  return crossings;
}

/** First index at or beyond which the series stays above the threshold. */
function firstSustainedBreach(x, threshold, minRun = 1) {
  assertSeries(x, 1);
  let run = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= threshold) {
      run += 1;
      if (run >= minRun) return i - run + 1;
    } else {
      run = 0;
    }
  }
  return -1;
}

// ---- detrending ------------------------------------------------------------

/**
 * Remove a slow trend by subtracting a centered moving-average baseline,
 * returning the residual fluctuations.
 *
 * This is the standard preprocessing step before computing CSD indicators
 * (AR1, variance) on real-world, non-stationary series. Without it, a strong
 * deterministic trend — e.g. a reservoir's seasonal draw/fill cycle — inflates
 * both lag-1 autocorrelation and variance and produces spurious early-warning
 * flags. CSD theory describes fluctuations *around* a slowly-moving attractor,
 * so the trend must be removed first and the indicators computed on residuals.
 *
 * @param {number[]} x
 * @param {number} [window]  Centered MA window; default ~series/4 (min 3),
 *                           forced odd so the window is symmetric about each point.
 * @returns {number[]} residuals (same length as x)
 */
function detrend(x, window) {
  assertSeries(x, 2);
  let w = window || Math.max(3, Math.floor(x.length / 4));
  if (w % 2 === 0) w += 1; // keep window odd for symmetric centering
  const half = Math.floor(w / 2);
  const res = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(x.length, i + half + 1);
    let s = 0;
    for (let j = lo; j < hi; j++) s += x[j];
    res[i] = x[i] - s / (hi - lo);
  }
  return res;
}

// ---- warning summarization -------------------------------------------------

const DEFAULT_INDICATORS = ['ar1', 'variance', 'cov', 'skewness'];

/**
 * Roll a single series up into an early-warning verdict.
 *
 * Computes each indicator as a rolling trajectory, scores the trend of each with
 * Kendall's tau, and flags the series when enough indicators trend in the
 * collapse-consistent direction strongly enough.
 *
 * @param {number[]} x
 * @param {object} [opts]
 * @param {number} [opts.window]      Rolling window (default: ~half the series).
 * @param {string[]} [opts.indicators=DEFAULT_INDICATORS]
 * @param {number} [opts.tauThreshold=0.5]  |tau| needed to count an indicator.
 * @param {number} [opts.minSignals=2]  Indicators needed to raise a warning.
 * @param {boolean} [opts.detrend=false]  Compute indicators on detrended
 *        residuals (recommended for non-stationary real-world series).
 * @param {number} [opts.detrendWindow]  Centered MA window passed to detrend().
 * @returns {object} per-indicator tau/latest plus an overall verdict.
 */
function warningSummary(x, opts = {}) {
  assertSeries(x, 2);
  const window =
    opts.window || Math.max(3, Math.floor(x.length / 2));
  const indicators = opts.indicators || DEFAULT_INDICATORS;
  const tauThreshold = opts.tauThreshold ?? 0.5;
  const minSignals = opts.minSignals ?? 2;
  const series = opts.detrend ? detrend(x, opts.detrendWindow) : x;

  // Indicators whose *increase* is collapse-consistent. Skewness is direction-
  // ambiguous (depends on which side the alternative basin sits), so we score
  // its magnitude of trend rather than its sign.
  const risingIsBad = new Set(['ar1', 'variance', 'cov', 'std']);

  const detail = {};
  let signals = 0;

  for (const name of indicators) {
    const fn = ROLLING_METRICS[name];
    if (!fn) throw new Error(`warningSummary: unknown indicator "${name}"`);
    const { values } = rolling(series, window, fn);
    const tau = kendallTau(values);
    const latest = values.length ? values[values.length - 1] : NaN;

    let flagged;
    if (name === 'skewness') {
      flagged = Math.abs(tau) >= tauThreshold;
    } else if (risingIsBad.has(name)) {
      flagged = tau >= tauThreshold;
    } else {
      // e.g. returnRate: falling is bad
      flagged = tau <= -tauThreshold;
    }
    if (flagged) signals += 1;

    detail[name] = {
      tau: round(tau, 4),
      latest: round(latest, 6),
      trajectory: values.map((v) => round(v, 6)),
      flagged,
    };
  }

  return {
    window,
    detrended: !!opts.detrend,
    indicators: detail,
    signals,
    minSignals,
    warning: signals >= minSignals,
  };
}

/**
 * Summarize a set of coupled node series together, adding the cross-node spatial
 * correlation trend to the per-series verdicts.
 *
 * @param {object} seriesMap  { label: number[] } of equal-length series.
 * @param {object} [opts]     passed through to warningSummary, plus
 *        opts.window for the spatial-correlation rolling window.
 */
function systemWarningSummary(seriesMap, opts = {}) {
  const labels = Object.keys(seriesMap);
  if (labels.length === 0) throw new Error('systemWarningSummary: empty seriesMap');

  const perNode = {};
  for (const label of labels) {
    perNode[label] = warningSummary(seriesMap[label], opts);
  }

  let spatial = null;
  if (labels.length >= 2) {
    const len = seriesMap[labels[0]].length;
    const window = opts.window || Math.max(3, Math.floor(len / 2));
    const index = [];
    const values = [];
    for (let end = window; end <= len; end++) {
      const windowSeries = labels.map((l) => seriesMap[l].slice(end - window, end));
      index.push(end - 1);
      values.push(spatialCorrelation(windowSeries));
    }
    spatial = {
      window,
      trajectory: values.map((v) => round(v, 6)),
      tau: round(kendallTau(values), 4),
      latest: round(values.length ? values[values.length - 1] : NaN, 6),
      rising: kendallTau(values) >= (opts.tauThreshold ?? 0.5),
    };
  }

  const nodeWarnings = labels.filter((l) => perNode[l].warning).length;
  return {
    nodes: perNode,
    spatial,
    nodeWarnings,
    systemWarning:
      nodeWarnings >= (opts.minNodeWarnings ?? Math.ceil(labels.length / 2)) ||
      (spatial ? spatial.rising : false),
  };
}

function round(v, places) {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

module.exports = {
  // basic stats
  mean,
  variance,
  std,
  coefficientOfVariation,
  skewness,
  ar1,
  returnRate,
  // correlation
  covariance,
  pearson,
  spatialCorrelation,
  // rolling
  rolling,
  rollingMetric,
  ROLLING_METRICS,
  // detrending
  detrend,
  // trend
  kendallTau,
  // thresholds
  detectCrossings,
  firstSustainedBreach,
  // summaries
  warningSummary,
  systemWarningSummary,
};
