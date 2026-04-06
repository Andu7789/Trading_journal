-- =============================================
--  TRADEJOURNALPRO — Supabase Schema
--  Run this in your Supabase SQL Editor
-- =============================================

-- =============================================
--  TRADES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.trades (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Core
  date            DATE NOT NULL,
  symbol          VARCHAR(30) NOT NULL,
  direction       VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),
  outcome         VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),

  -- Prices
  entry_price     DECIMAL(20, 8),
  exit_price      DECIMAL(20, 8),
  size            DECIMAL(20, 8),
  stop_loss       DECIMAL(20, 8),
  take_profit     DECIMAL(20, 8),

  -- Results
  pnl             DECIMAL(20, 2),
  risk_amount     DECIMAL(20, 2),
  risk_reward     DECIMAL(10, 4),
  leverage        DECIMAL(10, 2),

  -- Context
  strategy        VARCHAR(100),
  timeframe       VARCHAR(10),
  session         VARCHAR(20),

  -- Psychology (Tilt Meter)
  tilt_meter      SMALLINT CHECK (tilt_meter BETWEEN 1 AND 10),
  emotion         VARCHAR(30),
  followed_plan   VARCHAR(10) CHECK (followed_plan IN ('yes', 'partial', 'no')),
  mistake_type    VARCHAR(50),

  -- Notes
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT DEFAULT '',
  mistakes        TEXT DEFAULT '',

  -- Screenshots (array of public URLs from Supabase Storage)
  screenshots     TEXT[] DEFAULT '{}'
);

-- Index for fast date queries
CREATE INDEX IF NOT EXISTS trades_date_idx ON public.trades (date DESC);
CREATE INDEX IF NOT EXISTS trades_symbol_idx ON public.trades (symbol);

-- =============================================
--  JOURNAL ENTRIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per day
  date            DATE NOT NULL UNIQUE,

  -- Pre-market
  market_bias     VARCHAR(20) CHECK (market_bias IN ('bullish', 'bearish', 'neutral', 'mixed')),
  key_levels      TEXT DEFAULT '',
  economic_events TEXT DEFAULT '',
  daily_goals     TEXT DEFAULT '',

  -- Post-session review
  what_went_well  TEXT DEFAULT '',
  what_went_wrong TEXT DEFAULT '',
  lessons_learned TEXT DEFAULT '',
  tomorrow_focus  TEXT DEFAULT '',
  general_notes   TEXT DEFAULT '',

  -- Self-assessment ratings (1-10)
  discipline_rating   SMALLINT DEFAULT 5 CHECK (discipline_rating BETWEEN 1 AND 10),
  emotion_rating      SMALLINT DEFAULT 5 CHECK (emotion_rating BETWEEN 1 AND 10),
  overall_rating      SMALLINT DEFAULT 5 CHECK (overall_rating BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS journal_date_idx ON public.journal_entries (date DESC);

-- =============================================
--  PLAYBOOK TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.playbook (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  name              VARCHAR(100) NOT NULL,
  market            VARCHAR(50),
  timeframe         VARCHAR(10),
  session           VARCHAR(20),
  description       TEXT DEFAULT '',
  entry_criteria    TEXT DEFAULT '',
  stop_loss_rules   TEXT DEFAULT '',
  take_profit_rules TEXT DEFAULT '',
  risk_management   TEXT DEFAULT '',
  what_to_avoid     TEXT DEFAULT '',
  notes             TEXT DEFAULT ''
);

-- =============================================
--  ROW LEVEL SECURITY
--  (Personal app — allow all operations)
-- =============================================
ALTER TABLE public.trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook        ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (personal use)
CREATE POLICY "Allow all for anon" ON public.trades
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.journal_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.playbook
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
--  STORAGE
--  After running this SQL, go to Storage in
--  your Supabase dashboard and:
--  1. Create a bucket named "screenshots"
--  2. Set it to Public
--  3. Add a policy allowing anon uploads:
--     INSERT, SELECT for all
-- =============================================
