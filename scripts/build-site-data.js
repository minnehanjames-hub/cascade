'use strict';

/**
 * scripts/build-site-data.js
 *
 * Produces docs/data.json — the single machine-readable artifact the static
 * dashboard renders. It runs the same pipeline as the CLI monitor
 * (src/index.js) plus the historical critical-slowing-down (CSD) analysis on
 * real WRA reservoir history (research/data/reservoir-history-weekly.json).
 *
 * Everything written here is computed from the engine + live/real data — no
 * hand-entered numbers. Re-run after `npm run fetch:history` to refresh.
 *
 * Usage:  node scripts/build-site-data.js   (npm run build:site)
 */

const fs = require('fs');
const path = require('path');

const {
  buildTaiwanSystem,
  buildArizonaSystem,
  buildSaxonySystem,
} = require('../src/models/hydro-semi/system');
const { runDataCycle } = require('../src/data/feeds/water');
const { CatalystMonitor } = require('../src/monitor');
const { Simulation } = require('../src/engine/simulation');
const {
  warningSummary,
  systemWarningSummary,
  spatialCorrelation,
  detrend,
  rollingMetric,
  kendallTau,
} = require('../src/engine/signals');
const { calculateExposureScore } = require('../src/models/hydro-semi/exposure');
const { CATALYSTS } = require('../src/models/hydro-semi/catalysts');

const HISTORY = path.join(__dirname, '..', 'research', 'data', 'reservoir-history-weekly.json');
const OUT = path.join(__dirname, '..', 'docs', 'data.json');

const EWS_OPTS = {
  indicators: ['ar1', 'variance', 'returnRate'],
  tauThreshold: 0.5,
  minSignals: 2,
};

function runRegionSim(system, patch = {}, ticks = 60) {
  const s0 = system.initialState();
  for (const [nodeId, vars] of Object.entries(patch)) {
    if (s0[nodeId]) Object.assign(s0[nodeId], vars);
  }
  const sim = new Simulation(system, { state: s0 });
  sim.run(ticks);
  return sim;
}

function computeEWS(sim, nodeId, variable) {
  const ts = sim.getTimeSeries(nodeId, variable);
  const values = ts.values;
  const window = Math.max(4, Math.floor(values.length / 2));
  const summary = warningSummary(values, { window, ...EWS_OPTS });
  return {
    summary,
    values,
    current: values[values.length - 1],
    initial: values[0],
    delta: values[values.length - 1] - values[0],
    window,
  };
}

function normalise(vals) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo;
  if (range < 1e-10) return vals.map(() => 0);
  return vals.map((v) => (v - lo) / range);
}

// ── Historical CSD analysis on real reservoir data ───────────────────────────

function analyseHistory() {
  const raw = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  const rows = raw.series;
  const dates = rows.map((r) => r.date);

  // Fill isolated null fill values by linear interpolation of neighbours.
  function clean(key) {
    const v = rows.map((r) => r[key]);
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) {
        let a = i - 1, b = i + 1;
        while (a >= 0 && v[a] == null) a--;
        while (b < v.length && v[b] == null) b++;
        if (a >= 0 && b < v.length) v[i] = v[a] + (v[b] - v[a]) * (i - a) / (b - a);
        else v[i] = v[a >= 0 ? a : b];
      }
    }
    return v;
  }

  const shimen = clean('shimen_fill');
  const zengwen = clean('zengwen_fill');

  // Combined fill fraction by absolute storage (Capacity), normalised to the
  // max observed combined storage (≈ full).
  const shStore = clean('shimen_storage');
  const zwStore = clean('zengwen_storage');
  const shFull = Math.max(...shStore);
  const zwFull = Math.max(...zwStore);
  const combined = rows.map((_, i) => +(((shStore[i] + zwStore[i]) / (shFull + zwFull)) * 100).toFixed(2));

  const window = 12;

  function analyseSeries(name, x) {
    const rawSum = warningSummary(x, { window, ...EWS_OPTS });
    const detSum = warningSummary(x, { window, detrend: true, detrendWindow: 5, ...EWS_OPTS });

    // Seasonal drawdown limb: global peak (before trough) → global trough.
    let tro = 0;
    for (let i = 0; i < x.length; i++) if (x[i] < x[tro]) tro = i;
    let pk = 0;
    for (let i = 0; i <= tro; i++) if (x[i] > x[pk]) pk = i;
    const limb = x.slice(pk, tro + 1);
    let limbSum = null;
    if (limb.length >= 6) {
      const lw = Math.max(4, Math.floor(limb.length / 2));
      limbSum = warningSummary(limb, { window: lw, detrend: true, detrendWindow: 3, ...EWS_OPTS });
    }

    // Recovery: latest vs trough, is the trough behind us?
    const latest = x[x.length - 1];
    const trough = x[tro];
    const recovering = tro < x.length - 1 && latest > trough + 1.0;

    return {
      name,
      series: x.map((v) => +v.toFixed(2)),
      latest: +latest.toFixed(1),
      min: +Math.min(...x).toFixed(1),
      max: +Math.max(...x).toFixed(1),
      trough: { date: dates[tro], value: +trough.toFixed(1), index: tro },
      peak: { date: dates[pk], value: +x[pk].toFixed(1), index: pk },
      recovering,
      raw: { warning: rawSum.warning, signals: rawSum.signals, indicators: rawSum.indicators },
      detrended: { warning: detSum.warning, signals: detSum.signals, indicators: detSum.indicators },
      drawdownLimb: limbSum
        ? {
            from: dates[pk], to: dates[tro], n: limb.length,
            warning: limbSum.warning, signals: limbSum.signals, indicators: limbSum.indicators,
          }
        : null,
    };
  }

  const nodes = {
    shimen: analyseSeries('Shimen 石門', shimen),
    zengwen: analyseSeries('Zengwen 曾文', zengwen),
    combined: analyseSeries('Combined', combined),
  };

  // Rolling spatial correlation between the two reservoirs (detrended).
  const shRes = detrend(shimen, 5);
  const zwRes = detrend(zengwen, 5);
  const spIndex = [];
  const spVals = [];
  for (let end = window; end <= shRes.length; end++) {
    spIndex.push(end - 1);
    spVals.push(spatialCorrelation([shRes.slice(end - window, end), zwRes.slice(end - window, end)]));
  }
  const spatial = {
    trajectory: spVals.map((v) => +v.toFixed(4)),
    latest: +spVals[spVals.length - 1].toFixed(4),
    tau: +kendallTau(spVals).toFixed(4),
    rising: kendallTau(spVals) >= 0.5,
  };

  // Data-driven verdict.
  const csdNodes = ['shimen', 'zengwen', 'combined'].filter((k) => nodes[k].detrended.warning).length;
  const anyRecovering = nodes.zengwen.recovering || nodes.combined.recovering;
  const verdict = {
    label:
      csdNodes >= 2
        ? 'CRITICAL SLOWING DOWN — multiple series flag on detrended residuals'
        : anyRecovering
          ? 'SEASONAL LOW, RECOVERING — no genuine critical-slowing-down signature'
          : 'SEASONAL DRAWDOWN — no critical-slowing-down signature',
    csd: csdNodes >= 2,
    csdNodeCount: csdNodes,
    recovering: anyRecovering,
    spatialRising: spatial.rising,
  };

  return { meta: raw.meta, dates, window, nodes, spatial, verdict };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const generatedAt = new Date().toISOString();

  const cycle = await runDataCycle();
  const { sources, normalized: { state: normState, externalData, meta } } = cycle;

  const monitor = new CatalystMonitor({ dtDays: 1 });
  const monitorReport = monitor.runMonitorCycle(normState, [], externalData);

  const twSim = runRegionSim(buildTaiwanSystem(), {
    tw_shimen_res: { storage_mcm: sources.taiwan.shimen_storage_mcm },
    tw_zengwen_res: { storage_mcm: sources.taiwan.zengwen_storage_mcm },
  });
  const azSim = runRegionSim(buildArizonaSystem(), {
    az_groundwater: { depth_to_water_m: sources.usgs.depth_m },
  });
  const deSim = runRegionSim(buildSaxonySystem());

  const twEWS = computeEWS(twSim, 'tw_shimen_res', 'storage_mcm');
  const azEWS = computeEWS(azSim, 'az_groundwater', 'depth_to_water_m');
  const deEWS = computeEWS(deSim, 'de_elbe_flow', 'flow_mcm_day');

  const sysEWS = systemWarningSummary(
    {
      taiwan: normalise(twEWS.values),
      arizona: normalise(azEWS.values),
      saxony: normalise(deEWS.values),
    },
    { window: 30, tauThreshold: 0.5 }
  );

  const twStress = Math.max(0.001, twSim.state.tw_tainan_fab?.water_stress ?? 0);
  const azStress = Math.max(0.001, azSim.state.az_fab21?.water_stress ?? 0);
  const deStress = Math.max(0.001, deSim.state.de_tsmc_dresden?.water_stress ?? 0);

  const exposure = {
    taiwan: calculateExposureScore('taiwan', twStress),
    arizona: calculateExposureScore('arizona', azStress),
    saxony: calculateExposureScore('germany', deStress),
  };

  // Merged state for catalyst display checks.
  const monitorState = {
    ...twSim.state, ...azSim.state, ...deSim.state,
    tw_shimen_res: { ...twSim.state.tw_shimen_res, storage_mcm: sources.taiwan.shimen_storage_mcm },
    tw_zengwen_res: { ...twSim.state.tw_zengwen_res, storage_mcm: sources.taiwan.zengwen_storage_mcm },
    az_groundwater: { ...azSim.state.az_groundwater, depth_to_water_m: sources.usgs.depth_m },
  };

  const catalysts = CATALYSTS.map((cat) => {
    let r;
    try {
      r = cat.check(monitorState, [], externalData);
    } catch (e) {
      r = { active: false, value: NaN, detail: `check error: ${e.message}`, stressEquivalent: 0 };
    }
    return {
      id: cat.id, severity: cat.severity, active: !!r.active,
      stress: +(r.stressEquivalent ?? 0).toFixed(3), detail: r.detail,
      status: r.active ? 'active' : (r.stressEquivalent > 0.05 ? 'watch' : 'inactive'),
    };
  });

  const scenarios = [0.2, 0.3, 0.4, 0.5, 0.6, 0.75].map((s) => {
    const ex = calculateExposureScore('taiwan', s);
    return {
      stress: s,
      score: +ex.composite.score.toFixed(1),
      effectiveDisruptionPct: +ex.production.effective_disruption_pct.toFixed(2),
      companyB: +ex.company_exposure.total_revenue_at_risk_B.toFixed(1),
      economyB: +ex.composite.total_economy_revenue_at_risk_B.toFixed(1),
      impact: ex.composite.impact_label,
    };
  });

  function ewsBlock(e, nodeVar) {
    return {
      nodeVar, window: e.window,
      initial: +e.initial.toFixed(3), current: +e.current.toFixed(3), delta: +e.delta.toFixed(3),
      warning: e.summary.warning, signals: e.summary.signals,
      indicators: e.summary.indicators,
    };
  }

  function exposureBlock(ex) {
    return {
      stress: +ex.stress_level.toFixed(3),
      score: +ex.composite.score.toFixed(1),
      impact: ex.composite.impact_label,
      effectiveDisruptionPct: +ex.production.effective_disruption_pct.toFixed(2),
      companyB: +ex.company_exposure.total_revenue_at_risk_B.toFixed(1),
      secondOrderB: +ex.second_order.total_revenue_at_risk_B.toFixed(1),
      economyB: +ex.composite.total_economy_revenue_at_risk_B.toFixed(1),
      topCompanies: ex.company_exposure.companies
        .filter((c) => c.revenue_at_risk_B > 0.01)
        .slice(0, 5)
        .map((c) => ({ ticker: c.ticker, company: c.company, atRiskB: +c.revenue_at_risk_B.toFixed(1), impact: c.impact_label })),
    };
  }

  const data = {
    generatedAt,
    date: generatedAt.slice(0, 10),
    dataMode: meta.anyMock ? 'mixed' : 'live',
    mockSources: meta.mockSources,
    staleSources: meta.staleSources,
    sources,
    composite: {
      score: +monitorReport.compositeScore.toFixed(3),
      activeCount: monitorReport.activeCatalysts.length,
      total: CATALYSTS.length,
      components: monitorReport.compositeScoreComponents,
    },
    catalysts,
    regions: {
      taiwan: {
        combinedFill: sources.taiwan.combined_fill_fraction,
        shimen: { storage: sources.taiwan.shimen_storage_mcm, fill: sources.taiwan.shimen_fill_fraction, capacity: 309.1 },
        zengwen: { storage: sources.taiwan.zengwen_storage_mcm, fill: sources.taiwan.zengwen_fill_fraction, capacity: 708.1 },
        fabStress: { hsinchu: twSim.state.tw_hsinchu_fab?.water_stress ?? 0, tainan: twSim.state.tw_tainan_fab?.water_stress ?? 0 },
      },
      arizona: {
        depthM: sources.usgs.depth_m, depthFt: sources.usgs.depth_ft,
        triggerM: 91, crisisM: 122, sites: sources.usgs.sites_count,
        fabStress: azSim.state.az_fab21?.water_stress ?? 0,
      },
      saxony: {
        elbeFlow: deSim.state.de_elbe_flow?.flow_mcm_day ?? 28.5, ecoMin: 8.64,
        fabStress: deSim.state.de_tsmc_dresden?.water_stress ?? 0,
        note: 'TSMC Dresden pre-operational, target 2027–28',
      },
    },
    ews: {
      taiwan: ewsBlock(twEWS, 'tw_shimen_res.storage_mcm'),
      arizona: ewsBlock(azEWS, 'az_groundwater.depth_to_water_m'),
      saxony: ewsBlock(deEWS, 'de_elbe_flow.flow_mcm_day'),
      spatial: sysEWS.spatial,
    },
    exposure: {
      taiwan: exposureBlock(exposure.taiwan),
      arizona: exposureBlock(exposure.arizona),
      saxony: exposureBlock(exposure.saxony),
      // Representative concern scenario (stress 0.60) — used for the company
      // breakdown, since at the current near-zero stress nothing is at risk yet.
      taiwanScenario60: exposureBlock(calculateExposureScore('taiwan', 0.6)),
    },
    scenarios,
    history: analyseHistory(),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
  console.log(`  data mode: ${data.dataMode}  | composite: ${data.composite.score}  | verdict: ${data.history.verdict.label}`);
}

main().catch((e) => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
