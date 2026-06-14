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
const getJSON = (f) => fetch(f, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${f} HTTP ${r.status}`); return r.json(); });
Promise.all([getJSON('data.json'), getJSON('analysis.json'), getJSON('validation.json')])
  .then(([d, a, v]) => render(d, a, v))
  .catch((err) => { $('loading').hidden = true; const e = $('error'); e.hidden = false; e.textContent = `Failed to load memo:\n${err.message}`; });

function render(d, a, v) {
  $('loading').hidden = true;
  $('app').hidden = false;
  themeCharts();
  setupTabs();

  renderMasthead(a, d);
  renderCall(a.call);
  renderWatchlist(a.watchlist);
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

  // Model & validation + How-it-works tabs
  renderForecast(v);
  renderValidation(v);
  renderAudit(v.audit);
  renderHow(v);
}

// ── tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs = document.querySelectorAll('#tabs .tab');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    ['memo', 'model', 'how'].forEach((p) => { $(`panel-${p}`).hidden = (p !== t.dataset.panel); });
    window.scrollTo(0, 0);
  }));
}

// ── info popups (glossary) ───────────────────────────────────────────────────
const GLOSSARY = {
  ar1: '<b>Lag-1 autocorrelation (AR1).</b> How much each week resembles the one before it. As a system loses resilience near a tipping point it recovers more slowly from nudges, so AR1 drifts toward 1 — a textbook "critical slowing down" warning sign.',
  variance: '<b>Variance.</b> How widely the values swing around their average. Rising variance can signal a system being pushed around more easily as it weakens.',
  returnRate: '<b>Return rate.</b> How fast the system snaps back to normal after a wobble (≈ −ln AR1). It falls toward zero as a tipping point nears.',
  tau: "<b>Kendall's τ.</b> A trend score from −1 to +1 measuring whether an indicator is consistently rising or falling over time. We flag an indicator when |τ| ≥ 0.50.",
  detrend: '<b>Detrending.</b> Subtracting the slow seasonal trend so we measure the fluctuations around it. Essential here — without it, a reservoir\'s normal draw/fill cycle fakes a warning signal.',
  spatial: '<b>Spatial correlation.</b> How in-sync two reservoirs move. Rising correlation means they are losing independence and starting to fail together — a contagion signature.',
  composite: '<b>Composite stress score.</b> A 0–1 blend of all active catalysts. Higher = more of the early-warning conditions are firing at once.',
  probability: '<b>Forecast probability.</b> The model\'s estimate of the chance a curtailment-class drought begins within ~6 months, from current hydrology. Calibrated against 16 years of history.',
  band: '<b>Uncertainty band.</b> The ± range around the probability, widened when current conditions sit outside anything seen historically (regime novelty).',
  reliability: '<b>Reliability (calibration).</b> Do things the model calls "70% likely" actually happen ~70% of the time? A diagonal line = honest probabilities.',
  precision: '<b>Precision.</b> Of all the times the model raised an actionable alert, the fraction that were actually followed by a drought. The rest are false alarms.',
  lead: '<b>Lead time.</b> How many weeks before a drought the model first raised a <em>sustained</em> alert (3+ weeks), not a one-week flicker.',
  falsealarm: '<b>False alarm.</b> An actionable alert that was NOT followed by a drought within the horizon. Reported as prominently as the hits — being wrong matters.',
  novelty: '<b>Regime novelty.</b> Flags when current conditions are outside the historical envelope. When true, the model widens its uncertainty and the rule shrinks position size.',
  enso: '<b>ENSO / ONI.</b> The El Niño–La Niña index. La Niña (negative ONI) is the documented precursor to Taiwan\'s 2015 and 2021 droughts.',
  walkforward: '<b>Walk-forward test.</b> At each past week the model is shown ONLY data available up to then, so the backtest never peeks at the future.',
  seasonnull: '<b>Seasonal null model.</b> A deliberately naive model that knows only the calendar and the water level. If the full model can\'t beat it, the "skill" was just seasonality.',
  conviction: '<b>Conviction cap.</b> A hard limit that shrinks position size because the track record is only a handful of events — a clean backtest is never allowed to become false certainty.',
  exposure: '<b>Exposure score (0–100).</b> Analyst judgement of how much of the company\'s revenue runs through TSMC-Taiwan leading-edge wafers with no substitute. Higher = more to lose in a curtailment.',
  transmission: '<b>Transmission score (0–100).</b> How <em>cleanly</em> a Taiwan water shock would actually move the stock on fundamentals, vs. being drowned out by AI-demand narrative, crowding or squeeze risk. This is why NVDA ranks last despite the highest exposure.',
  hype: '<b>Hype risk.</b> How much narrative/momentum insulates a name from a slow fundamental catalyst. High = a shortage can be spun bullish and shorts can get squeezed.',
};
function info(key) {
  const t = GLOSSARY[key]; if (!t) return '';
  return `<span class="info" tabindex="0" role="button" aria-label="explain">i<span class="info-pop">${t}</span></span>`;
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
  t.innerHTML = `<tr><th>Indicator</th><th>Latest</th><th>τ${info('tau')}</th><th></th></tr>`;
  const names = { ar1: 'AR1', variance: 'Variance', returnRate: 'Return rate' };
  for (const k of ['ar1', 'variance', 'returnRate']) {
    const i = indicators[k]; if (!i) continue;
    const latest = i.latest == null ? (k === 'returnRate' ? '∞' : '—') : (+i.latest).toFixed(3);
    const cls = i.flagged ? 'tau-flag' : 'tau-dim';
    t.appendChild(el('tr', null, `<td>${names[k]}${info(k)}</td><td>${latest}</td><td class="${cls}">${tauStr(i.tau)}</td><td class="${cls}">${i.flagged ? '⚑' : '·'}</td>`));
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

// ── Model & Validation tab ───────────────────────────────────────────────────
function renderForecast(v) {
  const c = v.current, p = c.probability, dec = c.decision, contribs = p.contributions;
  const maxc = Math.max(...Object.values(contribs), 1e-6);
  const labels = { level: 'Reservoir level', trend: 'Drawdown speed', season: 'Dry-season phase', enso: 'ENSO / La Niña', ews: 'Critical slowing down' };
  const rows = ['level', 'trend', 'season', 'enso', 'ews'].map((k) =>
    `<div class="crow"><span class="clab">${labels[k]}</span><span class="cbar"><div style="width:${(contribs[k] / maxc * 100).toFixed(0)}%"></div></span><span class="cval">${contribs[k].toFixed(2)}</span></div>`).join('');
  $('forecastCard').innerHTML = `
    <div class="fc">
      <div class="fc-top">
        <div>
          <div class="fc-p">${(p.p * 100).toFixed(0)}%${info('probability')}</div>
          <div class="fc-band">P(curtailment-class drought within ~6 months) · band ${(p.bandLow * 100).toFixed(0)}–${(p.bandHigh * 100).toFixed(0)}%${info('band')}${p.novelty ? ' · <span style="color:#e8a07a">novel regime</span>' + info('novelty') : ''}</div>
          <div class="fc-band">as of ${c.date} · combined fill ${c.fill}%</div>
        </div>
        <div class="fc-action"><div class="a">${dec.action}</div><div class="s">${dec.sizePctNav}% NAV · cap ${dec.convictionCap}${info('conviction')}</div></div>
      </div>
      <div class="fc-contrib"><div class="mini-head" style="color:#a59c8b;margin-top:0">What's driving it</div>${rows}</div>
      <div class="fc-rationale">${dec.rationale}</div>
    </div>`;
}

function renderValidation(v) {
  const f = v.full;
  const cards = [
    { cls: 'good', v: f.hitRate, l: 'Severe droughts caught', c: '6 events, 2010–2026' },
    { cls: 'warn', v: `${f.medianLeadWeeks}w`, l: `Median lead${f.leadRangeWeeks ? ` (${f.leadRangeWeeks[0]}–${f.leadRangeWeeks[1]}w)` : ''}`, c: 'first sustained alert', key: 'lead' },
    { cls: f.precision >= 0.45 ? 'warn' : 'bad', v: f.precision, l: `Precision @P≥${f.threshold}`, c: `95% CI ${f.precisionCI95[0]}–${f.precisionCI95[1]}`, key: 'precision' },
    { cls: 'warn', v: `${f.falseAlarmsPerYear}/yr`, l: 'False alarms', c: `${f.falseAlarms} in 16 yrs`, key: 'falsealarm' },
  ];
  const grid = el('div', 'metric-grid');
  cards.forEach((m) => grid.appendChild(el('div', `mcard ${m.cls}`,
    `<div class="mv">${m.v}</div><div class="ml">${m.l}${m.key ? info(m.key) : ''}</div><div class="mc">${m.c}</div>`)));
  $('valMetrics').appendChild(grid);

  // reliability
  new Chart($('reliabilityChart'), {
    type: 'bar',
    data: { labels: v.reliability.map((r) => r.band), datasets: [
      { label: 'Model said', data: v.reliability.map((r) => r.predicted), backgroundColor: cv('--rule-strong') },
      { label: 'Actually happened', data: v.reliability.map((r) => r.observed), backgroundColor: cv('--red') },
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { min: 0, max: 1, grid: { color: cv('--rule') }, ticks: { color: cv('--muted') } }, x: { grid: { display: false }, ticks: { color: cv('--muted') } } },
      plugins: { legend: { labels: { color: cv('--ink'), boxWidth: 12, font: { family: "'Newsreader',serif", size: 12 } } } } },
  });
  $('reliabilityNote').innerHTML = `Both bars climbing together left→right = the probabilities are honest.${info('reliability')} Top bin (80–100%) verified ~72% of the time; bottom bin, ~0%.`;

  // 2021 run-up timeline
  const tl = v.timelines['2021'] || [];
  new Chart($('timelineChart'), {
    data: { labels: tl.map((x) => x.date.slice(0, 7)), datasets: [
      { type: 'line', label: 'Combined fill %', data: tl.map((x) => x.fill), yAxisID: 'y', borderColor: cv('--zengwen'), backgroundColor: 'rgba(181,98,31,.15)', fill: true, pointRadius: 0, borderWidth: 1.5 },
      { type: 'line', label: 'Model P(drought)', data: tl.map((x) => x.p), yAxisID: 'y1', borderColor: cv('--red'), pointRadius: 0, borderWidth: 2.2 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { position: 'left', min: 0, max: 100, grid: { color: cv('--rule') }, ticks: { color: cv('--muted') } },
        y1: { position: 'right', min: 0, max: 1, grid: { display: false }, ticks: { color: cv('--red') } },
        x: { grid: { display: false }, ticks: { color: cv('--muted'), maxTicksLimit: 6 } } },
      plugins: { legend: { labels: { color: cv('--ink'), boxWidth: 12, font: { family: "'Newsreader',serif", size: 12 } } } } },
  });

  // marginal-value callouts
  const csd = +(f.precision - v.noEws.precision).toFixed(2);
  $('marginalCallout').innerHTML = `
    <div class="callout"><h5>Beats a naive seasonal model${info('seasonnull')}</h5>
      <p><span class="big">${f.precision}</span> vs <span class="big">${v.seasonOnly.precision}</span> precision. The full model is ~${(f.precision / Math.max(0.01, v.seasonOnly.precision)).toFixed(1)}× more precise than one that only knows the calendar and water level — so there is real skill beyond "it's dry season."</p></div>
    <div class="callout warn"><h5>Critical slowing down adds almost nothing</h5>
      <p><span class="big">${csd >= 0 ? '+' : ''}${csd}</span> precision from the CSD term. The project's original early-warning hook is <strong>not</strong> what carries the signal — hydrological state, season and ENSO do. We report this rather than hide it.</p></div>`;
}

function renderAudit(a) {
  if (!a) return;
  $('auditCard').innerHTML = `
    <div class="audit">
      <span class="audit-verdict">VERDICT: ${a.verdict}</span>
      <span class="mono small" style="color:var(--muted)"> · would size real risk: <strong style="color:${a.wouldSizeRealRisk ? 'var(--green)' : 'var(--red)'}">${a.wouldSizeRealRisk ? 'yes' : 'no'}</strong></span>
      <div class="danger"><strong>Most dangerous flaw.</strong> ${a.mostDangerousFlaw}</div>
      <ul>${a.keyFindings.map((f) => `<li>${f}</li>`).join('')}</ul>
      <div class="cap"><strong>Cap recommendation:</strong> ${a.maxCapRecommendation}</div>
    </div>`;
}

// ── How it works tab ─────────────────────────────────────────────────────────
function renderHow(v) {
  const m = v.model, w = m.weights;
  $('howContent').innerHTML = `
   <div class="how">
    <h3>The pipeline — from raw water data to a position</h3>
    <p>Nothing here rests on an opinion. Real measurements flow through deterministic code into a calibrated probability and a written rule. The AI's job is only to <em>read and explain</em> that result — never to supply the conviction.</p>
    <div class="flow">
      <div class="step"><b>1 · Real data</b>WRA reservoirs, USGS groundwater, NOAA ENSO — timestamped, cited, with offline-sensor handling.</div>
      <div class="arrow">→</div>
      <div class="step"><b>2 · Deterministic signals</b>AR1, variance, return rate, detrending${info('detrend')} — plain code, reproducible.</div>
      <div class="arrow">→</div>
      <div class="step"><b>3 · Calibrated probability</b>${info('probability')}A low-parameter model, validated on 16 years.</div>
      <div class="arrow">→</div>
      <div class="step"><b>4 · Pre-registered rule</b>Probability → action → capped size. Decided in code beforehand.</div>
      <div class="arrow">→</div>
      <div class="step"><b>5 · Desk reads it</b>Four analyst agents + an auditor interpret &amp; red-team — they don't invent the number.</div>
    </div>

    <h3>What each signal means</h3>
    <dl class="deflist">
      <dt>AR1${info('ar1')}</dt><dd>Lag-1 autocorrelation — the core "critical slowing down" indicator.</dd>
      <dt>Variance${info('variance')}</dt><dd>Swing size around the mean.</dd>
      <dt>Return rate${info('returnRate')}</dt><dd>How fast the system recovers from a wobble.</dd>
      <dt>Kendall τ${info('tau')}</dt><dd>Trend score for any indicator; we flag at |τ|≥0.50.</dd>
      <dt>Detrending${info('detrend')}</dt><dd>Removing the seasonal cycle so we don't mistake it for a warning.</dd>
      <dt>Spatial corr.${info('spatial')}</dt><dd>Whether reservoirs are starting to fail together.</dd>
    </dl>

    <h3>The forecast model &amp; its rule</h3>
    <p>A transparent weighted model. The weights are fixed from first principles (hydrology), <strong>not</strong> fitted to the backtest:</p>
    <dl class="deflist">
      <dt>Reservoir level</dt><dd>weight ${w.level} — how unusually low storage is for the season (dominant driver).</dd>
      <dt>Drawdown speed</dt><dd>weight ${w.trend} — how fast it is falling.</dd>
      <dt>Dry-season phase</dt><dd>weight ${w.season} — is a recharge window ahead, or months of dry season?</dd>
      <dt>ENSO / La Niña${info('enso')}</dt><dd>weight ${w.enso} — the documented drought precursor.</dd>
      <dt>Critical slowing down</dt><dd>weight ${w.ews} — deliberately small; the backtest shows it adds little, and we say so.</dd>
    </dl>
    <p>Horizon ${m.horizonWeeks} weeks. Severe-drought threshold ${m.severeThreshold}% combined fill. The rule maps probability to STAND&nbsp;DOWN → WATCH → STARTER → PRESS → MAX, and multiplies every size by a conviction cap${info('conviction')} so a thin track record can never become a big bet.</p>

    <h3>How we keep the backtest honest</h3>
    <p class="principle"><strong>Your hard lesson is the design constraint here.</strong> A model over-fitted to history is exactly how a portfolio gets cut 75–80%. So:</p>
    <div class="principle">Weights are set from first principles, never tuned to maximise backtest accuracy.</div>
    <div class="principle">The test is strictly causal${info('walkforward')} — at each past week the model sees only data up to then.</div>
    <div class="principle">A naive seasonal null model${info('seasonnull')} is reported alongside — skill that doesn't beat it isn't real.</div>
    <div class="principle">Lead time${info('lead')} is measured from the first <em>sustained</em> alert, so a dry-season alarm can't fake foresight.</div>
    <div class="principle">False alarms${info('falsealarm')} and confidence intervals are shown as loudly as the wins.</div>
    <div class="principle">When conditions are novel${info('novelty')}, the model widens its uncertainty and the rule shrinks the position.</div>

    <h3>The agents behind it</h3>
    <div class="role"><span class="rn">The forecast engine</span> <span class="rr">deterministic code</span><div>Computes the probability and the rule's action. No language model involved — fully reproducible.</div></div>
    <div class="role"><span class="rn">Four analyst agents</span> <span class="rr">read the signal</span><div>A single-name short-seller, an event-driven PM, a global-macro PM and a chief risk officer each interpret the computed result from their angle. They argue over what to <em>do</em> — they do not change the number.</div></div>
    <div class="role"><span class="rn">The model auditor</span> <span class="rr">red-team</span><div>An independent agent told to find the flaws — overfitting, leakage, seasonality artefacts. Its verdict (<strong>${v.audit ? v.audit.verdict : '—'}</strong>) is published on the validation tab unedited, including the findings that count against the model.</div></div>
    <div class="role"><span class="rn">The committee</span> <span class="rr">synthesis</span><div>Weighs the desk and the auditor into one capped, trigger-gated call — and is willing to say "no edge, stand down" when the evidence says so.</div></div>

    <h3>What this is — and is not</h3>
    <p>It <strong>is</strong> a causal, calibrated early-warning monitor for Taiwan reservoir stress, honest about its error rates. It is <strong>not</strong> yet a proven equity-dislocation predictor: the chain from reservoir level → fab curtailment → share-price move is assumed, not validated, and the sample is only six droughts. Treat every number as evidence to weigh, not an instruction to follow.</p>
   </div>`;
}

// ── Watchlist ────────────────────────────────────────────────────────────────
function renderWatchlist(w) {
  if (!w) return;
  $('watchlistNote').innerHTML = `${w.note} <span class="mono small">Exposure${info('exposure')} · transmission${info('transmission')} · hype${info('hype')}</span>`;
  $('watchlistCaveat').innerHTML = w.caveat;

  const row = (n) => {
    const sat = n.ticker === 'NVDA' ? ' satellite' : '';
    const trn = n.transmission != null ? `<div class="wl-bars"><span>exposure</span><span class="wl-bar exp"><div style="width:${n.exposure}%"></div></span><span>transmission</span><span class="wl-bar trn"><div style="width:${n.transmission}%"></div></span></div>` :
      `<div class="wl-bars"><span>exposure</span><span class="wl-bar exp"><div style="width:${n.exposure}%"></div></span></div>`;
    return `<div class="wl-row${sat}">
      <div class="wl-rank">${n.rank}</div>
      <div><div class="wl-tkr">${n.ticker}</div><div class="wl-co">${n.company}</div><span class="wl-dir ${n.direction || (w.short.includes(n) ? 'SHORT' : 'LONG')}">${n.direction || (w.short.includes(n) ? 'SHORT' : 'LONG')}</span></div>
      <div class="wl-mid">
        <div class="wl-meta"><span>${n.capTier}-cap</span><span>·</span><span>${n.channel}</span><span class="wl-chip hype-${n.hypeRisk}">hype ${n.hypeRisk}</span><span class="wl-chip">score ${n.consensus}</span></div>
        ${trn}
        <div class="wl-reason">${n.reason}</div>
      </div>
    </div>`;
  };
  $('watchlistShort').innerHTML = `<div class="wl">${w.short.map((n) => row({ ...n, direction: 'SHORT' })).join('')}</div>`;
  $('watchlistLong').innerHTML = `<div class="wl">${w.long.map((n) => row({ ...n, direction: 'LONG' })).join('')}</div>`;
}
