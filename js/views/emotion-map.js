// =============================================
//  EMOTION MAP VIEW
// =============================================
import {
  getEmotionActionTypes,
  saveEmotionActionType,
  deleteEmotionActionType,
  getEmotionMapEntries,
  saveEmotionMapEntry,
  deleteEmotionMapEntry,
} from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, formatDate, nl2br, todayString } from '../utils.js';

let actionTypes = [];
let entries = [];
let selectedActionId = null;

const MAP_FIELDS = [
  { key: 'trigger_signal', label: 'Trigger', placeholder: 'What set this off?' },
  { key: 'thoughts', label: 'Thoughts', placeholder: 'What did your mind say?' },
  { key: 'emotions', label: 'Emotions', placeholder: 'What emotion was present?' },
  { key: 'behaviors', label: 'Behaviors', placeholder: 'How did you behave physically or mentally?' },
  { key: 'actions', label: 'Actions', placeholder: 'What did you actually do?' },
  { key: 'decision_change', label: 'Change in decision-making', placeholder: 'How did the decision process shift?' },
  { key: 'perception_change', label: 'Change in market perception', placeholder: 'How did you read the market differently?' },
  { key: 'mistake', label: 'Trading mistake', placeholder: 'What was the execution error?' },
];

export async function renderEmotionMap(container) {
  document.getElementById('page-title').textContent = 'Emotion Map';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Emotion Map</h1>
        <div class="page-header-sub">Build a map of actions that negatively impact your trading</div>
      </div>
      <div class="emotion-header-actions">
        <button class="btn btn-ghost" id="emotion-export">Export For LLM</button>
        <button class="btn btn-primary" id="emotion-focus-entry">+ Record Action</button>
      </div>
    </div>

    <div id="emotion-map-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;

  document.getElementById('emotion-focus-entry').onclick = () => {
    document.getElementById('emotion-trigger_signal')?.focus();
  };
  document.getElementById('emotion-export').onclick = handleExportEmotionMap;

  await loadEmotionMap();
}

async function loadEmotionMap() {
  const content = document.getElementById('emotion-map-content');
  if (!content) return;

  try {
    [actionTypes, entries] = await Promise.all([
      getEmotionActionTypes(),
      getEmotionMapEntries(),
    ]);

    if (!selectedActionId || !actionTypes.some(type => type.id === selectedActionId)) {
      selectedActionId = actionTypes[0]?.id || null;
    }

    content.innerHTML = buildEmotionMap();
    wireEmotionMap();
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <h3 class="text-loss">Emotion Map needs its database tables</h3>
        <p>${escapeHtml(err.message)}</p>
        <p class="text-muted mt-8">Run the new emotion map migration in Supabase, then reload this page.</p>
      </div>
    `;
  }
}

function buildEmotionMap() {
  const selected = getSelectedAction();
  const selectedEntries = selected ? getEntriesForAction(selected.id) : [];
  const totalMaps = entries.length;
  const mappedActions = actionTypes.filter(type => getEntriesForAction(type.id).length > 0).length;

  return `
    <div class="emotion-map-layout">
      <div class="emotion-map-main">
        <div class="stats-grid emotion-map-stats">
          <div class="stat-card loss">
            <div class="stat-label">Mapped Actions</div>
            <div class="stat-value text-loss">${mappedActions}</div>
            <div class="stat-sub">Action types with at least one entry</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Total Records</div>
            <div class="stat-value text-warning">${totalMaps}</div>
            <div class="stat-sub">Signals captured over time</div>
          </div>
          <div class="stat-card primary">
            <div class="stat-label">Current Focus</div>
            <div class="stat-value text-primary">${selectedEntries.length}</div>
            <div class="stat-sub">${selected ? escapeHtml(selected.name) : 'Add an action type'}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Action Types</div>
              <div class="card-subtitle">Click a card to review and record that pattern</div>
            </div>
          </div>
          ${buildActionCards()}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${selected ? escapeHtml(selected.name) : 'No action selected'}</div>
              <div class="card-subtitle">${selectedEntries.length} recorded instance${selectedEntries.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          ${buildEntryList(selectedEntries)}
        </div>
      </div>

      <div class="emotion-map-side">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Add Action Type</div>
              <div class="card-subtitle">Creates a new review card</div>
            </div>
          </div>
          <div class="form-group mb-16">
            <label class="form-label required">Name</label>
            <input type="text" id="emotion-new-action-name" class="form-input" placeholder="e.g. Revenge trading">
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea id="emotion-new-action-description" class="form-textarea" rows="2" placeholder="What does this pattern look like?"></textarea>
          </div>
          <button class="btn btn-ghost btn-block mt-16" id="emotion-add-action">Add Action Type</button>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Record The Map</div>
              <div class="card-subtitle">${selected ? escapeHtml(selected.name) : 'Add an action type first'}</div>
            </div>
          </div>
          ${buildEntryForm(selected)}
        </div>
      </div>
    </div>
  `;
}

function buildActionCards() {
  if (!actionTypes.length) {
    return `
      <div class="empty-state" style="padding:32px">
        <h3>No action types yet</h3>
        <p>Add the first action type to start building your map.</p>
      </div>
    `;
  }

  return `
    <div class="emotion-action-grid">
      ${actionTypes.map(type => {
        const count = getEntriesForAction(type.id).length;
        const latest = getEntriesForAction(type.id)[0];
        return `
          <button class="emotion-action-card ${type.id === selectedActionId ? 'active' : ''}" data-id="${type.id}">
            <span class="emotion-action-name">${escapeHtml(type.name)}</span>
            <span class="emotion-action-count">${count}</span>
            <span class="emotion-action-desc">${type.description ? escapeHtml(type.description) : 'No description yet'}</span>
            <span class="emotion-action-meta">${latest ? `Latest: ${formatDate(latest.date)}` : 'No records yet'}</span>
            <span class="emotion-action-delete" data-id="${type.id}" title="Delete action type">Del</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function buildEntryForm(selected) {
  if (!selected) {
    return `
      <div class="empty-state" style="padding:24px 0">
        <p>Add an action type before recording a map.</p>
      </div>
    `;
  }

  return `
    <div class="form-group mb-16">
      <label class="form-label">Date</label>
      <input type="date" id="emotion-date" class="form-input" value="${todayString()}">
    </div>
    ${MAP_FIELDS.map(field => `
      <div class="form-group mb-16">
        <label class="form-label">${field.label}</label>
        <textarea id="emotion-${field.key}" class="form-textarea" rows="2" placeholder="${escapeHtml(field.placeholder)}"></textarea>
      </div>
    `).join('')}
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="emotion-notes" class="form-textarea" rows="2" placeholder="Anything else you want to remember"></textarea>
    </div>
    <button class="btn btn-primary btn-block mt-16" id="emotion-save-entry">Save Map Entry</button>
  `;
}

function buildEntryList(list) {
  if (!selectedActionId) {
    return `
      <div class="empty-state" style="padding:40px">
        <h3>No action selected</h3>
        <p>Add or select an action type to review its map.</p>
      </div>
    `;
  }

  if (!list.length) {
    return `
      <div class="empty-state" style="padding:40px">
        <h3>No records for this action yet</h3>
        <p>Use the map form to capture the trigger, thoughts, emotions, behaviors, and mistake.</p>
      </div>
    `;
  }

  return `
    <div class="emotion-entry-list">
      ${list.map(entry => `
        <div class="emotion-entry-card">
          <div class="emotion-entry-head">
            <div>
              <div class="emotion-entry-date">${formatDate(entry.date)}</div>
              <div class="card-subtitle">${formatCreated(entry.created_at)}</div>
            </div>
            <button class="btn btn-danger btn-xs emotion-delete-entry" data-id="${entry.id}">Del</button>
          </div>
          <div class="emotion-map-fields">
            ${MAP_FIELDS.map(field => buildMapField(field.label, entry[field.key])).join('')}
            ${entry.notes ? buildMapField('Notes', entry.notes) : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildMapField(label, value) {
  return `
    <div class="emotion-map-field ${value ? '' : 'empty'}">
      <div class="emotion-map-label">${escapeHtml(label)}</div>
      <div class="emotion-map-value">${value ? nl2br(value) : 'Not recorded'}</div>
    </div>
  `;
}

function wireEmotionMap() {
  document.querySelectorAll('.emotion-action-card').forEach(card => {
    card.onclick = () => {
      selectedActionId = card.dataset.id;
      document.getElementById('emotion-map-content').innerHTML = buildEmotionMap();
      wireEmotionMap();
    };
  });

  document.querySelectorAll('.emotion-action-delete').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const type = actionTypes.find(item => item.id === btn.dataset.id);
      if (!type) return;
      if (!confirm(`Delete "${type.name}" and all its recorded maps? This cannot be undone.`)) return;

      try {
        await deleteEmotionActionType(type.id);
        showToast('Action type deleted', 'success');
        if (selectedActionId === type.id) selectedActionId = null;
        await loadEmotionMap();
      } catch (err) {
        showToast('Failed to delete action type: ' + err.message, 'error');
      }
    };
  });

  document.getElementById('emotion-add-action')?.addEventListener('click', handleAddActionType);
  document.getElementById('emotion-save-entry')?.addEventListener('click', handleSaveEntry);

  document.querySelectorAll('.emotion-delete-entry').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this map entry?')) return;
      try {
        await deleteEmotionMapEntry(btn.dataset.id);
        showToast('Map entry deleted', 'success');
        await loadEmotionMap();
      } catch (err) {
        showToast('Failed to delete map entry: ' + err.message, 'error');
      }
    };
  });
}

function handleExportEmotionMap() {
  if (!actionTypes.length) {
    showToast('No emotion map data to export yet', 'warning');
    return;
  }

  const exportedAt = new Date();
  const content = buildLlmExport(exportedAt);
  const dateStamp = exportedAt.toISOString().slice(0, 10);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `emotion-map-llm-export-${dateStamp}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast('Emotion map export downloaded', 'success');
}

function buildLlmExport(exportedAt) {
  const sortedActionTypes = [...actionTypes].sort((a, b) => {
    const sortDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (sortDiff !== 0) return sortDiff;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  const lines = [
    '# Emotion Map Export',
    '',
    `Exported: ${exportedAt.toLocaleString('en-GB')}`,
    `Action types: ${actionTypes.length}`,
    `Total records: ${entries.length}`,
    '',
    '## Analysis Request',
    '',
    'Please analyse this trading emotion map and find recurring patterns. Focus on repeated triggers, thoughts, emotions, behaviours, actions, decision-making changes, market-perception changes, and trading mistakes. Identify the highest-impact negative loops, early warning signals, and practical interventions I can use before or during trading.',
    '',
    '## Data',
    '',
  ];

  sortedActionTypes.forEach((type, typeIndex) => {
    const list = getEntriesForAction(type.id);
    lines.push(`### ${typeIndex + 1}. ${md(type.name)}`);
    lines.push('');
    if (type.description) lines.push(`Description: ${md(type.description)}`);
    lines.push(`Records: ${list.length}`);
    lines.push('');

    if (!list.length) {
      lines.push('No recorded instances yet.');
      lines.push('');
      return;
    }

    list.forEach((entry, entryIndex) => {
      lines.push(`#### Record ${entryIndex + 1} - ${entry.date || 'No date'}`);
      lines.push('');
      MAP_FIELDS.forEach(field => {
        lines.push(`- ${field.label}: ${md(entry[field.key]) || 'Not recorded'}`);
      });
      lines.push(`- Notes: ${md(entry.notes) || 'Not recorded'}`);
      lines.push('');
    });
  });

  return lines.join('\n');
}

function md(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, ' ')
    .trim();
}

async function handleAddActionType() {
  const name = document.getElementById('emotion-new-action-name')?.value.trim();
  const description = document.getElementById('emotion-new-action-description')?.value.trim();
  if (!name) { showToast('Action type name is required', 'error'); return; }

  try {
    const saved = await saveEmotionActionType({
      name,
      description: description || '',
      sort_order: (actionTypes.length + 1) * 10,
    });
    selectedActionId = saved.id;
    showToast('Action type added', 'success');
    await loadEmotionMap();
  } catch (err) {
    showToast('Failed to add action type: ' + err.message, 'error');
  }
}

async function handleSaveEntry() {
  if (!selectedActionId) { showToast('Select an action type first', 'error'); return; }

  const date = document.getElementById('emotion-date')?.value;
  if (!date) { showToast('Date is required', 'error'); return; }

  const payload = {
    action_type_id: selectedActionId,
    date,
    notes: document.getElementById('emotion-notes')?.value.trim() || '',
  };

  MAP_FIELDS.forEach(field => {
    payload[field.key] = document.getElementById(`emotion-${field.key}`)?.value.trim() || '';
  });

  const hasMapContent = MAP_FIELDS.some(field => payload[field.key]) || payload.notes;
  if (!hasMapContent) { showToast('Record at least one map field', 'error'); return; }

  try {
    await saveEmotionMapEntry(payload);
    showToast('Map entry saved', 'success');
    await loadEmotionMap();
    document.getElementById('emotion-trigger_signal')?.focus();
  } catch (err) {
    showToast('Failed to save map entry: ' + err.message, 'error');
  }
}

function getSelectedAction() {
  return actionTypes.find(type => type.id === selectedActionId) || null;
}

function getEntriesForAction(actionTypeId) {
  return entries.filter(entry => entry.action_type_id === actionTypeId);
}

function formatCreated(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
