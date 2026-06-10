'use strict';

/**
 * monitor/index.js — Real-time catalyst monitoring engine for hydrological
 * semiconductor supply chain risk.
 *
 * Checks each defined catalyst against the current simulation state (or live
 * external data), maintains per-catalyst activation duration state, calculates
 * a composite 0–1 system stress score, and emits structured alerts with full
 * dollar-exposure calculations attached.
 *
 * ── MONITOR CYCLE OUTPUT ────────────────────────────────────────────────────
 *   tick                  Simulation tick of this cycle.
 *   t                     Simulation time (real-world anchor if dt is calibrated).
 *   activeCatalysts       Array of catalyst summaries currently above threshold.
 *   newlyActivated        Subset that crossed threshold for the first time this cycle.
 *   newlyDeactivated      Subset that cleared threshold this cycle.
 *   compositeScore        0–1 weighted stress index (see formula below).
 *   compositeScoreComponents  Breakdown of raw score, boost, and count.
 *   alerts                Structured event array (see ALERT TYPES).
 *   exposureImpact        Aggregated exposure calculations for active catalysts.
 *
 * ── COMPOSITE SCORE ─────────────────────────────────────────────────────────
 *   For each active catalyst i with severity s_i active for d_i days:
 *     weight_i = s_i^1.5 × tanh(d_i / 7)
 *   Raw = Σ weight_i / MAX_COMPOSITE_WEIGHT
 *   Co-activation boost: ×1.00 (<3 active), ×1.10 (3–4 active), ×1.20 (5+ active)
 *   compositeScore = clamp(Raw × boost, 0, 1)
 *
 *   The tanh factor ramps smoothly from 0 to 1 over ~14 days; newly fired
 *   catalysts contribute immediately but their weight matures with duration.
 *   This prevents score spikes from instantaneous threshold crossings that
 *   self-correct within days.
 *
 * ── ALERT TYPES ─────────────────────────────────────────────────────────────
 *   ACTIVATION   Catalyst crossed its threshold for the first time this cycle.
 *   SUSTAINED    Catalyst has been continuously active for 7, 14, or 30 days
 *                (emitted once per milestone per activation episode).
 *   ESCALATION   Co-active catalyst count reached 3 or 5 for the first time
 *                in the current run (resets when count drops below 3).
 *   DEACTIVATION Catalyst cleared its threshold after a period of activation.
 *
 *   Every ACTIVATION/SUSTAINED/DEACTIVATION alert includes the full
 *   calculateExposureScore output for the catalyst's primary region.
 */

const {
  CATALYSTS,
  CATALYST_BY_ID,
  MAX_COMPOSITE_WEIGHT,
} = require('../models/hydro-semi/catalysts');
const { calculateExposureScore } = require('../models/hydro-semi/exposure');

// ---- internal helpers ------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Co-activation multiplier based on how many catalysts are simultaneously active. */
function coActivationBoost(count) {
  if (count >= 5) return 1.20;
  if (count >= 3) return 1.10;
  return 1.00;
}

function ticksToDays(ticks, dtDays) {
  return ticks * dtDays;
}

/**
 * Build per-region and aggregate exposure for a set of currently active catalysts.
 *
 * Takes the worst (highest) stressEquivalent per region, calls
 * calculateExposureScore for each, and surfaces the worst composite.
 *
 * @param {Array<{catalyst, checkResult}>} activeItems
 * @returns {{ byRegion: object, worstComposite: number }}
 */
function aggregateExposure(activeItems) {
  // Find worst stress per region
  const worstStressByRegion = {};
  for (const { catalyst, checkResult } of activeItems) {
    const region = catalyst.exposureLayer.region;
    const stress = checkResult.stressEquivalent;
    if (!(region in worstStressByRegion) || stress > worstStressByRegion[region]) {
      worstStressByRegion[region] = stress;
    }
  }

  const byRegion = {};
  for (const [region, stress] of Object.entries(worstStressByRegion)) {
    try {
      byRegion[region] = calculateExposureScore(region, stress);
    } catch (_) {
      byRegion[region] = null;
    }
  }

  const composites = Object.values(byRegion)
    .filter(Boolean)
    .map((e) => (e.composite && typeof e.composite === 'object' ? e.composite.score : e.composite));
  const worstComposite = composites.length ? Math.max(...composites) : 0;

  return { byRegion, worstComposite };
}

/**
 * Build a catalyst summary object for inclusion in activeCatalysts /
 * newlyActivated / newlyDeactivated arrays.
 */
function catalystSummary(catalyst, cs, checkResult, dtDays) {
  return {
    id: catalyst.id,
    type: catalyst.type,
    severity: catalyst.severity,
    label: catalyst.label,
    region: catalyst.exposureLayer.region,
    repricingLagDays: catalyst.repricingLagDays,
    durationTicks: cs.durationTicks,
    durationDays: ticksToDays(cs.durationTicks, dtDays),
    activatedAtTick: cs.activatedAtTick,
    sustainedMilestonesDone: [...cs.sustainedMilestonesDone],
    checkResult,
  };
}

/**
 * Build a structured alert object.
 */
function buildAlert(type, catalyst, tick, t, checkResult, dtDays, cs, extra = {}) {
  const durationDays = ticksToDays(cs.durationTicks, dtDays);
  const region = catalyst.exposureLayer.region;

  let exposureImpact = null;
  try {
    exposureImpact = calculateExposureScore(region, checkResult.stressEquivalent);
  } catch (_) {
    // exposure model may not cover every region exactly — degrade gracefully
  }

  const alert = {
    type,
    catalystId: catalyst.id,
    catalyst: {
      id: catalyst.id,
      type: catalyst.type,
      severity: catalyst.severity,
      label: catalyst.label,
      region,
      repricingLagDays: catalyst.repricingLagDays,
    },
    tick,
    t,
    durationDays,
    checkResult,
    exposureImpact,
  };

  if (type === 'ACTIVATION') {
    alert.message =
      `[ACTIVATION sev:${catalyst.severity}] ${catalyst.label} — ` +
      `${checkResult.detail} | ` +
      `stress=${checkResult.stressEquivalent.toFixed(3)}, ` +
      `repricing lag=${catalyst.repricingLagDays}d`;
  } else if (type === 'SUSTAINED') {
    const { milestone } = extra;
    alert.milestone = milestone;
    alert.message =
      `[SUSTAINED ${milestone}d] ${catalyst.label} — ` +
      `active ${durationDays.toFixed(1)} days; ` +
      `stress=${checkResult.stressEquivalent.toFixed(3)}`;
  } else if (type === 'DEACTIVATION') {
    alert.message =
      `[DEACTIVATION] ${catalyst.label} — ` +
      `was active for ${durationDays.toFixed(1)} days`;
  }

  return alert;
}

// =============================================================================
// CatalystMonitor
// =============================================================================

/**
 * Stateful monitoring engine. Maintains per-catalyst activation history across
 * calls to runMonitorCycle so that duration and milestone tracking work correctly
 * over a multi-tick simulation run.
 *
 * Usage:
 *   const monitor = new CatalystMonitor({ dtDays: 1 });
 *   simulation.run(365, (snap, sim) => {
 *     const report = monitor.runMonitorCycle(snap.state, sim.getHistory(), {});
 *     if (report.alerts.length) console.log(report.alerts);
 *   });
 */
class CatalystMonitor {
  /**
   * @param {object} [opts]
   * @param {number} [opts.dtDays=1]
   *   Simulation tick → real-world days. Default 1 (1 tick = 1 day). Set to
   *   e.g. 7 if each tick represents a week, or 1/24 for hourly ticks.
   * @param {string[]} [opts.catalystIds]
   *   Subset of catalyst IDs to monitor. Defaults to all CATALYSTS.
   */
  constructor(opts = {}) {
    const { dtDays = 1, catalystIds } = opts;
    if (typeof dtDays !== 'number' || dtDays <= 0) {
      throw new Error('CatalystMonitor: dtDays must be a positive number');
    }
    this.dtDays = dtDays;

    this.catalysts = catalystIds
      ? catalystIds.map((id) => {
          const c = CATALYST_BY_ID[id];
          if (!c) throw new Error(`CatalystMonitor: unknown catalyst id "${id}"`);
          return c;
        })
      : CATALYSTS;

    /**
     * Per-catalyst mutable activation state.
     * Map<id, {
     *   active: boolean,
     *   activatedAtTick: number|null,
     *   durationTicks: number,
     *   sustainedMilestonesDone: Set<number>,
     * }>
     */
    this._catalystState = new Map(
      this.catalysts.map((c) => [
        c.id,
        {
          active: false,
          activatedAtTick: null,
          durationTicks: 0,
          sustainedMilestonesDone: new Set(),
        },
      ])
    );

    /**
     * Escalation threshold levels already emitted in the current run.
     * Reset to empty when co-active count drops below 3.
     * Set<number> of co-active counts (3 and 5).
     */
    this._escalationsFired = new Set();
  }

  // --------------------------------------------------------------------------

  /**
   * Run one monitoring cycle against a state snapshot.
   *
   * @param {object} state
   *   Current simulation state object: { nodeId: { variable: value, … }, … }.
   *   Matches the `state` field of a Simulation snapshot.
   * @param {object[]} [history=[]]
   *   Array of all snapshots so far (from sim.getHistory()). Used by catalysts
   *   that need consecutive-day counting (e.g. de_elbe_flow_critical_14d).
   * @param {object} [externalData={}]
   *   Live signal overrides. Keys match the `ext?.field` references inside
   *   catalyst check() functions. When provided, overrides the simulation proxy.
   * @returns {object} Full monitoring report (see module JSDoc header).
   */
  runMonitorCycle(state, history = [], externalData = {}) {
    if (!state || typeof state !== 'object') {
      throw new Error('runMonitorCycle: state must be a non-null object');
    }

    // Extract tick / t from the most recent history entry, or default to 0.
    const lastSnap = history.length > 0 ? history[history.length - 1] : null;
    const tick = lastSnap ? lastSnap.tick : 0;
    const t = lastSnap ? lastSnap.t : 0;

    const alerts = [];
    const activeItems = [];    // { catalyst, cs, checkResult } for all active this cycle
    const newlyActivated = [];
    const newlyDeactivated = [];

    // ---- Step 1: evaluate each catalyst ------------------------------------

    for (const catalyst of this.catalysts) {
      const cs = this._catalystState.get(catalyst.id);
      let checkResult;
      try {
        checkResult = catalyst.check(state, history, externalData);
      } catch (err) {
        // A check() error should not crash the monitoring cycle
        checkResult = {
          active: false,
          value: NaN,
          detail: `check() threw: ${err.message}`,
          stressEquivalent: 0,
        };
      }

      const wasActive = cs.active;
      const isActive = !!checkResult.active;

      if (isActive) {
        if (!wasActive) {
          // ── Newly activated ──
          cs.active = true;
          cs.activatedAtTick = tick;
          cs.durationTicks = 1;
          cs.sustainedMilestonesDone.clear();

          alerts.push(buildAlert('ACTIVATION', catalyst, tick, t, checkResult, this.dtDays, cs));
          newlyActivated.push(catalystSummary(catalyst, cs, checkResult, this.dtDays));
        } else {
          // ── Continuing activation ──
          cs.durationTicks += 1;
        }

        // Sustained-duration milestones (7, 14, 30 days)
        const durationDays = ticksToDays(cs.durationTicks, this.dtDays);
        for (const milestone of [7, 14, 30]) {
          if (durationDays >= milestone && !cs.sustainedMilestonesDone.has(milestone)) {
            cs.sustainedMilestonesDone.add(milestone);
            alerts.push(
              buildAlert('SUSTAINED', catalyst, tick, t, checkResult, this.dtDays, cs, { milestone })
            );
          }
        }

        activeItems.push({ catalyst, cs, checkResult });

      } else {
        if (wasActive) {
          // ── Newly deactivated ──
          // Build the alert while cs.durationTicks still holds the final active count.
          alerts.push(buildAlert('DEACTIVATION', catalyst, tick, t, checkResult, this.dtDays, cs));
          newlyDeactivated.push(catalystSummary(catalyst, cs, checkResult, this.dtDays));

          // Then reset state.
          cs.active = false;
          cs.activatedAtTick = null;
          cs.durationTicks = 0;
          cs.sustainedMilestonesDone.clear();
        }
      }
    }

    // ---- Step 2: escalation alerts -----------------------------------------

    const coActiveCount = activeItems.length;

    for (const threshold of [3, 5]) {
      if (coActiveCount >= threshold && !this._escalationsFired.has(threshold)) {
        this._escalationsFired.add(threshold);
        alerts.push({
          type: 'ESCALATION',
          level: threshold >= 5 ? 'CRITICAL' : 'WARNING',
          tick,
          t,
          coActiveCount,
          activeCatalystIds: activeItems.map(({ catalyst }) => catalyst.id),
          message:
            `[ESCALATION] ${coActiveCount} catalysts co-active ` +
            `(threshold: ${threshold}) — system-level cascade risk elevated.`,
        });
      }
    }

    // Reset escalation tracking once the system cools below 3 concurrent signals.
    if (coActiveCount < 3) {
      this._escalationsFired.clear();
    }

    // ---- Step 3: composite score -------------------------------------------

    let rawScoreSum = 0;
    for (const { catalyst, cs } of activeItems) {
      const durationDays = ticksToDays(cs.durationTicks, this.dtDays);
      rawScoreSum += Math.pow(catalyst.severity, 1.5) * Math.tanh(durationDays / 7);
    }

    const boost = coActivationBoost(coActiveCount);
    const rawNormalized = rawScoreSum / MAX_COMPOSITE_WEIGHT;
    const compositeScore = clamp(rawNormalized * boost, 0, 1);

    // ---- Step 4: aggregate exposure impact ---------------------------------

    const exposureImpact = aggregateExposure(
      activeItems.map(({ catalyst, checkResult }) => ({ catalyst, checkResult }))
    );

    // ---- Step 5: assemble output -------------------------------------------

    const activeCatalysts = activeItems.map(({ catalyst, cs, checkResult }) =>
      catalystSummary(catalyst, cs, checkResult, this.dtDays)
    );

    return {
      tick,
      t,
      activeCatalysts,
      newlyActivated,
      newlyDeactivated,
      compositeScore,
      compositeScoreComponents: {
        rawScore: rawNormalized,
        coActivationBoost: boost,
        coActiveCount,
        maxCompositeWeight: MAX_COMPOSITE_WEIGHT,
      },
      alerts,
      exposureImpact,
    };
  }

  // --------------------------------------------------------------------------

  /**
   * Reset all activation state (call before re-running a simulation from tick 0).
   * @returns {this}
   */
  reset() {
    for (const [id] of this._catalystState) {
      this._catalystState.set(id, {
        active: false,
        activatedAtTick: null,
        durationTicks: 0,
        sustainedMilestonesDone: new Set(),
      });
    }
    this._escalationsFired.clear();
    return this;
  }

  /**
   * Serialize current activation state to a plain object.
   * Useful for logging, persistence, or debugging.
   * @returns {object}
   */
  snapshot() {
    const out = {};
    for (const [id, cs] of this._catalystState) {
      out[id] = {
        active: cs.active,
        activatedAtTick: cs.activatedAtTick,
        durationTicks: cs.durationTicks,
        durationDays: ticksToDays(cs.durationTicks, this.dtDays),
        sustainedMilestonesDone: [...cs.sustainedMilestonesDone],
      };
    }
    return out;
  }
}

// =============================================================================
// Stateless convenience function
// =============================================================================

/**
 * Run a single monitor cycle without maintaining activation state.
 * Each call starts from a clean slate — duration-based scoring won't accumulate.
 * Useful for one-shot checks (alerting dashboards, unit tests, manual probes).
 *
 * @param {object} state
 * @param {object[]} [history=[]]
 * @param {object} [externalData={}]
 * @param {object} [opts={}]  Passed to CatalystMonitor constructor.
 * @returns {object}  Same structure as CatalystMonitor#runMonitorCycle.
 */
function runMonitorCycle(state, history = [], externalData = {}, opts = {}) {
  return new CatalystMonitor(opts).runMonitorCycle(state, history, externalData);
}

/**
 * Convenience wrapper: run a monitoring cycle directly from a Simulation instance.
 * Extracts state and history automatically.
 *
 * @param {import('../engine/simulation').Simulation} simulation
 * @param {object} [externalData={}]
 * @param {object} [opts={}]  Passed to CatalystMonitor constructor.
 * @returns {object}
 */
function runMonitorCycleFromSimulation(simulation, externalData = {}, opts = {}) {
  const history = simulation.getHistory();
  const snap = simulation.snapshot();
  return runMonitorCycle(snap.state, history, externalData, opts);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  CatalystMonitor,
  runMonitorCycle,
  runMonitorCycleFromSimulation,
  // Re-exported for callers who want everything from one import:
  CATALYSTS,
  CATALYST_BY_ID,
  MAX_COMPOSITE_WEIGHT,
  // exposed for testing
  _helpers: { aggregateExposure, buildAlert, catalystSummary, clamp, coActivationBoost },
};
