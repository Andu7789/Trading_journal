// =============================================
//  WEEKLY REVIEW VIEW
// =============================================
import { getTrades, getJournalEntries } from '../db.js';
import { calcStats, formatCurrency, formatDate, formatDateShort,
         pnlClass, pnlSign, getOutcomeBadge, getDirectionBadge,
         todayString, getWeekRange, addDays, nl2br } from '../utils.js';
import { openTradeModal } from '../app.js';

let currentWeekStart = null;

export async function renderWeekly(container) {
  document.getElementById('page-title').textContent = 'Weekly Review';

  // Start at current week
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

  // Update label
  const start = new Date(currentWeekStart + 'T00:00:00');
  const end   = new Date(weekEnd + 'T00:00:00');
  label.textContent = `${start.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} — ${end.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`;

  content.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    const [trades, journalEntries] = await Promise.all([
      getTrades({ startDate: currentWeekStart, endDate: weekEnd }),
      getJournalEntries(currentWeekStart, weekEnd)
    ]);

    content.innerHTML = buildWeeklyContent(currentWeekStart, weekEnd, trades, journalEntries);
    wireWeeklyInteractions(trades, journalEntries);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildWeeklyContent(startDate, endDate, trades, journalEntries) {
  const today = todayString();
  const stats = calcStats(trades);

  // Build day map
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(startDate, i);
    const dayTrades  = trades.filter(t => t.date === date);
    const dayJournal = journalEntries.find(j => j.date === date);
    const dayStats   = calcStats(dayTrades);
    const dayLabel   = new Date(date + 'T00:00:00').toLocaleDateString('en-GB',{ weekday:'short' });
    const dayNum     = new Date(date + 'T00:00:00').getDate();

    days.push({ date, dayTrades, dayJournal, dayStats, dayLabel, dayNum });
  }

  const weekPnl = stats.totalPnl;
  const weekClass = weekPnl >= 0 ? 'profit' : 'loss';

  return `
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
      <div class="stat-card">
        <div class="stat-label">Profit Factor</div>
        <div class="stat-value neutral">${stats.total && stats.grossLoss ? stats.profitFactor.toFixed(2) : '—'}</div>
        <div class="stat-sub">Avg Win: ${stats.wins ? formatCurrency(stats.avgWin) : '—'}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Journal Days</div>
        <div class="stat-value neutral">${journalEntries.length}/7</div>
        <div class="stat-sub">Days journaled this week</div>
      </div>
    </div>

    <!-- Day Cards Grid -->
    <div class="week-day-grid" style="margin-bottom:24px">
      ${days.map(d => buildDayCard(d, today)).join('')}
    </div>

    <!-- Detailed day sections -->
    <div id="weekly-day-details" style="display:flex;flex-direction:column;gap:16px">
      ${days.filter(d => d.dayTrades.length || d.dayJournal).map(d => buildDayDetail(d)).join('')}
    </div>

    ${(!trades.length && !journalEntries.length) ? `
      <div class="empty-state" style="padding:60px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h3>No activity this week</h3>
        <p>No trades or journal entries found for this week</p>
      </div>
    ` : ''}
  `;
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
            <div style="display:flex;gap:12px;margin-top:4px;font-size:13px">
              <span class="${pnlClass(pnl)} text-mono font-weight:700">${pnlSign(pnl)}${formatCurrency(pnl)}</span>
              <span class="text-muted">${dayStats.wins}W/${dayStats.losses}L · ${dayStats.total ? dayStats.winRate.toFixed(0) + '%' : '0%'} WR</span>
            </div>
          ` : '<div class="text-xs text-muted">No trades</div>'}
        </div>
        <a href="#journal?date=${date}" class="btn btn-ghost btn-sm">Open Journal →</a>
      </div>

      ${dayTrades.length ? buildWeekTradeTable(dayTrades) : ''}

      ${dayJournal ? buildJournalSummary(dayJournal) : ''}
    </div>
  `;
}

function buildWeekTradeTable(trades) {
  return `
    <div class="table-wrapper" style="margin-bottom:16px">
      <table>
        <thead>
          <tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>R:R</th><th>Outcome</th><th>Strategy</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${trades.map(t => `
            <tr style="cursor:pointer" onclick="window._openTradeModalWeekly('${t.id}')">
              <td><strong>${t.symbol}</strong></td>
              <td>${getDirectionBadge(t.direction)}</td>
              <td class="td-mono">${t.entry_price ?? '—'}</td>
              <td class="td-mono">${t.exit_price ?? '—'}</td>
              <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
              <td class="td-mono">${t.risk_reward ? t.risk_reward + 'R' : '—'}</td>
              <td>${getOutcomeBadge(t.outcome)}</td>
              <td class="text-sm text-muted">${t.strategy || '—'}</td>
              <td class="text-sm text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${t.notes ? t.notes.slice(0,60) + (t.notes.length > 60 ? '...' : '') : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${trades.some(t => t.screenshots?.length) ? buildScreenshots(trades) : ''}
  `;
}

function buildScreenshots(trades) {
  const allScreenshots = trades.flatMap(t => t.screenshots || []);
  if (!allScreenshots.length) return '';
  return `
    <div class="screenshots-grid" style="margin-bottom:16px">
      ${allScreenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewImage('${url}')" alt="screenshot">`).join('')}
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
