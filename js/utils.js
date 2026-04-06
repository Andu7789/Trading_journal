// =============================================
//  UTILITIES
// =============================================

export function formatCurrency(val, decimals = 2, currency = '$') {
  if (val === null || val === undefined || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  const abs = Math.abs(n).toFixed(decimals);
  const formatted = parseFloat(abs).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (n >= 0 ? '' : '-') + currency + formatted;
}

export function formatPnL(val) {
  if (val === null || val === undefined || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  const formatted = formatCurrency(n);
  return formatted;
}

export function pnlClass(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return 'text-muted';
  return n > 0 ? 'text-profit' : 'text-loss';
}

export function pnlSign(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '';
  return n > 0 ? '+' : '';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function todayString() {
  const d = new Date();
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function getWeekRange(date) {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDay(); // 0 = Sun, 1 = Mon
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end:   sunday.toISOString().split('T')[0],
    monday,
    sunday
  };
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function calcRR(entry, sl, tp, direction) {
  if (!entry || !sl || !tp) return null;
  const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp);
  if (isNaN(e) || isNaN(s) || isNaN(t) || s === e) return null;
  const risk   = Math.abs(e - s);
  const reward = Math.abs(t - e);
  if (risk === 0) return null;
  return (reward / risk).toFixed(2);
}

export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] ?? 'Unknown';
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

export function sum(arr, key) {
  return arr.reduce((s, item) => s + (parseFloat(item[key]) || 0), 0);
}

export function avg(arr, key) {
  if (!arr.length) return 0;
  return sum(arr, key) / arr.length;
}

export function calcStats(trades) {
  const closed = trades.filter(t => t.outcome && t.outcome !== 'open');
  const wins   = closed.filter(t => t.outcome === 'win');
  const losses = closed.filter(t => t.outcome === 'loss');
  const bes    = closed.filter(t => t.outcome === 'breakeven');
  const totalPnl = sum(closed, 'pnl');
  const grossWins  = sum(wins, 'pnl');
  const grossLoss  = Math.abs(sum(losses, 'pnl'));
  const avgWin     = wins.length ? grossWins / wins.length : 0;
  const avgLoss    = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? (grossWins / grossLoss) : wins.length ? Infinity : 0;

  return {
    total: closed.length,
    open:  trades.filter(t => !t.outcome || t.outcome === 'open').length,
    wins:  wins.length,
    losses: losses.length,
    bes:   bes.length,
    winRate: closed.length ? (wins.length / closed.length * 100) : 0,
    totalPnl,
    grossWins,
    grossLoss,
    avgWin,
    avgLoss,
    profitFactor,
    bestTrade:  closed.length ? Math.max(...closed.map(t => parseFloat(t.pnl) || 0)) : 0,
    worstTrade: closed.length ? Math.min(...closed.map(t => parseFloat(t.pnl) || 0)) : 0,
    avgRR: avg(closed.filter(t => t.risk_reward), 'risk_reward'),
  };
}

export function getOutcomeBadge(outcome, tradeType) {
  if (tradeType === 'missed') return '<span class="badge badge-missed">MISSED</span>';
  const map = {
    win:        '<span class="badge badge-profit">WIN</span>',
    loss:       '<span class="badge badge-loss">LOSS</span>',
    breakeven:  '<span class="badge badge-be">B/E</span>',
    open:       '<span class="badge badge-open">OPEN</span>',
  };
  return map[outcome] || '<span class="badge badge-be">—</span>';
}

export function getDirectionBadge(dir) {
  if (dir === 'long')  return '<span class="badge badge-long">▲ LONG</span>';
  if (dir === 'short') return '<span class="badge badge-short">▼ SHORT</span>';
  return '—';
}

export function getEmotionChip(emotion) {
  if (!emotion) return '';
  const labels = {
    calm: 'Calm', confident: 'Confident', anxious: 'Anxious',
    fearful: 'Fearful', greedy: 'Greedy', frustrated: 'Frustrated',
    fomo: 'FOMO', revenge: 'Revenge', bored: 'Bored', overconfident: 'Overconfident'
  };
  const cls = `emotion-${emotion}`;
  return `<span class="emotion-chip ${cls}">${labels[emotion] || emotion}</span>`;
}

export function tiltLabel(val) {
  const v = parseInt(val);
  if (v <= 3) return `${v} – Tilted`;
  if (v <= 6) return `${v} – OK`;
  return `${v} – Good`;
}

export function tiltClass(val) {
  const v = parseInt(val);
  if (v <= 3) return 'low';
  if (v <= 6) return 'mid';
  return 'high';
}

export function getStrategies(trades) {
  const strats = trades.map(t => t.strategy).filter(Boolean);
  return [...new Set(strats)];
}

export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function nl2br(str) {
  if (!str) return '';
  return escapeHtml(str).replace(/\n/g, '<br>');
}
