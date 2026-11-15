-- 143: Discarding drafts leaves what a status change wrote.
--
-- Marking someone Away writes their days into the draft: their shifts come
-- off, or the days hold the Away absence (099, 100, 103). Those drafts publish
-- with the period. Discarding the period's drafts (032) put the published
-- shifts back while the person was still Away, where the grid's Away bar
-- hid them and staff kept seeing shifts nobody would work.
--
-- Nothing else can be drafted on a day someone can't be scheduled: the
-- database refuses it (refuse_unschedulable_employee). So a draft on such a
-- day is the status change's own, and discard now leaves it. Changing the
-- person's status is how it's undone, and that rewrites the days itself.
-- Everything else discard does is unchanged.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.discard_schedule_drafts(
  p_org_id     UUID,
  p_user_id    UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_cell RECORD;
BEGIN
  FOR v_cell IN
    SELECT c.id
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND (p_start_date IS NULL OR c.date >= p_start_date)
      AND (p_end_date IS NULL OR c.date <= p_end_date)
      AND (p_user_id IS NULL OR c.updated_by = p_user_id)
      AND EXISTS (
        SELECT 1 FROM public.schedule_cell_snapshots d
        WHERE d.cell_id = c.id AND d.org_id = c.org_id AND d.snapshot_kind = 'draft'
      )
      -- A status change's own draft stays: see above.
      AND public.employee_schedulable_on(c.emp_id, c.date)
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    -- Decided under the lock, not from the selection above.
    IF EXISTS (
      SELECT 1 FROM public.schedule_cell_snapshots p
      WHERE p.cell_id = v_cell.id AND p.org_id = p_org_id AND p.snapshot_kind = 'published'
    ) THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = v_cell.id AND org_id = p_org_id AND snapshot_kind = 'draft';

      UPDATE public.schedule_cells
      SET version = version + 1, updated_by = p_user_id, updated_at = now()
      WHERE id = v_cell.id;
    ELSE
      DELETE FROM public.schedule_cells WHERE id = v_cell.id;
    END IF;
  END LOOP;

  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND status = 'draft'
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date)
    AND (p_user_id IS NULL OR updated_by = p_user_id);

  UPDATE public.schedule_notes
  SET status = 'published'
  WHERE org_id = p_org_id
    AND status = 'draft_deleted'
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date)
    AND (p_user_id IS NULL OR updated_by = p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE) TO service_role;
