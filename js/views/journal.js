// =============================================
//  DAILY JOURNAL VIEW
// =============================================
import { getJournalEntry, saveJournalEntry, getTrades, uploadScreenshot } from '../db.js';
import { todayString, formatDate, addDays, calcStats, formatCurrency,
         pnlClass, pnlSign, getOutcomeBadge, getDirectionBadge,
         tiltLabel, tiltClass, nl2br, debounce, getSignalDisplay,
         calcTradeR, formatR, escapeHtml, captureAllScreens } from '../utils.js';
import { openTradeModal, showToast } from '../app.js';
import { getNewsForDate, eventTime, newsFetchStatus } from '../news.js';

let currentDate = todayString();
let saveTimer = null;
let pendingSave = false;
let currentSins = [];
let currentPlanImages = [null, null, null];
let currentSessionLog = [];
let pendingLogImages = [];

const DEFAULT_SINS = [
  'Exited too soon',
  'Exited too late',
  'Entered too soon',
  'Entered too late',
  'Not in trading plan',
  'Incorrect stop placement',
  'Wrong size trade',
  "Didn't take planned trade",
];

function getSinDefinitions() {
  try {
    const stored = JSON.parse(localStorage.getItem('tj_trading_sins'));
    if (Array.isArray(stored)) {
      return stored.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
    }
  } catch {}
  return [...DEFAULT_SINS];
}

function saveSinDefinitions() {
  localStorage.setItem('tj_trading_sins', JSON.stringify(currentSins.map(sin => sin.name)));
}

export async function renderJournal(container, dateParam) {
  document.getElementById('page-title').textContent = 'Daily Journal';
  // Always ensure currentDate is valid YYYY-MM-DD
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    currentDate = dateParam;
  } else if (!currentDate || !/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
    currentDate = todayString();
  }

  // Expose nav functions globally so inline handlers work reliably
  window._journalPrev   = () => navigateDate(-1);
  window._journalNext   = () => navigateDate(1);
  window._journalToday  = () => navigateDate(0, todayString());
  window._journalPickDate = (val) => navigateDate(0, val);

  container.innerHTML = `
    <div class="journal-date-nav">
      <button class="journal-nav-btn" onclick="window._journalPrev()">‹ Prev</button>
      <input type="date" id="journal-date-picker" value="${currentDate}" onchange="window._journalPickDate(this.value)">
      <button class="journal-nav-btn" onclick="window._journalNext()">Next ›</button>
      <button class="btn btn-ghost btn-sm" onclick="window._journalToday()">Today</button>
      <span id="autosave-indicator" class="autosave-indicator"></span>
    </div>
    <div id="journal-body"><div class="loading-screen"><div class="loading-spinner"></div></div></div>
  `;

  await loadJournalDay(currentDate);
}

async function navigateDate(offset, exact) {
  if (exact) {
    // Validate it's a proper YYYY-MM-DD string before accepting
    if (/^\d{4}-\d{2}-\d{2}$/.test(exact)) {
      currentDate = exact;
    }
  } else {
    currentDate = addDays(currentDate, offset);
  }
  const picker = document.getElementById('journal-date-picker');
  if (picker) picker.value = currentDate;
  await loadJournalDay(currentDate);
}

async function loadJournalDay(date) {
  const body = document.getElementById('journal-body');
  if (!body) return;

  body.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    const yesterday = addDays(date, -1);
    const [entry, trades, prevEntry, news] = await Promise.all([
      getJournalEntry(date),
      getTrades({ date }),
      getJournalEntry(yesterday),
      getNewsForDate(date),
    ]);
    body.innerHTML = buildJournalBody(date, entry || {}, trades, prevEntry, news, newsFetchStatus);
    initJournalInteractions(date, entry || {});
  } catch (err) {
    console.error('Journal load error:', err);
    body.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildJournalBody(date, entry, trades, prevEntry, news = [], fetchStatus = { ok: true, error: null }) {
  const stats = calcStats(trades);
  const isToday = date === todayString();
  const dayLabel = formatDateLong(date);
  currentSins = normalizeSins(entry.trading_sins);
  currentPlanImages = normalizePlanImages(entry.plan_images);
  currentSessionLog = normalizeSessionLog(entry.session_log);
  pendingLogImages = [];

  // Auto-fill Economic Events textarea when entry has no saved value
  const autoEconomicEvents = !entry.economic_events && news.length
    ? news.map(e => {
        const t = eventTime(e);
        const extras = [e.forecast && `F: ${e.forecast}`, e.previous && `P: ${e.previous}`]
          .filter(Boolean).join(', ');
        return `${t} ${e.country} ${e.title}${extras ? ` (${extras})` : ''}`;
      }).join('\n')
    : '';

  return `
    <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2 style="font-size:18px;font-weight:700">${dayLabel}</h2>
        ${isToday ? '<span class="badge badge-open" style="margin-top:4px">TODAY</span>' : ''}
      </div>
      ${trades.length ? `
        <div style="display:flex;gap:16px;font-size:13px">
          <span class="${pnlClass(stats.totalPnl)} text-mono" style="font-weight:700">${pnlSign(stats.totalPnl)}${formatCurrency(stats.totalPnl)}</span>
          <span class="text-muted">${stats.wins}W / ${stats.losses}L (${stats.total ? stats.winRate.toFixed(0) : 0}%)</span>
        </div>
      ` : ''}
    </div>

    ${buildNewsStrip(news, fetchStatus)}

    <div class="journal-sections" id="journal-sections">

      <!-- PRE-MARKET -->
      <div class="journal-section" id="section-premarket">
        <div class="journal-section-header" onclick="window._toggleSection('premarket')">
          <div class="section-header-left">
            <span class="section-icon">🌅</span>
            <span class="section-title">Pre-Market Preparation</span>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="journal-section-body">
          ${prevEntry?.tomorrow_focus ? `
          <div style="
            background: linear-gradient(135deg, rgba(61,126,240,0.15), rgba(0,212,192,0.08));
            border: 1px solid rgba(61,126,240,0.4);
            border-left: 4px solid var(--secondary);
            border-radius: var(--radius-lg);
            padding: 18px 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 12px rgba(61,126,240,0.15);
          ">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <span style="font-size:18px">🔭</span>
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--secondary);letter-spacing:0.3px">Yesterday's Focus</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:1px">Did you stick to this today?</div>
              </div>
            </div>
            <div style="font-size:14px;color:var(--text-primary);line-height:1.7;font-style:italic">${nl2br(prevEntry.tomorrow_focus)}</div>
          </div>` : ''}
          <div class="form-group">
            <label class="form-label">Market Bias</label>
            <div class="bias-buttons">
              <button class="bias-btn ${entry.market_bias === 'bullish' ? 'active' : ''}" data-bias="bullish">📈 Bullish</button>
              <button class="bias-btn ${entry.market_bias === 'bearish' ? 'active' : ''}" data-bias="bearish">📉 Bearish</button>
              <button class="bias-btn ${entry.market_bias === 'neutral' ? 'active' : ''}" data-bias="neutral">➡️ Neutral</button>
              <button class="bias-btn ${entry.market_bias === 'mixed' ? 'active' : ''}" data-bias="mixed">⚡ Mixed</button>
            </div>
            <input type="hidden" id="j-bias" value="${entry.market_bias || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Economic Events Today</label>
            <textarea id="j-economic" class="form-textarea" rows="2" style="resize:none;overflow:hidden" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" placeholder="CPI, FOMC, NFP, earnings, interest rate decisions...">${entry.economic_events || autoEconomicEvents}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Daily Goals &amp; Trading Plan</label>
            <textarea id="j-goals" class="form-textarea" rows="3" placeholder="What do you aim to achieve today? What setups will you look for? What is your max daily loss?">${entry.daily_goals || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Trading Plan Screenshots</label>
            <div class="text-xs text-muted">Add up to 3 images for today's plan — click one to enlarge.</div>
            <div id="plan-images-container">${buildPlanImages()}</div>
          </div>
        </div>
      </div>

      <!-- SESSION LOG -->
      <div class="journal-section" id="section-sessionlog">
        <div class="journal-section-header" onclick="window._toggleSection('sessionlog')">
          <div class="section-header-left">
            <span class="section-icon">🗒️</span>
            <span class="section-title">Session Log</span>
            <span class="section-badge" style="${currentSessionLog.length ? '' : 'display:none'}">${currentSessionLog.length}</span>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="journal-section-body">
          <div class="text-sm text-muted">Add notes and screenshots as the day unfolds — each entry becomes a new row below.</div>
          <div id="session-log-list">${buildSessionLogList()}</div>
          <div class="session-log-add">
            <textarea id="new-log-comment" class="form-textarea" rows="2" placeholder="What's happening right now? Add a quick note..."></textarea>
            <div class="session-log-add-zone">
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input type="file" accept="image/*" multiple id="log-image-input" style="display:none" onchange="window._journalLogImageChange(this)">
                <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('log-image-input').click()">📎 Attach Images</button>
                <button type="button" class="btn btn-ghost btn-sm" id="capture-screens-btn">🖥️ Capture All Screens</button>
              </div>
              <div id="log-pending-images">${buildLogPendingImages()}</div>
            </div>
            <div style="display:flex;justify-content:flex-end">
              <button type="button" class="btn btn-primary btn-sm" id="add-log-entry-btn">+ Add Entry</button>
            </div>
          </div>
        </div>
      </div>

      <!-- TRADES -->
      <div class="journal-section" id="section-trades">
        <div class="journal-section-header" onclick="window._toggleSection('trades')">
          <div class="section-header-left">
            <span class="section-icon">📊</span>
            <span class="section-title">Today's Trades</span>
            ${trades.length ? `<span class="section-badge">${trades.length}</span>` : ''}
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="journal-section-body">
          <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
            <button class="btn btn-primary btn-sm" onclick="window._openTradeModal(null, '${date}')">+ Log Trade</button>
          </div>
          ${buildTradesTable(trades, date)}
        </div>
      </div>

      <!-- TRADING SINS -->
      <div class="journal-section" id="section-sins">
        <div class="journal-section-header" onclick="window._toggleSection('sins')">
          <div class="section-header-left">
            <span class="section-icon">!</span>
            <span class="section-title">Trading Sins</span>
            <span class="section-badge sin-section-badge" style="${totalSinCount(currentSins) ? '' : 'display:none'}">${totalSinCount(currentSins)}</span>
          </div>
          <span class="chevron">&#9662;</span>
        </div>
        <div class="journal-section-body">
          <div class="text-sm text-muted">Record each occurrence as it happens. Counts reset for each journal day.</div>
          <div id="sin-list">${buildSinList()}</div>
          <div class="sin-add-row">
            <input type="text" id="new-sin-name" class="form-input" placeholder="Add another trading sin...">
            <button type="button" class="btn btn-ghost btn-sm" id="add-sin-btn">Add Sin</button>
          </div>
        </div>
      </div>

      <!-- POST-SESSION REVIEW -->
      <div class="journal-section" id="section-review">
        <div class="journal-section-header" onclick="window._toggleSection('review')">
          <div class="section-header-left">
            <span class="section-icon">🔍</span>
            <span class="section-title">Post-Session Review</span>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="journal-section-body">
          <div class="form-group">
            <label class="form-label">✅ What Went Well Today?</label>
            <textarea id="j-went-well" class="form-textarea" rows="3" placeholder="Trades you executed perfectly, good decisions, discipline moments, emotional wins...">${entry.what_went_well || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">⚠️ What Didn't Go Well?</label>
            <textarea id="j-went-wrong" class="form-textarea" rows="3" placeholder="Mistakes made, rule breaks, emotional decisions, missed opportunities...">${entry.what_went_wrong || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">💡 Lessons Learned</label>
            <textarea id="j-lessons" class="form-textarea" rows="3" placeholder="Key takeaways from today's session. What will you carry forward?">${entry.lessons_learned || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">🎯 Tomorrow's Focus &amp; Improvements</label>
            <textarea id="j-tomorrow" class="form-textarea" rows="3" placeholder="What specific thing will you improve tomorrow? What setups will you look for?">${entry.tomorrow_focus || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">📝 General Notes</label>
            <textarea id="j-notes" class="form-textarea" rows="2" placeholder="Any other observations, market notes, or ideas...">${entry.general_notes || ''}</textarea>
          </div>
        </div>
      </div>

      <!-- SELF-ASSESSMENT -->
      <div class="journal-section" id="section-ratings">
        <div class="journal-section-header" onclick="window._toggleSection('ratings')">
          <div class="section-header-left">
            <span class="section-icon">⭐</span>
            <span class="section-title">Self-Assessment</span>
          </div>
          <span class="chevron">▾</span>
        </div>
        <div class="journal-section-body">
          <div class="ratings-grid">
            <div class="rating-item">
              <div class="rating-label">
                <span>Discipline</span>
                <span class="rating-value" id="discipline-val">${entry.discipline_rating || 5}/10</span>
              </div>
              <input type="range" class="rating-slider" id="j-discipline" min="1" max="10" value="${entry.discipline_rating || 5}">
              <div class="text-xs text-muted">Did you follow your rules?</div>
            </div>
            <div class="rating-item">
              <div class="rating-label">
                <span>Emotional Control</span>
                <span class="rating-value" id="emotion-ctrl-val">${entry.emotion_rating || 5}/10</span>
              </div>
              <input type="range" class="rating-slider" id="j-emotion" min="1" max="10" value="${entry.emotion_rating || 5}">
              <div class="text-xs text-muted">Were you calm and in control?</div>
            </div>
            <div class="rating-item">
              <div class="rating-label">
                <span>Overall Session</span>
                <span class="rating-value" id="overall-val">${entry.overall_rating || 5}/10</span>
              </div>
              <input type="range" class="rating-slider" id="j-overall" min="1" max="10" value="${entry.overall_rating || 5}">
              <div class="text-xs text-muted">How was the session overall?</div>
            </div>
          </div>
        </div>
      </div>

    </div><!-- journal-sections -->

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px">
      <span id="autosave-msg" class="autosave-indicator"></span>
      <button class="btn btn-primary btn-lg" id="save-journal-btn">Save Journal Entry</button>
    </div>
  `;
}

function normalizePlanImages(images) {
  const arr = Array.isArray(images) ? images.filter(u => typeof u === 'string' && u) : [];
  return [arr[0] || null, arr[1] || null, arr[2] || null];
}

function normalizeSessionLog(log) {
  if (!Array.isArray(log)) return [];
  return log
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      id: e.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: e.time || '',
      comment: e.comment || '',
      images: Array.isArray(e.images) ? e.images.filter(Boolean) : [],
    }));
}

function buildPlanImages() {
  const slots = [0, 1, 2].map(i => {
    const url = currentPlanImages[i];
    const inputId = `plan-image-file-${i}`;
    const fileInput = `<input type="file" accept="image/*" id="${inputId}" style="display:none" onchange="window._journalPlanImageChange(${i}, this)">`;
    if (url) {
      return `
        <div class="plan-image-slot filled">
          <img src="${url}" alt="Trading plan ${i + 1}" onclick="window._journalViewPlanImage(${i})">
          <button type="button" class="plan-image-remove" onclick="window._journalRemovePlanImage(${i})" title="Remove image">&times;</button>
          ${fileInput}
        </div>`;
    }
    return `
      <div class="plan-image-slot empty" onclick="document.getElementById('${inputId}').click()">
        <span class="plan-image-plus">+</span>
        <span class="plan-image-label">Add Image</span>
        ${fileInput}
      </div>`;
  }).join('');
  return `<div class="plan-images-grid">${slots}</div>`;
}

function logGridColumns(count) {
  return Math.max(count, 3);
}

function logGridPlaceholders(count) {
  return '<div class="log-image-item placeholder"></div>'.repeat(Math.max(0, 3 - count));
}

function buildSessionLogList() {
  if (!currentSessionLog.length) {
    return '<div class="empty-state" style="padding:16px 0"><p class="text-muted text-sm">No entries yet — add one below as your day unfolds.</p></div>';
  }
  return `
    <div class="session-log-rows">
      ${currentSessionLog.map((entry, idx) => `
        <div class="session-log-row">
          <div class="session-log-row-header">
            <span class="session-log-time">${escapeHtml(entry.time)}</span>
            <button type="button" class="btn btn-ghost btn-xs session-log-delete" data-index="${idx}">Delete</button>
          </div>
          ${entry.comment ? `<div class="session-log-comment">${nl2br(entry.comment)}</div>` : ''}
          ${entry.images.length ? `
          <div class="log-images-grid" style="grid-template-columns:repeat(${logGridColumns(entry.images.length)}, 1fr)">
            ${entry.images.map((url, imgIdx) => `
              <div class="log-image-item">
                <img src="${url}" onclick="window._journalViewLogImage(${idx}, ${imgIdx})" alt="log screenshot">
              </div>
            `).join('')}
            ${logGridPlaceholders(entry.images.length)}
          </div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function buildLogPendingImages() {
  if (!pendingLogImages.length) return '';
  return `
    <div class="log-images-grid" style="grid-template-columns:repeat(${logGridColumns(pendingLogImages.length)}, 1fr);margin-top:8px">
      ${pendingLogImages.map((item, idx) => `
        <div class="log-image-item">
          <img src="${item.localUrl}" alt="pending">
          <button type="button" class="plan-image-remove" onclick="window._journalRemoveLogPendingImage(${idx})">&times;</button>
        </div>
      `).join('')}
      ${logGridPlaceholders(pendingLogImages.length)}
    </div>
  `;
}

function renderSessionLog(date) {
  const list = document.getElementById('session-log-list');
  if (list) list.innerHTML = buildSessionLogList();
  const badge = document.querySelector('#section-sessionlog .section-badge');
  if (badge) {
    badge.textContent = currentSessionLog.length;
    badge.style.display = currentSessionLog.length ? '' : 'none';
  }
  wireSessionLogControls(date);
}

function wireSessionLogControls(date) {
  document.querySelectorAll('.session-log-delete').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index);
      currentSessionLog.splice(idx, 1);
      renderSessionLog(date);
      triggerAutosave(date);
    };
  });
}

function normalizeSins(sins) {
  const source = Array.isArray(sins) ? sins : getSinDefinitions().map(name => ({ name, count: 0 }));
  return source
    .filter(sin => sin && typeof sin.name === 'string' && sin.name.trim())
    .map(sin => ({ name: sin.name.trim(), count: Math.max(0, parseInt(sin.count) || 0) }));
}

function totalSinCount(sins) {
  return sins.reduce((sum, sin) => sum + sin.count, 0);
}

function buildSinList() {
  if (!currentSins.length) {
    return '<div class="empty-state sin-empty"><p>No sins listed. Add one below.</p></div>';
  }

  return `
    <div class="sin-list">
      ${currentSins.map((sin, index) => `
        <div class="sin-row">
          <span class="sin-name">${escapeHtml(sin.name)}</span>
          <div class="sin-controls">
            <button type="button" class="sin-count-btn sin-minus" data-index="${index}" title="Remove one occurrence">&minus;</button>
            <span class="sin-count ${sin.count ? 'active' : ''}">${sin.count}</span>
            <button type="button" class="sin-count-btn sin-plus" data-index="${index}" title="Record occurrence">+</button>
            <button type="button" class="btn btn-danger btn-xs sin-delete" data-index="${index}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSinList(date) {
  const list = document.getElementById('sin-list');
  if (list) list.innerHTML = buildSinList();
  const badge = document.querySelector('#section-sins .section-badge');
  const total = totalSinCount(currentSins);
  if (badge) {
    badge.textContent = total;
    badge.style.display = total ? '' : 'none';
  }
  wireSinControls(date);
}

function wireSinControls(date) {
  document.querySelectorAll('.sin-plus').forEach(btn => {
    btn.onclick = () => {
      currentSins[parseInt(btn.dataset.index)].count++;
      renderSinList(date);
      triggerAutosave(date);
    };
  });
  document.querySelectorAll('.sin-minus').forEach(btn => {
    btn.onclick = () => {
      const sin = currentSins[parseInt(btn.dataset.index)];
      sin.count = Math.max(0, sin.count - 1);
      renderSinList(date);
      triggerAutosave(date);
    };
  });
  document.querySelectorAll('.sin-delete').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      const sin = currentSins[index];
      if (sin.count && !confirm(`Delete "${sin.name}" and its ${sin.count} recorded occurrence${sin.count !== 1 ? 's' : ''} for this day?`)) return;
      currentSins.splice(index, 1);
      saveSinDefinitions();
      renderSinList(date);
      triggerAutosave(date);
    };
  });
}

function buildNewsStrip(news, fetchStatus = { ok: true, error: null }) {
  if (!news.length) {
    if (!fetchStatus.error) return '';
    return `
      <div style="
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-left: 4px solid var(--warning);
        border-radius: var(--radius-lg);
        padding: 12px 16px;
        margin-bottom: 20px;
        display:flex;align-items:center;gap:10px
      ">
        <span style="font-size:16px">⚠️</span>
        <span style="font-size:13px;color:var(--warning)">Could not load economic events: ${fetchStatus.error}</span>
      </div>`;
  }

  const impactColor = { High: '#ff4757', Medium: '#ffa502' };
  const impactBg    = { High: 'rgba(255,71,87,0.1)', Medium: 'rgba(255,165,2,0.1)' };

  const high   = news.filter(e => e.impact === 'High');
  const medium = news.filter(e => e.impact === 'Medium');

  return `
    <div style="
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-left: 4px solid #ff4757;
      border-radius: var(--radius-lg);
      padding: 14px 16px;
      margin-bottom: 20px;
    ">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">📅</span>
        <span style="font-size:13px;font-weight:700;color:var(--text-primary)">Economic Events Today</span>
        ${high.length ? `<span style="font-size:11px;background:rgba(255,71,87,0.15);color:#ff4757;padding:2px 8px;border-radius:20px;font-weight:600">${high.length} HIGH IMPACT</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${news.map(e => {
          const time = eventTime(e);
          const col  = impactColor[e.impact] || 'var(--text-muted)';
          const bg   = impactBg[e.impact]    || 'transparent';
          const forecast = e.forecast ? `<span class="text-xs text-muted" style="margin-left:8px">F: ${e.forecast}</span>` : '';
          const previous = e.previous ? `<span class="text-xs text-muted">P: ${e.previous}</span>` : '';
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:${bg};border-radius:var(--radius);border:1px solid ${col}22">
              <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);min-width:38px">${time}</span>
              <span style="font-size:11px;font-weight:700;color:${col};min-width:32px">${e.country}</span>
              <span style="font-size:13px;color:var(--text-primary);flex:1">${e.title}</span>
              ${forecast}${previous}
              <span style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:0.5px">${e.impact}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function buildTradesTable(trades, date) {
  if (!trades.length) {
    return `
      <div class="empty-state" style="padding:24px 0">
        <p class="text-muted text-sm">No trades logged for this day yet.</p>
      </div>
    `;
  }

  const totalPnl = trades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const rTrades  = trades.filter(t => calcTradeR(t) !== null);
  const totalR   = rTrades.reduce((s, t) => s + calcTradeR(t), 0);

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Symbol</th><th>Dir</th><th>P&amp;L</th><th>R</th><th>Outcome</th><th>Strategy</th><th>Conf.</th><th>Tilt</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${trades.map(t => {
            const r = calcTradeR(t);
            return `
            <tr>
              <td><strong>${t.symbol}</strong></td>
              <td>${getDirectionBadge(t.direction)}</td>
              <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
              <td class="td-mono ${r !== null ? pnlClass(r) : ''}">${formatR(r)}</td>
              <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
              <td class="text-muted text-sm">${t.strategy || '—'}</td>
              <td>${getSignalDisplay(t.signals)}</td>
              <td class="td-mono">${t.tilt_meter ? `<span class="text-sm" style="color:var(--text-secondary)">${t.tilt_meter}/10</span>` : '—'}</td>
              <td>
                <div class="trade-actions">
                  <button class="btn btn-ghost btn-xs" onclick="window._openTradeModal('${t.id}', '${date}')">Edit</button>
                </div>
              </td>
            </tr>
          `}).join('')}
        </tbody>
        ${trades.length > 1 ? `
        <tfoot>
          <tr style="border-top:2px solid var(--border);font-weight:700">
            <td colspan="2" class="text-xs text-muted">Day Total</td>
            <td class="td-mono ${pnlClass(totalPnl)}">${pnlSign(totalPnl)}${formatCurrency(totalPnl)}</td>
            <td class="td-mono ${rTrades.length ? pnlClass(totalR) : ''}">${rTrades.length ? formatR(parseFloat(totalR.toFixed(2))) : '—'}</td>
            <td colspan="5"></td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
    ${trades.some(t => t.screenshots?.length) ? buildScreenshots(trades) : ''}
  `;
}

function buildScreenshots(trades) {
  const allScreenshots = trades.flatMap(t => t.screenshots || []);
  if (!allScreenshots.length) return '';
  return `
    <div style="margin-top:12px">
      <div class="text-xs text-muted mb-8">Trade Screenshots</div>
      <div class="screenshots-grid">
        ${allScreenshots.map(url => `
          <img src="${url}" class="screenshot-thumb" onclick="window._viewPreview(this)" alt="screenshot">
        `).join('')}
      </div>
    </div>
  `;
}

function initJournalInteractions(date) {
  window._openTradeModal = (id, d) => openTradeModal(id, d || date);

  // Auto-size the economic events textarea to its content on load
  const econTA = document.getElementById('j-economic');
  if (econTA && econTA.value) {
    econTA.style.height = 'auto';
    econTA.style.height = econTA.scrollHeight + 'px';
  }

  window._toggleSection = (name) => {
    const sec = document.getElementById(`section-${name}`);
    if (sec) sec.classList.toggle('collapsed');
  };

  // Bias buttons
  document.querySelectorAll('.bias-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.bias-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('j-bias').value = btn.dataset.bias;
      triggerAutosave(date);
    };
  });

  // Rating sliders
  const sliders = [
    { id: 'j-discipline', valId: 'discipline-val' },
    { id: 'j-emotion',    valId: 'emotion-ctrl-val' },
    { id: 'j-overall',    valId: 'overall-val' },
  ];
  sliders.forEach(({ id, valId }) => {
    const slider = document.getElementById(id);
    const valEl  = document.getElementById(valId);
    if (!slider) return;
    slider.oninput = () => {
      valEl.textContent = slider.value + '/10';
      triggerAutosave(date);
    };
  });

  // Text areas — auto-save on change
  const textFields = ['j-economic','j-goals','j-went-well','j-went-wrong','j-lessons','j-tomorrow','j-notes'];
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = debounce(() => triggerAutosave(date), 1500);
  });

  wireSinControls(date);
  const addSin = () => {
    const input = document.getElementById('new-sin-name');
    const name = input?.value.trim();
    if (!name) return;
    if (currentSins.some(sin => sin.name.toLowerCase() === name.toLowerCase())) {
      showToast('That sin is already listed', 'warning');
      return;
    }
    currentSins.push({ name, count: 0 });
    saveSinDefinitions();
    input.value = '';
    renderSinList(date);
    triggerAutosave(date);
  };
  document.getElementById('add-sin-btn').onclick = addSin;
  document.getElementById('new-sin-name').onkeypress = e => {
    if (e.key === 'Enter') addSin();
  };

  // Trading plan images
  window._journalPlanImageChange = async (idx, input) => {
    const file = input.files[0];
    if (!file) return;
    try {
      const url = await uploadScreenshot(file);
      currentPlanImages[idx] = url;
      document.getElementById('plan-images-container').innerHTML = buildPlanImages();
      triggerAutosave(date);
    } catch (err) {
      showToast('Image upload failed: ' + err.message, 'error');
    }
  };
  window._journalRemovePlanImage = (idx) => {
    currentPlanImages[idx] = null;
    document.getElementById('plan-images-container').innerHTML = buildPlanImages();
    triggerAutosave(date);
  };
  window._journalViewPlanImage = (idx) => {
    const gallery = currentPlanImages.filter(Boolean);
    window._viewImage(currentPlanImages[idx], gallery);
  };

  // Session log
  window._journalViewLogImage = (rowIdx, imgIdx) => {
    const row = currentSessionLog[rowIdx];
    if (!row) return;
    window._viewImage(row.images[imgIdx], row.images);
  };
  window._journalLogImageChange = (input) => {
    Array.from(input.files || []).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        pendingLogImages.push({ file, localUrl: e.target.result });
        const container = document.getElementById('log-pending-images');
        if (container) container.innerHTML = buildLogPendingImages();
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  };
  window._journalRemoveLogPendingImage = (idx) => {
    pendingLogImages.splice(idx, 1);
    const container = document.getElementById('log-pending-images');
    if (container) container.innerHTML = buildLogPendingImages();
  };
  wireSessionLogControls(date);
  document.getElementById('capture-screens-btn').onclick = async () => {
    const btn = document.getElementById('capture-screens-btn');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Capturing...';
    try {
      const urls = await captureAllScreens();
      if (!urls.length) {
        showToast('No other screens to capture', 'warning');
      } else {
        urls.forEach(url => pendingLogImages.push({ file: null, localUrl: url, uploaded: true, url }));
        const container = document.getElementById('log-pending-images');
        if (container) container.innerHTML = buildLogPendingImages();
        showToast(`Captured ${urls.length} screen${urls.length !== 1 ? 's' : ''}`, 'success');
      }
    } catch (err) {
      showToast('Capture helper not reachable — is it running on your PC?', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };
  document.getElementById('add-log-entry-btn').onclick = async () => {
    const textarea = document.getElementById('new-log-comment');
    const comment = textarea?.value.trim() || '';
    if (!comment && !pendingLogImages.length) {
      showToast('Add a comment or an image first', 'warning');
      return;
    }
    const btn = document.getElementById('add-log-entry-btn');
    btn.disabled = true;
    btn.textContent = 'Adding...';
    try {
      const images = [];
      for (const item of pendingLogImages) {
        images.push(item.uploaded ? item.url : await uploadScreenshot(item.file));
      }
      currentSessionLog.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        comment,
        images,
      });
      pendingLogImages = [];
      textarea.value = '';
      const pendingContainer = document.getElementById('log-pending-images');
      if (pendingContainer) pendingContainer.innerHTML = buildLogPendingImages();
      renderSessionLog(date);
      await saveJournal(date, false);
      showToast('Entry added', 'success');
    } catch (err) {
      showToast('Failed to add entry: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Add Entry';
    }
  };

  // Manual save button
  document.getElementById('save-journal-btn').onclick = () => saveJournal(date, true);
}

function getJournalData(date) {
  const getValue = id => document.getElementById(id)?.value || '';
  return {
    date,
    market_bias:      getValue('j-bias'),
    economic_events:  getValue('j-economic'),
    daily_goals:      getValue('j-goals'),
    what_went_well:   getValue('j-went-well'),
    what_went_wrong:  getValue('j-went-wrong'),
    lessons_learned:  getValue('j-lessons'),
    tomorrow_focus:   getValue('j-tomorrow'),
    general_notes:    getValue('j-notes'),
    discipline_rating: parseInt(getValue('j-discipline')) || 5,
    emotion_rating:    parseInt(getValue('j-emotion')) || 5,
    overall_rating:    parseInt(getValue('j-overall')) || 5,
    trading_sins:      currentSins,
    plan_images:       currentPlanImages.filter(Boolean),
    session_log:       currentSessionLog,
  };
}

function triggerAutosave(date) {
  const indicator = document.getElementById('autosave-msg') || document.getElementById('autosave-indicator');
  if (indicator) {
    indicator.className = 'autosave-indicator saving';
    indicator.textContent = 'Saving...';
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveJournal(date, false), 2000);
}

async function saveJournal(date, manual = false) {
  clearTimeout(saveTimer);
  const data = getJournalData(date);
  const indicator = document.getElementById('autosave-msg') || document.getElementById('autosave-indicator');

  try {
    await saveJournalEntry(data);
    if (indicator) {
      indicator.className = 'autosave-indicator saved';
      indicator.textContent = manual ? '✓ Saved' : '✓ Auto-saved';
      setTimeout(() => { if (indicator) indicator.textContent = ''; }, 2000);
    }
    if (manual) showToast('Journal entry saved', 'success');
  } catch (err) {
    if (indicator) {
      indicator.className = 'autosave-indicator';
      indicator.textContent = '✗ Save failed';
      indicator.style.color = 'var(--loss)';
    }
    if (manual) showToast('Failed to save: ' + err.message, 'error');
  }
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
