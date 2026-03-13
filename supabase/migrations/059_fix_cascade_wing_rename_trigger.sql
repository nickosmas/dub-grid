-- ============================================================
-- Migration 059: Fix cascade_wing_rename() trigger function
--
-- Migration 048 recreated cascade_wing_rename() with updated
-- column names (company_id, focus_areas, focus_area_name) but
-- still referenced public.shift_types. Migration 055 renamed
-- that table to shift_codes, breaking focus area renames.
--
-- This migration recreates the function referencing shift_codes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cascade_wing_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- employees.focus_areas is a text[]; replace the old name with the new one
    UPDATE public.employees
    SET focus_areas = array_replace(focus_areas, OLD.name, NEW.name)
    WHERE company_id = NEW.company_id
      AND OLD.name = ANY(focus_areas);

    -- shift_codes.focus_area_name is a plain text column
    UPDATE public.shift_codes
    SET focus_area_name = NEW.name
    WHERE company_id = NEW.company_id
      AND focus_area_name = OLD.name;

    -- schedule_notes.focus_area_name is a plain text column
    UPDATE public.schedule_notes
    SET focus_area_name = NEW.name
    WHERE company_id = NEW.company_id
      AND focus_area_name = OLD.name;
  END IF;

  RETURN NEW;
END;
$$;
