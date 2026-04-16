-- Add screenshots column to notes table
-- Run this in the Supabase SQL Editor

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS screenshots JSONB DEFAULT '[]';
