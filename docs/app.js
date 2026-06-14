'use strict';

// ── helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pct = (f, d = 1) => `${(f * 100).toFixed(d)}%`;
const fmtB = (n) => (n == null || !isFinite(n)) ? '—' : (n >= 1000 ? `$${(n / 1000).toFixed(2)}T` : `$${n.toFixed(1)}B`);
const tauStr = (t) => `${t >= 0 ? '+' : ''}${t.toFixed(2)}`;
const dots = (n) => `<span class="dots">${'●'.repeat(n).split('').map(() => '<span class="on">●</span>').join('')}${'<span class="off">●</span>'.repeat(5 - n)}</span>`;

const twStatus = (f) => (f < 0.2 ? 'CRISIS' : f < 0.5 ? 'WARNING' : f < 0.7 ? 'WATCH' : 'NORMAL');
const azStatus = (m) => (m > 122 ? 'CRISIS' : m > 91 ? 'TRIGGER' : m > 80 ? 'ELEVATED' : 'NORMAL');
const deStatus = (q) => (q < 4.32 ? 'CRISIS' : q < 8.64 ? 'WARNING' : q < 13.8 ? 'WATCH' : 'NORMAL');

const COL = getComputedStyle(document.documentElement);
const cv = (n) => COL.getPropertyValue(n).trim();

// Chart.js global theme (editorial / ink)
function themeCharts() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = cv('--muted');
  Chart.defaults.borderColor = cv('--rule');
}

// ── boot ─────────────────────────────────────────────────────────────────────
Promise.all([
  fetch('data.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`data.json HTTP ${r.status}`); return r.json(); }),
  fetch('analysis.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`analysis.json HTTP ${r.status}`); return r.json(); }),
])
  .then(([d, a]) => render(d, a))
  .catch((err) => { $('loading').hidden = true; const e = $('error'); e.hidden = false; e.textContent = `Failed to load memo:\n${err.message}`; });

function render(d, a) {
  $('loading').hidden = true;
  $('app').hidden = false;
  themeCharts();

  renderMasthead(a, d);
  renderCall(a.call);
  renderWhy(a.call);
  renderDesk(a.agents);
  renderConsensus(a.call);
  renderReservoir(d.history, d.sources);
  renderVerdictStrip(d.history.verdict);
  renderEws(d.history);
  renderSpatial(d.history.spatial);
  renderSimEws(d.ews);
  renderComposite(d.composite);
  renderRegions(d.regions, d.sources);
  renderCatalysts(d.catalysts);
  renderExposure(d.scenarios, d.exposure.taiwanScenario60);
  renderSources(d.sources);
  $('genStamp').textContent = `Generated ${new Date(d.generatedAt).toUTCString()} · data mode: ${d.dataMode}`;
}

// ── masthead ─────────────────────────────────────────────────────────────────
function renderMasthead(a, d) {
  $('classification').textContent = a.meta.classification;
  $('dateline').textContent = `${a.meta.desk} · ${a.meta.asOf}`;
  $('snapshot').innerHTML = `<strong>Snapshot.</strong> ${a.meta.snapshot}`;
}

// ── the call ─────────────────────────────────────────────────────────────────
function renderCall(c) {
  $('callHeadline').textContent = c.headline;
  $('callStance').textContent = c.stance;
  $('callOneliner').textContent = c.oneLiner;
  const cells = [
    ['Direction', c.direction],
    ['Conviction', `${c.convictionThesis}/5 <small>thesis</small> · ${c.convictionTiming}/5 <small>timing</small>`],
    ['Horizon', c.horizon],
    ['Primary', `${c.primaryTicker} <small>vs ${c.hedgeTickers.join(', ')}</small>`],
  ];
  const ts = $('tearsheet');
  cells.forEach(([k, v]) => { const cell = el('div', 'cell'); cell.appendChild(el('div', 'k', k)); cell.appendChild(el('div', 'v', v)); ts.appendChild(cell); });
}

function renderWhy(c) {
  $('whyTicker').textContent = `${c.primaryName} (${c.primaryTicker})`;
  c.whyNvda.forEach((p) => $('whyList').appendChild(el('li', null, p)));
  $('hedgeNote').innerHTML = `<strong>The hedge.</strong> ${c.hedge}`;
}

// ── desk ─────────────────────────────────────────────────────────────────────
function renderDesk(agents) {
  const wrap = $('desk');
  agents.forEach((g) => {
    const card = el('div', 'analyst');
    const head = el('div', 'analyst-head');
    const left = el('div');
    left.appendChild(el('div', 'name', g.handle));
    left.appendChild(el('div', 'role', g.role));
    left.appendChild(el('div', 'style', g.style));
    head.appendChild(left);
    head.appendChild(el('span', `stance-pill stance-${g.stance.replace(/[^A-Z]/gi, '').toUpperCase()}`, g.stance));
    card.appendChild(head);

    const meta = el('div', 'meta');
    meta.innerHTML = `<span>Conviction ${dots(g.conviction)}</span><span>Horizon <b>${g.horizon}</b></span>`;
    card.appendChild(meta);

    const ul = el('ul');
    g.thesis.forEach((t) => ul.appendChild(el('li', null, t)));
    card.appendChild(ul);
    card.appendChild(el('div', 'quote', `“${g.quote}”`));
    wrap.appendChild(card);
  });
}

// ── consensus ────────────────────────────────────────────────────────────────
function renderConsensus(c) {
  const v = c.voteTally;
  const vote = $('vote');
  const items = [
    ['v-num red', v.bearishBias, 'see downside asymmetry'],
    ['v-num green', v.nakedShortToday, 'want a naked short today'],
    ['v-num blue', v.definedRiskTriggerGated, 'back defined-risk, trigger-gated'],
  ];
  items.forEach(([cls, n, lab]) => {
    const it = el('div', 'v-item');
    it.appendChild(el('div', cls, `${n}/4`));
    it.appendChild(el('div', 'v-lab', lab));
    vote.appendChild(it);
  });
  $('consensusNote').textContent = c.consensusNote;

  const tierCls = { WATCH: 't0', STARTER: 't1', PRESS: 't2', MAX: 't3' };
  c.triggerLadder.forEach((r) => {
    const rung = el('div', `rung ${tierCls[r.tier] || 't0'}`);
    rung.innerHTML = `<span class="tier">${r.tier}</span><span class="size">${r.size}</span><div class="cond">${r.conditions}</div>`;
    $('ladder').appendChild(rung);
  });

  $('invalidation').innerHTML = `<b>Invalidation — where we're wrong</b>${c.invalidation}`;
}

// ── reservoir chart ──────────────────────────────────────────────────────────
function renderReservoir(h, sources) {
  $('historyMeta').textContent = `${h.dates[0]} → ${h.dates[h.dates.length - 1]} · weekly · source: WRA FHY disaster system.`;
  const ds = (label, key, color, dash) => ({ label, data: h.nodes[key].series, borderColor: color, backgroundColor: color, borderWidth: 2.2, pointRadius: 0, tension: 0.25, borderDash: dash || [] });
  const threshold = { label: '50% catalyst threshold', data: h.dates.map(() => 50), borderColor: cv('--red'), borderWidth: 1.2, borderDash: [5, 4], pointRadius: 0 };
  const mark = (node, color) => ({ label: `${node.name} trough`, data: h.dates.map((_, i) => (i === node.trough.index ? node.trough.value : null)), borderColor: color, backgroundColor: color, pointRadius: 5, pointStyle: 'rectRot', showLine: false });

  new Chart($('reservoirChart'), {
    type: 'line',
    data: { labels: h.dates, datasets: [
      ds('Shimen 石門', 'shimen', cv('--shimen')),
      ds('Zengwen 曾文', 'zengwen', cv('--zengwen')),
      ds('Combined', 'combined', cv('--combined'), [6, 3]),
      threshold, mark(h.nodes.zengwen, cv('--zengwen')), mark(h.nodes.shimen, cv('--shimen')),
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: 0, max: 105, title: { display: true, text: '% of effective capacity', color: cv('--muted') }, grid: { color: cv('--rule') }, ticks: { color: cv('--muted') } },
        x: { grid: { display: false }, ticks: { color: cv('--muted'), maxTicksLimit: 12, autoSkip: true } },
      },
      plugins: {
        legend: { labels: { color: cv('--ink'), filter: (i) => !i.text.includes('trough'), boxWidth: 14, usePointStyle: true, font: { family: "'Newsreader', serif", size: 13 } } },
        tooltip: { callbacks: { label: (x) => x.parsed.y == null ? null : `${x.dataset.label}: ${x.parsed.y}%` } },
      },
    },
  });

  const off = sources.taiwan.shimen_sensor_offline;
  $('reservoirCaption').innerHTML =
    `Both reservoirs filled to ~100% in the 2025 typhoon season, then drew down through the dry season. Zengwen reached a severe single-digit low in early June and has begun rebounding with the plum rains.` +
    (off ? ` <strong>Note:</strong> the live Shimen real-time sensor is currently offline (live snapshot uses a fallback; the history charted here is real FHY data).` : '');
}

function renderVerdictStrip(v) {
  const strip = $('verdictStrip');
  strip.className = `verdict-strip ${v.csd ? 'crit' : v.recovering ? 'ok' : 'warn'}`;
  strip.innerHTML = `<strong>Model verdict:</strong> ${v.label}.`;
}

// ── EWS ──────────────────────────────────────────────────────────────────────
function indTable(indicators) {
  const t = el('table', 'ind');
  t.innerHTML = '<tr><th>Indicator</th><th>Latest</th><th>τ</th><th></th></tr>';
  const names = { ar1: 'AR1', variance: 'Variance', returnRate: 'Return rate' };
  for (const k of ['ar1', 'variance', 'returnRate']) {
    const i = indicators[k]; if (!i) continue;
    const latest = i.latest == null ? (k === 'returnRate' ? '∞' : '—') : (+i.latest).toFixed(3);
    const cls = i.flagged ? 'tau-flag' : 'tau-dim';
    t.appendChild(el('tr', null, `<td>${names[k]}</td><td>${latest}</td><td class="${cls}">${tauStr(i.tau)}</td><td class="${cls}">${i.flagged ? '⚑' : '·'}</td>`));
  }
  return t;
}
function renderEws(h) {
  const wrap = $('ewsTables');
  for (const key of ['zengwen', 'shimen', 'combined']) {
    const n = h.nodes[key];
    const card = el('div', 'ews-card');
    card.appendChild(el('h4', null, n.name));
    card.appendChild(el('div', 'latest', `now ${n.latest}% · range ${n.min}–${n.max}% · trough ${n.trough.value}% (${n.trough.date})`));
    card.appendChild(el('div', 'sub', 'Raw (trend-confounded)'));
    card.appendChild(indTable(n.raw.indicators));
    card.appendChild(el('span', `verdict-pill ${n.raw.warning ? 'warn' : 'ok'}`, `${n.raw.signals}/3 ${n.raw.warning ? 'warning' : 'no warning'}`));
    card.appendChild(el('div', 'sub', 'Detrended residuals (proper CSD)'));
    card.appendChild(indTable(n.detrended.indicators));
    card.appendChild(el('span', `verdict-pill ${n.detrended.warning ? 'warn' : 'ok'}`, `${n.detrended.signals}/3 ${n.detrended.warning ? 'warning' : 'no warning'}`));
    wrap.appendChild(card);
  }
}

function renderSpatial(sp) {
  $('spatialNote').innerHTML = `τ=${tauStr(sp.tau)}, latest ${sp.latest.toFixed(2)} — ${sp.rising ? '<strong>rising</strong> (losing independence).' : 'not rising; regions evolving independently.'}`;
  new Chart($('spatialChart'), {
    type: 'line',
    data: { labels: sp.trajectory.map((_, i) => i + 1), datasets: [{ label: 'Shimen–Zengwen residual correlation', data: sp.trajectory, borderColor: cv('--combined'), borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { min: -1, max: 1, grid: { color: cv('--rule') }, ticks: { color: cv('--muted') } }, x: { grid: { display: false }, ticks: { color: cv('--muted'), maxTicksLimit: 8 } } },
      plugins: { legend: { labels: { color: cv('--ink'), boxWidth: 12, font: { family: "'Newsreader', serif", size: 12 } } } } },
  });
}

function renderSimEws(e) {
  const wrap = $('simEws');
  [['Taiwan · Shimen storage', e.taiwan], ['Arizona · GW depth', e.arizona], ['Saxony · Elbe flow', e.saxony]].forEach(([label, b]) => {
    wrap.appendChild(el('div', 'row', `<span>${label}</span><span style="color:${b.warning ? cv('--red') : cv('--green')}">${b.signals}/3 ${b.warning ? '⚑' : '✓'}</span>`));
  });
  if (e.spatial) wrap.appendChild(el('div', 'row', `<span>Cross-region spatial corr</span><span style="color:${e.spatial.rising ? cv('--red') : cv('--green')}">τ=${tauStr(e.spatial.tau)} ${e.spatial.rising ? '⚑' : '✓'}</span>`));
}

function renderComposite(c) {
  $('compositeFill').style.width = `${Math.min(100, c.score * 100)}%`;
  $('compositeFill').style.background = c.score >= 0.45 ? cv('--red') : c.score >= 0.25 ? cv('--gold') : cv('--green');
  $('compositeVal').textContent = `${c.score.toFixed(3)} / 1.000`;
  $('catalystCount').textContent = `${c.activeCount} / ${c.total} catalysts active`;
}

// ── regions ──────────────────────────────────────────────────────────────────
function fillColor(f) { return f < 0.2 ? cv('--red') : f < 0.5 ? cv('--red-soft') : f < 0.7 ? cv('--gold') : cv('--green'); }
function regionCard(title, status, metrics, bars, note) {
  const c = el('div', 'region');
  const head = el('div', 'region-head');
  head.appendChild(el('h4', null, title));
  head.appendChild(el('span', `status-dot s-${status}`, `● ${status}`));
  c.appendChild(head);
  bars.forEach((b) => {
    c.appendChild(el('div', 'metric', `<span>${b.label}</span><span>${b.text}</span>`));
    const bar = el('div', 'fillbar'); const inner = el('div');
    inner.style.width = `${Math.min(100, b.frac * 100)}%`; inner.style.background = fillColor(b.frac);
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
    [{ label: `Shimen${sources.taiwan.shimen_sensor_offline ? ' (offline)' : ''}`, text: `${tw.shimen.storage.toFixed(0)} MCM · ${pct(tw.shimen.fill)}`, frac: tw.shimen.fill },
     { label: 'Zengwen', text: `${tw.zengwen.storage.toFixed(0)} MCM · ${pct(tw.zengwen.fill)}`, frac: tw.zengwen.fill }],
    tw.combinedFill < 0.5 ? 'Below 50% combined catalyst threshold.' : null));
  const az = r.arizona;
  wrap.appendChild(regionCard('Arizona', azStatus(az.depthM),
    [['Reg. trigger', '91 m'], ['Crisis', '122 m'], ['Headroom', `${(91 - az.depthM).toFixed(1)} m`]],
    [{ label: 'Groundwater depth', text: `${az.depthM.toFixed(1)} m`, frac: az.depthM / 122 }],
    'Phoenix AMA · USGS OGC water API.'));
  const de = r.saxony;
  wrap.appendChild(regionCard('Saxony', deStatus(de.elbeFlow),
    [['Eco. minimum', '8.64 MCM/d'], ['Above min', `${(((de.elbeFlow / 8.64) - 1) * 100).toFixed(0)}%`]],
    [{ label: 'Elbe flow (Dresden)', text: `${de.elbeFlow.toFixed(1)} MCM/d`, frac: Math.min(1, de.elbeFlow / 28.5) }],
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
    body.appendChild(el('div', 'sev', `sev ${c.severity}${c.status !== 'inactive' ? ` · stress ${c.stress.toFixed(3)}` : ''}`));
    if (c.status !== 'inactive' && c.detail) body.appendChild(el('div', 'detail', c.detail));
    div.appendChild(body); wrap.appendChild(div);
  });
}

// ── exposure ─────────────────────────────────────────────────────────────────
function renderExposure(scenarios, twExp) {
  new Chart($('exposureChart'), {
    type: 'bar',
    data: { labels: scenarios.map((s) => s.stress.toFixed(2)),
      datasets: [
        { label: 'Economy at risk ($B)', data: scenarios.map((s) => s.economyB), backgroundColor: scenarios.map((s) => s.stress >= 0.6 ? cv('--red') : s.stress >= 0.45 ? cv('--red-soft') : cv('--gold')) },
        { label: 'Company revenue at risk ($B)', data: scenarios.map((s) => s.companyB), backgroundColor: cv('--blue') },
      ] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: '$ Billion', color: cv('--muted') }, grid: { color: cv('--rule') }, ticks: { color: cv('--muted') } },
        x: { title: { display: true, text: 'Taiwan stress index', color: cv('--muted') }, grid: { display: false }, ticks: { color: cv('--muted') } } },
      plugins: { legend: { labels: { color: cv('--ink'), boxWidth: 12, font: { family: "'Newsreader', serif", size: 12 } } } } },
  });

  const t = el('table');
  t.innerHTML = '<tr><th>Stress</th><th>Score</th><th>Disrupt.</th><th>Co. $B</th><th>Econ. $B</th><th>Impact</th></tr>';
  scenarios.forEach((s) => {
    const cls = s.stress >= 0.6 ? 'crit' : (s.stress >= 0.4 && s.stress <= 0.5 ? 'concern' : '');
    t.appendChild(el('tr', cls, `<td>${s.stress.toFixed(2)}</td><td>${s.score}</td><td>${s.effectiveDisruptionPct}%</td><td>${fmtB(s.companyB)}</td><td>${fmtB(s.economyB)}</td><td style="text-align:left">${s.impact}</td>`));
  });
  $('scenarioTable').appendChild(t);

  twExp.topCompanies.forEach((c) => {
    const div = el('div', 'company');
    div.appendChild(el('div', 'tkr', c.ticker));
    div.appendChild(el('div', 'amt', fmtB(c.atRiskB)));
    div.appendChild(el('div', 'nm', `${c.company} · ${c.impact}`));
    $('companyList').appendChild(div);
  });
}

function renderSources(s) {
  [
    `Taiwan reservoirs (live snapshot): WRA opendata <code>2be9044c</code> — ${s.taiwan.source_date}`,
    `Taiwan reservoir history: <a href="https://fhy.wra.gov.tw/fhyv2/monitor/reservoir" target="_blank" rel="noopener">WRA FHY disaster system</a> (ReservoirHistoryApi)`,
    `Arizona groundwater: USGS OGC water API — Phoenix AMA, ${s.usgs.sites_count} sites, ${s.usgs.source_date}`,
    `ENSO / ONI: <a href="https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" target="_blank" rel="noopener">NOAA CPC</a> — ${s.noaa.advisory_status}, ONI ${s.noaa.oni >= 0 ? '+' : ''}${s.noaa.oni} (${s.noaa.date})`,
    `Analyst desk: four independent model-driven analyses run over the same live snapshot; consensus synthesized by the committee.`,
  ].forEach((i) => $('sourceList').appendChild(el('li', null, i)));
}
