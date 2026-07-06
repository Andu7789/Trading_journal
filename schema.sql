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
  trade_time      TEXT,
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

  -- Trade type
  trade_type      VARCHAR(10) DEFAULT 'taken' CHECK (trade_type IN ('taken', 'missed')),
  missed_reason   VARCHAR(30),

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
  plan_images     JSONB,

  -- Running log of intraday notes/screenshots
  session_log     JSONB,

  -- Post-session review
  what_went_well  TEXT DEFAULT '',
  what_went_wrong TEXT DEFAULT '',
  lessons_learned TEXT DEFAULT '',
  tomorrow_focus  TEXT DEFAULT '',
  general_notes   TEXT DEFAULT '',
  trading_sins    JSONB,

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
--  NOTES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date       DATE NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  tags       TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS notes_date_idx ON public.notes (date DESC);

-- =============================================
--  R GAME TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS public.r_game_settings (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS public.r_game_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  date        DATE NOT NULL,
  amount      DECIMAL(10, 2) NOT NULL,
  note        TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS r_game_entries_date_idx ON public.r_game_entries (date DESC);

-- =============================================
--  EMOTION MAP TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS public.emotion_action_types (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.emotion_map_entries (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  action_type_id        UUID NOT NULL REFERENCES public.emotion_action_types(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  trigger_signal        TEXT DEFAULT '',
  thoughts              TEXT DEFAULT '',
  emotions              TEXT DEFAULT '',
  behaviors             TEXT DEFAULT '',
  actions               TEXT DEFAULT '',
  decision_change       TEXT DEFAULT '',
  perception_change     TEXT DEFAULT '',
  mistake               TEXT DEFAULT '',
  notes                 TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS emotion_action_types_sort_idx ON public.emotion_action_types (sort_order, created_at);
CREATE INDEX IF NOT EXISTS emotion_map_entries_action_date_idx ON public.emotion_map_entries (action_type_id, date DESC);
CREATE INDEX IF NOT EXISTS emotion_map_entries_date_idx ON public.emotion_map_entries (date DESC);

INSERT INTO public.emotion_action_types (name, description, sort_order)
VALUES
  ('Trading on a 2 minute chart', 'Dropping timeframe when emotions are driving the decision.', 10),
  ('Oversized trades', 'Taking more risk than planned.', 20),
  ('Not in strategy', 'Entering outside the playbook or setup criteria.', 30)
ON CONFLICT (name) DO NOTHING;

-- =============================================
--  TILT MONITOR TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS public.tilt_monitor_sessions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  date        DATE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  baseline    JSONB DEFAULT '{}'::jsonb,
  settings    JSONB DEFAULT '{}'::jsonb,
  notes       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.tilt_monitor_samples (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  session_id     UUID NOT NULL REFERENCES public.tilt_monitor_sessions(id) ON DELETE CASCADE,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score     SMALLINT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  face_present   BOOLEAN DEFAULT TRUE,
  face_count     INTEGER,
  motion_score   DECIMAL(10, 2),
  brightness     DECIMAL(10, 2),
  tension_score  DECIMAL(10, 2),
  metrics        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.tilt_monitor_labels (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  session_id  UUID NOT NULL REFERENCES public.tilt_monitor_sessions(id) ON DELETE CASCADE,
  labeled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label       TEXT NOT NULL CHECK (label IN ('calm', 'focused', 'frustrated', 'fomo', 'revenge', 'tilt', 'false_positive')),
  intensity   SMALLINT DEFAULT 5 CHECK (intensity BETWEEN 1 AND 10),
  notes       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.tilt_monitor_alerts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  session_id    UUID NOT NULL REFERENCES public.tilt_monitor_sessions(id) ON DELETE CASCADE,
  alerted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_score    SMALLINT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  message       TEXT DEFAULT '',
  acknowledged  BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS tilt_monitor_sessions_date_idx ON public.tilt_monitor_sessions (date DESC, started_at DESC);
CREATE INDEX IF NOT EXISTS tilt_monitor_samples_session_time_idx ON public.tilt_monitor_samples (session_id, captured_at ASC);
CREATE INDEX IF NOT EXISTS tilt_monitor_labels_session_time_idx ON public.tilt_monitor_labels (session_id, labeled_at ASC);
CREATE INDEX IF NOT EXISTS tilt_monitor_alerts_session_time_idx ON public.tilt_monitor_alerts (session_id, alerted_at ASC);

-- =============================================
--  ROW LEVEL SECURITY
--  (Personal app — allow all operations)
-- =============================================
ALTER TABLE public.trades         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r_game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r_game_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_map_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_alerts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (personal use)
CREATE POLICY "Allow all for anon" ON public.trades
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.journal_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.playbook
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.notes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.r_game_settings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.r_game_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.emotion_action_types
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.emotion_map_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.tilt_monitor_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.tilt_monitor_samples
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.tilt_monitor_labels
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for anon" ON public.tilt_monitor_alerts
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
--  TRADE TIMES — add columns to existing tables
--  Run this if either column doesn't exist yet:
-- =============================================
ALTER TABLE public.strategy_setups
  ADD COLUMN IF NOT EXISTS trade_time TEXT;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS trade_time TEXT;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS trading_sins JSONB;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS plan_images JSONB,
  ADD COLUMN IF NOT EXISTS session_log JSONB;

-- =============================================
--  STORAGE
--  After running this SQL, go to Storage in
--  your Supabase dashboard and:
--  1. Create a bucket named "screenshots"
--  2. Set it to Public
--  3. Add a policy allowing anon uploads:
--     INSERT, SELECT for all
-- =============================================
