// =============================================
//  STRATEGY TRACKER VIEW
// =============================================
import { getStrategySetups, saveStrategySetup, deleteStrategySetup, uploadScreenshot } from '../db.js';
import { todayString, getWeekRange, getMonthRange, getDaysInMonth,
         addDays, formatDate, formatDateShort,
         escapeHtml, nl2br, getSignalDisplay,
         getOutcomeBadge, getDirectionBadge } from '../utils.js';
import { showToast } from '../app.js';

// ---- Module state ----
let currentWeekStart        = null;
let stMonthYear             = null;
let stMonthMonth            = null;
let pendingSetupScreenshots = [];  // { file, localUrl, uploaded, url? }

const DEFAULT_PAIRS = ['EURUSD', 'GBPUSD'];

function updateExtremePriceLabel(direction) {
  const label = document.getElementById('st-extreme-price-label');
  if (!label) return;
  label.textContent = direction === 'long' ? 'Lowest Reached'
    : direction === 'short' ? 'Highest Reached'
    : 'Extreme Price';
}

function _updateStSignalScore() {
  const btns  = document.querySelectorAll('.st-signal-toggle');
  const count = Array.from(btns).filter(b => b.classList.contains('active')).length;
  const allBtn = document.getElementById('st-signal-all');
  if (allBtn) allBtn.classList.toggle('active', count === btns.length);
  const el = document.getElementById('st-signal-score');
  if (el) el.textContent = `Score: ${count} / ${btns.length}`;
}

function getPairs() {
  try {
    const stored = localStorage.getItem('tj_strategy_pairs');
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_PAIRS];
}

function savePairs(pairs) {
  localStorage.setItem('tj_strategy_pairs', JSON.stringify(pairs));
}

// =============================================
//  MAIN RENDER
// =============================================
export async function renderStrategyTracker(container) {
  document.getElementById('page-title').textContent = 'Strategy Tracker';

  if (!currentWeekStart) {
    currentWeekStart = getWeekRange(todayString()).start;
  }

  container.innerHTML = buildShell();
  ensureModalsInDom();
  wireShell();
  await loadAll();
}

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1>Strategy Tracker</h1>
        <div class="page-header-sub">Track setups that meet your rules</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="st-export-btn" title="Export setups for LLM analysis">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export for Analysis
        </button>
        <button class="btn btn-ghost btn-sm" id="st-bulk-open-btn" title="Bulk enter setups">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Bulk Enter
        </button>
        <button class="btn btn-ghost btn-sm" id="st-manage-pairs-btn" title="Manage pairs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Pairs
        </button>
      </div>
    </div>

    <!-- All-time stats -->
    <div id="st-alltime-stats" class="stats-grid" style="margin-bottom:20px">
      <div class="loading-screen" style="padding:20px"><div class="loading-spinner"></div></div>
    </div>

    <!-- Stop-loss efficiency -->
    <div id="st-stop-efficiency" style="margin-bottom:20px"></div>

    <!-- Monthly Overview -->
    <div class="card" style="margin-bottom:20px;padding:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="font-size:14px">Monthly Overview</div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="btn btn-ghost btn-sm" id="st-month-prev">‹</button>
          <span class="text-muted text-sm" id="st-month-label" style="min-width:120px;text-align:center">Loading...</span>
          <button class="btn btn-ghost btn-sm" id="st-month-next">›</button>
        </div>
      </div>
      <div id="st-month-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="loading-screen" style="padding:12px;grid-column:span 2"><div class="loading-spinner"></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch">
        <div style="display:flex;flex-direction:column">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Cumulative R</div>
          <div style="position:relative;height:160px">
            <canvas id="st-month-r-chart"></canvas>
          </div>
          <div style="margin-top:16px;flex:1;display:flex;flex-direction:column">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">R by Week</div>
            <div style="position:relative;flex:1;min-height:120px">
              <canvas id="st-month-week-bar"></canvas>
            </div>
          </div>
        </div>
        <div id="st-month-calendar"></div>
      </div>
    </div>

    <!-- Weekly R chart -->
    <div id="st-chart-section" class="card" style="margin-bottom:20px;padding:20px">
      <div class="loading-screen" style="padding:20px"><div class="loading-spinner"></div></div>
    </div>

    <!-- Breakdown charts -->
    <div id="st-breakdown-charts" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px"></div>

    <!-- Trading Window breakdown (awake/tradeable vs asleep/away) -->
    <div id="st-session-breakdown" style="margin-bottom:20px"></div>

    <!-- Confluence Analysis -->
    <div id="st-confluence-section" style="margin-bottom:20px"></div>
    <div id="st-confluence-drilldown" style="display:none;margin-bottom:20px"></div>

    <!-- Week nav -->
    <div class="week-nav" style="margin-bottom:16px">
      <button class="btn btn-ghost btn-sm" id="st-week-prev">‹ Prev Week</button>
      <span class="week-label" id="st-week-label">Loading...</span>
      <button class="btn btn-ghost btn-sm" id="st-week-next">Next Week ›</button>
      <button class="btn btn-ghost btn-sm" id="st-week-current">This Week</button>
    </div>

    <!-- Weekly content -->
    <div id="st-week-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;
}

function wireShell() {
  window._stOpenAddModal = () => openSetupModal(null);
  document.getElementById('st-manage-pairs-btn').onclick = openPairModal;
  document.getElementById('st-bulk-open-btn').onclick = openBulkModal;
  document.getElementById('st-export-btn').onclick = openExportModal;

  document.getElementById('st-month-prev').onclick = () => navigateStMonth(-1);
  document.getElementById('st-month-next').onclick = () => navigateStMonth(1);

  document.getElementById('st-week-prev').onclick = () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadWeek();
  };
  document.getElementById('st-week-next').onclick = () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadWeek();
  };
  document.getElementById('st-week-current').onclick = () => {
    currentWeekStart = getWeekRange(todayString()).start;
    loadWeek();
  };

  // Escape key
  document.addEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
  if (e.key === 'Escape') {
    closeSetupModal();
    closePairModal();
    closeBulkModal();
    closeExportModal();
  }
}

async function loadAll() {
  await Promise.all([loadAllTimeAndChart(), loadMonthly(), loadWeek()]);
}

async function loadAllTimeAndChart() {
  const statsEl = document.getElementById('st-alltime-stats');
  const chartEl = document.getElementById('st-chart-section');
  try {
    const allSetups = await getStrategySetups();
    const stats = calcSetupStats(allSetups);
    if (statsEl) statsEl.innerHTML = buildAllTimeStats(stats);
    // Each renderer is isolated so a chart error doesn't wipe out the stats above
    try { renderChartSection(allSetups); } catch (e) { if (chartEl) chartEl.innerHTML = `<p class="text-loss text-sm" style="padding:20px">${e.message}</p>`; }
    try { renderBreakdownCharts(allSetups); } catch (e) { console.error('Breakdown charts:', e); }
    try { renderSessionBreakdown('st-session-breakdown', 'st-session-chart', allSetups); } catch (e) { console.error('Session breakdown:', e); }
    try { renderStConfluence(allSetups); } catch (e) { console.error('Confluence:', e); }
    try { renderStopEfficiency(allSetups); } catch (e) { console.error('Stop efficiency:', e); }
  } catch (err) {
    if (statsEl) statsEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

// =============================================
//  MONTHLY OVERVIEW
// =============================================
function calcSetupR(setup) {
  if (!setup.outcome || setup.outcome === 'pending') return null;
  if (setup.outcome === 'win')       return parseFloat(setup.possible_r) || 0;
  if (setup.outcome === 'loss')      return -1;
  if (setup.outcome === 'breakeven') return 0;
  return null;
}

async function loadMonthly() {
  const now = new Date();
  if (stMonthYear  === null) stMonthYear  = now.getFullYear();
  if (stMonthMonth === null) stMonthMonth = now.getMonth() + 1;

  const monthLabel = new Date(stMonthYear, stMonthMonth - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const labelEl = document.getElementById('st-month-label');
  if (labelEl) labelEl.textContent = monthLabel;

  try {
    const { start, end } = getMonthRange(stMonthYear, stMonthMonth);
    const setups = await getStrategySetups({ startDate: start, endDate: end });

    const closed  = setups.filter(s => s.outcome && s.outcome !== 'pending');
    const wins    = closed.filter(s => s.outcome === 'win');
    const losses  = closed.filter(s => s.outcome === 'loss');
    const totalR  = parseFloat((wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) - losses.length).toFixed(2));
    const winRate = closed.length ? (wins.length / closed.length * 100) : 0;

    const rColor = totalR >= 0 ? 'profit' : 'loss';
    const rSign  = totalR >= 0 ? '+' : '';

    const statsEl = document.getElementById('st-month-stats');
    if (statsEl) statsEl.innerHTML = `
      <div class="stat-card ${closed.length ? rColor : ''}">
        <div class="stat-label">Month R</div>
        <div class="stat-value ${closed.length ? rColor : 'neutral'}">${closed.length ? rSign + totalR.toFixed(2) + 'R' : '—'}</div>
        <div class="stat-sub">${wins.length}W / ${losses.length}L · ${closed.length} closed</div>
      </div>
      <div class="stat-card ${winRate >= 50 && closed.length ? 'profit' : ''}">
        <div class="stat-label">Month Win Rate</div>
        <div class="stat-value neutral">${closed.length ? winRate.toFixed(1) + '%' : '—'}</div>
        <div class="stat-sub">${closed.length} setup${closed.length !== 1 ? 's' : ''} closed</div>
      </div>
    `;

    renderStMonthRChart(setups);
    renderStMonthWeekBar(setups, stMonthYear, stMonthMonth);
    renderStMonthCalendar(setups, stMonthYear, stMonthMonth);
  } catch (err) {
    const statsEl = document.getElementById('st-month-stats');
    if (statsEl) statsEl.innerHTML = `<p class="text-loss text-sm" style="grid-column:span 2">${err.message}</p>`;
  }
}

async function navigateStMonth(delta) {
  let m = stMonthMonth + delta;
  let y = stMonthYear;
  if (m < 1)  { m = 12; y--; }
  if (m > 12) { m = 1;  y++; }
  stMonthYear  = y;
  stMonthMonth = m;
  await loadMonthly();
}

function renderStMonthRChart(setups) {
  const canvas = document.getElementById('st-month-r-chart');
  if (!canvas) return;
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }

  const closed = setups
    .filter(s => s.outcome && s.outcome !== 'pending')
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.created_at || '').localeCompare(b.created_at || ''));

  let existing = canvas.parentElement.querySelector('.st-month-chart-empty');

  if (!closed.length) {
    canvas.style.display = 'none';
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'st-month-chart-empty';
      existing.style.cssText = 'display:flex;align-items:center;justify-content:center;height:160px';
      existing.innerHTML = '<p class="text-muted text-sm">No closed setups this month</p>';
      canvas.parentElement.appendChild(existing);
    }
    return;
  }

  canvas.style.display = '';
  if (existing) existing.remove();

  let cumR = 0;
  const labels = [];
  const data   = [];
  closed.forEach(s => {
    const r = calcSetupR(s);
    if (r !== null) {
      cumR = parseFloat((cumR + r).toFixed(2));
      labels.push(s.date);
      data.push(cumR);
    }
  });

  const isProfit = cumR >= 0;
  const color    = isProfit ? '#00d97e' : '#ff4757';

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          g.addColorStop(0, isProfit ? 'rgba(0,217,126,0.25)' : 'rgba(255,71,87,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        tension: 0.4,
        pointRadius: data.length > 15 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R cumulative`
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8892a4', font: { size: 10 }, callback: v => `${v}R` }
        }
      }
    }
  });
}

function renderStMonthWeekBar(setups, year, month) {
  const canvas = document.getElementById('st-month-week-bar');
  if (!canvas) return;
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }

  const pad = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const monthStart = `${year}-${pad(month)}-01`;
  const lastD      = new Date(year, month, 0);
  const monthEnd   = toStr(lastD);

  // Find first Monday on or before the 1st of the month
  const first     = new Date(year, month - 1, 1);
  const dow        = first.getDay(); // 0=Sun
  const backToMon  = dow === 0 ? 6 : dow - 1;
  const firstMon   = new Date(first);
  firstMon.setDate(firstMon.getDate() - backToMon);

  const weeks = [];
  const cur   = new Date(firstMon);
  while (toStr(cur) <= monthEnd) {
    const wStart = toStr(cur);
    const wEnd   = toStr(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 6));

    if (wEnd >= monthStart) {
      const label   = cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const bucket  = setups.filter(s => s.date >= wStart && s.date <= wEnd && s.outcome && s.outcome !== 'pending');
      const r       = parseFloat(bucket.reduce((sum, s) => sum + (calcSetupR(s) ?? 0), 0).toFixed(2));
      weeks.push({ label, r, count: bucket.length });
    }

    cur.setDate(cur.getDate() + 7);
  }

  const hasData = weeks.some(w => w.count > 0);
  canvas.style.display = hasData ? '' : 'none';
  if (!hasData) return;

  const colors  = weeks.map(w => w.r >= 0 ? 'rgba(0,217,126,0.75)' : 'rgba(255,71,87,0.75)');
  const borders = weeks.map(w => w.r >= 0 ? '#00d97e' : '#ff4757');

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks.map(w => w.label),
      datasets: [{
        data:            weeks.map(w => w.r),
        backgroundColor: colors,
        borderColor:     borders,
        borderWidth:     1,
        borderRadius:    4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1c30',
          borderColor: '#1e3558',
          borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R  (${weeks[ctx.dataIndex].count} setup${weeks[ctx.dataIndex].count !== 1 ? 's' : ''})`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#8892a4', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8892a4', font: { size: 10 }, callback: v => `${v >= 0 ? '+' : ''}${v}R` }
        }
      }
    }
  });
}

function renderStMonthCalendar(setups, year, month) {
  const el = document.getElementById('st-month-calendar');
  if (!el) return;

  const rByDate = {};
  setups.forEach(s => {
    if (!s.date || !s.outcome || s.outcome === 'pending') return;
    const r = calcSetupR(s);
    if (r === null) return;
    if (!rByDate[s.date]) rByDate[s.date] = 0;
    rByDate[s.date] = parseFloat((rByDate[s.date] + r).toFixed(2));
  });

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const today       = todayString();

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = `<div class="pnl-calendar">`;
  dayNames.forEach(d => html += `<div class="cal-header">${d}</div>`);
  for (let i = 0; i < startOffset; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const r       = rByDate[dateStr];
    const isToday = dateStr === today;
    const cls     = r !== undefined ? (r > 0 ? 'profit' : r < 0 ? 'loss' : 'breakeven') : 'no-trades';
    const rLabel  = r !== undefined
      ? `<div class="cal-day-pnl">${r >= 0 ? '+' : ''}${r.toFixed(1)}R</div>`
      : '';

    html += `<div class="cal-day ${cls} ${isToday ? 'today' : ''}" style="cursor:pointer" title="${dateStr}${r !== undefined ? ': ' + (r >= 0 ? '+' : '') + r + 'R' : ''}" onclick="window._showDaySetups('${dateStr}')">
      <div class="cal-day-num">${day}</div>${rLabel}
    </div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

window._showDaySetups = async function(dateStr) {
  _dayModalSortState = { col: null, dir: 'asc' };
  const modal   = document.getElementById('day-modal');
  const titleEl = document.getElementById('day-modal-title');
  const bodyEl  = document.getElementById('day-modal-body');
  if (!modal) return;

  const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  titleEl.textContent = label;
  bodyEl.innerHTML = '<div class="loading-screen" style="min-height:80px"><div class="loading-spinner"></div></div>';
  modal.classList.remove('hidden');

  try {
    _dayModalSetups = await getStrategySetups({ startDate: dateStr, endDate: dateStr });
    if (!_dayModalSetups.length) {
      bodyEl.innerHTML = '<div class="empty-state" style="padding:32px"><p class="text-muted">No setups on this day.</p></div>';
      return;
    }
    _renderDayModalTable(bodyEl);
  } catch (err) {
    bodyEl.innerHTML = `<div class="empty-state"><p class="text-loss">${err.message}</p></div>`;
  }
};

function _sortedDaySetups() {
  const { col, dir } = _dayModalSortState;
  if (!col) return [..._dayModalSetups];
  return [..._dayModalSetups].sort((a, b) => {
    let av, bv;
    if (col === 'time')    { av = a.trade_time || '';  bv = b.trade_time || ''; }
    if (col === 'pair')    { av = a.pair || '';        bv = b.pair || ''; }
    if (col === 'dir')     { av = a.direction || '';   bv = b.direction || ''; }
    if (col === 'r')       { av = parseFloat(a.possible_r) || 0; bv = parseFloat(b.possible_r) || 0; }
    if (col === 'outcome') { av = a.outcome || '';     bv = b.outcome || ''; }
    if (col === 'signals') { av = Array.isArray(a.signals) ? a.signals.length : 0; bv = Array.isArray(b.signals) ? b.signals.length : 0; }
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });
}

function _renderDayModalTable(bodyEl) {
  const closed = _dayModalSetups.filter(s => s.outcome && s.outcome !== 'pending');
  const wins   = closed.filter(s => s.outcome === 'win').length;
  const losses = closed.filter(s => s.outcome === 'loss').length;
  const totalR = closed.reduce((sum, s) => sum + (calcSetupR(s) ?? 0), 0);
  const sorted = _sortedDaySetups();

  const sortIcon = col => {
    if (_dayModalSortState.col !== col) return ' <span style="opacity:0.35;font-size:10px">↕</span>';
    return _dayModalSortState.dir === 'asc'
      ? ' <span style="color:var(--accent);font-size:10px">↑</span>'
      : ' <span style="color:var(--accent);font-size:10px">↓</span>';
  };

  bodyEl.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      ${closed.length ? `<span class="td-mono ${totalR >= 0 ? 'text-profit' : 'text-loss'}" style="font-weight:700;font-size:1.1em">${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R</span>` : ''}
      <span class="text-muted">${wins}W / ${losses}L · ${_dayModalSetups.length} setup${_dayModalSetups.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th data-sort-col="time"    style="cursor:pointer;user-select:none">Time${sortIcon('time')}</th>
            <th data-sort-col="pair"    style="cursor:pointer;user-select:none">Pair${sortIcon('pair')}</th>
            <th data-sort-col="dir"     style="cursor:pointer;user-select:none">Dir${sortIcon('dir')}</th>
            <th data-sort-col="r"       style="cursor:pointer;user-select:none">Possible R${sortIcon('r')}</th>
            <th data-sort-col="outcome" style="cursor:pointer;user-select:none">Outcome${sortIcon('outcome')}</th>
            <th data-sort-col="signals" style="cursor:pointer;user-select:none">Signals${sortIcon('signals')}</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(s => `
            <tr style="cursor:pointer" data-id="${s.id}">
              <td class="td-mono" style="font-size:12px">${s.trade_time || '—'}</td>
              <td><strong>${s.pair || '—'}</strong></td>
              <td>${getDirectionBadge(s.direction)}</td>
              <td class="td-mono">${s.possible_r != null ? s.possible_r + 'R' : '—'}</td>
              <td>${getOutcomeBadge(s.outcome)}</td>
              <td class="text-sm text-muted">${getSignalDisplay(s.signals)}</td>
              <td class="text-muted text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.notes || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const modal = document.getElementById('day-modal');
  bodyEl.querySelectorAll('th[data-sort-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sortCol;
      if (_dayModalSortState.col === col) {
        _dayModalSortState.dir = _dayModalSortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        _dayModalSortState.col = col;
        _dayModalSortState.dir = 'asc';
      }
      _renderDayModalTable(bodyEl);
    });
  });

  bodyEl.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const setup = _dayModalSetups.find(s => s.id === row.dataset.id);
      if (setup) {
        modal.classList.add('hidden');
        openSetupModal(setup);
      }
    });
  });
}

// =============================================
//  ALL-TIME STATS + CHART
// =============================================

function calcSetupStats(setups) {
  const closed  = setups.filter(s => s.outcome && s.outcome !== 'pending');
  const wins    = closed.filter(s => s.outcome === 'win');
  const losses  = closed.filter(s => s.outcome === 'loss');
  const bes     = closed.filter(s => s.outcome === 'breakeven');
  const pending = setups.filter(s => !s.outcome || s.outcome === 'pending');

  const winRate  = closed.length ? (wins.length / closed.length * 100) : 0;

  const avgWinR  = wins.length
    ? wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) / wins.length
    : 0;
  const avgLossR = losses.length
    ? losses.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) / losses.length
    : 0;

  // Total R: sum wins' possible_r, deduct 1R per loss
  const totalR = wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) - losses.length;

  // Current streak (most recent first — setups ordered desc by date)
  let streak = 0;
  let streakType = '';
  for (const s of setups) {
    if (!s.outcome || s.outcome === 'pending') continue;
    if (!streakType) { streakType = s.outcome === 'win' ? 'win' : 'loss'; streak = 1; continue; }
    if ((streakType === 'win' && s.outcome === 'win') || (streakType === 'loss' && s.outcome === 'loss')) {
      streak++;
    } else break;
  }

  return {
    total: setups.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    bes: bes.length,
    pending: pending.length,
    winRate,
    avgWinR,
    avgLossR,
    totalR,
    streak,
    streakType,
  };
}

function buildAllTimeStats(stats) {
  const rColor = stats.totalR >= 0 ? 'text-profit' : 'text-loss';
  const rSign  = stats.totalR >= 0 ? '+' : '';

  let streakLabel = '—';
  if (stats.streak > 0) {
    streakLabel = `${stats.streak} ${stats.streakType === 'win' ? 'W' : 'L'}`;
  }

  return `
    <div class="stat-card primary">
      <div class="stat-label">Total Setups</div>
      <div class="stat-value neutral">${stats.total}</div>
      <div class="stat-sub">${stats.closed} closed · ${stats.pending} pending</div>
    </div>
    <div class="stat-card ${stats.winRate >= 50 && stats.closed ? 'profit' : ''}">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value neutral">${stats.closed ? stats.winRate.toFixed(1) + '%' : '—'}</div>
      <div class="stat-sub">${stats.wins}W / ${stats.losses}L / ${stats.bes}BE</div>
    </div>
    <div class="stat-card secondary">
      <div class="stat-label">Total R</div>
      <div class="stat-value ${rColor}">${stats.closed ? rSign + stats.totalR.toFixed(2) + 'R' : '—'}</div>
      <div class="stat-sub">Wins: +${stats.avgWinR.toFixed(2)}R avg · Loss: −1R each</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">Current Streak</div>
      <div class="stat-value neutral">${streakLabel}</div>
      <div class="stat-sub">Most recent run</div>
    </div>
  `;
}

// =============================================
//  WEEKLY R CHART
// =============================================
function renderChartSection(allSetups) {
  const el = document.getElementById('st-chart-section');
  if (!el) return;

  // Build weekly buckets from all setups
  const weekMap = {};
  for (const s of allSetups) {
    if (!s.date) continue;
    const ws = getWeekRange(s.date).start;
    if (!weekMap[ws]) weekMap[ws] = [];
    weekMap[ws].push(s);
  }

  const weeks = Object.keys(weekMap).sort();
  if (!weeks.length) {
    el.innerHTML = `<p class="text-sm text-muted" style="text-align:center;padding:20px">No data yet for chart</p>`;
    return;
  }

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div class="card-title" style="font-size:14px">Weekly R Performance</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-xs st-chart-filter ${weeks.length <= 4 ? 'active' : ''}" data-weeks="4">4W</button>
        <button class="btn btn-ghost btn-xs st-chart-filter ${weeks.length > 4 && weeks.length <= 8 ? 'active' : ''}" data-weeks="8">8W</button>
        <button class="btn btn-ghost btn-xs st-chart-filter ${weeks.length > 8 && weeks.length <= 12 ? 'active' : ''}" data-weeks="12">12W</button>
        <button class="btn btn-ghost btn-xs st-chart-filter ${weeks.length > 12 ? 'active' : ''}" data-weeks="all">All</button>
      </div>
    </div>
    <div style="position:relative;height:180px">
      <canvas id="st-weekly-chart"></canvas>
    </div>
  `;

  // Default filter: show enough to cover actual data, cap at 12 unless more
  const defaultFilter = weeks.length <= 4 ? 4 : weeks.length <= 8 ? 8 : weeks.length <= 12 ? 12 : 'all';
  drawWeeklyChart(weeks, weekMap, defaultFilter);

  // Mark correct button active
  document.querySelectorAll('.st-chart-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.weeks === String(defaultFilter));
    btn.onclick = () => {
      document.querySelectorAll('.st-chart-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawWeeklyChart(weeks, weekMap, btn.dataset.weeks === 'all' ? 'all' : parseInt(btn.dataset.weeks));
    };
  });
}

function drawWeeklyChart(allWeeks, weekMap, filter) {
  const weeks = filter === 'all' ? allWeeks : allWeeks.slice(-filter);

  const labels = weeks.map(ws => {
    const d = new Date(ws + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  });

  const data = weeks.map(ws => {
    const setups = weekMap[ws];
    const wins   = setups.filter(s => s.outcome === 'win');
    const losses = setups.filter(s => s.outcome === 'loss');
    const r = wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) - losses.length;
    return parseFloat(r.toFixed(2));
  });

  const colors = data.map(v => v >= 0 ? 'rgba(0,217,126,0.8)' : 'rgba(255,71,87,0.8)');
  const borderColors = data.map(v => v >= 0 ? '#00d97e' : '#ff4757');

  const canvas = document.getElementById('st-weekly-chart');
  if (!canvas) return;

  if (canvas._chart) { canvas._chart.destroy(); }

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Weekly R',
        data,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8892a4', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#8892a4',
            font: { size: 11 },
            callback: v => `${v}R`
          }
        }
      }
    }
  });
}

// =============================================
//  BREAKDOWN CHARTS (Day of Week + By Pair)
// =============================================
function renderBreakdownCharts(allSetups) {
  const el = document.getElementById('st-breakdown-charts');
  if (!el) return;

  const closed = allSetups.filter(s => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
  if (!closed.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:16px">R by Day of Week</div>
      <div style="position:relative;height:180px"><canvas id="st-dow-chart"></canvas></div>
    </div>
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:16px">R by Pair</div>
      <div style="position:relative;height:180px"><canvas id="st-pair-chart"></canvas></div>
    </div>
  `;

  _drawDowChart(closed);
  _drawPairChart(closed);
}

function _calcR(setups) {
  const wins   = setups.filter(s => s.outcome === 'win');
  const losses = setups.filter(s => s.outcome === 'loss');
  return parseFloat((wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) - losses.length).toFixed(2));
}

function _winRate(setups) {
  const closed = setups.filter(s => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
  if (!closed.length) return 0;
  return parseFloat((closed.filter(s => s.outcome === 'win').length / closed.length * 100).toFixed(1));
}

function _barChart(canvasId, labels, rData, wrData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas._chart) canvas._chart.destroy();

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total R',
          data: rData,
          backgroundColor: rData.map(v => v >= 0 ? 'rgba(0,217,126,0.75)' : 'rgba(255,71,87,0.75)'),
          borderColor:     rData.map(v => v >= 0 ? '#00d97e' : '#ff4757'),
          borderWidth: 1, borderRadius: 4, yAxisID: 'y',
        },
        {
          label: 'Win %',
          data: wrData,
          type: 'line',
          borderColor: '#3d7ef0', borderWidth: 2,
          pointRadius: 4, pointBackgroundColor: '#3d7ef0',
          yAxisID: 'y2', tension: 0,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Win %' ? `${ctx.parsed.y}%` : `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y:  { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}R` }, position: 'left' },
        y2: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}%` }, position: 'right', min: 0, max: 100 }
      }
    }
  });
}

function _drawDowChart(setups) {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const byDay = {};
  days.forEach(d => byDay[d] = []);

  setups.forEach(s => {
    if (!s.date) return;
    const dow = new Date(s.date + 'T00:00:00').getDay();
    const name = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
    if (byDay[name]) byDay[name].push(s);
  });

  const active = days.filter(d => byDay[d].length);
  _barChart('st-dow-chart', active, active.map(d => _calcR(byDay[d])), active.map(d => _winRate(byDay[d])));
}

function _drawPairChart(setups) {
  const byPair = {};
  setups.forEach(s => {
    const p = s.pair || 'Unknown';
    if (!byPair[p]) byPair[p] = [];
    byPair[p].push(s);
  });

  const pairs = Object.keys(byPair).sort((a, b) => _calcR(byPair[b]) - _calcR(byPair[a]));
  _barChart('st-pair-chart', pairs, pairs.map(p => _calcR(byPair[p])), pairs.map(p => _winRate(byPair[p])));
}

// =============================================
//  TRADING WINDOW BREAKDOWN (awake/tradeable vs asleep/away)
// =============================================
// Awake/tradeable window: 06:00-18:00. Everything else (18:00-06:00, wrapping
// past midnight) is the asleep/away window.
function _sessionWindowFor(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const mins = h * 60 + m;
  return (mins >= 6 * 60 && mins < 18 * 60) ? 'awake' : 'asleep';
}

function renderSessionBreakdown(containerId, canvasId, allSetups, title = 'R by Trading Window') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const closed = allSetups.filter(s => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
  const timed  = closed.filter(s => _sessionWindowFor(s.trade_time) !== null);
  if (!timed.length) { el.innerHTML = ''; return; }

  const buckets = {
    awake:  timed.filter(s => _sessionWindowFor(s.trade_time) === 'awake'),
    asleep: timed.filter(s => _sessionWindowFor(s.trade_time) === 'asleep'),
  };
  const untimed = closed.length - timed.length;

  const statCard = (label, setups) => {
    const totalR = _calcR(setups);
    const wins   = setups.filter(s => s.outcome === 'win').length;
    const losses = setups.filter(s => s.outcome === 'loss').length;
    const wr     = _winRate(setups);
    const rColor = totalR >= 0 ? 'profit' : 'loss';
    return `
      <div class="stat-card ${setups.length ? rColor : ''}">
        <div class="stat-label">${label}</div>
        <div class="stat-value ${setups.length ? rColor : 'neutral'}">${setups.length ? (totalR >= 0 ? '+' : '') + totalR.toFixed(2) + 'R' : '—'}</div>
        <div class="stat-sub">${setups.length} setup${setups.length !== 1 ? 's' : ''} · ${wins}W / ${losses}L · ${wr}% WR</div>
      </div>`;
  };

  el.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:4px">${title}</div>
      <div class="card-subtitle" style="margin-bottom:16px">
        Setups while you can actually trade (06:00–18:00) vs while asleep/away (18:00–06:00)${untimed ? ` · ${untimed} setup${untimed !== 1 ? 's' : ''} without a recorded time excluded` : ''}
      </div>
      <div class="stats-grid" style="margin-bottom:16px">
        ${statCard('Awake / Tradeable (06:00–18:00)', buckets.awake)}
        ${statCard('Asleep / Away (18:00–06:00)', buckets.asleep)}
      </div>
      <div style="position:relative;height:180px"><canvas id="${canvasId}"></canvas></div>
    </div>
  `;

  const labels = ['Awake (06:00–18:00)', 'Asleep (18:00–06:00)'];
  _barChart(canvasId, labels,
    [buckets.awake, buckets.asleep].map(_calcR),
    [buckets.awake, buckets.asleep].map(_winRate));
}

// =============================================
//  CONFLUENCE ANALYSIS
// =============================================
const ST_SIGNALS     = ['Dollar', 'EURUSD', 'GBPUSD'];
const ST_SIG_LABELS  = { Dollar: 'Dollar', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD' };
const ST_SIG_SHORT   = { Dollar: 'DLR', EURUSD: 'EUR', GBPUSD: 'GBP' };
let _stConfByCombination = {};
let _stConfCombos        = [];
let _dayModalSetups      = [];
let _dayModalSortState   = { col: null, dir: 'asc' };

function renderStConfluence(allSetups) {
  const el = document.getElementById('st-confluence-section');
  if (!el) return;

  const closed = allSetups.filter(s => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
  if (!closed.length) { el.innerHTML = ''; return; }

  // Group by exact signal combination (canonical sorted key)
  _stConfByCombination = {};
  closed.forEach(s => {
    const sigs = Array.isArray(s.signals) ? [...s.signals].sort() : [];
    const key  = sigs.length ? sigs.join('+') : '__none__';
    if (!_stConfByCombination[key]) _stConfByCombination[key] = { signals: sigs, setups: [] };
    _stConfByCombination[key].setups.push(s);
  });

  // Sort by total R descending
  _stConfCombos = Object.entries(_stConfByCombination)
    .sort((a, b) => _calcR(b[1].setups) - _calcR(a[1].setups));

  const chartHeight = Math.max(220, _stConfCombos.length * 38);

  el.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:4px">Signal Confluence Analysis</div>
      <div class="card-subtitle" style="margin-bottom:16px">Performance by exact signal combination — click a bar or row to drill down</div>
      <div style="position:relative;height:${chartHeight}px"><canvas id="st-confluence-chart"></canvas></div>
      <div id="st-confluence-table" style="margin-top:20px"></div>
    </div>
  `;

  const labels   = _stConfCombos.map(([key, {signals}]) =>
    key === '__none__' ? 'None' : signals.map(s => ST_SIG_SHORT[s] || s).join('+'));
  const rValues  = _stConfCombos.map(([, {setups}]) => _calcR(setups));
  const winRates = _stConfCombos.map(([, {setups}]) => setups.length ? _winRate(setups) : null);
  const barColors = rValues.map(v => v >= 0 ? 'rgba(0,217,126,0.75)' : 'rgba(255,71,87,0.75)');
  const borders   = rValues.map(v => v >= 0 ? '#00d97e' : '#ff4757');

  const canvas = document.getElementById('st-confluence-chart');
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Total R', data: rValues, backgroundColor: barColors, borderColor: borders, borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
        { label: 'Win Rate %', data: winRates, type: 'line', borderColor: '#3d7ef0', borderWidth: 2,
          pointRadius: 5, pointBackgroundColor: '#3d7ef0', yAxisID: 'y2', tension: 0, spanGaps: true }
      ]
    },
    options: {
      onClick: (e, elements) => {
        if (!elements.length) return;
        showStConfluenceDrilldown(elements[0].index);
      },
      onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: ctx => {
              const [key, {signals}] = _stConfCombos[ctx[0].dataIndex];
              return key === '__none__' ? 'No Signals' : signals.map(s => ST_SIG_LABELS[s] || s).join(' + ');
            },
            label: ctx => ctx.dataset.label === 'Win Rate %'
              ? `${ctx.parsed.y}%`
              : `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y:  { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}R` }, position: 'left' },
        y2: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}%` }, position: 'right', min: 0, max: 100 }
      }
    }
  });

  const tableEl = document.getElementById('st-confluence-table');
  if (tableEl) {
    tableEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          ${['Combination','Setups','Win %','Avg R','Total R'].map(h =>
            `<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-muted)">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${_stConfCombos.map(([key, {signals, setups}], i) => {
            const label  = key === '__none__'
              ? '<span style="color:var(--text-muted)">No Signals</span>'
              : signals.map(s => `<span style="color:var(--accent)">${ST_SIG_LABELS[s] || s}</span>`).join(' <span style="color:var(--text-muted)">+</span> ');
            const wins   = setups.filter(s => s.outcome === 'win').length;
            const totalR = _calcR(setups);
            const avgR   = setups.length ? parseFloat((totalR / setups.length).toFixed(2)) : 0;
            const wr     = setups.length ? (wins / setups.length * 100).toFixed(0) : '0';
            return `<tr style="cursor:pointer" onclick="window._showStComboSetups(${i})" title="Click to see trades">
              <td style="padding:6px 8px;font-size:12px">${label}</td>
              <td style="padding:6px 8px;font-size:12px">${setups.length}</td>
              <td style="padding:6px 8px;font-size:12px;color:var(--profit)">${wr}%</td>
              <td style="padding:6px 8px;font-size:12px;color:${avgR >= 0 ? 'var(--profit)' : 'var(--loss)'}">${avgR >= 0 ? '+' : ''}${avgR}R</td>
              <td style="padding:6px 8px;font-size:12px;color:${totalR >= 0 ? 'var(--profit)' : 'var(--loss)'}">${totalR >= 0 ? '+' : ''}${totalR}R</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    window._showStComboSetups = idx => showStConfluenceDrilldown(idx);
  }
}

function showStConfluenceDrilldown(comboIdx) {
  const panel = document.getElementById('st-confluence-drilldown');
  if (!panel) return;

  const combo = _stConfCombos[comboIdx];
  if (!combo) { panel.style.display = 'none'; return; }

  const [key, { signals, setups }] = combo;
  if (!setups.length) { panel.style.display = 'none'; return; }

  const label  = key === '__none__' ? 'No Signals' : signals.map(s => ST_SIG_LABELS[s] || s).join(' + ');
  const totalR = _calcR(setups);
  const wins   = setups.filter(s => s.outcome === 'win').length;

  panel.style.display = '';
  panel.innerHTML = `
    <div class="card">
      <div class="card-header" style="margin-bottom:16px">
        <div>
          <div class="card-title">
            <span style="color:var(--accent)">${label}</span> — ${setups.length} setup${setups.length !== 1 ? 's' : ''}
          </div>
          <div class="card-subtitle">
            ${(wins / setups.length * 100).toFixed(0)}% win rate ·
            ${totalR >= 0 ? '+' : ''}${totalR}R total ·
            ${setups.filter(s => s.outcome === 'loss').length} losses
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('st-confluence-drilldown').style.display='none'">✕ Close</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Pair</th><th>Dir</th><th>Possible R</th>
              <th>Outcome</th><th>Conf.</th><th>Notes</th><th>Screenshots</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${setups.map(s => buildSetupRow(s)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  panel.querySelectorAll('.st-edit-btn').forEach(btn => {
    btn.onclick = () => {
      const setup = setups.find(s => s.id === btn.dataset.id);
      if (setup) openSetupModal(setup);
    };
  });
  panel.querySelectorAll('.st-delete-btn').forEach(btn => {
    btn.onclick = () => confirmDeleteSetup(btn.dataset.id);
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =============================================
//  STOP-LOSS EFFICIENCY
// =============================================

// How much of the stop distance a setup actually used before resolving.
// Wins with a low % had room to use a tighter stop; losses should sit near
// 100% (that's the stop doing its job).
function calcStopEfficiency(setup) {
  const entry   = parseFloat(setup.entry_price);
  const stop    = parseFloat(setup.stop_loss);
  const extreme = parseFloat(setup.extreme_price);
  if (isNaN(entry) || isNaN(stop) || isNaN(extreme) || !setup.direction) return null;

  const stopDistance = Math.abs(entry - stop);
  if (!stopDistance) return null;

  const rawExcursion = setup.direction === 'long' ? entry - extreme : extreme - entry;
  const excursion  = Math.max(0, rawExcursion);
  const efficiency = Math.min(100, (excursion / stopDistance) * 100);

  return { stopDistance, excursion, efficiency };
}

function renderStopEfficiency(allSetups) {
  const el = document.getElementById('st-stop-efficiency');
  if (!el) return;

  const analyzed = allSetups
    .filter(s => s.outcome && s.outcome !== 'pending')
    .map(s => ({ setup: s, calc: calcStopEfficiency(s) }))
    .filter(x => x.calc !== null);

  if (!analyzed.length) { el.innerHTML = ''; return; }

  const wins   = analyzed.filter(x => x.setup.outcome === 'win');
  const losses = analyzed.filter(x => x.setup.outcome === 'loss');

  const avgWinEff  = wins.length ? wins.reduce((s, x) => s + x.calc.efficiency, 0) / wins.length : null;
  const avgLossEff = losses.length ? losses.reduce((s, x) => s + x.calc.efficiency, 0) / losses.length : null;

  const byPair = {};
  wins.forEach(x => {
    const p = x.setup.pair || 'Unknown';
    (byPair[p] || (byPair[p] = [])).push(x.calc.efficiency);
  });
  const pairRows = Object.entries(byPair)
    .map(([pair, effs]) => ({ pair, avg: effs.reduce((a, b) => a + b, 0) / effs.length, count: effs.length }))
    .sort((a, b) => a.avg - b.avg);

  const worstWins = [...wins].sort((a, b) => a.calc.efficiency - b.calc.efficiency).slice(0, 8);

  el.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:4px">Stop-Loss Efficiency</div>
      <div class="card-subtitle" style="margin-bottom:16px">How much of your stop distance winning trades actually used. Low % means room to tighten.</div>
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card ${avgWinEff !== null && avgWinEff < 60 ? 'warning' : 'profit'}">
          <div class="stat-label">Avg Stop Used (Wins)</div>
          <div class="stat-value neutral">${avgWinEff !== null ? avgWinEff.toFixed(0) + '%' : '—'}</div>
          <div class="stat-sub">${wins.length} winning setup${wins.length !== 1 ? 's' : ''} with price data</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Stop Used (Losses)</div>
          <div class="stat-value neutral">${avgLossEff !== null ? avgLossEff.toFixed(0) + '%' : '—'}</div>
          <div class="stat-sub">Should sit near 100%, confirming stops fire correctly</div>
        </div>
      </div>
      ${pairRows.length ? `
      <div style="margin-bottom:20px">
        <div class="text-xs text-muted" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Avg Stop Used by Pair (Wins)</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${pairRows.map(r => `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="min-width:80px;font-size:12px;font-weight:600">${escapeHtml(r.pair)}</span>
              <div style="flex:1;height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden">
                <div style="width:${r.avg}%;height:100%;background:${r.avg < 60 ? 'var(--warning)' : 'var(--primary)'}"></div>
              </div>
              <span class="td-mono" style="min-width:44px;text-align:right;font-size:12px">${r.avg.toFixed(0)}%</span>
              <span class="text-xs text-muted" style="min-width:60px">${r.count} win${r.count !== 1 ? 's' : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
      ${worstWins.length ? `
      <div>
        <div class="text-xs text-muted" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Winning Trades With Most Stop Room Left</div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Entry</th><th>Stop</th><th>Extreme</th><th>Stop Used</th></tr></thead>
            <tbody>
              ${worstWins.map(x => `
                <tr>
                  <td class="td-mono" style="font-size:12px">${formatDate(x.setup.date)}</td>
                  <td><strong>${escapeHtml(x.setup.pair || '')}</strong></td>
                  <td>${getDirectionBadge(x.setup.direction)}</td>
                  <td class="td-mono">${x.setup.entry_price}</td>
                  <td class="td-mono">${x.setup.stop_loss}</td>
                  <td class="td-mono">${x.setup.extreme_price}</td>
                  <td class="td-mono" style="color:${x.calc.efficiency < 60 ? 'var(--warning)' : 'var(--text-primary)'}">${x.calc.efficiency.toFixed(0)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
  `;
}

// =============================================
//  WEEK VIEW
// =============================================
async function loadWeek() {
  const contentEl = document.getElementById('st-week-content');
  const labelEl   = document.getElementById('st-week-label');
  if (!contentEl) return;

  const weekEnd = addDays(currentWeekStart, 6);

  const start = new Date(currentWeekStart + 'T00:00:00');
  const end   = new Date(weekEnd + 'T00:00:00');
  if (labelEl) {
    labelEl.textContent = `${start.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} — ${end.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`;
  }

  contentEl.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    const setups = await getStrategySetups({ startDate: currentWeekStart, endDate: weekEnd });
    contentEl.innerHTML = buildWeekContent(setups);
    wireWeekContent(setups);
    try {
      renderSessionBreakdown('st-week-session-breakdown', 'st-week-session-chart', setups, 'R by Trading Window — This Week');
    } catch (e) { console.error('Week session breakdown:', e); }
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildWeekContent(setups) {
  const stats = calcSetupStats(setups);
  const rColor = stats.totalR >= 0 ? 'text-profit' : 'text-loss';
  const rSign  = stats.totalR >= 0 ? '+' : '';

  return `
    <!-- Week stats -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card ${stats.winRate >= 50 && stats.closed > 0 ? 'profit' : 'primary'}">
        <div class="stat-label">This Week</div>
        <div class="stat-value neutral">${stats.total} setup${stats.total !== 1 ? 's' : ''}</div>
        <div class="stat-sub">${stats.closed} closed · ${stats.pending} pending</div>
      </div>
      <div class="stat-card ${stats.winRate >= 50 && stats.closed ? 'profit' : ''}">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value neutral">${stats.closed ? stats.winRate.toFixed(1) + '%' : '—'}</div>
        <div class="stat-sub">${stats.wins}W / ${stats.losses}L</div>
      </div>
      <div class="stat-card secondary">
        <div class="stat-label">Total R</div>
        <div class="stat-value ${rColor}">${stats.closed ? rSign + stats.totalR.toFixed(2) + 'R' : '—'}</div>
        <div class="stat-sub">Avg Win: ${stats.wins ? stats.avgWinR.toFixed(2) + 'R' : '—'}</div>
      </div>
    </div>

    <!-- Setups table -->
    ${setups.length ? buildSetupsTable(setups) : `
      <div class="empty-state" style="padding:48px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3>No setups this week</h3>
        <p>Click "Add Setup" to record a strategy setup</p>
      </div>
    `}

    <!-- Trading window breakdown (this week) -->
    <div id="st-week-session-breakdown" style="margin-top:20px"></div>
  `;
}

function buildSetupsTable(setups) {
  return `
    <div class="card" style="padding:0">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pair</th>
              <th>Direction</th>
              <th>Possible R</th>
              <th>Outcome</th>
              <th>Conf.</th>
              <th>Notes</th>
              <th>Screenshots</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${setups.map(s => buildSetupRow(s)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildSetupRow(s) {
  const dirBadge = s.direction === 'long'
    ? '<span class="badge badge-long">▲ LONG</span>'
    : s.direction === 'short'
    ? '<span class="badge badge-short">▼ SHORT</span>'
    : '—';

  const outcomeBadge = {
    win:       '<span class="badge badge-profit">WIN</span>',
    loss:      '<span class="badge badge-loss">LOSS</span>',
    breakeven: '<span class="badge badge-be">B/E</span>',
    pending:   '<span class="badge badge-open">PENDING</span>',
  }[s.outcome] || '<span class="badge badge-open">PENDING</span>';

  const screenshots = s.screenshots || [];
  const screenshotCell = screenshots.length
    ? `<div data-ss-section style="display:flex;align-items:center;gap:8px">
        <div class="screenshots-grid">
          ${screenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewPreview(this)" alt="screenshot">`).join('')}
        </div>
        ${screenshots.length > 1 ? `<button class="btn btn-ghost btn-xs" onclick="window._openGalleryFromSection(this)">View All</button>` : ''}
      </div>`
    : '—';

  const notesText = s.notes ? s.notes.slice(0, 60) + (s.notes.length > 60 ? '...' : '') : '—';

  return `
    <tr>
      <td class="td-mono">${formatDate(s.date)}${s.trade_time ? ` ${s.trade_time}` : ''}</td>
      <td><strong>${escapeHtml(s.pair)}</strong></td>
      <td>${dirBadge}</td>
      <td class="td-mono">${s.possible_r != null ? s.possible_r + 'R' : '—'}</td>
      <td>${outcomeBadge}</td>
      <td>${getSignalDisplay(s.signals)}</td>
      <td class="text-sm text-muted" style="max-width:180px">${escapeHtml(notesText)}</td>
      <td>${screenshotCell}</td>
      <td>
        <div class="trade-actions">
          <button class="btn btn-ghost btn-xs st-edit-btn" data-id="${s.id}">Edit</button>
          <button class="btn btn-danger btn-xs st-delete-btn" data-id="${s.id}">Del</button>
        </div>
      </td>
    </tr>
  `;
}

function wireWeekContent(setups) {
  document.querySelectorAll('.st-edit-btn').forEach(btn => {
    btn.onclick = () => {
      const setup = setups.find(s => s.id === btn.dataset.id);
      if (setup) openSetupModal(setup);
    };
  });

  document.querySelectorAll('.st-delete-btn').forEach(btn => {
    btn.onclick = () => confirmDeleteSetup(btn.dataset.id);
  });
}

async function confirmDeleteSetup(id) {
  if (!confirm('Delete this setup? This cannot be undone.')) return;
  try {
    await deleteStrategySetup(id);
    showToast('Setup deleted', 'success');
    await loadAll();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

// =============================================
//  MODAL WIRING (modals live in index.html)
// =============================================
function ensureModalsInDom() {
  document.getElementById('st-modal-backdrop').onclick  = closeSetupModal;
  document.getElementById('st-modal-close').onclick     = closeSetupModal;
  document.getElementById('st-modal-cancel').onclick    = closeSetupModal;
  document.getElementById('st-modal-save').onclick      = handleSaveSetup;

  // Populate hour dropdown (00–23) once
  const hourSel = document.getElementById('st-hour');
  if (hourSel && !hourSel.options.length) {
    hourSel.innerHTML = '<option value="">--</option>' +
      Array.from({length: 24}, (_, i) => {
        const h = String(i).padStart(2, '0');
        return `<option value="${h}">${h}</option>`;
      }).join('');
  }

  const stAllBtn = document.getElementById('st-signal-all');
  if (stAllBtn) stAllBtn.onclick = () => {
    const btns = document.querySelectorAll('.st-signal-toggle');
    const allActive = Array.from(btns).every(b => b.classList.contains('active'));
    btns.forEach(b => b.classList.toggle('active', !allActive));
    _updateStSignalScore();
  };

  // Auto-set outcome to Loss when a negative R is entered
  const possibleRInput = document.getElementById('st-possible-r');
  if (possibleRInput) {
    possibleRInput.addEventListener('input', () => {
      const val = parseFloat(possibleRInput.value);
      if (!isNaN(val) && val < 0) {
        document.getElementById('st-outcome').value = 'loss';
      }
    });
  }

  // Auto-populate Possible R with -1 when Loss is selected
  const outcomeSelect = document.getElementById('st-outcome');
  if (outcomeSelect) {
    outcomeSelect.addEventListener('change', () => {
      if (outcomeSelect.value === 'loss') {
        const rInput = document.getElementById('st-possible-r');
        if (!rInput.value || parseFloat(rInput.value) >= 0) rInput.value = -1;
      }
    });
  }

  document.getElementById('st-pair-modal-backdrop').onclick = closePairModal;
  document.getElementById('st-pair-modal-close').onclick    = closePairModal;
  document.getElementById('st-pair-add-btn').onclick        = addNewPair;

  document.getElementById('st-bulk-modal-backdrop').onclick = closeBulkModal;
  document.getElementById('st-bulk-modal-close').onclick    = closeBulkModal;
  document.getElementById('st-bulk-cancel').onclick         = closeBulkModal;
  document.getElementById('st-bulk-add-row').onclick        = () => addBulkRow();
  document.getElementById('st-bulk-save').onclick           = handleSaveBulk;
  document.getElementById('st-bulk-load-btn').onclick       = handleLoadBulkSetups;
  wireBulkRowsDelegation();

  document.getElementById('st-export-modal-backdrop').onclick = closeExportModal;
  document.getElementById('st-export-modal-close').onclick    = closeExportModal;
  document.getElementById('st-export-cancel').onclick         = closeExportModal;
  document.getElementById('st-export-download').onclick       = handleExportSetups;
  document.querySelectorAll('.st-export-preset').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.st-export-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('st-export-custom-range').style.display = btn.dataset.range === 'custom' ? '' : 'none';
    };
  });

  // Allow Enter key to add pair
  document.getElementById('st-new-pair-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') addNewPair();
  });

  wireScreenshotZone();
}

// =============================================
//  SETUP MODAL
// =============================================
function openSetupModal(setup = null) {
  pendingSetupScreenshots = [];

  // Reset form
  document.getElementById('st-setup-id').value   = '';
  document.getElementById('st-date').value        = todayString();
  document.getElementById('st-hour').value        = '';
  document.getElementById('st-minute').value      = '';
  document.getElementById('st-direction').value   = '';
  document.getElementById('st-possible-r').value  = '';
  document.getElementById('st-entry-price').value = '';
  document.getElementById('st-stop-loss').value   = '';
  document.getElementById('st-extreme-price').value = '';
  updateExtremePriceLabel('');
  document.getElementById('st-outcome').value     = 'win';
  document.getElementById('st-notes').value       = '';
  document.getElementById('st-screenshot-previews').innerHTML = '';
  document.getElementById('st-upload-prompt').style.display = '';

  // Reset pair dropdown to current pairs
  const pairSel = document.getElementById('st-pair');
  pairSel.innerHTML = getPairs().map(p => `<option value="${p}">${p}</option>`).join('');
  pairSel.value = getPairs()[0] || '';

  // Reset direction buttons
  document.querySelectorAll('.st-dir-btn').forEach(b => b.classList.remove('active'));

  // Reset signal toggles
  document.querySelectorAll('.st-signal-toggle').forEach(b => b.classList.remove('active'));
  _updateStSignalScore();

  // Copy-from section: show only in Add mode
  const copySection = document.getElementById('st-copy-from-section');
  const copySelect  = document.getElementById('st-copy-from-select');

  if (setup) {
    if (copySection) copySection.style.display = 'none';
    document.getElementById('st-modal-title').textContent = 'Edit Setup';
    document.getElementById('st-setup-id').value  = setup.id;
    document.getElementById('st-date').value       = setup.date || todayString();
    if (setup.trade_time) {
      const [h, m] = setup.trade_time.split(':');
      document.getElementById('st-hour').value   = h || '';
      document.getElementById('st-minute').value = m || '';
    }
    pairSel.value                                  = setup.pair || '';
    document.getElementById('st-direction').value  = setup.direction || '';
    document.getElementById('st-possible-r').value = setup.possible_r ?? '';
    document.getElementById('st-outcome').value    = setup.outcome || 'pending';
    document.getElementById('st-notes').value      = setup.notes || '';
    document.getElementById('st-entry-price').value   = setup.entry_price ?? '';
    document.getElementById('st-stop-loss').value      = setup.stop_loss ?? '';
    document.getElementById('st-extreme-price').value  = setup.extreme_price ?? '';
    updateExtremePriceLabel(setup.direction || '');

    if (setup.direction) {
      document.querySelector(`.st-dir-btn[data-dir="${setup.direction}"]`)?.classList.add('active');
    }

    // Load signals
    if (Array.isArray(setup.signals)) {
      document.querySelectorAll('.st-signal-toggle').forEach(btn => {
        if (setup.signals.includes(btn.dataset.signal)) btn.classList.add('active');
      });
      _updateStSignalScore();
    }

    // Load existing screenshots
    const screenshots = setup.screenshots || [];
    if (screenshots.length) {
      const previews = document.getElementById('st-screenshot-previews');
      screenshots.forEach(url => {
        pendingSetupScreenshots.push({ url, localUrl: url, uploaded: true });
        const idx = pendingSetupScreenshots.length - 1;
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.dataset.idx = idx;
        item.innerHTML = `
          <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
          <button class="preview-remove" onclick="window._stRemovePreview(${idx})">×</button>
        `;
        previews.appendChild(item);
      });
      updateStModalViewAll();
    }
  } else {
    document.getElementById('st-modal-title').textContent = 'Add Setup';
    if (copySection) {
      copySection.style.display = '';
      _loadCopyFromOptions(document.getElementById('st-date').value);
    }
    // Refresh list when date changes
    document.getElementById('st-date').onchange = () =>
      _loadCopyFromOptions(document.getElementById('st-date').value);
    if (copySelect) {
      copySelect.onchange = _applyCopyFrom;
    }
  }

  // Show modal
  document.getElementById('st-modal').classList.remove('hidden');
  document.querySelector('#st-modal .modal-body')?.scrollTo(0, 0);

  // Re-wire direction buttons
  document.querySelectorAll('.st-dir-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.st-dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('st-direction').value = btn.dataset.dir;
      updateExtremePriceLabel(btn.dataset.dir);
    };
  });

  // Re-wire signal toggles
  document.querySelectorAll('.st-signal-toggle').forEach(btn => {
    btn.onclick = () => { btn.classList.toggle('active'); _updateStSignalScore(); };
  });
}

function closeSetupModal() {
  document.getElementById('st-modal')?.classList.add('hidden');
  pendingSetupScreenshots = [];
}

// =============================================
//  EXPORT FOR LLM ANALYSIS
// =============================================
function openExportModal() {
  document.querySelectorAll('.st-export-preset').forEach(b => b.classList.toggle('active', b.dataset.range === 'all'));
  document.getElementById('st-export-custom-range').style.display = 'none';
  document.getElementById('st-export-start').value = '';
  document.getElementById('st-export-end').value   = '';
  document.getElementById('st-export-modal').classList.remove('hidden');
}

function closeExportModal() {
  document.getElementById('st-export-modal')?.classList.add('hidden');
}

// Resolves the active preset (or custom inputs) to a { startDate, endDate, label }
// the same shape getStrategySetups() filters already accept.
function resolveExportRange() {
  const active = document.querySelector('.st-export-preset.active')?.dataset.range || 'all';

  if (active === 'month') {
    const now = new Date();
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    return { startDate: start, endDate: end, label: `This month (${start} to ${end})` };
  }
  if (active === 'week') {
    const { start, end } = getWeekRange(todayString());
    return { startDate: start, endDate: end, label: `This week (${start} to ${end})` };
  }
  if (active === 'custom') {
    const start = document.getElementById('st-export-start').value || null;
    const end   = document.getElementById('st-export-end').value || null;
    const label = start || end ? `Custom (${start || 'earliest'} to ${end || 'latest'})` : 'All time';
    return { startDate: start, endDate: end, label };
  }
  return { startDate: null, endDate: null, label: 'All time' };
}

async function handleExportSetups() {
  const range = resolveExportRange();
  try {
    const filters = {};
    if (range.startDate) filters.startDate = range.startDate;
    if (range.endDate)   filters.endDate   = range.endDate;

    const setups = await getStrategySetups(filters);
    if (!setups.length) { showToast('No setups in that range to export', 'warning'); return; }

    const exportedAt = new Date();
    const content     = buildSetupsLlmExport(setups, exportedAt, range.label);
    const dateStamp   = exportedAt.toISOString().slice(0, 10);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `strategy-setups-llm-export-${dateStamp}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    closeExportModal();
    showToast('Strategy setups export downloaded', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

function buildSetupsLlmExport(setups, exportedAt, rangeLabel) {
  const stats  = calcSetupStats(setups);
  const sorted = [...setups].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : (a.trade_time || '').localeCompare(b.trade_time || ''));

  const lines = [
    '# Strategy Tracker Export',
    '',
    `Exported: ${exportedAt.toLocaleString('en-GB')}`,
    `Range: ${rangeLabel || 'All time'}`,
    `Total setups: ${stats.total}`,
    `Closed: ${stats.closed} (${stats.wins}W / ${stats.losses}L / ${stats.bes}BE) - Pending: ${stats.pending}`,
    `Win rate: ${stats.closed ? stats.winRate.toFixed(1) + '%' : 'n/a'}`,
    `Total R: ${stats.closed ? (stats.totalR >= 0 ? '+' : '') + stats.totalR.toFixed(2) + 'R' : 'n/a'}`,
    '',
    '## Analysis Request',
    '',
    'Please analyse these trading setups and find recurring patterns. Focus on: which signal combinations and pairs perform best, whether stops are too tight or too loose relative to what price actually did (Stop Used %), whether Possible R is estimated accurately versus how far price actually ran (Target Price vs Extreme Price), timing patterns (day of week, time of day), and any other edges or leaks you can find. Recommend concrete, specific rule changes.',
    '',
    '## Field Notes',
    '',
    '- Target Price is the level implied by Entry Price, Stop Loss and Possible R at time of entry: the price the trade needed to reach to hit its planned R.',
    '- Stop Used % is how much of the Entry-to-Stop distance price actually used before the trade resolved (based on Extreme Price). Near 100% on losses is expected, since that is the stop doing its job. Low % on wins shows room to tighten the stop.',
    '- Losses are recorded as -1R by convention regardless of Possible R, since the stop defines the realised loss.',
    '',
    '## Data (CSV)',
    '',
    '```csv',
    buildSetupsCsv(sorted),
    '```',
  ];

  return lines.join('\n');
}

const SETUPS_CSV_HEADERS = [
  'date', 'trade_time', 'pair', 'direction', 'possible_r',
  'entry_price', 'stop_loss', 'extreme_price', 'target_price', 'stop_used_pct',
  'outcome', 'signals', 'notes',
];

function buildSetupsCsv(setups) {
  const rows = setups.map(s => {
    const entry  = parseFloat(s.entry_price);
    const stop   = parseFloat(s.stop_loss);
    const pr     = parseFloat(s.possible_r);
    const target = calcTargetPrice(entry, stop, pr, s.direction);
    const eff    = calcStopEfficiency(s);

    const vals = {
      date:          s.date || '',
      trade_time:    s.trade_time || '',
      pair:          s.pair || '',
      direction:     s.direction || '',
      possible_r:    s.possible_r ?? '',
      entry_price:   s.entry_price ?? '',
      stop_loss:     s.stop_loss ?? '',
      extreme_price: s.extreme_price ?? '',
      target_price:  target !== null ? target.toFixed(5) : '',
      stop_used_pct: eff ? eff.efficiency.toFixed(1) : '',
      outcome:       s.outcome || '',
      signals:       Array.isArray(s.signals) ? s.signals.join(';') : '',
      notes:         _csvSingleLine(s.notes),
    };

    return SETUPS_CSV_HEADERS.map(h => _csvEscape(vals[h])).join(',');
  });

  return [SETUPS_CSV_HEADERS.join(','), ...rows].join('\n');
}

function _csvSingleLine(value) {
  return String(value || '').replace(/\r\n|\r|\n/g, ' ').trim();
}

function _csvEscape(value) {
  const s = String(value ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
}

// =============================================
//  BULK ENTER MODAL
// =============================================

// Target price implied by the planned Entry / Stop / Possible R — the level
// that would close out exactly at the stated R multiple, in the trade's direction.
function calcTargetPrice(entry, stop, possibleR, direction) {
  if (isNaN(entry) || isNaN(stop) || isNaN(possibleR) || !direction) return null;
  const stopDistance = Math.abs(entry - stop);
  if (!stopDistance) return null;
  const sign = direction === 'long' ? 1 : -1;
  return entry + sign * stopDistance * possibleR;
}

function openBulkModal() {
  const tbody = document.getElementById('st-bulk-rows');
  tbody.innerHTML = '';
  document.getElementById('st-bulk-load-start').value = '';
  document.getElementById('st-bulk-load-end').value   = '';
  for (let i = 0; i < 5; i++) addBulkRow();
  document.getElementById('st-bulk-modal').classList.remove('hidden');
}

function closeBulkModal() {
  document.getElementById('st-bulk-modal')?.classList.add('hidden');
}

async function handleLoadBulkSetups() {
  const start = document.getElementById('st-bulk-load-start').value;
  const end   = document.getElementById('st-bulk-load-end').value;
  if (!start || !end) { showToast('Pick a From and To date to load', 'error'); return; }

  const hasUnsavedInput = Array.from(document.querySelectorAll('#st-bulk-rows tr[data-bulk-row]')).some(row =>
    row.dataset.setupId || row.querySelector('.bulk-r').value || row.querySelector('.bulk-entry').value ||
    row.querySelector('.bulk-stop').value || row.querySelector('.bulk-extreme').value);
  if (hasUnsavedInput && !confirm('Loading will replace the rows currently in this table. Any unsaved changes here will be lost. Continue?')) {
    return;
  }

  const loadBtn = document.getElementById('st-bulk-load-btn');
  loadBtn.disabled = true;
  loadBtn.textContent = 'Loading...';

  try {
    const setups = await getStrategySetups({ startDate: start, endDate: end });
    if (!setups.length) { showToast('No setups in that range', 'warning'); return; }

    const sorted = [...setups].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : (a.trade_time || '').localeCompare(b.trade_time || ''));

    const tbody = document.getElementById('st-bulk-rows');
    tbody.innerHTML = '';
    sorted.forEach(s => addBulkRow(s));
    document.querySelectorAll('#st-bulk-rows tr[data-bulk-row]').forEach(recomputeRowTarget);

    showToast(`Loaded ${setups.length} setup${setups.length !== 1 ? 's' : ''} for editing`, 'success');
  } catch (err) {
    showToast('Failed to load setups: ' + err.message, 'error');
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = 'Load';
  }
}

// `setup` is provided when editing an existing row (loaded via handleLoadBulkSetups);
// omitted for a fresh blank row from "+ Add Row" / the initial 5 starter rows.
function buildBulkRowHtml(setup = null) {
  const pairs = getPairs();
  if (setup?.pair && !pairs.includes(setup.pair)) pairs.push(setup.pair);
  const pairOptions = pairs.map(p => `<option value="${p}" ${setup?.pair === p ? 'selected' : ''}>${p}</option>`).join('');

  const direction = setup?.direction || '';
  const outcome   = setup?.outcome || 'win';
  const removeTitle = setup ? 'Remove from this batch (does not delete the setup)' : 'Remove row';

  return `
    <tr data-bulk-row ${setup ? `data-setup-id="${setup.id}"` : ''}>
      <td><input type="date" class="form-input bulk-date" value="${setup?.date || todayString()}"></td>
      <td><input type="time" class="form-input bulk-time" value="${setup?.trade_time || ''}"></td>
      <td><select class="form-input bulk-pair">${pairOptions}</select></td>
      <td>
        <select class="form-input bulk-direction">
          <option value="" ${direction === '' ? 'selected' : ''}>--</option>
          <option value="long" ${direction === 'long' ? 'selected' : ''}>Long</option>
          <option value="short" ${direction === 'short' ? 'selected' : ''}>Short</option>
        </select>
      </td>
      <td><input type="number" step="0.1" class="form-input bulk-r" placeholder="2.5" value="${setup?.possible_r ?? ''}"></td>
      <td><input type="number" step="any" class="form-input bulk-entry" placeholder="1.0850" value="${setup?.entry_price ?? ''}"></td>
      <td><input type="number" step="any" class="form-input bulk-stop" placeholder="1.0820" value="${setup?.stop_loss ?? ''}"></td>
      <td><input type="number" step="any" class="form-input bulk-extreme" placeholder="1.0835" value="${setup?.extreme_price ?? ''}"></td>
      <td><span class="bulk-target td-mono text-muted">—</span></td>
      <td>
        <select class="form-input bulk-outcome">
          <option value="win" ${outcome === 'win' ? 'selected' : ''}>Win</option>
          <option value="loss" ${outcome === 'loss' ? 'selected' : ''}>Loss</option>
          <option value="breakeven" ${outcome === 'breakeven' ? 'selected' : ''}>Breakeven</option>
          <option value="pending" ${outcome === 'pending' ? 'selected' : ''}>Pending</option>
        </select>
      </td>
      <td><button type="button" class="btn btn-ghost btn-xs bulk-row-remove" title="${removeTitle}">✕</button></td>
    </tr>
  `;
}

function addBulkRow(setup = null) {
  document.getElementById('st-bulk-rows').insertAdjacentHTML('beforeend', buildBulkRowHtml(setup));
}

function recomputeRowTarget(row) {
  if (!row) return;
  const entry     = parseFloat(row.querySelector('.bulk-entry').value);
  const stop      = parseFloat(row.querySelector('.bulk-stop').value);
  const possibleR = parseFloat(row.querySelector('.bulk-r').value);
  const direction = row.querySelector('.bulk-direction').value;
  const target    = calcTargetPrice(entry, stop, possibleR, direction);
  row.querySelector('.bulk-target').textContent = target !== null ? target.toFixed(5) : '—';
}

// Rows are added/removed dynamically, so this binds once to the tbody
// and reads whichever row the event actually happened in.
function wireBulkRowsDelegation() {
  const tbody = document.getElementById('st-bulk-rows');
  if (!tbody || tbody._wired) return;
  tbody._wired = true;

  tbody.addEventListener('input', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    if (e.target.matches('.bulk-entry, .bulk-stop, .bulk-r')) recomputeRowTarget(row);
    if (e.target.matches('.bulk-r')) {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val < 0) row.querySelector('.bulk-outcome').value = 'loss';
    }
  });

  tbody.addEventListener('change', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    if (e.target.matches('.bulk-direction')) recomputeRowTarget(row);
    if (e.target.matches('.bulk-outcome') && e.target.value === 'loss') {
      const rInput = row.querySelector('.bulk-r');
      if (!rInput.value || parseFloat(rInput.value) >= 0) {
        rInput.value = -1;
        recomputeRowTarget(row);
      }
    }
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.closest('.bulk-row-remove')) e.target.closest('tr')?.remove();
  });
}

async function handleSaveBulk() {
  const saveBtn = document.getElementById('st-bulk-save');
  const rows = Array.from(document.querySelectorAll('#st-bulk-rows tr[data-bulk-row]'));

  const toSave = [];
  for (const row of rows) {
    const setupId = row.dataset.setupId || null;
    const pair    = row.querySelector('.bulk-pair').value;
    const date    = row.querySelector('.bulk-date').value;
    const time    = row.querySelector('.bulk-time').value;
    const rVal    = row.querySelector('.bulk-r').value;
    const entry   = row.querySelector('.bulk-entry').value;
    const stop    = row.querySelector('.bulk-stop').value;
    const extreme = row.querySelector('.bulk-extreme').value;

    // A blank NEW row (no id, none of the price/R fields touched) is an unused
    // default row — skip it. A loaded existing row is always saved: it's a
    // deliberate edit target even if the user cleared every price field.
    if (!setupId && !rVal && !entry && !stop && !extreme) continue;

    if (!pair) { showToast('Every filled-in row needs a pair', 'error'); return; }
    if (!date) { showToast('Every filled-in row needs a date', 'error'); return; }

    const setupData = {
      date,
      trade_time:    time || null,
      pair,
      direction:     row.querySelector('.bulk-direction').value || null,
      possible_r:    parseFloat(rVal) || null,
      outcome:       row.querySelector('.bulk-outcome').value || 'win',
      entry_price:   parseFloat(entry) || null,
      stop_loss:     parseFloat(stop) || null,
      extreme_price: parseFloat(extreme) || null,
    };
    // Existing setup: update in place, leaving notes/screenshots/signals untouched
    // (they aren't part of this table, so never send them on an edit).
    if (setupId) setupData.id = setupId;

    toSave.push(setupData);
  }

  if (!toSave.length) { showToast('No rows to save', 'warning'); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  let added = 0, updated = 0, fail = 0;
  for (const setupData of toSave) {
    try {
      await saveStrategySetup(setupData);
      if (setupData.id) updated++; else added++;
    } catch (err) {
      fail++;
      console.error('Bulk save row failed:', err, setupData);
    }
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save All';

  const ok = added + updated;
  if (ok) {
    const parts = [];
    if (added)   parts.push(`${added} added`);
    if (updated) parts.push(`${updated} updated`);
    showToast(`${parts.join(', ')}${fail ? `, ${fail} failed` : ''}`, fail ? 'warning' : 'success');
  } else {
    showToast('Failed to save setups', 'error');
  }

  if (ok) {
    closeBulkModal();
    await loadAll();
  }
}

async function _loadCopyFromOptions(date) {
  const sel = document.getElementById('st-copy-from-select');
  if (!sel || !date) return;
  sel.innerHTML = '<option value="">— loading… —</option>';
  try {
    const setups = await getStrategySetups({ startDate: date, endDate: date });
    if (!setups.length) {
      sel.innerHTML = '<option value="">— no setups on this date —</option>';
      sel._copySetups = [];
      return;
    }
    sel._copySetups = setups;
    sel.innerHTML = '<option value="">— pick a setup to copy from —</option>' +
      setups.map((s, i) => {
        const time = s.trade_time ? ` ${s.trade_time}` : '';
        const sigs = Array.isArray(s.signals) && s.signals.length
          ? ` [${s.signals.map(sig => ST_SIG_SHORT[sig] || sig).join('+')}]` : '';
        return `<option value="${i}">${s.pair}${time}${sigs}</option>`;
      }).join('');
  } catch {
    sel.innerHTML = '<option value="">— could not load setups —</option>';
    sel._copySetups = [];
  }
}

function _applyCopyFrom() {
  const sel = document.getElementById('st-copy-from-select');
  const idx = parseInt(sel.value);
  if (isNaN(idx) || !sel._copySetups) return;
  const src = sel._copySetups[idx];
  if (!src) return;

  // Copy time
  if (src.trade_time) {
    const [h, m] = src.trade_time.split(':');
    document.getElementById('st-hour').value   = h || '';
    document.getElementById('st-minute').value = m || '';
  }

  // Copy direction
  if (src.direction) {
    document.getElementById('st-direction').value = src.direction;
    document.querySelectorAll('.st-dir-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.dir === src.direction);
    });
  }

  // Copy signals
  document.querySelectorAll('.st-signal-toggle').forEach(btn => {
    btn.classList.toggle('active', Array.isArray(src.signals) && src.signals.includes(btn.dataset.signal));
  });
  _updateStSignalScore();

  // Reset select back to placeholder so it can be reused
  sel.value = '';
}

async function handleSaveSetup() {
  const saveBtn = document.getElementById('st-modal-save');
  const pair    = document.getElementById('st-pair').value;
  const date    = document.getElementById('st-date').value;

  if (!pair) { showToast('Select a pair', 'error'); return; }
  if (!date) { showToast('Date is required', 'error'); return; }
  const activeSignals = document.querySelectorAll('.st-signal-toggle.active');
  if (!activeSignals.length) { showToast('Select at least one correlation pair', 'error'); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Upload new screenshots
    const screenshotUrls = [];
    for (const item of pendingSetupScreenshots) {
      if (!item) continue;
      if (item.uploaded) {
        screenshotUrls.push(item.url);
      } else {
        try {
          const url = await uploadScreenshot(item.file);
          screenshotUrls.push(url);
        } catch (uploadErr) {
          showToast(`Screenshot upload failed: ${uploadErr.message}`, 'warning');
        }
      }
    }

    const hour = document.getElementById('st-hour').value;
    const min  = document.getElementById('st-minute').value;

    const setupData = {
      id:          document.getElementById('st-setup-id').value || undefined,
      date,
      trade_time:  (hour && min) ? `${hour}:${min}` : null,
      pair,
      direction:   document.getElementById('st-direction').value || null,
      possible_r:  parseFloat(document.getElementById('st-possible-r').value) || null,
      outcome:     document.getElementById('st-outcome').value || 'win',
      notes:       document.getElementById('st-notes').value.trim() || null,
      entry_price:   parseFloat(document.getElementById('st-entry-price').value) || null,
      stop_loss:     parseFloat(document.getElementById('st-stop-loss').value) || null,
      extreme_price: parseFloat(document.getElementById('st-extreme-price').value) || null,
      screenshots: screenshotUrls,
      signals:     Array.from(document.querySelectorAll('.st-signal-toggle.active')).map(b => b.dataset.signal),
    };

    if (!setupData.id) delete setupData.id;

    await saveStrategySetup(setupData);
    showToast('Setup saved', 'success');
    closeSetupModal();
    await loadAll();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Setup';
  }
}

// =============================================
//  PAIR MANAGEMENT MODAL
// =============================================
function openPairModal() {
  renderPairList();
  document.getElementById('st-pair-modal').classList.remove('hidden');
  document.getElementById('st-new-pair-input').value = '';
}

function closePairModal() {
  document.getElementById('st-pair-modal').classList.add('hidden');
}

function renderPairList() {
  const pairs  = getPairs();
  const listEl = document.getElementById('st-pair-list');
  if (!listEl) return;

  listEl.innerHTML = pairs.map((p, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-surface);border-radius:var(--radius);border:1px solid var(--border)">
      <span class="text-sm font-medium">${escapeHtml(p)}</span>
      <button class="btn btn-danger btn-xs" onclick="window._stRemovePair(${i})">Remove</button>
    </div>
  `).join('') || '<p class="text-sm text-muted">No pairs added yet.</p>';

  window._stRemovePair = (idx) => {
    const pairs = getPairs();
    pairs.splice(idx, 1);
    savePairs(pairs);
    renderPairList();
    showToast('Pair removed', 'success');
  };
}

function addNewPair() {
  const input = document.getElementById('st-new-pair-input');
  const val   = input.value.trim().toUpperCase();
  if (!val) return;

  const pairs = getPairs();
  if (pairs.includes(val)) {
    showToast('Pair already in list', 'warning');
    return;
  }

  pairs.push(val);
  savePairs(pairs);
  renderPairList();
  input.value = '';
  showToast(`${val} added`, 'success');
}

// =============================================
//  SCREENSHOT ZONE (scoped to setup modal)
// =============================================
function wireScreenshotZone() {
  const zone = document.getElementById('st-screenshot-zone');
  let input  = document.getElementById('st-screenshot-input');
  const prompt = document.getElementById('st-upload-prompt');

  if (!zone || !input) return;

  // Clone to strip any event listeners added by previous renders
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  input = fresh;

  prompt?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => addSetupFiles(Array.from(input.files)));

  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addSetupFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  });

  window._stRemovePreview = (idx) => {
    pendingSetupScreenshots[idx] = null;
    const item = document.querySelector(`#st-screenshot-previews .preview-item[data-idx="${idx}"]`);
    if (item) item.remove();
    updateStModalViewAll();
  };
}

function updateStModalViewAll() {
  const count = document.querySelectorAll('#st-screenshot-previews .preview-item img').length;
  const btn   = document.getElementById('st-modal-view-all');
  if (btn) btn.style.display = count > 1 ? '' : 'none';
}

window._openStModalGallery = function() {
  const urls = Array.from(document.querySelectorAll('#st-screenshot-previews .preview-item img')).map(i => i.src);
  if (urls.length > 1) window._openGalleryGrid?.(urls);
};

function addSetupFiles(files) {
  const previews = document.getElementById('st-screenshot-previews');
  const prompt   = document.getElementById('st-upload-prompt');
  if (!previews) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      pendingSetupScreenshots.push({ file, localUrl: url, uploaded: false });
      const idx = pendingSetupScreenshots.length - 1;

      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.idx = idx;
      item.innerHTML = `
        <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
        <button class="preview-remove" onclick="window._stRemovePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
      if (prompt) prompt.style.display = 'none';
      updateStModalViewAll();
    };
    reader.readAsDataURL(file);
  });
}
