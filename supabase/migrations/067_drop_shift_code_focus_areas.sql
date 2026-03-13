-- Migration 067: Drop shift_code_focus_areas junction table and deprecated focus_area_name column
-- The canonical focus area association is now shift_codes.focus_area_id (added in migration 066).

DROP TABLE IF EXISTS public.shift_code_focus_areas;

ALTER TABLE public.shift_codes DROP COLUMN IF EXISTS focus_area_name;
