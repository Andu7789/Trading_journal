-- Run this in Supabase SQL Editor to add Trading Plan images (pre-market)
-- and a running Session Log (intraday notes + screenshots) to the daily journal.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS plan_images JSONB,
  ADD COLUMN IF NOT EXISTS session_log JSONB;
