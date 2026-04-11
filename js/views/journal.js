// =============================================
//  DAILY JOURNAL VIEW
// =============================================
import { getJournalEntry, saveJournalEntry, getTrades } from '../db.js';
import { todayString, formatDate, addDays, calcStats, formatCurrency,
         pnlClass, pnlSign, getOutcomeBadge, getDirectionBadge,
         tiltLabel, tiltClass, nl2br, debounce } from '../utils.js';
import { openTradeModal, showToast } from '../app.js';
import { getNewsForDate, eventTime } from '../news.js';

let currentDate = todayString();
let saveTimer = null;
let pendingSave = false;

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
    body.innerHTML = buildJournalBody(date, entry || {}, trades, prevEntry, news);
    initJournalInteractions(date, entry || {});
  } catch (err) {
    console.error('Journal load error:', err);
    body.innerHTML = `<div class="empty-state"><p class="text-loss">Error: ${err.message}</p></div>`;
  }
}

function buildJournalBody(date, entry, trades, prevEntry, news = []) {
  const stats = calcStats(trades);
  const isToday = date === todayString();
  const dayLabel = formatDateLong(date);

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

    ${buildNewsStrip(news)}

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
            <textarea id="j-economic" class="form-textarea" rows="2" placeholder="CPI, FOMC, NFP, earnings, interest rate decisions...">${entry.economic_events || autoEconomicEvents}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Daily Goals &amp; Trading Plan</label>
            <textarea id="j-goals" class="form-textarea" rows="3" placeholder="What do you aim to achieve today? What setups will you look for? What is your max daily loss?">${entry.daily_goals || ''}</textarea>
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

function buildNewsStrip(news) {
  if (!news.length) return '';

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

  return `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Outcome</th><th>Strategy</th><th>Tilt</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${trades.map(t => `
            <tr>
              <td><strong>${t.symbol}</strong></td>
              <td>${getDirectionBadge(t.direction)}</td>
              <td class="td-mono">${t.entry_price ?? '—'}</td>
              <td class="td-mono">${t.exit_price ?? '—'}</td>
              <td class="td-mono ${pnlClass(t.pnl)}">${pnlSign(t.pnl)}${formatCurrency(t.pnl)}</td>
              <td>${getOutcomeBadge(t.outcome, t.trade_type)}</td>
              <td class="text-muted text-sm">${t.strategy || '—'}</td>
              <td class="td-mono">${t.tilt_meter ? `<span class="text-sm" style="color:var(--text-secondary)">${t.tilt_meter}/10</span>` : '—'}</td>
              <td>
                <div class="trade-actions">
                  <button class="btn btn-ghost btn-xs" onclick="window._openTradeModal('${t.id}', '${date}')">Edit</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
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
          <img src="${url}" class="screenshot-thumb" onclick="window._viewImage('${url}')" alt="screenshot">
        `).join('')}
      </div>
    </div>
  `;
}

function initJournalInteractions(date, entry) {
  window._openTradeModal = (id, d) => openTradeModal(id, d || date);

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
