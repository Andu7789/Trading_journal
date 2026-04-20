// =============================================
//  NOTES VIEW — General journal / standalone thoughts
// =============================================
import { getNotes, saveNote, deleteNote, uploadScreenshot } from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, formatDate, todayString } from '../utils.js';

let pendingNoteScreenshots = []; // { file, localUrl, uploaded } | { url, localUrl, uploaded:true }

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

    <!-- Note View Modal (read-only) -->
    <div id="note-view-modal" class="modal hidden">
      <div class="modal-backdrop" id="note-view-modal-backdrop"></div>
      <div class="modal-dialog" style="width:min(640px,95vw)">
        <div class="modal-header">
          <div>
            <h2 id="note-view-date" style="font-size:16px;font-weight:700"></h2>
            <div id="note-view-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
          </div>
          <button class="modal-close" id="close-note-view-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div id="note-view-content" style="white-space:pre-wrap;line-height:1.7;color:var(--text-primary);font-size:14px"></div>
          <div id="note-view-screenshots"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="note-view-close-btn">Close</button>
          <button class="btn btn-primary" id="note-view-edit-btn">Edit</button>
        </div>
      </div>
    </div>

    <!-- Note Edit Modal -->
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
          <div class="form-group">
            <label class="form-label">Screenshots</label>
            <div class="screenshot-zone" id="note-screenshot-zone">
              <div id="note-screenshot-previews" class="screenshot-previews"></div>
              <div class="upload-prompt" id="note-upload-prompt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Click or drag images here</span>
              </div>
              <input type="file" id="note-screenshot-input" accept="image/*" multiple style="display:none">
            </div>
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

  document.getElementById('close-note-view-modal').onclick  = closeNoteViewModal;
  document.getElementById('note-view-close-btn').onclick    = closeNoteViewModal;
  document.getElementById('note-view-modal-backdrop').onclick = closeNoteViewModal;
  document.getElementById('note-view-edit-btn').onclick     = () => {
    const id = document.getElementById('note-view-edit-btn').dataset.id;
    closeNoteViewModal();
    openNoteModal(id);
  };

  // Close on Escape
  document.removeEventListener('keydown', _escHandler);
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
    _cachedNotes = notes;

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

    content.querySelectorAll('.note-row').forEach(row => {
      row.style.cursor = 'pointer';
      row.onclick = (e) => {
        if (e.target.closest('button')) return; // let Edit/Del buttons work
        openNoteViewModal(row.dataset.id);
      };
    });
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
  const screenshots = note.screenshots || [];

  return `
    <tr class="note-row" data-id="${note.id}">
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
        ${screenshots.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
          ${screenshots.slice(0,3).map(url => `<img src="${url}" style="width:36px;height:28px;object-fit:cover;border-radius:3px;border:1px solid var(--border)">`).join('')}
          ${screenshots.length > 3 ? `<span class="text-xs text-muted" style="align-self:center">+${screenshots.length-3}</span>` : ''}
        </div>` : ''}
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

let _cachedNotes = [];

async function openNoteViewModal(id) {
  try {
    if (!_cachedNotes.length) _cachedNotes = await getNotes();
    const note = _cachedNotes.find(n => n.id === id);
    if (!note) return;

    const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
    document.getElementById('note-view-date').textContent = formatDate(note.date);
    document.getElementById('note-view-tags').innerHTML = tags.length
      ? tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')
      : '';
    document.getElementById('note-view-content').textContent = note.content || '';
    document.getElementById('note-view-edit-btn').dataset.id = id;

    // Screenshots
    const screenshots = note.screenshots || [];
    const screenshotsEl = document.getElementById('note-view-screenshots');
    if (screenshotsEl) {
      if (screenshots.length) {
        screenshotsEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            ${screenshots.map(url => `<img src="${url}" style="width:120px;height:90px;object-fit:cover;border-radius:var(--radius);cursor:pointer;border:1px solid var(--border)" onclick="window._viewImage('${url}')" alt="screenshot">`).join('')}
           </div>`;
      } else {
        screenshotsEl.innerHTML = '';
      }
    }

    document.getElementById('note-view-modal').classList.remove('hidden');
  } catch {}
}

function closeNoteViewModal() {
  document.getElementById('note-view-modal').classList.add('hidden');
}

function openNoteModal(id) {
  const modal = document.getElementById('note-modal');
  document.getElementById('note-modal-title').textContent = id ? 'Edit Note' : 'New Note';
  document.getElementById('note-id').value      = '';
  document.getElementById('note-date').value    = todayString();
  document.getElementById('note-tags').value    = '';
  document.getElementById('note-content').value = '';

  // Reset screenshots
  pendingNoteScreenshots = [];
  document.getElementById('note-screenshot-previews').innerHTML = '';

  wireNoteScreenshotZone();

  if (id) loadNoteForEdit(id);

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('note-content').focus(), 50);
}

async function loadNoteForEdit(id) {
  try {
    const notes = _cachedNotes.length ? _cachedNotes : await getNotes();
    const note  = notes.find(n => n.id === id);
    if (!note) return;
    document.getElementById('note-id').value      = note.id;
    document.getElementById('note-date').value    = note.date || '';
    document.getElementById('note-tags').value    = Array.isArray(note.tags) ? note.tags.join(', ') : '';
    document.getElementById('note-content').value = note.content || '';

    // Load existing screenshots
    const screenshots = note.screenshots || [];
    const previews = document.getElementById('note-screenshot-previews');
    screenshots.forEach(url => {
      pendingNoteScreenshots.push({ url, localUrl: url, uploaded: true });
      const idx = pendingNoteScreenshots.length - 1;
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.idx = idx;
      item.innerHTML = `
        <img src="${url}" alt="screenshot" onclick="window._viewImage('${url}')">
        <button class="preview-remove" onclick="window._noteRemovePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
    });
  } catch {}
}

function closeNoteModal() {
  const modal = document.getElementById('note-modal');
  if (modal) modal.classList.add('hidden');
  pendingNoteScreenshots = [];
}

function wireNoteScreenshotZone() {
  const zone   = document.getElementById('note-screenshot-zone');
  let   input  = document.getElementById('note-screenshot-input');
  const prompt = document.getElementById('note-upload-prompt');
  if (!zone || !input) return;

  // Clone to strip old listeners
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  input = fresh;

  prompt?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => addNoteFiles(Array.from(input.files)));

  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addNoteFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  });

  window._noteRemovePreview = (idx) => {
    pendingNoteScreenshots[idx] = null;
    const item = document.querySelector(`#note-screenshot-previews .preview-item[data-idx="${idx}"]`);
    if (item) item.remove();
  };
}

function addNoteFiles(files) {
  const previews = document.getElementById('note-screenshot-previews');
  if (!previews) return;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      pendingNoteScreenshots.push({ file, localUrl: url, uploaded: false });
      const idx = pendingNoteScreenshots.length - 1;
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.idx = idx;
      item.innerHTML = `
        <img src="${url}" alt="screenshot" onclick="window._viewImage('${url}')">
        <button class="preview-remove" onclick="window._noteRemovePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
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
    // Upload any new screenshots
    const screenshotUrls = [];
    for (const item of pendingNoteScreenshots) {
      if (!item) continue;
      if (item.uploaded) {
        screenshotUrls.push(item.url);
      } else {
        try {
          const url = await uploadScreenshot(item.file);
          screenshotUrls.push(url);
        } catch { /* skip failed uploads */ }
      }
    }

    const data = {
      id:          document.getElementById('note-id').value || undefined,
      date,
      content,
      tags:        document.getElementById('note-tags').value,
      screenshots: screenshotUrls,
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
