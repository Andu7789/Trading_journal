-- Run this in Supabase SQL Editor to retire the DXY signal.
-- `signals` is jsonb on strategy_setups/trades but a native text[] array
-- on watchlist_ideas, so each needs its own removal syntax.

UPDATE public.strategy_setups
SET signals = COALESCE(
  (SELECT jsonb_agg(elem) FROM jsonb_array_elements(signals) elem WHERE elem <> '"DXY"'),
  '[]'::jsonb
)
WHERE signals @> '["DXY"]'::jsonb;

UPDATE public.trades
SET signals = COALESCE(
  (SELECT jsonb_agg(elem) FROM jsonb_array_elements(signals) elem WHERE elem <> '"DXY"'),
  '[]'::jsonb
)
WHERE signals @> '["DXY"]'::jsonb;

UPDATE public.watchlist_ideas
SET signals = array_remove(signals, 'DXY')
WHERE 'DXY' = ANY(signals);
