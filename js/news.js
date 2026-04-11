// =============================================
//  NEWS CALENDAR — ForexFactory feed
// =============================================

const CACHE_KEY     = 'tj_news_cache_v6';
const CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour

const FF_BASE  = 'https://nfs.faireconomy.media';
// corsproxy.io is more reliable than allorigins for this feed
const PROXY    = 'https://corsproxy.io/?';
const FEEDS = [
  `${PROXY}${encodeURIComponent(FF_BASE + '/ff_calendar_thisweek.json')}`,
  `${PROXY}${encodeURIComponent(FF_BASE + '/ff_calendar_nextweek.json')}`,
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
  const onDay = all.filter(e => eventDate(e) === date);
  console.log(`[News] ${date}: ${onDay.length} total events on day, countries: ${[...new Set(onDay.map(e=>e.country))].join(',')}, impacts: ${[...new Set(onDay.map(e=>e.impact))].join(',')}`);
  const filtered = onDay.filter(e =>
    WATCHED.includes(e.country) && ['High', 'Medium'].includes(e.impact)
  ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return filtered;
}

/** Extract local YYYY-MM-DD from an event (date field is ISO with offset) */
function eventDate(e) {
  // e.date looks like "2026-04-14T08:30:00-04:00" — just slice first 10 chars
  return (e.date || '').slice(0, 10);
}

/** Extract HH:MM time string from event date, converted to UK local time */
function eventTime(e) {
  if (!e.date) return '—';
  try {
    const d = new Date(e.date);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  } catch {
    return (e.date || '').slice(11, 16);
  }
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
      FEEDS.map(url =>
        fetch(url).then(async r => {
          const text = await r.text();
          try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            console.warn('[News] Non-JSON response from proxy:', text.slice(0, 200));
            return [];
          }
        })
      )
    );

    const data = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => Array.isArray(r.value) ? r.value : []);

    console.log('[News] Fetched', data.length, 'events. Sample:', data[0]);

    // Cache it
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}

    return data;
  } catch (err) {
    console.warn('[News] Feed fetch failed:', err.message);
    return [];
  }
}

// Export helpers for use in buildNewsStrip
export { eventTime };
