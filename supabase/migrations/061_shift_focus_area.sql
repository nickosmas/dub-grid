-- ============================================================
-- Migration 061: Add focus_area_name column to shifts
--
-- Allows each shift row to record which focus area the shift
-- belongs to (e.g. 'Skilled Nursing', 'Sheltered Care',
-- 'Night Shift', 'Visiting CSNS'). NULL = global/off-day code.
-- ============================================================

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS focus_area_name TEXT DEFAULT NULL;
