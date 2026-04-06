// =============================================
//  PLAYBOOK VIEW — Strategy documentation
// =============================================
import { getPlaybookEntries, savePlaybookEntry, deletePlaybookEntry } from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, nl2br } from '../utils.js';

let editingId = null;

export async function renderPlaybook(container) {
  document.getElementById('page-title').textContent = 'Playbook';
  container.innerHTML = `
    <div class="page-header">
      <div><h1>Playbook</h1><div class="page-header-sub">Document your strategies and setups</div></div>
      <button class="btn btn-primary" id="new-play-btn">+ New Setup</button>
    </div>
    <div id="playbook-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>

    <!-- Playbook Entry Modal -->
    <div id="play-modal" class="modal hidden">
      <div class="modal-backdrop" id="play-modal-backdrop"></div>
      <div class="modal-dialog modal-lg">
        <div class="modal-header">
          <h2 id="play-modal-title">New Setup</h2>
          <button class="modal-close" id="close-play-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="play-id">
          <div class="form-grid-2" style="margin-bottom:16px">
            <div class="form-group">
              <label class="form-label required">Setup Name</label>
              <input type="text" id="play-name" class="form-input" placeholder="e.g. London Breakout, Bull Flag Pullback...">
            </div>
            <div class="form-group">
              <label class="form-label">Market / Asset Class</label>
              <input type="text" id="play-market" class="form-input" placeholder="Forex, Crypto, Both...">
            </div>
            <div class="form-group">
              <label class="form-label">Timeframe</label>
              <select id="play-timeframe" class="form-input">
                <option value="">Any</option>
                <option value="M1">M1</option><option value="M5">M5</option><option value="M15">M15</option>
                <option value="M30">M30</option><option value="H1">H1</option><option value="H4">H4</option>
                <option value="D1">D1</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Best Session</label>
              <select id="play-session" class="form-input">
                <option value="">Any</option>
                <option value="asian">Asian</option><option value="london">London</option>
                <option value="new_york">New York</option><option value="overlap">London/NY Overlap</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Description / Overview</label>
            <textarea id="play-desc" class="form-textarea" rows="2" placeholder="Brief description of this setup..."></textarea>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Entry Criteria (Checklist)</label>
            <textarea id="play-entry" class="form-textarea" rows="4" placeholder="List your exact entry conditions, one per line:&#10;1. Price above 200 EMA&#10;2. RSI > 50&#10;3. Breakout of key level with volume..."></textarea>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Stop Loss Rules</label>
            <textarea id="play-sl" class="form-textarea" rows="2" placeholder="Where do you place your stop? What invalidates the setup?"></textarea>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Take Profit / Exit Rules</label>
            <textarea id="play-tp" class="form-textarea" rows="2" placeholder="Where do you take profit? Do you scale out? Trail stops?"></textarea>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">Risk Management</label>
            <textarea id="play-risk" class="form-textarea" rows="2" placeholder="Position sizing rules, max risk per trade, R:R targets..."></textarea>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">What to Avoid / Common Mistakes</label>
            <textarea id="play-avoid" class="form-textarea" rows="2" placeholder="Warning signs, conditions where this setup fails, common traps..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Notes &amp; Examples</label>
            <textarea id="play-notes" class="form-textarea" rows="2" placeholder="Any additional notes, example trades, links to chart images..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancel-play-modal">Cancel</button>
          <button class="btn btn-primary" id="save-play-btn">Save Setup</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('new-play-btn').onclick   = () => openPlayModal(null);
  document.getElementById('close-play-modal').onclick  = closePlayModal;
  document.getElementById('cancel-play-modal').onclick = closePlayModal;
  document.getElementById('play-modal-backdrop').onclick = closePlayModal;
  document.getElementById('save-play-btn').onclick   = savePlay;

  await loadPlaybook();
}

async function loadPlaybook() {
  const content = document.getElementById('playbook-content');
  if (!content) return;
  try {
    const entries = await getPlaybookEntries();
    if (!entries.length) {
      content.innerHTML = `
        <div class="empty-state" style="padding:60px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <h3>No setups documented yet</h3>
          <p>Document your trading strategies to build a personalised playbook</p>
          <button class="btn btn-primary mt-16" onclick="document.getElementById('new-play-btn').click()">Create First Setup</button>
        </div>
      `;
      return;
    }

    content.innerHTML = `<div class="playbook-grid">${entries.map(buildPlayCard).join('')}</div>`;

    content.querySelectorAll('.play-edit-btn').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); openPlayModal(btn.dataset.id); };
    });
    content.querySelectorAll('.play-delete-btn').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); confirmDeletePlay(btn.dataset.id); };
    });
    content.querySelectorAll('.playbook-card').forEach(card => {
      card.onclick = () => togglePlayDetails(card.dataset.id);
    });
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildPlayCard(entry) {
  const sessionLabels = { asian: 'Asian', london: 'London', new_york: 'New York', overlap: 'Overlap' };
  return `
    <div class="playbook-card" data-id="${entry.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div class="playbook-card-title">${escapeHtml(entry.name)}</div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-xs play-edit-btn" data-id="${entry.id}">Edit</button>
          <button class="btn btn-danger btn-xs play-delete-btn" data-id="${entry.id}">Del</button>
        </div>
      </div>
      ${entry.description ? `<div class="playbook-card-desc">${escapeHtml(entry.description).slice(0, 120)}${entry.description.length > 120 ? '...' : ''}</div>` : ''}
      <div class="playbook-stats">
        ${entry.timeframe  ? `<span>${entry.timeframe}</span>` : ''}
        ${entry.session    ? `<span>${sessionLabels[entry.session] || entry.session}</span>` : ''}
        ${entry.market     ? `<span>${escapeHtml(entry.market)}</span>` : ''}
      </div>
      <div id="play-detail-${entry.id}" class="hidden" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        ${buildPlayDetail(entry)}
      </div>
    </div>
  `;
}

function buildPlayDetail(entry) {
  const sections = [
    { label: 'Entry Criteria', val: entry.entry_criteria },
    { label: 'Stop Loss Rules', val: entry.stop_loss_rules },
    { label: 'Take Profit / Exit', val: entry.take_profit_rules },
    { label: 'Risk Management', val: entry.risk_management },
    { label: 'What to Avoid', val: entry.what_to_avoid },
    { label: 'Notes', val: entry.notes },
  ].filter(s => s.val);

  if (!sections.length) return '<p class="text-muted text-sm">No details added yet.</p>';

  return sections.map(s => `
    <div style="margin-bottom:12px">
      <div class="text-xs text-muted mb-8" style="text-transform:uppercase;letter-spacing:0.8px">${s.label}</div>
      <div class="text-sm" style="line-height:1.7;color:var(--text-secondary)">${nl2br(s.val)}</div>
    </div>
  `).join('');
}

function togglePlayDetails(id) {
  const el = document.getElementById(`play-detail-${id}`);
  if (el) el.classList.toggle('hidden');
}

async function openPlayModal(id) {
  editingId = id;
  const modal = document.getElementById('play-modal');
  document.getElementById('play-modal-title').textContent = id ? 'Edit Setup' : 'New Setup';

  // Clear
  ['play-id','play-name','play-market','play-timeframe','play-session','play-desc',
   'play-entry','play-sl','play-tp','play-risk','play-avoid','play-notes'].forEach(field => {
    const el = document.getElementById(field);
    if (el) el.value = '';
  });

  if (id) {
    try {
      const entries = await getPlaybookEntries();
      const entry   = entries.find(e => e.id === id);
      if (entry) {
        document.getElementById('play-id').value = entry.id;
        document.getElementById('play-name').value    = entry.name || '';
        document.getElementById('play-market').value  = entry.market || '';
        document.getElementById('play-timeframe').value = entry.timeframe || '';
        document.getElementById('play-session').value = entry.session || '';
        document.getElementById('play-desc').value    = entry.description || '';
        document.getElementById('play-entry').value   = entry.entry_criteria || '';
        document.getElementById('play-sl').value      = entry.stop_loss_rules || '';
        document.getElementById('play-tp').value      = entry.take_profit_rules || '';
        document.getElementById('play-risk').value    = entry.risk_management || '';
        document.getElementById('play-avoid').value   = entry.what_to_avoid || '';
        document.getElementById('play-notes').value   = entry.notes || '';
      }
    } catch {}
  }

  modal.classList.remove('hidden');
}

function closePlayModal() {
  document.getElementById('play-modal').classList.add('hidden');
  editingId = null;
}

async function savePlay() {
  const name = document.getElementById('play-name').value.trim();
  if (!name) { showToast('Setup name is required', 'error'); return; }

  const data = {
    id: document.getElementById('play-id').value || undefined,
    name,
    market:            document.getElementById('play-market').value.trim(),
    timeframe:         document.getElementById('play-timeframe').value,
    session:           document.getElementById('play-session').value,
    description:       document.getElementById('play-desc').value.trim(),
    entry_criteria:    document.getElementById('play-entry').value.trim(),
    stop_loss_rules:   document.getElementById('play-sl').value.trim(),
    take_profit_rules: document.getElementById('play-tp').value.trim(),
    risk_management:   document.getElementById('play-risk').value.trim(),
    what_to_avoid:     document.getElementById('play-avoid').value.trim(),
    notes:             document.getElementById('play-notes').value.trim(),
  };
  if (!data.id) delete data.id;

  try {
    await savePlaybookEntry(data);
    showToast('Setup saved', 'success');
    closePlayModal();
    await loadPlaybook();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

async function confirmDeletePlay(id) {
  if (!confirm('Delete this setup? This cannot be undone.')) return;
  try {
    await deletePlaybookEntry(id);
    showToast('Setup deleted', 'success');
    await loadPlaybook();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}
