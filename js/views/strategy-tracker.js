// =============================================
//  STRATEGY TRACKER VIEW
// =============================================
import { getStrategySetups, saveStrategySetup, deleteStrategySetup, uploadScreenshot } from '../db.js';
import { todayString, getWeekRange, addDays, formatDate, formatDateShort,
         escapeHtml, nl2br } from '../utils.js';
import { showToast } from '../app.js';

// ---- Module state ----
let currentWeekStart    = null;
let pendingSetupScreenshots = [];  // { file, localUrl, uploaded, url? }
let editingSetupId      = null;

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

    <!-- Setup modal (hidden) -->
    ${buildSetupModal()}

    <!-- Pair management modal (hidden) -->
    ${buildPairModal()}
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

  // Modal wiring
  document.getElementById('st-modal-backdrop').onclick  = closeSetupModal;
  document.getElementById('st-modal-close').onclick     = closeSetupModal;
  document.getElementById('st-modal-cancel').onclick    = closeSetupModal;
  document.getElementById('st-modal-save').onclick      = handleSaveSetup;

  // Pair modal wiring
  document.getElementById('st-pair-modal-backdrop').onclick = closePairModal;
  document.getElementById('st-pair-modal-close').onclick    = closePairModal;
  document.getElementById('st-pair-add-btn').onclick        = addNewPair;

  // Screenshot zone
  wireScreenshotZone();

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
  await Promise.all([loadAllTimeStats(), loadWeek()]);
}

// =============================================
//  ALL-TIME STATS
// =============================================
async function loadAllTimeStats() {
  const el = document.getElementById('st-alltime-stats');
  if (!el) return;

  try {
    const setups = await getStrategySetups();
    const stats  = calcSetupStats(setups);
    el.innerHTML = buildAllTimeStats(stats, setups);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function calcSetupStats(setups) {
  const closed  = setups.filter(s => s.outcome && s.outcome !== 'pending');
  const wins    = closed.filter(s => s.outcome === 'win');
  const losses  = closed.filter(s => s.outcome === 'loss');
  const bes     = closed.filter(s => s.outcome === 'breakeven');
  const pending = setups.filter(s => !s.outcome || s.outcome === 'pending');

  const winRate  = closed.length ? (wins.length / closed.length * 100) : 0;
  const lossRate = closed.length ? (losses.length / closed.length * 100) : 0;

  const avgWinR  = wins.length
    ? wins.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) / wins.length
    : 0;
  const avgLossR = losses.length
    ? losses.reduce((s, x) => s + (parseFloat(x.possible_r) || 0), 0) / losses.length
    : 0;

  // R Expectancy = (winRate * avgWinR) - (lossRate * 1.0)
  // Using 1.0 as the risk per trade (1R loss)
  const rExpectancy = closed.length
    ? ((wins.length / closed.length) * avgWinR) - ((losses.length / closed.length) * 1.0)
    : 0;

  // Current streak
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
    lossRate,
    avgWinR,
    avgLossR,
    rExpectancy,
    streak,
    streakType,
  };
}

function buildAllTimeStats(stats, setups) {
  const rExpColor = stats.rExpectancy >= 0 ? 'text-profit' : 'text-loss';
  const rExpSign  = stats.rExpectancy >= 0 ? '+' : '';

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
    <div class="stat-card ${stats.winRate >= 50 ? 'profit' : ''}">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value neutral">${stats.closed ? stats.winRate.toFixed(1) + '%' : '—'}</div>
      <div class="stat-sub">${stats.wins}W / ${stats.losses}L / ${stats.bes}BE</div>
    </div>
    <div class="stat-card secondary">
      <div class="stat-label">R Expectancy</div>
      <div class="stat-value ${rExpColor}">${stats.closed ? rExpSign + stats.rExpectancy.toFixed(2) + 'R' : '—'}</div>
      <div class="stat-sub">Per trade expected return</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Win R</div>
      <div class="stat-value text-profit">${stats.wins ? stats.avgWinR.toFixed(2) + 'R' : '—'}</div>
      <div class="stat-sub">Avg Loss R: ${stats.losses ? stats.avgLossR.toFixed(2) + 'R' : '—'}</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">Current Streak</div>
      <div class="stat-value neutral">${streakLabel}</div>
      <div class="stat-sub">Most recent run</div>
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
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildWeekContent(setups) {
  const stats = calcSetupStats(setups);

  const rExpColor = stats.rExpectancy >= 0 ? 'text-profit' : 'text-loss';
  const rExpSign  = stats.rExpectancy >= 0 ? '+' : '';

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
        <div class="stat-label">R Expectancy</div>
        <div class="stat-value ${rExpColor}">${stats.closed ? rExpSign + stats.rExpectancy.toFixed(2) + 'R' : '—'}</div>
        <div class="stat-sub">Avg Win R: ${stats.wins ? stats.avgWinR.toFixed(2) + 'R' : '—'}</div>
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
        `<img src="${url}" style="width:40px;height:30px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="window._viewImage('${url}')" alt="screenshot">`
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
//  SETUP MODAL
// =============================================
function buildSetupModal() {
  return `
    <div id="st-modal-backdrop" class="modal-backdrop hidden" style="position:fixed;inset:0;z-index:999;background:rgba(0,0,0,0.6)"></div>
    <div id="st-modal" class="modal hidden" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;width:min(540px,95vw);max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h3 id="st-modal-title">Add Setup</h3>
        <button class="modal-close" id="st-modal-close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px">

        <input type="hidden" id="st-setup-id">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="st-date" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Pair</label>
            <select id="st-pair" class="form-input">
              ${getPairs().map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Direction</label>
            <div style="display:flex;gap:8px;margin-top:4px">
              <button type="button" class="st-dir-btn btn btn-ghost btn-sm" data-dir="long" style="flex:1">▲ Long</button>
              <button type="button" class="st-dir-btn btn btn-ghost btn-sm" data-dir="short" style="flex:1">▼ Short</button>
            </div>
            <input type="hidden" id="st-direction" value="">
          </div>
          <div class="form-group">
            <label class="form-label">Possible R</label>
            <input type="number" id="st-possible-r" class="form-input" step="0.1" min="0" placeholder="2.5">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Outcome</label>
          <select id="st-outcome" class="form-input">
            <option value="pending">Pending</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="st-notes" class="form-input" rows="3" placeholder="Setup notes, entry criteria, observations..."></textarea>
        </div>

        <!-- Screenshots -->
        <div class="form-group">
          <label class="form-label">Screenshots</label>
          <div id="st-screenshot-zone" class="screenshot-zone">
            <div id="st-upload-prompt" class="upload-prompt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Click or drag to add screenshots</span>
            </div>
            <div id="st-screenshot-previews" class="screenshot-previews"></div>
          </div>
          <input type="file" id="st-screenshot-input" accept="image/*" multiple style="display:none">
        </div>

      </div>
      <div class="modal-footer" style="padding:16px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" id="st-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="st-modal-save">Save Setup</button>
      </div>
    </div>
  `;
}

function openSetupModal(setup = null) {
  editingSetupId = null;
  pendingSetupScreenshots = [];

  // Reset form
  document.getElementById('st-setup-id').value   = '';
  document.getElementById('st-date').value        = todayString();
  document.getElementById('st-direction').value   = '';
  document.getElementById('st-possible-r').value  = '';
  document.getElementById('st-outcome').value     = 'pending';
  document.getElementById('st-notes').value       = '';
  document.getElementById('st-screenshot-previews').innerHTML = '';
  document.getElementById('st-upload-prompt').style.display = '';

  // Reset pair dropdown to current pairs
  const pairSel = document.getElementById('st-pair');
  pairSel.innerHTML = getPairs().map(p => `<option value="${p}">${p}</option>`).join('');

  // Reset direction buttons
  document.querySelectorAll('.st-dir-btn').forEach(b => b.classList.remove('active'));

  if (setup) {
    editingSetupId = setup.id;
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
          <img src="${url}" alt="screenshot" onclick="window._viewImage('${url}')">
          <button class="preview-remove" onclick="window._stRemovePreview(${idx})">×</button>
        `;
        previews.appendChild(item);
      });
    }
  } else {
    document.getElementById('st-modal-title').textContent = 'Add Setup';
  }

  // Show modal + backdrop
  document.getElementById('st-modal-backdrop').classList.remove('hidden');
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
  document.getElementById('st-modal-backdrop')?.classList.add('hidden');
  document.getElementById('st-modal')?.classList.add('hidden');
  pendingSetupScreenshots = [];
  editingSetupId = null;
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
      outcome:     document.getElementById('st-outcome').value || 'pending',
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
function buildPairModal() {
  return `
    <div id="st-pair-modal-backdrop" class="modal-backdrop hidden" style="position:fixed;inset:0;z-index:999"></div>
    <div id="st-pair-modal" class="modal hidden" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;width:min(400px,95vw)">
      <div class="modal-header">
        <h3>Manage Pairs</h3>
        <button class="modal-close" id="st-pair-modal-close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div id="st-pair-list" style="display:flex;flex-direction:column;gap:8px"></div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <input type="text" id="st-new-pair-input" class="form-input" placeholder="e.g. USDJPY" style="text-transform:uppercase;flex:1">
          <button class="btn btn-primary btn-sm" id="st-pair-add-btn">Add</button>
        </div>
        <p class="text-xs text-muted">Pairs are stored locally in your browser.</p>
      </div>
    </div>
  `;
}

function openPairModal() {
  renderPairList();
  document.getElementById('st-pair-modal-backdrop').classList.remove('hidden');
  document.getElementById('st-pair-modal').classList.remove('hidden');
  document.getElementById('st-new-pair-input').value = '';
}

function closePairModal() {
  document.getElementById('st-pair-modal-backdrop').classList.add('hidden');
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
