'use strict';

// ── helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const pct = (f, d = 1) => `${(f * 100).toFixed(d)}%`;
const fmtB = (n) => {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}T`;
  return `$${n.toFixed(1)}B`;
};
const tauStr = (t) => `${t >= 0 ? '+' : ''}${t.toFixed(2)}`;

// status classifiers (mirror src/index.js)
const twStatus = (f) => (f < 0.2 ? 'CRISIS' : f < 0.5 ? 'WARNING' : f < 0.7 ? 'WATCH' : 'NORMAL');
const azStatus = (m) => (m > 122 ? 'CRISIS' : m > 91 ? 'TRIGGER' : m > 80 ? 'ELEVATED' : 'NORMAL');
const deStatus = (q) => (q < 4.32 ? 'CRISIS' : q < 8.64 ? 'WARNING' : q < 13.8 ? 'WATCH' : 'NORMAL');
const scoreColor = (s) =>
  s >= 0.7 ? 'var(--red)' : s >= 0.45 ? 'var(--orange)' : s >= 0.25 ? 'var(--yellow)' : s >= 0.1 ? 'var(--yellow)' : 'var(--green)';

const COL = getComputedStyle(document.documentElement);
const cssvar = (n) => COL.getPropertyValue(n).trim();

// ── boot ─────────────────────────────────────────────────────────────────────
fetch('data.json', { cache: 'no-store' })
  .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} fetching data.json`); return r.json(); })
  .then(render)
  .catch((err) => {
    $('loading').hidden = true;
    const e = $('error');
    e.hidden = false;
    e.textContent = `Failed to load dashboard data:\n${err.message}`;
  });

function render(d) {
  $('loading').hidden = true;
  $('app').hidden = false;

  renderHeader(d);
  renderVerdict(d.history.verdict, d.history);
  renderGauge(d.composite);
  renderReservoirChart(d.history, d.sources);
  renderEwsTables(d.history);
  renderSpatial(d.history.spatial);
  renderSimEws(d.ews);
  renderRegions(d.regions, d.sources);
  renderCatalysts(d.catalysts);
  renderExposure(d.scenarios, d.exposure.taiwanScenario60);
  renderSources(d.sources);
  $('genStamp').textContent = `Generated ${new Date(d.generatedAt).toUTCString()}`;
}

// ── header ───────────────────────────────────────────────────────────────────
function renderHeader(d) {
  const b = $('dataMode');
  b.className = `badge ${d.dataMode}`;
  b.textContent = d.dataMode === 'live' ? '● LIVE DATA' : '● MIXED (some fallback)';
  let note = `As of ${d.date}`;
  if (d.staleSources.length) note += ` · stale: ${d.staleSources.join(', ')}`;
  $('asOf').textContent = note;
}

// ── verdict ──────────────────────────────────────────────────────────────────
function renderVerdict(v, h) {
  const banner = $('verdictBanner');
  const cls = v.csd ? 'crit' : v.recovering ? 'ok' : 'warn';
  banner.className = `verdict-banner ${cls}`;
  banner.textContent = v.label;

  const zw = h.nodes.zengwen, sh = h.nodes.shimen;
  $('verdictDetail').innerHTML =
    `Tested 12 months of real WRA reservoir history for the critical-slowing-down signature ` +
    `(rising AR1 &amp; variance, falling return rate) on <strong>detrended residuals</strong>.`;

  const points = [
    `Zengwen bottomed at <strong>${zw.trough.value}%</strong> on ${zw.trough.date}, now ` +
      `${zw.recovering ? `<strong>recovering</strong> to ${zw.latest}%` : `at ${zw.latest}%`} (monsoon onset).`,
    `Shimen held high into winter, drew down to ${sh.trough.value}% (${sh.trough.date}), now ${sh.latest}%.`,
    `Detrended CSD warnings: <strong>${v.csdNodeCount}/3</strong> series flagged.`,
    `Cross-reservoir correlation ${h.spatial.rising ? '<strong>rising</strong>' : 'not rising'} ` +
      `(τ=${tauStr(h.spatial.tau)}, latest ${h.spatial.latest.toFixed(2)}) — ` +
      `${h.spatial.latest < 0 ? 'currently anti-correlated, the inverse of a coupled-cascade signature.' : 'no loss of independence.'}`,
  ];
  const ul = $('verdictPoints');
  points.forEach((p) => ul.appendChild(el('li', null, p)));
}

// ── composite gauge ──────────────────────────────────────────────────────────
function polar(cx, cy, r, deg) {
  const a = ((deg - 180) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx, cy, r, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
function renderGauge(c) {
  const svg = $('gauge');
  const cx = 100, cy = 100, r = 80;
  const score = Math.max(0, Math.min(1, c.score));
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (d, stroke, w) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', w);
    p.setAttribute('stroke-linecap', 'round');
    return p;
  };
  svg.appendChild(mk(arc(cx, cy, r, 0, 180), cssvar('--bg-card-2'), 14));
  if (score > 0.001) svg.appendChild(mk(arc(cx, cy, r, 0, score * 180), cssvar(scoreColor(score).replace('var(', '').replace(')', '')), 14));
  $('scoreVal').textContent = c.score.toFixed(3);
  $('scoreVal').style.color = scoreColor(score);
  $('catalystCount').textContent = `${c.activeCount} / ${c.total} catalysts active`;
}

// ── reservoir history chart ──────────────────────────────────────────────────
function renderReservoirChart(h, sources) {
  $('historyMeta').textContent = `${h.dates[0]} → ${h.dates[h.dates.length - 1]} · weekly · WRA FHY`;
  const ctx = $('reservoirChart');
  const ds = (label, key, color, dash) => ({
    label, data: h.nodes[key].series, borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, tension: 0.25, borderDash: dash || [],
  });
  const threshold = {
    label: '50% combined catalyst threshold', data: h.dates.map(() => 50),
    borderColor: cssvar('--red'), borderWidth: 1, borderDash: [5, 4], pointRadius: 0,
  };
  // trough markers
  const mark = (node, color) => ({
    label: `${node.name} trough`, data: h.dates.map((_, i) => (i === node.trough.index ? node.trough.value : null)),
    borderColor: color, backgroundColor: color, pointRadius: 5, pointStyle: 'triangle', showLine: false,
  });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: h.dates,
      datasets: [
        ds('Shimen 石門', 'shimen', cssvar('--shimen')),
        ds('Zengwen 曾文', 'zengwen', cssvar('--zengwen')),
        ds('Combined', 'combined', cssvar('--combined'), [6, 3]),
        threshold,
        mark(h.nodes.zengwen, cssvar('--zengwen')),
        mark(h.nodes.shimen, cssvar('--shimen')),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: 0, max: 105, title: { display: true, text: '% of effective capacity', color: cssvar('--muted') },
          grid: { color: cssvar('--border') }, ticks: { color: cssvar('--muted') } },
        x: { grid: { display: false }, ticks: { color: cssvar('--muted'), maxTicksLimit: 12, autoSkip: true } },
      },
      plugins: {
        legend: { labels: { color: cssvar('--text'), filter: (i) => !i.text.includes('trough'), boxWidth: 14, usePointStyle: true } },
        tooltip: { callbacks: { label: (c) => c.parsed.y == null ? null : `${c.dataset.label}: ${c.parsed.y}%` } },
      },
    },
  });

  const off = sources.taiwan.shimen_sensor_offline;
  $('reservoirCaption').innerHTML =
    `Both reservoirs filled to ~100% in the 2025 typhoon season, then drew down through the dry season. ` +
    `Zengwen reached a severe single-digit low in early June and has begun rebounding with the plum rains. ` +
    (off ? `<br><strong>Note:</strong> the live Shimen real-time sensor is currently offline; the live snapshot uses a mock fallback (history above is real FHY data).` : '');
}

// ── EWS tables ───────────────────────────────────────────────────────────────
function indTable(indicators) {
  const t = el('table', 'ind');
  t.innerHTML = '<tr><th>Indicator</th><th>Latest</th><th>τ</th><th></th></tr>';
  const names = { ar1: 'AR1', variance: 'Variance', returnRate: 'Return rate' };
  for (const k of ['ar1', 'variance', 'returnRate']) {
    const i = indicators[k]; if (!i) continue;
    const latest = i.latest == null ? (k === 'returnRate' ? '∞' : '—') : (+i.latest).toFixed(3);
    const cls = i.flagged ? 'tau-flag' : 'tau-dim';
    const flag = i.flagged ? '⚠' : '·';
    const tr = el('tr', null,
      `<td>${names[k]}</td><td>${latest}</td><td class="${cls}">${tauStr(i.tau)}</td><td class="${cls}">${flag}</td>`);
    t.appendChild(tr);
  }
  return t;
}
function renderEwsTables(h) {
  const wrap = $('ewsTables');
  for (const key of ['zengwen', 'shimen', 'combined']) {
    const n = h.nodes[key];
    const card = el('div', 'ews-card');
    card.appendChild(el('h4', null, n.name));
    card.appendChild(el('div', 'latest', `now ${n.latest}% · range ${n.min}–${n.max}% · trough ${n.trough.value}% (${n.trough.date})`));

    card.appendChild(el('div', 'sub', 'Raw series (trend-confounded)'));
    card.appendChild(indTable(n.raw.indicators));
    card.appendChild(el('span', `verdict-pill ${n.raw.warning ? 'warn' : 'ok'}`, `${n.raw.signals}/3 — ${n.raw.warning ? 'warning' : 'no warning'}`));

    card.appendChild(el('div', 'sub', 'Detrended residuals (proper CSD)'));
    card.appendChild(indTable(n.detrended.indicators));
    card.appendChild(el('span', `verdict-pill ${n.detrended.warning ? 'warn' : 'ok'}`, `${n.detrended.signals}/3 — ${n.detrended.warning ? 'warning' : 'no warning'}`));

    if (n.drawdownLimb) {
      card.appendChild(el('div', 'sub', `Drawdown limb (${n.drawdownLimb.from}→${n.drawdownLimb.to}, n=${n.drawdownLimb.n})`));
      card.appendChild(indTable(n.drawdownLimb.indicators));
      card.appendChild(el('span', `verdict-pill ${n.drawdownLimb.warning ? 'warn' : 'ok'}`, `${n.drawdownLimb.signals}/3 — ${n.drawdownLimb.warning ? 'warning' : 'no warning'}`));
    }
    wrap.appendChild(card);
  }
}

// ── spatial correlation chart ────────────────────────────────────────────────
function renderSpatial(sp) {
  $('spatialNote').innerHTML =
    `τ=${tauStr(sp.tau)}, latest ${sp.latest.toFixed(2)} — ` +
    (sp.rising ? '<strong style="color:var(--yellow)">rising</strong> (losing independence).' : 'not rising; regions evolving independently.');
  new Chart($('spatialChart'), {
    type: 'line',
    data: { labels: sp.trajectory.map((_, i) => i + 1),
      datasets: [{ label: 'Shimen–Zengwen residual correlation', data: sp.trajectory,
        borderColor: cssvar('--combined'), borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: -1, max: 1, grid: { color: cssvar('--border') }, ticks: { color: cssvar('--muted') } },
        x: { grid: { display: false }, ticks: { color: cssvar('--muted'), maxTicksLimit: 8 } } },
      plugins: { legend: { labels: { color: cssvar('--text'), boxWidth: 14 } } },
    },
  });
}

// ── forward-sim EWS mini-table ───────────────────────────────────────────────
function renderSimEws(e) {
  const wrap = $('simEws');
  const rows = [
    ['Taiwan (Shimen storage)', e.taiwan],
    ['Arizona (GW depth)', e.arizona],
    ['Saxony (Elbe flow)', e.saxony],
  ];
  for (const [label, b] of rows) {
    wrap.appendChild(el('div', 'row',
      `<span>${label}</span><span style="color:${b.warning ? 'var(--yellow)' : 'var(--green)'}">${b.signals}/3 ${b.warning ? '⚠' : '✓'}</span>`));
  }
  if (e.spatial) {
    wrap.appendChild(el('div', 'row',
      `<span>Cross-region spatial corr</span><span style="color:${e.spatial.rising ? 'var(--yellow)' : 'var(--green)'}">τ=${tauStr(e.spatial.tau)} ${e.spatial.rising ? '⚠ rising' : '✓ stable'}</span>`));
  }
}

// ── region cards ─────────────────────────────────────────────────────────────
function fillColor(f) { return f < 0.2 ? cssvar('--red') : f < 0.5 ? cssvar('--orange') : f < 0.7 ? cssvar('--yellow') : cssvar('--green'); }
function regionCard(title, status, metrics, bars, note) {
  const c = el('div', 'region');
  const head = el('div', 'region-head');
  head.appendChild(el('h3', null, title));
  head.appendChild(el('span', `status-dot s-${status}`, `● ${status}`));
  c.appendChild(head);
  bars.forEach((b) => {
    c.appendChild(el('div', 'metric', `<span>${b.label}</span><span>${b.text}</span>`));
    const bar = el('div', 'fillbar');
    const inner = el('div');
    inner.style.width = `${Math.min(100, b.frac * 100)}%`;
    inner.style.background = fillColor(b.frac);
    bar.appendChild(inner); c.appendChild(bar);
  });
  metrics.forEach((m) => c.appendChild(el('div', 'metric', `<span>${m[0]}</span><span>${m[1]}</span>`)));
  if (note) c.appendChild(el('div', 'note', note));
  return c;
}
function renderRegions(r, sources) {
  const wrap = $('regionCards');
  const tw = r.taiwan;
  wrap.appendChild(regionCard('Taiwan', twStatus(tw.combinedFill),
    [['Fab stress (Tainan)', tw.fabStress.tainan.toFixed(3)], ['Combined fill', pct(tw.combinedFill)]],
    [
      { label: `Shimen${sources.taiwan.shimen_sensor_offline ? ' (sensor offline)' : ''}`, text: `${tw.shimen.storage.toFixed(0)} MCM · ${pct(tw.shimen.fill)}`, frac: tw.shimen.fill },
      { label: 'Zengwen', text: `${tw.zengwen.storage.toFixed(0)} MCM · ${pct(tw.zengwen.fill)}`, frac: tw.zengwen.fill },
    ],
    tw.combinedFill < 0.5 ? 'Below 50% combined catalyst threshold.' : null));

  const az = r.arizona;
  wrap.appendChild(regionCard('Arizona', azStatus(az.depthM),
    [['Regulatory trigger', '91 m'], ['Crisis threshold', '122 m'], ['Headroom to trigger', `${(91 - az.depthM).toFixed(1)} m`], ['Active sites', az.sites]],
    [{ label: 'Groundwater depth', text: `${az.depthM.toFixed(1)} m (${az.depthFt.toFixed(0)} ft)`, frac: az.depthM / 122 }],
    'Phoenix AMA · USGS OGC water API.'));

  const de = r.saxony;
  wrap.appendChild(regionCard('Saxony', deStatus(de.elbeFlow),
    [['Ecological minimum', '8.64 MCM/day'], ['Above threshold', `${(((de.elbeFlow / 8.64) - 1) * 100).toFixed(0)}%`]],
    [{ label: 'Elbe flow (Dresden)', text: `${de.elbeFlow.toFixed(1)} MCM/day`, frac: Math.min(1, de.elbeFlow / 28.5) }],
    de.note));
}

// ── catalysts ────────────────────────────────────────────────────────────────
function renderCatalysts(cats) {
  const wrap = $('catalystList');
  const order = { active: 0, watch: 1, inactive: 2 };
  cats.slice().sort((a, b) => order[a.status] - order[b.status] || b.severity - a.severity).forEach((c) => {
    const mark = c.status === 'active' ? '◆ ACTIVE' : c.status === 'watch' ? '◈ WATCH' : '○ inactive';
    const div = el('div', `cat ${c.status}`);
    div.appendChild(el('span', 'mark', mark));
    const body = el('div', 'body');
    body.appendChild(el('div', 'id', c.id));
    body.appendChild(el('div', 'sev', `severity ${c.severity}${c.status !== 'inactive' ? ` · stress ${c.stress.toFixed(3)}` : ''}`));
    if (c.status !== 'inactive' && c.detail) body.appendChild(el('div', 'detail', c.detail));
    div.appendChild(body);
    wrap.appendChild(div);
  });
}

// ── exposure ─────────────────────────────────────────────────────────────────
function renderExposure(scenarios, twExp) {
  new Chart($('exposureChart'), {
    type: 'bar',
    data: {
      labels: scenarios.map((s) => s.stress.toFixed(2)),
      datasets: [
        { label: 'Total economy at risk ($B)', data: scenarios.map((s) => s.economyB),
          backgroundColor: scenarios.map((s) => s.stress >= 0.6 ? cssvar('--red') : s.stress >= 0.45 ? cssvar('--orange') : cssvar('--yellow')) },
        { label: 'Company revenue at risk ($B)', data: scenarios.map((s) => s.companyB), backgroundColor: cssvar('--accent') },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: '$ Billion', color: cssvar('--muted') }, grid: { color: cssvar('--border') }, ticks: { color: cssvar('--muted') } },
        x: { title: { display: true, text: 'Taiwan stress index', color: cssvar('--muted') }, grid: { display: false }, ticks: { color: cssvar('--muted') } } },
      plugins: { legend: { labels: { color: cssvar('--text'), boxWidth: 14 } } },
    },
  });

  const t = el('table');
  t.innerHTML = '<tr><th>Stress</th><th>Score</th><th>Disrupt.</th><th>Company $B</th><th>Economy $B</th><th>Impact</th></tr>';
  scenarios.forEach((s) => {
    const cls = s.stress >= 0.6 ? 'crit' : s.stress >= 0.4 && s.stress <= 0.5 ? 'concern' : '';
    t.appendChild(el('tr', cls,
      `<td>${s.stress.toFixed(2)}</td><td>${s.score}</td><td>${s.effectiveDisruptionPct}%</td>` +
      `<td>${fmtB(s.companyB)}</td><td>${fmtB(s.economyB)}</td><td style="text-align:left">${s.impact}</td>`));
  });
  $('scenarioTable').appendChild(t);

  const cl = $('companyList');
  twExp.topCompanies.forEach((c) => {
    const div = el('div', 'company');
    div.appendChild(el('div', 'tkr', c.ticker));
    div.appendChild(el('div', 'amt', fmtB(c.atRiskB)));
    div.appendChild(el('div', 'nm', `${c.company} · ${c.impact}`));
    cl.appendChild(div);
  });
}

// ── sources ──────────────────────────────────────────────────────────────────
function renderSources(s) {
  const ul = $('sourceList');
  const items = [
    `Taiwan reservoirs (live snapshot): WRA opendata <code>2be9044c</code> — ${s.taiwan.source_date}`,
    `Taiwan reservoir history: <a href="https://fhy.wra.gov.tw/fhyv2/monitor/reservoir" target="_blank" rel="noopener">WRA FHY disaster system</a> (ReservoirHistoryApi)`,
    `Arizona groundwater: USGS OGC water API — Phoenix AMA, ${s.usgs.sites_count} sites, ${s.usgs.source_date}`,
    `ENSO / ONI: <a href="https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" target="_blank" rel="noopener">NOAA CPC</a> — ${s.noaa.advisory_status}, ONI ${s.noaa.oni >= 0 ? '+' : ''}${s.noaa.oni} (${s.noaa.date})`,
  ];
  items.forEach((i) => ul.appendChild(el('li', null, i)));
}
