// =============================================
//  R GAME VIEW
// =============================================
import {
  getRGameEntries,
  saveRGameEntry,
  deleteRGameEntry,
  deleteAllRGameEntries,
  getRGameSettings,
  saveRGameSettings,
} from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, formatDate, formatR, getMonthRange, getWeekRange, todayString } from '../utils.js';

let cachedEntries = [];
let rGameChart = null;

export async function renderRGame(container) {
  document.getElementById('page-title').textContent = 'R Game';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>R Game</h1>
        <div class="page-header-sub">Treat each R result like points on the board</div>
      </div>
      <button class="btn btn-primary" id="r-game-focus-entry">+ Add R</button>
    </div>

    <div id="r-game-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;

  document.getElementById('r-game-focus-entry').onclick = () => {
    document.getElementById('r-game-amount')?.focus();
  };

  await loadRGame();
}

async function loadRGame() {
  const content = document.getElementById('r-game-content');
  if (!content) return;

  try {
    const today = todayString();
    const settings = await ensureSettings(today);
    cachedEntries = await getRGameEntries({ startDate: settings.start_date });
    content.innerHTML = buildRGame(today, settings.start_date, cachedEntries);
    wireRGame(today);
    renderRGameChart(cachedEntries);
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <h3 class="text-loss">R Game needs its database table</h3>
        <p>${escapeHtml(err.message)}</p>
        <p class="text-muted mt-8">Run the new migration in Supabase, then reload this page.</p>
      </div>
    `;
  }
}

async function ensureSettings(today) {
  const settings = await getRGameSettings();
  if (settings?.start_date) return settings;
  return await saveRGameSettings({ start_date: today });
}

function buildRGame(today, startDate, entries) {
  const periods = getPeriods(today, startDate);
  const lifetime = calcSummary(entries);
  const records = getPeriodRecords(entries);

  return `
    <div class="r-game-layout">
      <div class="r-game-main">
        <div class="stats-grid r-game-stats">
          ${buildStatCard('Today', entriesForPeriod(entries, periods.day), 'Current session', records.day)}
          ${buildStatCard('Week', entriesForPeriod(entries, periods.week), `${formatDate(periods.week.start)} - ${formatDate(periods.week.end)}`, records.week)}
          ${buildStatCard('Month', entriesForPeriod(entries, periods.month), formatMonthLabel(today), records.month)}
          ${buildStatCard('Quarter', entriesForPeriod(entries, periods.quarter), formatQuarterLabel(today), records.quarter)}
          ${buildStatCard('Year', entriesForPeriod(entries, periods.year), String(new Date(today + 'T00:00:00').getFullYear()), records.year)}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Running R Total</div>
              <div class="card-subtitle">From ${formatDate(startDate)} onward</div>
            </div>
            <div class="r-game-lifetime ${scoreClass(lifetime.total)}">${formatR(lifetime.total)}</div>
          </div>
          <div class="chart-container">
            <canvas id="r-game-chart"></canvas>
          </div>
        </div>

        <div class="card" style="padding:0">
          <div class="card-header" style="padding:16px 20px;margin-bottom:0;border-bottom:1px solid var(--border)">
            <div>
              <div class="card-title">Score Log</div>
              <div class="card-subtitle">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} since start date</div>
            </div>
          </div>
          ${buildEntriesTable(entries)}
        </div>
      </div>

      <div class="r-game-side">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Add Points</div>
              <div class="card-subtitle">Winner adds R, loser subtracts R</div>
            </div>
          </div>
          <div class="form-group mb-16">
            <label class="form-label">Date</label>
            <input type="date" id="r-game-date" class="form-input" value="${today}">
          </div>
          <div class="form-group mb-16">
            <label class="form-label required">R Amount</label>
            <input type="number" id="r-game-amount" class="form-input" step="0.1" placeholder="2.5 or -1">
          </div>
          <div class="r-game-presets">
            <button class="btn btn-secondary btn-sm" data-r="0.5">+0.5R</button>
            <button class="btn btn-secondary btn-sm" data-r="1">+1R</button>
            <button class="btn btn-secondary btn-sm" data-r="2.5">+2.5R</button>
            <button class="btn btn-danger btn-sm" data-r="-1">-1R</button>
          </div>
          <div class="form-group mt-16">
            <label class="form-label">Note</label>
            <input type="text" id="r-game-note" class="form-input" placeholder="London win, stopped out, partial...">
          </div>
          <button class="btn btn-primary btn-block mt-16" id="r-game-save">Add To Score</button>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Game Settings</div>
              <div class="card-subtitle">Only entries on or after this date count</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" id="r-game-start-date" class="form-input" value="${startDate}">
          </div>
          <button class="btn btn-ghost btn-block mt-16" id="r-game-save-start">Save Start Date</button>
          <button class="btn btn-danger btn-block mt-8" id="r-game-reset">Reset All Scores</button>
        </div>
      </div>
    </div>
  `;
}

function buildStatCard(label, entries, subtitle, record) {
  const summary = calcSummary(entries);
  const cls = scoreClass(summary.total);
  return `
    <div class="stat-card ${summary.total > 0 ? 'profit' : summary.total < 0 ? 'loss' : 'secondary'}">
      <div class="stat-label">${label}</div>
      <div class="stat-value ${cls}">${formatR(summary.total)}</div>
      <div class="r-game-record">Record: ${formatR(record)}</div>
      <div class="stat-sub">${subtitle}</div>
    </div>
  `;
}

function buildEntriesTable(entries) {
  if (!entries.length) {
    return `
      <div class="empty-state" style="padding:40px">
        <h3>No R scores yet</h3>
        <p>Add a winner or loss to start the game.</p>
      </div>
    `;
  }

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Result</th>
            <th>Record</th>
            <th>Note</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(entry => `
            <tr>
              <td class="td-mono">${formatDate(entry.date)}</td>
              <td class="td-mono ${scoreClass(entry.amount)}">${formatR(entry.amount)}</td>
              <td>${resultBadge(entry.amount)}</td>
              <td class="text-sm text-muted">${entry.note ? escapeHtml(entry.note) : '-'}</td>
              <td style="text-align:right">
                <button class="btn btn-danger btn-xs r-game-delete" data-id="${entry.id}">Del</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function wireRGame(today) {
  document.querySelectorAll('.r-game-presets [data-r]').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('r-game-amount').value = btn.dataset.r;
      document.getElementById('r-game-amount').focus();
    };
  });

  document.getElementById('r-game-save').onclick = async () => {
    const date = document.getElementById('r-game-date').value;
    const amount = document.getElementById('r-game-amount').value;
    const note = document.getElementById('r-game-note').value.trim();

    if (!date) { showToast('Date is required', 'error'); return; }
    if (amount === '' || isNaN(parseFloat(amount))) { showToast('R amount is required', 'error'); return; }

    try {
      await saveRGameEntry({ date, amount, note });
      showToast('R score added', 'success');
      await loadRGame();
    } catch (err) {
      showToast('Failed to save R score: ' + err.message, 'error');
    }
  };

  document.getElementById('r-game-save-start').onclick = async () => {
    const newStart = document.getElementById('r-game-start-date').value;
    if (!newStart) { showToast('Start date is required', 'error'); return; }
    try {
      await saveRGameSettings({ start_date: newStart });
      showToast('Start date saved', 'success');
      await loadRGame();
    } catch (err) {
      showToast('Failed to save start date: ' + err.message, 'error');
    }
  };

  document.getElementById('r-game-reset').onclick = async () => {
    if (!confirm('Reset all R Game scores? This cannot be undone.')) return;
    try {
      await deleteAllRGameEntries();
      await saveRGameSettings({ start_date: today });
      showToast('R Game reset', 'success');
      await loadRGame();
    } catch (err) {
      showToast('Failed to reset: ' + err.message, 'error');
    }
  };

  document.querySelectorAll('.r-game-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this R score?')) return;
      try {
        await deleteRGameEntry(btn.dataset.id);
        showToast('R score deleted', 'success');
        await loadRGame();
      } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
      }
    };
  });
}

function getPeriods(today, startDate) {
  const d = new Date(today + 'T00:00:00');
  const week = getWeekRange(today);
  const month = getMonthRange(d.getFullYear(), d.getMonth() + 1);
  const quarterNumber = Math.floor(d.getMonth() / 3);
  const quarterStartMonth = quarterNumber * 3 + 1;
  const quarterEndMonth = quarterStartMonth + 2;
  const quarterStart = `${d.getFullYear()}-${String(quarterStartMonth).padStart(2, '0')}-01`;
  const quarterEnd = getMonthRange(d.getFullYear(), quarterEndMonth).end;

  return {
    day: { start: today, end: today },
    week: clampPeriod(week.start, week.end, startDate),
    month: clampPeriod(month.start, month.end, startDate),
    quarter: clampPeriod(quarterStart, quarterEnd, startDate),
    year: clampPeriod(`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`, startDate),
  };
}

function clampPeriod(start, end, floor) {
  return { start: start < floor ? floor : start, end };
}

function entriesForPeriod(entries, period) {
  return entries.filter(entry => entry.date >= period.start && entry.date <= period.end);
}

function getPeriodRecords(entries) {
  return {
    day: bestGroupedTotal(entries, entry => entry.date),
    week: bestGroupedTotal(entries, entry => getWeekRange(entry.date).start),
    month: bestGroupedTotal(entries, entry => entry.date.slice(0, 7)),
    quarter: bestGroupedTotal(entries, entry => {
      const [year, month] = entry.date.split('-').map(Number);
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    }),
    year: bestGroupedTotal(entries, entry => entry.date.slice(0, 4)),
  };
}

function bestGroupedTotal(entries, getGroupKey) {
  if (!entries.length) return 0;

  const totals = new Map();
  entries.forEach(entry => {
    const key = getGroupKey(entry);
    const amount = parseFloat(entry.amount) || 0;
    totals.set(key, (totals.get(key) || 0) + amount);
  });

  return parseFloat(Math.max(...totals.values()).toFixed(2));
}

function calcSummary(entries) {
  const total = parseFloat(entries.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0).toFixed(2));
  return {
    total,
    wins: entries.filter(entry => parseFloat(entry.amount) > 0).length,
    losses: entries.filter(entry => parseFloat(entry.amount) < 0).length,
    breakevens: entries.filter(entry => parseFloat(entry.amount) === 0).length,
  };
}

function scoreClass(value) {
  const n = parseFloat(value);
  if (isNaN(n) || n === 0) return 'text-muted';
  return n > 0 ? 'text-profit' : 'text-loss';
}

function resultBadge(value) {
  const n = parseFloat(value);
  if (n > 0) return '<span class="badge badge-profit">WIN</span>';
  if (n < 0) return '<span class="badge badge-loss">LOSS</span>';
  return '<span class="badge badge-be">B/E</span>';
}

function formatMonthLabel(today) {
  return new Date(today + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatQuarterLabel(today) {
  const d = new Date(today + 'T00:00:00');
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

function renderRGameChart(entries) {
  const canvas = document.getElementById('r-game-chart');
  if (!canvas) return;
  if (rGameChart) { rGameChart.destroy(); rGameChart = null; }

  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  canvas.style.display = '';
  canvas.parentElement.querySelector('.chart-empty-msg')?.remove();

  if (!sorted.length) {
    canvas.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'chart-empty-msg empty-state';
    msg.innerHTML = '<p class="text-muted text-sm">No R scores to chart yet</p>';
    canvas.parentElement.appendChild(msg);
    return;
  }

  let running = 0;
  const labels = [];
  const data = [];
  sorted.forEach(entry => {
    running += parseFloat(entry.amount) || 0;
    labels.push(entry.date);
    data.push(parseFloat(running.toFixed(2)));
  });

  const color = running >= 0 ? '#00d97e' : '#ff4757';
  rGameChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: running >= 0 ? 'rgba(0,217,126,0.15)' : 'rgba(255,71,87,0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: data.length > 30 ? 0 : 3,
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
          callbacks: { label: ctx => ` Score: ${formatR(ctx.raw)}` }
        }
      },
      scales: {
        x: { display: false, grid: { display: false } },
        y: {
          grid: { color: 'rgba(30,53,88,0.5)' },
          ticks: {
            color: '#4a6080',
            font: { family: 'JetBrains Mono', size: 11 },
            callback: value => `${value}R`
          }
        }
      }
    }
  });
}
