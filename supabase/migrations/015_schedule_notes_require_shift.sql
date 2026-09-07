-- Schedule notes cannot exist without a shift on the same cell.
--
-- A note is an indicator describing a shift, but schedule_notes carries no
-- foreign key to schedule_cells, and a foreign key could not express this rule
-- anyway: deleting a shift writes a 'deleted' snapshot rather than removing the
-- cell row, so the constraint is on the cell's *state*, not its existence.
--
-- This has to live in the database rather than the API. `authenticated` holds
-- INSERT on every public table (004_grants.sql) and the RLS policy admits any
-- caller with canEditNotes, so a note can be written straight through PostgREST
-- without passing the route handler. RLS is the real boundary here.

CREATE OR REPLACE FUNCTION public.enforce_schedule_note_has_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_cells c
    JOIN LATERAL (
      -- The draft supersedes the published snapshot, including a draft that
      -- clears the cell, which is how the app resolves the same question.
      SELECT s.state_kind
      FROM public.schedule_cell_snapshots s
      WHERE s.cell_id = c.id
      ORDER BY (s.snapshot_kind = 'draft') DESC
      LIMIT 1
    ) effective ON TRUE
    WHERE c.org_id = NEW.org_id
      AND c.emp_id = NEW.emp_id
      AND c.date = NEW.date
      AND effective.state_kind = 'worked'
  ) THEN
    RAISE EXCEPTION 'Schedule notes require a worked shift on the same cell'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Deliberately scoped to INSERT and to updates that re-point a note at another
-- cell. A status-only UPDATE must still pass once the shift has gone, because
-- both halves of the note lifecycle move status against a cell that is no
-- longer worked: publish_schedule promotes 'draft' rows, and clearing a removed
-- shift's notes marks published rows 'draft_deleted'. Firing on those would
-- deadlock the feature against itself.
DROP TRIGGER IF EXISTS trigger_schedule_notes_require_shift ON public.schedule_notes;
CREATE TRIGGER trigger_schedule_notes_require_shift
  BEFORE INSERT OR UPDATE OF org_id, emp_id, date, indicator_type_id, focus_area_id
  ON public.schedule_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_schedule_note_has_shift();
