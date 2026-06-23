-- =============================================
--  EMOTION MAP
--  Tracks negative-impact trading actions and the signals around them.
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

ALTER TABLE public.emotion_action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_map_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.emotion_action_types;
CREATE POLICY "Allow all for anon" ON public.emotion_action_types
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.emotion_map_entries;
CREATE POLICY "Allow all for anon" ON public.emotion_map_entries
  FOR ALL USING (true) WITH CHECK (true);
