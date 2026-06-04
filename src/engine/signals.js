/**
 * Cascade — Signal Analysis Engine (Layer 3)
 *
 * Computes early warning indicators from simulation history.
 * These are the mathematical signatures that appear in complex
 * systems before a critical transition — before the collapse.
 *
 * The science behind this is called Early Warning Signal theory.
 * The same indicators appear across ecology, finance, climate,
 * epidemiology, and neuroscience. This layer makes them computable
 * on any Cascade simulation.
 *
 * Indicators implemented:
 *   - Autocorrelation at lag-1 (AR1)    — critical slowing down
 *   - Variance                          — rising fluctuations
 *   - Coefficient of Variation          — normalized instability
 *   - Skewness                          — asymmetric flickering
 *   - Spatial Correlation               — network-level contagion
 *   - Recovery Rate                     — direct resilience measure
 */

'use strict';


// ─────────────────────────────────────────────
// ROLLING WINDOW ANALYSIS
// ─────────────────────────────────────────────

/**
 * analyzeSignals
 *
 * The main entry point. Given a simulation's history, a node id,
 * a state variable, and a window size, computes all early warning
 * indicators across every window in the history.
 *
 * Returns a time series of indicator values — one object per tick
 * starting from tick (windowSize - 1).
 *
 * @param {Object} sim          - completed or in-progress simulation
 * @param {string} nodeId       - which node to analyze
 * @param {string} variable     - which state variable to track
 * @param {number} windowSize   - rolling window size (recommend 20-50)
 * @returns {Object[]} array of signal snapshots
 */
function analyzeSignals(sim, nodeId, variable, windowSize) {
  validateAnalysisInputs(sim, nodeId, variable, windowSize);

  const series = extractSeries(sim, nodeId, variable);

  if (series.length < windowSize) {
    throw new Error(
      `Signal analysis requires at least ${windowSize} ticks of history. ` +
      `Simulation has ${series.length}.`
    );
  }

  const results = [];

  for (let i = windowSize - 1; i < series.length; i++) {
    const window = series.slice(i - windowSize + 1, i + 1);
    const tick = sim.history[i].tick;
    const t = sim.history[i].t;

    results.push({
      tick,
      t,
      windowSize,
      nodeId,
      variable,
      indicators: computeAllIndicators(window)
    });
  }

  return results;
}

/**
 * analyzeAllNodes
 *
 * Runs signal analysis on every node in the simulation
 * for a given state variable. Returns a map of nodeId => signals.
 *
 * Useful for detecting which nodes in a network are showing
 * early warning signs first.
 */
function analyzeAllNodes(sim, variable, windowSize) {
  const results = {};
  sim.system.nodes.forEach(node => {
    try {
      results[node.id] = analyzeSignals(sim, node.id, variable, windowSize);
    } catch (err) {
      results[node.id] = { error: err.message };
    }
  });
  return results;
}


// ─────────────────────────────────────────────
// INDICATOR SUITE
// ─────────────────────────────────────────────

/**
 * computeAllIndicators
 *
 * Runs every indicator on a window of values.
 * Returns a single object with all indicator values.
 */
function computeAllIndicators(window) {
  return {
    ar1: autocorrelationLag1(window),
    variance: variance(window),
    coefficientOfVariation: coefficientOfVariation(window),
    skewness: skewness(window),
    mean: mean(window),
    returnRate: returnRate(window)
  };
}

/**
 * autocorrelationLag1 (AR1)
 *
 * The canonical signature of critical slowing down.
 *
 * A system approaching a tipping point takes longer and longer
 * to recover from small perturbations. Mathematically, this
 * manifests as the current value becoming increasingly correlated
 * with the previous value — the system's memory of itself grows.
 *
 * AR1 approaching 1.0 is the single most reliable early warning
 * signal across all domains studied.
 *
 * @param {number[]} window
 * @returns {number} correlation coefficient [-1, 1]
 */
function autocorrelationLag1(window) {
  if (window.length < 2) return null;

  const n = window.length - 1;
  const x = window.slice(0, n);  // values at t
  const y = window.slice(1);     // values at t+1

  const meanX = mean(x);
  const meanY = mean(y);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * variance
 *
 * Rising variance is the second canonical early warning signal.
 *
 * As a system loses resilience, it explores more of its state space —
 * small pushes send it further from equilibrium before it recovers.
 * This shows up as increasing variance in the time series.
 *
 * @param {number[]} window
 * @returns {number}
 */
function variance(window) {
  if (window.length < 2) return 0;
  const m = mean(window);
  const squaredDiffs = window.map(v => Math.pow(v - m, 2));
  return mean(squaredDiffs);
}

/**
 * coefficientOfVariation
 *
 * Variance normalized by the mean.
 * Allows comparison across nodes with wildly different scales —
 * a population in the millions vs a temperature in degrees.
 *
 * @param {number[]} window
 * @returns {number}
 */
function coefficientOfVariation(window) {
  const m = mean(window);
  if (m === 0) return 0;
  return Math.sqrt(variance(window)) / Math.abs(m);
}

/**
 * skewness
 *
 * Measures asymmetry in the distribution of values.
 *
 * Before a critical transition, systems often exhibit "flickering" —
 * brief excursions toward the alternative state they are about to
 * collapse into. This shows up as skewness in the time series.
 * The direction of skew indicates which way the system will tip.
 *
 * @param {number[]} window
 * @returns {number} negative = left skew, positive = right skew
 */
function skewness(window) {
  if (window.length < 3) return 0;
  const m = mean(window);
  const s = Math.sqrt(variance(window));
  if (s === 0) return 0;
  const cubedDiffs = window.map(v => Math.pow((v - m) / s, 3));
  return mean(cubedDiffs);
}

/**
 * returnRate
 *
 * Estimates how quickly the system is returning to its mean.
 * Computed as the negative slope of the relationship between
 * a value's deviation from mean and the next deviation.
 *
 * A return rate approaching zero means the system is taking
 * longer and longer to recover — the direct definition of
 * critical slowing down.
 *
 * @param {number[]} window
 * @returns {number} rate (positive = recovering, near zero = slowing)
 */
function returnRate(window) {
  if (window.length < 3) return null;

  const m = mean(window);
  const deviations = window.map(v => v - m);

  // Estimate slope of deviation[t+1] ~ slope * deviation[t]
  const x = deviations.slice(0, -1);
  const y = deviations.slice(1);

  let sumXX = 0;
  let sumXY = 0;

  for (let i = 0; i < x.length; i++) {
    sumXX += x[i] * x[i];
    sumXY += x[i] * y[i];
  }

  if (sumXX === 0) return 0;

  const slope = sumXY / sumXX;
  // Return rate is 1 - slope: as slope approaches 1, return rate approaches 0
  return 1 - slope;
}

/**
 * mean
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}


// ─────────────────────────────────────────────
// SPATIAL CORRELATION
// ─────────────────────────────────────────────

/**
 * spatialCorrelation
 *
 * Measures how correlated neighboring nodes are becoming.
 *
 * In a healthy system, nodes fluctuate somewhat independently.
 * As a system approaches a tipping point, fluctuations become
 * synchronized — nodes start moving together. This spatial
 * correlation is a network-level early warning signal.
 *
 * Requires multiple nodes and a defined neighbor structure.
 *
 * @param {Object} sim
 * @param {string[]} nodeIds      - nodes to include
 * @param {string} variable       - state variable to compare
 * @param {number} windowSize
 * @returns {number[]} correlation time series
 */
function spatialCorrelation(sim, nodeIds, variable, windowSize) {
  if (nodeIds.length < 2) {
    throw new Error('spatialCorrelation requires at least 2 nodes.');
  }

  const allSeries = nodeIds.map(id => extractSeries(sim, id, variable));
  const minLength = Math.min(...allSeries.map(s => s.length));

  if (minLength < windowSize) {
    throw new Error(`Insufficient history for spatial correlation analysis.`);
  }

  const results = [];

  for (let i = windowSize - 1; i < minLength; i++) {
    const windows = allSeries.map(series => series.slice(i - windowSize + 1, i + 1));
    const pairs = [];

    // Compute pairwise correlations between all node pairs
    for (let a = 0; a < windows.length; a++) {
      for (let b = a + 1; b < windows.length; b++) {
        pairs.push(pearsonCorrelation(windows[a], windows[b]));
      }
    }

    results.push({
      tick: sim.history[i].tick,
      t: sim.history[i].t,
      spatialCorrelation: mean(pairs),
      pairCount: pairs.length
    });
  }

  return results;
}

/**
 * pearsonCorrelation
 * Standard correlation coefficient between two equal-length series.
 */
function pearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return 0;

  const mx = mean(x);
  const my = mean(y);

  let num = 0;
  let dx2 = 0;
  let dy2 = 0;

  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return num / denom;
}


// ─────────────────────────────────────────────
// THRESHOLD ALERTS
// ─────────────────────────────────────────────

/**
 * detectThresholdCrossings
 *
 * Given a signal analysis result and threshold definitions,
 * returns all ticks where an indicator crossed a defined threshold.
 *
 * This is how Cascade surfaces collapse warnings —
 * not as a single alarm but as a structured record of
 * when and which indicators started firing.
 *
 * @param {Object[]} signals      - output of analyzeSignals()
 * @param {Object} thresholds     - { ar1: 0.9, variance: 100, ... }
 * @returns {Object[]} crossings
 */
function detectThresholdCrossings(signals, thresholds) {
  const crossings = [];

  signals.forEach(signal => {
    const fired = [];
    Object.entries(thresholds).forEach(([indicator, threshold]) => {
      const value = signal.indicators[indicator];
      if (value !== null && value !== undefined) {
        if (typeof threshold === 'object') {
          // { min, max } range threshold
          if (threshold.min !== undefined && value < threshold.min) {
            fired.push({ indicator, value, threshold, direction: 'below' });
          }
          if (threshold.max !== undefined && value > threshold.max) {
            fired.push({ indicator, value, threshold, direction: 'above' });
          }
        } else {
          // Simple upper threshold
          if (value > threshold) {
            fired.push({ indicator, value, threshold, direction: 'above' });
          }
        }
      }
    });

    if (fired.length > 0) {
      crossings.push({
        tick: signal.tick,
        t: signal.t,
        nodeId: signal.nodeId,
        variable: signal.variable,
        alerts: fired
      });
    }
  });

  return crossings;
}

/**
 * summarizeWarnings
 *
 * Given threshold crossings across multiple nodes and variables,
 * produces a human-readable summary of the system's warning state.
 *
 * @param {Object[]} crossings - output of detectThresholdCrossings()
 * @returns {Object} summary
 */
function summarizeWarnings(crossings) {
  if (crossings.length === 0) {
    return {
      status: 'stable',
      message: 'No early warning signals detected above thresholds.',
      crossings: []
    };
  }

  const indicatorCounts = {};
  crossings.forEach(c => {
    c.alerts.forEach(a => {
      indicatorCounts[a.indicator] = (indicatorCounts[a.indicator] || 0) + 1;
    });
  });

  const firstCrossing = crossings[0];
  const lastCrossing = crossings[crossings.length - 1];
  const totalAlerts = crossings.reduce((sum, c) => sum + c.alerts.length, 0);

  let status = 'warning';
  if (totalAlerts > crossings.length * 2) status = 'critical';

  return {
    status,
    message: `${totalAlerts} threshold crossings detected across ${crossings.length} ticks.`,
    firstWarningTick: firstCrossing.tick,
    lastWarningTick: lastCrossing.tick,
    indicatorCounts,
    crossings
  };
}


// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function extractSeries(sim, nodeId, variable) {
  return sim.history.map((snapshot, tick) => {
    const state = snapshot.states[nodeId];
    if (!state) throw new Error(`Node "${nodeId}" not found at tick ${tick}.`);
    if (state[variable] === undefined) {
      throw new Error(`Variable "${variable}" not found in node "${nodeId}" at tick ${tick}.`);
    }
    return state[variable];
  });
}

function validateAnalysisInputs(sim, nodeId, variable, windowSize) {
  if (!sim._isSimulation) {
    throw new Error('analyzeSignals() requires a simulation from createSimulation().');
  }
  if (!nodeId || typeof nodeId !== 'string') {
    throw new Error('analyzeSignals() requires a nodeId string.');
  }
  if (!variable || typeof variable !== 'string') {
    throw new Error('analyzeSignals() requires a variable string.');
  }
  if (typeof windowSize !== 'number' || windowSize < 5 || !Number.isInteger(windowSize)) {
    throw new Error(`windowSize must be an integer >= 5. Received: ${windowSize}`);
  }
  if (!sim.system._nodeMap.has(nodeId)) {
    throw new Error(`Node "${nodeId}" does not exist in this simulation's system.`);
  }
}


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  analyzeSignals,
  analyzeAllNodes,
  spatialCorrelation,
  detectThresholdCrossings,
  summarizeWarnings,
  computeAllIndicators,
  autocorrelationLag1,
  variance,
  coefficientOfVariation,
  skewness,
  returnRate,
  spatialCorrelation,
  pearsonCorrelation,
  mean
};
