'use strict';

/**
 * scripts/fetch-history-multiyear.js
 *
 * Pulls a long, weekly history of Shimen + Zengwen reservoir fill from the WRA
 * FHY disaster system, for backtesting the early-warning engine against the
 * known Taiwan drought/curtailment events (notably 2015 and 2021).
 *
 * Same source/method as fetch-reservoir-history.js, longer window. Writes
 * research/data/reservoir-history-multiyear.json.
 *
 * Usage: node scripts/fetch-history-multiyear.js [startYear]   (default 2010)
 */

const fs = require('fs');
const path = require('path');

const ENDPOINT = 'https://fhy.wra.gov.tw/Disaster/api/ReservoirHistoryApi/GetComparision';
const STATIONS = { shimen: '10201', zengwen: '30502' };
const OUT = path.join(__dirname, '..', 'research', 'data', 'reservoir-history-multiyear.json');

const iso = (d) => d.toISOString().slice(0, 10);

async function fetchDay(day) {
  const body = new URLSearchParams({ ST_NO: Object.values(STATIONS).join(','), StartDate: day, EndDate: day });
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const startYear = Number(process.argv[2]) || 2010;
  const start = new Date(Date.UTC(startYear, 0, 6));
  const end = new Date(); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - 2);
  const byId = { [STATIONS.shimen]: 'shimen', [STATIONS.zengwen]: 'zengwen' };

  const dates = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) dates.push(iso(d));

  process.stderr.write(`Fetching ${dates.length} weekly samples ${dates[0]} → ${dates[dates.length - 1]}\n`);
  const series = [];
  let ok = 0, fail = 0;
  for (let i = 0; i < dates.length; i++) {
    let recs = null;
    for (let attempt = 0; attempt < 3 && recs === null; attempt++) {
      try { recs = await fetchDay(dates[i]); }
      catch (e) { await new Promise((r) => setTimeout(r, 500)); }
    }
    if (recs === null) { fail++; continue; }
    ok++;
    const row = { date: dates[i] };
    for (const r of recs) {
      const k = byId[r.ST_NO]; if (!k) continue;
      row[`${k}_fill`] = r.CapacityRate == null ? null : +(r.CapacityRate * 100).toFixed(2);
      row[`${k}_storage`] = r.Capacity == null ? null : r.Capacity;
    }
    series.push(row);
    if (i % 50 === 0) process.stderr.write(`  …${dates[i]} (${ok} ok)\n`);
    await new Promise((r) => setTimeout(r, 120));
  }

  const out = {
    meta: {
      source: 'WRA FHY disaster system — ReservoirHistoryApi/GetComparision',
      stations: STATIONS, cadence: 'weekly',
      range: { start: dates[0], end: dates[dates.length - 1] },
      fetched_at: new Date().toISOString(), samples: series.length, failures: fail,
      note: 'CapacityRate→%fill; Capacity = effective storage (萬 m³). For backtesting the EWS against labelled drought events.',
    },
    series,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  process.stderr.write(`DONE: wrote ${series.length} rows (${fail} failures) → ${path.relative(process.cwd(), OUT)}\n`);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
