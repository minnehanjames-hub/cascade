'use strict';

/**
 * system.js — Three real-world water-semiconductor systems as Cascade graphs.
 *
 * Each system represents the hydrological supply chain for TSMC fabs in a
 * distinct water regime: monsoon-dependent reservoirs in Taiwan, over-allocated
 * desert aquifers in Arizona, and a rain-shadow river basin in Germany. The
 * three are linked by cross-regional information edges to form a unified global
 * supply-risk graph for early warning analysis.
 *
 * UNITS: all volumes in MCM (million cubic meters), flow rates in MCM/day,
 *        depths in meters. 1 m³/s = 0.0864 MCM/day.
 *
 * DATA SOURCES (values traceable to these):
 *   - Taiwan Water Resources Agency (WRA) reservoir statistics (2015-2023)
 *   - TSMC ESG/Sustainability Reports 2021, 2022, 2023
 *   - USGS + AZ Dept of Water Resources groundwater monitoring (Phoenix AMA)
 *   - Salt River Project annual reports 2022-2023
 *   - Sächsisches Landesamt für Umwelt, Landwirtschaft und Geologie (LfULG)
 *     Elbe discharge records at gauge Dresden (Augustusbrücke), 2000-2023
 *   - European Semiconductor Manufacturing Company (ESMC) planning documents 2023
 */

const { System } = require('../../engine/graph');

// =============================================================================
// Historical crisis thresholds — stress parameters for stressor injection
// =============================================================================

const STRESS_PARAMS = {
  taiwan: {
    // 2021 Taiwan drought: worst in 56 years. Shimen hit 15 MCM (4.9%),
    // Zengwen hit 30 MCM (4.2%). TSMC paid NTD $11M to truck in water.
    shimen_crisis_mcm: 15,
    shimen_restriction_pct: 0.10,   // Level 2 rationing triggers at ~10%
    zengwen_crisis_mcm: 30,
    zengwen_restriction_pct: 0.10,
    // Rainfall anomaly during 2020-2021 deficit: no typhoon season in 2020
    drought_anomaly: -0.82,          // 82% deficit from seasonal normal
    // TSMC 2021: maintained ~95%+ utilization through emergency measures;
    // a repeat with 50% longer duration would likely trigger ~40% cuts.
    severe_drought_anomaly: -0.95,
    fab_stress_threshold: 0.30,      // utilization begins falling above this stress
    fab_crisis_threshold: 0.60,      // production curtailment above this stress
  },
  arizona: {
    // Colorado River Tier 2 shortage declared 2023: CAP allocation cut 21%
    // Phoenix AMA: groundwater depth increasing ~0.3-1.5 m/year by zone
    // Regulatory trigger: Arizona GMA Act Section 45-576 (100-year safe yield)
    surface_curtailment_tier1_pct: 0.08,  // 8% CAP cut at Tier 1 shortage
    surface_curtailment_tier2_pct: 0.21,  // 21% at Tier 2 (2023 actual)
    surface_curtailment_tier3_pct: 0.36,  // 36% at Tier 3 (not yet reached)
    gw_regulation_trigger_m: 91,           // 300 ft depth → AMA curtailment
    gw_crisis_m: 122,                      // 400 ft → emergency restrictions
    agriculture_priority_factor: 0.70,     // ag gets 70% of surface water historically
    // Fab 21 Phase 1 came online Dec 2024; Phase 2 (2nm) ~2027
    fab21_phase1_demand_mcm_day: 0.006,
    fab21_phase2_demand_mcm_day: 0.019,
  },
  saxony: {
    // 2018-2019 Elbe drought: record low at Dresden gauge
    // Mean annual flow 330 m³/s (28.5 MCM/day); 2018 summer low ~50 m³/s (4.3 MCM/day)
    // EU WFD ecological flow minimum: 100 m³/s (8.64 MCM/day) at Dresden
    elbe_ecological_min_mcm_day: 8.64,    // 100 m³/s
    elbe_navigation_min_mcm_day: 13.8,    // 160 m³/s (commercial navigation threshold)
    elbe_crisis_mcm_day: 4.32,            // 50 m³/s — 2018 actual summer low
    drought_pdsi_threshold: -2.0,         // Moderate drought; 2018 hit -4.5
    drought_pdsi_crisis: -4.0,            // Extreme drought
    // TSMC Dresden (ESMC): 300mm fab, EUV-capable, production target 2027-2028
    // Estimated water use from comparable 300mm fabs (GlobalFoundries Malta: ~1.9 MGD)
    tsmc_dresden_planned_demand_mcm_day: 0.020,
    snowpack_crisis_swe_mm: 15,           // Below this, Erzgebirge melt pulse absent
    snowpack_normal_swe_mm: 85,           // Mean March SWE in Erzgebirge
  },
};

// =============================================================================
// Shared transfer function helpers
// =============================================================================

/**
 * Sigmoid supply ratio: smooth mapping from reservoir fill fraction to a
 * [0,1] supply adequacy signal. Centered on `midpoint` fraction (the level
 * at which stress begins), with steepness `k`.
 *
 * At fill = midpoint:  ratio = 0.50
 * At fill = midpoint + 2/k: ratio ≈ 0.88
 * At fill = midpoint - 2/k: ratio ≈ 0.12
 */
function sigmoidSupplyRatio(fill, midpoint = 0.10, k = 28) {
  return 1 / (1 + Math.exp(-k * (fill - midpoint)));
}

/**
 * Rationing factor: linear reduction of withdrawal once a reservoir or river
 * drops below the `threshold` fraction (or absolute level). Returns 1.0 above
 * threshold, falls to `floor` at zero.
 */
function rationFactor(level, threshold, floor = 0.05) {
  if (level >= threshold) return 1.0;
  if (threshold <= 0) return floor;
  return floor + (1 - floor) * (level / threshold);
}

// =============================================================================
// 1. TAIWAN — Monsoon-reservoir system, Shimen (north) and Zengwen (south)
// =============================================================================

/**
 * Builds the Taiwan hydrological-semiconductor system.
 *
 * Two semi-independent sub-systems share a recycle infrastructure:
 *   - North: Shimen Reservoir → Hsinchu Science Park (TSMC Fab 2/3/5/6/8/12/15)
 *   - South: Zengwen Reservoir → Southern Taiwan Science Park (Fab 14/18 — EUV)
 *
 * Rainfall is modeled as a forcing node with an `anomaly` state: 0 = long-run
 * normal (Hsinchu ~2,800mm/yr, Tainan ~1,800mm/yr), -1 = total precipitation
 * failure (2020-2021 scenario). Daily base recharge accounts for the 80/20
 * split between typhoon-season and dry-season inflows.
 */
function buildTaiwanSystem() {
  return System.build({
    name: 'taiwan-hydro-semi',
    nodes: [
      // --- Reservoirs ---------------------------------------------------
      {
        id: 'tw_shimen_res',
        type: 'reservoir',
        state: {
          storage_mcm: 280,    // Normal fill Dec 2019 (pre-drought baseline)
          capacity_mcm: 309,   // WRA design capacity; 309.12 MCM usable
        },
        output: 'storage_mcm',
        dynamics(state, inputs, ctx) {
          let net = 0;
          for (const inp of inputs) {
            if (inp.type === 'flow') net += inp.value;
            if (inp.type === 'predation') net -= inp.value;
          }
          // Evaporation: ~0.12% of storage per day (surface area ~800 ha,
          // E≈5mm/day mean; more aggressive in drought but approximated flat)
          net -= 0.0012 * state.storage_mcm;
          // Hard floor: reservoir cannot go negative
          if (state.storage_mcm + net < 0) net = -state.storage_mcm;
          return { storage_mcm: net };
        },
        meta: { units: 'MCM', source: 'Taiwan WRA', lat: 24.797, lon: 121.230 },
      },
      {
        id: 'tw_zengwen_res',
        type: 'reservoir',
        state: {
          storage_mcm: 590,    // Normal fill; 590/708 ≈ 83% (WRA 2019 baseline)
          capacity_mcm: 708,   // 708.14 MCM — largest reservoir in Taiwan
        },
        output: 'storage_mcm',
        dynamics(state, inputs, ctx) {
          let net = 0;
          for (const inp of inputs) {
            if (inp.type === 'flow') net += inp.value;
            if (inp.type === 'predation') net -= inp.value;
          }
          net -= 0.0012 * state.storage_mcm;
          if (state.storage_mcm + net < 0) net = -state.storage_mcm;
          return { storage_mcm: net };
        },
        meta: { units: 'MCM', source: 'Taiwan WRA', lat: 23.267, lon: 120.480 },
      },

      // --- Rainfall forcing -------------------------------------------
      {
        id: 'tw_rainfall_north',
        type: 'forcing',
        state: {
          // anomaly ∈ [-1, +2]: -1 = near-total failure; 0 = normal; +1 = typhoon surplus
          anomaly: 0.0,
        },
        output: 'anomaly',
        dynamics: undefined, // driven externally by stressor injection
        meta: {
          normal_annual_mm: 2800,
          basin: 'Danshui / Shimen',
          note: 'Anomaly represents fractional deviation from 2800mm annual normal',
        },
      },
      {
        id: 'tw_rainfall_south',
        type: 'forcing',
        state: { anomaly: 0.0 },
        output: 'anomaly',
        dynamics: undefined,
        meta: {
          normal_annual_mm: 1800,
          basin: 'Tsengwen',
          note: 'Southern Taiwan: 80% of rainfall June–Oct (typhoon season)',
        },
      },

      // --- Fab nodes ---------------------------------------------------
      {
        id: 'tw_hsinchu_fab',
        type: 'fab',
        state: {
          utilization: 0.92,           // Capacity utilization (fraction)
          utilization_cap: 0.92,       // Maximum attainable without stress
          water_stress: 0.0,           // 0=none, 1=critical
          // TSMC 2022 ESG: 156,000 tonnes/day total fab water use
          // Hsinchu share: older nodes (180nm–5nm), ~40% of total volume
          demand_mcm_day: 0.078,       // 78,000 m³/day = 0.078 MCM/day gross
          recycle_rate: 0.86,          // From TSMC 2022 Sustainability Report
        },
        output: 'utilization',
        dynamics(state, inputs, ctx) {
          // Supply ratio arrives via dependency edge from Shimen reservoir
          const supply_input = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'tw_shimen_res'
          );
          const supply_ratio = Math.max(0, Math.min(1, supply_input?.value ?? 1.0));

          // Stress target: 0 when fully supplied, rises sharply below supply_ratio 0.5
          // TSMC managed ~100% util through crisis via trucking — stress is real cost,
          // not immediate production cut; production falls only above stress 0.30.
          const target_stress = supply_ratio >= 0.5
            ? Math.max(0, 1 - supply_ratio) * 0.6   // mild stress in partial shortage
            : 1.0 - supply_ratio * 1.2;               // rapid stress acceleration below 50%

          // Stress adjusts with ~7 day time constant (operational response lag)
          const d_stress = (Math.max(0, Math.min(1, target_stress)) - state.water_stress) / 7;

          // Utilization falls quadratically above the crisis stress threshold
          const excess_stress = Math.max(
            0,
            state.water_stress - STRESS_PARAMS.taiwan.fab_stress_threshold
          );
          const range = 1 - STRESS_PARAMS.taiwan.fab_stress_threshold;
          const util_penalty = excess_stress > 0
            ? (excess_stress / range) ** 1.8 * 0.58   // max 58% utilization hit at full crisis
            : 0;
          const target_util = state.utilization_cap * (1 - util_penalty);
          const d_util = (target_util - state.utilization) / 14;

          return { water_stress: d_stress, utilization: d_util };
        },
        meta: {
          location: 'Hsinchu Science Park, Taiwan',
          nodes: 'N180, N90, N28, N16, N7, N5',
          source: 'TSMC 2022 ESG Report Table 8-1',
        },
      },
      {
        id: 'tw_tainan_fab',
        type: 'fab',
        state: {
          utilization: 0.95,
          utilization_cap: 0.95,
          water_stress: 0.0,
          // Tainan share: Fab 14 (28/20nm) + Fab 18 (7/5/3nm EUV) ≈ 60% of total
          demand_mcm_day: 0.118,   // 118,000 m³/day
          recycle_rate: 0.86,
        },
        output: 'utilization',
        dynamics(state, inputs, ctx) {
          const supply_input = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'tw_zengwen_res'
          );
          const supply_ratio = Math.max(0, Math.min(1, supply_input?.value ?? 1.0));

          const target_stress = supply_ratio >= 0.5
            ? Math.max(0, 1 - supply_ratio) * 0.6
            : 1.0 - supply_ratio * 1.2;

          const d_stress = (Math.max(0, Math.min(1, target_stress)) - state.water_stress) / 7;

          const excess_stress = Math.max(
            0,
            state.water_stress - STRESS_PARAMS.taiwan.fab_stress_threshold
          );
          const range = 1 - STRESS_PARAMS.taiwan.fab_stress_threshold;
          const util_penalty = excess_stress > 0
            ? (excess_stress / range) ** 1.8 * 0.58
            : 0;
          const target_util = state.utilization_cap * (1 - util_penalty);
          const d_util = (target_util - state.utilization) / 14;

          return { water_stress: d_stress, utilization: d_util };
        },
        meta: {
          location: 'Southern Taiwan Science Park (STSP), Tainan',
          nodes: 'N28, N20, N7, N5, N3 (EUV)',
          criticality: 'Fab 18 is sole volume producer of N3 globally',
          source: 'TSMC 2022 ESG Report; STSP annual report 2022',
        },
      },

      // --- Municipal demand -------------------------------------------
      {
        id: 'tw_municipal_north',
        type: 'municipal',
        state: {
          // Hsinchu City + Taoyuan City combined; WRA priority: municipal > industrial
          demand_mcm_day: 0.65,   // ~2.8M residents at 232 L/person/day
          priority: 1.0,
        },
        output: 'demand_mcm_day',
        dynamics: undefined, // treated as fixed demand; user injects population growth
        meta: { population_M: 2.8, priority_rank: 1 },
      },

      // --- Water recycling system -------------------------------------
      {
        id: 'tw_recycle_sys',
        type: 'recycling',
        state: {
          efficiency: 0.86,           // TSMC 2022: 86.3% water recycling rate
          // throughput dynamically tracks actual fab inputs (set to baseline here)
          throughput_mcm_day: 0.169,  // 0.86 * (0.078 + 0.118) = 0.169 MCM/day
        },
        output: 'throughput_mcm_day',
        dynamics(state, inputs, ctx) {
          // Incoming fab flows represent water sent for treatment
          const incoming = inputs
            .filter((i) => i.type === 'flow')
            .reduce((a, i) => a + i.value, 0);
          // Throughput adjusts to efficiency × input with a 2-day treatment lag
          const target = state.efficiency * incoming;
          return { throughput_mcm_day: (target - state.throughput_mcm_day) / 2 };
        },
        meta: { source: 'TSMC 2022 Sustainability Report p.72' },
      },
    ],

    edges: [
      // --- Rainfall → reservoirs (recharge flows) ---------------------
      {
        id: 'tw_rain_north_shimen',
        source: 'tw_rainfall_north',
        target: 'tw_shimen_res',
        type: 'flow',
        // Base recharge: 347mm/yr non-typhoon + 2453mm/yr typhoon-season
        // Daily mean: 2800mm × 808km² catchment / 365 = ~6.2 MCM/day; but
        // outflows (to sea, evapotranspiration) leave ~0.95 MCM/day net usable
        weight: 0.95,
        transfer(rainState, resState, w) {
          // anomaly scales recharge; floor at 5% to model baseflow even in drought
          return w * Math.max(0.05, 1 + rainState.anomaly * 0.80);
        },
      },
      {
        id: 'tw_rain_south_zengwen',
        source: 'tw_rainfall_south',
        target: 'tw_zengwen_res',
        type: 'flow',
        // Zengwen catchment: 1,177 km², 1,800mm/yr; net usable ~1.50 MCM/day
        weight: 1.50,
        transfer(rainState, resState, w) {
          return w * Math.max(0.05, 1 + rainState.anomaly * 0.80);
        },
      },

      // --- Reservoirs → fabs (supply dependency) ----------------------
      {
        id: 'tw_shimen_to_hsinchu',
        source: 'tw_shimen_res',
        target: 'tw_hsinchu_fab',
        type: 'dependency',
        weight: 1.0,
        transfer(resState, fabState, w) {
          // Sigmoid supply ratio centered on 10% fill (WRA Level 2 trigger)
          const fill = resState.storage_mcm / resState.capacity_mcm;
          return w * sigmoidSupplyRatio(fill, 0.10, 28);
        },
      },
      {
        id: 'tw_zengwen_to_tainan',
        source: 'tw_zengwen_res',
        target: 'tw_tainan_fab',
        type: 'dependency',
        weight: 1.0,
        transfer(resState, fabState, w) {
          const fill = resState.storage_mcm / resState.capacity_mcm;
          return w * sigmoidSupplyRatio(fill, 0.10, 28);
        },
      },

      // --- Fabs → reservoirs (gross withdrawal via predation) ---------
      // Transfer = gross demand × ration factor. Net after recycling is
      // accounted for separately via the recycle-return flow edges below.
      {
        id: 'tw_hsinchu_withdraws_shimen',
        source: 'tw_hsinchu_fab',
        target: 'tw_shimen_res',
        type: 'predation',
        weight: 1.0,
        transfer(fabState, resState, w) {
          const fill = resState.storage_mcm / resState.capacity_mcm;
          const ration = rationFactor(fill, STRESS_PARAMS.taiwan.shimen_restriction_pct);
          // Gross withdrawal includes recycled portion (which is returned later)
          return w * fabState.demand_mcm_day * ration;
        },
      },
      {
        id: 'tw_tainan_withdraws_zengwen',
        source: 'tw_tainan_fab',
        target: 'tw_zengwen_res',
        type: 'predation',
        weight: 1.0,
        transfer(fabState, resState, w) {
          const fill = resState.storage_mcm / resState.capacity_mcm;
          const ration = rationFactor(fill, STRESS_PARAMS.taiwan.zengwen_restriction_pct);
          return w * fabState.demand_mcm_day * ration;
        },
      },

      // --- Municipal → reservoir (predation; higher priority) ---------
      {
        id: 'tw_municipal_withdraws_shimen',
        source: 'tw_municipal_north',
        target: 'tw_shimen_res',
        type: 'predation',
        weight: 1.0,
        transfer(munState, resState, w) {
          // Municipal has legal priority; rationing only below 5% fill
          const fill = resState.storage_mcm / resState.capacity_mcm;
          const ration = rationFactor(fill, 0.05, 0.40);
          return w * munState.demand_mcm_day * ration;
        },
      },

      // --- Fabs → recycle system (outgoing water for treatment) -------
      {
        id: 'tw_hsinchu_to_recycle',
        source: 'tw_hsinchu_fab',
        target: 'tw_recycle_sys',
        type: 'flow',
        weight: 1.0,
        transfer(fabState, recycleState, w) {
          return w * fabState.demand_mcm_day * fabState.recycle_rate;
        },
      },
      {
        id: 'tw_tainan_to_recycle',
        source: 'tw_tainan_fab',
        target: 'tw_recycle_sys',
        type: 'flow',
        weight: 1.0,
        transfer(fabState, recycleState, w) {
          return w * fabState.demand_mcm_day * fabState.recycle_rate;
        },
      },

      // --- Recycle → reservoirs (treated return flows) ----------------
      // Split proportionally to fab demand shares: Hsinchu 0.078/0.196 ≈ 40%
      {
        id: 'tw_recycle_to_shimen',
        source: 'tw_recycle_sys',
        target: 'tw_shimen_res',
        type: 'flow',
        weight: 0.40,
        transfer(recycleState, resState, w) {
          return w * recycleState.throughput_mcm_day;
        },
      },
      {
        id: 'tw_recycle_to_zengwen',
        source: 'tw_recycle_sys',
        target: 'tw_zengwen_res',
        type: 'flow',
        weight: 0.60,
        transfer(recycleState, resState, w) {
          return w * recycleState.throughput_mcm_day;
        },
      },
    ],
  });
}

// =============================================================================
// 2. ARIZONA — Over-allocated desert system, Salt River Project + aquifer
// =============================================================================

/**
 * Builds the Arizona hydrological-semiconductor system.
 *
 * TSMC Fab 21 (North Phoenix / Scottsdale border) draws from two sources:
 *   - Salt River Project (SRP): surface water from the Salt and Verde rivers
 *     plus Colorado River allocations via the Central Arizona Project (CAP)
 *   - Phoenix Active Management Area (AMA) groundwater aquifer (backup)
 *
 * Agriculture holds senior water rights and takes ~70% of total allocation.
 * The system is chronically over-allocated: CAP allocations are being cut
 * under Colorado River Tier shortage declarations, and the aquifer is
 * declining in most zones despite managed aquifer recharge (MAR) programs.
 *
 * Monsoon season (July–September) provides brief recharge pulses but cannot
 * offset annual deficits.
 */
function buildArizonaSystem() {
  return System.build({
    name: 'arizona-hydro-semi',
    nodes: [
      // --- Surface water (SRP + CAP combined allocation) --------------
      {
        id: 'az_surface_water',
        type: 'reservoir',
        state: {
          // SRP total deliverable: ~1.5 MAF/yr = ~1,850 MCM/yr ≈ 5.07 MCM/day
          // CAP delivers ~1.5 MAF/yr to the Phoenix metro; combined ~10.14 MCM/day
          // but actual delivery fluctuates; Tier 2 shortage (2023) cut CAP ~21%
          delivery_mcm_day: 4.80,    // post-Tier-2-cut effective delivery
          allocation_mcm_day: 4.80,  // matches current delivery under restrictions
          // Curtailment factor: 1.0 = full allocation, <1 = shortage declaration
          curtailment_factor: 0.79,  // 1.0 - 0.21 (Tier 2 shortage as of 2023)
        },
        output: 'delivery_mcm_day',
        dynamics(state, inputs, ctx) {
          // Surface water delivery responds to curtailment (external forcing)
          // and demand drawdown — modeled as slow adjustment toward equilibrium
          const target = state.allocation_mcm_day * state.curtailment_factor;
          return {
            delivery_mcm_day: (target - state.delivery_mcm_day) / 30,
          };
        },
        meta: {
          sources: 'Salt River, Verde River, Colorado River (via CAP)',
          operator: 'Salt River Project + CAWCD',
          source: 'SRP Annual Report 2023; USBR Colorado River shortage table',
        },
      },

      // --- Groundwater aquifer (Phoenix AMA) --------------------------
      {
        id: 'az_groundwater',
        type: 'aquifer',
        state: {
          // Depth to water table: ~250 ft (76m) in Scottsdale/North Phoenix zone
          // (ADWR water-level monitoring network; 2022 average for central AMA)
          depth_to_water_m: 76,
          // Effective recharge from managed aquifer recharge (MAR) programs
          // and natural infiltration: ~0.38 MCM/day across Phoenix AMA
          recharge_mcm_day: 0.38,
          // Storage coefficient (specific yield) × effective catchment area
          // calibrated so 1 MCM net extraction = 0.010 m depth increase
          // (consistent with observed ~0.9 m/yr average decline at ~90 MCM/yr net)
          // Calibrated so ~230 MCM/yr net extraction → ~0.9 m/yr table drop
          // (Phoenix AMA observed: 0.3-1.5 m/yr; 0.9 m/yr mean central zone)
          depth_per_mcm: 0.004,
        },
        output: 'depth_to_water_m',
        dynamics(state, inputs, ctx) {
          // Net pumping = all predation inputs; recharge = all flow inputs + monsoon
          let total_pumping = 0;
          let total_recharge = 0;
          for (const inp of inputs) {
            if (inp.type === 'predation') total_pumping += inp.value;
            if (inp.type === 'flow') total_recharge += inp.value;
          }
          const net_extraction = total_pumping - total_recharge - state.recharge_mcm_day;
          // Positive net extraction → water table drops → depth increases
          return {
            depth_to_water_m: net_extraction * state.depth_per_mcm,
          };
        },
        meta: {
          zone: 'Phoenix Active Management Area (Central zone)',
          authority: 'Arizona Dept of Water Resources (ADWR)',
          source: 'ADWR Groundwater Site Analysis 2022; USGS NWIS',
          concern: 'Designated as overdrafted since 1980 Groundwater Management Act',
        },
      },

      // --- Monsoon recharge forcing -----------------------------------
      {
        id: 'az_monsoon',
        type: 'forcing',
        state: {
          // intensity ∈ [0,1]: 0=no monsoon, 1=peak monsoon (July-August)
          // Long-run mean: July-Sep contributes ~40% of annual precipitation
          intensity: 0.0,   // baseline outside monsoon season
          // Recharge efficiency: fraction of monsoon rainfall reaching aquifer
          recharge_efficiency: 0.28,  // ~28% of precipitation becomes groundwater
        },
        output: 'intensity',
        dynamics: undefined,
        meta: {
          season: 'July – September (North American Monsoon System)',
          peak_recharge_mcm_day: 0.45,
          note: 'Climate change projections show increasing intensity but shorter duration',
        },
      },

      // --- TSMC Fab 21 ------------------------------------------------
      {
        id: 'az_fab21',
        type: 'fab',
        state: {
          utilization: 0.80,         // Phase 1 ramp (Dec 2024 opening)
          utilization_cap: 0.80,     // Phase 1 cap; Phase 2 raises to 0.95
          water_stress: 0.0,
          // Phase 1: N4P (4nm) process; water demand ~1.5 MGD (TSMC estimate)
          // 1.5 MGD = 5,678 m³/day ≈ 0.006 MCM/day
          demand_mcm_day: 0.006,
          recycle_rate: 0.80,        // Arizona regulations incentivize higher recycle
          // Combined supply index: tracks blended surface+groundwater adequacy
          supply_index: 1.0,
        },
        output: 'utilization',
        dynamics(state, inputs, ctx) {
          // Two supply signals: surface water and groundwater (backup)
          const surface_dep = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'az_surface_water'
          );
          const gw_dep = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'az_groundwater'
          );
          // Primary supply ratio from surface water; groundwater acts as buffer
          const surface_ratio = Math.max(0, Math.min(1, surface_dep?.value ?? 1.0));
          const gw_ratio = Math.max(0, Math.min(1, gw_dep?.value ?? 1.0));

          // Regulatory inhibition — if regulatory node signals restriction
          const reg_signal = inputs.find((i) => i.type === 'inhibition');
          const reg_penalty = reg_signal ? Math.max(0, reg_signal.value) : 0;

          // Combined supply: surface water primary, groundwater provides 30% buffer
          const combined = Math.min(1, surface_ratio * 0.70 + gw_ratio * 0.30) *
            (1 - reg_penalty * 0.4);

          const target_stress = Math.max(0, 1 - combined);
          const d_stress = (target_stress - state.water_stress) / 10;

          // Fab 21 is early-ramp: utilization is capacity-constrained, not water-constrained
          // unless stress exceeds 0.4 (more severe than Taiwan fabs — less established
          // emergency infrastructure)
          const excess_stress = Math.max(0, state.water_stress - 0.40);
          const util_penalty = excess_stress > 0 ? (excess_stress / 0.60) ** 2 * 0.50 : 0;
          const target_util = state.utilization_cap * (1 - util_penalty);
          const d_util = (target_util - state.utilization) / 21;

          return {
            water_stress: d_stress,
            utilization: d_util,
            supply_index: combined,
          };
        },
        meta: {
          location: 'North Phoenix (I-17 & Deer Valley Road area)',
          process: 'N4P (Phase 1), N2/A16 (Phase 2 planned ~2028)',
          investment_usd_B: 65,
          source: 'TSMC press release Dec 2024; AZ DES environmental review 2022',
        },
      },

      // --- Agricultural demand ----------------------------------------
      {
        id: 'az_agriculture',
        type: 'agriculture',
        state: {
          // Maricopa + Pinal counties agriculture: ~70% of total water use
          // ~2.85 MCM/day from surface + groundwater combined
          demand_mcm_day: 2.85,
          allocation_fraction: 0.70,   // historical surface water priority
          // Fallowing fraction: under shortage, some ag land is fallowed
          // (ADWR / SRP water-sharing agreements)
          fallowing_fraction: 0.05,    // 5% fallowed under current conditions
        },
        output: 'demand_mcm_day',
        dynamics(state, inputs, ctx) {
          // Agriculture responds slowly to regulatory signals (long fallow cycles)
          const reg_signal = inputs.find((i) => i.type === 'inhibition');
          const target_fallow = reg_signal ? Math.min(0.40, reg_signal.value * 0.60) : 0.05;
          return {
            fallowing_fraction: (target_fallow - state.fallowing_fraction) / 60,
            demand_mcm_day:
              2.85 * (1 - state.fallowing_fraction) -
              state.demand_mcm_day < 0
                ? 0
                : (2.85 * (1 - state.fallowing_fraction) - state.demand_mcm_day) / 30,
          };
        },
        meta: {
          crops: 'Cotton, alfalfa, citrus, dairy (primary water consumers)',
          senior_rights: true,
          source: 'ADWR Water Atlas 2022; AZ Farm Bureau',
        },
      },

      // --- Regulatory node (AMA groundwater management) ---------------
      {
        id: 'az_regulatory',
        type: 'regulatory',
        state: {
          restriction_level: 0.0,   // 0=none, 1=maximum enforcement
          trigger_depth_m: STRESS_PARAMS.arizona.gw_regulation_trigger_m,  // 91m (300ft)
          max_depth_m: STRESS_PARAMS.arizona.gw_crisis_m,                  // 122m (400ft)
        },
        output: 'restriction_level',
        dynamics(state, inputs, ctx) {
          // Aquifer depth signal arrives as dependency edge from groundwater node
          const gw_signal = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'az_groundwater'
          );
          // gw_signal.value encodes depth directly (deeper = more stress)
          const current_depth = gw_signal?.value ?? state.trigger_depth_m;
          const excess = Math.max(0, current_depth - state.trigger_depth_m);
          const range = state.max_depth_m - state.trigger_depth_m;
          const target_restriction = range > 0 ? Math.min(1, excess / range) : 0;
          return {
            restriction_level: (target_restriction - state.restriction_level) / 14,
          };
        },
        meta: {
          authority: 'Arizona Groundwater Management Act (1980); ADWR',
          mechanism: '100-year safe yield planning horizon; AMA designation',
          source: 'ARS § 45-576; ADWR 2022 AMA Status Report',
        },
      },
    ],

    edges: [
      // --- Monsoon → groundwater (recharge pulse) ---------------------
      {
        id: 'az_monsoon_to_gw',
        source: 'az_monsoon',
        target: 'az_groundwater',
        type: 'flow',
        // Peak monsoon: ~1.6 MCM/day recharge; 0 outside season
        weight: 1.60,
        transfer(monsoonState, gwState, w) {
          return w * monsoonState.intensity * monsoonState.recharge_efficiency;
        },
      },

      // --- Surface water → fab21 (primary supply dependency) ----------
      {
        id: 'az_surface_to_fab21',
        source: 'az_surface_water',
        target: 'az_fab21',
        type: 'dependency',
        weight: 1.0,
        transfer(swState, fabState, w) {
          // Supply ratio based on delivery vs total system demand
          // SRP prioritizes municipal/industrial; at full delivery, fab is satisfied
          const total_demand = fabState.demand_mcm_day + 2.85; // fab + ag
          const ratio = Math.min(1, swState.delivery_mcm_day / total_demand);
          // Fab gets what's left after agriculture takes its priority share
          const ag_draw = 2.85 * STRESS_PARAMS.arizona.agriculture_priority_factor;
          const fab_available = Math.max(0, swState.delivery_mcm_day - ag_draw);
          return w * Math.min(1, fab_available / fabState.demand_mcm_day);
        },
      },

      // --- Groundwater → fab21 (backup supply) ------------------------
      {
        id: 'az_gw_to_fab21',
        source: 'az_groundwater',
        target: 'az_fab21',
        type: 'dependency',
        weight: 1.0,
        transfer(gwState, fabState, w) {
          // Groundwater supply ratio falls as depth exceeds regulatory trigger
          const over_trigger = Math.max(
            0,
            gwState.depth_to_water_m - STRESS_PARAMS.arizona.gw_regulation_trigger_m
          );
          const range =
            STRESS_PARAMS.arizona.gw_crisis_m - STRESS_PARAMS.arizona.gw_regulation_trigger_m;
          const depth_ratio = range > 0 ? Math.max(0, 1 - over_trigger / range) : 0;
          return w * depth_ratio;
        },
      },

      // --- Fab21 → groundwater (pumping predation) --------------------
      {
        id: 'az_fab21_pumps_gw',
        source: 'az_fab21',
        target: 'az_groundwater',
        type: 'predation',
        // Fab pumps ~25% of demand from groundwater (backup / blending)
        weight: 0.25,
        transfer(fabState, gwState, w) {
          return w * fabState.demand_mcm_day * (1 - fabState.recycle_rate);
        },
      },

      // --- Agriculture → groundwater (large-scale pumping) ------------
      {
        id: 'az_ag_pumps_gw',
        source: 'az_agriculture',
        target: 'az_groundwater',
        type: 'predation',
        // Agriculture relies ~40% on groundwater (rest from surface)
        weight: 0.40,
        transfer(agState, gwState, w) {
          return w * agState.demand_mcm_day * (1 - agState.fallowing_fraction);
        },
      },

      // --- Regulatory → agriculture (pumping restriction inhibition) --
      {
        id: 'az_reg_inhibits_ag',
        source: 'az_regulatory',
        target: 'az_agriculture',
        type: 'inhibition',
        weight: 1.0,
        transfer(regState, agState, w) {
          return w * regState.restriction_level;
        },
      },

      // --- Regulatory → fab21 (compliance restriction signal) ---------
      {
        id: 'az_reg_to_fab21',
        source: 'az_regulatory',
        target: 'az_fab21',
        type: 'inhibition',
        // Fab21 has diversified supply agreements; regulatory hit is attenuated
        weight: 0.30,
        transfer(regState, fabState, w) {
          return w * regState.restriction_level;
        },
      },

      // --- Groundwater → regulatory (depth signal for trigger) --------
      {
        id: 'az_gw_to_regulatory',
        source: 'az_groundwater',
        target: 'az_regulatory',
        type: 'dependency',
        weight: 1.0,
        // Passes the raw depth value for threshold evaluation
        transfer(gwState, regState, w) {
          return w * gwState.depth_to_water_m;
        },
      },

      // --- Surface water → agriculture (priority allocation) ----------
      {
        id: 'az_surface_to_ag',
        source: 'az_surface_water',
        target: 'az_agriculture',
        type: 'dependency',
        weight: 1.0,
        transfer(swState, agState, w) {
          const ag_demand = agState.demand_mcm_day * agState.allocation_fraction;
          return w * Math.min(1, swState.delivery_mcm_day / (ag_demand + 0.01));
        },
      },
    ],
  });
}

// =============================================================================
// 3. SAXONY GERMANY — Elbe watershed, TSMC Dresden (ESMC)
// =============================================================================

/**
 * Builds the Saxony hydrological-semiconductor system.
 *
 * The Elbe River at Dresden is the primary water source. Unlike reservoir
 * systems, river flow is fundamentally non-storable on short timescales:
 * the system relies on continuous baseflow maintained by snowpack melt
 * (Erzgebirge / Ore Mountains) and precipitation across the 51,394 km²
 * upper Elbe catchment.
 *
 * The 2018-2019 drought delivered the longest and most severe low-flow
 * period in the modern record — 50 m³/s at the Dresden gauge for sustained
 * weeks — threatening barge traffic, cooling water for power plants, and
 * industrial withdrawals. TSMC Dresden (ESMC joint venture, production
 * target 2027-2028) enters a river system with documented extreme fragility.
 *
 * Flow dynamics: mean-reverting AR process modulated by a drought index.
 * At PDSI = 0: flow equilibrates to `seasonal_mean_mcm_day` (28.5).
 * At PDSI = -4 (extreme drought): effective mean falls to ~5.7 MCM/day.
 */
function buildSaxonySystem() {
  return System.build({
    name: 'saxony-hydro-semi',
    nodes: [
      // --- Elbe river flow at Dresden ---------------------------------
      {
        id: 'de_elbe_flow',
        type: 'river',
        state: {
          // 330 m³/s × 0.0864 = 28.51 MCM/day (long-run mean, Dresden gauge)
          flow_mcm_day: 28.5,
          // Historical reference levels (meta, not evolved):
          seasonal_mean_mcm_day: 28.5,
          // 7-day minimum: used for ecological flow compliance assessment
          seven_day_low_mcm_day: 22.0,
        },
        output: 'flow_mcm_day',
        dynamics(state, inputs, ctx) {
          // Drought index signal (PDSI) from inhibition edge
          const drought_inp = inputs.find(
            (i) => i.type === 'inhibition' && i.source === 'de_drought_idx'
          );
          const pdsi = drought_inp ? drought_inp.value : 0.0;

          // Effective seasonal mean scales with drought severity
          // pdsi=0 → effective_mean=28.5; pdsi=-4 → 28.5×0.20=5.7 MCM/day
          const effective_mean =
            state.seasonal_mean_mcm_day * Math.max(0.15, 1 + 0.20 * pdsi);

          // Snowmelt contribution from Erzgebirge flow edge
          const snowmelt_inp = inputs.find(
            (i) => i.type === 'flow' && i.source === 'de_snowpack_erz'
          );
          const snowmelt = snowmelt_inp ? snowmelt_inp.value : 0;

          // Net withdrawals (predation) reduce flow directly
          const withdrawals = inputs
            .filter((i) => i.type === 'predation')
            .reduce((a, i) => a + i.value, 0);

          // AR mean-reversion: τ=14 days (baseflow memory for upper Elbe catchment).
          // Calibrated with Dresden-local industrial demand so drought equilibrium
          // (pdsi=-4, τ=14, demand=0.25) converges to ~4.4 MCM/day ≈ 2018 observed low.
          const d_flow =
            (effective_mean - state.flow_mcm_day) / 14 + snowmelt - withdrawals;

          // Flow cannot go below practical minimum (residual seepage ~0.5 MCM/day)
          const projected = state.flow_mcm_day + d_flow;
          if (projected < 0.5) return { flow_mcm_day: 0.5 - state.flow_mcm_day };

          return { flow_mcm_day: d_flow };
        },
        meta: {
          gauge: 'Dresden Augustusbrücke (gauge ID: 501060)',
          catchment_km2: 51394,
          operator: 'Sächsisches Landesamt für Umwelt (LfULG)',
          record_low_m3s: 50,
          record_low_year: 2018,
          source: 'LfULG Elbe Jahresberichte 2018-2022',
        },
      },

      // --- Erzgebirge snowpack (seasonal melt forcing) ----------------
      {
        id: 'de_snowpack_erz',
        type: 'forcing',
        state: {
          // Snow water equivalent (SWE) in mm — Erzgebirge peak elevations ~1200m
          // Mean March SWE: ~85mm at high elevations; depletes through April-May
          swe_mm: 85,
          // Melt rate: 0 in winter accumulation, peaks at 3-5 mm/day in April
          melt_rate_mm_day: 0.0,
        },
        output: 'swe_mm',
        dynamics(state, inputs, ctx) {
          // SWE depletes as melt occurs; replenished by snowfall (external forcing)
          const melt = Math.min(state.swe_mm, state.melt_rate_mm_day);
          return { swe_mm: -melt };
        },
        meta: {
          region: 'Erzgebirge / Krušné hory (Ore Mountains)',
          peak_elevation_m: 1215,
          contributing_area_km2: 5700,
          source: 'DWD (Deutscher Wetterdienst) snow depth records; CHMI (CZ)',
        },
      },

      // --- Drought index (Palmer DSI) ---------------------------------
      {
        id: 'de_drought_idx',
        type: 'forcing',
        state: {
          // Palmer Drought Severity Index: 0=normal, -2=moderate, -4=extreme
          // 2018 summer across Saxony reached -4.5 (record)
          pdsi: 0.0,
          // Consecutive dry days (for WFD ecological flow analysis)
          consecutive_dry_days: 0,
        },
        output: 'pdsi',
        dynamics: undefined, // driven by stressor injection
        meta: {
          reference_period: '1951-2000 WMO climatological standard',
          crisis_2018_pdsi: -4.5,
          source: 'Helmholtz UFZ Drought Monitor (ufz.de/duerremonitor)',
        },
      },

      // --- TSMC Dresden (ESMC joint venture) --------------------------
      {
        id: 'de_tsmc_dresden',
        type: 'fab',
        state: {
          // Production target: 2027-2028. Modeling the planned steady-state.
          // Initial utilization reflects ramp period; stress starts at 0.
          utilization: 0.85,
          utilization_cap: 0.85,
          water_stress: 0.0,
          // Estimated demand from analogous 300mm fab (GlobalFoundries Malta: ~1.9 MGD)
          // TSMC Dresden likely 0.018-0.022 MCM/day; using 0.020 MCM/day
          demand_mcm_day: 0.020,
          recycle_rate: 0.75,    // EU industrial water reuse directive targets
        },
        output: 'utilization',
        dynamics(state, inputs, ctx) {
          const supply_inp = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'de_elbe_flow'
          );
          const supply_ratio = Math.max(0, Math.min(1, supply_inp?.value ?? 1.0));

          // Regulatory restriction when Elbe drops below ecological minimum
          const reg_inp = inputs.find(
            (i) => i.type === 'inhibition' && i.source === 'de_min_flow_reg'
          );
          const reg_penalty = reg_inp ? Math.max(0, reg_inp.value) : 0;

          const combined_supply = supply_ratio * (1 - reg_penalty * 0.5);
          const target_stress = Math.max(0, 1 - combined_supply);
          const d_stress = (target_stress - state.water_stress) / 8;

          const excess_stress = Math.max(0, state.water_stress - 0.35);
          const util_penalty = excess_stress > 0 ? (excess_stress / 0.65) ** 2 * 0.55 : 0;
          const target_util = state.utilization_cap * (1 - util_penalty);
          const d_util = (target_util - state.utilization) / 14;

          return { water_stress: d_stress, utilization: d_util };
        },
        meta: {
          full_name: 'European Semiconductor Manufacturing Company (ESMC)',
          partners: 'TSMC 70%, Bosch 10%, Infineon 10%, NXP 10%',
          process: '28/22nm FD-SOI (planned); automotive + embedded',
          investment_eur_B: 10.8,
          eu_subsidy_eur_B: 5.0,
          source: 'ESMC press release Aug 2023; EC IPCEI Microelectronics',
        },
      },

      // --- Industrial competition (Sachsen) ---------------------------
      {
        id: 'de_industrial',
        type: 'industrial',
        state: {
          // Dresden-local industrial withdrawals from the Elbe (~2.9 m³/s)
          // Full Saxon industry is ~5× larger but spread across the basin;
          // only co-located Dresden-area users compete with TSMC's intake point.
          demand_mcm_day: 0.25,
          sector: 'mixed',
        },
        output: 'demand_mcm_day',
        dynamics: undefined, // treated as fixed background demand
        meta: {
          major_users: 'Volkswagen Zwickau, BASF, Sachsenmilch',
          source: 'LfULG Wasserbilanz Sachsen 2021',
        },
      },

      // --- Minimum flow regulatory node (EU WFD) ----------------------
      {
        id: 'de_min_flow_reg',
        type: 'regulatory',
        state: {
          // EU Water Framework Directive ecological flow requirements
          threshold_mcm_day: STRESS_PARAMS.saxony.elbe_ecological_min_mcm_day, // 8.64 MCM/day
          restriction_active: 0.0,   // 0=inactive, 1=full restriction
        },
        output: 'restriction_active',
        dynamics(state, inputs, ctx) {
          // River flow signal arrives as dependency from Elbe
          const flow_inp = inputs.find(
            (i) => i.type === 'dependency' && i.source === 'de_elbe_flow'
          );
          const flow = flow_inp ? flow_inp.value : state.threshold_mcm_day;
          // Restriction ramps up as flow falls below threshold
          const deficit = Math.max(0, state.threshold_mcm_day - flow);
          const target = Math.min(1, deficit / (state.threshold_mcm_day * 0.5));
          return { restriction_active: (target - state.restriction_active) / 5 };
        },
        meta: {
          directive: 'EU Water Framework Directive 2000/60/EC',
          trigger: '100 m³/s (8.64 MCM/day) at Dresden gauge',
          enforcement: 'LfULG + Saxon State Ministry of Energy (SMEKUL)',
        },
      },
    ],

    edges: [
      // --- Snowpack → Elbe (melt contribution) ------------------------
      {
        id: 'de_snow_to_elbe',
        source: 'de_snowpack_erz',
        target: 'de_elbe_flow',
        type: 'flow',
        weight: 1.0,
        // 1mm SWE melt over ~500 km² effective fast-response catchment = 0.5 MCM
        // (remaining 5200 km² has slower baseflow contribution already in mean)
        transfer(snowState, elbeState, w) {
          const melt = Math.min(snowState.swe_mm, snowState.melt_rate_mm_day);
          return w * melt * 500 / 1000; // convert mm×km² to MCM
        },
      },

      // --- Drought index → Elbe (inhibits effective mean) -------------
      {
        id: 'de_drought_inhibits_elbe',
        source: 'de_drought_idx',
        target: 'de_elbe_flow',
        type: 'inhibition',
        weight: 1.0,
        // Transfer passes the PDSI value directly (negative = drought suppression)
        transfer(droughtState, elbeState, w) {
          return w * droughtState.pdsi;
        },
      },

      // --- Elbe → TSMC Dresden (supply dependency) --------------------
      {
        id: 'de_elbe_to_tsmc',
        source: 'de_elbe_flow',
        target: 'de_tsmc_dresden',
        type: 'dependency',
        weight: 1.0,
        transfer(elbeState, fabState, w) {
          // Supply ratio: sigmoid response around ecological minimum
          // At 28.5 MCM/day (normal): ratio ≈ 1.0
          // At 8.64 MCM/day (eco minimum): ratio ≈ 0.50
          // At 4.3 MCM/day (2018 crisis): ratio ≈ 0.12
          const threshold = STRESS_PARAMS.saxony.elbe_ecological_min_mcm_day;
          const fill = elbeState.flow_mcm_day / (threshold * 3.3); // normalized to normal
          return w * sigmoidSupplyRatio(Math.min(fill, 1.0), 0.30, 12);
        },
      },

      // --- TSMC Dresden → Elbe (net withdrawal after recycling) -------
      {
        id: 'de_tsmc_withdraws_elbe',
        source: 'de_tsmc_dresden',
        target: 'de_elbe_flow',
        type: 'predation',
        weight: 1.0,
        transfer(fabState, elbeState, w) {
          const flow_ratio = elbeState.flow_mcm_day /
            STRESS_PARAMS.saxony.elbe_ecological_min_mcm_day;
          const ration = rationFactor(flow_ratio, 1.0, 0.10);
          // Net withdrawal after 75% recycling return (EU reuse target)
          return w * fabState.demand_mcm_day * (1 - fabState.recycle_rate) * ration;
        },
      },

      // --- Industrial → Elbe (background withdrawal) ------------------
      {
        id: 'de_industrial_withdraws_elbe',
        source: 'de_industrial',
        target: 'de_elbe_flow',
        type: 'predation',
        weight: 1.0,
        transfer(indState, elbeState, w) {
          const flow_ratio = elbeState.flow_mcm_day /
            STRESS_PARAMS.saxony.elbe_ecological_min_mcm_day;
          // EU WFD mandates withdrawal curtailment below ecological minimum;
          // floor of 0.05 reflects mandatory near-shutdown below crisis level
          const ration = rationFactor(flow_ratio, 1.0, 0.05);
          // Industry recycles ~40% on average (German industrial water efficiency)
          return w * indState.demand_mcm_day * 0.60 * ration;
        },
      },

      // --- Elbe → regulatory (flow monitoring signal) -----------------
      {
        id: 'de_elbe_to_reg',
        source: 'de_elbe_flow',
        target: 'de_min_flow_reg',
        type: 'dependency',
        weight: 1.0,
        // Passes raw flow for threshold comparison in regulatory dynamics
        transfer(elbeState, regState, w) {
          return w * elbeState.flow_mcm_day;
        },
      },

      // --- Regulatory → TSMC Dresden (restriction signal) -------------
      {
        id: 'de_reg_restricts_tsmc',
        source: 'de_min_flow_reg',
        target: 'de_tsmc_dresden',
        type: 'inhibition',
        weight: 1.0,
        transfer(regState, fabState, w) {
          return w * regState.restriction_active;
        },
      },
    ],
  });
}

// =============================================================================
// 4. Combined global supply-risk graph
// =============================================================================

/**
 * Merges all three regional systems into one unified graph and adds
 * cross-regional information edges representing:
 *
 *   - Demand substitution pressure: if Taiwan fabs are stressed, customers
 *     (device OEMs, IDMs) intensify orders at alternative nodes, increasing
 *     demand pressure on Arizona and Germany fabs.
 *   - Market signal propagation: stress in one region raises volatility in
 *     spot pricing, which all fabs observe and respond to.
 *   - Technology dependency: some chip types (advanced logic below 7nm) are
 *     only available from Taiwan — no substitution path; information edges
 *     carry one-way demand-surge signals, not two-way supply-sharing.
 *
 * The combined graph is the input the early-warning signal engine (signals.js)
 * uses to compute rising spatial correlation — the hallmark indicator that
 * regions are losing independence and moving toward system-wide collapse.
 */
function combineRegions() {
  const tw = buildTaiwanSystem();
  const az = buildArizonaSystem();
  const de = buildSaxonySystem();

  const global = new System('cascade-global-supply-risk');

  // Copy all regional nodes and edges into the global system
  for (const n of [...tw.nodes(), ...az.nodes(), ...de.nodes()]) {
    global.addNode(n.clone());
  }
  for (const e of [...tw.edges(), ...az.edges(), ...de.edges()]) {
    global.addEdge(e.clone());
  }

  // ---- Cross-regional information edges --------------------------------

  // [1] Taiwan Hsinchu stress → Arizona Fab 21 demand surge
  //     Hsinchu produces N5/N7 for HPC/mobile; Fab 21 is a partial substitute
  //     for some N5 capacity after ramp to Phase 2. During Taiwan shortage,
  //     customers shift orders → Arizona sees utilization pressure.
  global.addEdge({
    id: 'xr_tw_hsinchu_to_az_fab21',
    source: 'tw_hsinchu_fab',
    target: 'az_fab21',
    type: 'information',
    weight: 0.35,
    transfer(twFab, azFab, w) {
      // Demand pressure signal = Taiwan water stress × node transferability
      // (partial — Hsinchu N5/N7 not 1:1 compatible with Fab21 N4P; ~35% overlap)
      return w * twFab.water_stress;
    },
    meta: { mechanism: 'Customer order reallocation; ~35% process overlap N5→N4P' },
  });

  // [2] Taiwan Tainan stress → Germany Dresden demand signal
  //     Tainan Fab 18 is the sole N3 EUV source globally. Dresden produces
  //     28/22nm (automotive). No direct substitution — but systemic stress
  //     in Taiwan sends a risk-premium signal that Dresden must absorb via
  //     contract re-pricing and expedited demand for its mature-node supply.
  global.addEdge({
    id: 'xr_tw_tainan_to_de_dresden',
    source: 'tw_tainan_fab',
    target: 'de_tsmc_dresden',
    type: 'information',
    weight: 0.25,
    transfer(twFab, deFab, w) {
      // Dresden can't substitute N3; the signal is market risk amplification
      // not direct demand substitution — weighted lower accordingly
      return w * twFab.water_stress;
    },
    meta: {
      mechanism: 'Market risk amplification; no technical substitution for N3',
    },
  });

  // [3] Arizona groundwater depth → Taiwan system supply resilience signal
  //     As Arizona aquifer depletes, global investors observe that the
  //     alternate-fab strategy is itself water-constrained → Taiwan fabs
  //     face reduced hedging value, increasing their intrinsic stress signal.
  global.addEdge({
    id: 'xr_az_gw_to_tw_hsinchu',
    source: 'az_groundwater',
    target: 'tw_hsinchu_fab',
    type: 'information',
    weight: 0.20,
    transfer(gwState, twFab, w) {
      // Normalize depth to a stress signal: 0 below trigger, 1 at crisis
      const trigger = STRESS_PARAMS.arizona.gw_regulation_trigger_m;
      const crisis = STRESS_PARAMS.arizona.gw_crisis_m;
      const excess = Math.max(0, gwState.depth_to_water_m - trigger);
      return w * Math.min(1, excess / (crisis - trigger));
    },
    meta: { mechanism: 'Investor hedging signal: alternate fabs also water-constrained' },
  });

  // [4] Saxony Elbe flow → Arizona Fab 21 (cross-regional risk correlation)
  //     When both Dresden and Arizona are stressed simultaneously, the market
  //     learns there is no safe regional alternative: the spatial correlation
  //     signal that precedes systemic market dislocation.
  global.addEdge({
    id: 'xr_de_elbe_to_az_fab21',
    source: 'de_elbe_flow',
    target: 'az_fab21',
    type: 'information',
    weight: 0.15,
    transfer(elbeState, azFab, w) {
      // Low Elbe flow → stress signal to Arizona (co-movement indicator)
      const normal = 28.5;
      const flow_ratio = Math.max(0, elbeState.flow_mcm_day / normal);
      return w * Math.max(0, 1 - flow_ratio);   // 0 at normal flow; 1 at zero flow
    },
    meta: { mechanism: 'Cross-regional co-stress indicator for spatial correlation EWS' },
  });

  // [5] Taiwan Shimen reservoir → Saxony drought index (information coupling)
  //     Atmospheric teleconnections: La Niña suppresses Taiwan typhoon recharge
  //     and concurrently reduces Central European summer precipitation. This
  //     edge encodes the empirical correlation, allowing the model to propagate
  //     correlated shocks from a single ENSO forcing.
  global.addEdge({
    id: 'xr_tw_shimen_to_de_drought',
    source: 'tw_shimen_res',
    target: 'de_drought_idx',
    type: 'information',
    weight: 0.12,
    transfer(shimen, drought, w) {
      // Low Shimen fill (drought anomaly) → correlated PDSI reduction in Germany
      const fill = shimen.storage_mcm / shimen.capacity_mcm;
      // Below 20% fill: suggests La Niña conditions → -1.5 PDSI equivalent signal
      return w * Math.max(0, 1 - fill / 0.20) * (-1.5);
    },
    meta: {
      mechanism: 'ENSO teleconnection: La Niña → simultaneous Taiwan drought + European dry',
      evidence: '2018-2019: Taiwan deficit + record European drought co-occurred',
    },
  });

  global.validate();
  return global;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  buildTaiwanSystem,
  buildArizonaSystem,
  buildSaxonySystem,
  combineRegions,
  STRESS_PARAMS,
  // Export helpers for use in stressor injection scripts
  _helpers: { sigmoidSupplyRatio, rationFactor },
};
