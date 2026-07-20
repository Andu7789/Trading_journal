-- Run this in Supabase SQL Editor to track stop-loss efficiency on Strategy Tracker setups.
-- entry_price / stop_loss are the planned levels; extreme_price is the worst price the
-- trade reached against you (lowest price for longs, highest price for shorts).
ALTER TABLE public.strategy_setups
  ADD COLUMN IF NOT EXISTS entry_price DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS extreme_price DECIMAL(20, 8);
