'use strict';

/**
 * catalysts.js — Measurable triggers that force markets to reprice semiconductor
 * water risk.
 *
 * Each catalyst is a precisely specified observable: a data source, an exact
 * threshold, and a `check()` function that evaluates the threshold against the
 * simulation state or external data feed.
 *
 * CATALYST ANATOMY
 * ─────────────────
 *  id               Unique slug used as a key throughout the monitor.
 *  type             Category: hydrological | regulatory | financial |
 *                   meteorological | operational
 *  severity         1 (watch) → 5 (crisis). Drives composite score weight.
 *  label            Short human-readable name.
 *  description      What this event represents and why it matters.
 *  dataSource       { primary, secondary, updateFrequency } — exact feeds to watch.
 *  threshold        { description, operator, value } — the crossing condition.
 *  repricingLagDays Estimated days from trigger to full market repricing.
 *  exposureLayer    Which exposure layers activate and at what stress level.
 *  check(state, history, externalData)
 *                   Pure function → { active:bool, value:number, detail:string,
 *                   stressEquivalent:number }.
 *                   `state`        — simulation snapshot: { nodeId: { var: val } }
 *                   `history`      — array of prior snapshots (for duration checks)
 *                   `externalData` — map of live signal overrides (optional)
 *  toStressLevel(value) Maps the raw metric to a 0–1 stress level for exposure
 *                   model input. Allows continuous exposure scaling as the metric
 *                   worsens beyond the trigger threshold.
 */

// ---- shared helpers -------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute how many consecutive history snapshots satisfy a predicate,
 * counting backwards from the most recent.
 */
function consecutiveTailCount(history, predFn) {
  if (!Array.isArray(history) || history.length === 0) return 0;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (predFn(history[i])) count += 1;
    else break;
  }
  return count;
}

// --------------------------------------------------------------------------
// CATALYST DEFINITIONS
// --------------------------------------------------------------------------

const CATALYSTS = [

  // ========================================================================
  // 1. TAIWAN — Combined reservoir below 50% capacity
  // ========================================================================
  {
    id: 'tw_reservoir_combined_50pct',
    type: 'hydrological',
    severity: 3,
    label: 'Taiwan Reservoirs: Combined Fill Below 50%',
    description:
      'The combined storage of Shimen (309 MCM) and Zengwen (708 MCM) ' +
      'reservoirs — the two systems that supply TSMC\'s Hsinchu and Tainan fabs — ' +
      'falls below 50% of combined capacity (508.5 MCM). This threshold ' +
      'historically precedes government water-use restrictions by 30–60 days. ' +
      'In 2021 both fell below 10%, triggering TSMC emergency water procurement ' +
      'costing NTD $11M+ and heightening investor scrutiny of water-supply risk.',
    dataSource: {
      primary: 'Taiwan Water Resources Agency (WRA) daily reservoir statistics — ' +
               'https://www.wra.gov.tw/en/ (English portal; dataset 統計查詢)',
      secondary: 'Reuters, Bloomberg real-time commodity/hydrology feeds; ' +
                 'Taiwan Environmental Protection Administration (EPA)',
      updateFrequency: 'Daily at 06:00 TWD (Taiwan local)',
    },
    threshold: {
      description: 'Combined Shimen + Zengwen storage < 50% of 1,017 MCM combined capacity',
      operator: 'lt',
      value: 0.50,
      absoluteMcm: 508.5,
    },
    repricingLagDays: 45,
    exposureLayer: {
      production: true,
      company: true,
      sector: false,
      region: 'taiwan',
    },
    check(state, history, ext) {
      const shimen = state?.tw_shimen_res?.storage_mcm ?? 280;
      const zengwen = state?.tw_zengwen_res?.storage_mcm ?? 590;
      const combinedFill = (shimen + zengwen) / (309 + 708);
      const active = combinedFill < 0.50;
      return {
        active,
        value: combinedFill,
        detail:
          `Combined fill: ${(combinedFill * 100).toFixed(1)}% ` +
          `(Shimen ${shimen.toFixed(0)} MCM / ${((shimen / 309) * 100).toFixed(1)}%, ` +
          `Zengwen ${zengwen.toFixed(0)} MCM / ${((zengwen / 708) * 100).toFixed(1)}%)`,
        stressEquivalent: this.toStressLevel(combinedFill),
      };
    },
    toStressLevel(fill) {
      // fill=0.50 → stress≈0.15; fill=0.20 → stress≈0.57; fill=0.05 → stress≈0.88
      if (fill >= 0.50) return 0;
      return clamp(0.15 + ((0.50 - fill) / 0.50) * 0.75, 0, 1);
    },
  },

  // ========================================================================
  // 2. TAIWAN — Government declares industrial water rationing
  // ========================================================================
  {
    id: 'tw_industrial_rationing',
    type: 'regulatory',
    severity: 4,
    label: 'Taiwan WRA: Industrial Water Rationing Declared',
    description:
      'Taiwan\'s Water Resources Agency activates Level 2 (industrial users) ' +
      'or higher water restriction orders for the Shimen or Zengwen service ' +
      'areas. Level 2 restrictions require industries to cut water use by 7–11%; ' +
      'Level 3 by 11–20%; Level 4 by 20–40%. TSMC-class operations have water ' +
      'priority agreements but face forced efficiency measures and purchase of ' +
      'recycled/trucked water at 2–5× normal cost.',
    dataSource: {
      primary: 'Taiwan WRA Emergency Water Restriction Notices — ' +
               'https://www.wra.gov.tw/en/ ; TWSE material-information disclosures ' +
               '(TSMC code 2330)',
      secondary: 'Taiwan EPA press releases; DigiTimes, Nikkei Asia (Taiwan fab coverage)',
      updateFrequency: 'Irregular — issued when reservoir fill triggers administrative review',
    },
    threshold: {
      description: 'WRA Level 2+ restriction in force for any supply zone covering TSMC fabs',
      operator: 'flag',
      value: true,
      // Simulation proxy: reservoir below 10% fill = Level 2 would be declared
      simulationProxy: {
        description: 'Any major Taiwan reservoir below 10% fill (Level 2 trigger)',
        nodes: ['tw_shimen_res', 'tw_zengwen_res'],
        variable: 'storage_mcm',
        thresholds: { shimen: 30.9, zengwen: 70.8 }, // 10% of capacity
      },
    },
    repricingLagDays: 7,
    exposureLayer: {
      production: true,
      company: true,
      sector: true,
      region: 'taiwan',
    },
    check(state, history, ext) {
      // Live mode: accept direct flag from external data feed
      if (ext?.tw_industrial_rationing_declared !== undefined) {
        const active = !!ext.tw_industrial_rationing_declared;
        return {
          active,
          value: active ? 1 : 0,
          detail: active
            ? 'WRA industrial rationing active (externally confirmed)'
            : 'No rationing order in effect',
          stressEquivalent: active ? 0.65 : 0,
        };
      }
      // Simulation proxy: Level 2 triggers when any reservoir < 10% fill
      const shimen = state?.tw_shimen_res?.storage_mcm ?? 280;
      const zengwen = state?.tw_zengwen_res?.storage_mcm ?? 590;
      const shimenFill = shimen / 309;
      const zengwenFill = zengwen / 708;
      const active = shimenFill < 0.10 || zengwenFill < 0.10;
      const minFill = Math.min(shimenFill, zengwenFill);
      return {
        active,
        value: minFill,
        detail: active
          ? `Simulation proxy triggered: reservoir fill at ${(minFill * 100).toFixed(1)}% (< 10% Level 2 threshold)`
          : `Below proxy threshold; Shimen ${(shimenFill * 100).toFixed(1)}%, Zengwen ${(zengwenFill * 100).toFixed(1)}%`,
        stressEquivalent: this.toStressLevel(minFill),
      };
    },
    toStressLevel(fill) {
      // At Level 2 trigger (fill=0.10) → stress=0.55; at fill=0.05 → stress=0.78
      if (fill >= 0.10) return 0;
      return clamp(0.55 + ((0.10 - fill) / 0.10) * 0.35, 0, 1);
    },
  },

  // ========================================================================
  // 3. TSMC — Water procurement cost up >40% YoY in quarterly filing
  // ========================================================================
  {
    id: 'tsmc_water_cost_yoy_40pct',
    type: 'financial',
    severity: 3,
    label: 'TSMC Quarterly Filing: Water Cost +40% YoY',
    description:
      'TSMC\'s quarterly earnings or annual CSR report discloses water ' +
      'procurement and treatment costs that are ≥40% above the same period ' +
      'in the prior year. This signals active crisis spending: emergency ' +
      'trucking, desalination contracts, third-party water rights purchases, ' +
      'or forced recycling infrastructure capital expenditure. In 2021 TSMC ' +
      'activated emergency water procurement in Hsinchu and Tainan; the cost ' +
      'delta in subsequent disclosures confirmed the severity of the event.',
    dataSource: {
      primary: 'TSMC Quarterly Earnings Conference Calls (transcript Q&A section); ' +
               'TSMC Annual Sustainability Report (Table: Water Consumption & Cost); ' +
               'TSMC 20-F filed with SEC (Form 20-F, Item 4B — Environmental)',
      secondary: 'Bloomberg TSMC ESG score feed; Sustainalytics water-risk rating updates',
      updateFrequency: 'Quarterly (Jan, Apr, Jul, Oct earnings cycles); Annual report in March',
    },
    threshold: {
      description: 'Water procurement cost in filing ≥ 1.40× same-quarter prior year',
      operator: 'gte',
      value: 1.40, // ratio: current / prior-year-same-quarter
    },
    repricingLagDays: 21,
    exposureLayer: {
      production: true,
      company: true,
      sector: false,
      region: 'taiwan',
    },
    check(state, history, ext) {
      // This is a financial disclosure signal — no direct simulation equivalent.
      // In simulation: proxy via ratio of emergency cost implied by low reservoir fill.
      const yoyRatio = ext?.tsmc_water_cost_yoy_ratio ?? computeWaterCostProxy(state);
      const active = yoyRatio >= 1.40;
      return {
        active,
        value: yoyRatio,
        detail: ext?.tsmc_water_cost_yoy_ratio !== undefined
          ? `TSMC water cost YoY ratio: ${yoyRatio.toFixed(2)}x (from filing)`
          : `Water cost proxy ratio: ${yoyRatio.toFixed(2)}x (simulation estimate)`,
        stressEquivalent: this.toStressLevel(yoyRatio),
      };
    },
    toStressLevel(ratio) {
      // ratio 1.40 → stress 0.35; ratio 2.0 → stress 0.60; ratio 5.0 → stress 0.88
      if (ratio < 1.40) return 0;
      return clamp(0.35 + Math.log(ratio / 1.40) / Math.log(5) * 0.55, 0, 1);
    },
  },

  // ========================================================================
  // 4. ARIZONA — Groundwater adjudication restricts Fab 21 expansion
  // ========================================================================
  {
    id: 'az_fab21_adjudication_ruling',
    type: 'regulatory',
    severity: 3,
    label: 'Arizona: Adjudication Ruling Restricts Fab 21 Water Rights',
    description:
      'The Arizona Department of Water Resources (ADWR), Maricopa County ' +
      'Superior Court, or a federal court issues a ruling, permit denial, or ' +
      'administrative order that specifically limits TSMC Fab 21\'s groundwater ' +
      'allocation, surface water access, or restricts Phase 2 expansion water ' +
      'rights. Arizona water adjudication (the "general stream adjudication") ' +
      'has been pending since 1974; new determinations can reassign senior rights. ' +
      'A ruling against industrial expansion would directly cap Fab 21\'s long-run ' +
      'production capacity at current (Phase 1) levels.',
    dataSource: {
      primary: 'ADWR Water Rights Applications & Proceedings — azwater.gov; ' +
               'Maricopa County Superior Court docket; Federal Register (EPA / DoI); ' +
               'TSMC 20-F SEC filing (Item 3: Legal Proceedings)',
      secondary: 'Arizona Capitol Times (water policy coverage); ' +
                 'E&E News; Bloomberg Law water litigation tracker',
      updateFrequency: 'Irregular — court/agency calendar driven',
    },
    threshold: {
      description: 'Any binding order, permit denial, or injunction limiting Fab 21 water allocation',
      operator: 'flag',
      value: true,
    },
    repricingLagDays: 30,
    exposureLayer: {
      production: true,
      company: true,
      sector: false,
      region: 'arizona',
    },
    check(state, history, ext) {
      if (ext?.az_fab21_adjudication_ruling !== undefined) {
        const active = !!ext.az_fab21_adjudication_ruling;
        return {
          active,
          value: active ? 1 : 0,
          detail: active
            ? 'Adjudication ruling active (externally confirmed)'
            : 'No adjudication ruling in effect',
          stressEquivalent: active ? 0.50 : 0,
        };
      }
      // Simulation proxy: use regulatory restriction_level from az_regulatory node
      const restrictLevel = state?.az_regulatory?.restriction_level ?? 0;
      const active = restrictLevel >= 0.60; // 60% restriction = effective regulatory block
      return {
        active,
        value: restrictLevel,
        detail: `Simulation proxy: az_regulatory restriction_level = ${restrictLevel.toFixed(3)}`,
        stressEquivalent: this.toStressLevel(restrictLevel),
      };
    },
    toStressLevel(value) {
      // value is restriction_level 0-1; at trigger (0.60) → stress=0.40
      return clamp(value * 0.65, 0, 1);
    },
  },

  // ========================================================================
  // 5. SAXONY — Elbe below 4.0 MCM/day for 14 consecutive days
  // ========================================================================
  {
    id: 'de_elbe_flow_critical_14d',
    type: 'hydrological',
    severity: 3,
    label: 'Saxony: Elbe Flow Critical for 14 Consecutive Days',
    description:
      'The Elbe River at Dresden gauge (Augustusbrücke, ID 501060) records ' +
      'discharge below 4.0 MCM/day (46.3 m³/s) for 14 or more consecutive days. ' +
      'This level is below the 2018 summer crisis low (50 m³/s / 4.32 MCM/day) ' +
      'that set all-time records and triggered EU Water Framework Directive ' +
      'emergency protocols. At this sustained level, industrial withdrawals are ' +
      'mandatorily curtailed and water quality concerns (sediment concentration, ' +
      'temperature) compromise ultrapure water production — the prerequisite for ' +
      'semiconductor manufacturing.',
    dataSource: {
      primary: 'LfULG (Sächsisches Landesamt für Umwelt) Dresden gauge real-time: ' +
               'https://www.umwelt.sachsen.de/umwelt/wasser/7748.htm ; ' +
               'Elbe gauge 501060, 15-minute updates',
      secondary: 'German Federal Hydrological Institute (BfG) Elbe monitoring; ' +
                 'European Water Information System (WISE)',
      updateFrequency: '15-minute telemetry; daily aggregated reports',
    },
    threshold: {
      description: 'flow_mcm_day < 4.0 AND consecutiveDays >= 14',
      operator: 'consecutive_below',
      value: 4.0,
      consecutiveDays: 14,
    },
    repricingLagDays: 60,
    exposureLayer: {
      production: false, // ESMC not yet operational as of 2025
      company: false,
      sector: true,     // industrial / automotive sector impacts
      region: 'germany',
    },
    check(state, history, ext) {
      const THRESHOLD = 4.0; // MCM/day
      const CONSECUTIVE_REQUIRED = 14;
      const flow = state?.de_elbe_flow?.flow_mcm_day ?? 28.5;
      const consecutiveDays = consecutiveTailCount(
        history,
        (snap) => (snap.state?.de_elbe_flow?.flow_mcm_day ?? 28.5) < THRESHOLD
      );
      const active = flow < THRESHOLD && consecutiveDays >= CONSECUTIVE_REQUIRED;
      return {
        active,
        value: flow,
        detail:
          `Elbe flow: ${flow.toFixed(2)} MCM/day (${(flow / 0.0864).toFixed(0)} m³/s); ` +
          `consecutive days below 4.0 MCM/day: ${consecutiveDays}/${CONSECUTIVE_REQUIRED}`,
        stressEquivalent: this.toStressLevel(flow),
      };
    },
    toStressLevel(flow) {
      // flow=4.0 → stress=0.75 (crisis level); flow=8.64 (eco min) → stress=0.40
      if (flow >= 28.5) return 0;
      if (flow >= 8.64)
        return clamp(0.40 * (1 - (flow - 8.64) / (28.5 - 8.64)), 0, 1);
      return clamp(0.40 + (8.64 - flow) / 8.64 * 0.55, 0, 1);
    },
  },

  // ========================================================================
  // 6. METEOROLOGICAL — La Niña declared + Taiwan drought probability >70%
  // ========================================================================
  {
    id: 'la_nina_tw_drought_70pct',
    type: 'meteorological',
    severity: 2,
    label: 'ENSO: La Niña + Taiwan Drought Probability >70%',
    description:
      'NOAA\'s Climate Prediction Center (CPC) issues an official La Niña ' +
      'Advisory AND the IRI/CPC seasonal precipitation outlook assigns ≥70% ' +
      'probability of below-normal precipitation over Taiwan for the next ' +
      '3-month period. This is a forward-looking early warning: La Niña ' +
      'suppresses North Pacific typhoon tracks, reducing Taiwan\'s primary ' +
      'reservoir recharge mechanism. The 2020–2021 Taiwan mega-drought was ' +
      'associated with La Niña conditions; the combination of a NOAA La Niña ' +
      'Advisory with a 70%+ drought probability is the earliest-possible ' +
      'quantitative signal that a 2021-type event is developing.',
    dataSource: {
      primary: 'NOAA CPC ENSO Advisory: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ ; ' +
               'IRI ENSO Forecast: https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/',
      secondary: 'Japan Meteorological Agency (JMA) ENSO monitoring; ' +
                 'Taiwan Central Weather Bureau seasonal outlook',
      updateFrequency: 'Monthly (NOAA CPC); Biweekly probabilistic update (IRI)',
    },
    threshold: {
      description: 'NOAA La Niña Advisory active AND CPC/IRI Taiwan drought probability ≥ 0.70',
      operator: 'compound_flag',
      conditions: [
        { field: 'la_nina_advisory_active', operator: 'eq', value: true },
        { field: 'tw_drought_probability_3m', operator: 'gte', value: 0.70 },
      ],
    },
    repricingLagDays: 90,
    exposureLayer: {
      production: true,
      company: true,
      sector: false,
      region: 'taiwan',
    },
    check(state, history, ext) {
      const laNinaActive = ext?.la_nina_advisory_active ?? false;
      const droughtProb = ext?.tw_drought_probability_3m ?? 0.0;
      // Simulation proxy: rainfall anomaly already negative for 60+ consecutive ticks
      // suggests La Niña-equivalent forcing is active
      let simulationProxy = false;
      if (!ext?.la_nina_advisory_active) {
        const negativeAnomalyCount = consecutiveTailCount(
          history,
          (snap) => (snap.state?.tw_rainfall_north?.anomaly ?? 0) < -0.40
        );
        simulationProxy = negativeAnomalyCount >= 60;
      }
      const active = (laNinaActive && droughtProb >= 0.70) || simulationProxy;
      const proxyDays = simulationProxy
        ? consecutiveTailCount(history, (s) => (s.state?.tw_rainfall_north?.anomaly ?? 0) < -0.40)
        : 0;
      return {
        active,
        value: droughtProb > 0 ? droughtProb : (simulationProxy ? 0.75 : 0),
        detail: ext?.la_nina_advisory_active !== undefined
          ? `La Niña advisory: ${laNinaActive}; Taiwan drought probability: ${(droughtProb * 100).toFixed(0)}%`
          : `Simulation proxy: ${proxyDays} consecutive ticks of rainfall anomaly < -0.40`,
        stressEquivalent: this.toStressLevel(droughtProb > 0 ? droughtProb : (simulationProxy ? 0.75 : 0)),
      };
    },
    toStressLevel(prob) {
      // prob=0.70 → stress=0.20 (forward risk); prob=0.95 → stress=0.38 (high confidence)
      if (prob < 0.70) return 0;
      return clamp(0.20 + ((prob - 0.70) / 0.30) * 0.25, 0, 0.45);
    },
  },

  // ========================================================================
  // 7. TAIWAN — Any single reservoir below 20%
  // ========================================================================
  {
    id: 'tw_single_reservoir_20pct',
    type: 'hydrological',
    severity: 4,
    label: 'Taiwan: Single Reservoir Below 20% Capacity',
    description:
      'Either Shimen (<61.8 MCM) or Zengwen (<141.6 MCM) falls below 20% of ' +
      'its individual design capacity. At this level the affected fab cluster ' +
      'faces imminent supply shortfall: ultrapure water production needs a ' +
      'continuous feed that trucking and recycling alone cannot substitute. ' +
      'The 2021 event saw both reservoirs reach <10%; the 20% crossing is the ' +
      'last point at which demand-side interventions (voluntary water reductions, ' +
      'recycling surge) can plausibly prevent production cuts.',
    dataSource: {
      primary: 'Taiwan WRA daily reservoir statistics (same as catalyst #1)',
      secondary: 'TSMC TWSE material disclosures (TWSE code 2330)',
      updateFrequency: 'Daily',
    },
    threshold: {
      description: 'Shimen storage < 61.8 MCM (20% of 309) OR Zengwen storage < 141.6 MCM (20% of 708)',
      operator: 'any_below',
      conditions: [
        { node: 'tw_shimen_res', variable: 'storage_mcm', value: 61.8 },
        { node: 'tw_zengwen_res', variable: 'storage_mcm', value: 141.6 },
      ],
    },
    repricingLagDays: 14,
    exposureLayer: {
      production: true,
      company: true,
      sector: true,
      region: 'taiwan',
    },
    check(state, history, ext) {
      const shimen = state?.tw_shimen_res?.storage_mcm ?? 280;
      const zengwen = state?.tw_zengwen_res?.storage_mcm ?? 590;
      const shimenFill = shimen / 309;
      const zengwenFill = zengwen / 708;
      const shimenTriggered = shimen < 61.8;
      const zengwenTriggered = zengwen < 141.6;
      const active = shimenTriggered || zengwenTriggered;
      const minFill = Math.min(shimenFill, zengwenFill);
      const which = [
        shimenTriggered ? `Shimen ${(shimenFill * 100).toFixed(1)}%` : null,
        zengwenTriggered ? `Zengwen ${(zengwenFill * 100).toFixed(1)}%` : null,
      ].filter(Boolean);
      return {
        active,
        value: minFill,
        detail: active
          ? `Critical individual fill: ${which.join(', ')} below 20%`
          : `Shimen ${(shimenFill * 100).toFixed(1)}%, Zengwen ${(zengwenFill * 100).toFixed(1)}% — both above 20%`,
        stressEquivalent: this.toStressLevel(minFill),
      };
    },
    toStressLevel(fill) {
      // fill=0.20 → stress=0.55; fill=0.10 → stress=0.72; fill=0 → stress=0.90
      if (fill >= 0.20) return 0;
      return clamp(0.55 + (0.20 - fill) / 0.20 * 0.35, 0, 1);
    },
  },

  // ========================================================================
  // 8. ARIZONA — Colorado River Tier 3 shortage declared
  // ========================================================================
  {
    id: 'az_colorado_tier3_shortage',
    type: 'regulatory',
    severity: 3,
    label: 'Arizona: Colorado River Tier 3 Shortage Declared',
    description:
      'The US Bureau of Reclamation announces a Tier 3 shortage on the Colorado ' +
      'River, triggering a 36%+ cut in Central Arizona Project (CAP) deliveries. ' +
      'Arizona is last in priority among Lower Basin states (junior rights holder); ' +
      'a Tier 3 ruling cuts its total CAP allocation from 1.415 MAF to roughly ' +
      '0.905 MAF/year — eliminating ~36% of industrial surface water supply to ' +
      'the Phoenix metro. Tier 2 was declared in 2023; Tier 3 requires Lake Mead ' +
      'elevation below 1,025 ft (312.4m), a level within reach under the current ' +
      'depletion trajectory.',
    dataSource: {
      primary: 'US Bureau of Reclamation Operations: https://www.usbr.gov/lc/region/g4000/riverops/webreports.html ; ' +
               'Federal Register shortage notifications; ADWR Annual Report',
      secondary: 'Arizona Water Banking Authority; Salt River Project annual report',
      updateFrequency: 'Annual (August 1 determination); informal guidance monthly',
    },
    threshold: {
      description: 'USBR announces Tier 3 shortage — CAP allocation cut ≥ 36%',
      operator: 'flag',
      value: true,
    },
    repricingLagDays: 45,
    exposureLayer: {
      production: true,
      company: true,
      sector: false,
      region: 'arizona',
    },
    check(state, history, ext) {
      if (ext?.az_colorado_tier3_active !== undefined) {
        const active = !!ext.az_colorado_tier3_active;
        return {
          active,
          value: active ? 1 : 0,
          detail: active ? 'USBR Tier 3 shortage declared (externally confirmed)' : 'No Tier 3 shortage',
          stressEquivalent: active ? 0.45 : 0,
        };
      }
      // Simulation proxy: curtailment_factor on az_surface_water below 0.64 (Tier 3 level)
      const curtailment = state?.az_surface_water?.curtailment_factor ?? 0.79;
      const active = curtailment < 0.64;
      return {
        active,
        value: curtailment,
        detail: `Surface water curtailment factor: ${(curtailment * 100).toFixed(1)}% (Tier 3 threshold: 64%)`,
        stressEquivalent: this.toStressLevel(curtailment),
      };
    },
    toStressLevel(curtailment) {
      if (curtailment >= 0.64) return 0;
      return clamp(0.45 + (0.64 - curtailment) / 0.64 * 0.35, 0, 1);
    },
  },

  // ========================================================================
  // 9. ARIZONA — AMA groundwater depth exceeds regulatory trigger
  // ========================================================================
  {
    id: 'az_ama_depth_trigger',
    type: 'regulatory',
    severity: 2,
    label: 'Arizona: Phoenix AMA Groundwater Depth Exceeds 300ft (91m)',
    description:
      'The Phoenix Active Management Area average depth-to-water table exceeds ' +
      '91 meters (300 feet), triggering the 100-year safe-yield compliance review ' +
      'under the Arizona Groundwater Management Act. At this depth, ADWR is ' +
      'authorized to issue stricter pumping restrictions and new permit moratoriums. ' +
      'The ADWR 2022 AMA Status Report showed central Phoenix-area monitoring ' +
      'wells at 55–90m depth; the trigger zone is approaching on the current ' +
      'depletion trajectory (0.7–1.5 m/year).',
    dataSource: {
      primary: 'ADWR Groundwater Site Analysis System (GWSI) — https://gisweb.azwater.gov/waterresourcedata/GWSI.aspx ; ' +
               'USGS NWIS groundwater levels: https://waterdata.usgs.gov/az/nwis/gw',
      secondary: 'ADWR Annual AMA Status Report; Arizona Water Facts (DWR publication)',
      updateFrequency: 'Monthly ADWR monitoring; USGS real-time at major wells',
    },
    threshold: {
      description: 'Phoenix AMA average depth-to-water > 91m (300 ft)',
      operator: 'gt',
      value: 91,
    },
    repricingLagDays: 60,
    exposureLayer: {
      production: true,
      company: false,
      sector: false,
      region: 'arizona',
    },
    check(state, history, ext) {
      const depth = ext?.az_ama_depth_m ?? state?.az_groundwater?.depth_to_water_m ?? 76;
      const active = depth > 91;
      return {
        active,
        value: depth,
        detail:
          `Phoenix AMA depth: ${depth.toFixed(1)}m (${(depth * 3.281).toFixed(0)}ft) ` +
          `— trigger at 91m (300ft), crisis at 122m (400ft)`,
        stressEquivalent: this.toStressLevel(depth),
      };
    },
    toStressLevel(depth) {
      // depth=91 → stress=0.25; depth=106 → stress=0.50; depth=122+ → stress=0.80
      if (depth <= 91) return 0;
      return clamp(0.25 + (depth - 91) / (122 - 91) * 0.55, 0, 1);
    },
  },

  // ========================================================================
  // 10. TAIWAN — TSMC confirms production schedule adjustment (highest severity)
  // ========================================================================
  {
    id: 'tw_tsmc_production_adjustment',
    type: 'operational',
    severity: 5,
    label: 'TSMC: Management Confirms Water-Driven Production Adjustment',
    description:
      'TSMC management — on an earnings call, in a TWSE material disclosure, ' +
      'or in an SEC 20-F filing — specifically cites water supply constraints ' +
      'as a factor affecting production schedules or capacity utilization guidance. ' +
      'This is the most direct and highest-confidence signal available: it means ' +
      'emergency measures have been exhausted or deemed insufficient and customers ' +
      'are being notified of delivery impacts. Historically unprecedented — TSMC ' +
      'has never made such a disclosure — which is why its occurrence would ' +
      'represent a category-defining market repricing event.',
    dataSource: {
      primary: 'TSMC Earnings Conference Call transcripts (Bloomberg/Refinitiv terminal); ' +
               'TWSE material information system (code 2330, e-disclosure); ' +
               'SEC EDGAR 20-F annual report and 6-K interim disclosures',
      secondary: 'Sell-side analyst flash notes (Morgan Stanley, Goldman, HSBC semi team); ' +
                 'DigiTimes, Nikkei Asia breaking news',
      updateFrequency: 'Quarterly earnings; material disclosures within 24h of decision',
    },
    threshold: {
      description: 'Any TSMC official statement linking water supply to production guidance change',
      operator: 'flag',
      value: true,
    },
    repricingLagDays: 3,
    exposureLayer: {
      production: true,
      company: true,
      sector: true,
      region: 'taiwan',
    },
    check(state, history, ext) {
      if (ext?.tsmc_production_adjustment_confirmed !== undefined) {
        const active = !!ext.tsmc_production_adjustment_confirmed;
        return {
          active,
          value: active ? 1 : 0,
          detail: active
            ? 'CONFIRMED: TSMC management cited water constraints in production guidance'
            : 'No TSMC production adjustment disclosure',
          stressEquivalent: active ? 0.90 : 0,
        };
      }
      // Simulation proxy: Hsinchu or Tainan fab utilization has fallen by ≥ 5% from cap
      const hsinchu = state?.tw_hsinchu_fab;
      const tainan = state?.tw_tainan_fab;
      const hsinUtilDrop = hsinchu
        ? (hsinchu.utilization_cap - hsinchu.utilization) / hsinchu.utilization_cap
        : 0;
      const tainanUtilDrop = tainan
        ? (tainan.utilization_cap - tainan.utilization) / tainan.utilization_cap
        : 0;
      const maxDrop = Math.max(hsinUtilDrop, tainanUtilDrop);
      const active = maxDrop >= 0.05;
      return {
        active,
        value: maxDrop,
        detail: `Simulation proxy: max utilization drop from cap = ${(maxDrop * 100).toFixed(2)}% (threshold: 5%)`,
        stressEquivalent: this.toStressLevel(maxDrop),
      };
    },
    toStressLevel(value) {
      // value is either 1 (confirmed flag) or utilization drop fraction
      if (value === 1) return 0.90;
      if (value < 0.05) return 0;  // below trigger threshold — no stress signal
      // drop 5% → stress 0.70; drop 25%+ → stress approaches 1.0
      return clamp(0.70 + (value - 0.05) * 1.5, 0, 1);
    },
  },
];

// =============================================================================
// Index and lookup helpers
// =============================================================================

const CATALYST_BY_ID = Object.fromEntries(CATALYSTS.map((c) => [c.id, c]));

/**
 * Returns the catalysts that apply to a specific region.
 * Taiwan catalysts also apply to 'global'.
 */
function catalystsForRegion(region) {
  const regionMap = {
    taiwan: ['tw_', 'la_nina', 'tsmc_'],
    arizona: ['az_'],
    germany: ['de_'],
    saxony: ['de_'],
    global: CATALYSTS.map((c) => c.id),
  };
  if (region === 'global') return CATALYSTS;
  const prefixes = regionMap[region] ?? [];
  return CATALYSTS.filter((c) => prefixes.some((p) => c.id.startsWith(p)));
}

/** Maximum possible composite score if all catalysts are active at full duration. */
const MAX_COMPOSITE_WEIGHT = CATALYSTS.reduce(
  (acc, c) => acc + Math.pow(c.severity, 1.5),
  0
);

// =============================================================================
// Simulation proxy helper: estimate water cost ratio from reservoir levels
// =============================================================================

function computeWaterCostProxy(state) {
  // Emergency water procurement cost scales non-linearly with fill deficit.
  // Baseline: fill ~80% → ratio 1.0 (no emergency cost).
  // At fill 20%: trucking costs 2–3× normal (ratio ~1.5–2.5).
  // At fill 5%: emergency desalination + trucking → ratio 4–6×.
  const shimen = state?.tw_shimen_res?.storage_mcm ?? 280;
  const zengwen = state?.tw_zengwen_res?.storage_mcm ?? 590;
  const combinedFill = (shimen + zengwen) / 1017;
  if (combinedFill >= 0.60) return 1.0;
  if (combinedFill <= 0.05) return 5.5;
  // Exponential cost increase below 60% fill
  const deficit = 0.60 - combinedFill;
  return 1.0 + Math.pow(deficit / 0.55, 1.8) * 4.5;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  CATALYSTS,
  CATALYST_BY_ID,
  catalystsForRegion,
  MAX_COMPOSITE_WEIGHT,
  // exported for testing
  _helpers: { consecutiveTailCount, computeWaterCostProxy, clamp },
};
