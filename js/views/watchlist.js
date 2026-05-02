// =============================================
//  WATCHLIST VIEW — Trade Ideas to Watch
// =============================================
import { getWatchlistIdeas, saveWatchlistIdea, deleteWatchlistIdea, uploadScreenshot } from '../db.js';
import { todayString, escapeHtml, formatDate, getSignalDisplay } from '../utils.js';
import { showToast } from '../app.js';

// ---- Module state ----
let pendingIdeaScreenshots = [];

const DEFAULT_PAIRS = ['EURUSD', 'GBPUSD'];
const DEFAULT_TYPES = ['Breakout', 'Reversal', 'Continuation', 'Range'];

function getPairs() {
  try {
    const stored = localStorage.getItem('tj_watchlist_pairs');
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_PAIRS];
}

function savePairs(pairs) {
  localStorage.setItem('tj_watchlist_pairs', JSON.stringify(pairs));
}

function getTradeTypes() {
  try {
    const stored = localStorage.getItem('tj_watchlist_types');
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...DEFAULT_TYPES];
}

function saveTradeTypes(types) {
  localStorage.setItem('tj_watchlist_types', JSON.stringify(types));
}

// =============================================
//  MAIN RENDER
// =============================================
export async function renderWatchlist(container) {
  document.getElementById('page-title').textContent = 'Trade Ideas';

  container.innerHTML = buildShell();
  ensureModalsInDom();
  wireShell();
  await loadAll();
}

function buildShell() {
  return `
    <div class="page-header">
      <div>
        <h1>Trade Ideas to Watch</h1>
        <div class="page-header-sub">Track setups you're watching before taking</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="wl-manage-pairs-btn" title="Manage pairs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Pairs
        </button>
        <button class="btn btn-primary" id="wl-add-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Idea
        </button>
      </div>
    </div>

    <div id="wl-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;
}

function wireShell() {
  document.getElementById('wl-add-btn').onclick          = () => openIdeaModal(null);
  document.getElementById('wl-manage-pairs-btn').onclick = openPairModal;
  document.addEventListener('keydown', handleEscKey);
}

function handleEscKey(e) {
  if (e.key === 'Escape') {
    closeIdeaModal();
    closePairModal();
    closeTypeModal();
  }
}

async function loadAll() {
  const el = document.getElementById('wl-content');
  if (!el) return;
  try {
    const ideas = await getWatchlistIdeas();
    el.innerHTML = ideas.length ? buildIdeasTable(ideas) : `
      <div class="empty-state" style="padding:48px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <h3>No trade ideas yet</h3>
        <p>Click "Add Idea" to start tracking setups you're watching</p>
      </div>
    `;
    wireTable(ideas);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

// =============================================
//  TABLE
// =============================================
function buildIdeasTable(ideas) {
  return `
    <div class="card" style="padding:0">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pair</th>
              <th>Direction</th>
              <th>Type</th>
              <th>Confluence</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Screenshots</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${ideas.map(idea => buildIdeaRow(idea)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildIdeaRow(idea) {
  const dirBadge = idea.direction === 'long'
    ? '<span class="badge badge-long">▲ LONG</span>'
    : idea.direction === 'short'
    ? '<span class="badge badge-short">▼ SHORT</span>'
    : '—';

  const statusBadge = {
    watching: '<span class="badge badge-open">WATCHING</span>',
    taken:    '<span class="badge badge-profit">TAKEN</span>',
    passed:   '<span class="badge" style="background:rgba(148,163,184,0.15);color:#94a3b8">PASSED</span>',
  }[idea.status] || '<span class="badge badge-open">WATCHING</span>';

  const screenshots = idea.screenshots || [];
  const screenshotCell = screenshots.length
    ? `<div data-ss-section style="display:flex;align-items:center;gap:8px">
        <div class="screenshots-grid">
          ${screenshots.map(url => `<img src="${url}" class="screenshot-thumb" onclick="window._viewPreview(this)" alt="screenshot">`).join('')}
        </div>
        ${screenshots.length > 1 ? `<button class="btn btn-ghost btn-xs" onclick="window._openGalleryFromSection(this)">View All</button>` : ''}
      </div>`
    : '—';

  const notesText = idea.notes ? idea.notes.slice(0, 60) + (idea.notes.length > 60 ? '...' : '') : '—';

  return `
    <tr>
      <td class="td-mono">${formatDate(idea.date)}</td>
      <td><strong>${escapeHtml(idea.pair || '—')}</strong></td>
      <td>${dirBadge}</td>
      <td class="text-sm">${escapeHtml(idea.trade_type || '—')}</td>
      <td>${getSignalDisplay(idea.signals)}</td>
      <td>${statusBadge}</td>
      <td class="text-sm text-muted" style="max-width:180px">${escapeHtml(notesText)}</td>
      <td>${screenshotCell}</td>
      <td>
        <div class="trade-actions">
          <button class="btn btn-ghost btn-xs wl-edit-btn" data-id="${idea.id}">Edit</button>
          <button class="btn btn-danger btn-xs wl-delete-btn" data-id="${idea.id}">Del</button>
        </div>
      </td>
    </tr>
  `;
}

function wireTable(ideas) {
  document.querySelectorAll('.wl-edit-btn').forEach(btn => {
    btn.onclick = () => {
      const idea = ideas.find(i => i.id === btn.dataset.id);
      if (idea) openIdeaModal(idea);
    };
  });
  document.querySelectorAll('.wl-delete-btn').forEach(btn => {
    btn.onclick = () => confirmDeleteIdea(btn.dataset.id);
  });
}

async function confirmDeleteIdea(id) {
  if (!confirm('Delete this idea? This cannot be undone.')) return;
  try {
    await deleteWatchlistIdea(id);
    showToast('Idea deleted', 'success');
    await loadAll();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

// =============================================
//  MODAL WIRING
// =============================================
function ensureModalsInDom() {
  document.getElementById('wl-modal-backdrop').onclick = closeIdeaModal;
  document.getElementById('wl-modal-close').onclick    = closeIdeaModal;
  document.getElementById('wl-modal-cancel').onclick   = closeIdeaModal;
  document.getElementById('wl-modal-save').onclick     = handleSaveIdea;

  document.getElementById('wl-signal-all')?.addEventListener('click', () => {
    const btns = document.querySelectorAll('.wl-signal-toggle');
    const allActive = Array.from(btns).every(b => b.classList.contains('active'));
    btns.forEach(b => b.classList.toggle('active', !allActive));
    _updateSignalScore();
  });

  document.getElementById('wl-pair-modal-backdrop').onclick = closePairModal;
  document.getElementById('wl-pair-modal-close').onclick    = closePairModal;
  document.getElementById('wl-pair-add-btn').onclick        = addNewPair;
  document.getElementById('wl-new-pair-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') addNewPair();
  });

  document.getElementById('wl-type-modal-backdrop').onclick = closeTypeModal;
  document.getElementById('wl-type-modal-close').onclick    = closeTypeModal;
  document.getElementById('wl-type-add-btn').onclick        = addNewType;
  document.getElementById('wl-new-type-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') addNewType();
  });

  wireScreenshotZone();
}

function _updateSignalScore() {
  const btns  = document.querySelectorAll('.wl-signal-toggle');
  const count = Array.from(btns).filter(b => b.classList.contains('active')).length;
  const allBtn = document.getElementById('wl-signal-all');
  if (allBtn) allBtn.classList.toggle('active', count === btns.length);
  const el = document.getElementById('wl-signal-score');
  if (el) el.textContent = `Score: ${count} / 4`;
}

// =============================================
//  IDEA MODAL
// =============================================
function openIdeaModal(idea = null) {
  pendingIdeaScreenshots = [];

  document.getElementById('wl-idea-id').value  = '';
  document.getElementById('wl-date').value     = todayString();
  document.getElementById('wl-direction').value = '';
  document.getElementById('wl-status').value   = 'watching';
  document.getElementById('wl-notes').value    = '';
  document.getElementById('wl-screenshot-previews').innerHTML = '';
  document.getElementById('wl-upload-prompt').style.display = '';

  const pairSel = document.getElementById('wl-pair');
  pairSel.innerHTML = getPairs().map(p => `<option value="${p}">${p}</option>`).join('');
  pairSel.value = getPairs()[0] || '';

  const typeSel = document.getElementById('wl-trade-type');
  typeSel.innerHTML = `<option value="">Select type...</option>` +
    getTradeTypes().map(t => `<option value="${t}">${t}</option>`).join('');

  document.querySelectorAll('.wl-dir-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.wl-signal-toggle').forEach(b => b.classList.remove('active'));
  _updateSignalScore();

  if (idea) {
    document.getElementById('wl-modal-title').textContent = 'Edit Idea';
    document.getElementById('wl-idea-id').value  = idea.id;
    document.getElementById('wl-date').value     = idea.date || todayString();
    pairSel.value                                = idea.pair || '';
    document.getElementById('wl-direction').value = idea.direction || '';
    document.getElementById('wl-status').value   = idea.status || 'watching';
    document.getElementById('wl-notes').value    = idea.notes || '';

    if (idea.trade_type) {
      const types = getTradeTypes();
      if (!types.includes(idea.trade_type)) {
        typeSel.innerHTML += `<option value="${escapeHtml(idea.trade_type)}">${escapeHtml(idea.trade_type)}</option>`;
      }
      typeSel.value = idea.trade_type;
    }

    if (idea.direction) {
      document.querySelector(`.wl-dir-btn[data-dir="${idea.direction}"]`)?.classList.add('active');
    }

    if (Array.isArray(idea.signals)) {
      document.querySelectorAll('.wl-signal-toggle').forEach(btn => {
        if (idea.signals.includes(btn.dataset.signal)) btn.classList.add('active');
      });
      _updateSignalScore();
    }

    const screenshots = idea.screenshots || [];
    if (screenshots.length) {
      const previews = document.getElementById('wl-screenshot-previews');
      screenshots.forEach(url => {
        pendingIdeaScreenshots.push({ url, localUrl: url, uploaded: true });
        const idx = pendingIdeaScreenshots.length - 1;
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.dataset.idx = idx;
        item.innerHTML = `
          <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
          <button class="preview-remove" onclick="window._wlRemovePreview(${idx})">×</button>
        `;
        previews.appendChild(item);
      });
      document.getElementById('wl-upload-prompt').style.display = 'none';
    }
  } else {
    document.getElementById('wl-modal-title').textContent = 'Add Idea';
  }

  document.getElementById('wl-modal').classList.remove('hidden');
  document.querySelector('#wl-modal .modal-body')?.scrollTo(0, 0);

  document.querySelectorAll('.wl-dir-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.wl-dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('wl-direction').value = btn.dataset.dir;
    };
  });

  document.querySelectorAll('.wl-signal-toggle').forEach(btn => {
    btn.onclick = () => { btn.classList.toggle('active'); _updateSignalScore(); };
  });

  document.getElementById('wl-manage-types-link')?.onclick = (e) => {
    e.preventDefault();
    openTypeModal();
  };
}

function closeIdeaModal() {
  document.getElementById('wl-modal')?.classList.add('hidden');
  pendingIdeaScreenshots = [];
}

async function handleSaveIdea() {
  const saveBtn = document.getElementById('wl-modal-save');
  const pair    = document.getElementById('wl-pair').value;
  const date    = document.getElementById('wl-date').value;

  if (!pair) { showToast('Select a pair', 'error'); return; }
  if (!date) { showToast('Date is required', 'error'); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const screenshotUrls = [];
    for (const item of pendingIdeaScreenshots) {
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

    const ideaData = {
      id:         document.getElementById('wl-idea-id').value || undefined,
      date,
      pair,
      direction:  document.getElementById('wl-direction').value || null,
      trade_type: document.getElementById('wl-trade-type').value || null,
      status:     document.getElementById('wl-status').value || 'watching',
      notes:      document.getElementById('wl-notes').value.trim() || null,
      screenshots: screenshotUrls,
      signals:    Array.from(document.querySelectorAll('.wl-signal-toggle.active')).map(b => b.dataset.signal),
    };

    if (!ideaData.id) delete ideaData.id;

    await saveWatchlistIdea(ideaData);
    showToast('Idea saved', 'success');
    closeIdeaModal();
    await loadAll();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Idea';
  }
}

// =============================================
//  PAIR MANAGEMENT MODAL
// =============================================
function openPairModal() {
  renderPairList();
  document.getElementById('wl-pair-modal').classList.remove('hidden');
  document.getElementById('wl-new-pair-input').value = '';
}

function closePairModal() {
  document.getElementById('wl-pair-modal').classList.add('hidden');
}

function renderPairList() {
  const pairs  = getPairs();
  const listEl = document.getElementById('wl-pair-list');
  if (!listEl) return;

  listEl.innerHTML = pairs.map((p, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-surface);border-radius:var(--radius);border:1px solid var(--border)">
      <span class="text-sm font-medium">${escapeHtml(p)}</span>
      <button class="btn btn-danger btn-xs" onclick="window._wlRemovePair(${i})">Remove</button>
    </div>
  `).join('') || '<p class="text-sm text-muted">No pairs added yet.</p>';

  window._wlRemovePair = (idx) => {
    const pairs = getPairs();
    pairs.splice(idx, 1);
    savePairs(pairs);
    renderPairList();
    showToast('Pair removed', 'success');
  };
}

function addNewPair() {
  const input = document.getElementById('wl-new-pair-input');
  const val   = input.value.trim().toUpperCase();
  if (!val) return;

  const pairs = getPairs();
  if (pairs.includes(val)) { showToast('Pair already in list', 'warning'); return; }

  pairs.push(val);
  savePairs(pairs);
  renderPairList();
  input.value = '';
  showToast(`${val} added`, 'success');
}

// =============================================
//  TRADE TYPE MANAGEMENT MODAL
// =============================================
function openTypeModal() {
  renderTypeList();
  document.getElementById('wl-type-modal').classList.remove('hidden');
  document.getElementById('wl-new-type-input').value = '';
}

function closeTypeModal() {
  document.getElementById('wl-type-modal').classList.add('hidden');
}

function renderTypeList() {
  const types  = getTradeTypes();
  const listEl = document.getElementById('wl-type-list');
  if (!listEl) return;

  listEl.innerHTML = types.map((t, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-surface);border-radius:var(--radius);border:1px solid var(--border)">
      <span class="text-sm font-medium">${escapeHtml(t)}</span>
      <button class="btn btn-danger btn-xs" onclick="window._wlRemoveType(${i})">Remove</button>
    </div>
  `).join('') || '<p class="text-sm text-muted">No types added yet.</p>';

  window._wlRemoveType = (idx) => {
    const types = getTradeTypes();
    types.splice(idx, 1);
    saveTradeTypes(types);
    renderTypeList();
    const typeSel = document.getElementById('wl-trade-type');
    if (typeSel) {
      const current = typeSel.value;
      typeSel.innerHTML = `<option value="">Select type...</option>` +
        getTradeTypes().map(t => `<option value="${t}">${t}</option>`).join('');
      typeSel.value = current;
    }
    showToast('Type removed', 'success');
  };
}

function addNewType() {
  const input  = document.getElementById('wl-new-type-input');
  const raw    = input.value.trim();
  if (!raw) return;

  const valNorm = raw.charAt(0).toUpperCase() + raw.slice(1);
  const types   = getTradeTypes();
  if (types.some(t => t.toLowerCase() === raw.toLowerCase())) {
    showToast('Type already in list', 'warning');
    return;
  }

  types.push(valNorm);
  saveTradeTypes(types);
  renderTypeList();

  const typeSel = document.getElementById('wl-trade-type');
  if (typeSel) {
    const current = typeSel.value;
    typeSel.innerHTML = `<option value="">Select type...</option>` +
      getTradeTypes().map(t => `<option value="${t}">${t}</option>`).join('');
    typeSel.value = current || valNorm;
  }

  input.value = '';
  showToast(`${valNorm} added`, 'success');
}

// =============================================
//  SCREENSHOT ZONE
// =============================================
function wireScreenshotZone() {
  const zone   = document.getElementById('wl-screenshot-zone');
  let input    = document.getElementById('wl-screenshot-input');
  const prompt = document.getElementById('wl-upload-prompt');

  if (!zone || !input) return;

  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  input = fresh;

  prompt?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => addIdeaFiles(Array.from(input.files)));

  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addIdeaFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  });

  window._wlRemovePreview = (idx) => {
    pendingIdeaScreenshots[idx] = null;
    const item = document.querySelector(`#wl-screenshot-previews .preview-item[data-idx="${idx}"]`);
    if (item) item.remove();
  };
}

function addIdeaFiles(files) {
  const previews = document.getElementById('wl-screenshot-previews');
  const prompt   = document.getElementById('wl-upload-prompt');
  if (!previews) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      pendingIdeaScreenshots.push({ file, localUrl: url, uploaded: false });
      const idx = pendingIdeaScreenshots.length - 1;

      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.idx = idx;
      item.innerHTML = `
        <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
        <button class="preview-remove" onclick="window._wlRemovePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
      if (prompt) prompt.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}
