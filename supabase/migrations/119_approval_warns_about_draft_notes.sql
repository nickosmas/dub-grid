-- 119: The approval warning names days with draft schedule notes.
--
-- An approval discards the draft of every day it publishes (086), and that
-- discard also deletes the day's draft notes and brings back notes deleted
-- only in the draft, whether or not the shift itself has a draft.
-- shift_request_draft_cells compared only the shift, so the approver wasn't
-- warned about notes the approval would undo.
--
-- It now lists a day when its shift differs from what is published (the
-- absence's times included, as publish compares them since 092) or it holds a
-- draft note change, and says which: has_shift_changes and has_note_changes.
-- New columns change the return type, so the function is dropped and made
-- again with 086's grant.
SET lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.shift_request_draft_cells(UUID);

CREATE FUNCTION public.shift_request_draft_cells(p_request_id UUID)
RETURNS TABLE (
  emp_id UUID,
  shift_date DATE,
  has_shift_changes BOOLEAN,
  has_note_changes BOOLEAN
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT request.org_id INTO v_org_id
  FROM public.shift_requests AS request
  WHERE request.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  PERFORM public.refuse_gridmaster_outside_org(v_org_id);

  IF NOT public.user_can_approve_shift_requests(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
  END IF;

  RETURN QUERY
  SELECT cell.emp_id, cell.shift_date, shift_change.changed, note_change.changed
  FROM public.shift_request_published_cells(p_request_id) AS cell
  LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'draft'
  ) AS draft ON TRUE
  LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'published'
  ) AS published ON TRUE
  CROSS JOIN LATERAL (
    SELECT draft.cell_id IS NOT NULL AND (
      draft.state_kind = 'deleted'
      OR published.state_kind IS DISTINCT FROM draft.state_kind
      OR published.absence_type_id IS DISTINCT FROM draft.absence_type_id
      OR published.custom_start_time IS DISTINCT FROM draft.custom_start_time
      OR published.custom_end_time IS DISTINCT FROM draft.custom_end_time
      OR published.absence_start_time IS DISTINCT FROM draft.absence_start_time
      OR published.absence_end_time IS DISTINCT FROM draft.absence_end_time
      OR COALESCE(published.shift_ids, '{}'::BIGINT[]) <> COALESCE(draft.shift_ids, '{}'::BIGINT[])
      OR COALESCE(published.job_ids, '{}'::BIGINT[]) <> COALESCE(draft.job_ids, '{}'::BIGINT[])
      OR COALESCE(published.is_mentored_flags, '{}'::BOOLEAN[]) <> COALESCE(draft.is_mentored_flags, '{}'::BOOLEAN[])
    ) AS changed
  ) AS shift_change
  -- What discard_schedule_cell_draft_internal (086) undoes: draft notes, and
  -- notes deleted only in the draft.
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_notes note
      WHERE note.org_id = cell.org_id
        AND note.emp_id = cell.emp_id
        AND note.date = cell.shift_date
        AND note.status IN ('draft', 'draft_deleted')
    ) AS changed
  ) AS note_change
  WHERE shift_change.changed OR note_change.changed
  ORDER BY cell.emp_id, cell.shift_date;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_request_draft_cells(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_request_draft_cells(UUID) TO authenticated;
