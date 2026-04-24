// =============================================
//  STRATEGY TRACKER VIEW
// =============================================
import { getStrategySetups, saveStrategySetup, deleteStrategySetup, uploadScreenshot } from '../db.js';
import { todayString, getWeekRange, addDays, formatDate, formatDateShort,
         escapeHtml, nl2br } from '../utils.js';
import { showToast } from '../app.js';

// ---- Module state ----
let currentWeekStart        = null;
let pendingSetupScreenshots = [];  // { file, localUrl, uploaded, url? }

const DEFAULT_PAIRS = ['EURUSD', 'GBPUSD'];

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
        <button class="btn btn-ghost btn-sm" id="st-manage-pairs-btn" title="Manage pairs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Pairs
        </button>
        <button class="btn btn-primary" id="st-add-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Setup
        </button>
      </div>
    </div>

    <!-- All-time stats -->
    <div id="st-alltime-stats" class="stats-grid" style="margin-bottom:20px">
      <div class="loading-screen" style="padding:20px"><div class="loading-spinner"></div></div>
    </div>

    <!-- Weekly R chart -->
    <div id="st-chart-section" class="card" style="margin-bottom:20px;padding:20px">
      <div class="loading-screen" style="padding:20px"><div class="loading-spinner"></div></div>
    </div>

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
  document.getElementById('st-add-btn').onclick       = () => openSetupModal(null);
  document.getElementById('st-manage-pairs-btn').onclick = openPairModal;

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
  await Promise.all([loadAllTimeAndChart(), loadWeek()]);
}

async function loadAllTimeAndChart() {
  const statsEl = document.getElementById('st-alltime-stats');
  const chartEl = document.getElementById('st-chart-section');
  try {
    const allSetups = await getStrategySetups();
    const stats = calcSetupStats(allSetups);
    if (statsEl) statsEl.innerHTML = buildAllTimeStats(stats);
    renderChartSection(allSetups);
  } catch (err) {
    if (statsEl) statsEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
    if (chartEl) chartEl.innerHTML = `<p class="text-loss text-sm" style="padding:20px">${err.message}</p>`;
  }
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
    ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${screenshots.slice(0,3).map(url =>
        `<img src="${url}" style="width:40px;height:30px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="window._viewImage('${url}',${JSON.stringify(screenshots)})" alt="screenshot">`
      ).join('')}${screenshots.length > 3 ? `<span class="text-xs text-muted" style="align-self:center">+${screenshots.length - 3}</span>` : ''}</div>`
    : '—';

  const notesText = s.notes ? s.notes.slice(0, 60) + (s.notes.length > 60 ? '...' : '') : '—';

  return `
    <tr>
      <td class="td-mono">${formatDate(s.date)}</td>
      <td><strong>${escapeHtml(s.pair)}</strong></td>
      <td>${dirBadge}</td>
      <td class="td-mono">${s.possible_r != null ? s.possible_r + 'R' : '—'}</td>
      <td>${outcomeBadge}</td>
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

    // Load existing screenshots
    const screenshots = setup.screenshots || [];
    if (screenshots.length) {
      const previews = document.getElementById('st-screenshot-previews');
      document.getElementById('st-upload-prompt').style.display = 'none';
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
    }
  } else {
    document.getElementById('st-modal-title').textContent = 'Add Setup';
  }

  // Show modal
  document.getElementById('st-modal').classList.remove('hidden');

  // Re-wire direction buttons
  document.querySelectorAll('.st-dir-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.st-dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('st-direction').value = btn.dataset.dir;
    };
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
  const zone   = document.getElementById('st-screenshot-zone');
  const input  = document.getElementById('st-screenshot-input');
  const prompt = document.getElementById('st-upload-prompt');

  if (!zone || !input) return;

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
    if (pendingSetupScreenshots.every(s => !s)) {
      document.getElementById('st-upload-prompt').style.display = '';
    }
  };
}

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
        <img src="${url}" alt="screenshot" onclick="window._viewImage('${url}')">
        <button class="preview-remove" onclick="window._stRemovePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
      if (prompt) prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}
