// =============================================
//  DASHBOARD VIEW
// =============================================
import { getTrades, getJournalEntry } from '../db.js';
import { calcStats, formatCurrency, formatPnL, pnlClass, pnlSign,
         todayString, formatDate, getWeekRange, getMonthRange,
         getDaysInMonth, getOutcomeBadge, getDirectionBadge, addDays } from '../utils.js';
import { openTradeModal } from '../app.js';

let equityChart = null;

export async function renderDashboard(container) {
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;
  document.getElementById('page-title').textContent = 'Dashboard';

  try {
    const today = todayString();
    const { start: monthStart, end: monthEnd } = getMonthRange(
      new Date().getFullYear(), new Date().getMonth() + 1
    );

    const [todayTrades, monthTrades, journalEntry] = await Promise.all([
      getTrades({ date: today }),
      getTrades({ startDate: monthStart, endDate: monthEnd }),
      getJournalEntry(today),
    ]);

    const todayStats = calcStats(todayTrades);
    const monthStats = calcStats(monthTrades);

    container.innerHTML = buildDashboard(today, todayTrades, todayStats, monthTrades, monthStats, journalEntry);
    initDashboard(today, todayTrades, monthTrades);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-loss">Error loading dashboard: ${err.message}</p></div>`;
  }
}

function buildDashboard(today, todayTrades, todayStats, monthTrades, monthStats, journalEntry) {
  const todayPnl   = todayStats.totalPnl;
  const monthPnl   = monthStats.totalPnl;
  const todayClass = todayPnl >= 0 ? 'profit' : 'loss';
  const monthClass = monthPnl >= 0 ? 'profit' : 'loss';

  const recentTrades = monthTrades.slice(0, 8);

  return `
    <div class="page-header">
      <div>
        <h1>Good ${getGreeting()}, Trader</h1>
        <div class="page-header-sub">${formatDisplayFull(today)}</div>
      </div>
      <button class="btn btn-primary" onclick="window._openTradeModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Log Trade
      </button>
    </div>

    <!-- Today Stats -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card ${todayClass}">
        <div class="stat-label">Today's P&amp;L</div>
        <div class="stat-value ${todayClass}">${pnlSign(todayPnl)}${formatCurrency(todayPnl)}</div>
        <div class="stat-sub">${todayStats.total} closed trade${todayStats.total !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Today Win Rate</div>
        <div class="stat-value neutral">${todayStats.total ? todayStats.winRate.toFixed(0) + '%' : '—'}</div>
        <div class="stat-sub">${todayStats.wins}W / ${todayStats.losses}L</div>
      </div>
      <div class="stat-card ${monthClass}">
        <div class="stat-label">Month P&amp;L</div>
        <div class="stat-value ${monthClass}">${pnlSign(monthPnl)}${formatCurrency(monthPnl)}</div>
        <div class="stat-sub">${monthStats.total} trades this month</div>
      </div>
      <div class="stat-card secondary">
        <div class="stat-label">Month Win Rate</div>
        <div class="stat-value neutral">${monthStats.total ? monthStats.winRate.toFixed(1) + '%' : '—'}</div>
        <div class="stat-sub">PF: ${monthStats.total && monthStats.grossLoss ? monthStats.profitFactor.toFixed(2) : '—'}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Best Trade (Month)</div>
        <div class="stat-value neutral text-profit">${monthStats.total ? formatCurrency(monthStats.bestTrade) : '—'}</div>
        <div class="stat-sub">${monthStats.worstTrade < 0 ? 'Worst' : 'Smallest'}: ${monthStats.total ? formatCurrency(monthStats.worstTrade) : '—'}</div>
      </div>
    </div>

    <!-- Main grid -->
    <div class="dashboard-grid">
      <!-- Left: Equity curve + Recent trades -->
      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- Equity Curve -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Equity Curve</div>
              <div class="card-subtitle">Cumulative P&amp;L — this month</div>
            </div>
          </div>
          <div class="chart-container">
            <canvas id="equity-chart"></canvas>
          </div>
        </div>

        <!-- Recent Trades -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Recent Trades</div>
            <a href="#trades" class="btn btn-ghost btn-sm">View All</a>
          </div>
          ${recentTrades.length === 0 ? `
            <div class="empty-state" style="padding:24px">
              <p>No trades logged yet. <button class="btn btn-primary btn-sm" onclick="window._openTradeModal()">Add your first trade</button></p>
            </div>
          ` : `
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Symbol</th><th>Dir</th><th>P&amp;L</th><th>Outcome</th><th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                ${recentTrades.map(t => `
                  <tr style="cursor:pointer" onclick="window._openTradeModal('${t.id}')">
                    <td class="td-mono">${formatDate(t.date)}</td>
                    <td><strong>${t.symbol}</strong></td>
                    <td>${getDirectionBadge(t.direction)}</td>
                    <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
                    <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
                    <td class="text-muted text-sm">${t.strategy || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          `}
        </div>
      </div>

      <!-- Right: Calendar + Journal snapshot -->
      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- P&L Calendar -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Monthly Calendar</div>
            <span class="text-muted text-sm">${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
          </div>
          <div id="pnl-calendar"></div>
        </div>

        <!-- Today's Journal Snapshot -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Today's Journal</div>
            <a href="#journal" class="btn btn-ghost btn-sm">Open Journal</a>
          </div>
          ${buildJournalSnapshot(journalEntry, todayTrades)}
        </div>

      </div>
    </div>
  `;
}

function buildJournalSnapshot(entry, trades) {
  if (!entry && !trades.length) {
    return `
      <div class="empty-state" style="padding:24px 0">
        <p class="text-muted">No journal entry for today yet.</p>
        <a href="#journal" class="btn btn-ghost btn-sm mt-8">Start journaling</a>
      </div>
    `;
  }

  const sections = [];
  if (entry?.daily_goals)    sections.push({ icon: '🎯', label: 'Goals', text: entry.daily_goals });
  if (entry?.what_went_well) sections.push({ icon: '✅', label: 'What went well', text: entry.what_went_well });
  if (entry?.what_went_wrong) sections.push({ icon: '⚠️', label: 'What went wrong', text: entry.what_went_wrong });

  if (!sections.length) {
    return `<p class="text-muted text-sm">Journal opened but no notes yet. <a href="#journal" style="color:var(--primary)">Add notes →</a></p>`;
  }

  return sections.map(s => `
    <div style="margin-bottom:12px">
      <div class="text-xs text-muted" style="margin-bottom:4px">${s.icon} ${s.label}</div>
      <div class="text-sm" style="line-height:1.6;color:var(--text-secondary)">${s.text.slice(0, 120)}${s.text.length > 120 ? '...' : ''}</div>
    </div>
  `).join('');
}

function initDashboard(today, todayTrades, monthTrades) {
  renderCalendar(monthTrades, today);
  renderEquityChart(monthTrades);
  window._openTradeModal = (id) => openTradeModal(id, today);
}

function renderCalendar(trades, today) {
  const el = document.getElementById('pnl-calendar');
  if (!el) return;

  // Group trades by date, sum PnL
  const pnlByDate = {};
  trades.forEach(t => {
    const d = t.date;
    if (!pnlByDate[d]) pnlByDate[d] = 0;
    pnlByDate[d] += parseFloat(t.pnl) || 0;
  });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = (firstDay + 6) % 7; // Monday start

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = `<div class="pnl-calendar">`;
  dayNames.forEach(d => html += `<div class="cal-header">${d}</div>`);

  // Empty cells before first day
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const pnl = pnlByDate[dateStr];
    const isToday = dateStr === today;

    let cls = 'no-trades';
    let pnlLabel = '';
    if (pnl !== undefined) {
      cls = pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : 'breakeven';
      pnlLabel = `<div class="cal-day-pnl">${pnl > 0 ? '+' : ''}${Math.round(pnl)}</div>`;
    }

    html += `
      <div class="cal-day ${cls} ${isToday ? 'today' : ''}" title="${dateStr}: ${pnl !== undefined ? formatCurrency(pnl) : 'No trades'}">
        <div class="cal-day-num">${day}</div>
        ${pnlLabel}
      </div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

function renderEquityChart(trades) {
  const canvas = document.getElementById('equity-chart');
  if (!canvas) return;

  if (equityChart) { equityChart.destroy(); equityChart = null; }

  // Sort by date then created_at, cumulate PnL
  const sorted = [...trades]
    .filter(t => t.outcome && t.outcome !== 'open' && t.pnl !== null)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

  if (!sorted.length) {
    canvas.parentElement.innerHTML = `<div class="empty-state"><p class="text-muted text-sm">Trade some to see your equity curve</p></div>`;
    return;
  }

  let cumulative = 0;
  const labels = [];
  const data   = [];
  sorted.forEach(t => {
    cumulative += parseFloat(t.pnl) || 0;
    labels.push(t.date);
    data.push(parseFloat(cumulative.toFixed(2)));
  });

  const isProfit = cumulative >= 0;
  const color = isProfit ? '#00d97e' : '#ff4757';

  equityChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, isProfit ? 'rgba(0,217,126,0.3)' : 'rgba(255,71,87,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: data.length > 20 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1c30',
          borderColor: '#1e3558',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` Equity: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          display: false,
          grid: { display: false }
        },
        y: {
          grid: { color: 'rgba(30,53,88,0.5)' },
          ticks: {
            color: '#4a6080',
            font: { family: 'JetBrains Mono', size: 11 },
            callback: (v) => formatCurrency(v, 0)
          }
        }
      }
    }
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatDisplayFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
