/**
 * Cascade — Graph Engine (Layer 1)
 *
 * The foundation of everything. A system in Cascade is a directed graph
 * where nodes hold dynamic state and edges carry transfer functions.
 *
 * Nothing in this file knows about time, simulation, or visualization.
 * It only knows about structure and validity.
 */

'use strict';

const VALID_DOMAINS = [
  'ecology',
  'finance',
  'civilization',
  'epidemiology',
  'climate',
  'custom'
];

const VALID_EDGE_TYPES = [
  'flow',
  'predation',
  'dependency',
  'inhibition',
  'information',
  'custom'
];

function createNode({ id, type, state, dynamics, metadata = {} }) {
  validateNodeInputs({ id, type, state, dynamics });
  return Object.freeze({
    id,
    type,
    state: { ...state },
    dynamics,
    metadata: { ...metadata },
    _isNode: true
  });
}

function validateNodeInputs({ id, type, state, dynamics }) {
  if (!id || typeof id !== 'string') {
    throw new Error(`Node requires a string id. Received: ${JSON.stringify(id)}`);
  }
  if (!type || typeof type !== 'string') {
    throw new Error(`Node "${id}" requires a string type.`);
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error(`Node "${id}" requires a state object.`);
  }
  if (typeof dynamics !== 'function') {
    throw new Error(`Node "${id}" requires a dynamics function (state, inputs, t) => newState.`);
  }
}

function createEdge({ id, source, target, type, weight, transfer, metadata = {} }) {
  validateEdgeInputs({ id, source, target, type, weight, transfer });
  return Object.freeze({
    id,
    source,
    target,
    type,
    weight,
    transfer,
    metadata: { ...metadata },
    _isEdge: true
  });
}

function validateEdgeInputs({ id, source, target, type, weight, transfer }) {
  if (!id || typeof id !== 'string') {
    throw new Error(`Edge requires a string id.`);
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Edge "${id}" requires a source node id.`);
  }
  if (!target || typeof target !== 'string') {
    throw new Error(`Edge "${id}" requires a target node id.`);
  }
  if (source === target) {
    throw new Error(`Edge "${id}" source and target cannot be the same node.`);
  }
  if (!VALID_EDGE_TYPES.includes(type)) {
    throw new Error(`Edge "${id}" has invalid type "${type}". Valid types: ${VALID_EDGE_TYPES.join(', ')}`);
  }
  if (typeof weight !== 'number' || isNaN(weight)) {
    throw new Error(`Edge "${id}" requires a numeric weight.`);
  }
  if (typeof transfer !== 'function') {
    throw new Error(`Edge "${id}" requires a transfer function (sourceState, weight, t) => value.`);
  }
}

function createSystem({ id, name, version, domain, nodes, edges, parameters = {}, metadata = {} }) {
  validateSystemInputs({ id, name, version, domain, nodes, edges });
  const nodeMap = buildNodeMap(nodes);
  validateEdgeReferences(edges, nodeMap);
  const adjacency = buildAdjacency(edges, nodeMap);
  return Object.freeze({
    id,
    name,
    version,
    domain,
    nodes: nodes.map(n => ({ ...n })),
    edges: edges.map(e => ({ ...e })),
    parameters: { ...parameters },
    metadata: { ...metadata },
    _nodeMap: nodeMap,
    _adjacency: adjacency,
    _isSystem: true
  });
}

function validateSystemInputs({ id, name, version, domain, nodes, edges }) {
  if (!id || typeof id !== 'string') {
    throw new Error(`System requires a string id.`);
  }
  if (!name || typeof name !== 'string') {
    throw new Error(`System "${id}" requires a name.`);
  }
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`System "${id}" requires a semver version string (e.g. "1.0.0").`);
  }
  if (!VALID_DOMAINS.includes(domain)) {
    throw new Error(`System "${id}" has invalid domain "${domain}". Valid: ${VALID_DOMAINS.join(', ')}`);
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error(`System "${id}" requires at least one node.`);
  }
  if (!Array.isArray(edges)) {
    throw new Error(`System "${id}" requires an edges array (can be empty).`);
  }
  nodes.forEach((n, i) => {
    if (!n._isNode) {
      throw new Error(`System "${id}": item at nodes[${i}] was not created with createNode().`);
    }
  });
  edges.forEach((e, i) => {
    if (!e._isEdge) {
      throw new Error(`System "${id}": item at edges[${i}] was not created with createEdge().`);
    }
  });
  const ids = nodes.map(n => n.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    throw new Error(`System "${id}": duplicate node ids: ${dupes.join(', ')}`);
  }
}

function buildNodeMap(nodes) {
  const map = new Map();
  nodes.forEach(n => map.set(n.id, n));
  return map;
}

function validateEdgeReferences(edges, nodeMap) {
  edges.forEach(edge => {
    if (!nodeMap.has(edge.source)) {
      throw new Error(`Edge "${edge.id}" references nonexistent source node "${edge.source}".`);
    }
    if (!nodeMap.has(edge.target)) {
      throw new Error(`Edge "${edge.id}" references nonexistent target node "${edge.target}".`);
    }
  });
}

function buildAdjacency(edges, nodeMap) {
  const adj = new Map();
  nodeMap.forEach((_, id) => adj.set(id, []));
  edges.forEach(edge => {
    adj.get(edge.source).push(edge);
  });
  return adj;
}

function getNode(system, nodeId) {
  const node = system._nodeMap.get(nodeId);
  if (!node) throw new Error(`Node "${nodeId}" not found in system "${system.id}".`);
  return node;
}

function getOutgoingEdges(system, nodeId) {
  return system._adjacency.get(nodeId) || [];
}

function getIncomingEdges(system, nodeId) {
  return system.edges.filter(e => e.target === nodeId);
}

function getNeighbors(system, nodeId) {
  const outgoing = getOutgoingEdges(system, nodeId).map(e => e.target);
  const incoming = getIncomingEdges(system, nodeId).map(e => e.source);
  return [...new Set([...outgoing, ...incoming])];
}

function describeSystem(system) {
  const nodeTypes = {};
  system.nodes.forEach(n => {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  });
  const edgeTypes = {};
  system.edges.forEach(e => {
    edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
  });
  return {
    id: system.id,
    name: system.name,
    version: system.version,
    domain: system.domain,
    nodeCount: system.nodes.length,
    edgeCount: system.edges.length,
    nodeTypes,
    edgeTypes,
    parameters: system.parameters
  };
}

module.exports = {
  createNode,
  createEdge,
  createSystem,
  getNode,
  getOutgoingEdges,
  getIncomingEdges,
  getNeighbors,
  describeSystem,
  VALID_DOMAINS,
  VALID_EDGE_TYPES
};
