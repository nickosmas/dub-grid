-- Migration: 035_schedule_notes_wing_specific.sql
-- Purpose: Make schedule notes wing-specific to ensure "readings" and "shower"
--          indicators only appear on the wing where they were added.
--
-- Design:
--   - Add wing_name column (NULL = legacy or global, but app will always provide one)
--   - Update unique constraint to allow the same note_type on the same (emp, date) for DIFFERENT wings.

-- 1. Add wing_name column
ALTER TABLE public.schedule_notes
  ADD COLUMN IF NOT EXISTS wing_name TEXT;

-- 2. Drop old unique constraint
-- This was (emp_id, date, note_type)
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT IF EXISTS schedule_notes_emp_id_date_note_type_key;

-- 3. Create new composite unique key including wing_name
-- Note: In PG, unique constraints with NULL columns allow multiple NULLs unless 
-- using NULLS NOT DISTINCT (PG15+). For reliability across versions, we'll 
-- assume wing_name is provided by the app.
ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_emp_id_date_note_type_wing_key
    UNIQUE (emp_id, date, note_type, wing_name);
