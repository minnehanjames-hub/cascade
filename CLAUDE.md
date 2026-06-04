# Cascade

## What This Project Is

Cascade is a unified complexity collapse simulation engine applied to modeling hydrological stress in semiconductor fabrication supply chains as an early warning signal for market dislocation.

The core thesis: semiconductor fabs are among the most water-intensive industrial processes on earth. Regional hydrological stress — drought cycles, aquifer depletion, regulatory curtailment — represents a slow-moving, underpriced systemic risk that propagates through supply chains in nonlinear ways consistent with complexity collapse dynamics. This engine models that propagation.

## Architecture

```
src/
  engine/       # Core simulation: complexity collapse dynamics, cascade propagation
  models/
    hydro-semi/ # Domain model: hydrological stress → fab capacity → supply chain
  data/
    feeds/      # Data ingestion: water stress indices, fab locations, production data
  monitor/      # Early warning signal detection and alerting
research/       # Notes, papers, data sources, hypothesis development
```

## Key Concepts

- **Complexity collapse**: When interconnected systems exceed critical stress thresholds, they don't degrade linearly — they collapse in cascading waves. This engine models the topology of those cascades.
- **Hydrological stress indicators**: Water withdrawal rates, aquifer recharge deficits, drought indices (PDSI, SPI), regulatory curtailment events.
- **Fab dependency mapping**: Which fabs produce which nodes, where they are, and how much water they consume per wafer.
- **Market dislocation signals**: Inventory drawdowns, lead time spikes, spot price divergence from contract — the downstream fingerprints of upstream collapse.

## Stack

- **Runtime**: Node.js
- **Math**: mathjs (numerical methods, matrix ops, statistical functions)
- **Tests**: Jest

## Development Principles

- Model reality, not elegance. If the physics says the system is messy, the model should be messy.
- Every parameter should be traceable to a source. Put citations in `/research`.
- Early warning means false positives cost less than false negatives. Tune accordingly.
- Signal before structure: get the math right before optimizing the architecture.
