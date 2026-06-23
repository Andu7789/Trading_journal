-- =============================================
--  R GAME
--  Manual R score tracker: wins add points, losses subtract points.
-- =============================================

CREATE TABLE IF NOT EXISTS public.r_game_settings (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO public.r_game_settings (id, start_date)
VALUES ('default', CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.r_game_entries (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  date        DATE NOT NULL,
  amount      DECIMAL(10, 2) NOT NULL,
  note        TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS r_game_entries_date_idx ON public.r_game_entries (date DESC);

ALTER TABLE public.r_game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r_game_entries  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.r_game_settings;
CREATE POLICY "Allow all for anon" ON public.r_game_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.r_game_entries;
CREATE POLICY "Allow all for anon" ON public.r_game_entries
  FOR ALL USING (true) WITH CHECK (true);
