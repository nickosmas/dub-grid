-- 064: A schedule note leaves with its shift, however the shift is removed.
--
-- Since 063 a note belongs to one shift of its cell. Only a single-cell save
-- cleared the notes of a shift it removed; a series "edit all" and the request
-- approvals (swap, pickup, call-off, auto-approve, staffed call-off
-- finalization) rewrite shifts in SQL and left those notes behind, as dots no
-- shift owned and no editor card could turn off.
--
-- Every one of those paths changes a cell through schedule_cell_snapshots, so
-- the rule lives there. The triggers are deferred to the end of the
-- transaction: a snapshot sync deletes and re-inserts its segments, and publish
-- swaps the draft for the published snapshot, and only the final shifts decide
-- which notes stay.

-- Clears the notes of the shifts a cell no longer has, by the rule every note
-- removal follows: a draft goes, and a published note waits for the next
-- publish (a discard restores it). Notes no shift claims are left alone.
CREATE OR REPLACE FUNCTION public.clear_schedule_notes_of_lost_shifts(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_state_kind TEXT;
BEGIN
  -- The draft supersedes the published snapshot, including a draft that
  -- clears the cell, as 015 resolves it.
  SELECT s.id, s.state_kind
  INTO v_snapshot_id, v_state_kind
  FROM public.schedule_cells c
  JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
  WHERE c.org_id = p_org_id
    AND c.emp_id = p_emp_id
    AND c.date = p_date
  ORDER BY (s.snapshot_kind = 'draft') DESC
  LIMIT 1;

  WITH lost AS (
    SELECT n.id, n.status
    FROM public.schedule_notes n
    WHERE n.org_id = p_org_id
      AND n.emp_id = p_emp_id
      AND n.date = p_date
      AND n.job_id IS NOT NULL
      AND n.status IN ('draft', 'published')
      AND NOT EXISTS (
        SELECT 1
        FROM public.schedule_cell_segments seg
        WHERE v_state_kind = 'worked'
          AND seg.snapshot_id = v_snapshot_id
          AND seg.job_id = n.job_id
          AND seg.shift_id IS NOT DISTINCT FROM n.shift_id
      )
  ),
  dropped AS (
    DELETE FROM public.schedule_notes n
    USING lost
    WHERE n.id = lost.id
      AND lost.status = 'draft'
  )
  UPDATE public.schedule_notes n
  SET status = 'draft_deleted'
  FROM lost
  WHERE n.id = lost.id
    AND lost.status = 'published';
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_notes_of_lost_shifts(UUID, UUID, DATE)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clear_notes_after_snapshot_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.cell_id ELSE NEW.cell_id END;
  v_cell public.schedule_cells%ROWTYPE;
BEGIN
  SELECT * INTO v_cell FROM public.schedule_cells WHERE id = v_cell_id;
  -- A pruned cell is handled by its own delete trigger below.
  IF FOUND THEN
    PERFORM public.clear_schedule_notes_of_lost_shifts(v_cell.org_id, v_cell.emp_id, v_cell.date);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_notes_after_cell_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.clear_schedule_notes_of_lost_shifts(OLD.org_id, OLD.emp_id, OLD.date);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_notes_after_snapshot_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_notes_after_cell_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_schedule_notes_follow_snapshots ON public.schedule_cell_snapshots;
CREATE CONSTRAINT TRIGGER trigger_schedule_notes_follow_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_cell_snapshots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_notes_after_snapshot_change();

DROP TRIGGER IF EXISTS trigger_schedule_notes_follow_cells ON public.schedule_cells;
CREATE CONSTRAINT TRIGGER trigger_schedule_notes_follow_cells
  AFTER DELETE ON public.schedule_cells
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_notes_after_cell_delete();
