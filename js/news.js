// =============================================
//  NEWS CALENDAR — ForexFactory feed
// =============================================

const CACHE_KEY     = 'tj_news_cache';
const CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour

const FEEDS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

// Currencies we care about (matches user's pairs + USD as driver)
const WATCHED = ['GBP', 'EUR', 'USD'];

// ---- Public API ----

/**
 * Returns news events for a given YYYY-MM-DD date.
 * Filters to WATCHED currencies, High + Medium impact only.
 * Returns [] on any error so callers never need to handle failure.
 */
export async function getNewsForDate(date) {
  const all = await fetchAll();
  return all.filter(e => {
    const eDate = (e.date || '').slice(0, 10);
    return eDate === date && WATCHED.includes(e.country) &&
           ['High', 'Medium'].includes(e.impact);
  }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

/**
 * Returns all high-impact events for a date range (for calendar dots).
 */
export async function getNewsForRange(startDate, endDate) {
  const all = await fetchAll();
  return all.filter(e => {
    const eDate = (e.date || '').slice(0, 10);
    return eDate >= startDate && eDate <= endDate &&
           WATCHED.includes(e.country) && e.impact === 'High';
  });
}

// ---- Internal ----

async function fetchAll() {
  // Return from cache if fresh
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    }
  } catch {}

  // Fetch both weeks in parallel
  try {
    const results = await Promise.allSettled(
      FEEDS.map(url => fetch(url).then(r => r.ok ? r.json() : []))
    );

    const data = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => Array.isArray(r.value) ? r.value : []);

    // Cache it
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}

    return data;
  } catch {
    return [];
  }
}
