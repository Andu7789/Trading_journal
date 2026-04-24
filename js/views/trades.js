// =============================================
//  TRADE LOG VIEW
// =============================================
import { getTrades, deleteTrade, getClient } from '../db.js';
import { calcStats, formatCurrency, formatDate, pnlClass, pnlSign,
         getOutcomeBadge, getDirectionBadge, getEmotionChip,
         todayString, getWeekRange, addDays, nl2br } from '../utils.js';
import { openTradeModal, showToast } from '../app.js';

let currentFilters = {};

export async function renderTrades(container) {
  document.getElementById('page-title').textContent = 'Trade Log';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Trade Log</h1>
        <div class="page-header-sub">All your trades in one place</div>
      </div>
      <button class="btn btn-primary" onclick="window._openTradeModalTrades()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Log Trade
      </button>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-ghost btn-sm" onclick="window._quickFilter('this-week')">This Week</button>
        <button class="btn btn-ghost btn-sm" onclick="window._quickFilter('last-week')">Last Week</button>
        <button class="btn btn-ghost btn-sm" onclick="window._quickFilter('this-month')">This Month</button>
        <button class="btn btn-ghost btn-sm" onclick="window._quickFilter('last-month')">Last Month</button>
      </div>
      <div class="filters-bar" id="filters-bar">
        <div class="filter-group">
          <label class="filter-label">From</label>
          <input type="date" id="filter-start" class="form-input" style="width:140px">
        </div>
        <div class="filter-group">
          <label class="filter-label">To</label>
          <input type="date" id="filter-end" class="form-input" style="width:140px">
        </div>
        <div class="filter-group">
          <label class="filter-label">Symbol</label>
          <input type="text" id="filter-symbol" class="form-input" style="width:120px" placeholder="EUR/USD...">
        </div>
        <div class="filter-group">
          <label class="filter-label">Outcome</label>
          <select id="filter-outcome" class="form-input" style="width:130px">
            <option value="">All</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
            <option value="open">Open</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Direction</label>
          <select id="filter-direction" class="form-input" style="width:110px">
            <option value="">All</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Strategy</label>
          <input type="text" id="filter-strategy" class="form-input" style="width:140px" placeholder="Breakout...">
        </div>
        <div style="display:flex;gap:8px;align-self:flex-end">
          <button class="btn btn-primary btn-sm" id="apply-filters-btn">Apply</button>
          <button class="btn btn-ghost btn-sm" id="clear-filters-btn">Clear</button>
        </div>
      </div>
    </div>

    <!-- Stats summary -->
    <div id="trade-stats-row" class="stats-grid" style="margin-bottom:16px"></div>

    <!-- Trade Table -->
    <div class="card" style="padding:0">
      <div id="trades-table-container">
        <div class="loading-screen"><div class="loading-spinner"></div></div>
      </div>
    </div>
  `;

  window._openTradeModalTrades = () => openTradeModal(null, null, refreshTrades);

  window._quickFilter = (period) => {
    const today = todayString();
    const thisWeek = getWeekRange(today);
    let start, end;
    if (period === 'this-week') {
      start = thisWeek.start; end = thisWeek.end;
    } else if (period === 'last-week') {
      const lastMon = addDays(thisWeek.start, -7);
      const lastWeek = getWeekRange(lastMon);
      start = lastWeek.start; end = lastWeek.end;
    } else if (period === 'this-month') {
      const d = new Date(today + 'T00:00:00');
      start = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      end = today;
    } else if (period === 'last-month') {
      const d = new Date(today + 'T00:00:00');
      const lastMonth = d.getMonth() === 0 ? 12 : d.getMonth();
      const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const lastDay = new Date(year, lastMonth, 0).getDate();
      start = `${year}-${String(lastMonth).padStart(2,'0')}-01`;
      end   = `${year}-${String(lastMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    }
    document.getElementById('filter-start').value = start;
    document.getElementById('filter-end').value   = end;
    applyFilters();
  };

  document.getElementById('apply-filters-btn').onclick = applyFilters;
  document.getElementById('clear-filters-btn').onclick = clearFilters;

  // Enter on filter inputs
  ['filter-start','filter-end','filter-symbol','filter-outcome','filter-direction','filter-strategy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onkeypress = (e) => { if (e.key === 'Enter') applyFilters(); };
  });

  await loadTrades();
}

async function applyFilters() {
  currentFilters = {
    startDate:  document.getElementById('filter-start')?.value || undefined,
    endDate:    document.getElementById('filter-end')?.value || undefined,
    symbol:     document.getElementById('filter-symbol')?.value || undefined,
    outcome:    document.getElementById('filter-outcome')?.value || undefined,
    direction:  document.getElementById('filter-direction')?.value || undefined,
    strategy:   document.getElementById('filter-strategy')?.value || undefined,
  };
  // Remove undefined keys
  Object.keys(currentFilters).forEach(k => { if (!currentFilters[k]) delete currentFilters[k]; });
  await loadTrades();
}

function clearFilters() {
  currentFilters = {};
  ['filter-start','filter-end','filter-symbol','filter-strategy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['filter-outcome','filter-direction'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadTrades();
}

async function refreshTrades() {
  await loadTrades();
}

async function loadTrades() {
  const statsEl = document.getElementById('trade-stats-row');
  const tableEl = document.getElementById('trades-table-container');
  if (!tableEl) return;

  tableEl.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    const trades = await getTrades(currentFilters);
    const stats  = calcStats(trades);

    // Stats
    if (statsEl) {
      const monthPnl = stats.totalPnl;
      statsEl.innerHTML = `
        <div class="stat-card ${monthPnl >= 0 ? 'profit' : 'loss'}">
          <div class="stat-label">Total P&amp;L</div>
          <div class="stat-value ${monthPnl >= 0 ? 'profit' : 'loss'}">${pnlSign(monthPnl)}${formatCurrency(monthPnl)}</div>
          <div class="stat-sub">${stats.total} closed trades</div>
        </div>
        <div class="stat-card primary">
          <div class="stat-label">Win Rate</div>
          <div class="stat-value neutral">${stats.total ? stats.winRate.toFixed(1) + '%' : '—'}</div>
          <div class="stat-sub">${stats.wins}W / ${stats.losses}L</div>
        </div>
        <div class="stat-card secondary">
          <div class="stat-label">Profit Factor</div>
          <div class="stat-value neutral">${stats.total && stats.grossLoss ? stats.profitFactor.toFixed(2) : '—'}</div>
          <div class="stat-sub">Gross W / Gross L</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg Win</div>
          <div class="stat-value text-profit">${stats.wins ? formatCurrency(stats.avgWin) : '—'}</div>
          <div class="stat-sub">Avg Loss: ${stats.losses ? formatCurrency(-stats.avgLoss) : '—'}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">Best Trade</div>
          <div class="stat-value neutral text-profit">${stats.total ? formatCurrency(stats.bestTrade) : '—'}</div>
          <div class="stat-sub">${stats.worstTrade < 0 ? 'Worst' : 'Smallest'}: ${stats.total ? formatCurrency(stats.worstTrade) : '—'}</div>
        </div>
      `;
    }

    // Table
    if (!trades.length) {
      tableEl.innerHTML = `
        <div class="empty-state" style="padding:48px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <h3>No trades found</h3>
          <p>${Object.keys(currentFilters).length ? 'Try adjusting your filters' : 'Start logging your trades to see them here'}</p>
        </div>
      `;
      return;
    }

    tableEl.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Symbol</th>
              <th>Direction</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Size</th>
              <th>SL</th>
              <th>TP</th>
              <th>P&amp;L</th>
              <th>R:R</th>
              <th>Outcome</th>
              <th>Strategy</th>
              <th>TF</th>
              <th>Tilt</th>
              <th>Emotion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${trades.map(t => buildTradeRow(t)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Wire up row expand for notes/screenshots
    document.querySelectorAll('.trade-row-main').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = row.dataset.id;
        const detailRow = document.getElementById(`detail-${id}`);
        if (detailRow) detailRow.classList.toggle('hidden');
      });
    });

    // Wire delete buttons
    document.querySelectorAll('.delete-trade-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        confirmDeleteTrade(btn.dataset.id);
      };
    });

    // Wire edit buttons
    document.querySelectorAll('.edit-trade-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openTradeModal(btn.dataset.id, null, refreshTrades);
      };
    });

  } catch (err) {
    tableEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildTradeRow(t) {
  const hasDetails = t.notes || t.mistakes || (t.screenshots && t.screenshots.length) || t.tags?.length;

  return `
    <tr class="trade-row-main" data-id="${t.id}" style="cursor:pointer" title="Click to expand notes">
      <td class="td-mono">${formatDate(t.date)}</td>
      <td><strong>${t.symbol}</strong></td>
      <td>${getDirectionBadge(t.direction)}</td>
      <td class="td-mono">${t.entry_price ?? '—'}</td>
      <td class="td-mono">${t.exit_price ?? '—'}</td>
      <td class="td-mono">${t.size ?? '—'}</td>
      <td class="td-mono">${t.stop_loss ?? '—'}</td>
      <td class="td-mono">${t.take_profit ?? '—'}</td>
      <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
      <td class="td-mono">${t.risk_reward ? t.risk_reward + 'R' : '—'}</td>
      <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
      <td class="text-sm text-muted">${t.strategy || '—'}</td>
      <td class="text-sm text-muted">${t.timeframe || '—'}</td>
      <td class="td-mono text-sm">${t.tilt_meter ? t.tilt_meter + '/10' : '—'}</td>
      <td>${getEmotionChip(t.emotion)}</td>
      <td>
        <div class="trade-actions">
          <button class="btn btn-ghost btn-xs edit-trade-btn" data-id="${t.id}">Edit</button>
          <button class="btn btn-danger btn-xs delete-trade-btn" data-id="${t.id}">Del</button>
        </div>
      </td>
    </tr>
    ${hasDetails ? `
    <tr id="detail-${t.id}" class="hidden">
      <td colspan="16" style="background:var(--bg-surface);padding:16px 20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${t.trade_type === 'missed' && t.missed_reason ? `
            <div>
              <div class="text-xs text-muted mb-8">Why Not Taken</div>
              <div class="text-sm" style="color:var(--warning)">${t.missed_reason.replace(/_/g,' ')}</div>
            </div>` : ''}
          ${t.notes ? `
            <div>
              <div class="text-xs text-muted mb-8">Trade Notes</div>
              <div class="text-sm" style="line-height:1.6;color:var(--text-secondary)">${nl2br(t.notes)}</div>
            </div>` : ''}
          ${t.mistakes ? `
            <div>
              <div class="text-xs text-muted mb-8">Mistakes / Deviations</div>
              <div class="text-sm" style="line-height:1.6;color:var(--loss)">${nl2br(t.mistakes)}</div>
            </div>` : ''}
        </div>
        ${t.tags?.length ? `
          <div class="mt-8">
            <div class="inline-tags">
              ${t.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        ${t.screenshots?.length ? `
          <div class="mt-8">
            <div class="text-xs text-muted mb-8">Screenshots</div>
            <div class="screenshots-grid">
              ${t.screenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewImage('${url}',${JSON.stringify(t.screenshots)})" alt="screenshot">`).join('')}
            </div>
          </div>` : ''}
      </td>
    </tr>
    ` : ''}
  `;
}

async function confirmDeleteTrade(id) {
  if (!confirm('Delete this trade? This cannot be undone.')) return;
  try {
    await deleteTrade(id);
    showToast('Trade deleted', 'success');
    await loadTrades();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}
