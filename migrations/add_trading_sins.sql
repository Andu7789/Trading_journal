-- Run this in Supabase SQL Editor to add daily Trading Sins tracking.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS trading_sins JSONB;
