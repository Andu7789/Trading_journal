-- Run this in Supabase SQL Editor to record the time of each trade.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS trade_time TEXT;
