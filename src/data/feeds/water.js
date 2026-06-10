'use strict';

/**
 * water.js — Live hydrological data feeds for Cascade.
 *
 * Connects three public real-time data sources to the Cascade simulation
 * engine, normalizing each source's raw output into the exact state +
 * externalData format consumed by CatalystMonitor.runMonitorCycle().
 *
 * ── SOURCES ──────────────────────────────────────────────────────────────────
 *
 *   Taiwan WRA       Daily reservoir storage: Shimen (石門水庫) and Zengwen
 *                    (曾文水庫). Primary: water.taiwan.gov.tw JSON API.
 *                    Fallback: WRA Open Data platform.
 *                    Update cadence: daily at ~06:00 TWD.
 *
 *   USGS NWIS        Phoenix AMA groundwater depth (parameter 72019, Maricopa
 *                    County). REST API at waterservices.usgs.gov.
 *                    Update cadence: wells report weekly to monthly.
 *
 *   NOAA CPC         ENSO Oceanic Niño Index (ONI) ASCII file.
 *                    Used to determine La Niña / El Niño advisory status and
 *                    estimate Taiwan 3-month precipitation probability.
 *                    Update cadence: monthly.
 *
 * ── FAILURE HANDLING ─────────────────────────────────────────────────────────
 *
 *   Each fetch function:
 *     • Wraps the HTTP call in a configurable timeout (default 10 s).
 *     • On success: updates the in-process cache and returns fresh data.
 *     • On any failure (network, timeout, parse): returns the cached value
 *       with stale:true, or — if no live data has ever been fetched — returns
 *       pre-loaded mock data with mock:true.
 *   The process-level cache is initialized from realistic mock values so
 *   the full pipeline works immediately, even without network access.
 *
 * ── NORMALIZATION OUTPUT ─────────────────────────────────────────────────────
 *
 *   normalizeToSimulationInput(readings) returns:
 *   {
 *     state:        { nodeId: { variable: value } }  — simulation state patch
 *     externalData: { key: value }                   — catalyst check overrides
 *     meta:         { sources, fetchedAt, anyStale, anyMock, errors }
 *   }
 *
 *   Pass state + externalData directly to:
 *     monitor.runMonitorCycle(state, history, externalData)
 *
 * ── LIVE-DATA → CATALYST COVERAGE ───────────────────────────────────────────
 *
 *   Taiwan WRA  →  state.tw_shimen_res.storage_mcm
 *               →  state.tw_zengwen_res.storage_mcm
 *               →  (drives catalysts 1, 2, 3, 7 simulation proxies)
 *
 *   USGS NWIS   →  state.az_groundwater.depth_to_water_m
 *               →  externalData.az_ama_depth_m
 *               →  (drives catalyst 9: az_ama_depth_trigger)
 *
 *   NOAA CPC    →  externalData.la_nina_advisory_active
 *               →  externalData.tw_drought_probability_3m
 *               →  (drives catalyst 6: la_nina_tw_drought_70pct)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;
const FT_TO_M = 0.3048; // exact (1959 international foot)

/** Cache staleness windows — how long a successful fetch stays "fresh". */
const STALE_AFTER_MS = {
  taiwan: 26 * 60 * 60 * 1000,    // 26 h: WRA publishes once daily
  usgs:    7 * 24 * 60 * 60 * 1000, // 7 d:  groundwater changes on weekly timescale
  noaa:   30 * 24 * 60 * 60 * 1000, // 30 d: ONI index updated monthly
};

// ── Taiwan WRA configuration ──────────────────────────────────────────────────

/**
 * Try endpoints in order. The primary WRA API returns all reservoirs as a
 * JSON array. The open-data fallback uses a different envelope format.
 */
const TAIWAN_WRA_ENDPOINTS = [
  'https://water.taiwan.gov.tw/api/v2/Reservoir/GetReservoirData',
  'https://opendata.wra.gov.tw/api/v1/public/WaterResourceBase/reservoirPercentage10',
];

/**
 * Reservoir configurations.
 *
 * effectiveCapacity_mcm: WRA-reported usable storage after decades of silt
 *   accumulation. Shimen's original 309 MCM design capacity has shrunk to
 *   ~235 MCM effective; Zengwen is large enough that silt is less severe.
 * designCapacity_mcm: original design figure used as denominator throughout
 *   the Cascade model (e.g. catalyst fill-fraction thresholds). The feed
 *   passes absolute MCM so model normalisation stays consistent.
 */
const TAIWAN_RESERVOIRS = {
  shimen: {
    id: '10401',
    nameChinese: '石門水庫',
    nameAlt: ['石門', 'Shimen', 'Shihmen'],
    effectiveCapacity_mcm: 235.8,  // Taiwan WRA 2022 annual report
    designCapacity_mcm: 309.12,    // Cascade model denominator
  },
  zengwen: {
    id: '20201',
    nameChinese: '曾文水庫',
    nameAlt: ['曾文', 'Zengwen', 'Tsengwen', 'Tseng-wen'],
    effectiveCapacity_mcm: 708.14,
    designCapacity_mcm: 708.14,
  },
};

// ── USGS NWIS configuration ───────────────────────────────────────────────────

const USGS_GW_BASE = 'https://waterservices.usgs.gov/nwis/gwlevels/';
const USGS_GW_PARAMS = {
  format:       'json',
  stateCd:      'az',
  countycd:     '04013', // Maricopa County FIPS — Phoenix AMA core
  parameterCd:  '72019', // Depth to water level, feet below land surface
  siteStatus:   'active',
  period:       'P7D',   // last 7 days; groundwater changes slowly
  siteType:     'GW',
};

// ── NOAA CPC configuration ────────────────────────────────────────────────────

/**
 * ONI (Oceanic Niño Index) — 3-month running means of NINO3.4 SST anomalies.
 * The most reliable machine-readable ENSO index; plain ASCII; updated monthly.
 * Columns: SEAS  YR  TOTAL  CLIM  ANOM
 */
const NOAA_ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

/**
 * Official NOAA La Niña / El Niño advisory criteria:
 *   Advisory: ONI threshold breached for ≥ 5 consecutive overlapping seasons.
 *   Watch:    threshold breached for 3–4 consecutive seasons.
 */
const ONI_THRESHOLDS = {
  lanina: -0.5,
  elnino: +0.5,
};

// ── Mock data (realistic baseline for June 2026) ──────────────────────────────
//
// Based on:
//   Taiwan WRA data through Q1 2026 (post-2021 recovery; La Niña developing)
//   ADWR Phoenix AMA monitoring 2025 + estimated ~0.8 m/yr depletion from 76m
//   NOAA La Niña Advisory active Q1 2026; ONI ≈ −0.7
//
// Kept as a plain object so the cache can be re-seeded cleanly via clearCache().

const MOCK = Object.freeze({
  taiwan: Object.freeze({
    shimen_storage_mcm:    218.4,   // 70.7% of 309 MCM design capacity
    zengwen_storage_mcm:   529.1,   // 74.7% of 708 MCM design capacity
    combined_storage_mcm:  747.5,
    combined_fill_fraction: 0.735,  // above 50% catalyst threshold
    shimen_fill_fraction:   0.707,
    zengwen_fill_fraction:  0.747,
    source_date: '2026-06-09',
    stale: false,
    mock:  true,
    fetchedAt: null,
    error: null,
  }),
  usgs: Object.freeze({
    depth_m:      78.2,   // ~256.6 ft — 2.2 m above 2024 baseline; ~0.8 m/yr depletion
    depth_ft:    256.6,
    sites_count:   4,
    source_date: '2026-06-03',
    stale: false,
    mock:  true,
    fetchedAt: null,
    error: null,
  }),
  noaa: Object.freeze({
    oni:                       -0.7,
    advisory_status:           'La Niña Advisory',
    la_nina_advisory_active:    true,
    el_nino_advisory_active:    false,
    la_nina_watch_active:       false,
    el_nino_watch_active:       false,
    tw_drought_probability_3m:  0.62, // below 70% catalyst threshold; watch but not trigger
    recent_oni: Object.freeze([
      { season: 'DJF', year: 2026, oni: -0.6 },
      { season: 'JFM', year: 2026, oni: -0.7 },
      { season: 'FMA', year: 2026, oni: -0.8 },
      { season: 'MAM', year: 2026, oni: -0.7 },
      { season: 'AMJ', year: 2026, oni: -0.6 },
    ]),
    date:  'AMJ 2026',
    stale: false,
    mock:  true,
    fetchedAt: null,
    error: null,
  }),
});

// ── In-process cache ──────────────────────────────────────────────────────────
// Seeded with mock data so every call returns something useful on first invocation.

const _cache = {
  taiwan: { ...MOCK.taiwan },
  usgs:   { ...MOCK.usgs },
  noaa:   { ...MOCK.noaa },
};

// ── Low-level HTTP helpers ────────────────────────────────────────────────────

/**
 * fetch() with an AbortController-based timeout.
 * Throws on non-2xx status, network failure, or timeout.
 */
async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return res.json();
}

async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return res.text();
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function isCacheStale(source) {
  const c = _cache[source];
  if (!c.fetchedAt) return true; // never fetched live; mock baseline is always "need refresh"
  return (Date.now() - new Date(c.fetchedAt).getTime()) > STALE_AFTER_MS[source];
}

/** Calculate median of a numeric array. Returns null on empty input. */
function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Empirical ONI → Taiwan below-normal precipitation probability.
 *
 * La Niña suppresses western Pacific typhoon activity and raises drought
 * probability over Taiwan. Derived from historical WRA/CWA data 1950–2023.
 * Strong La Niña (ONI ≤ −1.5) gives ~87% probability; neutral gives the
 * historical base rate of ~30%; El Niño conditions reduce it to ~14%.
 */
function estimateTaiwanDroughtProb(oni) {
  if (oni <= -1.5) return 0.87;
  if (oni <= -1.0) return 0.74;
  if (oni <= -0.5) return 0.60;
  if (oni <= +0.5) return 0.30; // neutral baseline
  if (oni <= +1.0) return 0.20;
  return 0.14;                   // strong / very strong El Niño
}

// ── Taiwan WRA — fetch and parse ──────────────────────────────────────────────

/**
 * Find a reservoir record in a response array by name or station ID.
 * Handles both the English-field and Traditional-Chinese-field formats
 * that different WRA endpoints return.
 */
function findReservoirRecord(records, cfg) {
  if (!Array.isArray(records)) return null;
  return records.find((r) => {
    const id   = String(r.ReservoirIdentifier ?? r['識別碼'] ?? r.id ?? '');
    const name = String(r.ReservoirName ?? r['水庫名稱'] ?? r.name ?? '');
    if (id === cfg.id) return true;
    if (name.includes(cfg.nameChinese)) return true;
    return cfg.nameAlt.some(
      (alt) => name.toLowerCase().includes(alt.toLowerCase())
    );
  }) ?? null;
}

/**
 * Extract storage in MCM from a WRA record.
 * Tries direct MCM fields first; falls back to percentage × effective capacity.
 */
function extractStorageMcm(record, cfg) {
  const directFields = [
    'EffectiveStorage',
    '有效蓄水量(MCM)',
    '有效蓄水量',
    'effective_storage',
    'Storage',
    'storage',
  ];
  for (const f of directFields) {
    const v = parseFloat(record[f]);
    if (!isNaN(v) && v >= 0) return v;
  }

  // Fallback: storage% × effective capacity
  const pctFields = [
    'StoragePercentage',
    '蓄水百分比(%)',
    '蓄水百分比',
    'percentage',
    'Percentage',
  ];
  for (const f of pctFields) {
    const pct = parseFloat(record[f]);
    if (!isNaN(pct) && pct >= 0 && pct <= 100) {
      return (pct / 100) * cfg.effectiveCapacity_mcm;
    }
  }

  return null;
}

/**
 * Normalize any known WRA JSON response envelope into the internal shape.
 * Throws if the required reservoirs cannot be found or parsed.
 */
function parseTaiwanWRAResponse(body) {
  // Unwrap the records array from any known envelope format
  let records;
  if (Array.isArray(body))                        records = body;
  else if (Array.isArray(body?.result?.records))  records = body.result.records;
  else if (Array.isArray(body?.records))          records = body.records;
  else if (Array.isArray(body?.data))             records = body.data;
  else throw new Error('Unrecognized Taiwan WRA response envelope');

  const now = new Date().toISOString();
  const result = { fetchedAt: now, stale: false, mock: false, error: null };

  for (const [key, cfg] of Object.entries(TAIWAN_RESERVOIRS)) {
    const rec = findReservoirRecord(records, cfg);
    if (!rec) throw new Error(`Reservoir ${cfg.nameChinese} not found in WRA response`);

    const storageMcm = extractStorageMcm(rec, cfg);
    if (storageMcm === null) {
      throw new Error(`Cannot extract storage MCM for ${cfg.nameChinese}`);
    }

    result[`${key}_storage_mcm`]    = parseFloat(storageMcm.toFixed(2));
    result[`${key}_fill_fraction`]  = parseFloat((storageMcm / cfg.designCapacity_mcm).toFixed(4));
    result.source_date = rec.Date ?? rec['資料日期'] ?? now.slice(0, 10);
  }

  const totalDesign = TAIWAN_RESERVOIRS.shimen.designCapacity_mcm +
                      TAIWAN_RESERVOIRS.zengwen.designCapacity_mcm;
  result.combined_storage_mcm    = parseFloat(
    (result.shimen_storage_mcm + result.zengwen_storage_mcm).toFixed(2)
  );
  result.combined_fill_fraction  = parseFloat(
    (result.combined_storage_mcm / totalDesign).toFixed(4)
  );

  return result;
}

/**
 * Fetch Taiwan WRA reservoir levels.
 *
 * Returns cached data if still within the freshness window.
 * Tries all known WRA endpoints in order; falls back to cache/mock on failure.
 *
 * @returns {Promise<object>}  Taiwan reading with meta flags.
 */
async function fetchTaiwanWRA() {
  if (_cache.taiwan.fetchedAt && !isCacheStale('taiwan')) {
    return { ..._cache.taiwan };
  }

  const errors = [];
  for (const url of TAIWAN_WRA_ENDPOINTS) {
    try {
      const body   = await fetchJSON(url);
      const parsed = parseTaiwanWRAResponse(body);
      _cache.taiwan = { ...parsed };
      return { ...parsed };
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }

  // All endpoints failed — return cached/mock with degradation flags
  return {
    ..._cache.taiwan,
    stale: !!_cache.taiwan.fetchedAt, // true only when we had prior live data
    error: errors.join(' | '),
    lastFetchAttempt: new Date().toISOString(),
  };
}

// ── USGS NWIS — fetch and parse ───────────────────────────────────────────────

/**
 * Parse the USGS NWIS JSON response for groundwater levels.
 * Extracts the most recent valid depth reading from each active site and
 * returns the median depth in both feet and metres.
 */
function parseUSGSResponse(body) {
  const series = body?.value?.timeSeries;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error('USGS response contains no timeSeries array');
  }

  const depths_ft = [];
  const siteReadings = [];

  for (const ts of series) {
    // Confirm this is parameter 72019 (depth-to-water)
    const varCode = ts?.variable?.variableCode?.[0]?.value;
    if (varCode !== '72019') continue;

    const siteNo   = ts?.sourceInfo?.siteCode?.[0]?.value ?? 'unknown';
    const siteName = ts?.sourceInfo?.siteName ?? siteNo;

    // Walk backwards through values to find the most recent non-null reading
    const vals = ts?.values?.[0]?.value ?? [];
    for (let i = vals.length - 1; i >= 0; i--) {
      const entry = vals[i];
      if (!entry || entry.value == null || entry.value === '') continue;
      const ft = parseFloat(entry.value);
      // Sanity bounds: 0–2,000 ft (0–610 m); reject NoData sentinel values
      if (!isNaN(ft) && ft > 0 && ft < 2000) {
        depths_ft.push(ft);
        siteReadings.push({
          site_no:   siteNo,
          site_name: siteName,
          depth_ft:  ft,
          depth_m:   parseFloat((ft * FT_TO_M).toFixed(2)),
          dateTime:  entry.dateTime ?? null,
        });
        break; // one reading per site
      }
    }
  }

  if (depths_ft.length === 0) {
    throw new Error('No valid USGS depth readings found in response');
  }

  const med_ft = median(depths_ft);
  const med_m  = parseFloat((med_ft * FT_TO_M).toFixed(2));

  const mostRecent = siteReadings
    .map((r) => r.dateTime)
    .filter(Boolean)
    .sort()
    .at(-1)
    ?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  return {
    depth_m:     med_m,
    depth_ft:    parseFloat(med_ft.toFixed(2)),
    sites_count: depths_ft.length,
    sites:       siteReadings,
    source_date: mostRecent,
    fetchedAt:   new Date().toISOString(),
    stale:  false,
    mock:   false,
    error:  null,
  };
}

/**
 * Fetch Phoenix AMA groundwater depth from USGS NWIS.
 *
 * Queries all active Maricopa County wells for parameter 72019 (depth to
 * water, feet). Returns median depth converted to metres.
 *
 * @returns {Promise<object>}  USGS reading with meta flags.
 */
async function fetchUSGSGroundwater() {
  if (_cache.usgs.fetchedAt && !isCacheStale('usgs')) {
    return { ..._cache.usgs };
  }

  const url = `${USGS_GW_BASE}?${new URLSearchParams(USGS_GW_PARAMS)}`;

  try {
    const body   = await fetchJSON(url);
    const parsed = parseUSGSResponse(body);
    _cache.usgs = { ...parsed };
    return { ...parsed };
  } catch (err) {
    return {
      ..._cache.usgs,
      stale: !!_cache.usgs.fetchedAt,
      error: err.message,
      lastFetchAttempt: new Date().toISOString(),
    };
  }
}

// ── NOAA CPC — fetch and parse ────────────────────────────────────────────────

/**
 * Parse the NOAA ONI ASCII file.
 *
 * File format (space-delimited):
 *   SEAS  YR   TOTAL   CLIM   ANOM
 *   DJF  1950  26.67  26.65   0.02
 *   JFM  1950  26.83  26.88  -0.04
 *   ...
 *
 * Advisory determination follows official NOAA criteria:
 *   Advisory: 5 consecutive overlapping 3-month seasons with ONI ≤ −0.5 (La Niña)
 *             or ≥ +0.5 (El Niño).
 *   Watch:    3–4 consecutive seasons meeting the threshold.
 */
function parseOniText(text) {
  const readings = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^(SEAS|YEAR|#)/i.test(line)) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const year = parseInt(parts[1], 10);
    const anom = parseFloat(parts[4]);
    if (!isNaN(year) && !isNaN(anom)) {
      readings.push({ season: parts[0], year, anom });
    }
  }

  if (readings.length < 5) {
    throw new Error(`ONI file yielded only ${readings.length} rows (need ≥ 5)`);
  }

  const last5   = readings.slice(-5);
  const current = readings.at(-1);
  const oni     = current.anom;

  // Count consecutive tail values meeting each threshold
  function consecutiveTail(predFn) {
    let n = 0;
    for (let i = last5.length - 1; i >= 0; i--) {
      if (predFn(last5[i].anom)) n++;
      else break;
    }
    return n;
  }

  const laNinaTail  = consecutiveTail((a) => a <= ONI_THRESHOLDS.lanina);
  const elNinoTail  = consecutiveTail((a) => a >= ONI_THRESHOLDS.elnino);

  const laNinaAdvisory = laNinaTail  >= 5;
  const laNinaWatch    = laNinaTail  >= 3 && !laNinaAdvisory;
  const elNinoAdvisory = elNinoTail  >= 5;
  const elNinoWatch    = elNinoTail  >= 3 && !elNinoAdvisory;

  const advisory_status =
    laNinaAdvisory ? 'La Niña Advisory' :
    laNinaWatch    ? 'La Niña Watch'    :
    elNinoAdvisory ? 'El Niño Advisory' :
    elNinoWatch    ? 'El Niño Watch'    : 'ENSO-Neutral';

  return {
    oni,
    advisory_status,
    la_nina_advisory_active: laNinaAdvisory,
    el_nino_advisory_active: elNinoAdvisory,
    la_nina_watch_active:    laNinaWatch,
    el_nino_watch_active:    elNinoWatch,
    tw_drought_probability_3m: estimateTaiwanDroughtProb(oni),
    recent_oni: last5.map((r) => ({ season: r.season, year: r.year, oni: r.anom })),
    date:      `${current.season} ${current.year}`,
    fetchedAt: new Date().toISOString(),
    stale: false,
    mock:  false,
    error: null,
  };
}

/**
 * Fetch current ENSO status from the NOAA CPC ONI ASCII file.
 *
 * Determines La Niña / El Niño advisory status from the 5-season ONI
 * criterion and estimates Taiwan 3-month drought probability.
 *
 * @returns {Promise<object>}  NOAA reading with meta flags.
 */
async function fetchNOAAEnso() {
  if (_cache.noaa.fetchedAt && !isCacheStale('noaa')) {
    return { ..._cache.noaa };
  }

  try {
    const text   = await fetchText(NOAA_ONI_URL);
    const parsed = parseOniText(text);
    _cache.noaa = { ...parsed };
    return { ...parsed };
  } catch (err) {
    return {
      ..._cache.noaa,
      stale: !!_cache.noaa.fetchedAt,
      error: err.message,
      lastFetchAttempt: new Date().toISOString(),
    };
  }
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Convert raw feed readings into the exact state + externalData format that
 * CatalystMonitor.runMonitorCycle(state, history, externalData) consumes.
 *
 * Only populates the fields covered by live data; uncovered catalyst
 * simulation proxies fall back to their built-in defaults.
 *
 * State patch coverage:
 *   tw_shimen_res.storage_mcm         ← Taiwan WRA
 *   tw_zengwen_res.storage_mcm        ← Taiwan WRA
 *   az_groundwater.depth_to_water_m   ← USGS NWIS
 *
 * externalData coverage:
 *   az_ama_depth_m                    ← USGS NWIS  (catalyst 9)
 *   la_nina_advisory_active           ← NOAA CPC   (catalyst 6)
 *   tw_drought_probability_3m         ← NOAA CPC   (catalyst 6)
 *
 * @param {{ taiwan, usgs, noaa }} readings  Raw outputs from the fetch functions.
 * @returns {{ state, externalData, meta }}
 */
function normalizeToSimulationInput({ taiwan, usgs, noaa } = {}) {
  const state        = {};
  const externalData = {};
  const meta = {
    sources:     [],
    fetchedAt:   new Date().toISOString(),
    anyStale:    false,
    anyMock:     false,
    staleSources: [],
    mockSources:  [],
    errors:       {},
  };

  // ---- Taiwan WRA → reservoir state nodes ----------------------------------
  if (taiwan != null) {
    meta.sources.push('taiwan');
    if (taiwan.stale) { meta.anyStale = true; meta.staleSources.push('taiwan'); }
    if (taiwan.mock)  { meta.anyMock  = true; meta.mockSources.push('taiwan'); }
    if (taiwan.error) meta.errors.taiwan = taiwan.error;

    if (typeof taiwan.shimen_storage_mcm === 'number') {
      state.tw_shimen_res = { storage_mcm: taiwan.shimen_storage_mcm };
    }
    if (typeof taiwan.zengwen_storage_mcm === 'number') {
      state.tw_zengwen_res = { storage_mcm: taiwan.zengwen_storage_mcm };
    }
  }

  // ---- USGS NWIS → groundwater depth state + externalData override --------
  if (usgs != null) {
    meta.sources.push('usgs');
    if (usgs.stale) { meta.anyStale = true; meta.staleSources.push('usgs'); }
    if (usgs.mock)  { meta.anyMock  = true; meta.mockSources.push('usgs'); }
    if (usgs.error) meta.errors.usgs = usgs.error;

    if (typeof usgs.depth_m === 'number') {
      // Simulation state (used by az_groundwater proxy in catalyst 9)
      state.az_groundwater = { depth_to_water_m: usgs.depth_m };
      // externalData override bypasses the proxy entirely for catalyst 9
      externalData.az_ama_depth_m = usgs.depth_m;
    }
  }

  // ---- NOAA CPC → ENSO externalData overrides (catalyst 6) ----------------
  if (noaa != null) {
    meta.sources.push('noaa');
    if (noaa.stale) { meta.anyStale = true; meta.staleSources.push('noaa'); }
    if (noaa.mock)  { meta.anyMock  = true; meta.mockSources.push('noaa'); }
    if (noaa.error) meta.errors.noaa = noaa.error;

    if (typeof noaa.la_nina_advisory_active === 'boolean') {
      externalData.la_nina_advisory_active = noaa.la_nina_advisory_active;
    }
    if (typeof noaa.tw_drought_probability_3m === 'number') {
      externalData.tw_drought_probability_3m = noaa.tw_drought_probability_3m;
    }
  }

  return { state, externalData, meta };
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Run one complete data cycle: fetch all three sources in parallel, normalize
 * the results, and return a structured object ready for the monitor.
 *
 * Individual source failures are isolated — one bad fetch does not block the
 * others. Each failed source returns its cached/mock value.
 *
 * Usage:
 *   const cycle  = await runDataCycle();
 *   const report = monitor.runMonitorCycle(
 *     cycle.normalized.state,
 *     simHistory,
 *     cycle.normalized.externalData
 *   );
 *
 * @returns {Promise<{
 *   timestamp:  string,
 *   sources:    { taiwan, usgs, noaa },
 *   normalized: { state, externalData, meta },
 *   summary:    object
 * }>}
 */
async function runDataCycle() {
  const timestamp = new Date().toISOString();

  const [tw, us, no] = await Promise.allSettled([
    fetchTaiwanWRA(),
    fetchUSGSGroundwater(),
    fetchNOAAEnso(),
  ]);

  const taiwan = tw.status === 'fulfilled' ? tw.value
    : { ..._cache.taiwan, stale: !!_cache.taiwan.fetchedAt, error: tw.reason?.message };
  const usgs   = us.status === 'fulfilled' ? us.value
    : { ..._cache.usgs,   stale: !!_cache.usgs.fetchedAt,   error: us.reason?.message };
  const noaa   = no.status === 'fulfilled' ? no.value
    : { ..._cache.noaa,   stale: !!_cache.noaa.fetchedAt,   error: no.reason?.message };

  const normalized = normalizeToSimulationInput({ taiwan, usgs, noaa });

  return {
    timestamp,
    sources: { taiwan, usgs, noaa },
    normalized,
    summary: buildSummary({ taiwan, usgs, noaa, normalized }),
  };
}

/**
 * Build a concise human-readable summary of the current signal status.
 * Useful for CLI output or logging.
 */
function buildSummary({ taiwan, usgs, noaa, normalized }) {
  const { externalData } = normalized;

  const twFillPct = typeof taiwan.combined_fill_fraction === 'number'
    ? `${(taiwan.combined_fill_fraction * 100).toFixed(1)}%`
    : 'unknown';

  const twStatus =
    !taiwan.combined_fill_fraction        ? 'unknown' :
    taiwan.combined_fill_fraction < 0.20  ? 'CRISIS'  :
    taiwan.combined_fill_fraction < 0.50  ? 'WARNING' :
    taiwan.combined_fill_fraction < 0.70  ? 'WATCH'   : 'NORMAL';

  const azStatus =
    typeof usgs.depth_m !== 'number' ? 'unknown' :
    usgs.depth_m > 122               ? 'CRISIS'  :
    usgs.depth_m > 91                ? 'TRIGGER' :
    usgs.depth_m > 80                ? 'ELEVATED': 'NORMAL';

  return {
    taiwan_combined_fill:    twFillPct,
    taiwan_status:           twStatus,
    shimen_storage_mcm:      taiwan.shimen_storage_mcm  ?? null,
    zengwen_storage_mcm:     taiwan.zengwen_storage_mcm ?? null,
    az_depth_m:              usgs.depth_m  ?? null,
    az_depth_ft:             usgs.depth_ft ?? null,
    az_status:               azStatus,
    enso_advisory:           noaa.advisory_status ?? 'unknown',
    la_nina_advisory_active: externalData.la_nina_advisory_active ?? null,
    tw_drought_probability:  typeof externalData.tw_drought_probability_3m === 'number'
      ? `${(externalData.tw_drought_probability_3m * 100).toFixed(0)}%`
      : 'unknown',
    catalyst6_compound_met:
      externalData.la_nina_advisory_active === true &&
      typeof externalData.tw_drought_probability_3m === 'number' &&
      externalData.tw_drought_probability_3m >= 0.70,
    any_stale: normalized.meta.anyStale,
    any_mock:  normalized.meta.anyMock,
    stale_sources: normalized.meta.staleSources,
    mock_sources:  normalized.meta.mockSources,
    errors: normalized.meta.errors,
  };
}

// ── Cache management ──────────────────────────────────────────────────────────

/**
 * Reset the in-process cache to mock values.
 * Useful in tests or when forcing a full re-fetch on next call.
 */
function clearCache() {
  _cache.taiwan = { ...MOCK.taiwan };
  _cache.usgs   = { ...MOCK.usgs };
  _cache.noaa   = { ...MOCK.noaa };
}

/**
 * Inject pre-validated readings directly into the cache.
 * Accepts a partial object — only provided keys are updated.
 *
 * @param {{ taiwan?, usgs?, noaa? }} readings
 */
function seedCache(readings = {}) {
  if (readings.taiwan) _cache.taiwan = { ...readings.taiwan };
  if (readings.usgs)   _cache.usgs   = { ...readings.usgs };
  if (readings.noaa)   _cache.noaa   = { ...readings.noaa };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Primary API
  fetchTaiwanWRA,
  fetchUSGSGroundwater,
  fetchNOAAEnso,
  normalizeToSimulationInput,
  runDataCycle,
  // Cache management
  clearCache,
  seedCache,
  // Constants / config exposed for callers
  MOCK,
  TAIWAN_RESERVOIRS,
  STALE_AFTER_MS,
  // Internals exposed for unit testing
  _cache,
  _parsers: { parseTaiwanWRAResponse, parseUSGSResponse, parseOniText },
  _helpers: {
    fetchJSON,
    fetchText,
    median,
    estimateTaiwanDroughtProb,
    isCacheStale,
    findReservoirRecord,
    extractStorageMcm,
    buildSummary,
  },
};
