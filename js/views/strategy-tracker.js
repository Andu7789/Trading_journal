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

function _updateStSignalScore() {
  const btns  = document.querySelectorAll('.st-signal-toggle');
  const count = Array.from(btns).filter(b => b.classList.contains('active')).length;
  const allBtn = document.getElementById('st-signal-all');
  if (allBtn) allBtn.classList.toggle('active', count === btns.length);
  const el = document.getElementById('st-signal-score');
  if (el) el.textContent = `Score: ${count} / 4`;
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
      <button class="btn btn-ghost btn-sm" id="st-manage-pairs-btn" title="Manage pairs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Pairs
      </button>
    </div>

    <!-- All-time stats -->
    <div id="st-alltime-stats" class="stats-grid" style="margin-bottom:20px">
      <div class="loading-screen" style="padding:20px"><div class="loading-spinner"></div></div>
    </div>

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
    renderChartSection(allSetups);
    renderBreakdownCharts(allSetups);
    renderStConfluence(allSetups);
  } catch (err) {
    if (statsEl) statsEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
    if (chartEl) chartEl.innerHTML = `<p class="text-loss text-sm" style="padding:20px">${err.message}</p>`;
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
  const modal   = document.getElementById('day-modal');
  const titleEl = document.getElementById('day-modal-title');
  const bodyEl  = document.getElementById('day-modal-body');
  if (!modal) return;

  const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  titleEl.textContent = label;
  bodyEl.innerHTML = '<div class="loading-screen" style="min-height:80px"><div class="loading-spinner"></div></div>';
  modal.classList.remove('hidden');

  try {
    const setups = await getStrategySetups({ startDate: dateStr, endDate: dateStr });
    if (!setups.length) {
      bodyEl.innerHTML = '<div class="empty-state" style="padding:32px"><p class="text-muted">No setups on this day.</p></div>';
      return;
    }
    const closed = setups.filter(s => s.outcome && s.outcome !== 'pending');
    const wins   = closed.filter(s => s.outcome === 'win').length;
    const losses = closed.filter(s => s.outcome === 'loss').length;
    const totalR = closed.reduce((sum, s) => sum + (calcSetupR(s) ?? 0), 0);

    bodyEl.innerHTML = `
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        ${closed.length ? `<span class="td-mono ${totalR >= 0 ? 'text-profit' : 'text-loss'}" style="font-weight:700;font-size:1.1em">${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R</span>` : ''}
        <span class="text-muted">${wins}W / ${losses}L · ${setups.length} setup${setups.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Pair</th><th>Dir</th><th>Possible R</th><th>Outcome</th><th>Signals</th><th>Notes</th></tr>
          </thead>
          <tbody>
            ${setups.map((s, i) => `
              <tr style="cursor:pointer" data-idx="${i}">
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

    bodyEl.querySelectorAll('tr[data-idx]').forEach(row => {
      row.addEventListener('click', () => {
        modal.classList.add('hidden');
        openSetupModal(setups[parseInt(row.dataset.idx)]);
      });
    });
  } catch (err) {
    bodyEl.innerHTML = `<div class="empty-state"><p class="text-loss">${err.message}</p></div>`;
  }
};

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
//  CONFLUENCE ANALYSIS
// =============================================
const ST_SIGNALS     = ['Dollar', 'DXY', 'EURUSD', 'GBPUSD'];
const ST_SIG_LABELS  = { Dollar: 'Dollar', DXY: 'DXY', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD' };
let _stConfByScore   = { 0: [], 1: [], 2: [], 3: [], 4: [] };

function renderStConfluence(allSetups) {
  const el = document.getElementById('st-confluence-section');
  if (!el) return;

  const closed = allSetups.filter(s => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'breakeven');
  if (!closed.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card" style="padding:20px">
      <div class="card-title" style="font-size:14px;margin-bottom:4px">Signal Confluence Analysis</div>
      <div class="card-subtitle" style="margin-bottom:16px">Setup performance by number of confirmed swing-point signals (0–4)</div>
      <div style="position:relative;height:220px"><canvas id="st-confluence-chart"></canvas></div>
      <div id="st-confluence-table" style="margin-top:20px"></div>
    </div>
  `;

  _stConfByScore = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  closed.forEach(s => {
    const score = Array.isArray(s.signals) ? s.signals.length : 0;
    if (score in _stConfByScore) _stConfByScore[score].push(s);
  });
  const byScore = _stConfByScore;

  const labels    = ['0 / 4', '1 / 4', '2 / 4', '3 / 4', '4 / 4'];
  const rValues   = [0,1,2,3,4].map(sc => _calcR(byScore[sc]));
  const winRates  = [0,1,2,3,4].map(sc => byScore[sc].length ? _winRate(byScore[sc]) : null);
  const barColors = ['rgba(255,71,87,0.6)','rgba(255,140,0,0.6)','rgba(255,165,2,0.6)','rgba(76,217,100,0.6)','rgba(0,230,118,0.7)'];

  const canvas = document.getElementById('st-confluence-chart');
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Total R', data: rValues, backgroundColor: rValues.map((v, i) => barColors[i]), borderWidth: 0, yAxisID: 'y' },
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
        tooltip: { callbacks: { label: ctx => ctx.dataset.label === 'Win Rate %' ? `${ctx.parsed.y}%` : `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R` } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y:  { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}R` }, position: 'left' },
        y2: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => `${v}%` }, position: 'right', min: 0, max: 100 }
      }
    }
  });

  const instStats = ST_SIGNALS.map(inst => {
    const withInst    = closed.filter(s => Array.isArray(s.signals) && s.signals.includes(inst));
    const withoutInst = closed.filter(s => !Array.isArray(s.signals) || !s.signals.includes(inst));
    const wrWith    = withInst.length    ? _winRate(withInst).toFixed(0)    : '—';
    const wrWithout = withoutInst.length ? _winRate(withoutInst).toFixed(0) : '—';
    const rWith     = withInst.length    ? _calcR(withInst)                 : '—';
    return { label: ST_SIG_LABELS[inst], count: withInst.length, wrWith, wrWithout, rWith };
  });

  const tableEl = document.getElementById('st-confluence-table');
  if (tableEl) {
    tableEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div class="text-xs text-muted" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">By Score</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              ${['Score','Setups','Win %','Avg R','Total R'].map(h => `<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-muted)">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${[0,1,2,3,4].filter(sc => byScore[sc].length).map(sc => {
                const ts  = byScore[sc];
                const wins = ts.filter(s => s.outcome === 'win').length;
                const totalR = _calcR(ts);
                const avgR   = ts.length ? parseFloat((totalR / ts.length).toFixed(2)) : 0;
                const scoreColor = sc === 4 ? '#00e676' : sc === 3 ? '#4cd964' : sc === 2 ? '#ffa502' : sc === 1 ? '#ff8c00' : 'var(--text-muted)';
                return `<tr>
                  <td style="padding:4px 8px"><span style="font-weight:700;color:${scoreColor};font-size:12px">${sc}/4</span></td>
                  <td style="padding:4px 8px;font-size:12px">${ts.length}</td>
                  <td style="padding:4px 8px;font-size:12px;color:var(--profit)">${(wins/ts.length*100).toFixed(0)}%</td>
                  <td style="padding:4px 8px;font-size:12px;color:${avgR >= 0 ? 'var(--profit)' : 'var(--loss)'}">${avgR >= 0 ? '+' : ''}${avgR}R</td>
                  <td style="padding:4px 8px;font-size:12px;color:${totalR >= 0 ? 'var(--profit)' : 'var(--loss)'}">${totalR >= 0 ? '+' : ''}${totalR}R</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div>
          <div class="text-xs text-muted" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Per Instrument</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>
              ${['Instrument','Setups','WR with','WR without','R with'].map(h => `<th style="text-align:left;padding:4px 8px;font-size:11px;color:var(--text-muted)">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${instStats.map(r => `<tr>
                <td style="padding:4px 8px;font-size:12px;font-weight:600">${r.label}</td>
                <td style="padding:4px 8px;font-size:12px;color:var(--text-muted)">${r.count}</td>
                <td style="padding:4px 8px;font-size:12px;color:var(--profit)">${r.wrWith}${r.wrWith !== '—' ? '%' : ''}</td>
                <td style="padding:4px 8px;font-size:12px;color:var(--text-muted)">${r.wrWithout}${r.wrWithout !== '—' ? '%' : ''}</td>
                <td style="padding:4px 8px;font-size:12px;color:${r.rWith !== '—' && r.rWith >= 0 ? 'var(--profit)' : 'var(--loss)'}">${r.rWith !== '—' ? (r.rWith >= 0 ? '+' : '') + r.rWith + 'R' : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

function showStConfluenceDrilldown(scoreIdx) {
  const panel = document.getElementById('st-confluence-drilldown');
  if (!panel) return;

  const setups = _stConfByScore[scoreIdx] || [];
  if (!setups.length) { panel.style.display = 'none'; return; }

  const scoreColor = scoreIdx === 4 ? '#00e676' : scoreIdx === 3 ? '#4cd964' : scoreIdx === 2 ? '#ffa502' : scoreIdx === 1 ? '#ff8c00' : 'var(--text-muted)';
  const totalR = _calcR(setups);
  const wins   = setups.filter(s => s.outcome === 'win').length;

  panel.style.display = '';
  panel.innerHTML = `
    <div class="card">
      <div class="card-header" style="margin-bottom:16px">
        <div>
          <div class="card-title">
            Score <span style="color:${scoreColor};font-weight:800">${scoreIdx}/4</span> — ${setups.length} setup${setups.length !== 1 ? 's' : ''}
          </div>
          <div class="card-subtitle">
            ${(wins/setups.length*100).toFixed(0)}% win rate ·
            ${totalR >= 0 ? '+' : ''}${totalR}R total ·
            ${setups.filter(s=>s.outcome==='loss').length} losses
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('st-confluence-drilldown').style.display='none'">✕ Close</button>
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

  // Wire edit/delete buttons in the drilldown
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
      <td class="td-mono">${formatDate(s.date)}</td>
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

  const stAllBtn = document.getElementById('st-signal-all');
  if (stAllBtn) stAllBtn.onclick = () => {
    const btns = document.querySelectorAll('.st-signal-toggle');
    const allActive = Array.from(btns).every(b => b.classList.contains('active'));
    btns.forEach(b => b.classList.toggle('active', !allActive));
    _updateStSignalScore();
  };

  document.getElementById('st-pair-modal-backdrop').onclick = closePairModal;
  document.getElementById('st-pair-modal-close').onclick    = closePairModal;
  document.getElementById('st-pair-add-btn').onclick        = addNewPair;

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
  document.getElementById('st-direction').value   = '';
  document.getElementById('st-possible-r').value  = '';
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

  if (setup) {
    document.getElementById('st-modal-title').textContent = 'Edit Setup';
    document.getElementById('st-setup-id').value  = setup.id;
    document.getElementById('st-date').value       = setup.date || todayString();
    pairSel.value                                  = setup.pair || '';
    document.getElementById('st-direction').value  = setup.direction || '';
    document.getElementById('st-possible-r').value = setup.possible_r ?? '';
    document.getElementById('st-outcome').value    = setup.outcome || 'pending';
    document.getElementById('st-notes').value      = setup.notes || '';

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

async function handleSaveSetup() {
  const saveBtn = document.getElementById('st-modal-save');
  const pair    = document.getElementById('st-pair').value;
  const date    = document.getElementById('st-date').value;

  if (!pair) { showToast('Select a pair', 'error'); return; }
  if (!date) { showToast('Date is required', 'error'); return; }

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

    const setupData = {
      id:          document.getElementById('st-setup-id').value || undefined,
      date,
      pair,
      direction:   document.getElementById('st-direction').value || null,
      possible_r:  parseFloat(document.getElementById('st-possible-r').value) || null,
      outcome:     document.getElementById('st-outcome').value || 'win',
      notes:       document.getElementById('st-notes').value.trim() || null,
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
