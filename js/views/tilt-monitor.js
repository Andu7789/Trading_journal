// =============================================
//  TILT MONITOR VIEW
// =============================================
import {
  getTiltMonitorSessions,
  getTiltMonitorSessionDetails,
  saveTiltMonitorSession,
  saveTiltMonitorSample,
  saveTiltMonitorLabel,
  saveTiltMonitorAlert,
  deleteTiltMonitorSession,
} from '../db.js';
import { showToast } from '../app.js';
import { escapeHtml, formatDate, todayString } from '../utils.js';

let sessions = [];
let selectedSessionId = null;
let selectedDetails = { samples: [], labels: [], alerts: [] };
let activeSession = null;
let mediaStream = null;
let sampleTimer = null;
let previousFrame = null;
let baselineSamples = [];
let baseline = null;
let lastAlertAt = 0;
let faceDetector = null;
let currentAlert = null;

const SAMPLE_MS = 5000;
const DEFAULT_THRESHOLD = 70;
const DEFAULT_COOLDOWN_SECONDS = 60;
const ALERT_SOUND_KEY = 'tj_tilt_alert_sound';
const ALERT_THRESHOLD_KEY = 'tj_tilt_alert_threshold';
const ALERT_COOLDOWN_KEY = 'tj_tilt_alert_cooldown_seconds';
const TELEGRAM_ENABLED_KEY = 'tj_tilt_telegram_enabled';
const TELEGRAM_TOKEN_KEY = 'tj_tilt_telegram_token';
const TELEGRAM_CHAT_ID_KEY = 'tj_tilt_telegram_chat_id';
const LABELS = [
  { value: 'calm', label: 'Calm' },
  { value: 'focused', label: 'Focused' },
  { value: 'frustrated', label: 'Frustrated' },
  { value: 'fomo', label: 'FOMO' },
  { value: 'revenge', label: 'Revenge' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'false_positive', label: 'False positive' },
];

export async function renderTiltMonitor(container) {
  document.getElementById('page-title').textContent = 'Tilt Monitor';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Tilt Monitor</h1>
        <div class="page-header-sub">Local webcam signals, manual labels, and alert history for trading state review</div>
      </div>
      <div class="emotion-header-actions">
        <button class="btn btn-ghost" id="tilt-request-notifications">Enable Alerts</button>
        <button class="btn btn-primary" id="tilt-session-toggle">Start Monitoring</button>
      </div>
    </div>

    <div id="tilt-monitor-content">
      <div class="loading-screen"><div class="loading-spinner"></div></div>
    </div>
  `;

  document.getElementById('tilt-session-toggle').onclick = () => {
    if (activeSession) stopMonitoring();
    else startMonitoring();
  };
  document.getElementById('tilt-request-notifications').onclick = requestNotifications;

  setupFaceDetector();
  await loadTiltMonitor();
}

async function loadTiltMonitor() {
  const content = document.getElementById('tilt-monitor-content');
  if (!content) return;

  try {
    sessions = await getTiltMonitorSessions({ limit: 20 });
    if (!selectedSessionId || !sessions.some(session => session.id === selectedSessionId)) {
      selectedSessionId = sessions[0]?.id || null;
    }
    selectedDetails = selectedSessionId
      ? await getTiltMonitorSessionDetails(selectedSessionId)
      : { samples: [], labels: [], alerts: [] };

    content.innerHTML = buildTiltMonitor();
    wireTiltMonitor();
    attachVideoStream();
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <h3 class="text-loss">Tilt Monitor needs its database tables</h3>
        <p>${escapeHtml(err.message)}</p>
        <p class="text-muted mt-8">Run the tilt monitor migration in Supabase, then reload this page.</p>
      </div>
    `;
  }
}

function buildTiltMonitor() {
  const session = getSelectedSession();
  const activeRisk = getLatestRisk();
  const alertThreshold = getAlertThreshold();
  const totalLabels = selectedDetails.labels.length;
  const totalAlerts = selectedDetails.alerts.length;
  const avgRisk = averageRisk(selectedDetails.samples);

  return `
    <div class="tilt-monitor-layout">
      <div class="tilt-monitor-main">
        <div class="stats-grid emotion-map-stats">
          <div class="stat-card ${activeRisk >= alertThreshold ? 'loss' : 'primary'}">
            <div class="stat-label">Live Risk</div>
            <div class="stat-value ${activeRisk >= alertThreshold ? 'text-loss' : 'text-primary'}">${activeRisk}</div>
            <div class="stat-sub">${activeSession ? `Alert threshold ${alertThreshold}` : 'Start a session to sample'}</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Session Avg</div>
            <div class="stat-value text-warning">${avgRisk}</div>
            <div class="stat-sub">${selectedDetails.samples.length} saved samples</div>
          </div>
          <div class="stat-card secondary">
            <div class="stat-label">Labels</div>
            <div class="stat-value text-secondary">${totalLabels}</div>
            <div class="stat-sub">Manual training signals</div>
          </div>
          <div class="stat-card loss">
            <div class="stat-label">Alerts</div>
            <div class="stat-value text-loss">${totalAlerts}</div>
            <div class="stat-sub">High-risk moments</div>
          </div>
        </div>

        <div class="card tilt-live-card">
          <div class="card-header">
            <div>
              <div class="card-title">Live Monitor</div>
              <div class="card-subtitle">${activeSession ? 'Camera is sampled locally every 5 seconds' : 'Start monitoring when your trading session begins'}</div>
            </div>
            <span class="tilt-status-pill ${activeSession ? 'active' : ''}">${activeSession ? 'Active' : 'Idle'}</span>
          </div>
          <div class="tilt-live-grid">
            <div class="tilt-video-wrap">
              <video id="tilt-video" autoplay playsinline muted></video>
              <canvas id="tilt-canvas" width="160" height="120"></canvas>
              <div class="tilt-video-empty">${activeSession ? 'Waiting for camera' : 'Camera off'}</div>
            </div>
            <div class="tilt-live-panel">
              <div class="tilt-risk-meter">
                <div class="tilt-risk-fill" id="tilt-risk-fill" style="width:${activeRisk}%"></div>
              </div>
              <div class="tilt-live-readout">
                <span id="tilt-risk-label">${riskLabel(activeRisk)}</span>
                <strong id="tilt-risk-number">${activeRisk}</strong>
              </div>
              <div id="tilt-alert-feedback-slot">
                ${buildAlertFeedback()}
              </div>
              <div class="tilt-signal-grid">
                <div><span>Face</span><strong id="tilt-face-status">--</strong></div>
                <div><span>Motion</span><strong id="tilt-motion-score">--</strong></div>
                <div><span>Light</span><strong id="tilt-brightness-score">--</strong></div>
                <div><span>Deviation</span><strong id="tilt-tension-score">--</strong></div>
              </div>
              <div class="tilt-live-actions">
                <button class="btn btn-ghost" id="tilt-mark-calm" ${activeSession ? '' : 'disabled'}>Mark Calm</button>
                <button class="btn btn-danger" id="tilt-mark-tilt" ${activeSession ? '' : 'disabled'}>Mark Tilt</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${session ? formatSessionTitle(session) : 'No sessions yet'}</div>
              <div class="card-subtitle">${session ? sessionSummary(session) : 'Your monitored sessions will appear here'}</div>
            </div>
          </div>
          ${buildTimeline()}
        </div>
      </div>

      <div class="tilt-monitor-side">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Label Current Moment</div>
              <div class="card-subtitle">This is the training data that matters</div>
            </div>
          </div>
          ${buildLabelForm()}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Alert Channels</div>
              <div class="card-subtitle">Sound locally and message Telegram on high risk</div>
            </div>
          </div>
          ${buildAlertSettings()}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Recent Sessions</div>
              <div class="card-subtitle">Review labels and alerts</div>
            </div>
          </div>
          ${buildSessionList()}
        </div>
      </div>
    </div>
  `;
}

function buildAlertSettings() {
  const soundEnabled = localStorage.getItem(ALERT_SOUND_KEY) !== 'off';
  const threshold = getAlertThreshold();
  const cooldownSeconds = getAlertCooldownSeconds();
  const telegramEnabled = localStorage.getItem(TELEGRAM_ENABLED_KEY) === 'on';
  const token = localStorage.getItem(TELEGRAM_TOKEN_KEY) || '';
  const chatId = localStorage.getItem(TELEGRAM_CHAT_ID_KEY) || '';

  return `
    <label class="checkbox-row mb-16">
      <input type="checkbox" id="tilt-alert-sound" ${soundEnabled ? 'checked' : ''}>
      <span>Play alert sound</span>
    </label>
    <label class="checkbox-row mb-16">
      <input type="checkbox" id="tilt-telegram-enabled" ${telegramEnabled ? 'checked' : ''}>
      <span>Send Telegram message</span>
    </label>
    <div class="form-grid-2 mb-16">
      <div class="form-group">
        <label class="form-label">Sensitivity</label>
        <input type="number" id="tilt-alert-threshold" class="form-input" min="40" max="95" step="5" value="${threshold}">
        <span class="form-hint">Lower number = earlier alerts.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Cooldown</label>
        <select id="tilt-alert-cooldown" class="form-select">
          ${[30, 60, 120, 300].map(value => `<option value="${value}" ${cooldownSeconds === value ? 'selected' : ''}>${formatCooldown(value)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group mb-16">
      <label class="form-label">Bot token</label>
      <input type="password" id="tilt-telegram-token" class="form-input" placeholder="123456:ABC..." value="${escapeHtml(token)}">
      <span class="form-hint">Create a bot with BotFather, then paste the token here. Stored in this browser only.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Chat ID</label>
      <input type="text" id="tilt-telegram-chat-id" class="form-input" placeholder="123456789" value="${escapeHtml(chatId)}">
    </div>
    <div class="tilt-live-actions mt-16">
      <button class="btn btn-ghost" id="tilt-save-alert-settings">Save Alerts</button>
      <button class="btn btn-ghost" id="tilt-test-alerts">Test Alert</button>
    </div>
  `;
}

function buildAlertFeedback() {
  if (!currentAlert) return '';

  return `
    <div class="tilt-alert-feedback">
      <div>
        <strong>High-risk alert fired</strong>
        <span>${escapeHtml(currentAlert.reason)} · risk ${currentAlert.risk}</span>
      </div>
      <div class="tilt-feedback-actions">
        <button class="btn btn-ghost btn-xs tilt-alert-feedback-btn" data-label="tilt" data-intensity="8">Real Tilt</button>
        <button class="btn btn-ghost btn-xs tilt-alert-feedback-btn" data-label="fomo" data-intensity="7">FOMO</button>
        <button class="btn btn-ghost btn-xs tilt-alert-feedback-btn" data-label="revenge" data-intensity="8">Revenge</button>
        <button class="btn btn-ghost btn-xs tilt-alert-feedback-btn" data-label="false_positive" data-intensity="2">False Positive</button>
        <button class="btn btn-ghost btn-xs tilt-alert-feedback-btn" data-label="calm" data-intensity="2">I Was Fine</button>
      </div>
    </div>
  `;
}

function buildLabelForm() {
  const disabled = activeSession ? '' : 'disabled';
  return `
    <div class="form-group mb-16">
      <label class="form-label">State</label>
      <select id="tilt-label-type" class="form-select" ${disabled}>
        ${LABELS.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group mb-16">
      <label class="form-label">Intensity</label>
      <input type="range" id="tilt-label-intensity" min="1" max="10" value="5" ${disabled}>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="tilt-label-notes" class="form-textarea" rows="3" placeholder="What happened? Loss streak, FOMO, revenge impulse, felt fine, etc." ${disabled}></textarea>
    </div>
    <button class="btn btn-primary btn-block mt-16" id="tilt-save-label" ${disabled}>Save Label</button>
  `;
}

function buildSessionList() {
  if (!sessions.length) {
    return `
      <div class="empty-state" style="padding:24px 0">
        <p>No monitor sessions yet.</p>
      </div>
    `;
  }

  return `
    <div class="tilt-session-list">
      ${sessions.map(session => `
        <button class="tilt-session-item ${session.id === selectedSessionId ? 'active' : ''}" data-id="${session.id}">
          <span>${formatSessionTitle(session)}</span>
          <small>${sessionSummary(session)}</small>
        </button>
      `).join('')}
    </div>
    ${selectedSessionId ? '<button class="btn btn-danger btn-block mt-16" id="tilt-delete-session">Delete Selected</button>' : ''}
  `;
}

function buildTimeline() {
  if (!selectedSessionId) {
    return `
      <div class="empty-state" style="padding:40px">
        <h3>No tilt monitor data yet</h3>
        <p>Start a session, label moments, and alerts will become reviewable here.</p>
      </div>
    `;
  }

  const rows = [
    ...selectedDetails.labels.map(item => ({ type: 'label', time: item.labeled_at, item })),
    ...selectedDetails.alerts.map(item => ({ type: 'alert', time: item.alerted_at, item })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time));

  if (!rows.length) {
    return `
      <div class="empty-state" style="padding:40px">
        <h3>No labels or alerts yet</h3>
        <p>Use live labels while trading to teach the monitor what your states look like.</p>
      </div>
      ${buildSampleStrip()}
    `;
  }

  return `
    ${buildSampleStrip()}
    <div class="tilt-event-list">
      ${rows.map(row => {
        const label = row.type === 'alert'
          ? `Alert at risk ${row.item.risk_score}`
          : getLabelText(row.item.label);
        const note = row.item.notes || row.item.message || '';
        return `
          <div class="tilt-event ${row.type}">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <span>${formatTime(row.time)}</span>
            </div>
            <p>${note ? escapeHtml(note) : 'No notes'}</p>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildSampleStrip() {
  const samples = selectedDetails.samples.slice(-60);
  if (!samples.length) return '';

  return `
    <div class="tilt-sample-strip" aria-label="Risk samples">
      ${samples.map(sample => `
        <span style="height:${Math.max(6, sample.risk_score || 0)}%" title="${formatTime(sample.captured_at)} risk ${sample.risk_score || 0}"></span>
      `).join('')}
    </div>
  `;
}

function wireTiltMonitor() {
  document.getElementById('tilt-save-label')?.addEventListener('click', handleSaveLabel);
  document.getElementById('tilt-mark-calm')?.addEventListener('click', () => quickLabel('calm', 2, 'Marked calm during live session'));
  document.getElementById('tilt-mark-tilt')?.addEventListener('click', () => quickLabel('tilt', 8, 'Marked tilt during live session'));
  document.getElementById('tilt-save-alert-settings')?.addEventListener('click', saveAlertSettings);
  document.getElementById('tilt-test-alerts')?.addEventListener('click', testAlertChannels);
  document.querySelectorAll('.tilt-alert-feedback-btn').forEach(btn => {
    btn.onclick = () => handleAlertFeedback(btn.dataset.label, parseInt(btn.dataset.intensity || '5', 10));
  });

  document.querySelectorAll('.tilt-session-item').forEach(btn => {
    btn.onclick = async () => {
      selectedSessionId = btn.dataset.id;
      await loadTiltMonitor();
    };
  });

  document.getElementById('tilt-delete-session')?.addEventListener('click', async () => {
    if (!selectedSessionId || !confirm('Delete this monitor session and all samples, labels, and alerts?')) return;
    try {
      await deleteTiltMonitorSession(selectedSessionId);
      selectedSessionId = null;
      showToast('Tilt monitor session deleted', 'success');
      await loadTiltMonitor();
    } catch (err) {
      showToast('Failed to delete session: ' + err.message, 'error');
    }
  });
}

async function startMonitoring() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    activeSession = await saveTiltMonitorSession({
      date: todayString(),
      started_at: new Date().toISOString(),
      settings: { sample_ms: SAMPLE_MS, alert_threshold: getAlertThreshold(), alert_cooldown_seconds: getAlertCooldownSeconds(), raw_video_stored: false },
      notes: '',
    });
    selectedSessionId = activeSession.id;
    baselineSamples = [];
    baseline = null;
    previousFrame = null;
    currentAlert = null;
    lastAlertAt = 0;

    updateTopbarSessionButton();
    await loadTiltMonitor();
    sampleTimer = setInterval(sampleFrame, SAMPLE_MS);
    await sampleFrame();
    showToast('Tilt monitoring started', 'success');
  } catch (err) {
    stopMedia();
    showToast('Camera could not start: ' + err.message, 'error');
  }
}

async function stopMonitoring() {
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = null;

  try {
    if (activeSession) {
      await saveTiltMonitorSession({
        id: activeSession.id,
        ended_at: new Date().toISOString(),
        baseline: baseline || {},
      });
    }
    showToast('Tilt monitoring stopped', 'success');
  } catch (err) {
    showToast('Failed to close monitor session: ' + err.message, 'error');
  } finally {
    activeSession = null;
    currentAlert = null;
    stopMedia();
    updateTopbarSessionButton();
    await loadTiltMonitor();
  }
}

async function sampleFrame() {
  const video = document.getElementById('tilt-video');
  const canvas = document.getElementById('tilt-canvas');
  if (!activeSession || !video || !canvas || !video.videoWidth) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const metrics = await analyzeFrame(video, image);
  const risk = calculateRisk(metrics);

  updateLiveReadout(metrics, risk);
  selectedDetails.samples.push({ risk_score: risk, captured_at: new Date().toISOString(), ...metrics });

  try {
    await saveTiltMonitorSample({
      session_id: activeSession.id,
      captured_at: new Date().toISOString(),
      risk_score: risk,
      face_present: metrics.face_present,
      face_count: metrics.face_count,
      motion_score: metrics.motion_score,
      brightness: metrics.brightness,
      tension_score: metrics.tension_score,
      metrics,
    });
  } catch (err) {
    console.warn('Tilt sample save failed:', err);
  }

  if (risk >= getAlertThreshold() && Date.now() - lastAlertAt > getAlertCooldownSeconds() * 1000) {
    await triggerTiltAlert(risk, metrics);
  }
}

async function analyzeFrame(video, image) {
  let faceCount = 0;
  if (faceDetector) {
    try {
      const faces = await faceDetector.detect(video);
      faceCount = faces.length;
    } catch {
      faceCount = 0;
    }
  }

  const data = image.data;
  let brightness = 0;
  let motion = 0;
  const step = 16;

  for (let i = 0; i < data.length; i += step * 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    brightness += value;
    if (previousFrame) {
      const prev = (previousFrame[i] + previousFrame[i + 1] + previousFrame[i + 2]) / 3;
      motion += Math.abs(value - prev);
    }
  }

  const count = data.length / (step * 4);
  brightness = Math.round(brightness / count);
  motion = Math.round((motion / count) * 2);
  previousFrame = new Uint8ClampedArray(data);

  const raw = {
    face_present: faceDetector ? faceCount > 0 : true,
    face_count: faceDetector ? faceCount : null,
    motion_score: Math.min(100, motion),
    brightness,
  };

  if (baselineSamples.length < 6) {
    baselineSamples.push(raw);
    baseline = {
      motion_score: average(baselineSamples, 'motion_score'),
      brightness: average(baselineSamples, 'brightness'),
    };
  }

  const motionDelta = baseline ? Math.abs(raw.motion_score - baseline.motion_score) : 0;
  const lightDelta = baseline ? Math.abs(raw.brightness - baseline.brightness) : 0;
  const tension = Math.min(100, Math.round((motionDelta * 0.9) + (lightDelta * 0.45)));

  return {
    ...raw,
    tension_score: tension,
    baseline_ready: baselineSamples.length >= 6,
  };
}

function calculateRisk(metrics) {
  let risk = 12;
  risk += metrics.tension_score * 0.65;
  risk += metrics.motion_score * 0.25;
  if (metrics.face_present === false) risk += 12;
  if (!metrics.baseline_ready) risk = Math.min(risk, 35);
  return Math.max(0, Math.min(100, Math.round(risk)));
}

async function triggerTiltAlert(risk, metrics = {}) {
  lastAlertAt = Date.now();
  const message = 'Pattern resembles a high-risk trading state. Pause before the next decision.';
  const reason = describeRiskReason(metrics);
  currentAlert = {
    risk,
    reason,
    createdAt: new Date().toISOString(),
  };

  try {
    await saveTiltMonitorAlert({
      session_id: activeSession.id,
      alerted_at: new Date().toISOString(),
      risk_score: risk,
      message: `${message} ${reason}`,
      acknowledged: false,
    });
  } catch (err) {
    console.warn('Tilt alert save failed:', err);
  }

  showToast(message, 'warning');
  renderAlertFeedbackSlot();
  playAlertSound();
  sendTelegramAlert(risk, message, reason).then(result => {
    if (!result.ok) console.warn('Telegram alert not sent:', result.reason);
  });

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Tilt risk rising', { body: message });
  }
}

function saveAlertSettings() {
  const soundEnabled = document.getElementById('tilt-alert-sound')?.checked;
  const telegramEnabled = document.getElementById('tilt-telegram-enabled')?.checked;
  const threshold = clamp(parseInt(document.getElementById('tilt-alert-threshold')?.value || DEFAULT_THRESHOLD, 10), 40, 95);
  const cooldownSeconds = parseInt(document.getElementById('tilt-alert-cooldown')?.value || DEFAULT_COOLDOWN_SECONDS, 10);
  const token = document.getElementById('tilt-telegram-token')?.value.trim() || '';
  const chatId = document.getElementById('tilt-telegram-chat-id')?.value.trim() || '';

  localStorage.setItem(ALERT_SOUND_KEY, soundEnabled ? 'on' : 'off');
  localStorage.setItem(ALERT_THRESHOLD_KEY, String(threshold));
  localStorage.setItem(ALERT_COOLDOWN_KEY, String(cooldownSeconds));
  localStorage.setItem(TELEGRAM_ENABLED_KEY, telegramEnabled ? 'on' : 'off');
  if (token) localStorage.setItem(TELEGRAM_TOKEN_KEY, token);
  else localStorage.removeItem(TELEGRAM_TOKEN_KEY);
  if (chatId) localStorage.setItem(TELEGRAM_CHAT_ID_KEY, chatId);
  else localStorage.removeItem(TELEGRAM_CHAT_ID_KEY);

  showToast('Alert settings saved', 'success');
}

async function testAlertChannels() {
  saveAlertSettings();
  playAlertSound();
  const result = await sendTelegramAlert(88, 'Test alert from Tilt Monitor.', 'Manual test from Alert Channels.');
  showToast(result.ok ? 'Test alert sent to Telegram' : `Sound tested. Telegram not sent: ${result.reason}`, result.ok ? 'success' : 'warning');
}

function playAlertSound() {
  if (localStorage.getItem(ALERT_SOUND_KEY) === 'off') return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    gain.connect(ctx.destination);

    [660, 440].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.18);
      osc.connect(gain);
      osc.start(ctx.currentTime + index * 0.18);
      osc.stop(ctx.currentTime + index * 0.18 + 0.16);
    });

    setTimeout(() => ctx.close(), 700);
  } catch (err) {
    console.warn('Alert sound failed:', err);
  }
}

async function sendTelegramAlert(risk, message, reason = '') {
  if (localStorage.getItem(TELEGRAM_ENABLED_KEY) !== 'on') {
    return { ok: false, reason: 'Telegram is switched off' };
  }

  const token = localStorage.getItem(TELEGRAM_TOKEN_KEY);
  const chatId = localStorage.getItem(TELEGRAM_CHAT_ID_KEY);
  if (!token) return { ok: false, reason: 'missing bot token' };
  if (!chatId) return { ok: false, reason: 'missing chat ID' };

  const text = [
    'Tilt Monitor alert',
    `Risk score: ${risk}`,
    reason ? `Trigger: ${reason}` : '',
    message,
    'Action: pause before the next trade and label this alert in the journal.',
    `Time: ${new Date().toLocaleString('en-GB')}`,
  ].filter(Boolean).join('\n');

  try {
    const body = new URLSearchParams();
    body.set('chat_id', chatId);
    body.set('text', text);
    body.set('disable_notification', 'false');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.warn('Telegram alert failed:', detail);
      return { ok: false, reason: parseTelegramError(detail, res.status) };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Telegram alert failed:', err);
    return { ok: false, reason: err.message || 'network/browser request failed' };
  }
}

function parseTelegramError(detail, status) {
  try {
    const parsed = JSON.parse(detail);
    return parsed.description || `Telegram HTTP ${status}`;
  } catch {
    return detail || `Telegram HTTP ${status}`;
  }
}

async function handleSaveLabel() {
  if (!activeSession) return;
  const label = document.getElementById('tilt-label-type')?.value;
  const intensity = parseInt(document.getElementById('tilt-label-intensity')?.value || '5', 10);
  const notes = document.getElementById('tilt-label-notes')?.value.trim() || '';
  await quickLabel(label, intensity, notes);
}

async function handleAlertFeedback(label, intensity) {
  if (!currentAlert) return;
  const text = `Alert feedback: ${currentAlert.reason}; risk ${currentAlert.risk}`;
  await quickLabel(label, intensity, text);
  currentAlert = null;
  renderAlertFeedbackSlot();
}

async function quickLabel(label, intensity, notes) {
  if (!activeSession) {
    showToast('Start monitoring before labeling a moment', 'warning');
    return;
  }

  try {
    await saveTiltMonitorLabel({
      session_id: activeSession.id,
      labeled_at: new Date().toISOString(),
      label,
      intensity,
      notes,
    });
    showToast('Moment labeled', 'success');
    document.getElementById('tilt-label-notes').value = '';
    await loadTiltMonitor();
  } catch (err) {
    showToast('Failed to save label: ' + err.message, 'error');
  }
}

function renderAlertFeedbackSlot() {
  const slot = document.getElementById('tilt-alert-feedback-slot');
  if (!slot) return;
  slot.innerHTML = buildAlertFeedback();
  slot.querySelectorAll('.tilt-alert-feedback-btn').forEach(btn => {
    btn.onclick = () => handleAlertFeedback(btn.dataset.label, parseInt(btn.dataset.intensity || '5', 10));
  });
}

function attachVideoStream() {
  const video = document.getElementById('tilt-video');
  if (video && mediaStream) {
    video.srcObject = mediaStream;
  }
}

function stopMedia() {
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  mediaStream = null;
}

function updateLiveReadout(metrics, risk) {
  const riskFill = document.getElementById('tilt-risk-fill');
  const riskLabelEl = document.getElementById('tilt-risk-label');
  const riskNumber = document.getElementById('tilt-risk-number');
  const faceStatus = document.getElementById('tilt-face-status');
  const motionScore = document.getElementById('tilt-motion-score');
  const brightnessScore = document.getElementById('tilt-brightness-score');
  const tensionScore = document.getElementById('tilt-tension-score');

  if (riskFill) riskFill.style.width = `${risk}%`;
  if (riskLabelEl) riskLabelEl.textContent = riskLabel(risk);
  if (riskNumber) riskNumber.textContent = risk;
  if (faceStatus) faceStatus.textContent = metrics.face_present === false ? 'Lost' : 'Seen';
  if (motionScore) motionScore.textContent = metrics.motion_score;
  if (brightnessScore) brightnessScore.textContent = metrics.brightness;
  if (tensionScore) tensionScore.textContent = metrics.tension_score;
}

function updateTopbarSessionButton() {
  const btn = document.getElementById('tilt-session-toggle');
  if (!btn) return;
  btn.textContent = activeSession ? 'Stop Monitoring' : 'Start Monitoring';
  btn.classList.toggle('btn-danger', Boolean(activeSession));
  btn.classList.toggle('btn-primary', !activeSession);
}

function setupFaceDetector() {
  if ('FaceDetector' in window && !faceDetector) {
    try {
      faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      faceDetector = null;
    }
  }
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    showToast('Desktop notifications are not available in this browser', 'warning');
    return;
  }
  const permission = await Notification.requestPermission();
  showToast(permission === 'granted' ? 'Desktop alerts enabled' : 'Desktop alerts not enabled', permission === 'granted' ? 'success' : 'warning');
}

function getSelectedSession() {
  return sessions.find(session => session.id === selectedSessionId) || null;
}

function getLatestRisk() {
  const sample = selectedDetails.samples[selectedDetails.samples.length - 1];
  return sample?.risk_score || 0;
}

function averageRisk(samples) {
  if (!samples.length) return 0;
  return Math.round(samples.reduce((sum, sample) => sum + (sample.risk_score || 0), 0) / samples.length);
}

function average(list, key) {
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, item) => sum + (item[key] || 0), 0) / list.length);
}

function riskLabel(risk) {
  const threshold = getAlertThreshold();
  if (risk >= threshold) return 'Pause zone';
  if (risk >= Math.max(35, threshold - 25)) return 'Watch zone';
  return 'Normal range';
}

function getAlertThreshold() {
  return clamp(parseInt(localStorage.getItem(ALERT_THRESHOLD_KEY) || DEFAULT_THRESHOLD, 10), 40, 95);
}

function getAlertCooldownSeconds() {
  const saved = parseInt(localStorage.getItem(ALERT_COOLDOWN_KEY) || DEFAULT_COOLDOWN_SECONDS, 10);
  return [30, 60, 120, 300].includes(saved) ? saved : DEFAULT_COOLDOWN_SECONDS;
}

function formatCooldown(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

function clamp(value, min, max) {
  if (isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function describeRiskReason(metrics) {
  const parts = [];
  if (metrics.tension_score >= 55) parts.push('tension above baseline');
  if (metrics.motion_score >= 45) parts.push('movement changed sharply');
  if (metrics.face_present === false) parts.push('face not visible');
  if (metrics.brightness <= 45 || metrics.brightness >= 210) parts.push('lighting shifted');
  if (!parts.length) parts.push('risk score crossed threshold');
  return parts.join(', ');
}

function getLabelText(value) {
  return LABELS.find(item => item.value === value)?.label || value || 'Label';
}

function formatSessionTitle(session) {
  return `${formatDate(session.date)} ${formatTime(session.started_at)}`;
}

function sessionSummary(session) {
  const start = formatTime(session.started_at);
  const end = session.ended_at ? formatTime(session.ended_at) : 'active';
  return `${start} to ${end}`;
}

function formatTime(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
