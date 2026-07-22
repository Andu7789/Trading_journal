-- Run this in Supabase SQL Editor to retire the DXY signal.
-- `signals` is a native Postgres array column (text[]), not JSONB, so this
-- uses array_remove() rather than JSONB array functions.

UPDATE public.strategy_setups
SET signals = array_remove(signals, 'DXY')
WHERE 'DXY' = ANY(signals);

UPDATE public.trades
SET signals = array_remove(signals, 'DXY')
WHERE 'DXY' = ANY(signals);

UPDATE public.watchlist_ideas
SET signals = array_remove(signals, 'DXY')
WHERE 'DXY' = ANY(signals);
