'use strict';

/**
 * simulation.js — Time-step integration of a System forward through time.
 *
 * Supports first-order Euler and classical fourth-order Runge–Kutta (RK4).
 * Stressors can be injected at arbitrary ticks (by exact tick, predicate, or
 * recurring schedule) to perturb the state mid-run — this is how we drive a
 * system toward a collapse threshold and watch the early-warning signals
 * respond.
 *
 * Every tick is recorded as an immutable snapshot, and `getTimeSeries` extracts
 * the history of a single (node, variable) pair for downstream signal analysis.
 */

const { System } = require('./graph');

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ---- state vector arithmetic ----------------------------------------------
// States are nested { nodeId: { var: value } }. Only finite-number variables
// are integrated; everything else is carried through unchanged.

function copyState(state) {
  const out = {};
  for (const nodeId of Object.keys(state)) out[nodeId] = { ...state[nodeId] };
  return out;
}

/** result = base + scale * delta  (delta is a derivative-shaped structure). */
function axpy(base, delta, scale) {
  const out = {};
  for (const nodeId of Object.keys(base)) {
    const b = base[nodeId];
    const d = delta[nodeId] || {};
    const merged = { ...b };
    for (const k of Object.keys(b)) {
      if (isNumber(b[k]) && isNumber(d[k])) {
        merged[k] = b[k] + scale * d[k];
      }
    }
    out[nodeId] = merged;
  }
  return out;
}

/** Linear combination of several derivative structures: Σ coeff_i * deriv_i. */
function combine(derivs, coeffs) {
  const out = {};
  const ref = derivs[0] || {};
  for (const nodeId of Object.keys(ref)) {
    const acc = {};
    for (const k of Object.keys(ref[nodeId])) {
      let s = 0;
      for (let i = 0; i < derivs.length; i++) {
        const v = derivs[i][nodeId] ? derivs[i][nodeId][k] : 0;
        if (isNumber(v)) s += coeffs[i] * v;
      }
      acc[k] = s;
    }
    out[nodeId] = acc;
  }
  return out;
}

// ---- integrators -----------------------------------------------------------

const INTEGRATORS = {
  euler(system, state, t, dt, tick) {
    const k1 = system.computeDerivatives(state, { t, dt, tick });
    return axpy(state, k1, dt);
  },

  rk4(system, state, t, dt, tick) {
    const k1 = system.computeDerivatives(state, { t, dt, tick });
    const s2 = axpy(state, k1, dt / 2);
    const k2 = system.computeDerivatives(s2, { t: t + dt / 2, dt, tick });
    const s3 = axpy(state, k2, dt / 2);
    const k3 = system.computeDerivatives(s3, { t: t + dt / 2, dt, tick });
    const s4 = axpy(state, k3, dt);
    const k4 = system.computeDerivatives(s4, { t: t + dt, dt, tick });
    // weighted slope: (k1 + 2k2 + 2k3 + k4) / 6
    const slope = combine([k1, k2, k3, k4], [1 / 6, 2 / 6, 2 / 6, 1 / 6]);
    return axpy(state, slope, dt);
  },
};

/**
 * A stressor perturbs the state at matching ticks.
 *
 * @typedef {object} Stressor
 * @property {string} id
 * @property {function} apply  (state, context) => void | newState. Mutating the
 *           passed state in place is supported; returning a new state replaces it.
 * @property {function} match  (tick, context) => boolean. Built by injectStress.
 */

class Simulation {
  /**
   * @param {System} system
   * @param {object} [opts]
   * @param {('euler'|'rk4')} [opts.method='rk4']
   * @param {number} [opts.dt=1]
   * @param {number} [opts.t0=0]    Initial time.
   * @param {object} [opts.state]   Override the system's initial state.
   */
  constructor(system, opts = {}) {
    if (!(system instanceof System)) {
      throw new Error('Simulation requires a System instance');
    }
    const { method = 'rk4', dt = 1, t0 = 0, state } = opts;
    if (!INTEGRATORS[method]) {
      throw new Error(`Unknown integration method "${method}"`);
    }
    if (!isNumber(dt) || dt <= 0) {
      throw new Error('dt must be a positive finite number');
    }

    this.system = system;
    this.method = method;
    this.dt = dt;
    this.t0 = t0;

    this.tick = 0;
    this.t = t0;
    this.state = state ? copyState(state) : system.initialState();
    this.stressors = [];
    this.history = [];

    this._record([]); // snapshot the initial condition at tick 0
  }

  // ---- stress injection ---------------------------------------------------

  /**
   * Register a stressor.
   *
   * @param {object} spec
   * @param {function} spec.apply  (state, context) => void | newState.
   * @param {number|number[]|function} [spec.at]  Tick (or ticks) to fire on, or
   *        a predicate (tick, context) => boolean.
   * @param {number} [spec.every]   Fire every N ticks (optionally bounded by
   *        spec.from / spec.until).
   * @param {number} [spec.from=0]
   * @param {number} [spec.until=Infinity]
   * @param {string} [spec.id]
   * @returns {string} the stressor id.
   */
  injectStress(spec = {}) {
    const { apply, at, every, from = 0, until = Infinity } = spec;
    if (typeof apply !== 'function') {
      throw new Error('injectStress requires an apply(state, context) function');
    }
    const id = spec.id || `stress-${this.stressors.length + 1}`;

    let match;
    if (typeof at === 'function') {
      match = at;
    } else if (Array.isArray(at)) {
      const set = new Set(at);
      match = (tick) => set.has(tick);
    } else if (isNumber(at)) {
      match = (tick) => tick === at;
    } else if (isNumber(every)) {
      match = (tick) =>
        tick >= from && tick <= until && (tick - from) % every === 0;
    } else {
      throw new Error('injectStress needs one of: at, every');
    }

    this.stressors.push({ id, apply, match });
    return id;
  }

  _applyStressors() {
    const fired = [];
    for (const s of this.stressors) {
      const ctx = { tick: this.tick, t: this.t, dt: this.dt, system: this.system };
      if (s.match(this.tick, ctx)) {
        const returned = s.apply(this.state, ctx);
        if (returned && typeof returned === 'object') {
          this.state = copyState(returned);
        }
        fired.push(s.id);
      }
    }
    return fired;
  }

  // ---- stepping -----------------------------------------------------------

  /** Advance exactly one tick: apply stressors, integrate, record. */
  step() {
    const fired = this._applyStressors();
    const integrate = INTEGRATORS[this.method];
    this.state = integrate(this.system, this.state, this.t, this.dt, this.tick);
    this.tick += 1;
    this.t += this.dt;
    this._record(fired);
    return this.snapshot();
  }

  /**
   * Run `ticks` steps. Optional `onStep(snapshot, sim)` callback runs after each.
   * Returns the full history.
   */
  run(ticks, onStep) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error('run(ticks): ticks must be a non-negative integer');
    }
    for (let i = 0; i < ticks; i++) {
      const snap = this.step();
      if (onStep) onStep(snap, this);
    }
    return this.history;
  }

  reset() {
    this.tick = 0;
    this.t = this.t0;
    this.state = this.system.initialState();
    this.history = [];
    this._record([]);
    return this;
  }

  // ---- recording & extraction --------------------------------------------

  _record(events) {
    this.history.push({
      tick: this.tick,
      t: this.t,
      state: copyState(this.state),
      events, // ids of stressors that fired entering this tick
    });
  }

  snapshot() {
    return this.history[this.history.length - 1];
  }

  getHistory() {
    return this.history;
  }

  /** All times recorded, in order. */
  times() {
    return this.history.map((h) => h.t);
  }

  /** All ticks recorded, in order. */
  ticks() {
    return this.history.map((h) => h.tick);
  }

  /**
   * Extract the recorded history of one node variable.
   *
   * @param {string} nodeId
   * @param {string} variable
   * @returns {{nodeId, variable, ticks:number[], times:number[], values:number[]}}
   */
  getTimeSeries(nodeId, variable) {
    if (!this.system.hasNode(nodeId)) {
      throw new Error(`getTimeSeries: no node "${nodeId}"`);
    }
    const ticks = [];
    const times = [];
    const values = [];
    for (const snap of this.history) {
      const nodeState = snap.state[nodeId];
      if (!nodeState || !(variable in nodeState)) {
        throw new Error(
          `getTimeSeries: node "${nodeId}" has no variable "${variable}"`
        );
      }
      ticks.push(snap.tick);
      times.push(snap.t);
      values.push(nodeState[variable]);
    }
    return { nodeId, variable, ticks, times, values };
  }

  /**
   * Extract many series at once.
   * @param {Array<[string,string]>} pairs  e.g. [['aquifer','volume'], ...]
   * @returns {object[]} array of getTimeSeries results.
   */
  getTimeSeriesBatch(pairs) {
    return pairs.map(([nodeId, variable]) => this.getTimeSeries(nodeId, variable));
  }
}

module.exports = {
  Simulation,
  INTEGRATORS,
  // exported for testing / reuse
  _internals: { copyState, axpy, combine },
};
