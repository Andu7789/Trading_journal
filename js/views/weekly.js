// =============================================
//  WEEKLY REVIEW VIEW
// =============================================
import { getTrades, getJournalEntries, getStrategySetups } from '../db.js';
import { calcStats, formatCurrency, formatDate, formatDateShort,
         pnlClass, pnlSign, getOutcomeBadge, getDirectionBadge,
         todayString, getWeekRange, addDays, nl2br, getSignalDisplay,
         calcTradeR, formatR, escapeHtml,
         imageGridColumns, imageGridPlaceholders } from '../utils.js';
import { openTradeModal } from '../app.js';

let currentWeekStart  = null;
let weeklyEquityChart = null;

export async function renderWeekly(container) {
  document.getElementById('page-title').textContent = 'Weekly Review';

  if (!currentWeekStart) {
    currentWeekStart = getWeekRange(todayString()).start;
  }

  container.innerHTML = buildWeeklyShell();
  initWeeklyNav();
  await loadWeek();
}

function buildWeeklyShell() {
  return `
    <div class="page-header">
      <h1>Weekly Review</h1>
    </div>
    <div class="week-nav">
      <button class="btn btn-ghost btn-sm" id="week-prev">‹ Prev Week</button>
      <span class="week-label" id="week-label">Loading...</span>
      <button class="btn btn-ghost btn-sm" id="week-next">Next Week ›</button>
      <button class="btn btn-ghost btn-sm" id="week-current">This Week</button>
    </div>
    <div id="weekly-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;
}

function initWeeklyNav() {
  document.getElementById('week-prev').onclick = () => {
    currentWeekStart = addDays(currentWeekStart, -7);
    loadWeek();
  };
  document.getElementById('week-next').onclick = () => {
    currentWeekStart = addDays(currentWeekStart, 7);
    loadWeek();
  };
  document.getElementById('week-current').onclick = () => {
    currentWeekStart = getWeekRange(todayString()).start;
    loadWeek();
  };
}

async function loadWeek() {
  const content = document.getElementById('weekly-content');
  const label   = document.getElementById('week-label');
  if (!content) return;

  const weekEnd = addDays(currentWeekStart, 6);

  const start = new Date(currentWeekStart + 'T00:00:00');
  const end   = new Date(weekEnd + 'T00:00:00');
  label.textContent = `${start.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} — ${end.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`;

  if (weeklyEquityChart) { weeklyEquityChart.destroy(); weeklyEquityChart = null; }
  content.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    const [trades, journalEntries, strategySetups] = await Promise.all([
      getTrades({ startDate: currentWeekStart, endDate: weekEnd }),
      getJournalEntries(currentWeekStart, weekEnd),
      getStrategySetups({ startDate: currentWeekStart, endDate: weekEnd })
    ]);

    content.innerHTML = buildWeeklyContent(currentWeekStart, weekEnd, trades, journalEntries, strategySetups);
    wireWeeklyInteractions(trades, journalEntries);
    renderWeeklyEquityChart(trades);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildWeeklyContent(startDate, endDate, trades, journalEntries, strategySetups) {
  const today = todayString();
  const stats = calcStats(trades);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    const dayTrades  = trades.filter(t => t.date === date);
    const dayTakenTrades = dayTrades.filter(t => (t.trade_type || 'taken') === 'taken');
    const daySetups = strategySetups.filter(s => s.date === date);
    const dayJournal = journalEntries.find(j => j.date === date);
    const dayStats   = calcStats(dayTrades);
    const dayLabel   = new Date(date + 'T00:00:00').toLocaleDateString('en-GB',{ weekday:'short' });
    const dayNum     = new Date(date + 'T00:00:00').getDate();

    days.push({ date, dayTrades, dayTakenTrades, daySetups, dayJournal, dayStats, dayLabel, dayNum });
  }

  const weekPnl   = stats.totalPnl;
  const weekClass = weekPnl >= 0 ? 'profit' : 'loss';

  return `
    <!-- Equity Curve -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div>
          <div class="card-title">Week Equity Curve</div>
          <div class="card-subtitle">Cumulative P&amp;L trade-by-trade</div>
        </div>
      </div>
      <div class="chart-container" id="weekly-equity-container">
        <canvas id="weekly-equity-chart"></canvas>
      </div>
    </div>

    <!-- Week Stats -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card ${weekClass}">
        <div class="stat-label">Week P&amp;L</div>
        <div class="stat-value ${weekClass}">${pnlSign(weekPnl)}${formatCurrency(weekPnl)}</div>
        <div class="stat-sub">${stats.total} closed trades</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value neutral">${stats.total ? stats.winRate.toFixed(1) + '%' : '—'}</div>
        <div class="stat-sub">${stats.wins}W / ${stats.losses}L</div>
      </div>
      <div class="stat-card secondary">
        <div class="stat-label">Best Day</div>
        <div class="stat-value text-profit">${bestDay(days)}</div>
        <div class="stat-sub">Worst: ${worstDay(days)}</div>
      </div>
      <div class="stat-card ${stats.tradesWithR && stats.totalR >= 0 ? 'profit' : stats.tradesWithR ? 'loss' : ''}">
        <div class="stat-label">Week R</div>
        <div class="stat-value ${stats.tradesWithR ? (stats.totalR >= 0 ? 'profit' : 'loss') : 'neutral'}">${stats.tradesWithR ? formatR(stats.totalR) : '—'}</div>
        <div class="stat-sub">Avg R/trade: ${stats.tradesWithR ? formatR(stats.avgR) : '—'}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Journal Days</div>
        <div class="stat-value neutral">${journalEntries.length}/7</div>
        <div class="stat-sub">Days journaled this week</div>
      </div>
    </div>

    ${strategySetups.length ? buildOpportunityComparison(days) : ''}

    ${buildWeeklySins(journalEntries)}

    <!-- Day Cards Grid -->
    <div class="week-day-grid" style="margin-bottom:24px">
      ${days.map(d => buildDayCard(d, today)).join('')}
    </div>

    <!-- Detailed day sections -->
    <div id="weekly-day-details" style="display:flex;flex-direction:column;gap:16px">
      ${days.filter(d => d.dayTrades.length || d.dayJournal).map(d => buildDayDetail(d)).join('')}
    </div>

    ${(!trades.length && !journalEntries.length && !strategySetups.length) ? `
      <div class="empty-state" style="padding:60px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h3>No activity this week</h3>
        <p>No trades or journal entries found for this week</p>
      </div>
    ` : ''}
  `;
}

function buildWeeklySins(journalEntries) {
  const totals = new Map();
  const byDate = new Map();

  journalEntries.forEach(entry => {
    const dayTotal = (Array.isArray(entry.trading_sins) ? entry.trading_sins : [])
      .reduce((sum, sin) => sum + Math.max(0, parseInt(sin?.count) || 0), 0);
    if (dayTotal) byDate.set(entry.date, dayTotal);

    (Array.isArray(entry.trading_sins) ? entry.trading_sins : []).forEach(sin => {
      const name = typeof sin?.name === 'string' ? sin.name.trim() : '';
      const count = Math.max(0, parseInt(sin?.count) || 0);
      if (!name || !count) return;
      const key = name.toLowerCase();
      const existing = totals.get(key) || { name, count: 0 };
      existing.count += count;
      totals.set(key, existing);
    });
  });

  const sins = [...totals.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!sins.length) return '';
  const weekTotal = sins.reduce((sum, sin) => sum + sin.count, 0);
  const maxCount = Math.max(...sins.map(sin => sin.count));

  return `
    <div class="card weekly-sins">
      <div class="card-header">
        <div>
          <div class="card-title">Trading Sins</div>
          <div class="card-subtitle">Running total of recorded occurrences this week</div>
        </div>
        <div class="weekly-sins-total">
          <strong>${weekTotal}</strong>
          <span>total</span>
        </div>
      </div>
      <div class="weekly-sins-grid">
        <div class="weekly-sins-list">
          ${sins.map(sin => `
            <div class="weekly-sin-row">
              <span>${escapeHtml(sin.name)}</span>
              <div class="weekly-sin-track"><div style="width:${sin.count / maxCount * 100}%"></div></div>
              <strong>${sin.count}</strong>
            </div>
          `).join('')}
        </div>
        <div class="weekly-sins-days">
          ${[...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => `
            <div>
              <span>${formatDateShort(date)}</span>
              <strong>${count}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function buildOpportunityComparison(days) {
  const comparisonDays = days.map(d => ({
    ...d,
    actualR: sumActualR(d.dayTakenTrades),
    possibleR: sumPossibleR(d.daySetups),
  }));
  const actualR = parseFloat(comparisonDays.reduce((sum, d) => sum + d.actualR, 0).toFixed(2));
  const possibleR = parseFloat(comparisonDays.reduce((sum, d) => sum + d.possibleR, 0).toFixed(2));
  const captureRate = possibleR > 0 ? Math.round(actualR / possibleR * 100) : null;
  const activeDays = comparisonDays.filter(d =>
    d.dayTakenTrades.some(t => calcTradeR(t) !== null) ||
    d.daySetups.some(s => calcPossibleSetupR(s) !== null)
  );
  const maxR = Math.max(1, ...activeDays.flatMap(d => [Math.abs(d.actualR), Math.abs(d.possibleR)]));

  return `
    <div class="card opportunity-comparison">
      <div class="opportunity-comparison-header">
        <div>
          <div class="card-title">Actual R vs Possible R</div>
          <div class="card-subtitle">Actual R from trades taken compared with the Strategy Tracker result for the same days</div>
        </div>
        <div class="opportunity-summary">
          <div>
            <span class="opportunity-summary-value ${pnlClass(actualR)}">${formatR(actualR)}</span>
            <span class="text-xs text-muted">actual R</span>
          </div>
          <div class="opportunity-summary-divider">/</div>
          <div>
            <span class="opportunity-summary-value" style="color:var(--warning)">${formatR(possibleR)}</span>
            <span class="text-xs text-muted">possible R</span>
          </div>
          <div class="opportunity-capture">
            <span class="text-xs text-muted">R captured</span>
            <strong>${captureRate !== null ? captureRate + '%' : '—'}</strong>
          </div>
        </div>
      </div>
      <div class="opportunity-legend">
        <span><i class="opportunity-key actual"></i>Actual R</span>
        <span><i class="opportunity-key possible"></i>Possible R</span>
      </div>
      <div class="opportunity-days">
        ${activeDays.map(d => {
          const actualWidth = Math.abs(d.actualR) / maxR * 100;
          const possibleWidth = Math.abs(d.possibleR) / maxR * 100;
          return `
            <div class="opportunity-day">
              <div class="opportunity-day-label">${d.dayLabel} ${d.dayNum}</div>
              <div class="opportunity-bars">
                <div class="opportunity-bar-row">
                  <div class="opportunity-bar-track"><div class="opportunity-bar actual" style="width:${actualWidth}%"></div></div>
                  <span class="${pnlClass(d.actualR)}">${formatR(d.actualR)}</span>
                </div>
                <div class="opportunity-bar-row">
                  <div class="opportunity-bar-track"><div class="opportunity-bar possible" style="width:${possibleWidth}%"></div></div>
                  <span class="${pnlClass(d.possibleR)}">${formatR(d.possibleR)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function sumActualR(trades) {
  return parseFloat(trades.reduce((sum, trade) => sum + (calcTradeR(trade) ?? 0), 0).toFixed(2));
}

function calcPossibleSetupR(setup) {
  if (!setup.outcome || setup.outcome === 'pending') return null;
  if (setup.outcome === 'win') return parseFloat(setup.possible_r) || 0;
  if (setup.outcome === 'loss') return -1;
  if (setup.outcome === 'breakeven') return 0;
  return null;
}

function sumPossibleR(setups) {
  return parseFloat(setups.reduce((sum, setup) => sum + (calcPossibleSetupR(setup) ?? 0), 0).toFixed(2));
}

function renderWeeklyEquityChart(trades) {
  const canvas = document.getElementById('weekly-equity-chart');
  if (!canvas) return;

  if (weeklyEquityChart) { weeklyEquityChart.destroy(); weeklyEquityChart = null; }

  const sorted = [...trades]
    .filter(t => t.outcome && t.outcome !== 'open' && t.pnl !== null)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

  canvas.style.display = '';
  canvas.parentElement.querySelector('.chart-empty-msg')?.remove();

  if (!sorted.length) {
    canvas.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'chart-empty-msg empty-state';
    msg.innerHTML = '<p class="text-muted text-sm">No trades this week to chart</p>';
    canvas.parentElement.appendChild(msg);
    return;
  }

  let cumulative = 0;
  const labels = [];
  const data   = [];
  sorted.forEach(t => {
    cumulative += parseFloat(t.pnl) || 0;
    labels.push(`${t.date} ${t.symbol || ''}`);
    data.push(parseFloat(cumulative.toFixed(2)));
  });

  const isProfit = cumulative >= 0;
  const color    = isProfit ? '#00d97e' : '#ff4757';

  weeklyEquityChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
          gradient.addColorStop(0, isProfit ? 'rgba(0,217,126,0.3)' : 'rgba(255,71,87,0.3)');
          gradient.addColorStop(1, 'rgba(0,0,0,0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
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
            title: (items) => items[0].label,
            label: (ctx) => ` Equity: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { display: false, grid: { display: false } },
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

function buildDayCard(d, today) {
  const { date, dayStats, dayTrades, dayLabel, dayNum } = d;
  const pnl = dayStats.totalPnl;
  let cls = '';
  if (dayTrades.length) cls = pnl >= 0 ? 'profit' : 'loss';

  return `
    <div class="week-day-card ${cls} ${date === today ? 'today' : ''}"
         onclick="window._scrollToDay('${date}')"
         style="cursor:pointer">
      <div class="week-day-name">${dayLabel}</div>
      <div class="week-day-date">${dayNum}</div>
      <div class="week-day-pnl ${pnlClass(pnl)}">
        ${dayTrades.length ? pnlSign(pnl) + formatCurrency(pnl) : '<span class="text-muted text-sm">No trades</span>'}
      </div>
      <div class="week-day-trades">
        ${dayTrades.length ? `${dayTrades.length} trade${dayTrades.length !== 1 ? 's' : ''} · ${dayStats.wins}W/${dayStats.losses}L` : ''}
      </div>
    </div>
  `;
}

function buildDayDetail(d) {
  const { date, dayTrades, dayJournal, dayStats } = d;
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long'});
  const pnl = dayStats.totalPnl;

  return `
    <div class="card" id="day-${date}" style="scroll-margin-top:80px">
      <div class="card-header" style="margin-bottom:20px">
        <div>
          <div class="card-title" style="font-size:16px">${dateLabel}</div>
          ${dayTrades.length ? `
            <div style="display:flex;gap:12px;margin-top:4px;font-size:13px;flex-wrap:wrap">
              <span class="${pnlClass(pnl)} text-mono" style="font-weight:700">${pnlSign(pnl)}${formatCurrency(pnl)}</span>
              ${dayStats.tradesWithR ? `<span class="td-mono ${dayStats.totalR >= 0 ? 'text-profit' : 'text-loss'}">${formatR(dayStats.totalR)}</span>` : ''}
              <span class="text-muted">${dayStats.wins}W/${dayStats.losses}L · ${dayStats.total ? dayStats.winRate.toFixed(0) + '%' : '0%'} WR</span>
            </div>
          ` : '<div class="text-xs text-muted">No trades</div>'}
        </div>
        <a href="#journal?date=${date}" class="btn btn-ghost btn-sm">Open Journal →</a>
      </div>

      ${dayTrades.length ? buildWeekTradeTable(dayTrades) : ''}

      ${dayJournal ? buildTaggedNotes(dayJournal) : ''}

      ${dayJournal ? buildJournalSummary(dayJournal) : ''}
    </div>
  `;
}

function buildWeekTradeTable(trades) {
  return `
    <div class="table-wrapper" style="margin-bottom:16px">
      <table>
        <thead>
          <tr><th>Symbol</th><th>Dir</th><th>P&amp;L</th><th>R</th><th>Outcome</th><th>Strategy</th><th>Conf.</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${trades.map(t => {
            const r = calcTradeR(t);
            return `
            <tr style="cursor:pointer" onclick="window._openTradeModalWeekly('${t.id}')">
              <td><strong>${t.symbol}</strong></td>
              <td>${getDirectionBadge(t.direction)}</td>
              <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
              <td class="td-mono ${r !== null ? pnlClass(r) : ''}">${formatR(r)}</td>
              <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
              <td class="text-sm text-muted">${t.strategy || '—'}</td>
              <td>${getSignalDisplay(t.signals)}</td>
              <td class="text-sm text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${t.notes ? t.notes.slice(0,60) + (t.notes.length > 60 ? '...' : '') : '—'}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
    ${trades.some(t => t.screenshots?.length) ? buildScreenshots(trades) : ''}
  `;
}

function buildTaggedNotes(journal) {
  const entries = (Array.isArray(journal.session_log) ? journal.session_log : [])
    .filter(e => e && typeof e.tag === 'string' && e.tag.trim());
  if (!entries.length) return '';

  return `
    <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:12px">
      ${entries.map(entry => {
        const images = Array.isArray(entry.images) ? entry.images.filter(Boolean) : [];
        const isMistake = entry.tag.toLowerCase().includes('mistake');
        return `
        <div class="weekly-tagged-note">
          <div class="weekly-tagged-note-header ${isMistake ? 'mistake' : ''}">${escapeHtml(entry.tag)}</div>
          ${entry.comment ? `<div class="session-log-comment">${nl2br(entry.comment)}</div>` : ''}
          ${images.length ? `
          <div class="log-images-grid" style="grid-template-columns:repeat(${imageGridColumns(images.length)}, 1fr)">
            ${images.map(url => `
              <div class="log-image-item">
                <img src="${url}" onclick='window._viewImage("${url}", ${JSON.stringify(images)})' alt="tagged note screenshot">
              </div>
            `).join('')}
            ${imageGridPlaceholders(images.length)}
          </div>` : ''}
        </div>
      `;
      }).join('')}
    </div>
  `;
}

function buildScreenshots(trades) {
  const allScreenshots = trades.flatMap(t => t.screenshots || []);
  if (!allScreenshots.length) return '';
  return `
    <div data-ss-section style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.5px">
          Screenshots (${allScreenshots.length})
        </span>
        ${allScreenshots.length > 1 ? `<button class="btn btn-ghost btn-xs" onclick="window._openGalleryFromSection(this)">View All</button>` : ''}
      </div>
      <div class="screenshots-grid">
        ${allScreenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewPreview(this)" alt="screenshot">`).join('')}
      </div>
    </div>
  `;
}

function buildJournalSummary(journal) {
  const sections = [
    { label: 'Market Bias', icon: '🧭', val: journal.market_bias ? `<span class="badge badge-${journal.market_bias === 'bullish' ? 'profit' : journal.market_bias === 'bearish' ? 'loss' : 'open'}">${journal.market_bias.toUpperCase()}</span>` : null, raw: true },
    { label: 'Daily Goals', icon: '🎯', val: journal.daily_goals },
    { label: 'What went well', icon: '✅', val: journal.what_went_well },
    { label: 'What went wrong', icon: '⚠️', val: journal.what_went_wrong },
    { label: 'Lessons Learned', icon: '💡', val: journal.lessons_learned },
    { label: "Tomorrow's Focus", icon: '🔭', val: journal.tomorrow_focus },
  ].filter(s => s.val);

  if (!sections.length) return '';

  const ratings = [];
  if (journal.discipline_rating) ratings.push(`Discipline: ${journal.discipline_rating}/10`);
  if (journal.emotion_rating)    ratings.push(`Emotion: ${journal.emotion_rating}/10`);
  if (journal.overall_rating)    ratings.push(`Overall: ${journal.overall_rating}/10`);

  return `
    <div style="border-top:1px solid var(--border);padding-top:16px">
      <div class="text-xs text-muted" style="margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">Journal Entry</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${sections.map(s => `
          <div>
            <div class="text-xs text-muted mb-8">${s.icon} ${s.label}</div>
            <div class="text-sm" style="line-height:1.6;color:var(--text-secondary)">${s.raw ? s.val : nl2br(String(s.val))}</div>
          </div>
        `).join('')}
      </div>
      ${ratings.length ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:20px">
          ${ratings.map(r => `<span class="text-sm text-mono" style="color:var(--primary)">${r}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function wireWeeklyInteractions(trades, journalEntries) {
  window._scrollToDay = (date) => {
    const el = document.getElementById(`day-${date}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window._openTradeModalWeekly = (id) => openTradeModal(id, null, () => loadWeek());
}

function bestDay(days) {
  const activeDays = days.filter(d => d.dayTrades.length);
  if (!activeDays.length) return '—';
  const best = activeDays.reduce((a, b) => a.dayStats.totalPnl > b.dayStats.totalPnl ? a : b);
  return formatCurrency(best.dayStats.totalPnl);
}

function worstDay(days) {
  const activeDays = days.filter(d => d.dayTrades.length);
  if (!activeDays.length) return '—';
  const worst = activeDays.reduce((a, b) => a.dayStats.totalPnl < b.dayStats.totalPnl ? a : b);
  return formatCurrency(worst.dayStats.totalPnl);
}
