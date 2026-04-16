// =============================================
//  DATABASE — Supabase wrapper
// =============================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let _client = null;

export function initSupabase() {
  // Config file takes priority; localStorage used as override from Settings page
  const url = SUPABASE_URL || localStorage.getItem('tj_supabase_url');
  const key = SUPABASE_KEY || localStorage.getItem('tj_supabase_key');
  if (!url || !key) return false;
  try {
    _client = window.supabase.createClient(url, key);
    return true;
  } catch (e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

export function getClient() { return _client; }
export function isConnected() { return _client !== null; }

// =============================================
//  AUTH
// =============================================

export async function getAuthSession() {
  if (!_client) return null;
  try {
    const { data } = await _client.auth.getSession();
    return data.session;
  } catch { return null; }
}

export async function signInWithGoogle() {
  if (!_client) throw new Error('Not connected to Supabase');
  const { error } = await _client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
}

export async function signOut() {
  if (!_client) return;
  await _client.auth.signOut();
}

export async function testConnection() {
  if (!_client) return false;
  try {
    const { error } = await _client.from('trades').select('id').limit(1);
    return !error;
  } catch { return false; }
}

// =============================================
//  TRADES
// =============================================

export async function saveTrade(tradeData) {
  if (!_client) throw new Error('Not connected to Supabase');

  const { id, ...data } = tradeData;
  data.updated_at = new Date().toISOString();

  // Auto-set outcome from pnl if not provided
  if (!data.outcome || data.outcome === '') {
    if (data.pnl !== null && data.pnl !== undefined && data.pnl !== '') {
      const pnl = parseFloat(data.pnl);
      if (pnl > 0) data.outcome = 'win';
      else if (pnl < 0) data.outcome = 'loss';
      else data.outcome = 'breakeven';
    }
  }

  // Parse tags to array
  if (typeof data.tags === 'string') {
    data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (id) {
    const { data: result, error } = await _client
      .from('trades')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return result;
  } else {
    const { data: result, error } = await _client
      .from('trades')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result;
  }
}

export async function getTrades(filters = {}) {
  if (!_client) throw new Error('Not connected to Supabase');

  let query = _client
    .from('trades')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.date)      query = query.eq('date', filters.date);
  if (filters.startDate) query = query.gte('date', filters.startDate);
  if (filters.endDate)   query = query.lte('date', filters.endDate);
  if (filters.symbol)    query = query.ilike('symbol', `%${filters.symbol}%`);
  if (filters.outcome)   query = query.eq('outcome', filters.outcome);
  if (filters.strategy)  query = query.ilike('strategy', `%${filters.strategy}%`);
  if (filters.direction) query = query.eq('direction', filters.direction);
  if (filters.limit)     query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getTradeById(id) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { data, error } = await _client
    .from('trades')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrade(id) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { error } = await _client.from('trades').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
//  JOURNAL ENTRIES
// =============================================

export async function saveJournalEntry(entryData) {
  if (!_client) throw new Error('Not connected to Supabase');

  const { id, ...data } = entryData;
  data.updated_at = new Date().toISOString();

  // Convert empty strings to null for constrained columns
  if (!data.market_bias) data.market_bias = null;

  const { data: result, error } = await _client
    .from('journal_entries')
    .upsert(data, { onConflict: 'date' })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function getJournalEntry(date) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { data, error } = await _client
    .from('journal_entries')
    .select('*')
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getJournalEntries(startDate, endDate) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { data, error } = await _client
    .from('journal_entries')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// =============================================
//  SCREENSHOTS
// =============================================

export async function uploadScreenshot(file) {
  if (!_client) throw new Error('Not connected to Supabase');

  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await _client.storage
    .from('screenshots')
    .upload(fileName, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data } = _client.storage.from('screenshots').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function deleteScreenshot(url) {
  if (!_client) return;
  try {
    const fileName = url.split('/').pop();
    await _client.storage.from('screenshots').remove([fileName]);
  } catch (e) {
    console.warn('Could not delete screenshot:', e);
  }
}

// =============================================
//  STRATEGY SETUPS
// =============================================

export async function getStrategySetups(filters = {}) {
  if (!_client) throw new Error('Not connected to Supabase');

  let query = _client
    .from('strategy_setups')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.startDate) query = query.gte('date', filters.startDate);
  if (filters.endDate)   query = query.lte('date', filters.endDate);
  if (filters.pair)      query = query.eq('pair', filters.pair);
  if (filters.outcome)   query = query.eq('outcome', filters.outcome);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveStrategySetup(setupData) {
  if (!_client) throw new Error('Not connected to Supabase');

  const { id, ...data } = setupData;
  data.updated_at = new Date().toISOString();

  if (id) {
    const { data: result, error } = await _client
      .from('strategy_setups')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return result;
  } else {
    const { data: result, error } = await _client
      .from('strategy_setups')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result;
  }
}

export async function deleteStrategySetup(id) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { error } = await _client.from('strategy_setups').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
//  NOTES
// =============================================

export async function getNotes(filters = {}) {
  if (!_client) throw new Error('Not connected to Supabase');

  let query = _client
    .from('notes')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.startDate) query = query.gte('date', filters.startDate);
  if (filters.endDate)   query = query.lte('date', filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveNote(noteData) {
  if (!_client) throw new Error('Not connected to Supabase');

  const { id, ...data } = noteData;
  data.updated_at = new Date().toISOString();

  // Parse tags to array
  if (typeof data.tags === 'string') {
    data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (id) {
    const { data: result, error } = await _client
      .from('notes')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return result;
  } else {
    const { data: result, error } = await _client
      .from('notes')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result;
  }
}

export async function deleteNote(id) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { error } = await _client.from('notes').delete().eq('id', id);
  if (error) throw error;
}

// =============================================
//  PLAYBOOK
// =============================================

export async function getPlaybookEntries() {
  if (!_client) throw new Error('Not connected to Supabase');
  const { data, error } = await _client
    .from('playbook')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function savePlaybookEntry(entry) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { id, ...data } = entry;
  data.updated_at = new Date().toISOString();

  if (id) {
    const { data: result, error } = await _client
      .from('playbook')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return result;
  } else {
    const { data: result, error } = await _client
      .from('playbook')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result;
  }
}

export async function deletePlaybookEntry(id) {
  if (!_client) throw new Error('Not connected to Supabase');
  const { error } = await _client.from('playbook').delete().eq('id', id);
  if (error) throw error;
}
