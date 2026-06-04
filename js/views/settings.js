// =============================================
//  SETTINGS VIEW
// =============================================
import { initSupabase, testConnection, deleteAllTrades, deleteAllStrategySetups, deleteAllData } from '../db.js';
import { showToast } from '../app.js';

export async function renderSettings(container) {
  document.getElementById('page-title').textContent = 'Settings';

  const savedUrl  = localStorage.getItem('tj_supabase_url') || '';
  const savedKey  = localStorage.getItem('tj_supabase_key') || '';
  const savedBalance = localStorage.getItem('tj_account_balance') || '';
  const savedCurrency = localStorage.getItem('tj_currency') || 'USD';
  const isConnected = !!savedUrl && !!savedKey;

  // Ensure a ntfy topic exists
  if (!localStorage.getItem('tj_ntfy_topic')) {
    localStorage.setItem('tj_ntfy_topic', generateNtfyTopic());
  }
  const ntfyTopic = localStorage.getItem('tj_ntfy_topic');
  const ntfyUrl = `https://ntfy.sh/${ntfyTopic}`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Settings</h1>
    </div>

    <!-- Supabase Setup -->
    <div class="settings-card">
      <div class="settings-title">Supabase Database</div>
      <div class="settings-subtitle">Connect your Supabase project to store all trades and journal entries in the cloud</div>

      ${!isConnected ? `
      <div style="background:var(--warning-dim);border:1px solid rgba(255,179,71,0.3);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--warning)">
        ⚠️ Not connected — follow the steps below to set up your database
      </div>
      ` : ''}

      <div class="setup-steps">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-content">
            Go to <strong>supabase.com</strong> and create a free account, then create a new project.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-content">
            In your Supabase project, open the <strong>SQL Editor</strong> and run the contents of <strong>schema.sql</strong> (included in this project) to create the required tables.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-content">
            Go to <strong>Storage</strong> in your Supabase project and create a bucket named <strong>screenshots</strong>. Set it to <strong>Public</strong>.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">4</div>
          <div class="step-content">
            Go to <strong>Settings → API</strong> in Supabase. Copy your <strong>Project URL</strong> and <strong>anon public key</strong> and paste them below.
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="form-grid-2" style="margin-bottom:16px">
        <div class="form-group">
          <label class="form-label required">Supabase Project URL</label>
          <input type="url" id="s-url" class="form-input" placeholder="https://xxxxxxxxxxxx.supabase.co" value="${savedUrl}">
        </div>
        <div class="form-group">
          <label class="form-label required">Supabase Anon Key</label>
          <input type="password" id="s-key" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${savedKey}">
          <span class="form-hint">This key is stored in your browser's local storage only. It is never sent anywhere except directly to Supabase.</span>
        </div>
      </div>

      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="save-supabase-btn">Save &amp; Connect</button>
        <button class="btn btn-ghost" id="test-connection-btn">Test Connection</button>
        <span id="conn-result" style="font-size:13px"></span>
      </div>
    </div>

    <!-- Account Settings -->
    <div class="settings-card">
      <div class="settings-title">Account Preferences</div>
      <div class="settings-subtitle">Personalise your journal</div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Starting Account Balance ($)</label>
          <input type="number" id="s-balance" class="form-input" placeholder="10000" value="${savedBalance}">
          <span class="form-hint">Used for % return calculations in analytics</span>
        </div>
        <div class="form-group">
          <label class="form-label">Display Currency</label>
          <select id="s-currency" class="form-input">
            <option value="USD" ${savedCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
            <option value="GBP" ${savedCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
            <option value="EUR" ${savedCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
            <option value="AUD" ${savedCurrency === 'AUD' ? 'selected' : ''}>AUD (A$)</option>
            <option value="CAD" ${savedCurrency === 'CAD' ? 'selected' : ''}>CAD (C$)</option>
            <option value="JPY" ${savedCurrency === 'JPY' ? 'selected' : ''}>JPY (¥)</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px" id="save-prefs-btn">Save Preferences</button>
    </div>

    <!-- Data Management -->
    <div class="settings-card">
      <div class="settings-title">Data Management</div>
      <div class="settings-subtitle">Export or manage your data</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="export-csv-btn">Export Trades (CSV)</button>
        <button class="btn btn-ghost" id="export-json-btn">Export All Data (JSON)</button>
      </div>
    </div>

    <!-- TradingView Alerts -->
    <div class="settings-card">
      <div class="settings-title">TradingView Alerts</div>
      <div class="settings-subtitle">Get real-time TradingView alerts on your phone via the free <strong>ntfy</strong> app — no TradingView app required</div>

      <div class="setup-steps" style="margin-bottom:20px">
        <div class="setup-step">
          <div class="step-num">1</div>
          <div class="step-content">
            Install the <strong>ntfy</strong> app on your phone — search <strong>"ntfy"</strong> on the App Store or Google Play (it's free and open-source).
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">2</div>
          <div class="step-content">
            In the ntfy app tap <strong>+</strong> and subscribe to your topic name shown below. Anyone who knows this topic can send you notifications, so keep it private.
          </div>
        </div>
        <div class="setup-step">
          <div class="step-num">3</div>
          <div class="step-content">
            In TradingView, open an alert → enable <strong>Webhook URL</strong> → paste the URL below. Set the alert message to plain text, e.g.:<br>
            <code style="display:inline-block;margin-top:6px;font-family:var(--font-mono);font-size:11px;background:var(--bg-input);padding:4px 8px;border-radius:4px;color:var(--text-primary)">{{ticker}} alert at {{close}} on {{exchange}}:{{interval}}</code>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div style="margin-bottom:16px">
        <label class="form-label">Your ntfy Topic Name</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="ntfy-topic-input" class="form-input" style="max-width:280px;font-family:var(--font-mono);font-size:13px" value="${ntfyTopic}">
          <button class="btn btn-ghost btn-sm" id="regen-topic-btn">Regenerate</button>
        </div>
        <span class="form-hint">Change this to any unique string. Avoid common words — it's your private notification channel.</span>
      </div>

      <div style="margin-bottom:20px">
        <label class="form-label">Webhook URL (paste this into TradingView)</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="ntfy-url-display" class="form-input" style="max-width:380px;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)" value="${ntfyUrl}" readonly>
          <button class="btn btn-ghost btn-sm" id="copy-ntfy-url-btn">Copy URL</button>
        </div>
      </div>

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="save-ntfy-btn">Save Topic</button>
        <button class="btn btn-ghost" id="test-ntfy-btn">Send Test Notification</button>
        <span id="ntfy-result" style="font-size:13px"></span>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="settings-card" style="border-color:rgba(255,71,87,0.35)">
      <div class="settings-title" style="color:var(--loss)">Danger Zone</div>
      <div class="settings-subtitle">These actions are permanent and cannot be undone. All associated screenshots are deleted from storage too.</div>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">

        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-input);border-radius:var(--radius);border:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:600">Delete All Trades</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Removes every entry in the trade log and their screenshots</div>
          </div>
          <button class="btn btn-danger btn-sm" id="del-trades-btn">Delete Trades</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-input);border-radius:var(--radius);border:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:600">Delete All Strategy Setups</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Removes every entry in the Strategy Tracker and their screenshots</div>
          </div>
          <button class="btn btn-danger btn-sm" id="del-setups-btn">Delete Setups</button>
        </div>

        <div style="padding:16px;background:rgba(255,71,87,0.07);border-radius:var(--radius);border:1px solid rgba(255,71,87,0.4)">
          <div style="font-size:13px;font-weight:700;color:var(--loss);margin-bottom:4px">Delete Everything</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Permanently deletes all trades, strategy setups, journal entries, notes, watchlist ideas, playbook entries, and every screenshot. The app will be completely empty.</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="del-confirm-input" class="form-input" style="max-width:200px" placeholder='Type "DELETE ALL"'>
            <button class="btn btn-danger" id="del-all-btn">Delete Everything</button>
          </div>
        </div>

      </div>
    </div>

    <!-- About -->
    <div class="settings-card">
      <div class="settings-title">About TradeJournal Pro</div>
      <div class="settings-subtitle">Version 1.0 — Built for serious traders</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">
        <p>A professional-grade trading journal for Forex and crypto traders. Built with HTML, JavaScript, and Supabase.</p>
        <p style="margin-top:8px">To add new features or report issues, open the codebase in your editor and modify the relevant view files in <code style="font-family:var(--font-mono);font-size:12px;background:var(--bg-input);padding:1px 6px;border-radius:3px">js/views/</code>.</p>
      </div>
    </div>
  `;

  document.getElementById('save-supabase-btn').onclick = saveSupabaseConfig;
  document.getElementById('test-connection-btn').onclick = runConnectionTest;
  document.getElementById('save-prefs-btn').onclick = savePreferences;
  document.getElementById('export-csv-btn').onclick = exportCsv;
  document.getElementById('export-json-btn').onclick = exportJson;
  document.getElementById('del-trades-btn').onclick = handleDeleteTrades;
  document.getElementById('del-setups-btn').onclick = handleDeleteSetups;
  document.getElementById('del-all-btn').onclick = handleDeleteAll;

  document.getElementById('save-ntfy-btn').onclick = saveNtfyTopic;
  document.getElementById('regen-topic-btn').onclick = regenNtfyTopic;
  document.getElementById('copy-ntfy-url-btn').onclick = copyNtfyUrl;
  document.getElementById('test-ntfy-btn').onclick = sendTestNotification;
}

async function saveSupabaseConfig() {
  const url = document.getElementById('s-url').value.trim();
  const key = document.getElementById('s-key').value.trim();

  if (!url || !key) {
    showToast('Please enter both URL and anon key', 'error');
    return;
  }

  localStorage.setItem('tj_supabase_url', url);
  localStorage.setItem('tj_supabase_key', key);

  const ok = initSupabase();
  if (!ok) { showToast('Failed to initialize client', 'error'); return; }

  await runConnectionTest();
}

async function runConnectionTest() {
  const resultEl = document.getElementById('conn-result');
  if (resultEl) {
    resultEl.textContent = 'Testing...';
    resultEl.style.color = 'var(--warning)';
  }

  // Re-init in case keys were just saved
  const url = document.getElementById('s-url')?.value.trim() || localStorage.getItem('tj_supabase_url');
  const key = document.getElementById('s-key')?.value.trim() || localStorage.getItem('tj_supabase_key');
  if (url && key) {
    localStorage.setItem('tj_supabase_url', url);
    localStorage.setItem('tj_supabase_key', key);
    initSupabase();
  }

  const ok = await testConnection();

  // Update sidebar connection status
  const connStatus = document.getElementById('connection-status');
  if (connStatus) {
    connStatus.className = `conn-status ${ok ? 'connected' : 'disconnected'}`;
    connStatus.querySelector('.conn-text').textContent = ok ? 'Connected' : 'Not Connected';
  }

  if (resultEl) {
    resultEl.textContent = ok ? '✓ Connected successfully' : '✗ Connection failed — check your URL and key';
    resultEl.style.color = ok ? 'var(--profit)' : 'var(--loss)';
  }

  if (ok) {
    showToast('Connected to Supabase', 'success');
  } else {
    showToast('Connection failed — check URL and key', 'error');
  }
}

function savePreferences() {
  const balance  = document.getElementById('s-balance').value;
  const currency = document.getElementById('s-currency').value;
  if (balance)  localStorage.setItem('tj_account_balance', balance);
  if (currency) localStorage.setItem('tj_currency', currency);
  showToast('Preferences saved', 'success');
}

async function exportCsv() {
  try {
    const { getTrades } = await import('../db.js');
    const trades = await getTrades();
    if (!trades.length) { showToast('No trades to export', 'info'); return; }

    const headers = ['date','symbol','direction','entry_price','exit_price','size','stop_loss','take_profit','pnl','risk_reward','outcome','strategy','timeframe','session','emotion','tilt_meter','tags','notes','mistakes'];
    const rows = trades.map(t => headers.map(h => {
      const v = t[h];
      if (Array.isArray(v)) return `"${v.join(';')}"`;
      if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
      return v ?? '';
    }).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    downloadFile(csv, `trades-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    showToast('Trades exported as CSV', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

async function exportJson() {
  try {
    const { getTrades, getJournalEntries } = await import('../db.js');
    const today = new Date().toISOString().split('T')[0];
    const [trades, entries] = await Promise.all([
      getTrades(),
      getJournalEntries('2000-01-01', today)
    ]);
    const data = { exported: new Date().toISOString(), trades, journal_entries: entries };
    downloadFile(JSON.stringify(data, null, 2), `trading-journal-${today}.json`, 'application/json');
    showToast('All data exported as JSON', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

async function handleDeleteTrades() {
  const btn = document.getElementById('del-trades-btn');
  if (!confirm('Permanently delete ALL trades and their screenshots? This cannot be undone.')) return;
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await deleteAllTrades();
    showToast('All trades deleted', 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete Trades';
  }
}

async function handleDeleteSetups() {
  const btn = document.getElementById('del-setups-btn');
  if (!confirm('Permanently delete ALL strategy setups and their screenshots? This cannot be undone.')) return;
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await deleteAllStrategySetups();
    showToast('All strategy setups deleted', 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete Setups';
  }
}

async function handleDeleteAll() {
  const input = document.getElementById('del-confirm-input').value.trim();
  if (input !== 'DELETE ALL') {
    showToast('Type DELETE ALL to confirm', 'error');
    return;
  }
  if (!confirm('This will permanently delete ALL data and every screenshot. There is no undo. Proceed?')) return;
  const btn = document.getElementById('del-all-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await deleteAllData();
    document.getElementById('del-confirm-input').value = '';
    showToast('All data deleted — the app is now empty', 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete Everything';
  }
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- ntfy helpers ---

function generateNtfyTopic() {
  const words = ['swift','delta','chart','signal','rally','pivot','spike','range','trend','alpha','bravo','echo','foxtrot','zulu','kilo'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const rand = () => Math.floor(Math.random() * 9000 + 1000);
  return `tj-${pick()}-${pick()}-${rand()}`;
}

function saveNtfyTopic() {
  const input = document.getElementById('ntfy-topic-input').value.trim().replace(/\s+/g, '-');
  if (!input) { showToast('Topic name cannot be empty', 'error'); return; }
  localStorage.setItem('tj_ntfy_topic', input);
  document.getElementById('ntfy-url-display').value = `https://ntfy.sh/${input}`;
  showToast('ntfy topic saved', 'success');
}

function regenNtfyTopic() {
  const newTopic = generateNtfyTopic();
  document.getElementById('ntfy-topic-input').value = newTopic;
  document.getElementById('ntfy-url-display').value = `https://ntfy.sh/${newTopic}`;
}

async function copyNtfyUrl() {
  const url = document.getElementById('ntfy-url-display').value;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Webhook URL copied', 'success');
  } catch {
    document.getElementById('ntfy-url-display').select();
    showToast('Select and copy the URL manually', 'info');
  }
}

async function sendTestNotification() {
  const topic = document.getElementById('ntfy-topic-input').value.trim();
  if (!topic) { showToast('Save a topic name first', 'error'); return; }

  const btn = document.getElementById('test-ntfy-btn');
  const result = document.getElementById('ntfy-result');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  result.textContent = '';

  try {
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Title': 'TradingView Alert Test',
        'Priority': 'high',
        'Tags': 'chart_with_upwards_trend',
      },
      body: 'Test alert from TradeJournal Pro — your TradingView alerts are set up correctly!',
    });

    if (res.ok) {
      result.textContent = '✓ Notification sent — check your phone';
      result.style.color = 'var(--profit)';
    } else {
      result.textContent = `✗ Failed (HTTP ${res.status})`;
      result.style.color = 'var(--loss)';
    }
  } catch (err) {
    result.textContent = '✗ Network error — check your connection';
    result.style.color = 'var(--loss)';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Test Notification';
  }
}
