// =============================================
//  APP.JS — Main SPA Controller
// =============================================
import { initSupabase, isConnected, testConnection, saveTrade,
         getTradeById, getDistinctSymbols, uploadScreenshot,
         getAuthSession, signInWithGoogle, signOut } from './db.js';
import { todayString, tiltLabel, tiltClass, formatCurrency, calcTradeR, formatR } from './utils.js';

// ---- Views ----
import { renderDashboard } from './views/dashboard.js';
import { renderJournal }   from './views/journal.js';
import { renderTrades }    from './views/trades.js';
import { renderWeekly }    from './views/weekly.js';
import { renderAnalytics } from './views/analytics.js';
import { renderSettings }  from './views/settings.js';
import { renderPlaybook }         from './views/playbook.js';
import { renderStrategyTracker } from './views/strategy-tracker.js';
import { renderNotes }           from './views/notes.js';

// ---- Module state ----
let currentView    = null;
let tradeCallback  = null;
let pendingScreenshots = []; // { file, url } for new uploads; or { url } for existing

function updateTradeSignalScore() {
  const btns  = document.querySelectorAll('#trade-form .signal-toggle[data-signal]');
  const count = Array.from(btns).filter(b => b.classList.contains('active')).length;
  const allBtn = document.getElementById('trade-signal-all');
  if (allBtn) allBtn.classList.toggle('active', count === btns.length);
  const el = document.getElementById('trade-signal-score');
  if (el) el.textContent = `Score: ${count} / 4`;
}

// ---- Image carousel state ----
let _gallery    = [];
let _galleryIdx = 0;

// =============================================
//  BOOT
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  setTopbarDate();
  const connected = initSupabase();

  if (!connected) {
    renderSetupScreen();
    return;
  }

  // Check for authenticated session (handles OAuth callback automatically)
  const session = await getAuthSession();
  if (!session) {
    renderLoginScreen();
    return;
  }

  bootApp(session);
});

function bootApp(session) {
  updateConnectionStatus();
  setupNavigation();
  setupTradeModal();
  setupImageModal();
  setupSidebarToggle();
  updateUserDisplay(session);

  window._signOut = async () => {
    await signOut();
    window.location.reload();
  };

  const hash = location.hash.replace('#', '') || 'dashboard';
  navigate(hash);
}

function updateUserDisplay(session) {
  const el = document.getElementById('auth-user');
  if (!el || !session?.user) return;
  const name = session.user.user_metadata?.name || session.user.email || '';
  const avatar = session.user.user_metadata?.avatar_url;
  el.innerHTML = avatar
    ? `<img src="${avatar}" style="width:24px;height:24px;border-radius:50%;object-fit:cover"> <span style="font-size:12px;color:var(--text-muted)">${name.split(' ')[0]}</span>`
    : `<span style="font-size:12px;color:var(--text-muted)">${name}</span>`;
}

function renderLoginScreen() {
  document.getElementById('sidebar').style.display = 'none';
  const container = document.getElementById('main-content');
  container.style.marginLeft = '0';
  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="
        background:var(--bg-surface);
        border:1px solid var(--border);
        border-radius:var(--radius-xl);
        padding:48px 40px;
        width:min(420px,100%);
        text-align:center;
      ">
        <div style="font-size:48px;margin-bottom:16px">📈</div>
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">TradeJournal Pro</h1>
        <p style="color:var(--text-muted);font-size:14px;margin-bottom:32px">Sign in to access your journal</p>
        <button id="google-signin-btn" style="
          display:flex;align-items:center;justify-content:center;gap:12px;
          width:100%;padding:12px 20px;
          background:#fff;color:#3c4043;
          border:1px solid #dadce0;border-radius:8px;
          font-size:15px;font-weight:500;cursor:pointer;
        ">
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>
        <p style="color:var(--text-muted);font-size:12px;margin-top:20px">Access is restricted to authorised users only</p>
      </div>
    </div>
  `;
  document.getElementById('google-signin-btn').onclick = async () => {
    const btn = document.getElementById('google-signin-btn');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    try {
      await signInWithGoogle();
    } catch (err) {
      btn.disabled = false;
      btn.style.opacity = '1';
      alert('Sign-in failed: ' + err.message);
    }
  };
}

// =============================================
//  DATE
// =============================================
function setTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// =============================================
//  CONNECTION STATUS
// =============================================
async function updateConnectionStatus() {
  const statusEl = document.getElementById('connection-status');
  if (!statusEl) return;

  if (!isConnected()) {
    statusEl.className = 'conn-status disconnected';
    statusEl.querySelector('.conn-text').textContent = 'Not Connected';
    return;
  }

  const ok = await testConnection();
  statusEl.className = `conn-status ${ok ? 'connected' : 'disconnected'}`;
  statusEl.querySelector('.conn-text').textContent = ok ? 'Connected' : 'DB Error';
}

// =============================================
//  NAVIGATION / ROUTING
// =============================================
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      history.pushState(null, '', `#${view}`);
      navigate(view);
    });
  });

  window.addEventListener('popstate', () => {
    const hash = location.hash.replace('#', '') || 'dashboard';
    navigate(hash);
  });

  // Also intercept any <a href="#view"> links rendered inside views
  document.getElementById('main-content').addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const parts = link.getAttribute('href').slice(1).split('?');
    const view  = parts[0];
    const params = Object.fromEntries(new URLSearchParams(parts[1] || ''));
    if (['dashboard','journal','trades','weekly','analytics','settings','playbook','strategy-tracker','notes'].includes(view)) {
      e.preventDefault();
      history.pushState(null, '', `#${view}`);
      navigate(view, params);
    }
  });
}

async function navigate(view, params = {}) {
  currentView = view;

  // Update nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Page title map
  const titles = {
    dashboard: 'Dashboard', journal: 'Daily Journal', trades: 'Trade Log',
    weekly: 'Weekly Review', analytics: 'Analytics', settings: 'Settings', playbook: 'Playbook',
    'strategy-tracker': 'Strategy Tracker', notes: 'Notes'
  };
  document.getElementById('page-title').textContent = titles[view] || view;

  // Check connection (skip for settings)
  if (view !== 'settings' && !isConnected()) {
    renderSetupScreen();
    return;
  }

  const container = document.getElementById('main-content');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div></div>`;

  try {
    switch (view) {
      case 'dashboard':  await renderDashboard(container); break;
      case 'journal':    await renderJournal(container, params.date); break;
      case 'trades':     await renderTrades(container); break;
      case 'weekly':     await renderWeekly(container); break;
      case 'analytics':  await renderAnalytics(container); break;
      case 'settings':   await renderSettings(container); break;
      case 'playbook':          await renderPlaybook(container); break;
      case 'strategy-tracker': await renderStrategyTracker(container); break;
      case 'notes':            await renderNotes(container); break;
      default:                 await renderDashboard(container);
    }
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <h3 class="text-loss">Something went wrong</h3>
        <p>${err.message}</p>
        <button class="btn btn-ghost mt-16" onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
}

function renderSetupScreen() {
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div class="setup-hero">
      <div class="setup-icon">📈</div>
      <h2>Welcome to TradeJournal Pro</h2>
      <p>To get started, connect your Supabase database. This takes about 5 minutes and is completely free.</p>
      <a href="#settings" class="btn btn-primary btn-lg">Set Up Database</a>
    </div>
  `;
}

// =============================================
//  SIDEBAR TOGGLE (mobile)
// =============================================
function setupSidebarToggle() {
  const toggle  = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!toggle || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  toggle.onclick = () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar();

  // Close when overlay (outside) is tapped
  if (overlay) overlay.onclick = closeSidebar;

  // Close when a nav item is tapped
  sidebar.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });
}

// =============================================
//  TRADE MODAL
// =============================================
function setupTradeModal() {
  const modal   = document.getElementById('trade-modal');
  const form    = document.getElementById('trade-form');
  const backdrop = document.getElementById('trade-modal-backdrop');
  const closeBtn  = document.getElementById('close-trade-modal');
  const cancelBtn = document.getElementById('cancel-trade-modal');
  const saveBtn   = document.getElementById('save-trade-btn');
  const addTradeBtn = document.getElementById('add-trade-btn');

  if (addTradeBtn) addTradeBtn.onclick = () => openTradeModal(null, null);
  if (closeBtn)  closeBtn.onclick  = closeTradeModal;
  if (cancelBtn) cancelBtn.onclick = closeTradeModal;
  if (backdrop)  backdrop.onclick  = closeTradeModal;
  if (saveBtn)   saveBtn.onclick   = handleSaveTrade;

  // Trade type toggle (Taken / Missed)
  document.querySelectorAll('.trade-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.trade-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('trade-type').value = btn.dataset.type;
      applyTradeTypeUI(btn.dataset.type);
    };
  });

  // Direction toggle
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('trade-direction').value = btn.dataset.dir;
    };
  });

  // Signal confluence toggles
  document.querySelectorAll('#trade-form .signal-toggle[data-signal]').forEach(btn => {
    btn.onclick = () => {
      btn.classList.toggle('active');
      updateTradeSignalScore();
    };
  });

  // All toggle
  document.getElementById('trade-signal-all')?.addEventListener('click', () => {
    const btns = document.querySelectorAll('#trade-form .signal-toggle[data-signal]');
    const allActive = Array.from(btns).every(b => b.classList.contains('active'));
    btns.forEach(b => b.classList.toggle('active', !allActive));
    updateTradeSignalScore();
  });

  // Tilt meter label
  const tiltSlider = document.getElementById('trade-tilt');
  const tiltValEl  = document.getElementById('tilt-value');
  if (tiltSlider) {
    tiltSlider.oninput = () => {
      tiltValEl.textContent = tiltLabel(tiltSlider.value);
      tiltValEl.className   = `tilt-display ${tiltClass(tiltSlider.value)}`;
    };
  }

  // Auto-calculate R from P&L ÷ Risk
  ['trade-pnl','trade-risk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = recalcR;
  });

  // See EURUSD — copy signals/psychology from another trade on same day
  document.getElementById('see-eurusd-btn')?.addEventListener('click', async () => {
    const picker = document.getElementById('see-trade-picker');
    if (!picker) return;
    if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }

    const date = document.getElementById('trade-date')?.value;
    if (!date) { alert('Set a date first.'); return; }

    picker.innerHTML = '<div style="padding:8px 12px;color:var(--text-muted)">Loading…</div>';
    picker.style.display = 'block';

    try {
      const { getTrades } = await import('./db.js');
      const trades = await getTrades({ date });
      if (!trades.length) {
        picker.innerHTML = '<div style="padding:8px 12px;color:var(--text-muted)">No trades found for this date.</div>';
        return;
      }
      picker.innerHTML = trades.map(t => {
        const r   = calcTradeR(t);
        const pnl = parseFloat(t.pnl);
        const pnlStr = isNaN(pnl) ? '—' : formatCurrency(pnl);
        const pnlColor = isNaN(pnl) ? 'var(--text-muted)' : pnl >= 0 ? 'var(--profit)' : 'var(--loss)';
        const rColor   = r === null ? 'var(--text-muted)' : r >= 0 ? 'var(--profit)' : 'var(--loss)';
        return `
        <div class="see-trade-item" data-id="${t.id}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center" onmouseenter="this.style.background='var(--bg-hover)'" onmouseleave="this.style.background=''">
          <span style="font-weight:600">${t.symbol || '—'}</span>
          <span style="color:var(--text-muted);font-size:0.85em">${t.direction || ''}</span>
          <span style="color:var(--text-muted);font-size:0.85em">${t.strategy || ''}</span>
          <span style="margin-left:auto;display:flex;gap:10px;align-items:center">
            <span style="font-size:0.85em;color:${pnlColor}">${pnlStr}</span>
            <span style="font-size:0.85em;font-weight:600;color:${rColor}">${formatR(r)}</span>
            <span style="font-size:0.85em;color:var(--text-muted)">${t.outcome || ''}</span>
          </span>
        </div>`;
      }).join('');

      picker.querySelectorAll('.see-trade-item').forEach(item => {
        item.addEventListener('click', () => {
          const trade = trades.find(t => t.id === item.dataset.id);
          if (!trade) return;

          // Copy signal confluence
          const signalBtns = document.querySelectorAll('#trade-form .signal-toggle[data-signal]');
          const tradeSignals = Array.isArray(trade.signals) ? trade.signals : [];
          signalBtns.forEach(b => b.classList.toggle('active', tradeSignals.includes(b.dataset.signal)));
          updateTradeSignalScore();

          // Copy psychology
          const tiltEl = document.getElementById('trade-tilt');
          if (tiltEl && trade.tilt != null) {
            tiltEl.value = trade.tilt;
            const tiltValEl = document.getElementById('tilt-value');
            if (tiltValEl) {
              tiltValEl.textContent = tiltLabel(trade.tilt);
              tiltValEl.className   = `tilt-display ${tiltClass(trade.tilt)}`;
            }
          }
          const emotionEl = document.getElementById('trade-emotion');
          if (emotionEl && trade.emotion) emotionEl.value = trade.emotion;

          const planVal = trade.followed_plan || '';
          document.querySelectorAll('input[name="followed-plan"]').forEach(r => {
            r.checked = r.value === planVal;
          });

          const mistakeEl = document.getElementById('trade-mistake-type');
          if (mistakeEl) mistakeEl.value = trade.mistake_type || '';

          // Set notes
          const notesEl = document.getElementById('trade-notes');
          if (notesEl) notesEl.value = 'See EURUSD';

          picker.style.display = 'none';
        });
      });
    } catch (err) {
      picker.innerHTML = `<div style="padding:8px 12px;color:var(--danger)">${err.message}</div>`;
    }
  });

  // Screenshot upload
  setupScreenshotZone();
}

function applyTradeTypeUI(type) {
  const isMissed = type === 'missed';

  // Banner
  const banner = document.getElementById('missed-banner');
  if (banner) banner.style.display = isMissed ? 'block' : 'none';

  // Whole Prices & Risk section — hide for missed (no P&L, no entry/exit)
  const pricesSection = document.getElementById('section-prices-risk');
  if (pricesSection) pricesSection.style.display = isMissed ? 'none' : '';

  // Whole Psychology section — hide for missed
  const psychSection = document.getElementById('section-psychology');
  if (psychSection) psychSection.style.display = isMissed ? 'none' : '';

  // Outcome field — hide for missed
  const outcomeGroup = document.getElementById('outcome-group');
  if (outcomeGroup) outcomeGroup.style.display = isMissed ? 'none' : '';

  // Why not taken — show only for missed
  const missedReasonGroup = document.getElementById('missed-reason-group');
  if (missedReasonGroup) missedReasonGroup.style.display = isMissed ? 'block' : 'none';
}

function recalcR() {
  const pnl  = parseFloat(document.getElementById('trade-pnl')?.value);
  const risk = parseFloat(document.getElementById('trade-risk')?.value);
  const rrEl = document.getElementById('trade-rr');
  if (!rrEl) return;
  if (!isNaN(pnl) && !isNaN(risk) && risk > 0) {
    rrEl.value = (pnl / risk).toFixed(2);
  } else {
    rrEl.value = '';
  }
}

function setupScreenshotZone() {
  const zone     = document.getElementById('screenshot-zone');
  const input    = document.getElementById('screenshot-input');
  const prompt   = document.getElementById('upload-prompt');
  const previews = document.getElementById('screenshot-previews');

  if (!zone || !input) return;

  // Click to browse
  prompt?.addEventListener('click', () => input.click());

  // File input change
  input.addEventListener('change', () => addFiles(Array.from(input.files)));

  // Drag & drop
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  });
}

function addFiles(files) {
  const previews = document.getElementById('screenshot-previews');
  const prompt   = document.getElementById('upload-prompt');
  if (!previews) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target.result;
      pendingScreenshots.push({ file, localUrl: url, uploaded: false });
      const idx = pendingScreenshots.length - 1;

      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.idx = idx;
      item.innerHTML = `
        <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
        <button class="preview-remove" onclick="removePreview(${idx})">×</button>
      `;
      previews.appendChild(item);
      updateTradeModalViewAll();
    };
    reader.readAsDataURL(file);
  });
}

window.removePreview = function(idx) {
  pendingScreenshots[idx] = null;
  const item = document.querySelector(`.preview-item[data-idx="${idx}"]`);
  if (item) item.remove();
  updateTradeModalViewAll();
};

export function openTradeModal(id = null, date = null, callback = null) {
  tradeCallback = callback;
  pendingScreenshots = [];

  const modal    = document.getElementById('trade-modal');
  const titleEl  = document.getElementById('trade-modal-title');
  const previews = document.getElementById('screenshot-previews');
  const prompt   = document.getElementById('upload-prompt');

  // Reset form
  document.getElementById('trade-form').reset();
  document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('trade-direction').value = '';
  document.getElementById('trade-id').value = '';
  if (previews) previews.innerHTML = '';
  if (prompt)   prompt.style.display = '';

  // Reset signal toggles
  document.querySelectorAll('#trade-form .signal-toggle[data-signal]').forEach(b => b.classList.remove('active'));
  updateTradeSignalScore();

  // Reset trade type to "taken"
  document.querySelectorAll('.trade-type-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('type-taken')?.classList.add('active');
  document.getElementById('trade-type').value = 'taken';
  applyTradeTypeUI('taken');

  // Default date
  document.getElementById('trade-date').value = date || todayString();

  // Default tilt
  const tiltSlider = document.getElementById('trade-tilt');
  const tiltValEl  = document.getElementById('tilt-value');
  if (tiltSlider) { tiltSlider.value = 7; }
  if (tiltValEl)  { tiltValEl.textContent = tiltLabel(7); tiltValEl.className = 'tilt-display high'; }

  if (id) {
    titleEl.textContent = 'Edit Trade';
    loadTradeIntoModal(id);
  } else {
    titleEl.textContent = 'Add Trade';
  }

  // Populate symbol suggestions from past trades
  getDistinctSymbols().then(symbols => {
    const list = document.getElementById('symbol-datalist');
    if (list) list.innerHTML = symbols.map(s => `<option value="${s}">`).join('');
  });

  modal.classList.remove('hidden');
  document.querySelector('#trade-modal .modal-body')?.scrollTo(0, 0);
}

async function loadTradeIntoModal(id) {
  try {
    const trade = await getTradeById(id);
    if (!trade) return;

    document.getElementById('trade-id').value         = trade.id;

    // Restore trade type toggle
    const tradeType = trade.trade_type || 'taken';
    document.querySelectorAll('.trade-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.trade-type-btn[data-type="${tradeType}"]`)?.classList.add('active');
    document.getElementById('trade-type').value = tradeType;
    applyTradeTypeUI(tradeType);

    document.getElementById('trade-date').value        = trade.date || '';
    document.getElementById('trade-symbol').value      = trade.symbol || '';
    document.getElementById('trade-direction').value   = trade.direction || '';
    document.getElementById('trade-size').value        = trade.size ?? '';
    document.getElementById('trade-pnl').value         = trade.pnl ?? '';
    document.getElementById('trade-risk').value        = trade.risk_amount ?? '';
    // R = actual P&L ÷ Risk (recalculate fresh; old stored value may be planned R:R)
    const rPnl  = parseFloat(trade.pnl);
    const rRisk = parseFloat(trade.risk_amount);
    document.getElementById('trade-rr').value = (!isNaN(rPnl) && !isNaN(rRisk) && rRisk > 0)
      ? (rPnl / rRisk).toFixed(2) : '';
    document.getElementById('trade-strategy').value    = trade.strategy || '';
    document.getElementById('trade-timeframe').value   = trade.timeframe || '';
    document.getElementById('trade-session').value     = trade.session || '';
    document.getElementById('trade-outcome').value     = trade.outcome || 'open';
    document.getElementById('trade-emotion').value     = trade.emotion || '';
    document.getElementById('trade-tags').value        = Array.isArray(trade.tags) ? trade.tags.join(', ') : (trade.tags || '');
    document.getElementById('trade-notes').value       = trade.notes || '';
    document.getElementById('trade-mistakes').value    = trade.mistakes || '';
    document.getElementById('trade-mistake-type').value  = trade.mistake_type || '';
    document.getElementById('trade-missed-reason').value = trade.missed_reason || '';

    // Direction button
    if (trade.direction) {
      const btn = document.querySelector(`.dir-btn[data-dir="${trade.direction}"]`);
      if (btn) btn.classList.add('active');
    }

    // Followed plan radio
    if (trade.followed_plan) {
      const radio = document.querySelector(`input[name="followed-plan"][value="${trade.followed_plan}"]`);
      if (radio) radio.checked = true;
    }

    // Signal confluence
    document.querySelectorAll('#trade-form .signal-toggle[data-signal]').forEach(b => b.classList.remove('active'));
    if (Array.isArray(trade.signals)) {
      document.querySelectorAll('#trade-form .signal-toggle[data-signal]').forEach(btn => {
        if (trade.signals.includes(btn.dataset.signal)) btn.classList.add('active');
      });
    }
    updateTradeSignalScore();

    // Tilt
    if (trade.tilt_meter) {
      const slider = document.getElementById('trade-tilt');
      const valEl  = document.getElementById('tilt-value');
      if (slider) slider.value = trade.tilt_meter;
      if (valEl)  {
        valEl.textContent = tiltLabel(trade.tilt_meter);
        valEl.className   = `tilt-display ${tiltClass(trade.tilt_meter)}`;
      }
    }

    // Screenshots
    if (trade.screenshots?.length) {
      const previews = document.getElementById('screenshot-previews');
      trade.screenshots.forEach(url => {
        pendingScreenshots.push({ url, localUrl: url, uploaded: true });
        const idx = pendingScreenshots.length - 1;
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.dataset.idx = idx;
        item.innerHTML = `
          <img src="${url}" alt="screenshot" onclick="window._viewPreview(this)">
          <button class="preview-remove" onclick="removePreview(${idx})">×</button>
        `;
        if (previews) previews.appendChild(item);
      });
      updateTradeModalViewAll();
    }
  } catch (err) {
    showToast('Failed to load trade: ' + err.message, 'error');
  }
}

function closeTradeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
  const picker = document.getElementById('see-trade-picker');
  if (picker) picker.style.display = 'none';
  pendingScreenshots = [];
  tradeCallback = null;
}

async function handleSaveTrade() {
  const saveBtn = document.getElementById('save-trade-btn');
  const symbol  = document.getElementById('trade-symbol').value.trim();
  const direction = document.getElementById('trade-direction').value;

  const tradeType = document.getElementById('trade-type').value || 'taken';
  if (!symbol)                        { showToast('Symbol is required', 'error'); return; }
  if (!direction && tradeType !== 'missed') { showToast('Select Long or Short', 'error'); return; }
  if (tradeType === 'taken') {
    const pnlVal  = document.getElementById('trade-pnl')?.value;
    const riskVal = document.getElementById('trade-risk')?.value;
    if (pnlVal === '' || pnlVal === null || pnlVal === undefined) { showToast('P&L is required', 'error'); return; }
    if (!riskVal || parseFloat(riskVal) <= 0) { showToast('Risk amount is required (must be > 0)', 'error'); return; }
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Upload any new screenshots
    const screenshotUrls = [];
    for (const item of pendingScreenshots) {
      if (!item) continue;
      if (item.uploaded) {
        screenshotUrls.push(item.url);
      } else {
        try {
          const url = await uploadScreenshot(item.file);
          screenshotUrls.push(url);
        } catch (uploadErr) {
          showToast(`Screenshot upload failed: ${uploadErr.message}`, 'warning');
          // Continue saving trade without this screenshot
        }
      }
    }

    const followedPlan = document.querySelector('input[name="followed-plan"]:checked')?.value || '';

    const pnlVal  = parseFloatOrNull('trade-pnl');
    const riskVal = parseFloatOrNull('trade-risk');
    const rVal    = (pnlVal !== null && riskVal !== null && riskVal > 0)
      ? parseFloat((pnlVal / riskVal).toFixed(2)) : null;

    const tradeData = {
      id:           document.getElementById('trade-id').value || undefined,
      date:         document.getElementById('trade-date').value,
      symbol:       symbol.toUpperCase(),
      direction,
      size:         parseFloatOrNull('trade-size'),
      pnl:          pnlVal,
      risk_amount:  riskVal,
      risk_reward:  rVal,
      strategy:     document.getElementById('trade-strategy').value.trim() || null,
      timeframe:    document.getElementById('trade-timeframe').value || null,
      session:      document.getElementById('trade-session').value || null,
      outcome:      tradeType === 'missed' ? null : (document.getElementById('trade-outcome').value || null),
      emotion:      document.getElementById('trade-emotion').value || null,
      tilt_meter:   parseInt(document.getElementById('trade-tilt').value) || null,
      followed_plan: followedPlan || null,
      trade_type:    document.getElementById('trade-type').value || 'taken',
      missed_reason: document.getElementById('trade-missed-reason').value || null,
      mistake_type:  document.getElementById('trade-mistake-type').value || null,
      tags:          document.getElementById('trade-tags').value,
      notes:         document.getElementById('trade-notes').value.trim() || null,
      mistakes:      document.getElementById('trade-mistakes').value.trim() || null,
      screenshots:   screenshotUrls,
      signals:       Array.from(document.querySelectorAll('#trade-form .signal-toggle[data-signal].active')).map(b => b.dataset.signal),
    };

    if (!tradeData.id) delete tradeData.id;

    await saveTrade(tradeData);
    showToast('Trade saved successfully', 'success');
    closeTradeModal();

    // Refresh current view
    if (tradeCallback) {
      await tradeCallback();
    } else {
      await navigate(currentView || 'dashboard');
    }

  } catch (err) {
    showToast('Failed to save trade: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Trade';
  }
}

function parseFloatOrNull(id) {
  const val = document.getElementById(id)?.value;
  if (!val && val !== 0) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// =============================================
//  IMAGE MODAL / CAROUSEL
// =============================================
function setupImageModal() {
  const backdrop = document.getElementById('image-modal-backdrop');
  const closeBtn = document.getElementById('close-image-modal');
  const prevBtn  = document.getElementById('image-modal-prev');
  const nextBtn  = document.getElementById('image-modal-next');

  if (backdrop) backdrop.onclick = closeImageModal;
  if (closeBtn) closeBtn.onclick = closeImageModal;
  if (prevBtn)  prevBtn.onclick  = () => _galleryStep(-1);
  if (nextBtn)  nextBtn.onclick  = () => _galleryStep(1);

  const gridClose = document.getElementById('close-gallery-grid');
  if (gridClose) gridClose.onclick = closeGalleryGrid;

  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('image-modal');
    const open  = modal && !modal.classList.contains('hidden');
    if (e.key === 'Escape') { closeTradeModal(); closeImageModal(); closeGalleryGrid(); }
    if (open && e.key === 'ArrowLeft')  { e.preventDefault(); _galleryStep(-1); }
    if (open && e.key === 'ArrowRight') { e.preventDefault(); _galleryStep(1); }
  });
}

function _galleryStep(dir) {
  if (_gallery.length < 2) return;
  _galleryIdx = (_galleryIdx + dir + _gallery.length) % _gallery.length;
  _showImageAt(_galleryIdx);
}

function _showImageAt(idx) {
  const modal   = document.getElementById('image-modal');
  const img     = document.getElementById('modal-image');
  const prevBtn = document.getElementById('image-modal-prev');
  const nextBtn = document.getElementById('image-modal-next');
  const counter = document.getElementById('image-modal-counter');
  if (!modal || !img) return;

  img.src = _gallery[idx];

  const multi = _gallery.length > 1;
  if (prevBtn) prevBtn.style.display = multi ? '' : 'none';
  if (nextBtn) nextBtn.style.display = multi ? '' : 'none';
  if (counter) counter.textContent   = multi ? `${idx + 1} / ${_gallery.length}` : '';

  modal.classList.remove('hidden');
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  if (modal) modal.classList.add('hidden');
}

// Open a single image or a gallery. gallery is optional array of URLs.
window._viewImage = function(url, gallery) {
  _gallery    = Array.isArray(gallery) && gallery.length ? gallery : [url];
  _galleryIdx = _gallery.indexOf(url);
  if (_galleryIdx < 0) _galleryIdx = 0;
  _showImageAt(_galleryIdx);
};

// Open carousel by collecting sibling images from the nearest container.
window._viewPreview = function(imgEl) {
  const previewContainer = imgEl.closest('.screenshot-previews');
  const gridContainer    = imgEl.closest('.screenshots-grid');
  if (previewContainer) {
    const imgs  = Array.from(previewContainer.querySelectorAll('.preview-item img'));
    _gallery    = imgs.map(i => i.src);
    _galleryIdx = imgs.indexOf(imgEl);
  } else if (gridContainer) {
    const imgs  = Array.from(gridContainer.querySelectorAll('img'));
    _gallery    = imgs.map(i => i.src);
    _galleryIdx = imgs.indexOf(imgEl);
  } else {
    _gallery    = [imgEl.src];
    _galleryIdx = 0;
  }
  if (_galleryIdx < 0) _galleryIdx = 0;
  _showImageAt(_galleryIdx);
};

// =============================================
//  FULLSCREEN GALLERY GRID
// =============================================
let _gridGalleryUrls = [];

function _openGalleryGrid(urls) {
  if (!urls.length) return;
  const modal = document.getElementById('gallery-grid-modal');
  const body  = document.getElementById('gallery-grid-body');
  if (!modal || !body) return;

  const n    = urls.length;
  const cols = n === 1 ? 1 : n <= 2 ? 2 : n === 3 ? 3 : 2;
  const rows = Math.ceil(n / cols);

  body.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  body.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  body.innerHTML = urls.map((url, i) => `
    <div style="overflow:hidden;cursor:zoom-in;border-radius:6px;background:#111;display:flex;align-items:center;justify-content:center"
         onclick="window._galleryGridClick(${i})">
      <img src="${url}" alt="screenshot ${i + 1}"
           style="width:100%;height:100%;object-fit:contain;display:block;transition:transform 0.15s">
    </div>
  `).join('');

  _gridGalleryUrls = urls;
  modal.style.display = 'flex';
}

function closeGalleryGrid() {
  const modal = document.getElementById('gallery-grid-modal');
  if (modal) modal.style.display = 'none';
}

window._galleryGridClick = function(idx) {
  closeGalleryGrid();
  _gallery    = _gridGalleryUrls;
  _galleryIdx = idx;
  _showImageAt(_galleryIdx);
};

function updateTradeModalViewAll() {
  const count = document.querySelectorAll('#screenshot-previews .preview-item img').length;
  const btn   = document.getElementById('trade-modal-view-all');
  if (btn) btn.style.display = count > 1 ? '' : 'none';
}

window._openTradeModalGallery = function() {
  const urls = Array.from(document.querySelectorAll('#screenshot-previews .preview-item img')).map(i => i.src);
  _openGalleryGrid(urls);
};

window._openGalleryFromSection = function(btn) {
  const section = btn.closest('[data-ss-section]');
  if (!section) return;
  const urls = Array.from(section.querySelectorAll('.screenshots-grid img')).map(i => i.src);
  _openGalleryGrid(urls);
};

// =============================================
//  TOAST NOTIFICATIONS
// =============================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Expose for strategy datalist
window._getStrategies = async function() {
  try {
    const { getTrades } = await import('./db.js');
    const trades = await getTrades({ limit: 200 });
    const strats = [...new Set(trades.map(t => t.strategy).filter(Boolean))];
    const list = document.getElementById('strategy-list');
    if (list) list.innerHTML = strats.map(s => `<option value="${s}">`).join('');
  } catch {}
};

// Load strategies into datalist when modal opens
document.getElementById('trade-strategy')?.addEventListener('focus', window._getStrategies);
