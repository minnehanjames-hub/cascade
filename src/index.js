'use strict';

/**
 * src/index.js — Cascade hydro-semiconductor monitor entry point.
 *
 * Loads live (or mock) hydrological data, runs the catalyst monitor, projects
 * each regional system 60 ticks forward, computes early-warning signals from
 * those trajectories, calculates financial exposure at current stress levels,
 * and prints a structured risk report to stdout.
 *
 * Usage:
 *   node src/index.js
 *   npm run monitor
 */

const {
  buildTaiwanSystem,
  buildArizonaSystem,
  buildSaxonySystem,
} = require('./models/hydro-semi/system');

const { runDataCycle }         = require('./data/feeds/water');
const { CatalystMonitor }      = require('./monitor');
const { Simulation }           = require('./engine/simulation');
const {
  warningSummary,
  systemWarningSummary,
} = require('./engine/signals');
const { calculateExposureScore } = require('./models/hydro-semi/exposure');
const { CATALYSTS }              = require('./models/hydro-semi/catalysts');

// ── ANSI helpers (no-op when stdout is not a TTY) ─────────────────────────────

const IS_TTY = !!process.stdout.isTTY;

const C = IS_TTY ? {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
} : Object.fromEntries(
  ['reset','bold','dim','red','yellow','green','cyan','magenta','blue'].map(k => [k, ''])
);

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmt  = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n)) ? n.toFixed(d) : '—';
const pct  = (n, d = 1) => `${fmt(n * 100, d)}%`;
const fmtB = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0.0B';
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}T`;
  return `$${n.toFixed(1)}B`;
};
const bar = (frac, w = 20) => {
  const f = Math.round(Math.min(1, Math.max(0, frac)) * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
};
const ruler = (ch = '─', w = 74) => ch.repeat(w);

function statusColor(s) {
  if (['CRISIS', 'CRITICAL'].includes(s)) return C.red   + C.bold;
  if (['WARNING', 'TRIGGER', 'ELEVATED'].includes(s))  return C.yellow + C.bold;
  if (s === 'WATCH')                        return C.yellow;
  return C.green;
}

function tauLabel(tau) {
  const sign = tau >= 0 ? '+' : '';
  const str  = `τ=${sign}${fmt(tau, 2)}`;
  if (tau >=  0.50) return C.yellow + C.bold + str + '⚠' + C.reset;
  if (tau >=  0.30) return C.yellow + str + C.reset;
  if (tau <= -0.50) return C.green  + str + '↓' + C.reset;
  return C.dim + str + C.reset;
}

function section(title) {
  const line = ruler();
  return `\n${C.bold}${line}\n  ${title}\n${line}${C.reset}`;
}

// ── Status classifiers ────────────────────────────────────────────────────────

const taiwanStatus  = (f) => f < 0.20 ? 'CRISIS' : f < 0.50 ? 'WARNING' : f < 0.70 ? 'WATCH' : 'NORMAL';
const azDepthStatus = (m) => m > 122  ? 'CRISIS' : m > 91   ? 'TRIGGER' : m > 80   ? 'ELEVATED' : 'NORMAL';
const elbeStatus    = (q) => q < 4.32 ? 'CRISIS' : q < 8.64 ? 'WARNING' : q < 13.8 ? 'WATCH' : 'NORMAL';
const scoreStatus   = (s) => s >= 0.70 ? 'CRITICAL' : s >= 0.45 ? 'ELEVATED' : s >= 0.25 ? 'WARNING' : s >= 0.10 ? 'WATCH' : 'NORMAL';

// ── Simulation helpers ────────────────────────────────────────────────────────

/**
 * Build and run a regional simulation, optionally seeding initial state from
 * live data. Returns the completed Simulation instance (history intact).
 */
function runRegionSim(system, patch = {}, ticks = 60) {
  const s0 = system.initialState();
  for (const [nodeId, vars] of Object.entries(patch)) {
    if (s0[nodeId]) Object.assign(s0[nodeId], vars);
  }
  const sim = new Simulation(system, { state: s0 });
  sim.run(ticks);
  return sim;
}

/**
 * Extract a time series from a completed simulation and compute EWS statistics.
 * Returns { summary, values, current, initial, delta, window }.
 */
function computeEWS(sim, nodeId, variable) {
  const ts     = sim.getTimeSeries(nodeId, variable);
  const values = ts.values;
  const window = Math.max(4, Math.floor(values.length / 2));

  const summary = warningSummary(values, {
    window,
    indicators:   ['ar1', 'variance', 'returnRate'],
    tauThreshold: 0.50,
    minSignals:   2,
  });

  return {
    summary,
    values,
    current: values[values.length - 1],
    initial: values[0],
    delta:   values[values.length - 1] - values[0],
    window,
  };
}

// ── Report sections ───────────────────────────────────────────────────────────

function printHeader(date) {
  console.log('\n' + C.bold + C.cyan + ruler('═'));
  console.log(`  CASCADE  ▸  HYDRO-SEMICONDUCTOR MONITOR  ▸  ${date}`);
  console.log(ruler('═') + C.reset);
}

function printDataSources(sources) {
  const tag = (s) => s.mock ? C.dim + '[mock]' + C.reset : C.green + '[live]' + C.reset;
  const staleTag = (s) => s.stale ? C.yellow + ' STALE' + C.reset : '';

  console.log('\n' + C.bold + 'DATA SOURCES' + C.reset);

  // Taiwan
  const tw = sources.taiwan;
  console.log(
    `  ${C.bold}Taiwan WRA${C.reset}   ${tw.source_date}  ` +
    `Shimen ${fmt(tw.shimen_storage_mcm,1)} MCM (${pct(tw.shimen_fill_fraction)})  ` +
    `Zengwen ${fmt(tw.zengwen_storage_mcm,1)} MCM (${pct(tw.zengwen_fill_fraction)})  ` +
    `Combined ${pct(tw.combined_fill_fraction)}  ${tag(tw)}${staleTag(tw)}`
  );

  // USGS
  const us = sources.usgs;
  console.log(
    `  ${C.bold}USGS NWIS${C.reset}    ${us.source_date}  ` +
    `Phoenix AMA depth ${fmt(us.depth_m)} m (${fmt(us.depth_ft)} ft)  ` +
    `[${us.sites_count} active sites]  ${tag(us)}${staleTag(us)}`
  );

  // NOAA
  const no = sources.noaa;
  const oniSign = no.oni >= 0 ? '+' : '';
  console.log(
    `  ${C.bold}NOAA CPC${C.reset}     ${no.date}    ` +
    `${no.advisory_status}  ONI ${oniSign}${fmt(no.oni,1)}  ` +
    `Taiwan 3m drought p=${pct(no.tw_drought_probability_3m)}  ${tag(no)}${staleTag(no)}`
  );
}

function printCompositeScore(report) {
  const { compositeScore: score, activeCatalysts, compositeScoreComponents: csc } = report;
  const status = scoreStatus(score);
  const col    = statusColor(status);
  const filled = Math.round(score * 40);
  const barStr = C.red + '█'.repeat(filled) + C.reset + '░'.repeat(40 - filled);

  console.log(section('COMPOSITE STRESS SCORE'));
  console.log(
    `  ${col}${fmt(score, 3)} / 1.000  [${status}]${C.reset}` +
    `    ${activeCatalysts.length} / ${CATALYSTS.length} catalysts active`
  );
  console.log(`  [${barStr}]`);
  if (csc) {
    console.log(
      `  ${C.dim}raw=${fmt(csc.rawScore,3)}  ` +
      `boost=×${fmt(csc.coActivationBoost,2)}  ` +
      `co-active=${csc.coActiveCount}  ` +
      `MAX_WEIGHT=${fmt(csc.maxCompositeWeight,1)}${C.reset}`
    );
  }
}

function printRegionalStatus(sources, simStates) {
  const tw = sources.taiwan;
  const us = sources.usgs;

  const twStatus = taiwanStatus(tw.combined_fill_fraction);
  const azStatus = azDepthStatus(us.depth_m);

  // Pull final fab water-stress values from sim states
  const twHsinStress   = simStates.taiwan?.tw_hsinchu_fab?.water_stress ?? 0;
  const twTainanStress = simStates.taiwan?.tw_tainan_fab?.water_stress  ?? 0;
  const azFabStress    = simStates.arizona?.az_fab21?.water_stress      ?? 0;
  const deFlow         = simStates.saxony?.de_elbe_flow?.flow_mcm_day   ?? 28.5;
  const deStatus       = elbeStatus(deFlow);
  const deFabStress    = simStates.saxony?.de_tsmc_dresden?.water_stress ?? 0;

  const azHeadroom    = 91   - us.depth_m;
  const azHeadroomCrs = 122  - us.depth_m;
  const elbeAboveEco  = ((deFlow / 8.64 - 1) * 100).toFixed(0);

  console.log(section('REGIONAL STATUS'));

  // ---- Taiwan
  const twCol = statusColor(twStatus);
  console.log(`  ${C.bold}TAIWAN${C.reset}   ${twCol}● ${twStatus}${C.reset}`);
  console.log(
    `    Shimen Reservoir    ${fmt(tw.shimen_storage_mcm,1).padStart(6)} / 309.1 MCM` +
    `  (${pct(tw.shimen_fill_fraction)})  [${bar(tw.shimen_fill_fraction,16)}]`
  );
  console.log(
    `    Zengwen Reservoir   ${fmt(tw.zengwen_storage_mcm,1).padStart(6)} / 708.1 MCM` +
    `  (${pct(tw.zengwen_fill_fraction)})  [${bar(tw.zengwen_fill_fraction,16)}]`
  );
  const belowThresh = tw.combined_fill_fraction < 0.50;
  const fillNote = belowThresh
    ? C.red + C.bold + 'BELOW 50% catalyst threshold' + C.reset
    : C.green + 'above 50% catalyst threshold' + C.reset;
  console.log(`    Combined fill       ${pct(tw.combined_fill_fraction).padStart(7)}  —  ${fillNote}`);
  console.log(`    Fab water stress    Hsinchu ${fmt(twHsinStress,3)}  ·  Tainan ${fmt(twTainanStress,3)}`);

  // ---- Arizona
  const azCol = statusColor(azStatus);
  console.log(`\n  ${C.bold}ARIZONA${C.reset}  ${azCol}● ${azStatus}${C.reset}`);
  console.log(`    Groundwater depth   ${fmt(us.depth_m)} m (${fmt(us.depth_ft)} ft)`);
  console.log(
    `    Regulatory trigger  91.0 m    ▸  ${fmt(azHeadroom)} m headroom` +
    `  (${pct(azHeadroom/91,0)} from trigger)`
  );
  console.log(`    Crisis threshold    122.0 m   ▸  ${fmt(azHeadroomCrs)} m headroom`);
  console.log(`    Fab 21 stress       ${fmt(azFabStress,3)}`);

  // ---- Saxony
  const deCol = statusColor(deStatus);
  const m3s   = Math.round(deFlow / 0.0864);
  console.log(`\n  ${C.bold}SAXONY${C.reset}   ${deCol}● ${deStatus}${C.reset}  ${C.dim}(TSMC Dresden: pre-operational, target 2027–28)${C.reset}`);
  console.log(`    Elbe flow (Dresden) ${fmt(deFlow)} MCM/day (${m3s} m³/s)`);
  console.log(`    Ecological minimum  8.64 MCM/day   ▸  ${elbeAboveEco}% above threshold`);
  console.log(`    PDSI                0.0 (neutral)`);
  console.log(`    TSMC Dresden stress ${fmt(deFabStress,3)}`);
}

function printCatalysts(monitorState, externalData, sources) {
  const tw = sources.taiwan;
  const us = sources.usgs;
  const no = sources.noaa;

  console.log(section('CATALYST STATUS  (10 catalysts · severity 2–5)'));

  for (const cat of CATALYSTS) {
    let result;
    try {
      result = cat.check(monitorState, [], externalData);
    } catch (e) {
      result = { active: false, value: NaN, detail: `check error: ${e.message}`, stressEquivalent: 0 };
    }

    const { active, stressEquivalent: stress, detail } = result;
    const approaching = !active && stress > 0.05;

    let symbol, col;
    if (active) {
      symbol = '◆ ACTIVE  ';
      col    = C.red + C.bold;
    } else if (approaching) {
      symbol = '◈ WATCH   ';
      col    = C.yellow;
    } else {
      symbol = '○ inactive';
      col    = C.dim;
    }

    const stressStr = active || approaching
      ? `  stress=${fmt(stress,3)}`
      : '';

    console.log(
      `  ${col}${symbol}${C.reset}  [sev ${cat.severity}]  ` +
      `${C.bold}${cat.id}${C.reset}` +
      (stressStr ? C.yellow + stressStr + C.reset : '')
    );
    if (active || approaching) {
      console.log(`             ${C.dim}${detail}${C.reset}`);
    }
  }
}

function printEWS(ewsByRegion) {
  console.log(section('EARLY WARNING SIGNALS  (60-tick forward projection)'));

  const INDICATOR_NAMES = {
    ar1:        'AR1          ',
    variance:   'Variance     ',
    returnRate: 'Return rate  ',
  };

  const entries = [
    { label: 'TAIWAN ', nodeVar: 'tw_shimen_res.storage_mcm',         ews: ewsByRegion.taiwan  },
    { label: 'ARIZONA', nodeVar: 'az_groundwater.depth_to_water_m',   ews: ewsByRegion.arizona },
    { label: 'SAXONY ', nodeVar: 'de_elbe_flow.flow_mcm_day',         ews: ewsByRegion.saxony  },
  ];

  for (const { label, nodeVar, ews } of entries) {
    if (!ews) { console.log(`\n  ${label}: no data`); continue; }
    const { summary, current, initial, delta, window } = ews;
    const { indicators, warning, signals } = summary;

    const deltaSign = delta >= 0 ? '+' : '';
    const warnStr   = warning
      ? C.yellow + C.bold + `⚠  ${signals}/${Object.keys(indicators).length} indicators flagged  →  WARNING RAISED` + C.reset
      : C.green + `✓  0/${Object.keys(indicators).length} indicators flagged  →  No warning` + C.reset;

    console.log(
      `\n  ${C.bold}${label}${C.reset}  (${nodeVar})  ` +
      `${C.dim}window=${window}${C.reset}`
    );
    console.log(
      `  ${C.dim}  Tick 0: ${fmt(initial,3)}  →  Tick 60: ${fmt(current,3)}` +
      `  (Δ ${deltaSign}${fmt(delta,3)})${C.reset}`
    );
    console.log(`  ${'  Indicator'.padEnd(18)}  ${'Latest'.padStart(10)}  ${'Trend'.padStart(12)}  Flag`);
    console.log(`  ` + ruler('─', 55));

    for (const [name, ind] of Object.entries(indicators)) {
      const latest  = Number.isFinite(ind.latest) ? fmt(ind.latest, 5) : '∞';
      const flagStr = ind.flagged
        ? C.yellow + '⚠' + C.reset
        : C.dim + '—' + C.reset;
      console.log(
        `  ${C.dim}  ${INDICATOR_NAMES[name]}${C.reset}` +
        `  ${latest.padStart(10)}  ` +
        `${tauLabel(ind.tau).padStart(12 + (IS_TTY ? 20 : 0))}  ${flagStr}`
      );
    }
    console.log(`  ${C.dim}  EWS result:${C.reset}          ${warnStr}`);
  }

  // Spatial correlation
  const sp = ewsByRegion.spatial;
  if (sp) {
    const latestStr = Number.isFinite(sp.latest) ? fmt(sp.latest, 4) : '—';
    const risingStr = sp.rising
      ? C.yellow + C.bold + '⚠ RISING  — regions losing independence' + C.reset
      : C.green + '✓ stable  — regions evolving independently' + C.reset;
    console.log(`\n  ${C.bold}SPATIAL CORRELATION${C.reset}  (cross-regional co-movement)`);
    console.log(`    Latest: ${latestStr}  ${tauLabel(sp.tau)}  ${risingStr}`);
  }
}

function printExposure(exposure) {
  console.log(section('FINANCIAL EXPOSURE AT CURRENT STRESS'));

  const regions = [
    { label: 'TAIWAN ', key: 'taiwan'  },
    { label: 'ARIZONA', key: 'arizona' },
    { label: 'SAXONY ', key: 'saxony'  },
  ];

  for (const { label, key } of regions) {
    const exp = exposure[key];
    if (!exp) { console.log(`\n  ${label}: unavailable`); continue; }
    const { composite, company_exposure, second_order, production } = exp;
    const impactCol = statusColor(
      composite.impact_label === 'catastrophic' || composite.impact_label === 'critical' ? 'CRITICAL' :
      composite.impact_label === 'severe'    ? 'WARNING' :
      composite.impact_label === 'moderate'  ? 'WATCH'   : 'NORMAL'
    );

    console.log(`\n  ${C.bold}${label}${C.reset}  (stress=${fmt(exp.stress_level,3)})`);
    console.log(
      `    Composite risk score   ` +
      `${impactCol}${fmt(composite.score,1).padStart(5)} / 100  [${composite.impact_label}]${C.reset}`
    );
    console.log(`    Effective disruption   ${pct(production.effective_disruption_pct/100,2)}`);
    console.log(`    Company rev at risk    ${fmtB(company_exposure.total_revenue_at_risk_B)}`);
    console.log(`    Second-order rev       ${fmtB(second_order.total_revenue_at_risk_B)}`);
    console.log(`    Total economy at risk  ${C.bold}${fmtB(composite.total_economy_revenue_at_risk_B)}${C.reset}`);

    const top = company_exposure.companies.filter(c => c.revenue_at_risk_B > 0.01).slice(0, 3);
    if (top.length) {
      console.log(`    Top exposed companies:`);
      for (const co of top) {
        console.log(
          `      ${co.ticker.padEnd(6)}  ${fmtB(co.revenue_at_risk_B).padStart(9)}` +
          `  [${co.impact_label}]  ${C.dim}${co.company}${C.reset}`
        );
      }
    }
  }
}

function printScenarios() {
  console.log(section('TAIWAN STRESS SCENARIOS'));

  const hdr = [
    'Stress'.padEnd(8),
    'Score/100'.padEnd(10),
    'Eff.Disrupt'.padEnd(13),
    'Company $B'.padEnd(12),
    'Economy $B'.padEnd(12),
    'Impact',
  ].join('  ');
  console.log(`  ${C.dim}${hdr}${C.reset}`);
  console.log(`  ${ruler('─', 70)}`);

  for (const s of [0.20, 0.30, 0.40, 0.50, 0.60, 0.75]) {
    const ex  = calculateExposureScore('taiwan', s);
    const col = statusColor(s >= 0.60 ? 'CRITICAL' : s >= 0.45 ? 'WARNING' : s >= 0.30 ? 'WATCH' : 'NORMAL');
    const row = [
      fmt(s, 2).padEnd(8),
      fmt(ex.composite.score, 1).padStart(5).padEnd(10),
      pct(ex.production.effective_disruption_pct / 100).padEnd(13),
      fmtB(ex.company_exposure.total_revenue_at_risk_B).padEnd(12),
      fmtB(ex.composite.total_economy_revenue_at_risk_B).padEnd(12),
      ex.composite.impact_label,
    ].join('  ');
    console.log(`  ${col}${row}${C.reset}`);
  }

  // Add a note on HHI concentration
  console.log(
    `\n  ${C.dim}N3/N2 HHI: 0.942/0.924 (near-monopoly concentration; ` +
    `substitute capacity = effectively zero)${C.reset}`
  );
}

function printFooter(cycle) {
  const { anyMock, staleSources, mockSources } = cycle.normalized.meta;
  const dataLabel = anyMock
    ? C.yellow + 'MOCK BASELINE (offline)' + C.reset
    : C.green  + 'LIVE DATA' + C.reset;
  const nextReview = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log('\n' + ruler());
  console.log(`  Data:         ${dataLabel}`);
  if (mockSources.length)  console.log(`  Mock sources: ${mockSources.join(', ')}`);
  if (staleSources.length) console.log(`  ${C.yellow}Stale sources: ${staleSources.join(', ')}${C.reset}`);
  console.log(`  Freshness:    Taiwan 26h  ·  USGS 7d  ·  NOAA 30d`);
  console.log(`  Next review:  ${nextReview}`);
  console.log(ruler() + '\n');
}

// ── Normalise series to [0,1] for spatial correlation (preserves shape) ────────

function normalise(vals) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo;
  if (range < 1e-10) return vals.map(() => 0);
  return vals.map(v => (v - lo) / range);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().slice(0, 10);

  // ── 1. Live data ───────────────────────────────────────────────────────────
  process.stdout.write('Fetching hydrological data...   ');
  const cycle = await runDataCycle();
  console.log('done');

  const { sources, normalized: { state: normState, externalData } } = cycle;

  // ── 2. Catalyst monitor ───────────────────────────────────────────────────
  process.stdout.write('Running catalyst monitor...     ');
  const monitor      = new CatalystMonitor({ dtDays: 1 });
  const monitorReport = monitor.runMonitorCycle(normState, [], externalData);
  console.log('done');

  // ── 3. Regional simulations (60 ticks) ───────────────────────────────────
  process.stdout.write('Running simulations (3 × 60t)... ');

  const twSim = runRegionSim(buildTaiwanSystem(), {
    tw_shimen_res:  { storage_mcm: sources.taiwan.shimen_storage_mcm },
    tw_zengwen_res: { storage_mcm: sources.taiwan.zengwen_storage_mcm },
  });

  const azSim = runRegionSim(buildArizonaSystem(), {
    az_groundwater: { depth_to_water_m: sources.usgs.depth_m },
  });

  const deSim = runRegionSim(buildSaxonySystem());

  console.log('done');

  // ── 4. Early-warning signals ──────────────────────────────────────────────
  process.stdout.write('Computing EWS indicators...     ');

  const twEWS = computeEWS(twSim, 'tw_shimen_res',  'storage_mcm');
  const azEWS = computeEWS(azSim, 'az_groundwater', 'depth_to_water_m');
  const deEWS = computeEWS(deSim, 'de_elbe_flow',   'flow_mcm_day');

  // Spatial correlation: normalise series to same [0,1] scale so very
  // different units (MCM vs metres vs MCM/day) don't dominate.
  const sysEWS = systemWarningSummary(
    {
      taiwan:  normalise(twEWS.values),
      arizona: normalise(azEWS.values),
      saxony:  normalise(deEWS.values),
    },
    { window: 30, tauThreshold: 0.50 }
  );

  console.log('done');

  // ── 5. Financial exposure ─────────────────────────────────────────────────
  process.stdout.write('Calculating exposure...         ');

  // Use final-tick fab water-stress from each regional simulation.
  // Small floor (0.001) avoids perfectly-zero input to exposure curves.
  const twStress = Math.max(0.001, twSim.state.tw_tainan_fab?.water_stress  ?? 0);
  const azStress = Math.max(0.001, azSim.state.az_fab21?.water_stress        ?? 0);
  const deStress = Math.max(0.001, deSim.state.de_tsmc_dresden?.water_stress ?? 0);

  const exposure = {
    taiwan:  calculateExposureScore('taiwan',  twStress),
    arizona: calculateExposureScore('arizona', azStress),
    saxony:  calculateExposureScore('germany', deStress),
  };

  console.log('done\n');

  // ── 6. Build a comprehensive state map for catalyst display checks ─────────
  // Merges all three simulation final states so every catalyst's check() fn
  // can find the node variables it references.
  const monitorState = {
    ...twSim.state,
    ...azSim.state,
    ...deSim.state,
    // Override with live sensor data where available
    tw_shimen_res:  { ...twSim.state.tw_shimen_res,  storage_mcm: sources.taiwan.shimen_storage_mcm },
    tw_zengwen_res: { ...twSim.state.tw_zengwen_res, storage_mcm: sources.taiwan.zengwen_storage_mcm },
    az_groundwater: { ...azSim.state.az_groundwater, depth_to_water_m: sources.usgs.depth_m },
  };

  // ── 7. Print report ───────────────────────────────────────────────────────
  printHeader(date);
  printDataSources(sources);
  printCompositeScore(monitorReport);
  printRegionalStatus(sources, {
    taiwan:  twSim.state,
    arizona: azSim.state,
    saxony:  deSim.state,
  });
  printCatalysts(monitorState, externalData, sources);
  printEWS({
    taiwan:  twEWS,
    arizona: azEWS,
    saxony:  deEWS,
    spatial: sysEWS.spatial,
  });
  printExposure(exposure);
  printScenarios();
  printFooter(cycle);
}

main().catch((err) => {
  console.error(C.red + C.bold + '\nFatal error:' + C.reset, err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
