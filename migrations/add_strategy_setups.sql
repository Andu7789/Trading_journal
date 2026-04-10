-- Strategy Setups table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.strategy_setups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE NOT NULL,
  pair        VARCHAR(20) NOT NULL,
  direction   VARCHAR(10),          -- long / short
  possible_r  NUMERIC(8,2),         -- e.g. 2.5
  outcome     VARCHAR(20) DEFAULT 'pending', -- win / loss / breakeven / pending
  notes       TEXT,
  screenshots JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.strategy_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on strategy_setups"
  ON public.strategy_setups
  FOR ALL
  USING (true)
  WITH CHECK (true);
