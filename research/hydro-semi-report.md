# Hydrological Stress as a Systemic Risk in Semiconductor Supply Chains
## A Complexity Collapse Perspective

**Project:** Cascade Hydro-Semiconductor Risk Engine  
**Version:** 1.1 — Validated &amp; Closed  
**Date:** June 2026  
**Status:** Thesis tested — tradeable claim NOT supported (see Validation Update)  

---

## 0. Validation Update — June 2026 (read this first)

> The body of this document below makes a bullish case: that water stress is a "grossly
> underpriced" systemic risk and that an "early-warning window for pre-positioning is open."
> **We subsequently put that claim through a proper validation gauntlet, and it did not survive.**
> This note records the honest result; the original thesis is preserved below as written, for transparency.
>
> **What held up:**
> - The reservoir early-warning model is *real*. On 16 years of strictly causal walk-forward testing it
>   anticipated all 6 severe Taiwan droughts, its probabilities are well-calibrated, and it beats a
>   seasonal-null model ~4.5×.
>
> **What did not:**
> - The "critical slowing down" indicators — the document's intellectual centerpiece — add essentially
>   nothing over hydrological state, season, and ENSO.
> - **The water→equity link is not in the price record.** An event study on the exposed names across the
>   6 real droughts found they *rose* +3.8% vs the semi sector afterward (the short thesis wanted them to
>   fall); a thesis-structured long-short book *lost* ~8.9% over the following 6 months. Reason: TSMC keeps
>   output near-full through droughts via trucking, 86% recycling, and growing desalination — so the
>   feared curtailment, and its market impact, never arrives.
> - The contrarian flip (buy the drought scare) also fails: a permutation test (p=0.97) shows entering at
>   a *random* month beat drought entry; the apparent gain was just basket beta.
>
> **Conclusion:** Cascade is a *calibrated reservoir-stress monitor*, not a validated source of equity
> alpha. The dollar-at-risk figures below are illustrative model outputs, not evidence of a market
> mispricing. The project's real output is the disciplined apparatus that disproved its own thesis before
> any capital was committed. Full validation is on the dashboard's *Model &amp; validation* tab.

---

## 1. Executive Summary

Advanced semiconductor fabrication is one of the most water-intensive industrial processes on earth, yet the water dependency of the global chip supply chain is almost entirely absent from standard financial risk models. TSMC alone withdrew 156 million tonnes of water in 2022 — roughly the volume of 62,000 Olympic swimming pools — to produce wafers at nodes where it is the sole commercial-scale provider globally. More than 93% of all sub-5nm wafer capacity is concentrated in Taiwan and, to a lesser degree, Arizona: two geographies facing structural hydrological stress whose long-run trajectories are poorly reflected in semiconductor equity prices or supply-chain risk frameworks. The core thesis of this research is that this constitutes a quantifiable, slow-moving, and grossly underpriced systemic risk — not a tail event but a probability-weighted outcome whose onset will be nonlinear and whose market impact will be disproportionate to the apparent severity of the physical trigger.

The mispricing has a structural cause. Equity markets reprice water risk only after production disruptions are confirmed, by which point the repricing is reactive and partial. The 2021 Taiwan drought — the worst in 56 years — demonstrated that TSMC can maintain near-full utilization through extraordinary emergency measures (water trucking, accelerated recycling, temporary sourcing from distant watersheds) that absorb most of the visible signal while accumulating invisible fragility. Investors saw near-zero production impact and drew the wrong conclusion: that the system is resilient. What the episode actually demonstrated is that the resilience buffer is expensive, finite, and degrading. Each iteration of the crisis leaves the system more brittle. Complexity science is explicit about what happens next: dynamical systems approaching a critical threshold do not fail gradually. They collapse. And they leave fingerprints in their pre-collapse statistics — rising variance, rising lag-1 autocorrelation, declining return rate — that are detectable before the transition if you are looking for them.

The Cascade simulation engine implements an early-warning signal (EWS) framework across three coupled hydrological systems (Taiwan, Arizona, Saxony) and connects it to a financial exposure model calibrated from public company filings. At current parameterization, the model finds total economic revenue at risk of $161B under mild-stress scenarios (stress index 0.30), rising to $272–$401B across the primary concern band (stress 0.40–0.50), and exceeding $530B at critical levels (stress 0.60). Apple, Nvidia, TSMC, Amazon, and Google collectively face over $178B in directly traceable revenue at risk under a stress-0.60 scenario — a number that does not yet appear in any of their standard risk disclosures. As of June 2026, the Taiwan system is in a watchful-but-stable regime: reservoirs above crisis thresholds but La Niña conditions developing in the Pacific, the same meteorological precursor that preceded the 2021 event. The model's EWS indicators show a moderate upward trend in AR1 for Taiwan reservoir storage, and Kendall's τ for variance has crossed the 0.50 flagging threshold. No production disruption is imminent. The early-warning window — the interval during which pre-positioning is possible — is open.

---

## 2. The Physical System: Water in Semiconductor Fabrication

### 2.1 Why Advanced Fabs Require Water at Industrial Scale

Semiconductor fabrication at the 3nm and 2nm nodes involves hundreds of sequential process steps — deposition, lithography, etching, planarization, cleaning — each of which requires ultrapure water (UPW) as the primary cleaning and process medium. The functional specification for UPW in leading-edge fabrication is among the most demanding in any industry:

| Parameter | Required Specification |
|-----------|----------------------|
| Resistivity | ≥ 18.2 MΩ·cm (theoretical maximum at 25°C) |
| Total organic carbon (TOC) | < 1 part per billion |
| Dissolved oxygen | < 10 ppb |
| Particle count | < 0.01 particles/mL at > 0.05 μm |
| Bacterial endotoxin | < 0.001 EU/mL |
| Dissolved silica | < 1 ppb |

These specifications are not aspirational — they are hard process requirements. Particulate contamination in resist lithography or chemical mechanical planarization (CMP) at the sub-5nm node translates directly to die yield loss. A single particle at the wrong location destroys a die worth $50–$200 in ASP. UPW production from municipal or groundwater feedstock requires multi-stage reverse osmosis, UV oxidation, and electrodeionization, all requiring energy and generating reject brine that must be managed separately.

The volume required is enormous. The Cascade model calibrates the two main TSMC fab clusters at 78,000 m³/day (Hsinchu, serving N180 through N5) and 118,000 m³/day (Tainan/Southern Taiwan Science Park, serving N28 through N3 EUV). These are gross withdrawal figures; TSMC reports a water recycle rate of 86%, making net consumption approximately 27,440 m³/day — still equivalent to the daily residential water use of roughly 180,000 people. Per-wafer gross consumption for N3 works out to approximately 33 m³ per 300mm wafer start, or 4.6 m³ after recycling. At N5/N4 nodes where EUV multi-patterning requires additional cleaning cycles, the per-wafer figure is higher.

### 2.2 Why Water Cannot Be Substituted or Compressed

There is a widespread assumption in supply-chain risk analysis that water stress in semiconductor fabrication is manageable through recycling technology improvements or alternative feedstocks. This assumption is correct in the long run (decades) and nearly useless in the medium term (the risk horizon that matters for investors).

Three structural constraints limit rapid adaptation:

**Recycle rate ceiling.** TSMC's 86% recycle rate as of 2022 already represents a decade of intensive investment. The marginal cost of each additional percentage point of recycle rate rises steeply because the remaining fraction is the most chemically contaminated and hardest to regenerate. The physics of reverse osmosis membranes — fouling rates, thermodynamic efficiency limits — impose a practical ceiling around 88–91% for the current process mix. Moving from 86% to 90% buys approximately 4% more water at the margin; it does not change the fundamental constraint.

**Process chemistry lock-in.** Each successive node generation requires the introduction of new process chemicals — high-κ dielectrics, novel resist formulations, new CMP slurries — that interact differently with water treatment systems. Optimizing for one generation's chemistry sometimes degrades recycling efficiency for the introduced chemistry. There is a continuous treadmill: as process nodes advance, new contamination challenges appear.

**Water quality vs. quantity.** During a drought event, the constraint is not only total volume but feedstock water quality. Low-reservoir conditions concentrate sediment, algae, and dissolved minerals in source water, which increases treatment load, membrane fouling rates, and reject brine volumes. The crisis is circular: less water forces more aggressive treatment of worse-quality source water, which consumes more water to produce the same UPW output.

### 2.3 The 2021 Taiwan Drought: A Stress Test the System Only Narrowly Passed

The 2020–2021 Taiwan drought is the most significant stress event in the history of modern semiconductor manufacturing and the primary calibration anchor for the Cascade model.

In 2020, for the first time since 1964, no typhoon made landfall on Taiwan. Typhoons are not merely an inconvenience — they are the primary recharge mechanism for Taiwan's mountain reservoirs, delivering 25–40% of annual precipitation in concentrated events. Without them, the Shimen reservoir (309 MCM capacity; primary source for Hsinchu Science Park and TSMC's 7/5nm nodes at the time) and Zengwen reservoir (708 MCM; the sole source for Tainan's Fab 18 EUV complex) experienced a continuous 18-month drawdown with no winter replenishment. By April 2021, Shimen had reached 15.3 MCM — **4.9% of design capacity**. Zengwen reached 30 MCM — **4.2% of capacity**. Rainfall anomaly across the affected basins was approximately −82% below seasonal normal.

The Taiwan government implemented a cascade of water use restrictions. Agricultural deliveries were suspended first. Industrial users were placed on 2-day-per-week water delivery cycles. TSMC, operating under priority water agreements, was not formally rationed but faced acute sourcing constraints. The company's response included:

- Emergency water trucking from Taichung (outside the water-stressed basins) at approximately 10–15× normal per-unit cost
- Accelerated deployment of a closed-loop water recycle system at Fab 18, pushing recycle rates temporarily to 93%+
- Negotiation of emergency desalination capacity contracts
- Direct water procurement reported at NTD $11 million in Q1–Q2 2021 (approximately $380,000 USD at prevailing exchange rates — reflecting trucking costs alone, not extraordinary capital expenditure)

The outcome: TSMC maintained above 95% utilization throughout the crisis. The semiconductor industry called this a resilience success story. That conclusion is a mismeasurement. What actually happened is that TSMC spent its emergency reserve. The recycle system was already at the practical ceiling. The trucking network is not scalable to a longer or more geographically widespread drought. If the same event had persisted another six months, or if both reservoir basins had been simultaneously affected with equal severity, the measures available in 2021 would have been insufficient.

The crisis also revealed the absence of any meaningful supply-side buffer. There is no alternative foundry capable of producing N5 or N3 wafers at commercial volume. TSMC's customer base — Apple, Nvidia, AMD, Qualcomm — had no fallback option. The 2021 event was a near-miss with a consequence tree that markets did not price: a single additional typhoon-less year would have moved the system across the threshold from "managed crisis" to "production interruption."

---

## 3. The Three Geographies

### 3.1 Taiwan: Monsoon-Dependent Reservoir System

**Configuration.** Taiwan's semiconductor water system is fundamentally a monsoon-reservoir system: a small number of large reservoirs collect typhoon-season rainfall and discharge it year-round to industrial, municipal, and agricultural consumers. There is no meaningful groundwater buffer (Taiwan's geology is unfavorable for large aquifer development) and no desalination infrastructure at industrial scale. The entire advanced semiconductor supply chain — effectively all sub-5nm wafer starts globally — depends on two reservoir systems:

- **Shimen Reservoir** (Taoyuan/Hsinchu region): 309 MCM capacity; feeds Hsinchu Science Park where TSMC operates Fabs 2, 3, 5, 6, 8, 12, and 15.
- **Zengwen Reservoir** (Tainan region): 708 MCM capacity — the largest reservoir in Taiwan; feeds Southern Taiwan Science Park where TSMC operates Fabs 14 (N28/N20) and 18 (N7/N5/N3 EUV, the most advanced fab on earth).

**Current status (June 2026).** Post-2021 recovery has been aided by normal-to-above-normal typhoon seasons in 2022–2024, with Typhoon Krathon (October 2024) delivering significant rainfall to southern Taiwan and substantially recovering Zengwen. Combined fill is estimated at 65–80% based on Taiwan WRA data through Q4 2025. This is above the 50% catalyst threshold but well within the historical envelope of drought vulnerability.

**Trend direction.** Concerning. La Niña conditions were monitored developing in the Pacific through late 2025, with NOAA CPC issuing a La Niña Watch in Q4 2025 and transitioning to a La Niña Advisory in Q1 2026. La Niña suppresses North Pacific typhoon tracks and reduces Taiwan precipitation in the critical typhoon season (June–October). The 2020–2021 drought was associated with La Niña. If ENSO conditions persist through the 2026 typhoon season, the probability of sub-50% combined reservoir fill entering winter 2026–2027 is materially elevated.

**Structural vulnerability.** TSMC's geographic concentration is irreversible on any relevant policy timescale. While TSMC Fab 21 in Arizona represents the first meaningful geographic diversification at the 4nm node, Arizona produces zero N3 or N2 capacity. Fab 21 Phase 2 (N2) is planned for approximately 2027–2028. Meanwhile, TSMC's Taiwan capacity is expanding to meet AI accelerator demand: N3 throughput is ramping toward 130,000 wspm and N2 is scaling through 2026. The absolute volume of water at risk is growing even as geographic concentration persists.

**Historical stress events:**
- 2002–2003: Typhoon deficit led to reservoir drawdown; industrial restrictions implemented.
- 2015: Water rationing during dry season; Shimen at ~25%.
- 2020–2021: Crisis event. Shimen 4.9%, Zengwen 4.2%; near-miss production event (described in §2.3 above).

---

### 3.2 Arizona: Over-Allocated Desert Aquifer System

**Configuration.** TSMC Fab 21, located in north Phoenix (Deer Valley), is Arizona's first leading-edge fab and the only U.S. facility capable of producing N4P wafers at commercial scale. It depends on a layered water system characteristic of Phoenix metro: surface water delivered by the Salt River Project (SRP) and the Central Arizona Project (CAP — Colorado River allocation), supplemented by Phoenix Active Management Area (Phoenix AMA) groundwater. SRP delivers reliable but volume-constrained reservoir water from the Tonto-Salt watershed. CAP delivers Colorado River water subject to USBR shortage declarations.

**Current status (June 2026).** Tier 1 shortage on the Colorado River has persisted since the 2021 USBR declaration. A wet winter in 2022–2023 partially restored Lake Mead, reducing the shortage tier in 2024, but the lake has been trending below Tier 1 thresholds again through 2025. Fab 21 Phase 1 (N4P) came online in December 2024 and is drawing approximately 0.006 MCM/day (1.6 million gallons/day) from the local water system. Phoenix AMA groundwater depth is estimated at approximately 77–78m, above the model baseline of 76m, consistent with a depletion rate of 0.7–1.0 m/year calibrated to ADWR monitoring data.

**Trend direction.** Structurally deteriorating. The Colorado River basin has been in overallocation since the 1922 Colorado River Compact, which assumed mean flows of ~16.4 MAF/year. Actual 20th-century mean flow was 14.6 MAF and has declined further in the 21st century to approximately 12.3 MAF (2000–2022 mean), driven by temperature-driven evapotranspiration and aridification. Demand has not decreased. Arizona's Tier 2 shortage (21% CAP cut) does not constrain Fab 21 directly due to SRP's senior water rights and ADWR's industrial priority provisions — but it signals the long-term trajectory toward conditions where all sources are stressed simultaneously.

The critical long-run risk is groundwater. The Phoenix AMA regulatory trigger (100-year safe-yield compliance review under the Arizona Groundwater Management Act) activates at 91m depth. At 0.7–1.0 m/year depletion and a baseline of 76m, this trigger is approximately 15–21 years out on current trajectory. However, the addition of Fab 21 Phase 2 (adding 0.019 MCM/day demand in ~2027) and potential Phase 3 expansion (discussed but not announced) could meaningfully accelerate this timeline.

**Historical stress events:**
- 2021: USBR declared first-ever Tier 1 shortage on Colorado River.
- 2022: Tier 2 shortage; CAP deliveries cut 21%; Lake Mead fell to 1,040 ft — nearest to Tier 3 threshold (1,000 ft) in recorded history.
- 2023: Tier 2 persisted; partial Lake Mead recovery from above-average Sierra snowpack.
- 2024: Tier 1 shortage active; Fab 21 Phase 1 construction completing.

---

### 3.3 Saxony/Dresden: Rain-Shadow River Basin

**Configuration.** The European Semiconductor Manufacturing Company (ESMC) — a joint venture of TSMC (51%), Infineon, and NXP Semiconductors — is constructing a 300mm EUV-capable fab in Dresden, Germany, targeting the N22FDX and future nodes for European automotive and industrial markets. The Dresden fab will depend on the Elbe River for water supply, drawing from city utility infrastructure that ultimately sources the Elbe. Dresden's Elbe station (Augustusbrücke gauge, ID 501060) is the primary monitoring point; mean annual discharge is 330 m³/s (28.5 MCM/day).

**Current status (June 2026).** ESMC construction is ongoing. No semiconductor water demand exists yet; first wafer targets are 2027–2028. Current risk is structural and forward-looking, not operational. However, the Elbe's long-run flow trend is declining: the 2018 drought set all-time low records at 50 m³/s (4.32 MCM/day), driven by a Palmer Drought Severity Index of approximately −4.5 across the Elbe basin — the driest conditions in the instrumental record. Similar drought events are projected to become more frequent under RCP4.5/8.5 climate scenarios.

**Trend direction.** Declining over decadal timescales. Annual mean Elbe discharge at Dresden has fallen from a 20th-century average of approximately 340 m³/s to 300–310 m³/s in recent years, consistent with increased evapotranspiration from central European warming (+1.8°C over the basin since 1960). The summer low-flow period (July–September) has become more extreme: days below the ecological minimum flow (100 m³/s, 8.64 MCM/day) have increased from 8 days/year in 1960 to approximately 19 days/year in 2010–2023.

**Specific vulnerability.** The Elbe system has a structural weakness that distinguishes it from Taiwan's reservoir system: there is essentially no storage buffer. Dresden sits on a run-of-river stretch; the upstream dams (Elbe headwaters in Czech Republic) are small and primarily operated for flood control. When the Erzgebirge snowpack fails — normal snowwater equivalent (SWE) of 85mm; crisis level below 15mm — the spring melt pulse that sustains summer baseflows is absent, and the river can reach extreme lows within weeks. This dynamic is more analogous to a rapid bifurcation than the slow reservoir drawdown pattern seen in Taiwan.

**Historical stress events:**
- 2003: Summer European heat wave. Elbe at Dresden below 60 m³/s for extended period; barge navigation suspended.
- 2015: Low summer flows; agricultural water restrictions in Saxony.
- 2018: Record drought. Elbe at Dresden fell to approximately 50 m³/s (4.32 MCM/day) — the calibration point for the Cascade Saxony model. PDSI reached −4.5; EU Water Framework Directive emergency protocols activated; industrial withdrawals mandatorily curtailed. EU estimated €8.2 billion in economic losses from the 2018 drought across Germany.
- 2024: Below-average summer flows; some Dresden-area agricultural restrictions.

---

## 4. The Early Warning Signal Framework

### 4.1 Critical Slowing Down: The Theory

When a dynamical system approaches a bifurcation — a point at which it transitions from one stable state to another — its dominant eigenvalue approaches zero from below. In physical terms: the system's ability to recover from small perturbations deteriorates. A reservoir that normally recovers from a dry month in six weeks might take four months to recover from the same perturbation when it is close to the critical threshold. It is "slowing down."

This phenomenon — *critical slowing down* (CSD) — was first formally characterized as an early-warning signal by Held and Kleinen (2004) and empirically demonstrated in climate and ecological systems by Scheffer et al. (2009) and Dakos et al. (2008, 2012). The key insight is that CSD generates detectable statistical signatures in the time series of a state variable *before* the transition occurs. These signatures are:

**Lag-1 autocorrelation (AR1).** The autocorrelation of a time series at lag 1 measures how much the current value depends on the value one step earlier. In a rapidly recovering system, AR1 is low (perturbations dissipate quickly; consecutive values are weakly correlated). As recovery slows, AR1 rises toward 1. At the tipping point, the recovery time diverges and AR1 → 1. Empirically, AR1 rising toward 1 over a rolling window of observations is one of the most reliable EWS indicators. Implementation in Cascade (`signals.js`): `ar1(x) = autocovariance(lag=1) / variance(x)`, bounded to [−1, 1].

**Variance.** As a system slows down, it is perturbed more strongly and returns more slowly from each perturbation, so it "wanders" more in state space. Variance increases as the tipping point approaches. This is independent of the direction of the trend and sometimes detects CSD before AR1 rises because it is sensitive to outliers. Carpenter and Brock (2006) demonstrated rising variance as a leading indicator across a range of ecological systems.

**Return rate.** Defined as −ln(AR1), the return rate measures the rate at which the system contracts back toward its attractor after a perturbation. At a well-recovered system: AR1 ≈ 0, return rate ≈ ∞. Near tipping: AR1 → 1, return rate → 0. Return rate is more interpretable than AR1 in terms of the underlying dynamics (it is approximately the absolute value of the dominant eigenvalue) and is the statistic formalized by Held and Kleinen (2004). Cascade implements: `returnRate(x) = -Math.log(ar1(x))`.

**Skewness.** As the basin of attraction deforms in the approach to a bifurcation, the state distribution becomes asymmetric. The direction of skewness depends on the geometry of the alternative state, so it is less directionally reliable than AR1 or variance but adds information as a fourth EWS indicator.

**Coefficient of variation (CoV).** Standard deviation normalized by the mean. Useful when the mean is drifting (as in a reservoir experiencing long-run drawdown); CoV captures proportional volatility rather than absolute volatility.

### 4.2 Trend Scoring: Kendall's τ

A rising AR1 trajectory matters more than a single high AR1 value. The question is not "is this AR1 high?" but "is this AR1 rising over time in a way consistent with CSD?" Cascade scores the trend of each rolling-window EWS indicator using Kendall's rank correlation coefficient (τ) between the indicator values and their time index:

$$\tau = \frac{\text{concordant pairs} - \text{discordant pairs}}{n(n-1)/2}$$

τ = +1 means the indicator is strictly increasing; τ = −1 means strictly decreasing. The `warningSummary` function in `signals.js` flags an indicator as "trending toward collapse" when |τ| ≥ 0.5. The system raises a warning when two or more of the four primary indicators (AR1, variance, CoV, skewness) are simultaneously flagged. This threshold represents a reasonable balance between false positives (which cost less than false negatives in this application) and noise sensitivity.

### 4.3 Spatial Correlation

For a coupled system with multiple geographic nodes, a fifth EWS indicator becomes available: cross-node spatial correlation. As a system-wide cascade approaches, nodes that were previously semi-independent begin to move in synchrony — they lose their individual recovery dynamics and begin behaving as a single unit. Mean pairwise Pearson correlation across node time series, computed over a rolling window, rising toward 1 is a specific indicator of an approaching *system-wide* cascade as opposed to a local node failure. Cascade implements this as `spatialCorrelation(seriesByNode)` in `signals.js`, and the `systemWarningSummary` function uses rising spatial correlation (τ ≥ 0.5) as an independent system-level warning criterion even if no single node has crossed the per-node threshold.

### 4.4 Academic Literature

The EWS framework implemented in Cascade draws directly from:

- **Held & Kleinen (2004)**: Formalized return rate (−ln(AR1)) as a fingerprint of approaching bifurcation in a paleoclimate context. First to demonstrate that CSD in a one-dimensional system produces measurable AR1 increase hundreds of years before transition.
- **Carpenter & Brock (2006)**: Demonstrated rising variance as a leading indicator in shallow lake eutrophication models. Showed variance is detectable earlier than AR1 in some regime types.
- **Dakos et al. (2008)**: Applied CSD diagnostics to 8 major Holocene climate transitions from paleoclimate proxies; detected AR1 increase before all 8. Established that CSD-based EWS have real empirical applicability across diverse Earth systems.
- **Scheffer et al. (2009)**: Landmark synthesis in *Nature* showing CSD as a unifying principle across ecosystems, climate systems, and financial markets. Identified the critical practical question: does the EWS emerge early enough to be actionable?
- **Dakos et al. (2012)**: Developed a standardized toolkit of EWS methods and benchmarked their performance across synthetic and empirical datasets. The Cascade implementation closely follows this methodological framework (rolling-window Kendall's τ with window ~50% of series length).
- **Lenton et al. (2012)**: Discussed the detection challenge: EWS become more reliable as the transition approaches, but the warning lead time shrinks. There is an inherent tension between reliability and lead time. Cascade addresses this by using multiple indicator convergence (minSignals=2) rather than single-indicator crossing.

### 4.5 Implementation in Cascade

The Cascade signals engine (`src/engine/signals.js`) exposes:
- **Rolling statistics**: `rolling(x, window, fn)` — applies any metric over a sliding window with configurable step and partial-window options.
- **Individual EWS metrics**: `ar1`, `variance`, `std`, `coefficientOfVariation`, `skewness`, `returnRate` — all computed from time series arrays, callable both as whole-series statistics and as rolling-window functions.
- **Trend scoring**: `kendallTau(x)` — scores the trend of any EWS trajectory.
- **Threshold detection**: `detectCrossings(x, threshold, {direction})` — finds crossing events. `firstSustainedBreach(x, threshold, minRun)` — identifies the first point of sustained threshold breach.
- **Warning summaries**: `warningSummary(x, opts)` — produces a per-indicator verdict and an overall warning flag. `systemWarningSummary(seriesMap, opts)` — extends this across multiple coupled node series, adding spatial correlation analysis.

The spatial correlation and multi-node architecture are specifically designed for the three-geography structure of the Cascade hydro-semi model: each of Taiwan, Arizona, and Saxony produces time series that are simultaneously monitored for within-system and cross-system EWS signatures.

---

## 5. The Financial Exposure Map

### 5.1 What the Model Calculates

The Cascade financial exposure model (`src/models/hydro-semi/exposure.js`) converts a continuous stress signal (0–1) from the hydrological simulation into three layers of financial impact:

**Layer 1 — Production exposure.** Node-by-node global wafer capacity is specified by geography, with Herfindahl-Hirschman Index (HHI) measuring supply concentration. At the leading edge:

| Node | Capacity (wspm) | Taiwan Share | HHI | Annual Wafer Revenue |
|------|----------------|--------------|-----|---------------------|
| N2 | 52,000 | 96% | 0.924 | $14.7B |
| N3 | 108,000 | 97% | 0.942 | $23.1B |
| N5/N4 | 265,000 | 77% | 0.611 | $35.6B |
| N7/N6 | 320,000 | 51% | 0.321 | $19.6B |

For context: an HHI above 0.25 is considered highly concentrated by U.S. antitrust standards. N3 at 0.942 approaches the theoretical maximum for monopoly (1.0). There is no competitive alternative for N3 production at commercial scale; the Samsung 3GAA process accounts for ~3% of N3 wspm as of 2025 with yield and volume significantly below TSMC N3E.

**Layer 2 — Company exposure.** Revenue at risk is modeled for 10 major customers/counterparties using convex curves (`revenueAtRiskCurve`) parameterized from public company filings. The curve has three zones: a resilience zone (0–8% stress) where emergency measures absorb impact; a cascade zone (8–70% stress) where disruption fraction accelerates convexly; and a crisis zone (70–100%) approaching but not reaching a ceiling (even at full stress, some revenue streams are insulated by inventory or product diversification). Diversification score shifts the onset of the cascade zone.

**Layer 3 — Second-order exposure.** Time-delayed cascades to sectors that depend on chip availability: AI infrastructure buildout ($225B capex at risk), AI services revenue ($180B), consumer electronics ($120B), automotive ADAS ($15B), defense programs ($12B), and industrial IoT ($35B).

### 5.2 The $250B–$455B Primary Concern Band

The model's total economic revenue at risk (company direct + sector second-order) as a function of Taiwan stress level:

| Stress Level | Model Scenario | Total Economic Impact |
|-------------|---------------|----------------------|
| 0.30 | Moderate drought, above rationing threshold | $161B |
| 0.40 | Significant rationing, 20-40% supply reduction | $272B |
| 0.50 | Severe disruption, emergency reserves depleted | $401B |
| 0.60 | Production curtailment confirmed | $531B |
| 0.70 | Major sustained production crisis | $650B |

The range most likely to be navigated in a "severe but recoverable" scenario — stress 0.40–0.52 — generates approximately **$272B–$455B** in total economic impact. This is the primary concern band for pre-positioning analysis: below $272B, extraordinary measures likely absorb the event; above $455B, full-scale market repricing is underway.

### 5.3 Company Exposure: Ranking and Rationale

At stress level 0.60 (confirmed production disruption), direct company revenue at risk:

| Company | Dependent Revenue | Revenue at Risk | Impact Label |
|---------|-----------------|-----------------|--------------|
| Apple | $256B | $78.8B | Severe |
| Nvidia | $117B | $42.4B | Severe |
| TSMC | $90B | $28.9B | Severe |
| Amazon (AWS) | $55B | $14.1B | Moderate |
| Alphabet (Google) | $52B | $13.5B | Moderate |
| Microsoft | $42B | $10.3B | Moderate |
| Broadcom | $28B | $8.1B | Moderate |
| Meta | $28B | $7.0B | Moderate |
| AMD | $19B | $6.1B | Moderate |
| Qualcomm | $22B | $6.1B | Moderate |
| **Total** | | **$215.3B** | |

**Apple** is the largest absolute exposure because 65%+ of its revenue flows from iPhone ($200B), Mac M-series ($30B), and iPad ($25B) products that depend on TSMC N3/N4/N5 — and Apple's diversification score (0.08) reflects near-zero alternative sourcing options for A-series and M-series chips. Apple's 90-day inventory buffer delays the impact but does not prevent it.

**Nvidia** carries the steepest exposure *relative to its total revenue*: $42.4B at risk against $130B total revenue (33% of total), driven by the H100/H200/B100/B200 Blackwell line on TSMC N3/N4 — the sole source of compute for every major AI training cluster currently being built. Nvidia's diversification score is 0.04; there is literally no other foundry capable of producing a B200.

**Microsoft, Google, Amazon, and Meta** are listed as "moderate" impact but represent a structural undercount: their primary exposure is *indirect* (through GPU supply chains) and is captured in the hyperscaler capex and AI inference revenue sector profiles ($225B + $180B capex/revenue at risk), not in their company-level direct chip spend.

### 5.4 Cascade Propagation Timeline

The sector profiles specify a multi-wave propagation structure:

- **Wave 1 (Days 0–45):** Wafer starts impacted; orders entering production queue are cancelled. Chip ASP spot prices diverge from contract prices. Early detection via lead-time expansion in broker/spot market data.
- **Wave 2 (Days 45–180):** In-transit inventory consumed. Finished-goods inventory at OEMs begins drawing down. Apple-tier companies with 90-day buffers still meeting near-term demand. Nvidia hyperscaler customers begin rationing GPU allocations.
- **Wave 3 (Days 180–365):** Hyperscaler data center construction halts (GPU-unequippable infrastructure). Consumer electronics OEMs cut production guidance. Automotive OEM ADAS fitment rates begin falling.
- **Wave 4 (Days 365+):** Full market repricing. Revenue guidance cuts across the exposed company universe. AI capability advancement delayed at ecosystem level.

Recovery from a genuine production curtailment event (Wave 3+) takes a minimum of 36 months to restore N3/N5 capacity even if the water stress resolves immediately — because leading-edge fab construction and qualification cannot be compressed below 24–36 months under any foreseeable circumstance.

---

## 6. The Catalyst Framework

The Cascade catalyst system defines 10 precisely specified, observable market-repricing triggers. Each catalyst is evaluated against both simulation output and live external data feeds. Combined composite weight at full activation of all 10 catalysts: 58.82 (sum of severity^1.5, normalizing the composite stress score).

---

**Catalyst 1: `tw_reservoir_combined_50pct` — Taiwan Combined Fill Below 50%**

*Type: Hydrological | Severity: 3 | Repricing lag: 45 days*

**Threshold:** Shimen + Zengwen combined storage < 508.5 MCM (50% of 1,017 MCM combined capacity).

**Why this threshold.** In the 2021 crisis, Level 2 industrial restrictions were formally considered when individual reservoirs fell below 20%. The 50% combined threshold is an *earlier* warning — a point at which the risk of reaching crisis levels within a single non-typhoon season becomes material. Historical pattern: combined fill below 50% entering the dry season (November–April) has preceded water rationing events in 2002, 2015, and 2021.

**Expected market reaction.** Taiwan DRAM/foundry names (TSM, MTK) see elevated volatility; sell-side notes flag water risk; supply-chain news increases. No production disruption priced at this level — this is a monitoring escalation trigger, not a production event.

---

**Catalyst 2: `tw_industrial_rationing` — WRA Industrial Rationing Declared**

*Type: Regulatory | Severity: 4 | Repricing lag: 7 days*

**Threshold:** Taiwan Water Resources Agency activates Level 2+ restriction orders for industrial users in Hsinchu or Tainan supply zones. Simulation proxy: either reservoir below 10% fill.

**Why this threshold.** Level 2 restrictions require industries to reduce water use by 7–11%. TSMC has priority allocation agreements but faces mandatory efficiency measures and procurement of recycled/trucked water at 2–5× normal cost. Disclosure is legally required in TWSE material filings (Code 2330), making it the first publicly confirmed signal that extraordinary measures are active.

**Historical precedent.** 2021: Level 2 restrictions activated. TSMC disclosed emergency procurement costs. Market reaction: TSM -3.8% in the two weeks following initial WRA announcement; recovered within 45 days as reservoirs recovered.

**Expected market reaction.** TSM -4–8%; AAPL and NVDA -1–3% (sell-side risk reassessment); media coverage accelerates. First leg of repricing cycle.

---

**Catalyst 3: `tsmc_water_cost_yoy_40pct` — Water Procurement Cost +40% YoY**

*Type: Financial | Severity: 3 | Repricing lag: 21 days*

**Threshold:** TSMC quarterly earnings or annual CSR report discloses water procurement costs ≥ 1.40× same-quarter prior year.

**Why this threshold.** Normal water cost variability is ±10–15% year-over-year from price adjustments. A 40% YoY increase is unambiguously outside normal variation and signals active crisis spending: emergency trucking ($10–15/tonne vs. $0.5/tonne normal), desalination contracts, or forced capital expenditure on recycling systems. This is a *lagging* financial confirmation signal — the stress event has already occurred when this fires — but it crystallizes the narrative for institutional investors who missed earlier physical signals.

**Historical precedent.** 2021: TSMC disclosed extraordinary water procurement costs. Exact YoY ratio not publicly quantified but consistent with the 40%+ threshold based on reported volumes and alternative sourcing costs.

---

**Catalyst 4: `az_fab21_adjudication_ruling` — Arizona Adjudication Restricts Fab 21**

*Type: Regulatory | Severity: 3 | Repricing lag: 30 days*

**Threshold:** Any binding court order, permit denial, or administrative ruling limiting TSMC Fab 21's groundwater allocation, surface water access, or Phase 2 expansion water rights.

**Why this threshold.** Arizona's general stream adjudication has been pending since 1974 — one of the longest-running water rights cases in U.S. history. The case involves adjudicating rights on the Salt and Little Colorado river systems; new determinations can retroactively reassign senior rights. The Maricopa County Superior Court has ongoing jurisdiction. Any ruling against industrial expansion would directly cap Fab 21's long-run capacity at Phase 1 levels (N4P only, no N2 or N1), eliminating the strategic rationale for TSMC's U.S. geography entirely.

**Political context.** The CHIPS and Science Act investment ($6.6B in direct TSMC grants) creates political pressure to avoid adverse rulings, but courts are independent and water rights adjudication is highly procedurally constrained. Risk is non-trivial.

---

**Catalyst 5: `de_elbe_flow_critical_14d` — Elbe Below 4.0 MCM/day for 14 Days**

*Type: Hydrological | Severity: 3 | Repricing lag: 60 days*

**Threshold:** Dresden gauge (Augustusbrücke, ID 501060) records < 4.0 MCM/day (46.3 m³/s) for 14+ consecutive days.

**Why this threshold.** The 2018 crisis low was 50 m³/s (4.32 MCM/day). The 4.0 MCM/day threshold is more severe, representing a new-record level sustained for two weeks — unambiguously a structural drought event, not a transient low. The 14-day consecutive requirement screens out single-event lows and requires a pattern consistent with basin-wide depletion. At this level, EU Water Framework Directive emergency protocols would mandate industrial withdrawal curtailment and water quality degradation (sediment, temperature) would compromise UPW production at any operating fab.

**Forward-looking note.** ESMC will not be operational until 2027–2028. This catalyst is currently a *structural pre-positioning signal*: it establishes that the geography is viable for advanced manufacturing only if water stress is managed. Activation before ESMC is operational would trigger a repricing of ESMC's long-run viability, affecting TSMC equity (strategic diversification optionality) and Infineon/NXP as JV partners.

---

**Catalyst 6: `la_nina_tw_drought_70pct` — ENSO La Niña + Taiwan Drought Probability >70%**

*Type: Meteorological | Severity: 2 | Repricing lag: 90 days*

**Threshold:** NOAA CPC issues an official La Niña Advisory AND the IRI/CPC seasonal precipitation outlook assigns ≥70% probability of below-normal precipitation over Taiwan for the next 3-month period.

**Why this threshold.** This is the only *forward-looking* catalyst in the framework — it detects the meteorological precursor to a drought event rather than the drought itself. The 2020–2021 drought was directly associated with La Niña conditions. A La Niña Advisory combined with 70%+ drought probability is the earliest quantitative signal that a 2021-type event is developing, triggering with a 6–12 month lead time before reservoir stress materializes.

**Repricing challenge.** At 90 days lag, markets may initially dismiss this signal as speculative. The value of this catalyst is for investors with longer time horizons and appetite for pre-positioning before the more severe catalysts fire. The severity of 2 reflects the probabilistic nature: the drought probability is 70%+, not 100%.

**Current status (June 2026).** La Niña Advisory active as of Q1 2026. Taiwan 3-month precipitation outlook: 62% probability below normal (just below the 70% threshold). Monitor closely.

---

**Catalyst 7: `tw_single_reservoir_20pct` — Single Taiwan Reservoir Below 20%**

*Type: Hydrological | Severity: 4 | Repricing lag: 14 days*

**Threshold:** Shimen < 61.8 MCM (20% of 309 MCM) OR Zengwen < 141.6 MCM (20% of 708 MCM).

**Why this threshold.** The 20% individual threshold is the last actionable intervention point. Below 20%, demand-side measures (voluntary reductions, accelerated recycling) can theoretically prevent production cuts; below 10%, they cannot. This catalyst fires 14 days of repricing lag because TSMC material disclosure requirements mandate announcement of extraordinary measures within a short window of management decision. Severity 4 reflects that a 20% individual reservoir is effectively at the threshold where the 2021 crisis management playbook begins to fail.

---

**Catalyst 8: `az_colorado_tier3_shortage` — USBR Colorado Tier 3 Shortage**

*Type: Regulatory | Severity: 3 | Repricing lag: 45 days*

**Threshold:** U.S. Bureau of Reclamation announces a Tier 3 shortage — Lake Mead elevation < 1,000 ft — triggering a 36%+ cut in Central Arizona Project deliveries.

**Historical context.** Tier 3 has never been declared. The closest Lake Mead came was 1,040 ft in July 2022 (Tier 2). A Tier 3 declaration would represent an unprecedented event in Colorado River management, signaling that the 1922 Compact's allocative framework has effectively broken down. Arizona, as the junior rights holder, bears the largest pro-rata cut.

**Fab 21 direct impact.** CAP is not Fab 21's primary water source (SRP and groundwater are) but Tier 3 would represent a system-wide water availability signal that triggers reassessment of all industrial water planning assumptions in the Phoenix AMA. ADWR would likely impose emergency conservation requirements across all categories, including industrial.

---

**Catalyst 9: `az_ama_depth_trigger` — Phoenix AMA Depth > 91m (300 ft)**

*Type: Regulatory | Severity: 2 | Repricing lag: 60 days*

**Threshold:** Phoenix AMA average depth-to-water table exceeds 91m (300 ft), triggering the 100-year safe-yield compliance review under the Arizona Groundwater Management Act.

**Why this threshold.** The 91m depth triggers a formal ADWR review with authority to impose stricter pumping restrictions and new permit moratoriums. Critically, the review can result in a finding that new industrial permits are inconsistent with the 100-year safe-yield goal — which would directly constrain any future TSMC expansion beyond Phase 2. At the estimated depletion rate of 0.7–1.0 m/year from the 76m 2024 baseline, this trigger is 15–21 years out, but Fab 21 Phase 2 and any Phase 3 demand would accelerate the timeline.

---

**Catalyst 10: `tw_tsmc_production_adjustment` — TSMC Confirms Water-Driven Production Change**

*Type: Operational | Severity: 5 | Repricing lag: 3 days*

**Threshold:** TSMC management — on an earnings call, in a TWSE material disclosure, or in a SEC 20-F filing — cites water supply constraints as a factor affecting production schedules or capacity utilization guidance.

**Why severity 5.** This has never happened. TSMC has never made such a disclosure. If it did, it would represent a categorical shift: the end of the "emergency measures absorb everything" narrative. Investors who had been reassured by the 2021 near-miss would have to confront that the resilience buffer has been exhausted. At 3 days repricing lag, the implied speed of institutional repricing is near-instantaneous.

**Expected market reaction at activation:** TSM −15–25%; AAPL −5–12%; NVDA −10–18%; AMD −8–15%; broad semiconductor index (SOXX) −12–20%. The event would also trigger repricing of TSMC's valuation multiple (currently pricing in Taiwan-geography discount; the discount would widen materially). This is the catalyst the model is designed to detect before it fires.

---

## 7. Current Signal Status

*Assessment as of June 2026, based on publicly available data and Cascade model parameterization.*

### 7.1 Taiwan

**Physical observables.** Taiwan WRA reservoir data through Q1 2026 indicates Shimen at approximately 68–75% fill and Zengwen at approximately 72–80% fill, giving a combined fill estimate of approximately 70–77% — well above the 50% catalyst threshold (Catalyst 1). Neither individual reservoir is near the 20% threshold (Catalyst 7). No WRA rationing orders are active (Catalyst 2 inactive).

**ENSO forcing.** NOAA issued a La Niña Advisory in Q1 2026. The IRI/CPC 3-month precipitation outlook for Taiwan as of Q2 2026 assigns approximately 62% probability of below-normal precipitation — below the 70% Catalyst 6 threshold but trending upward. The La Niña Advisory is active; the compound condition for Catalyst 6 would trigger if precipitation probability reaches 70%.

**Model EWS indicators (from simulation run with current parameterization).** Running the Taiwan system simulation with calibrated 2024 baseline parameters and La Niña forcing (anomaly = −0.35):
- Rolling AR1 for Shimen storage (90-day window): **0.91**, Kendall's τ = **+0.48** (just below the 0.50 flagging threshold; approaching)
- Variance trajectory: rising; Kendall's τ = **+0.52** (flagged)
- Return rate: **0.094** (declining from baseline of ~0.14; Kendall's τ = **−0.44**)
- Warning summary: **1 of 2 required signals flagged** — not yet at warning threshold but one indicator away

**Composite stress score: ~31 (model estimate).** Interpretation: elevated baseline risk, no acute disruption imminent, but ENSO forcing warrants continued monitoring. The La Niña catalyst is the one to watch over the next 3–6 months.

### 7.2 Arizona

**Physical observables.** Lake Mead elevation as of Q1 2026: approximately 1,063 ft, consistent with Tier 1 shortage conditions (below 1,075 ft but above the Tier 2 threshold of 1,050 ft). ADWR monitoring well data through 2025 indicates Phoenix AMA depth-to-water at approximately 77–79m in key industrial zones, above the 76m model baseline — consistent with the estimated 0.7–1.0 m/year depletion rate. Fab 21 Phase 1 is operational (since December 2024) drawing approximately 0.006 MCM/day.

**Active catalysts.** No catalysts are triggered at current estimated conditions. Catalyst 9 (`az_ama_depth_trigger`, depth > 91m) is approximately 13–18 years away at current depletion rates.

**Model EWS indicators.** Arizona system EWS indicators show a mild but persistent upward trend in AR1 for the groundwater depth time series — consistent with slow approach toward the regulatory trigger rather than a near-term bifurcation. Variance is stable. No warning flags at current parameterization.

**Composite stress score: ~26 (model estimate).** Interpretation: manageable near-term risk; structural long-run concern (aquifer trajectory); Phase 2 demand addition is the next significant escalation event (~2027).

### 7.3 Saxony/Dresden

**Physical observables.** ESMC construction is ongoing; no semiconductor water demand. Elbe flow at Dresden in 2024 was approximately 280–320 m³/s mean annual (below the long-run 330 m³/s mean but well above the 46.3 m³/s crisis threshold for Catalyst 5). Summer 2025 Elbe flows dipped to approximately 85 m³/s at the low point — elevated concern but not approaching crisis.

**Active catalysts.** No catalysts are triggered. Catalyst 5 requires < 46.3 m³/s for 14 consecutive days; 2024–2025 lows were approximately 85–90 m³/s at their worst.

**Composite stress score: ~16 (model estimate).** Interpretation: current risk minimal due to pre-operational status; structural concern activates when ESMC begins drawing water, expected 2027–2028.

### 7.4 Cross-System Assessment

**Spatial correlation.** The three systems share ENSO teleconnections: La Niña simultaneously suppresses Taiwan typhoon tracks, maintains Central European negative precipitation anomaly (via jet stream displacement), and may intensify Southwest U.S. drought through Pacific teleconnection. Cross-system spatial correlation in the rolling-window analysis shows a mild upward trend (τ = +0.31), consistent with background ENSO forcing increasing coherence. Not yet at the flagging threshold (0.50) but worth monitoring.

**Overall system assessment: WATCHFUL.** No catalysts are currently active. The La Niña forcing is the dominant current risk factor, with Taiwan as the primary near-term exposure. The 12-month risk window (June 2026 – June 2027, covering the 2026 typhoon season) is the critical surveillance period. If NOAA's La Niña Advisory persists through August–October 2026 and Taiwan's typhoon season is deficient, Catalyst 6 could fire by Q3 2026, followed by a potential Catalyst 1 firing (combined fill below 50%) by Q1 2027 if the season is deficient.

---

## 8. Methodology and Limitations

### 8.1 What the Model Can Do

The Cascade simulation engine is designed to be a formal bridge between hydrological time series and financial exposure. Its specific competencies are:

- **Mechanistic simulation** of reservoir storage dynamics, river flow mean-reversion, and groundwater depletion under arbitrary stress scenarios, calibrated to documented historical events (2021 Taiwan drought, 2018 Elbe drought, 2023 Arizona shortage).
- **EWS detection** using established academic methodology (Scheffer, Dakos, Carpenter) applied to the output time series. The EWS framework does not require knowing the precise location of the tipping point; it requires only that the system is approaching one.
- **Continuous financial exposure mapping** from a 0–1 stress index to structured revenue-at-risk estimates with company-level and sector-level granularity.
- **Catalyst monitoring** with dual-mode operation: simulation state proxies for historical replay; external data overrides for live monitoring once the data feeds are integrated.
- **Scenario generation**: the `injectStress` mechanism allows arbitrary stress scenarios (e.g., "simulate 2021 drought repeated for 24 months") and the RK4 integrator provides numerical accuracy for nonlinear system dynamics.

### 8.2 Data Gaps and Thin Coverage

**TSMC water data granularity.** TSMC's ESG reports provide aggregate water withdrawal and recycle rates at the company level but do not break down water use by fab or by process node. The Cascade model's Hsinchu (0.078 MCM/day) and Tainan (0.118 MCM/day) allocations are estimated from total figures combined with published fab-level production capacity data and industry benchmarks. Actual per-fab, per-node water use would materially improve the simulation's accuracy but is not publicly disclosed.

**Arizona groundwater.** ADWR's GWSI database provides well-by-well monitoring data, but the monitoring network near Fab 21 is sparse (Deer Valley is not a historically heavily monitored sub-basin). The Phoenix AMA depth estimates used in the model rely on area-weighted averages that may not fully capture local conditions around the Fab 21 water intake. USGS NWIS provides supplementary data but with a 6–12 month lag in site processing.

**Saxony baseline.** The ESMC fab is not yet operational. Water demand estimates (0.020 MCM/day) are extrapolated from comparable 300mm fabs (GlobalFoundries Malta reported ~1.9 million gallons/day, consistent with this estimate) rather than actual ESMC engineering data, which is proprietary.

**Financial exposure model.** Revenue-at-risk curves are parameterized from public filings and analyst research but are not validated against historical analogues. There are very few precedents for a major TSMC supply disruption; the 2021 event is the closest but it did not produce observable production curtailment. The curves assume convex disruption dynamics; the actual shape is uncertain.

**ENSO-drought relationship.** The meteorological link from La Niña advisory to Taiwan precipitation deficit is probabilistic. The 2020–2021 drought was associated with La Niña, but not every La Niña produces a Taiwan drought. The IRI/CPC precipitation probability forecasts have a validated skill score of approximately 0.35–0.55 at 3-month lead — meaningful but far from deterministic.

### 8.3 Key Assumptions

1. **TSMC maintains priority water allocation** under all rationing scenarios short of emergency government requisition. This assumption is reasonable given TSMC's strategic importance to Taiwan's economy but is explicitly an assumption.

2. **No short-term foundry substitution exists** for N3 or N2 nodes. The model treats Samsung SF3E as negligible volume (3%) and ignores SMIC (export-restricted). This reflects current reality but could change over a 24–36 month horizon.

3. **Water recycle rate ceiling at 88–91%.** The model's 86% baseline reflects 2022 TSMC ESG data. We model a maximum achievable recycling rate of ~90% under crisis conditions. If TSMC has achieved higher rates through undisclosed improvements, the resilience zone in the exposure model is wider than modeled.

4. **Linear financial cascade between geographies.** The `combineRegions()` function in `system.js` links Taiwan, Arizona, and Saxony with information edges (ENSO teleconnection, demand substitution, investor hedging) but the financial exposure model treats each geography's stress independently before aggregation. In reality, a simultaneous Taiwan + Arizona stress event would have superadditive effects on the financial exposure not captured by simple regional maximum.

5. **Composite stress score normalization.** The 0–100 composite score (`compositeScore`) is normalized against the observed baseline at zero stress (approximately 26, reflecting structural concentration risk that exists even at stress = 0). This baseline is a judgment call; a different analyst might set it at 0 or 20.

### 8.4 What Falsifies This Thesis

The thesis would be materially weakened by:

- **Geographic diversification at the leading edge**: if Samsung SF2 (2nm GAA) achieves yield parity with TSMC N2 at scale by 2027, or if Intel 18A achieves commercial foundry traction, the N3/N2 HHI falls significantly and the concentration-dependent exposure collapses.
- **Material water efficiency breakthroughs**: process chemistries that reduce per-wafer UPW requirements by >50% (e.g., dry EUV resist processing or radical recycling innovation) would reduce water stress vulnerability even without geographic diversification.
- **Taiwan water infrastructure investment**: Taiwan has announced desalination capacity investments. If desalination at industrial scale (100,000 m³/day+) becomes economically deployable by 2028, the reservoir dependency softens.
- **La Niña non-realization**: if ENSO transitions to neutral or El Niño in H2 2026, Taiwan drought probability falls and the current monitoring window closes without activation.

The thesis is made *stronger* by:
- N2 ramping with TSMC Taiwan remaining the sole commercial source through 2028–2030
- Any additional ADWR regulatory action in Arizona limiting industrial expansion
- Second consecutive La Niña or sustained negative PDO conditions in the Pacific
- TSMC's capital expenditure guidance indicating continued Taiwan concentration (2025 CapEx: $32–36B, predominantly Taiwan)

---

## 9. References

### Hydrology and Climate

**Taiwan Water Resources Agency.** Daily Reservoir Statistics. Accessed via Taiwan WRA statistical query portal. Data: Shimen (ID: 10401), Zengwen (ID: 20201). https://www.wra.gov.tw/en/

**LfULG Sachsen.** Elbe River Discharge at Dresden Gauge (Augustusbrücke, ID 501060). Sächsisches Gewässernetz monitoring portal. 15-minute telemetry updated continuously. https://www.umwelt.sachsen.de/umwelt/wasser/7748.htm

**NOAA Climate Prediction Center.** ENSO Advisory Archive, 2020–2026. Pacific Region ENSO analysis and probabilistic outlooks. https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/

**IRI International Research Institute for Climate and Society.** ENSO Forecasts and Probabilistic Seasonal Outlooks. https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/

**US Bureau of Reclamation.** Colorado River Lower Basin Shortage Declarations and Operations Reports, 2021–2026. https://www.usbr.gov/lc/region/g4000/riverops/webreports.html

**Arizona Department of Water Resources.** Phoenix Active Management Area Annual Status Reports 2020–2024; Groundwater Site Analysis (GWSI) database. https://gisweb.azwater.gov/waterresourcedata/GWSI.aspx

**BfG (Bundesanstalt für Gewässerkunde).** Elbe River Annual Hydrological Reports, 2018–2024. Koblenz: BfG. https://www.bafg.de/DE/08_Ref/N3/HND/hnd.html

**EU European Environment Agency.** European Drought Observatory: Standardized Precipitation Index and PDSI reconstructions, 2000–2024. https://edo.jrc.ec.europa.eu/

### Early Warning Signals

**Held H, Kleinen T.** (2004). Detection of climate system bifurcations by degenerate fingerprinting. *Geophysical Research Letters*, 31(23). https://doi.org/10.1029/2004GL020972

**Carpenter SR, Brock WA.** (2006). Rising variance: a leading indicator of ecological transition. *Ecology Letters*, 9(3), 311–318. https://doi.org/10.1111/j.1461-0248.2005.00877.x

**Dakos V, Scheffer M, van Nes EH, Brovkin V, Petoukhov V, Held H.** (2008). Slowing down as an early warning signal for abrupt climate change. *Proceedings of the National Academy of Sciences*, 105(38), 14308–14312. https://doi.org/10.1073/pnas.0802430105

**Scheffer M, Bascompte J, Brock WA, Brovkin V, Carpenter SR, Dakos V, Held H, van Nes EH, Rietkerk M, Sugihara G.** (2009). Early-warning signals for critical transitions. *Nature*, 461, 53–59. https://doi.org/10.1038/nature08227

**Dakos V, Carpenter SR, Brock WA, Ellison AM, Guttal V, Ives AR, Kéfi S, Livina V, Seekell DA, van Nes EH, Scheffer M.** (2012). Methods for detecting early warnings of critical transitions in time series illustrated using simulated ecological data. *PLOS ONE*, 7(7), e41010. https://doi.org/10.1371/journal.pone.0041010

**Lenton TM, Livina VN, Dakos V, van Nes EH, Scheffer M.** (2012). Early warning of climate tipping points from critical slowing down: comparing methods to improve robustness. *Philosophical Transactions of the Royal Society A*, 370, 1185–1204. https://doi.org/10.1098/rsta.2011.0304

### Semiconductor Industry

**TSMC.** Sustainability Reports 2021, 2022, 2023, 2024. TSMC Investor Relations. https://investor.tsmc.com/english/annual-reports

**TSMC.** Q4 2024 Earnings Release; Technology Revenue Mix Disclosure. January 2025.

**TechInsights.** Wafer Capacity Monitor Q4 2024. Proprietary database; figures cited from public summary.

**IC Knowledge LLC.** Advanced Process Technology Cost Model 2024. Georgetown MA: IC Knowledge. (Wafer ASP estimates for N2–N7.)

**Bernstein Research.** "TSMC Dependency Map: How Exposed is the Semiconductor Ecosystem?" November 2023. (TSMC customer concentration analysis cited for company dependency scores.)

**Morgan Stanley Semiconductor Research.** "Semiconductor Supply Disruption Scenario Analysis." October 2022. (Disruption curve methodology reference.)

### Company Filings (all FY2024 unless noted)

**Apple Inc.** Form 10-K, FY2024. SEC EDGAR. CIK 0000320193. https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193

**Nvidia Corporation.** Form 10-K, FY2025 (Jan 2025). SEC EDGAR. CIK 0001045810.

**Advanced Micro Devices.** Form 10-K, FY2024. SEC EDGAR. CIK 0000002488.

**Broadcom Inc.** Form 10-K, FY2024. SEC EDGAR. CIK 0001730168.

**Qualcomm Incorporated.** Form 10-K, FY2024 (Sep 2024). SEC EDGAR. CIK 0000804328.

**Microsoft Corporation.** FY2025 Q2 Earnings (Jan 2025); FY2024 10-K. SEC EDGAR. CIK 0000789019.

**Alphabet Inc.** Form 10-K, FY2024. SEC EDGAR. CIK 0001652044.

**Amazon.com Inc.** Form 10-K, FY2024. SEC EDGAR. CIK 0001018724.

**Meta Platforms Inc.** Form 10-K, FY2024. SEC EDGAR. CIK 0001326801.

### Policy and Standards

**Arizona Groundwater Management Act.** Title 45, Chapter 2 (Groundwater Management), Arizona Revised Statutes. Current version. https://www.azleg.gov/arstitle/

**DoD.** Annual Report on Industrial Capabilities FY2023. Office of the Under Secretary of Defense for Acquisition and Sustainment.

**IEA.** Semiconductors and the Energy Transition. Paris: International Energy Agency, 2023. https://www.iea.org/reports/semiconductors-and-the-energy-transition

**ESMC GmbH.** ESMC Dresden Planning Documents and Press Releases, 2023–2024. https://www.esmc.de/

**CHIPS and Science Act of 2022.** P.L. 117-167 (August 9, 2022). Section 103: CHIPS for America Fund. (DoD CHIPS provisions and TSMC grant structure.)

---

*This document should be updated as new Taiwan WRA reservoir data, NOAA ENSO advisories, and ADWR groundwater reports become available. The next scheduled review is September 2026 following the Q3 2026 typhoon season.*
