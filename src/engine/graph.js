'use strict';

/**
 * graph.js — Directed graph engine for complexity-collapse simulation.
 *
 * A System is a directed graph of Nodes and Edges.
 *
 *  - Nodes hold dynamic state and a `dynamics` function that returns the
 *    time-derivative of that state given the influences arriving on incoming
 *    edges.
 *  - Edges carry a typed `transfer` function that maps the source node's state
 *    into a scalar flux delivered to the target node.
 *
 * The graph itself is integration-agnostic: it knows how to produce an initial
 * state snapshot and how to compute derivatives for an *arbitrary* state. The
 * simulation engine (simulation.js) owns the numerical integration and calls
 * back into `System.computeDerivatives` — this separation is what makes RK4
 * (which evaluates derivatives at hypothetical, off-trajectory states) possible.
 */

const EDGE_TYPES = Object.freeze([
  'flow', // mass/resource transfer: source loses, target gains
  'predation', // target consumes source (nonlinear, often Holling-type)
  'dependency', // target's capacity is gated by source availability
  'inhibition', // source suppresses target's growth/activity
  'information', // signal coupling with no conserved quantity
]);

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function firstNumericKey(stateObj) {
  for (const k of Object.keys(stateObj)) {
    if (isNumber(stateObj[k])) return k;
  }
  return null;
}

/**
 * A node in the system.
 *
 * @param {object} spec
 * @param {string} spec.id        Unique identifier.
 * @param {string} spec.type      Caller-defined category (e.g. 'aquifer', 'fab').
 * @param {object} [spec.state]   Initial state variables (numeric values evolve).
 * @param {function} [spec.dynamics]  (state, inputs, context) => derivatives.
 *        `state`   — the node's current state object.
 *        `inputs`  — array of { edgeId, type, weight, value, source } for each
 *                    incoming edge, where `value` is the edge's transfer result.
 *        `context` — { t, tick, dt, system }.
 *        Returns a partial map of { variable: d/dt }. Omitted variables are
 *        treated as having zero derivative.
 * @param {string} [spec.output]  Name of the variable a default edge transfer
 *        reads from this node when it is an edge source. Defaults to the first
 *        numeric state variable.
 * @param {object} [spec.meta]    Arbitrary metadata (units, coordinates, source).
 */
class Node {
  constructor(spec = {}) {
    const { id, type = 'generic', state = {}, dynamics, output, meta = {} } = spec;

    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Node requires a non-empty string id');
    }
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error(`Node "${id}": state must be a plain object`);
    }
    if (dynamics !== undefined && typeof dynamics !== 'function') {
      throw new Error(`Node "${id}": dynamics must be a function`);
    }
    if (output !== undefined && (typeof output !== 'string' || !(output in state))) {
      throw new Error(`Node "${id}": output "${output}" is not a state variable`);
    }

    this.id = id;
    this.type = type;
    this.state = { ...state };
    this.dynamics = dynamics || null;
    this.output = output || firstNumericKey(state);
    this.meta = { ...meta };
  }

  /** Numeric variable names that participate in integration. */
  numericVars() {
    return Object.keys(this.state).filter((k) => isNumber(this.state[k]));
  }

  clone() {
    return new Node({
      id: this.id,
      type: this.type,
      state: this.state,
      dynamics: this.dynamics || undefined,
      output: this.output || undefined,
      meta: this.meta,
    });
  }
}

/**
 * A directed edge.
 *
 * @param {object} spec
 * @param {string} spec.id          Unique identifier.
 * @param {string} spec.source      Source node id.
 * @param {string} spec.target      Target node id.
 * @param {string} spec.type        One of EDGE_TYPES.
 * @param {number} [spec.weight]    Coupling strength (default 1).
 * @param {function} [spec.transfer] (sourceState, targetState, weight, context)
 *        => number. Defaults to `weight * sourceState[source.output]`.
 * @param {object} [spec.meta]      Arbitrary metadata.
 */
class Edge {
  constructor(spec = {}) {
    const { id, source, target, type, weight = 1, transfer, meta = {} } = spec;

    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Edge requires a non-empty string id');
    }
    if (typeof source !== 'string' || source.length === 0) {
      throw new Error(`Edge "${id}": source must be a non-empty string`);
    }
    if (typeof target !== 'string' || target.length === 0) {
      throw new Error(`Edge "${id}": target must be a non-empty string`);
    }
    if (!EDGE_TYPES.includes(type)) {
      throw new Error(
        `Edge "${id}": type "${type}" invalid; expected one of ${EDGE_TYPES.join(', ')}`
      );
    }
    if (!isNumber(weight)) {
      throw new Error(`Edge "${id}": weight must be a finite number`);
    }
    if (transfer !== undefined && typeof transfer !== 'function') {
      throw new Error(`Edge "${id}": transfer must be a function`);
    }

    this.id = id;
    this.source = source;
    this.target = target;
    this.type = type;
    this.weight = weight;
    this.transfer = transfer || null;
    this.meta = { ...meta };
  }

  /**
   * Resolve the flux carried by this edge for a given state snapshot.
   * `sourceOutput` is the source node's declared output variable, used by the
   * default transfer when no explicit transfer function was supplied.
   */
  evaluate(sourceState, targetState, context, sourceOutput) {
    if (this.transfer) {
      const v = this.transfer(sourceState, targetState, this.weight, context);
      return isNumber(v) ? v : 0;
    }
    const key = sourceOutput || firstNumericKey(sourceState);
    const base = key && isNumber(sourceState[key]) ? sourceState[key] : 0;
    return this.weight * base;
  }

  clone() {
    return new Edge({
      id: this.id,
      source: this.source,
      target: this.target,
      type: this.type,
      weight: this.weight,
      transfer: this.transfer || undefined,
      meta: this.meta,
    });
  }
}

class System {
  constructor(name = 'system') {
    this.name = name;
    this._nodes = new Map(); // id -> Node
    this._edges = new Map(); // id -> Edge
    this._incoming = new Map(); // nodeId -> Set<edgeId>
    this._outgoing = new Map(); // nodeId -> Set<edgeId>
  }

  // ---- construction -------------------------------------------------------

  addNode(spec) {
    const node = spec instanceof Node ? spec : new Node(spec);
    if (this._nodes.has(node.id)) {
      throw new Error(`Duplicate node id "${node.id}"`);
    }
    this._nodes.set(node.id, node);
    this._incoming.set(node.id, new Set());
    this._outgoing.set(node.id, new Set());
    return node;
  }

  /**
   * Add an edge. Broken endpoint references throw immediately — a System is
   * never allowed to hold a dangling edge.
   */
  addEdge(spec) {
    const edge = spec instanceof Edge ? spec : new Edge(spec);
    if (this._edges.has(edge.id)) {
      throw new Error(`Duplicate edge id "${edge.id}"`);
    }
    if (!this._nodes.has(edge.source)) {
      throw new Error(`Edge "${edge.id}": source node "${edge.source}" does not exist`);
    }
    if (!this._nodes.has(edge.target)) {
      throw new Error(`Edge "${edge.id}": target node "${edge.target}" does not exist`);
    }
    this._edges.set(edge.id, edge);
    this._outgoing.get(edge.source).add(edge.id);
    this._incoming.get(edge.target).add(edge.id);
    return edge;
  }

  /** Convenience: build a whole system from a plain spec. Validates on build. */
  static build({ name = 'system', nodes = [], edges = [] } = {}) {
    const sys = new System(name);
    for (const n of nodes) sys.addNode(n);
    for (const e of edges) sys.addEdge(e);
    sys.validate();
    return sys;
  }

  /**
   * Full structural validation. Endpoint integrity is already guaranteed by
   * addEdge; this re-checks the invariants and surfaces any corruption.
   */
  validate() {
    for (const edge of this._edges.values()) {
      if (!this._nodes.has(edge.source)) {
        throw new Error(`Edge "${edge.id}": dangling source "${edge.source}"`);
      }
      if (!this._nodes.has(edge.target)) {
        throw new Error(`Edge "${edge.id}": dangling target "${edge.target}"`);
      }
    }
    for (const id of this._nodes.keys()) {
      if (!this._incoming.has(id) || !this._outgoing.has(id)) {
        throw new Error(`Node "${id}": adjacency index corrupted`);
      }
    }
    return true;
  }

  // ---- queries ------------------------------------------------------------

  hasNode(id) {
    return this._nodes.has(id);
  }
  hasEdge(id) {
    return this._edges.has(id);
  }
  getNode(id) {
    const n = this._nodes.get(id);
    if (!n) throw new Error(`No node "${id}"`);
    return n;
  }
  getEdge(id) {
    const e = this._edges.get(id);
    if (!e) throw new Error(`No edge "${id}"`);
    return e;
  }
  nodes() {
    return [...this._nodes.values()];
  }
  edges() {
    return [...this._edges.values()];
  }
  get nodeCount() {
    return this._nodes.size;
  }
  get edgeCount() {
    return this._edges.size;
  }
  nodeIds() {
    return [...this._nodes.keys()];
  }
  nodesByType(type) {
    return this.nodes().filter((n) => n.type === type);
  }
  edgesByType(type) {
    return this.edges().filter((e) => e.type === type);
  }

  outgoingEdges(nodeId) {
    this._assertNode(nodeId);
    return [...this._outgoing.get(nodeId)].map((id) => this._edges.get(id));
  }
  incomingEdges(nodeId) {
    this._assertNode(nodeId);
    return [...this._incoming.get(nodeId)].map((id) => this._edges.get(id));
  }
  successors(nodeId) {
    return this.outgoingEdges(nodeId).map((e) => this._nodes.get(e.target));
  }
  predecessors(nodeId) {
    return this.incomingEdges(nodeId).map((e) => this._nodes.get(e.source));
  }
  neighbors(nodeId) {
    const seen = new Map();
    for (const n of this.successors(nodeId)) seen.set(n.id, n);
    for (const n of this.predecessors(nodeId)) seen.set(n.id, n);
    return [...seen.values()];
  }
  edgesBetween(source, target) {
    return this.outgoingEdges(source).filter((e) => e.target === target);
  }
  outDegree(nodeId) {
    this._assertNode(nodeId);
    return this._outgoing.get(nodeId).size;
  }
  inDegree(nodeId) {
    this._assertNode(nodeId);
    return this._incoming.get(nodeId).size;
  }
  degree(nodeId) {
    return this.inDegree(nodeId) + this.outDegree(nodeId);
  }

  /** Kahn's algorithm. Returns ordered node ids, or null if the graph cycles. */
  topologicalOrder() {
    const indeg = new Map();
    for (const id of this._nodes.keys()) indeg.set(id, this.inDegree(id));
    const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const succ of this.successors(id)) {
        const d = indeg.get(succ.id) - 1;
        indeg.set(succ.id, d);
        if (d === 0) queue.push(succ.id);
      }
    }
    return order.length === this._nodes.size ? order : null;
  }

  hasCycle() {
    return this.topologicalOrder() === null;
  }

  // ---- dynamics -----------------------------------------------------------

  /** Deep copy of every node's current state: { nodeId: { var: value } }. */
  initialState() {
    const state = {};
    for (const [id, node] of this._nodes) state[id] = { ...node.state };
    return state;
  }

  /**
   * Compute d(state)/dt for the entire system at an arbitrary `state`.
   *
   * For each node we resolve every incoming edge's transfer (using the *given*
   * state, not the node's stored state — this is essential for RK4 stages),
   * assemble the `inputs` array, and invoke the node's dynamics function. Nodes
   * without a dynamics function are static (all-zero derivative).
   *
   * @returns {object} derivatives in the same nested shape as `state`.
   */
  computeDerivatives(state, context = {}) {
    const ctx = { ...context, system: this };
    const deriv = {};

    for (const [nodeId, node] of this._nodes) {
      const here = state[nodeId] || node.state;

      const inputs = [];
      for (const edgeId of this._incoming.get(nodeId)) {
        const edge = this._edges.get(edgeId);
        const src = this._nodes.get(edge.source);
        const sourceState = state[edge.source] || src.state;
        const value = edge.evaluate(sourceState, here, ctx, src.output);
        inputs.push({
          edgeId,
          type: edge.type,
          weight: edge.weight,
          value,
          source: edge.source,
        });
      }

      const d = {};
      for (const v of node.numericVars()) d[v] = 0;

      if (node.dynamics) {
        const out = node.dynamics(here, inputs, ctx) || {};
        for (const [k, val] of Object.entries(out)) {
          d[k] = isNumber(val) ? val : 0;
        }
      }
      deriv[nodeId] = d;
    }
    return deriv;
  }

  /** Sum of incoming flux by edge type for a node — a handy diagnostic. */
  fluxSummary(state, nodeId, context = {}) {
    const ctx = { ...context, system: this };
    const here = state[nodeId] || this.getNode(nodeId).state;
    const summary = {};
    for (const edge of this.incomingEdges(nodeId)) {
      const src = this.getNode(edge.source);
      const ss = state[edge.source] || src.state;
      const v = edge.evaluate(ss, here, ctx, src.output);
      summary[edge.type] = (summary[edge.type] || 0) + v;
    }
    return summary;
  }

  describe() {
    return {
      name: this.name,
      nodes: this.nodeCount,
      edges: this.edgeCount,
      types: {
        nodes: countBy(this.nodes(), (n) => n.type),
        edges: countBy(this.edges(), (e) => e.type),
      },
      acyclic: !this.hasCycle(),
    };
  }

  clone() {
    const sys = new System(this.name);
    for (const n of this._nodes.values()) sys.addNode(n.clone());
    for (const e of this._edges.values()) sys.addEdge(e.clone());
    return sys;
  }

  _assertNode(id) {
    if (!this._nodes.has(id)) throw new Error(`No node "${id}"`);
  }
}

function countBy(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

module.exports = { System, Node, Edge, EDGE_TYPES };
