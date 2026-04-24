// =============================================
//  ANALYTICS VIEW
// =============================================
import { getTrades } from '../db.js';
import { calcStats, formatCurrency, groupBy, sum, todayString,
         getMonthRange, pnlSign, pnlClass, formatDate,
         getDirectionBadge, getOutcomeBadge, nl2br } from '../utils.js';
import { openTradeModal } from '../app.js';

let charts = {};
let _distBuckets = [];
let _dowByDay = {};

export async function renderAnalytics(container) {
  document.getElementById('page-title').textContent = 'Analytics';

  // Default: last 90 days
  const today = todayString();
  const d90 = addDaysStr(today, -90);

  container.innerHTML = `
    <div class="page-header">
      <div><h1>Analytics</h1><div class="page-header-sub">Performance insights &amp; patterns</div></div>
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div class="filter-group">
          <label class="filter-label">From</label>
          <input type="date" id="a-start" class="form-input" style="width:140px" value="${d90}">
        </div>
        <div class="filter-group">
          <label class="filter-label">To</label>
          <input type="date" id="a-end" class="form-input" style="width:140px" value="${today}">
        </div>
        <button class="btn btn-primary btn-sm" id="a-apply">Apply</button>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm a-preset" data-days="30">30D</button>
          <button class="btn btn-ghost btn-sm a-preset" data-days="90">90D</button>
          <button class="btn btn-ghost btn-sm a-preset" data-days="180">6M</button>
          <button class="btn btn-ghost btn-sm a-preset" data-days="365">1Y</button>
        </div>
      </div>
    </div>

    <div id="analytics-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;

  document.getElementById('a-apply').onclick = loadAnalytics;
  document.querySelectorAll('.a-preset').forEach(btn => {
    btn.onclick = () => {
      const days = parseInt(btn.dataset.days);
      document.getElementById('a-start').value = addDaysStr(today, -days);
      document.getElementById('a-end').value = today;
      loadAnalytics();
    };
  });

  await loadAnalytics();
}

async function loadAnalytics() {
  const content = document.getElementById('analytics-content');
  if (!content) return;

  const startDate = document.getElementById('a-start')?.value;
  const endDate   = document.getElementById('a-end')?.value;

  content.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  // Destroy old charts
  Object.values(charts).forEach(c => { try { c.destroy(); } catch {} });
  charts = {};

  try {
    const trades = await getTrades({ startDate, endDate });
    const closed = trades.filter(t => t.outcome && t.outcome !== 'open');

    if (!closed.length) {
      content.innerHTML = `
        <div class="empty-state" style="padding:60px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <h3>No closed trades found</h3>
          <p>Adjust your date range or log some trades to see analytics</p>
        </div>
      `;
      return;
    }

    content.innerHTML = buildAnalyticsLayout(closed);
    renderAllCharts(closed);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildAnalyticsLayout(trades) {
  const stats = calcStats(trades);

  return `
    <!-- Key Metrics -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card ${stats.totalPnl >= 0 ? 'profit' : 'loss'}">
        <div class="stat-label">Total P&amp;L</div>
        <div class="stat-value ${stats.totalPnl >= 0 ? 'profit' : 'loss'}">${pnlSign(stats.totalPnl)}${formatCurrency(stats.totalPnl)}</div>
        <div class="stat-sub">${stats.total} closed trades</div>
      </div>
      <div class="stat-card primary">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value neutral">${stats.winRate.toFixed(1)}%</div>
        <div class="stat-sub">${stats.wins}W / ${stats.losses}L / ${stats.bes}BE</div>
      </div>
      <div class="stat-card secondary">
        <div class="stat-label">Profit Factor</div>
        <div class="stat-value neutral">${stats.grossLoss ? stats.profitFactor.toFixed(2) : '∞'}</div>
        <div class="stat-sub">Gross W: ${formatCurrency(stats.grossWins)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Win / Loss</div>
        <div class="stat-value neutral">
          <span class="text-profit">${formatCurrency(stats.avgWin)}</span>
          <span style="color:var(--border-light)"> / </span>
          <span class="text-loss">${formatCurrency(stats.avgLoss)}</span>
        </div>
        <div class="stat-sub">Ratio: ${stats.avgLoss ? (stats.avgWin / stats.avgLoss).toFixed(2) : '—'}x</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Best / ${stats.worstTrade < 0 ? 'Worst' : 'Smallest'} Trade</div>
        <div class="stat-value neutral" style="font-size:16px">
          <span class="text-profit">${formatCurrency(stats.bestTrade)}</span>
          <span style="color:var(--border-light)"> / </span>
          <span class="${stats.worstTrade < 0 ? 'text-loss' : 'text-profit'}">${formatCurrency(stats.worstTrade)}</span>
        </div>
        <div class="stat-sub">Expected value: ${formatCurrency(stats.total ? stats.totalPnl / stats.total : 0)}/trade</div>
      </div>
    </div>

    <!-- Row 1: Equity curve + R-multiple distribution -->
    <div class="analytics-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">Equity Curve</div></div>
        <div class="chart-wrapper"><canvas id="chart-equity"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">P&amp;L Distribution</div><div class="card-subtitle">Trade outcomes by value</div></div>
        <div class="chart-wrapper"><canvas id="chart-distribution"></canvas></div>
      </div>
    </div>

    <!-- Distribution drill-down (shown on bar click) -->
    <div id="dist-drilldown" style="display:none;margin-bottom:16px"></div>

    <!-- Row 2: By pair + By session -->
    <div class="analytics-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">Performance by Symbol</div><div class="card-subtitle">Win rate &amp; P&amp;L per instrument</div></div>
        <div class="chart-wrapper" style="height:260px"><canvas id="chart-by-symbol"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Performance by Session</div></div>
        <div class="chart-wrapper"><canvas id="chart-by-session"></canvas></div>
      </div>
    </div>

    <!-- Row 3: By day of week + By strategy -->
    <div class="analytics-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">P&amp;L by Day of Week</div></div>
        <div class="chart-wrapper"><canvas id="chart-by-dow"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Performance by Strategy</div></div>
        <div class="chart-wrapper"><canvas id="chart-by-strategy"></canvas></div>
      </div>
    </div>

    <!-- DOW drill-down (shown on bar click) -->
    <div id="dow-drilldown" style="display:none;margin-bottom:16px"></div>

    <!-- Row 4: Emotion analysis + Tilt meter -->
    <div class="analytics-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">P&amp;L by Emotion</div><div class="card-subtitle">How emotions affect your results</div></div>
        <div class="chart-wrapper"><canvas id="chart-by-emotion"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Tilt Meter vs Outcome</div><div class="card-subtitle">Mental state correlation</div></div>
        <div class="chart-wrapper"><canvas id="chart-tilt"></canvas></div>
      </div>
    </div>

    <!-- Row 5: Mistake analysis + Long vs Short -->
    <div class="analytics-grid" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><div class="card-title">Mistake Cost Analysis</div><div class="card-subtitle">How much each mistake type costs you</div></div>
        <div class="chart-wrapper"><canvas id="chart-mistakes"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Long vs Short</div></div>
        <div class="chart-wrapper"><canvas id="chart-direction"></canvas></div>
      </div>
    </div>

    <!-- Streaks -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">Streak Analysis</div></div>
      <div id="streak-content"></div>
    </div>
  `;
}

function renderAllCharts(trades) {
  renderEquityCurve(trades);
  renderDistribution(trades);
  renderBySymbol(trades);
  renderBySession(trades);
  renderByDayOfWeek(trades);
  renderByStrategy(trades);
  renderByEmotion(trades);
  renderTiltChart(trades);
  renderMistakes(trades);
  renderDirection(trades);
  renderStreaks(trades);
}

function renderEquityCurve(trades) {
  const sorted = [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  let cum = 0;
  const labels = [], data = [], colors = [];
  sorted.forEach((t, i) => {
    cum += parseFloat(t.pnl) || 0;
    labels.push(t.date);
    data.push(parseFloat(cum.toFixed(2)));
    colors.push(cum >= 0 ? '#00d97e' : '#ff4757');
  });

  const isProfit = cum >= 0;
  const color = isProfit ? '#00d97e' : '#ff4757';

  charts.equity = new Chart(document.getElementById('chart-equity'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data, borderColor: color, borderWidth: 2,
        fill: true,
        backgroundColor: ctx => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
          g.addColorStop(0, isProfit ? 'rgba(0,217,126,0.25)' : 'rgba(255,71,87,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        tension: 0.3,
        pointRadius: data.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
      }]
    },
    options: chartOptions({ yFormat: v => formatCurrency(v, 0) })
  });
}

function renderDistribution(trades) {
  const allPnl = trades.map(t => parseFloat(t.pnl) || 0);
  const min = Math.floor(Math.min(...allPnl));
  const max = Math.ceil(Math.max(...allPnl));
  const bucketCount = Math.min(20, trades.length);
  const bucketSize  = (max - min) / bucketCount || 1;

  _distBuckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: `${Math.round(min + i * bucketSize)}`,
    rangeStart: min + i * bucketSize,
    rangeEnd: min + (i + 1) * bucketSize,
    trades: [],
    color: (min + i * bucketSize) >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)'
  }));

  trades.forEach(t => {
    const pnl = parseFloat(t.pnl) || 0;
    const idx = Math.min(Math.floor((pnl - min) / bucketSize), bucketCount - 1);
    if (idx >= 0 && idx < bucketCount) _distBuckets[idx].trades.push(t);
  });

  const opts = chartOptions({ xLabel: 'P&L ($)', yLabel: 'Trades', legend: false });
  opts.onClick = (e, elements) => {
    if (!elements.length) return;
    showDistDrilldown(elements[0].index);
  };
  opts.onHover = (e, elements) => {
    e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
  };

  charts.distribution = new Chart(document.getElementById('chart-distribution'), {
    type: 'bar',
    data: {
      labels: _distBuckets.map(b => b.label),
      datasets: [{ data: _distBuckets.map(b => b.trades.length), backgroundColor: _distBuckets.map(b => b.color), borderWidth: 0 }]
    },
    options: opts
  });
}

function showDistDrilldown(idx) {
  const panel = document.getElementById('dist-drilldown');
  if (!panel) return;
  const bucket = _distBuckets[idx];
  if (!bucket || !bucket.trades.length) { panel.style.display = 'none'; return; }

  const { rangeStart, rangeEnd, trades } = bucket;
  const rangeLabel = `${formatCurrency(rangeStart)} to ${formatCurrency(rangeEnd)}`;

  panel.style.display = '';
  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Trades in range: ${rangeLabel}</div>
          <div class="card-subtitle">${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('dist-drilldown').style.display='none'">✕ Close</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th>
              <th>P&amp;L</th><th>R:R</th><th>Outcome</th><th>Strategy</th><th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>${trades.map(t => buildDistTradeRow(t)).join('')}</tbody>
        </table>
      </div>
    </div>
  `;

  panel.querySelectorAll('.dist-trade-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('button')) return;
      document.getElementById(`dist-detail-${row.dataset.id}`)?.classList.toggle('hidden');
    };
  });

  panel.querySelectorAll('.dist-edit-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openTradeModal(btn.dataset.id, null, () => loadAnalytics());
    };
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildDistTradeRow(t) {
  const hasDetails = t.notes || t.mistakes || t.screenshots?.length;
  return `
    <tr class="dist-trade-row" data-id="${t.id}" style="cursor:pointer" title="Click to expand">
      <td class="td-mono">${formatDate(t.date)}</td>
      <td><strong>${t.symbol}</strong></td>
      <td>${getDirectionBadge(t.direction)}</td>
      <td class="td-mono">${t.entry_price ?? '—'}</td>
      <td class="td-mono">${t.exit_price ?? '—'}</td>
      <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
      <td class="td-mono">${t.risk_reward ? t.risk_reward + 'R' : '—'}</td>
      <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
      <td class="text-sm text-muted">${t.strategy || '—'}</td>
      <td class="text-sm text-muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes ? t.notes.slice(0,60) + (t.notes.length > 60 ? '…' : '') : '—'}</td>
      <td><button class="btn btn-ghost btn-xs dist-edit-btn" data-id="${t.id}">Edit</button></td>
    </tr>
    ${hasDetails ? `
    <tr id="dist-detail-${t.id}" class="hidden">
      <td colspan="11" style="background:var(--bg-surface);padding:12px 20px">
        ${t.notes ? `<div class="text-sm mb-8" style="line-height:1.6;color:var(--text-secondary)">${nl2br(t.notes)}</div>` : ''}
        ${t.screenshots?.length ? `<div class="screenshots-grid">${t.screenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewPreview(this)" alt="screenshot">`).join('')}</div>` : ''}
      </td>
    </tr>` : ''}
  `;
}

function renderBySymbol(trades) {
  const bySymbol = groupBy(trades, 'symbol');
  const symbols = Object.keys(bySymbol).sort((a, b) => {
    return sum(bySymbol[b], 'pnl') - sum(bySymbol[a], 'pnl');
  }).slice(0, 12);

  const pnls    = symbols.map(s => parseFloat(sum(bySymbol[s], 'pnl').toFixed(2)));
  const winRates = symbols.map(s => {
    const trades = bySymbol[s];
    const wins = trades.filter(t => t.outcome === 'win').length;
    return parseFloat((wins / trades.length * 100).toFixed(1));
  });

  charts.bySymbol = new Chart(document.getElementById('chart-by-symbol'), {
    type: 'bar',
    data: {
      labels: symbols,
      datasets: [
        { label: 'P&L ($)', data: pnls, backgroundColor: pnls.map(v => v >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)'), yAxisID: 'y', borderWidth: 0 },
        { label: 'Win Rate %', data: winRates, type: 'line', borderColor: '#3d7ef0', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#3d7ef0', yAxisID: 'y2', tension: 0.3 }
      ]
    },
    options: {
      ...chartOptions({ legend: true }),
      scales: {
        x: xScale(),
        y: { ...yScale(), position: 'left', title: { display: true, text: 'P&L ($)', color: '#4a6080' } },
        y2: { ...yScale(), position: 'right', grid: { display: false }, min: 0, max: 100, title: { display: true, text: 'Win Rate %', color: '#4a6080' } }
      }
    }
  });
}

function renderBySession(trades) {
  const sessionLabels = { asian: 'Asian', london: 'London', new_york: 'New York', overlap: 'Overlap', pre_market: 'Pre-Market' };
  const bySess = groupBy(trades.filter(t => t.session), 'session');

  const labels = Object.keys(bySess).map(k => sessionLabels[k] || k);
  const pnls   = Object.values(bySess).map(t => parseFloat(sum(t, 'pnl').toFixed(2)));
  const colors = pnls.map(v => v >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)');

  if (!labels.length) {
    document.getElementById('chart-by-session').parentElement.innerHTML = '<div class="empty-state"><p class="text-muted text-sm">No session data — add session when logging trades</p></div>';
    return;
  }

  charts.bySession = new Chart(document.getElementById('chart-by-session'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: pnls.map(Math.abs), backgroundColor: ['#00d97e','#3d7ef0','#ffb347','#a855f7','#06b6d4'], borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#8da2c0', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatCurrency(pnls[ctx.dataIndex])}` } }
      }
    }
  });
}

function renderByDayOfWeek(trades) {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  _dowByDay = {};
  days.forEach(d => _dowByDay[d] = []);

  trades.forEach(t => {
    if (!t.date) return;
    const dow = new Date(t.date + 'T00:00:00').getDay();
    const name = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
    if (_dowByDay[name]) _dowByDay[name].push(t);
  });

  const activeDays = days.filter(d => _dowByDay[d].length);
  const pnls = activeDays.map(d => parseFloat(sum(_dowByDay[d], 'pnl').toFixed(2)));
  const winRates = activeDays.map(d => {
    const ts = _dowByDay[d];
    const wins = ts.filter(t => t.outcome === 'win').length;
    return ts.length ? parseFloat((wins / ts.length * 100).toFixed(1)) : 0;
  });

  const opts = {
    ...chartOptions({ legend: true }),
    scales: {
      x: xScale(),
      y:  { ...yScale(), position: 'left' },
      y2: { ...yScale(), position: 'right', grid: { display: false }, min: 0, max: 100 }
    },
    onClick: (e, elements) => {
      if (!elements.length) return;
      showDowDrilldown(activeDays[elements[0].index]);
    },
    onHover: (e, elements) => {
      e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }
  };

  charts.byDow = new Chart(document.getElementById('chart-by-dow'), {
    type: 'bar',
    data: {
      labels: activeDays,
      datasets: [
        { label: 'Total P&L', data: pnls, backgroundColor: pnls.map(v => v >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)'), yAxisID: 'y', borderWidth: 0 },
        { label: 'Win Rate %', data: winRates, type: 'line', borderColor: '#3d7ef0', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#3d7ef0', yAxisID: 'y2', tension: 0 }
      ]
    },
    options: opts
  });
}

function showDowDrilldown(dayName) {
  const panel = document.getElementById('dow-drilldown');
  if (!panel) return;
  const trades = _dowByDay[dayName];
  if (!trades?.length) { panel.style.display = 'none'; return; }

  const totalPnl = parseFloat(sum(trades, 'pnl').toFixed(2));
  const wins = trades.filter(t => t.outcome === 'win').length;
  const winRate = (wins / trades.length * 100).toFixed(1);

  panel.style.display = '';
  panel.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${dayName} — ${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
          <div class="card-subtitle">
            <span class="${pnlClass(totalPnl)}">${pnlSign(totalPnl)}${formatCurrency(totalPnl)}</span>
            &nbsp;·&nbsp;${winRate}% win rate
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('dow-drilldown').style.display='none'">✕ Close</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th>
              <th>P&amp;L</th><th>R:R</th><th>Outcome</th><th>Strategy</th><th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>${trades.map(t => buildDistTradeRow(t)).join('')}</tbody>
        </table>
      </div>
    </div>
  `;

  panel.querySelectorAll('.dist-trade-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('button')) return;
      document.getElementById(`dist-detail-${row.dataset.id}`)?.classList.toggle('hidden');
    };
  });

  panel.querySelectorAll('.dist-edit-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openTradeModal(btn.dataset.id, null, () => loadAnalytics());
    };
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderByStrategy(trades) {
  const withStrat = trades.filter(t => t.strategy);
  if (!withStrat.length) {
    document.getElementById('chart-by-strategy').parentElement.innerHTML = '<div class="empty-state"><p class="text-muted text-sm">No strategy data — add strategy when logging trades</p></div>';
    return;
  }
  const byStrat = groupBy(withStrat, 'strategy');
  const strats  = Object.keys(byStrat).sort((a, b) => sum(byStrat[b], 'pnl') - sum(byStrat[a], 'pnl')).slice(0, 10);
  const pnls    = strats.map(s => parseFloat(sum(byStrat[s], 'pnl').toFixed(2)));
  const counts  = strats.map(s => byStrat[s].length);
  const winRates = strats.map(s => {
    const ts = byStrat[s];
    const wins = ts.filter(t => t.outcome === 'win').length;
    return parseFloat((wins / ts.length * 100).toFixed(1));
  });

  charts.byStrat = new Chart(document.getElementById('chart-by-strategy'), {
    type: 'bar',
    data: {
      labels: strats,
      datasets: [
        { label: 'P&L ($)', data: pnls, backgroundColor: pnls.map(v => v >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)'), yAxisID: 'y', borderWidth: 0 },
        { label: 'Win Rate %', data: winRates, type: 'line', borderColor: '#ffb347', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#ffb347', yAxisID: 'y2', tension: 0 }
      ]
    },
    options: {
      ...chartOptions({ legend: true }),
      scales: {
        x: xScale(),
        y:  { ...yScale(), position: 'left' },
        y2: { ...yScale(), position: 'right', grid: { display: false }, min: 0, max: 100 }
      }
    }
  });
}

function renderByEmotion(trades) {
  const withEmotion = trades.filter(t => t.emotion);
  if (!withEmotion.length) {
    document.getElementById('chart-by-emotion').parentElement.innerHTML = '<div class="empty-state"><p class="text-muted text-sm">No emotion data logged</p></div>';
    return;
  }
  const byEmotion = groupBy(withEmotion, 'emotion');
  const emotions  = Object.keys(byEmotion);
  const pnls      = emotions.map(e => parseFloat(sum(byEmotion[e], 'pnl').toFixed(2)));
  const emoColors = { calm:'#00d97e', confident:'#3d7ef0', anxious:'#ffb347', fearful:'#ff4757', greedy:'#ff4757', fomo:'#ff4757', revenge:'#ff4757', bored:'#7c8db0', overconfident:'#ffb347', frustrated:'#ff8c42' };

  charts.byEmotion = new Chart(document.getElementById('chart-by-emotion'), {
    type: 'bar',
    data: {
      labels: emotions,
      datasets: [{ label: 'P&L', data: pnls, backgroundColor: emotions.map(e => emoColors[e] || '#7c8db0'), borderWidth: 0 }]
    },
    options: {
      ...chartOptions({ legend: false }),
      indexAxis: 'y',
      scales: { x: { ...yScale() }, y: { ...xScale() } }
    }
  });
}

function renderTiltChart(trades) {
  const withTilt = trades.filter(t => t.tilt_meter);
  if (!withTilt.length) {
    document.getElementById('chart-tilt').parentElement.innerHTML = '<div class="empty-state"><p class="text-muted text-sm">No tilt meter data — use the mental state slider when logging trades</p></div>';
    return;
  }

  // Group by tilt score buckets: 1-3 (poor), 4-6 (ok), 7-10 (good)
  const groups = { 'Poor (1-3)': [], 'OK (4-6)': [], 'Good (7-10)': [] };
  withTilt.forEach(t => {
    const v = parseInt(t.tilt_meter);
    if (v <= 3) groups['Poor (1-3)'].push(t);
    else if (v <= 6) groups['OK (4-6)'].push(t);
    else groups['Good (7-10)'].push(t);
  });

  const labels   = Object.keys(groups).filter(k => groups[k].length);
  const winRates = labels.map(k => {
    const ts = groups[k];
    const wins = ts.filter(t => t.outcome === 'win').length;
    return ts.length ? parseFloat((wins / ts.length * 100).toFixed(1)) : 0;
  });
  const pnls = labels.map(k => parseFloat(sum(groups[k], 'pnl').toFixed(2)));
  const groupColors = { 'Poor (1-3)': 'rgba(255,71,87,0.7)', 'OK (4-6)': 'rgba(255,179,71,0.7)', 'Good (7-10)': 'rgba(0,217,126,0.7)' };

  charts.tilt = new Chart(document.getElementById('chart-tilt'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Win Rate %', data: winRates, backgroundColor: labels.map(k => groupColors[k]), yAxisID: 'y', borderWidth: 0 },
        { label: 'Total P&L', data: pnls, type: 'line', borderColor: '#3d7ef0', yAxisID: 'y2', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#3d7ef0', tension: 0 }
      ]
    },
    options: {
      ...chartOptions({ legend: true }),
      scales: {
        x: xScale(),
        y:  { ...yScale(), max: 100, title: { display: true, text: 'Win Rate %', color: '#4a6080' } },
        y2: { ...yScale(), position: 'right', grid: { display: false }, title: { display: true, text: 'P&L ($)', color: '#4a6080' } }
      }
    }
  });
}

function renderMistakes(trades) {
  const withMistake = trades.filter(t => t.mistake_type && t.mistake_type !== '');
  if (!withMistake.length) {
    document.getElementById('chart-mistakes').parentElement.innerHTML = '<div class="empty-state"><p class="text-muted text-sm">No mistake data logged</p></div>';
    return;
  }
  const mistakeLabels = {
    cut_winners_short: 'Cut Winners Short', held_loser: 'Held Loser', overtraded: 'Overtraded',
    no_setup: 'No Setup', revenge: 'Revenge Trade', fomo_entry: 'FOMO Entry',
    moved_sl: 'Moved Stop Loss', early_exit: 'Early Exit (Fear)', late_entry: 'Late/Chased Entry', oversize: 'Oversized'
  };
  const byMistake = groupBy(withMistake, 'mistake_type');
  const types = Object.keys(byMistake);
  const costs = types.map(m => parseFloat(sum(byMistake[m], 'pnl').toFixed(2)));
  const counts = types.map(m => byMistake[m].length);

  charts.mistakes = new Chart(document.getElementById('chart-mistakes'), {
    type: 'bar',
    data: {
      labels: types.map(t => mistakeLabels[t] || t),
      datasets: [{ label: 'P&L Impact', data: costs, backgroundColor: costs.map(v => v >= 0 ? 'rgba(0,217,126,0.7)' : 'rgba(255,71,87,0.7)'), borderWidth: 0 }]
    },
    options: {
      ...chartOptions({ legend: false }),
      indexAxis: 'y',
      scales: { x: { ...yScale() }, y: { ...xScale() } }
    }
  });
}

function renderDirection(trades) {
  const longs  = trades.filter(t => t.direction === 'long');
  const shorts = trades.filter(t => t.direction === 'short');

  const lWins = longs.filter(t => t.outcome === 'win').length;
  const sWins = shorts.filter(t => t.outcome === 'win').length;

  charts.direction = new Chart(document.getElementById('chart-direction'), {
    type: 'bar',
    data: {
      labels: ['Long', 'Short'],
      datasets: [
        { label: 'Total P&L', data: [
            parseFloat(sum(longs, 'pnl').toFixed(2)),
            parseFloat(sum(shorts, 'pnl').toFixed(2))
          ],
          backgroundColor: ['rgba(0,217,126,0.7)','rgba(255,71,87,0.7)'], yAxisID: 'y', borderWidth: 0 },
        { label: 'Win Rate %', data: [
            longs.length ? parseFloat((lWins/longs.length*100).toFixed(1)) : 0,
            shorts.length ? parseFloat((sWins/shorts.length*100).toFixed(1)) : 0
          ],
          type: 'line', borderColor: '#3d7ef0', yAxisID: 'y2', borderWidth: 2, pointRadius: 6, pointBackgroundColor: '#3d7ef0', tension: 0 }
      ]
    },
    options: {
      ...chartOptions({ legend: true }),
      scales: {
        x: xScale(),
        y:  { ...yScale(), position: 'left' },
        y2: { ...yScale(), position: 'right', grid: { display: false }, min: 0, max: 100 }
      }
    }
  });
}

function renderStreaks(trades) {
  const el = document.getElementById('streak-content');
  if (!el) return;

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date) || (a.created_at || '').localeCompare(b.created_at || ''));
  if (!sorted.length) { el.innerHTML = '<p class="text-muted text-sm">No data</p>'; return; }

  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  let curWinPnl = 0, maxWinPnl = 0;

  sorted.forEach(t => {
    if (t.outcome === 'win')  { curWin++; curLoss = 0; curWinPnl += parseFloat(t.pnl) || 0; maxWin = Math.max(maxWin, curWin); maxWinPnl = Math.max(maxWinPnl, curWinPnl); }
    if (t.outcome === 'loss') { curLoss++; curWin = 0; curWinPnl = 0; maxLoss = Math.max(maxLoss, curLoss); }
  });

  // Current streak
  let streak = 0, streakType = '';
  for (let i = sorted.length - 1; i >= 0; i--) {
    const o = sorted[i].outcome;
    if (streak === 0) { streakType = o; streak = 1; }
    else if (sorted[i].outcome === streakType) streak++;
    else break;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      <div style="text-align:center;padding:16px;background:var(--bg-surface);border-radius:var(--radius-md)">
        <div class="text-xs text-muted mb-8">Current Streak</div>
        <div style="font-size:24px;font-weight:700;font-family:var(--font-mono)" class="${streakType === 'win' ? 'text-profit' : streakType === 'loss' ? 'text-loss' : ''}">${streak}</div>
        <div class="text-xs text-muted">${streakType ? streakType.toUpperCase() + 'S' : '—'}</div>
      </div>
      <div style="text-align:center;padding:16px;background:var(--bg-surface);border-radius:var(--radius-md)">
        <div class="text-xs text-muted mb-8">Best Win Streak</div>
        <div style="font-size:24px;font-weight:700;font-family:var(--font-mono)" class="text-profit">${maxWin}</div>
        <div class="text-xs text-muted">consecutive wins</div>
      </div>
      <div style="text-align:center;padding:16px;background:var(--bg-surface);border-radius:var(--radius-md)">
        <div class="text-xs text-muted mb-8">Worst Loss Streak</div>
        <div style="font-size:24px;font-weight:700;font-family:var(--font-mono)" class="text-loss">${maxLoss}</div>
        <div class="text-xs text-muted">consecutive losses</div>
      </div>
      <div style="text-align:center;padding:16px;background:var(--bg-surface);border-radius:var(--radius-md)">
        <div class="text-xs text-muted mb-8">Best Win Run P&amp;L</div>
        <div style="font-size:24px;font-weight:700;font-family:var(--font-mono)" class="text-profit">${formatCurrency(maxWinPnl)}</div>
        <div class="text-xs text-muted">peak streak value</div>
      </div>
    </div>
  `;
}

// ---- Chart helpers ----
function chartOptions({ yFormat, xLabel, yLabel, legend = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: legend, labels: { color: '#8da2c0', font: { size: 11 } } },
      tooltip: {
        backgroundColor: '#0f1c30', borderColor: '#1e3558', borderWidth: 1,
        callbacks: yFormat ? { label: ctx => ` ${formatCurrency(ctx.raw)}` } : undefined
      }
    },
    scales: { x: xScale(), y: yScale() }
  };
}

function xScale() {
  return {
    grid: { display: false },
    ticks: { color: '#4a6080', font: { size: 11 }, maxRotation: 30 }
  };
}

function yScale() {
  return {
    grid: { color: 'rgba(30,53,88,0.5)' },
    ticks: { color: '#4a6080', font: { size: 11 } }
  };
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
