-- Run this in Supabase SQL Editor to add missed trade support
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS trade_type    VARCHAR(10) DEFAULT 'taken' CHECK (trade_type IN ('taken', 'missed')),
  ADD COLUMN IF NOT EXISTS missed_reason VARCHAR(30);
