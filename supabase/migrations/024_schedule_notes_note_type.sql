-- Migration: 024_schedule_notes_note_type.sql
-- Purpose: Replace the free-text `note` field with a typed `note_type` column.
--
-- Design:
--   - note_type: 'readings' | 'shower'
--     readings → red dot on the schedule grid
--     shower   → black dot on the schedule grid
--   - A nurse can have multiple indicators on the same day, so the uniqueness
--     constraint changes from (emp_id, date) → (emp_id, date, note_type).

-- ── 1. Drop old unique constraint ─────────────────────────────────────────────
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT IF EXISTS schedule_notes_emp_id_date_key;

-- ── 2. Drop free-text note column ─────────────────────────────────────────────
ALTER TABLE public.schedule_notes
  DROP COLUMN IF EXISTS note;

-- ── 3. Add note_type column with allowed values ────────────────────────────────
ALTER TABLE public.schedule_notes
  ADD COLUMN IF NOT EXISTS note_type TEXT NOT NULL DEFAULT 'readings'
    CHECK (note_type IN ('readings', 'shower'));

-- ── 4. New composite unique key: one row per indicator per (nurse, day) ────────
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT IF EXISTS schedule_notes_emp_id_date_note_type_key;

ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_emp_id_date_note_type_key
    UNIQUE (emp_id, date, note_type);
