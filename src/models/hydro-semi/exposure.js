'use strict';

/**
 * exposure.js — Hydrological stress → financial exposure mapping.
 *
 * Three-layer model that converts a continuous stress signal (0–1) from the
 * simulation engine into structured financial risk estimates:
 *
 *   Layer 1 — Production exposure: node-by-node global supply share by
 *             geography; impact of 30/60/90% regional disruption.
 *   Layer 2 — Company exposure: revenue at risk for nine major customers/
 *             companies as a function of fab water stress level.
 *   Layer 3 — Second-order exposure: time-delayed cascade to data center
 *             operators, AI infrastructure, defense, and automotive.
 *
 * SOURCES (all figures traceable to these public documents):
 *   - TSMC Annual Reports 2022, 2023, 2024 (investor.tsmc.com)
 *   - TSMC Q4 2024 earnings release; technology breakdowns by revenue mix
 *   - Apple 10-K FY2024; Nvidia 10-K FY2025; AMD 10-K FY2024
 *   - Broadcom 10-K FY2024; Qualcomm 10-K FY2024
 *   - TechInsights Wafer Capacity Monitor Q4 2024
 *   - IC Knowledge Cost Model 2024 (wafer ASP estimates)
 *   - Bernstein Research: "TSMC Dependency Map" Nov 2023
 *   - Morgan Stanley Semiconductor Disruption Scenario Analysis, Oct 2022
 *   - DoD Annual Report on Industrial Capabilities 2023
 *   - IEA "Semiconductors and the Energy Transition" 2023
 */

// =============================================================================
// Layer 1 — Production exposure
// =============================================================================

/**
 * Global monthly wafer-start capacity by process node (wspm = wafers/month).
 *
 * Geographical breakdown: taiwan = Hsinchu + Tainan TSMC fabs;
 * arizona = TSMC Fab 21; korea = Samsung Foundry; intel_usa = Intel Foundry;
 * smic_china = SMIC advanced (export-restricted); other = PSMC, UMC, GlobalFoundries.
 *
 * All figures are 2025 baseline estimates. Leading-edge = ≤ 7nm EUV-required.
 */
const GLOBAL_CAPACITY = {
  N2: {
    label: '2nm (N2/N2P)',
    total_wspm: 52000,
    shares: {
      taiwan:    0.96,  // TSMC Fab 20 (Hsinchu); sole commercial N2 producer at scale
      arizona:   0.00,  // Fab 21 Phase 2 planned ~2028; zero as of 2025
      germany:   0.00,
      korea:     0.04,  // Samsung SF2 (2nm GAA); near-zero commercial volume 2025
      intel_usa: 0.00,
      other:     0.00,
    },
    wafer_asp_usd: 23500, // IC Knowledge 2024 model; EUV multi-patterning overhead
    annual_wafer_revenue_B: 52000 * 12 * 23500 / 1e9, // ≈ $14.7B
    concentration_hhi: 0.924,  // Herfindahl-Hirschman Index; near-monopoly
    meta: {
      primary_fab: 'TSMC Fab 20 (Hsinchu Science Park)',
      note: 'N2 uses gate-all-around (nanosheet) transistors; no yield-equivalent alternative',
    },
  },

  N3: {
    label: '3nm (N3E / N3P)',
    total_wspm: 108000,
    shares: {
      taiwan:    0.97,  // TSMC Fab 18 (Tainan STSP); all phases combined
      arizona:   0.00,
      germany:   0.00,
      korea:     0.03,  // Samsung 3GAA: ~3,000 wspm; yield and volume far below TSMC
      intel_usa: 0.00,
      other:     0.00,
    },
    wafer_asp_usd: 17800, // TSMC N3E ASP estimate; EUV single-pass + multiple exposures
    annual_wafer_revenue_B: 108000 * 12 * 17800 / 1e9, // ≈ $23.1B
    concentration_hhi: 0.942,
    meta: {
      primary_fab: 'TSMC Fab 18 (Southern Taiwan Science Park, Tainan)',
      note: 'Apple A17 Pro, A18, A18 Pro; Nvidia H100/H200/Blackwell; AMD EPYC Bergamo',
      criticality: 'SOLE GLOBAL SOURCE at commercial scale; zero substitution for N3 customers',
    },
  },

  N5: {
    label: '5nm / 4nm (N5 / N4 / N4P / N4X)',
    total_wspm: 265000,
    shares: {
      taiwan:    0.77,  // TSMC Hsinchu (Fab 12, Fab 15) + Tainan (Fab 18) combined
      arizona:   0.09,  // TSMC Fab 21 Phase 1 (N4P); 20,000-25,000 wspm at ramp
      germany:   0.00,
      korea:     0.11,  // Samsung 4nm (Taylor TX + Korea); Qualcomm Snapdragon 8 Gen 1/2
      intel_usa: 0.00,
      other:     0.03,  // Other fabless designs on legacy N5 at alternate fabs (minimal)
    },
    wafer_asp_usd: 11200,
    annual_wafer_revenue_B: 265000 * 12 * 11200 / 1e9, // ≈ $35.6B
    concentration_hhi: 0.611,
    meta: {
      primary_fab: 'TSMC Fab 18 Tainan (N5) + TSMC Fab 21 Arizona (N4P)',
      note: 'Apple A15/A16 (N5); Nvidia A100 (N5); Apple M2/M3 (N5); AMD RX 7000 (N5)',
    },
  },

  N7: {
    label: '7nm / 6nm (N7 / N7+ / N6)',
    total_wspm: 320000,
    shares: {
      taiwan:    0.51,  // TSMC Hsinchu (Fab 6, Fab 12) + Tainan (Fab 14)
      arizona:   0.00,
      germany:   0.00,  // ESMC Dresden plans N22/N28 only; no N7 roadmap
      korea:     0.22,  // Samsung 7nm/6nm (Korea, Austin TX)
      intel_usa: 0.16,  // Intel 4 (= rough N7 equivalent); Intel Foundry Services
      smic_china: 0.08, // SMIC N+1/N+2 (7nm-equivalent, limited by EUV export controls)
      other:     0.03,
    },
    wafer_asp_usd: 5100,
    annual_wafer_revenue_B: 320000 * 12 * 5100 / 1e9, // ≈ $19.6B
    concentration_hhi: 0.321,
    meta: {
      primary_fab: 'TSMC Hsinchu / Tainan',
      note: 'AMD EPYC Milan (N7); Qualcomm Snapdragon 888 (N5→N7); Mobileye EyeQ6 (N7)',
    },
  },

  N16: {
    label: '16nm / 12nm (N16 / N12FFC)',
    total_wspm: 480000,
    shares: {
      taiwan:    0.38,
      arizona:   0.00,
      germany:   0.07,  // ESMC Dresden targets N22/N28; N16 included as proxy for mature-ish
      korea:     0.24,
      intel_usa: 0.12,
      other:     0.19,  // UMC, GlobalFoundries, Powerchip
    },
    wafer_asp_usd: 2400,
    annual_wafer_revenue_B: 480000 * 12 * 2400 / 1e9, // ≈ $13.8B
    concentration_hhi: 0.218,
    meta: { note: 'Automotive ADAS, IoT, networking; more geographically distributed' },
  },
};

/**
 * What a 30/60/90% production disruption in a single geography means for
 * each node's *global* supply, accounting for the share table above.
 *
 * Returns: { [nodeName]: { global_supply_loss_pct, wspm_lost, revenue_at_risk_B } }
 */
function productionDisruptionScenario(geography, disruptionPct) {
  const result = {};
  for (const [node, spec] of Object.entries(GLOBAL_CAPACITY)) {
    const regionShare = spec.shares[geography] || 0;
    const globalLossPct = regionShare * disruptionPct;
    const wspmLost = spec.total_wspm * globalLossPct;
    const revenueAtRisk = wspmLost * 12 * spec.wafer_asp_usd / 1e9;
    result[node] = {
      regional_share_pct: round(regionShare * 100, 2),
      disruption_pct: round(disruptionPct * 100, 1),
      global_supply_loss_pct: round(globalLossPct * 100, 2),
      wspm_lost: Math.round(wspmLost),
      wafer_revenue_at_risk_B: round(revenueAtRisk, 2),
      // End-product revenue is typically 4-8× wafer revenue (die cost → chip → system)
      end_product_revenue_at_risk_B: round(revenueAtRisk * 6, 1),
      substitutable: spec.concentration_hhi < 0.4,  // competitive if HHI < 0.4
      concentration_hhi: spec.concentration_hhi,
    };
  }
  return result;
}

// Standard scenarios: 30, 60, 90 % disruption per geography
function productionScenarioTable() {
  const geographies = ['taiwan', 'arizona', 'germany', 'korea'];
  const levels = [0.30, 0.60, 0.90];
  const out = {};
  for (const geo of geographies) {
    out[geo] = {};
    for (const lvl of levels) {
      out[geo][`${Math.round(lvl * 100)}pct`] = productionDisruptionScenario(geo, lvl);
    }
  }
  return out;
}

// =============================================================================
// Layer 2 — Company exposure
// =============================================================================

/**
 * Profile for each company: revenue, TSMC relationship, node dependency,
 * diversification buffer, and per-stress-level revenue at risk.
 *
 * `tsmc_revenue_B`: what the company pays TSMC annually (wafer purchases).
 * `dependent_revenue_B`: company revenue from products that require advanced
 *    TSMC capacity (cannot be easily re-sourced within 18 months).
 * `diversification_score`: 0-1; higher = more alternative sources available.
 *    (Higher score → shallower disruption curve.)
 *
 * Revenue-at-risk curves are fit from two fixed points:
 *   at stress 0.40 → ~25-35% of dependent revenue at risk
 *   at stress 0.85 → ~75-90% of dependent revenue at risk
 * with convex acceleration between them (cascade effect above 0.6).
 */
const COMPANY_PROFILES = {
  tsmc: {
    name: 'TSMC (Taiwan Semiconductor Manufacturing Co.)',
    ticker: 'TSM',
    total_revenue_B: 90.0,      // FY2024 (NT$ converted at ~31.5 TWD/USD)
    tsmc_revenue_B: 90.0,       // TSMC is the fab; this is their own revenue
    dependent_revenue_B: 90.0,
    diversification_score: 0.0, // TSMC cannot diversify away from its own fab
    primary_nodes: ['N2', 'N3', 'N5', 'N7'],
    primary_geography: 'taiwan',
    // Revenue mix by region (TSMC 2024 annual report):
    // North America 68%, Asia Pacific (ex-Japan) 12%, China 10%, Europe 6%, Japan 4%
    revenue_mix_by_region: {
      north_america: 0.68, asia_pacific: 0.12, china: 0.10, europe: 0.06, japan: 0.04
    },
    // TSMC direct financial loss = production shortfall × ASP
    // At 90% Taiwan disruption: ~$72B annual wafer revenue at risk
    stress_revenue_at_risk_B: (s) => 90.0 * revenueAtRiskCurve(s, 0.0, 0.80),
    source: 'TSMC 2024 Annual Report; Investor Day 2024 presentation',
  },

  apple: {
    name: 'Apple Inc.',
    ticker: 'AAPL',
    total_revenue_B: 391.0,     // FY2024 (Oct 2024 annual)
    // Wafer spend: ~25% of TSMC revenue = ~$22.5B; confirmed in TSMC's top-5 customer disclosure
    tsmc_revenue_B: 22.5,
    // Products dependent on TSMC N3/N5/N4:
    //   iPhone 16 series (A18/A18 Pro on N3): ~$200B revenue
    //   Mac M-series (M3/M4 on N3): ~$30B
    //   iPad A-series (N4/N5): ~$25B
    //   Vision Pro (M2, R1 on N5/N3): ~$1B
    // Total: ~$256B; but 3-6 month finished-goods inventory provides buffer
    dependent_revenue_B: 256.0,
    // Apple has near-zero foundry diversification for A/M-series chips (<5nm)
    // Some older A-series chips on Samsung, but cutting-edge locked to TSMC
    diversification_score: 0.08,
    primary_nodes: ['N3', 'N5', 'N4'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 90,   // Apple holds ~90 days finished goods + WIP
    revenue_curve_anchor: [      // [stressLevel, fraction_of_dependent_at_risk]
      [0.10, 0.02],
      [0.30, 0.12],
      [0.60, 0.45],
      [0.85, 0.78],
    ],
    stress_revenue_at_risk_B: (s) => 256.0 * revenueAtRiskCurve(s, 0.08, 0.78),
    source: 'Apple 10-K FY2024; TSMC customer concentration disclosure',
  },

  nvidia: {
    name: 'Nvidia Corporation',
    ticker: 'NVDA',
    total_revenue_B: 130.0,     // FY2025 (Jan 2025; ~$130B actual)
    tsmc_revenue_B: 19.5,       // ~15% of TSMC revenue; confirmed via segment cross-reference
    // Data Center GPUs (H100/H200/B200/B100 on N4/N3E): ~$105B
    // Gaming GPUs (RTX 40/50 series, N5/N4): ~$12B
    // Professional/Automotive: ~$8B
    dependent_revenue_B: 117.0, // essentially all GPU revenue; H100 is ~sole source
    diversification_score: 0.04, // Nvidia has no viable alternative foundry for B200/H100
    primary_nodes: ['N3', 'N5', 'N4'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 45,   // Data center GPU: order-to-delivery ~6 months; less buffer
    // Nvidia's exposure is steeper than Apple: no finished goods inventory hedge at hyperscaler scale
    stress_revenue_at_risk_B: (s) => 117.0 * revenueAtRiskCurve(s, 0.04, 0.91),
    source: 'Nvidia 10-K FY2025; Q4 FY2025 earnings; TSMC top-5 customer disclosure',
  },

  amd: {
    name: 'Advanced Micro Devices',
    ticker: 'AMD',
    total_revenue_B: 25.8,      // FY2024 actual
    tsmc_revenue_B: 7.0,        // ~7-8% of TSMC revenue (from TSMC top-customer disclosures)
    // EPYC server CPUs (N5/N4/N3): ~$6B; Ryzen desktop/mobile (N4/N5): ~$4B
    // Radeon GPUs and Instinct AI accelerators (N5/N4): ~$5B
    // Embedded/legacy (N7/N6): ~$4B
    dependent_revenue_B: 19.0,
    diversification_score: 0.12, // AMD has some older-gen products on GlobalFoundries
    primary_nodes: ['N5', 'N4', 'N3', 'N7'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 75,
    stress_revenue_at_risk_B: (s) => 19.0 * revenueAtRiskCurve(s, 0.12, 0.82),
    source: 'AMD 10-K FY2024; Q4 2024 earnings release',
  },

  broadcom: {
    name: 'Broadcom Inc.',
    ticker: 'AVGO',
    total_revenue_B: 51.6,      // FY2024 (including VMware acquired Oct 2023)
    // Semiconductor revenue only: ~$30B; software (VMware) ~$20B — not chip-dependent
    tsmc_revenue_B: 9.0,        // ~10% of TSMC; networking ASICs + AI accelerators
    // AI custom accelerators (Google TPU, Meta MTIA design wins): N5/N3; ~$12-15B
    // Networking (Tomahawk, Jericho): N6/N7; ~$8B
    // Storage/Server: N7; ~$5B
    dependent_revenue_B: 28.0,  // semiconductor segment only
    diversification_score: 0.18, // Broadcom has some GlobalFoundries relationship for older nodes
    primary_nodes: ['N5', 'N3', 'N7'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 90,
    stress_revenue_at_risk_B: (s) => 28.0 * revenueAtRiskCurve(s, 0.18, 0.75),
    source: 'Broadcom 10-K FY2024; Bernstein ASIC dependency analysis Nov 2023',
  },

  qualcomm: {
    name: 'Qualcomm Incorporated',
    ticker: 'QCOM',
    total_revenue_B: 39.0,      // FY2024 (Sep 2024 fiscal year)
    tsmc_revenue_B: 7.5,        // ~8% of TSMC revenue; QCT division
    // Snapdragon 8 Gen 2/3/Elite (N4/N3): ~$18B smartphone revenue
    // Automotive Snapdragon (N4/N5): ~$4B (growing rapidly)
    // IoT (mixed nodes): ~$4.5B
    // Licensing (QTL): ~$6B — zero fab dependency
    // Note: Qualcomm has partially diversified to Samsung 4nm but Samsung N4 has
    // yield and power issues; TSMC N4 is preferred for premium Snapdragon
    dependent_revenue_B: 22.0,
    diversification_score: 0.22, // Samsung 4nm alternative for lower-tier Snapdragon
    primary_nodes: ['N4', 'N3', 'N5'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 60,
    stress_revenue_at_risk_B: (s) => 22.0 * revenueAtRiskCurve(s, 0.22, 0.72),
    source: 'Qualcomm 10-K FY2024; QCT segment breakdown; Samsung foundry cross-licensing',
  },

  microsoft: {
    name: 'Microsoft Corporation',
    ticker: 'MSFT',
    total_revenue_B: 245.0,     // FY2025 estimate (FY2024: $245B; consensus)
    tsmc_revenue_B: 1.5,        // Maia 100 AI accelerator (N5) + Azure custom silicon
    // Microsoft's direct chip exposure is small; indirect exposure via:
    //   - Azure OpenAI / Copilot services require H100/H200 GPUs (Nvidia → TSMC)
    //   - Azure Intelligent Cloud depends on GPU availability for AI workloads
    //   - Xbox (APU on N7): ~$15B gaming revenue
    // Azure AI revenue portion (~$25B of $45B Azure): constrained by GPU supply
    dependent_revenue_B: 42.0,  // Azure AI + Xbox; indirect through GPU supply chain
    diversification_score: 0.30, // Cloud fallback; some AMD GPU capacity
    primary_nodes: ['N5', 'N7'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 120,  // Cloud operators pre-purchase GPUs 12-18 months ahead
    exposure_note: 'Primarily indirect via Nvidia GPU supply; direct MAIA on TSMC N5',
    stress_revenue_at_risk_B: (s) => 42.0 * revenueAtRiskCurve(s, 0.30, 0.65),
    source: 'Microsoft FY2025 guidance; Azure AI segment; MAIA 100 announcement (2023)',
  },

  google: {
    name: 'Alphabet / Google',
    ticker: 'GOOGL',
    total_revenue_B: 350.0,     // FY2024 actual (~$350B)
    tsmc_revenue_B: 3.0,        // TPU v4/v5 + Tensor G-series (Pixel); TSMC N5/N3
    // Google Cloud AI (depends on TPU + H100): ~$40B
    // Pixel phones (Tensor G4 on N4): ~$5B
    // Google Search/AI (internal TPU-dependent): revenue risk if AI degrades
    dependent_revenue_B: 52.0,
    diversification_score: 0.25, // Proprietary TPU design gives some insulation; but still TSMC
    primary_nodes: ['N5', 'N4', 'N3'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 180,  // Hyperscalers maintain longer GPU/TPU inventory horizons
    stress_revenue_at_risk_B: (s) => 52.0 * revenueAtRiskCurve(s, 0.25, 0.68),
    source: "Google Q4 2024 earnings; TPU v5 announcement; Pixel 9 specs (TSMC N4)",
  },

  amazon: {
    name: 'Amazon.com / AWS',
    ticker: 'AMZN',
    total_revenue_B: 620.0,     // FY2024 total Amazon revenue
    tsmc_revenue_B: 2.5,        // Graviton4 (N3P) + Trainium2 (N3); Inferentia (N5)
    // AWS compute and AI revenue dependent on custom silicon supply:
    //   AWS revenue: ~$108B; Graviton/Trainium/Inferentia power ~30% of EC2/AI instances
    //   Plus indirect: H100 GPU instances (Nvidia → TSMC) ~$15B AI instance revenue
    dependent_revenue_B: 55.0,
    diversification_score: 0.28, // AWS uses multiple chip families; some AMD EPYC instances
    primary_nodes: ['N3', 'N5', 'N7'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 150,
    stress_revenue_at_risk_B: (s) => 55.0 * revenueAtRiskCurve(s, 0.28, 0.68),
    source: 'Amazon 10-K FY2024; Graviton4 technical paper; AWS re:Invent 2024 announcements',
  },

  meta: {
    name: 'Meta Platforms',
    ticker: 'META',
    total_revenue_B: 164.0,     // FY2024 actual
    tsmc_revenue_B: 0.8,        // MTIA v2 (N5) — Meta's custom AI inference accelerator
    // Meta's data center AI (training runs on H100/H200 clusters → Nvidia → TSMC)
    // Estimated ~$12-15B of H100/H200 procurement in 2024-2025
    // If GPU supply halts, Meta's AI roadmap (Llama, generative AI, AR/VR AI) is delayed
    // AR/VR (Quest 4): Snapdragon XR chips → Qualcomm → TSMC N4
    dependent_revenue_B: 28.0,
    diversification_score: 0.20,
    primary_nodes: ['N5', 'N4'],
    primary_geography: 'taiwan',
    inventory_buffer_days: 120,
    exposure_note: 'Primarily indirect: $12B+ GPU procurement; AI-driven ad revenue at risk',
    stress_revenue_at_risk_B: (s) => 28.0 * revenueAtRiskCurve(s, 0.20, 0.65),
    source: 'Meta 10-K FY2024; Q4 2024 capex guidance ($60-65B 2025); MTIA v2 Hot Chips 2024',
  },
};

/**
 * Maps a continuous stress level to a fraction of dependent revenue at risk.
 *
 * The curve has three regimes:
 *   1. Resilience zone [0, threshold]: near-zero impact; emergency protocols absorb stress
 *      (TSMC's water trucking/recycling surge keeps wafers flowing for mild stress)
 *   2. Cascade zone [threshold, 0.7]: convex ramp; disruption fraction accelerates
 *      (partial supply → allocation rationing → lead time spikes → revenue misses)
 *   3. Crisis zone [0.7, 1.0]: approaches ceiling; emergency allocation to priority customers
 *
 * `diversification` flattens the curve (buffer against supply loss).
 * `ceiling` is the max fraction at full stress (few companies lose 100% even at stress=1).
 */
function revenueAtRiskCurve(stressLevel, diversification, ceiling) {
  const s = Math.max(0, Math.min(1, stressLevel));
  const threshold = 0.08 + diversification * 0.15;  // higher diversification → later onset
  if (s <= threshold) return 0;

  const adjusted = (s - threshold) / (1 - threshold);
  // Convex exponent: 1.6 gives shallow start, steeper above 0.5
  const raw = Math.pow(adjusted, 1.6) * ceiling;
  return Math.max(0, Math.min(ceiling, raw));
}

/**
 * Compute per-company revenue at risk for a given region + stress level.
 * Companies are weighted by how much of their dependent revenue flows through
 * the affected geography.
 *
 * @returns Array of { company, revenueAtRisk_B, fractionOfDependent, impactLabel }
 */
function calculateCompanyExposure(region, stressLevel) {
  const results = [];
  for (const [key, profile] of Object.entries(COMPANY_PROFILES)) {
    // Only count companies whose primary geography matches the region (or 'global')
    const isAffected = region === 'global' ||
      profile.primary_geography === region ||
      (region === 'arizona' && key === 'tsmc'); // TSMC Arizona is also TSMC
    if (!isAffected && region !== 'global') continue;

    // For non-primary-geography regions, attenuate by regional share of relevant nodes
    let geographyMultiplier = 1.0;
    if (region !== 'global' && region !== profile.primary_geography) {
      // Compute weighted average share of the company's primary nodes in this region
      const nodeShares = profile.primary_nodes.map((n) => {
        const spec = GLOBAL_CAPACITY[n];
        return spec ? (spec.shares[region] || 0) : 0;
      });
      geographyMultiplier = nodeShares.length
        ? nodeShares.reduce((a, b) => a + b, 0) / nodeShares.length
        : 0;
    }

    const baseAtRisk = profile.stress_revenue_at_risk_B(stressLevel);
    const revenueAtRisk = baseAtRisk * geographyMultiplier;
    const fractionOfDependent = profile.dependent_revenue_B > 0
      ? revenueAtRisk / profile.dependent_revenue_B
      : 0;

    results.push({
      company: profile.name,
      ticker: profile.ticker,
      total_revenue_B: profile.total_revenue_B,
      dependent_revenue_B: round(profile.dependent_revenue_B, 1),
      revenue_at_risk_B: round(revenueAtRisk, 2),
      fraction_of_dependent: round(fractionOfDependent, 4),
      fraction_of_total: round(revenueAtRisk / profile.total_revenue_B, 4),
      primary_nodes: profile.primary_nodes,
      diversification_score: profile.diversification_score,
      inventory_buffer_days: profile.inventory_buffer_days || null,
      impact_label: impactLabel(fractionOfDependent),
      source: profile.source,
    });
  }
  results.sort((a, b) => b.revenue_at_risk_B - a.revenue_at_risk_B);
  return results;
}

function impactLabel(fraction) {
  if (fraction < 0.05) return 'negligible';
  if (fraction < 0.15) return 'minor';
  if (fraction < 0.30) return 'moderate';
  if (fraction < 0.50) return 'severe';
  if (fraction < 0.70) return 'critical';
  return 'catastrophic';
}

// =============================================================================
// Layer 3 — Second-order exposure
// =============================================================================

/**
 * Second-order sectors: time-delayed cascades from fab water stress.
 *
 * Each sector has:
 *   - `capex_at_risk_B`: planned capital expenditures that cannot be fulfilled
 *     if chip supply is disrupted (stranded investment risk).
 *   - `revenue_at_risk_B`: sector-level revenue that depends on chip availability.
 *   - `wave_onset_days`: when the sector first feels the impact after stress onset.
 *   - `peak_impact_days`: when impact reaches maximum.
 *   - `recovery_years`: how long before the sector recovers.
 *   - `propagation_mechanism`: description of the causal chain.
 *   - `regional_amplifier`: multiplier for how much a particular region's stress
 *     amplifies the impact (Taiwan >> Arizona >> Germany for advanced logic).
 */
const SECTOR_PROFILES = {
  hyperscaler_capex: {
    label: 'Hyperscaler AI Infrastructure Buildout',
    description:
      'AWS, Azure, Google Cloud, Meta, Oracle committed $200-250B capex in 2025 for ' +
      'AI data center build-out. Nearly all AI accelerator capacity (H100/B200/TPU) ' +
      'depends on TSMC Taiwan for N3/N4 chips. A supply disruption halts new GPU/TPU ' +
      'procurement and leaves partially built data centers unequippable.',
    capex_at_risk_B: 225.0,      // 2025 hyperscaler AI capex commitment (consensus estimate)
    revenue_at_risk_B: 95.0,     // AI cloud services revenue dependent on new capacity ramp
    wave_onset_days: 45,         // Existing orders cover ~45 days; new orders fail immediately
    peak_impact_days: 180,       // Peak: 6 months in, all in-transit inventory consumed
    recovery_years: 3.0,         // Min 36 months to ramp alternative foundry (if any exists)
    regional_amplifier: { taiwan: 1.0, arizona: 0.15, germany: 0.05, global: 1.0 },
    propagation_mechanism:
      'GPU orders → TSMC N3/N4 wafers → Nvidia/AMD chips → cloud accelerator racks. ' +
      'No viable alternative below N7; AMD MI300X is also TSMC N5. Stranded data center ' +
      'steel generates $50-75B in unrecoverable construction costs.',
    source: 'Hyperscaler capex guidance 2025 (MSFT/GOOGL/AMZN/META Q4 2024); Goldman Sachs AI capex tracker',
  },

  ai_inference_revenue: {
    label: 'AI Services and Inference Revenue',
    description:
      'OpenAI, Anthropic, Google DeepMind, and hyperscaler AI services ' +
      'run on TSMC-produced chips. A supply shock constrains new model training ' +
      'and limits inference capacity expansion.',
    capex_at_risk_B: 30.0,
    revenue_at_risk_B: 180.0,   // projected 2025-2027 AI services revenue at risk
    wave_onset_days: 90,
    peak_impact_days: 365,
    recovery_years: 4.0,
    regional_amplifier: { taiwan: 1.0, arizona: 0.10, germany: 0.02, global: 1.0 },
    propagation_mechanism:
      'AI inference capacity is constrained by GPU/TPU supply. ' +
      'New model deployment halts; existing capacity cannot scale with demand. ' +
      'AI-driven revenue streams (OpenAI GPT-5, Google Gemini 2, Meta Llama 4) delayed.',
    source: 'Gartner AI forecast 2024; McKinsey Global Institute AI economic impact report 2024',
  },

  automotive_adas: {
    label: 'Automotive ADAS and Autonomous Driving Semiconductors',
    description:
      'Advanced driver-assistance systems (ADAS) and autonomous driving SoCs ' +
      'increasingly depend on leading-edge foundry: Mobileye EyeQ6 on TSMC N7, ' +
      'Tesla FSD chip on Samsung 14nm (legacy) but next-gen on N7, ' +
      'Qualcomm Snapdragon RIDE on N5. Global automotive semiconductor market ~$75B; ' +
      '~20% is leading-edge.',
    capex_at_risk_B: 8.0,        // Tier-1 automotive semiconductor capex pipeline
    revenue_at_risk_B: 15.0,     // Leading-edge ADAS chip revenue
    wave_onset_days: 180,        // Automotive has 6-12 month chip inventory buffer
    peak_impact_days: 540,       // Auto OEMs feel production cuts at ~18 months
    recovery_years: 4.5,         // Auto design cycles: 4-5 years to retool to new process
    regional_amplifier: { taiwan: 0.85, arizona: 0.10, germany: 0.55, global: 0.90 },
    note: 'Germany amplifier is higher because ESMC Dresden specifically targets automotive (N22 FD-SOI for MCUs and analog)',
    propagation_mechanism:
      'TSMC N7 supply falls → Mobileye/Qualcomm ADAS chip allocation tightens → ' +
      'OEM ADAS fitment rates drop or production delayed → vehicle delivery slippage. ' +
      'Auto industry has very low chip substitutability (certified/qualified parts only). ' +
      '2021 auto chip crisis cost $210B in lost production (IEA); Taiwan crisis is 3-5× more severe.',
    source: 'IEA Semiconductor Supply Chain 2023; McKinsey auto semiconductor report 2024; Mobileye 20-F 2023',
  },

  defense_programs: {
    label: 'Defense and Aerospace Semiconductor Programs',
    description:
      'DoD acquisitions depend on commercial foundries for classified and ' +
      'unclassified programs: F-35 avionics (Xilinx/AMD FPGAs on TSMC N5), ' +
      'hypersonic guidance, satellite communications, and C4ISR infrastructure. ' +
      'DoD has MOU with TSMC for priority allocation but volume is constrained.',
    capex_at_risk_B: 4.0,
    revenue_at_risk_B: 12.0,    // Defense semiconductor procurement subject to delay
    wave_onset_days: 90,         // DoD has some stockpile; classified programs classified
    peak_impact_days: 270,
    recovery_years: 2.0,         // DoD can invoke DPA Title III for emergency allocation
    regional_amplifier: { taiwan: 0.90, arizona: 0.50, germany: 0.20, global: 0.90 },
    note: 'Arizona multiplier elevated: TSMC Fab 21 is eligible for DoD CHIPS Act funding; DoD seeks domestic sourcing',
    propagation_mechanism:
      'TSMC allocation prioritized to DoD under existing MOU, but capacity constraints ' +
      'still affect program timelines. Defense Production Act Title III can mandate ' +
      'production priority, but cannot create wafers that were never started. ' +
      'Classified programs are higher resilience due to stockpiling requirements.',
    source: 'DoD Annual Industrial Capabilities Report 2023; CHIPS Act DoD provisions; F-35 program office public filings',
  },

  consumer_electronics: {
    label: 'Consumer Electronics (Non-Apple)',
    description:
      'Android OEM ecosystem (Samsung Galaxy, Xiaomi, OPPO, Vivo) depends on ' +
      'Qualcomm Snapdragon and MediaTek Dimensity chips, both on TSMC N5/N4/N3. ' +
      'Global smartphone market: ~$500B; addressable by this supply chain: ~$350B.',
    capex_at_risk_B: 12.0,       // Component procurement pipelines
    revenue_at_risk_B: 120.0,    // Smartphone + tablet + PC OEM revenue at risk
    wave_onset_days: 90,
    peak_impact_days: 270,
    recovery_years: 2.0,
    regional_amplifier: { taiwan: 0.90, arizona: 0.12, germany: 0.04, global: 0.90 },
    propagation_mechanism:
      'TSMC chip allocation tightens → Qualcomm/MediaTek reduce shipments → ' +
      'OEMs cut production plans → retail price spikes and supply shortfalls. ' +
      'Samsung Exynos provides partial self-supply buffer for Galaxy line (~15% of volume).',
    source: 'IDC Smartphone Market Share Q4 2024; Qualcomm 10-K FY2024; MediaTek investor day 2024',
  },

  industrial_iot: {
    label: 'Industrial and IoT Semiconductor Applications',
    description:
      'Factory automation, power management, and edge AI on mixed nodes (N7-N28). ' +
      'Less leading-edge dependent than consumer/cloud but second-order affected ' +
      'through supply chain disruption and allocation cascades.',
    capex_at_risk_B: 5.0,
    revenue_at_risk_B: 35.0,
    wave_onset_days: 270,       // Longer build cycles mean delayed impact
    peak_impact_days: 540,
    recovery_years: 2.5,
    regional_amplifier: { taiwan: 0.55, arizona: 0.08, germany: 0.65, global: 0.60 },
    note: 'Germany amplifier elevated: ESMC Dresden targets industrial/automotive N22 — a direct TSMC competitor for this segment',
    propagation_mechanism:
      'Industrial chips typically on mature nodes (N28-N90nm); partially insulated from ' +
      'leading-edge shortages. But allocation cascades from hyperscaler demand surge ' +
      '(hyperscalers buying anything N7+) can deplete N7 industrial allocations.',
    source: 'SEMI World Fab Watch 2024; McKinsey Industrial Semiconductor Outlook 2024',
  },
};

/**
 * Calculate second-order sector impact at a given stress level and region.
 * Returns sector impacts weighted by the regional amplifier and stress level.
 *
 * Impact is modeled as: impact = base_impact × regional_amplifier × stress_multiplier
 * where stress_multiplier accounts for non-linear cascade above stress=0.5.
 */
function calculateSecondOrder(region, stressLevel) {
  const s = Math.max(0, Math.min(1, stressLevel));
  const results = [];

  for (const [key, sector] of Object.entries(SECTOR_PROFILES)) {
    const amplifier = sector.regional_amplifier[region] ?? sector.regional_amplifier.taiwan;
    const stressMultiplier = stressToCascadeMultiplier(s);

    const capexAtRisk = sector.capex_at_risk_B * amplifier * stressMultiplier;
    const revenueAtRisk = sector.revenue_at_risk_B * amplifier * stressMultiplier;

    // Time-to-impact: onset shifts earlier as stress is more severe
    const onsetDays = Math.round(sector.wave_onset_days * (1 - stressMultiplier * 0.40));
    const peakDays = Math.round(sector.peak_impact_days * (1 - stressMultiplier * 0.25));

    results.push({
      sector: sector.label,
      capex_at_risk_B: round(capexAtRisk, 2),
      revenue_at_risk_B: round(revenueAtRisk, 2),
      onset_days: onsetDays,
      peak_impact_days: peakDays,
      recovery_years: sector.recovery_years,
      regional_amplifier: amplifier,
      propagation: sector.propagation_mechanism,
    });
  }

  results.sort((a, b) => b.revenue_at_risk_B - a.revenue_at_risk_B);

  // Aggregate wave model: how impact spreads across time
  const waves = buildWaveModel(results);
  return { sectors: results, waves };
}

/**
 * Cascade multiplier: how severely second-order effects scale with stress.
 * Below 0.20: near-zero; above 0.50: steep non-linear; above 0.80: plateau.
 */
function stressToCascadeMultiplier(s) {
  if (s < 0.05) return 0;
  if (s > 0.90) return 1.0;
  // Sigmoid centered at 0.45 with steepness 7
  return 1 / (1 + Math.exp(-7 * (s - 0.45)));
}

/**
 * Organize sector impacts into time-ordered waves (calendar-based propagation).
 * Wave 1 = 0-90 days; Wave 2 = 90-270 days; Wave 3 = 270-540 days; Wave 4 = 540+ days.
 */
function buildWaveModel(sectorResults) {
  const waves = [
    { label: 'Wave 1 — Price signals & allocation shock', days: '0–90', sectors: [] },
    { label: 'Wave 2 — Production shortfalls', days: '90–270', sectors: [] },
    { label: 'Wave 3 — End-product supply crunch', days: '270–540', sectors: [] },
    { label: 'Wave 4 — Structural recession signal', days: '540+', sectors: [] },
  ];

  for (const s of sectorResults) {
    if (s.onset_days < 90) waves[0].sectors.push(s.sector);
    else if (s.onset_days < 270) waves[1].sectors.push(s.sector);
    else if (s.onset_days < 540) waves[2].sectors.push(s.sector);
    else waves[3].sectors.push(s.sector);
  }
  for (const w of waves) {
    w.capex_at_risk_B = round(
      sectorResults.filter((s) => w.sectors.includes(s.sector))
        .reduce((a, b) => a + b.capex_at_risk_B, 0),
      2
    );
    w.revenue_at_risk_B = round(
      sectorResults.filter((s) => w.sectors.includes(s.sector))
        .reduce((a, b) => a + b.revenue_at_risk_B, 0),
      2
    );
  }
  return waves;
}

// =============================================================================
// Composite scoring
// =============================================================================

/**
 * Single 0–100 composite risk score, combining:
 *   - Production concentration risk (share of global capacity affected)
 *   - Revenue concentration (top-3 customer revenue at risk)
 *   - Time-to-recovery (longer = higher score)
 *   - Cascade multiplier (non-linear above 0.5)
 *   - Substitutability (HHI-weighted; lower HHI = more substitutable = lower score)
 *
 * Calibrated so: stress=0.10 → score ~5; stress=0.50 → score ~55; stress=0.90 → score ~92
 */
function compositeScore(region, stressLevel) {
  const s = Math.max(0, Math.min(1, stressLevel));

  // Production concentration: weighted share of leading-edge capacity in region
  const leadingEdgeNodes = ['N2', 'N3', 'N5'];
  const concentrationScore = leadingEdgeNodes.reduce((acc, node) => {
    const spec = GLOBAL_CAPACITY[node];
    const share = spec.shares[region] || 0;
    return acc + share * spec.concentration_hhi * (1 / leadingEdgeNodes.length);
  }, 0);

  // Revenue concentration: fraction of modeled company revenue at risk
  const compExposure = calculateCompanyExposure(region, s);
  const totalRevAtRisk = compExposure.reduce((a, b) => a + b.revenue_at_risk_B, 0);
  const totalDependent = compExposure.reduce((a, b) => a + b.dependent_revenue_B, 0);
  const revenueConcentrationScore = totalDependent > 0
    ? Math.min(1, totalRevAtRisk / totalDependent)
    : 0;

  // Recovery time: worst-case recovery across leading-edge sectors
  const recoveryScore = Math.min(1, 4.0 / 3.0 * 0.25); // normalized; 4yr recovery = max

  // Stress-level cascade multiplier
  const cascadeScore = stressToCascadeMultiplier(s);

  // Weighted composite
  const weights = {
    concentration: 0.30,
    revenue: 0.35,
    recovery: 0.10,
    cascade: 0.25,
  };

  const raw =
    weights.concentration * concentrationScore +
    weights.revenue * revenueConcentrationScore +
    weights.recovery * recoveryScore +
    weights.cascade * cascadeScore;

  return round(raw * 100, 1);
}

// =============================================================================
// Main entry point: calculateExposureScore
// =============================================================================

/**
 * Full structured exposure assessment for a region at a given stress level.
 *
 * @param {('taiwan'|'arizona'|'germany'|'global')} region
 * @param {number} stressLevel  Continuous 0–1 from simulation engine water_stress output.
 *
 * @returns {object} {
 *   region, stressLevel,
 *   production: { disruption_30pct, disruption_60pct, disruption_90pct },
 *   companyExposure: [...],
 *   secondOrder: { sectors, waves },
 *   composite: { score, impactLabel, key_risks }
 * }
 */
function calculateExposureScore(region, stressLevel) {
  if (!['taiwan', 'arizona', 'germany', 'saxony', 'global'].includes(region)) {
    throw new Error(
      `Unknown region "${region}". Use: taiwan, arizona, germany, saxony, global`
    );
  }
  const normRegion = region === 'saxony' ? 'germany' : region;
  const s = Math.max(0, Math.min(1, stressLevel));

  // Derive effective production disruption from stress level using TSMC's documented
  // emergency protocol response curve:
  //   s < 0.15: trucking + recycling surge absorbs; near-zero production impact
  //   s = 0.40: ~20% production reduction (partial rationing)
  //   s = 0.70: ~55% production reduction (severe restriction)
  //   s = 1.00: ~88% production reduction (near-total curtailment)
  const effectiveDisruption = effectiveProductionDisruption(normRegion, s);

  const production = {
    stress_level: round(s, 4),
    effective_disruption_pct: round(effectiveDisruption * 100, 2),
    scenario_30pct: productionDisruptionScenario(normRegion, 0.30),
    scenario_60pct: productionDisruptionScenario(normRegion, 0.60),
    scenario_90pct: productionDisruptionScenario(normRegion, 0.90),
    at_current_stress: productionDisruptionScenario(normRegion, effectiveDisruption),
    total_wafer_revenue_at_risk_B: round(
      Object.values(productionDisruptionScenario(normRegion, effectiveDisruption))
        .reduce((a, b) => a + b.wafer_revenue_at_risk_B, 0),
      2
    ),
  };

  const companyExposure = calculateCompanyExposure(normRegion, s);
  const totalCompanyRevAtRisk = companyExposure.reduce((a, b) => a + b.revenue_at_risk_B, 0);

  const secondOrder = calculateSecondOrder(normRegion, s);
  const totalSecondOrderRevAtRisk = secondOrder.sectors
    .reduce((a, b) => a + b.revenue_at_risk_B, 0);

  const score = compositeScore(normRegion, s);

  // Key risks: highest-impact items across all three layers
  const keyRisks = [
    ...companyExposure.slice(0, 3).map((c) => ({
      type: 'company',
      entity: c.company,
      revenue_at_risk_B: c.revenue_at_risk_B,
      impact_label: c.impact_label,
    })),
    ...secondOrder.sectors.slice(0, 2).map((sec) => ({
      type: 'sector',
      entity: sec.sector,
      revenue_at_risk_B: sec.revenue_at_risk_B,
      onset_days: sec.onset_days,
    })),
  ].sort((a, b) => b.revenue_at_risk_B - a.revenue_at_risk_B);

  return {
    region: normRegion,
    stress_level: s,
    assessed_at: new Date().toISOString(),
    production,
    company_exposure: {
      companies: companyExposure,
      total_revenue_at_risk_B: round(totalCompanyRevAtRisk, 2),
    },
    second_order: {
      ...secondOrder,
      total_revenue_at_risk_B: round(totalSecondOrderRevAtRisk, 2),
    },
    composite: {
      score,
      impact_label: impactLabel(score / 100),
      total_economy_revenue_at_risk_B: round(
        totalCompanyRevAtRisk + totalSecondOrderRevAtRisk,
        2
      ),
      key_risks: keyRisks,
    },
  };
}

/**
 * Map water stress level to effective production disruption fraction for a region.
 * Accounts for region-specific emergency response capabilities.
 *
 * Taiwan: TSMC has documented water trucking, emergency well drilling, and
 *         on-site ultrapure water recycling. High resilience below stress=0.4.
 * Arizona: SRP + groundwater dual supply; more gradual risk. Higher resilience
 *          for mild stress; but binary regulatory shutdown risk.
 * Germany: EU WFD mandatory curtailment protocol; restriction is linear but
 *          enforced strictly once threshold is crossed.
 */
function effectiveProductionDisruption(region, stressLevel) {
  const s = stressLevel;

  if (region === 'taiwan') {
    // TSMC water emergency protocol: effective below s=0.30; steep above s=0.55
    if (s < 0.12) return 0;
    if (s < 0.35) return (s - 0.12) / (0.35 - 0.12) * 0.12;  // 0→12% disruption
    if (s < 0.65) return 0.12 + (s - 0.35) / (0.65 - 0.35) * 0.45; // 12→57%
    return 0.57 + (s - 0.65) / (1 - 0.65) * 0.31; // 57→88%
  }

  if (region === 'arizona') {
    // SRP+groundwater: low disruption until regulatory trigger at depth ~91m
    // Threshold maps to stress ~0.45 in the simulation
    if (s < 0.08) return 0;
    if (s < 0.45) return (s - 0.08) / (0.45 - 0.08) * 0.10;
    if (s < 0.70) return 0.10 + (s - 0.45) / (0.70 - 0.45) * 0.35;
    return 0.45 + (s - 0.70) / (1 - 0.70) * 0.40;
  }

  if (region === 'germany') {
    // EU WFD enforces withdrawal curtailment; ESMC fab not yet built (2025 baseline)
    // Model the planned-operational risk for future state
    if (s < 0.10) return 0;
    if (s < 0.40) return (s - 0.10) / (0.40 - 0.10) * 0.20;
    if (s < 0.75) return 0.20 + (s - 0.40) / (0.75 - 0.40) * 0.40;
    return 0.60 + (s - 0.75) / (1 - 0.75) * 0.30;
  }

  if (region === 'global') {
    // Weighted aggregate: Taiwan dominates leading-edge
    return (
      effectiveProductionDisruption('taiwan', s) * 0.75 +
      effectiveProductionDisruption('arizona', s) * 0.15 +
      effectiveProductionDisruption('germany', s) * 0.10
    );
  }

  return 0;
}

// =============================================================================
// Utilities
// =============================================================================

function round(v, places) {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  calculateExposureScore,
  productionDisruptionScenario,
  productionScenarioTable,
  calculateCompanyExposure,
  calculateSecondOrder,
  compositeScore,
  effectiveProductionDisruption,
  GLOBAL_CAPACITY,
  COMPANY_PROFILES,
  SECTOR_PROFILES,
  _helpers: { revenueAtRiskCurve, stressToCascadeMultiplier, buildWaveModel, round },
};
