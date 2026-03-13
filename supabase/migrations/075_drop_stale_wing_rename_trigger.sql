-- ============================================================
-- Migration 075: Fix cascade_wing_rename trigger
--
-- The old trigger (migration 059) cascaded focus area name changes
-- to three tables:
--   1. employees.focus_areas (TEXT[])     — DROPPED in 071 (now focus_area_ids)
--   2. shift_codes.focus_area_name (TEXT) — DROPPED in 067 (now focus_area_id FK)
--   3. schedule_notes.focus_area_name     — STILL EXISTS (string-based)
--
-- References to the dropped columns cause:
--   ERROR 42703: column "focus_areas" does not exist
--
-- Fix: recreate the function to only cascade to schedule_notes,
-- the one remaining table that stores focus area names as strings.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cascade_wing_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- schedule_notes.focus_area_name is a plain text column
    UPDATE public.schedule_notes
    SET focus_area_name = NEW.name
    WHERE company_id = NEW.company_id
      AND focus_area_name = OLD.name;
  END IF;

  RETURN NEW;
END;
$$;
