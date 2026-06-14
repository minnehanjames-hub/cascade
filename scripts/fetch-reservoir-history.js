'use strict';

/**
 * scripts/fetch-reservoir-history.js
 *
 * Pulls real historical daily reservoir storage for Taiwan's two largest
 * relevant reservoirs — Shimen (石門) and Zengwen (曾文) — and writes a weekly
 * series to research/data/reservoir-history-weekly.json.
 *
 * WHY THIS SOURCE (and not the opendata API the live monitor uses):
 *   The WRA opendata endpoints (opendata.wra.gov.tw) only ever return a
 *   snapshot — the real-time set holds ~1 day, the "daily operations" set
 *   returns only the single latest reporting day. Neither can provide the
 *   6–12 months of history needed to test for critical slowing down.
 *
 *   The WRA's disaster-prevention system (FHY) exposes a reservoir-comparison
 *   endpoint that returns a stored daily value for any requested date:
 *     POST https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision
 *     body: ST_NO=<ids>&StartDate=<YYYY-MM-DD>&EndDate=<YYYY-MM-DD>
 *   It returns one record per station at StartDate and one at EndDate. We set
 *   StartDate == EndDate to read a single day, and sample weekly across a year.
 *
 *   NOTE: FHY uses different station IDs than the opendata feed:
 *     Shimen  FHY 10201   (opendata 10401)
 *     Zengwen FHY 30502   (opendata 20201)
 *
 * Usage:  node scripts/fetch-reservoir-history.js [months]   (default 12)
 */

const fs = require('fs');
const path = require('path');

const ENDPOINT =
  'https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision';

const STATIONS = {
  shimen:  { fhyId: '10201', name: '石門水庫 (Shimen)' },
  zengwen: { fhyId: '30502', name: '曾文水庫 (Zengwen)' },
};

const OUT = path.join(__dirname, '..', 'research', 'data', 'reservoir-history-weekly.json');

function isoDate(d) { return d.toISOString().slice(0, 10); }

async function fetchDay(stNos, day) {
  const body = new URLSearchParams({ ST_NO: stNos, StartDate: day, EndDate: day });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${day}`);
  return res.json();
}

async function main() {
  const months = Number(process.argv[2]) || 12;
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 2); // FHY lags ~1 day; back off 2 to be safe
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);

  const stNos = Object.values(STATIONS).map((s) => s.fhyId).join(',');
  const byFhyId = Object.fromEntries(
    Object.entries(STATIONS).map(([k, v]) => [v.fhyId, k])
  );

  const dates = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    dates.push(isoDate(d));
  }

  console.log(`Fetching ${dates.length} weekly samples ${dates[0]} → ${dates[dates.length - 1]} …`);

  const series = [];
  for (let i = 0; i < dates.length; i++) {
    const day = dates[i];
    let recs;
    try {
      recs = await fetchDay(stNos, day);
    } catch (e) {
      console.warn(`  ! ${day}: ${e.message} (skipped)`);
      continue;
    }
    const row = { date: day };
    for (const r of recs) {
      const key = byFhyId[r.ST_NO];
      if (!key) continue;
      // CapacityRate is the fill fraction (0..1); Capacity is absolute storage (萬 m³).
      row[`${key}_fill`] = r.CapacityRate == null ? null : +(r.CapacityRate * 100).toFixed(2);
      row[`${key}_storage`] = r.Capacity == null ? null : r.Capacity;
    }
    series.push(row);
    if (i % 10 === 0) process.stdout.write(`  …${day}\n`);
    await new Promise((r) => setTimeout(r, 150)); // be polite to the endpoint
  }

  const out = {
    meta: {
      source: 'WRA FHY disaster system — ReservoirHistoryApi/GetComparision',
      endpoint: ENDPOINT,
      stations: STATIONS,
      note:
        'CapacityRate = fill fraction (×100 → %); Capacity = absolute effective ' +
        'storage in 萬 m³ (10^4 m³). Sampled weekly (StartDate==EndDate per day). ' +
        'Single null values reflect sensor gaps on that day.',
      fetched_at: new Date().toISOString(),
      range: { start: dates[0], end: dates[dates.length - 1] },
      cadence: 'weekly',
    },
    series,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${series.length} rows → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
