-- Notes table — standalone journal entries
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  date       DATE NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  tags       TEXT[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS notes_date_idx ON public.notes (date DESC);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on notes"
  ON public.notes
  FOR ALL
  USING (true)
  WITH CHECK (true);
