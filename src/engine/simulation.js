/**
 * Cascade — Simulation Core (Layer 2)
 *
 * Takes a system graph and runs it forward through time.
 * At each tick, every edge computes its transfer value,
 * every node receives its inputs and updates its state.
 *
 * Nothing in this file knows about visualization or signals.
 * It only knows about time, state, and dynamics.
 */

'use strict';

const { getOutgoingEdges } = require('./graph');


// ─────────────────────────────────────────────
// SIMULATION STATE
// ─────────────────────────────────────────────

/**
 * createSimulation
 *
 * Wraps a system in a simulation context. The simulation holds
 * the current state of every node separately from the system
 * definition — the system definition never changes, the
 * simulation state evolves with every tick.
 *
 * @param {Object} system         - a system from createSystem()
 * @param {Object} [options]
 * @param {number} [options.dt]   - time step size (default 1.0)
 * @param {string} [options.method] - 'euler' | 'rk4' (default 'euler')
 * @param {number} [options.seed] - random seed for stochastic models
 * @returns {Object} simulation
 */
function createSimulation(system, options = {}) {
  if (!system || !system._isSystem) {
    throw new Error('createSimulation requires a system created with createSystem().');
  }

  const dt = options.dt !== undefined ? options.dt : 1.0;
  const method = options.method || 'euler';
  const seed = options.seed !== undefined ? options.seed : 42;

  if (typeof dt !== 'number' || dt <= 0) {
    throw new Error(`Simulation dt must be a positive number. Received: ${dt}`);
  }
  if (!['euler', 'rk4'].includes(method)) {
    throw new Error(`Simulation method must be 'euler' or 'rk4'. Received: ${method}`);
  }

  // Build initial state map — nodeId => state object
  const stateMap = new Map();
  system.nodes.forEach(node => {
    stateMap.set(node.id, { ...node.state });
  });

  return {
    system,
    dt,
    method,
    seed,
    t: 0,
    tick: 0,
    stateMap,
    history: [],
    stressors: [],
    _isSimulation: true
  };
}


// ─────────────────────────────────────────────
// CORE STEP
// ─────────────────────────────────────────────

/**
 * step
 *
 * Advances the simulation by one time step.
 * Returns the simulation with updated state — does not mutate in place.
 *
 * Order of operations:
 * 1. Apply any stressors scheduled for this tick
 * 2. Compute all edge transfer values from current state
 * 3. Aggregate inputs for each target node
 * 4. Run each node's dynamics function to produce next state
 * 5. Record snapshot in history
 *
 * @param {Object} sim - simulation from createSimulation()
 * @returns {Object} updated simulation
 */
function step(sim) {
  if (!sim._isSimulation) {
    throw new Error('step() requires a simulation from createSimulation().');
  }

  const { system, dt, t, tick } = sim;

  // 1. Apply stressors scheduled for this tick
  let currentStateMap = applyStressors(sim.stateMap, sim.stressors, tick);

  // 2. Compute all edge transfers from current state
  const transferMap = computeTransfers(system, currentStateMap, t);

  // 3. Aggregate inputs per node
  const inputMap = aggregateInputs(system, transferMap);

  // 4. Advance each node's state
  const nextStateMap = advanceNodes(system, currentStateMap, inputMap, t, dt, sim.method);

  // 5. Record snapshot
  const snapshot = buildSnapshot(tick, t, nextStateMap, transferMap);

  return {
    ...sim,
    t: t + dt,
    tick: tick + 1,
    stateMap: nextStateMap,
    history: [...sim.history, snapshot]
  };
}

/**
 * run
 *
 * Runs the simulation for a given number of ticks.
 * Returns the final simulation state with full history.
 *
 * @param {Object} sim    - simulation from createSimulation()
 * @param {number} ticks  - number of steps to run
 * @returns {Object} simulation after all ticks
 */
function run(sim, ticks) {
  if (typeof ticks !== 'number' || ticks < 1 || !Number.isInteger(ticks)) {
    throw new Error(`run() requires a positive integer number of ticks. Received: ${ticks}`);
  }

  let current = sim;
  for (let i = 0; i < ticks; i++) {
    current = step(current);
  }
  return current;
}


// ─────────────────────────────────────────────
// STRESSORS
// ─────────────────────────────────────────────

/**
 * addStressor
 *
 * Schedules an external shock to be applied at a specific tick.
 * A stressor modifies one or more node states directly —
 * simulating a drought, a market crash, a war, a disease outbreak.
 *
 * @param {Object} sim
 * @param {Object} stressor
 * @param {number} stressor.tick       - when to apply
 * @param {string} stressor.nodeId     - which node to affect
 * @param {Object} stressor.stateDelta - key-value changes to apply to state
 * @param {string} [stressor.label]    - human-readable description
 * @returns {Object} simulation with stressor added
 */
function addStressor(sim, stressor) {
  validateStressor(stressor, sim.system);
  return {
    ...sim,
    stressors: [...sim.stressors, stressor]
  };
}

function validateStressor(stressor, system) {
  if (typeof stressor.tick !== 'number' || stressor.tick < 0) {
    throw new Error(`Stressor tick must be a non-negative number.`);
  }
  if (!stressor.nodeId || typeof stressor.nodeId !== 'string') {
    throw new Error(`Stressor requires a nodeId string.`);
  }
  if (!system._nodeMap.has(stressor.nodeId)) {
    throw new Error(`Stressor references nonexistent node "${stressor.nodeId}".`);
  }
  if (!stressor.stateDelta || typeof stressor.stateDelta !== 'object') {
    throw new Error(`Stressor requires a stateDelta object.`);
  }
}

function applyStressors(stateMap, stressors, tick) {
  const scheduled = stressors.filter(s => s.tick === tick);
  if (scheduled.length === 0) return stateMap;

  const newStateMap = new Map(stateMap);
  scheduled.forEach(stressor => {
    const current = newStateMap.get(stressor.nodeId);
    const next = { ...current };
    Object.entries(stressor.stateDelta).forEach(([key, delta]) => {
      if (typeof next[key] === 'number' && typeof delta === 'number') {
        next[key] = next[key] + delta;
      } else {
        next[key] = delta;
      }
    });
    newStateMap.set(stressor.nodeId, next);
  });

  return newStateMap;
}


// ─────────────────────────────────────────────
// INTERNAL ENGINE
// ─────────────────────────────────────────────

/**
 * computeTransfers
 *
 * For every edge in the system, compute the transfer value
 * from source to target at time t using current source state.
 *
 * Returns a map of edgeId => transfer value.
 */
function computeTransfers(system, stateMap, t) {
  const transferMap = new Map();
  system.edges.forEach(edge => {
    const sourceState = stateMap.get(edge.source);
    try {
      const value = edge.transfer(sourceState, edge.weight, t);
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`Transfer function for edge "${edge.id}" returned non-numeric value: ${value}`);
      }
      transferMap.set(edge.id, value);
    } catch (err) {
      throw new Error(`Edge "${edge.id}" transfer error: ${err.message}`);
    }
  });
  return transferMap;
}

/**
 * aggregateInputs
 *
 * For each node, collect all incoming transfer values into
 * an inputs object keyed by edge id and source node id.
 * This is what gets passed to the node's dynamics function.
 */
function aggregateInputs(system, transferMap) {
  const inputMap = new Map();
  system.nodes.forEach(node => {
    inputMap.set(node.id, {});
  });

  system.edges.forEach(edge => {
    const value = transferMap.get(edge.id);
    const inputs = inputMap.get(edge.target);
    inputs[edge.id] = {
      from: edge.source,
      type: edge.type,
      value
    };
  });

  return inputMap;
}

/**
 * advanceNodes
 *
 * Run each node's dynamics function to produce the next state.
 * Supports Euler and RK4 methods.
 */
function advanceNodes(system, stateMap, inputMap, t, dt, method) {
  const nextStateMap = new Map();

  system.nodes.forEach(node => {
    const state = stateMap.get(node.id);
    const inputs = inputMap.get(node.id);

    let nextState;
    try {
      if (method === 'rk4') {
        nextState = rk4Step(node, state, inputs, t, dt);
      } else {
        nextState = eulerStep(node, state, inputs, t, dt);
      }
    } catch (err) {
      throw new Error(`Node "${node.id}" dynamics error: ${err.message}`);
    }

    validateNextState(node.id, state, nextState);
    nextStateMap.set(node.id, nextState);
  });

  return nextStateMap;
}

/**
 * eulerStep
 *
 * First-order numerical integration.
 * Calls dynamics to get the derivative, scales by dt.
 * Fast and sufficient for most models.
 */
function eulerStep(node, state, inputs, t, dt) {
  const derivative = node.dynamics(state, inputs, t);
  const nextState = {};
  Object.keys(state).forEach(key => {
    if (typeof state[key] === 'number' && typeof derivative[key] === 'number') {
      nextState[key] = state[key] + derivative[key] * dt;
    } else {
      nextState[key] = derivative[key] !== undefined ? derivative[key] : state[key];
    }
  });
  return nextState;
}

/**
 * rk4Step
 *
 * Fourth-order Runge-Kutta integration.
 * More accurate than Euler for stiff or rapidly-changing systems.
 * Four evaluations of the dynamics function per step.
 */
function rk4Step(node, state, inputs, t, dt) {
  const k1 = node.dynamics(state, inputs, t);
  const k2 = node.dynamics(addScaled(state, k1, dt / 2), inputs, t + dt / 2);
  const k3 = node.dynamics(addScaled(state, k2, dt / 2), inputs, t + dt / 2);
  const k4 = node.dynamics(addScaled(state, k3, dt), inputs, t + dt);

  const nextState = {};
  Object.keys(state).forEach(key => {
    if (
      typeof state[key] === 'number' &&
      typeof k1[key] === 'number' &&
      typeof k2[key] === 'number' &&
      typeof k3[key] === 'number' &&
      typeof k4[key] === 'number'
    ) {
      nextState[key] = state[key] + (dt / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]);
    } else {
      nextState[key] = k4[key] !== undefined ? k4[key] : state[key];
    }
  });
  return nextState;
}

function addScaled(state, derivative, scale) {
  const result = {};
  Object.keys(state).forEach(key => {
    if (typeof state[key] === 'number' && typeof derivative[key] === 'number') {
      result[key] = state[key] + derivative[key] * scale;
    } else {
      result[key] = state[key];
    }
  });
  return result;
}

function validateNextState(nodeId, prevState, nextState) {
  if (!nextState || typeof nextState !== 'object') {
    throw new Error(`Node "${nodeId}" dynamics returned invalid state.`);
  }
  Object.keys(prevState).forEach(key => {
    if (nextState[key] === undefined) {
      throw new Error(`Node "${nodeId}" dynamics dropped state key "${key}".`);
    }
  });
}


// ─────────────────────────────────────────────
// HISTORY AND SNAPSHOTS
// ─────────────────────────────────────────────

/**
 * buildSnapshot
 *
 * Records the full system state at a given tick.
 * This is what gets stored in history and later
 * consumed by the signal analysis layer.
 */
function buildSnapshot(tick, t, stateMap, transferMap) {
  const states = {};
  stateMap.forEach((state, nodeId) => {
    states[nodeId] = { ...state };
  });

  const transfers = {};
  transferMap.forEach((value, edgeId) => {
    transfers[edgeId] = value;
  });

  return Object.freeze({ tick, t, states, transfers });
}

/**
 * getStateAt
 *
 * Retrieve the state of a specific node at a specific tick.
 */
function getStateAt(sim, nodeId, tick) {
  const snapshot = sim.history[tick];
  if (!snapshot) {
    throw new Error(`No snapshot at tick ${tick}. Simulation has run ${sim.history.length} ticks.`);
  }
  if (!snapshot.states[nodeId]) {
    throw new Error(`Node "${nodeId}" not found in snapshot at tick ${tick}.`);
  }
  return snapshot.states[nodeId];
}

/**
 * getTimeSeries
 *
 * Extract the full time series of a single state variable
 * for a single node across all recorded history.
 *
 * @param {Object} sim
 * @param {string} nodeId
 * @param {string} variable  - state key to extract
 * @returns {number[]} array of values, one per tick
 */
function getTimeSeries(sim, nodeId, variable) {
  return sim.history.map((snapshot, tick) => {
    const state = snapshot.states[nodeId];
    if (!state) throw new Error(`Node "${nodeId}" not found at tick ${tick}.`);
    if (state[variable] === undefined) {
      throw new Error(`Variable "${variable}" not found in node "${nodeId}" at tick ${tick}.`);
    }
    return state[variable];
  });
}


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  createSimulation,
  step,
  run,
  addStressor,
  getStateAt,
  getTimeSeries
};
