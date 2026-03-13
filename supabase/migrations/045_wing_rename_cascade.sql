-- Migration 045: Cascade wing renames to dependent tables
--
-- Focus area (wing) names are stored by value in three dependent tables:
--   employees.wings        (text[])   — an employee's assigned focus areas
--   shift_types.wing_name  (text)     — which section a shift type belongs to
--   schedule_notes.wing_name (text)   — which section a note is tied to
--
-- Previously, renaming a wing in the wings table left those denormalized
-- strings stale, causing employees to vanish from their section in the grid
-- and shift types / notes to become orphaned.
--
-- This trigger fires after any UPDATE that changes wings.name and atomically
-- propagates the new name to all three dependent tables.

CREATE OR REPLACE FUNCTION public.cascade_wing_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    -- employees.wings is a text[]; replace the old name with the new one
    UPDATE public.employees
    SET wings = array_replace(wings, OLD.name, NEW.name)
    WHERE org_id = NEW.org_id
      AND OLD.name = ANY(wings);

    -- shift_types.wing_name is a plain text column
    UPDATE public.shift_types
    SET wing_name = NEW.name
    WHERE org_id = NEW.org_id
      AND wing_name = OLD.name;

    -- schedule_notes.wing_name is a plain text column
    UPDATE public.schedule_notes
    SET wing_name = NEW.name
    WHERE org_id = NEW.org_id
      AND wing_name = OLD.name;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop the trigger first in case this migration is re-run
DROP TRIGGER IF EXISTS trg_wing_rename_cascade ON public.wings;

CREATE TRIGGER trg_wing_rename_cascade
  AFTER UPDATE OF name ON public.wings
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_wing_rename();
