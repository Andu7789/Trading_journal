-- =============================================
--  TILT MONITOR
--  Stores local-only webcam signal samples, labels, and alerts.
--  Raw video/images are not stored by the app.
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

ALTER TABLE public.tilt_monitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilt_monitor_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON public.tilt_monitor_sessions;
CREATE POLICY "Allow all for anon" ON public.tilt_monitor_sessions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.tilt_monitor_samples;
CREATE POLICY "Allow all for anon" ON public.tilt_monitor_samples
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.tilt_monitor_labels;
CREATE POLICY "Allow all for anon" ON public.tilt_monitor_labels
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for anon" ON public.tilt_monitor_alerts;
CREATE POLICY "Allow all for anon" ON public.tilt_monitor_alerts
  FOR ALL USING (true) WITH CHECK (true);
