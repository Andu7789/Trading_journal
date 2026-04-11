// =============================================
//  NOTES VIEW — General journal / standalone thoughts
// =============================================
import { getNotes, saveNote, deleteNote } from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, formatDate, todayString } from '../utils.js';

export async function renderNotes(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Notes</h1>
        <div class="page-header-sub">Standalone thoughts, observations and reflections</div>
      </div>
      <button class="btn btn-primary" id="new-note-btn">+ New Note</button>
    </div>

    <div id="notes-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>

    <!-- Note Modal -->
    <div id="note-modal" class="modal hidden">
      <div class="modal-backdrop" id="note-modal-backdrop"></div>
      <div class="modal-dialog" style="width:min(600px,95vw)">
        <div class="modal-header">
          <h2 id="note-modal-title">New Note</h2>
          <button class="modal-close" id="close-note-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="note-id">
          <div class="form-grid-2" style="margin-bottom:16px">
            <div class="form-group">
              <label class="form-label required">Date</label>
              <input type="date" id="note-date" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">Tags</label>
              <input type="text" id="note-tags" class="form-input" placeholder="mindset, market, strategy (comma separated)">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label required">Note</label>
            <textarea id="note-content" class="form-textarea" rows="9" placeholder="Write your thoughts, observations or reflections here..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancel-note-modal">Cancel</button>
          <button class="btn btn-primary" id="save-note-btn">Save Note</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('new-note-btn').onclick          = () => openNoteModal(null);
  document.getElementById('close-note-modal').onclick      = closeNoteModal;
  document.getElementById('cancel-note-modal').onclick     = closeNoteModal;
  document.getElementById('note-modal-backdrop').onclick   = closeNoteModal;
  document.getElementById('save-note-btn').onclick         = handleSaveNote;

  // Close on Escape
  document.addEventListener('keydown', _escHandler);

  await loadNotes();
}

function _escHandler(e) {
  if (e.key === 'Escape') closeNoteModal();
}

async function loadNotes() {
  const content = document.getElementById('notes-content');
  if (!content) return;

  try {
    const notes = await getNotes();

    if (!notes.length) {
      content.innerHTML = `
        <div class="empty-state" style="padding:60px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <h3>No notes yet</h3>
          <p>Record your thoughts, observations and reflections</p>
          <button class="btn btn-primary mt-16" onclick="document.getElementById('new-note-btn').click()">Add First Note</button>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style="width:110px">Date</th>
              <th style="width:220px">Tags</th>
              <th>Note</th>
              <th style="width:90px;text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${notes.map(buildNoteRow).join('')}
          </tbody>
        </table>
      </div>
    `;

    content.querySelectorAll('.note-edit-btn').forEach(btn => {
      btn.onclick = () => openNoteModal(btn.dataset.id);
    });
    content.querySelectorAll('.note-delete-btn').forEach(btn => {
      btn.onclick = () => confirmDeleteNote(btn.dataset.id);
    });

  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildNoteRow(note) {
  const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
  const preview = firstSentence(note.content);

  return `
    <tr>
      <td class="td-mono">${formatDate(note.date)}</td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${tags.length
            ? tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')
            : '<span class="text-muted" style="font-size:12px">—</span>'
          }
        </div>
      </td>
      <td style="white-space:normal;max-width:500px">
        <span style="color:var(--text-secondary);font-size:13px">${escapeHtml(preview)}</span>
      </td>
      <td style="text-align:right">
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button class="btn btn-ghost btn-xs note-edit-btn" data-id="${note.id}">Edit</button>
          <button class="btn btn-danger btn-xs note-delete-btn" data-id="${note.id}">Del</button>
        </div>
      </td>
    </tr>
  `;
}

function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : text.slice(0, 120);
}

function openNoteModal(id) {
  const modal = document.getElementById('note-modal');
  document.getElementById('note-modal-title').textContent = id ? 'Edit Note' : 'New Note';
  document.getElementById('note-id').value      = '';
  document.getElementById('note-date').value    = todayString();
  document.getElementById('note-tags').value    = '';
  document.getElementById('note-content').value = '';

  if (id) loadNoteForEdit(id);

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('note-content').focus(), 50);
}

async function loadNoteForEdit(id) {
  try {
    const notes = await getNotes();
    const note  = notes.find(n => n.id === id);
    if (!note) return;
    document.getElementById('note-id').value      = note.id;
    document.getElementById('note-date').value    = note.date || '';
    document.getElementById('note-tags').value    = Array.isArray(note.tags) ? note.tags.join(', ') : '';
    document.getElementById('note-content').value = note.content || '';
  } catch {}
}

function closeNoteModal() {
  const modal = document.getElementById('note-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveNote() {
  const date    = document.getElementById('note-date').value;
  const content = document.getElementById('note-content').value.trim();

  if (!date)    { showToast('Date is required', 'error');         return; }
  if (!content) { showToast('Note content is required', 'error'); return; }

  const saveBtn = document.getElementById('save-note-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving...';

  try {
    const data = {
      id:      document.getElementById('note-id').value || undefined,
      date,
      content,
      tags:    document.getElementById('note-tags').value,
    };
    if (!data.id) delete data.id;

    await saveNote(data);
    showToast('Note saved', 'success');
    closeNoteModal();
    await loadNotes();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Note';
  }
}

async function confirmDeleteNote(id) {
  if (!confirm('Delete this note? This cannot be undone.')) return;
  try {
    await deleteNote(id);
    showToast('Note deleted', 'success');
    await loadNotes();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}
