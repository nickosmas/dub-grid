-- 086: An approval replaces the draft of every cell it publishes.
--
-- An approval publishes at once (030). Publishing a draft copies the draft
-- cell's whole state over the published one (039), so a cell that kept a draft
-- written before the approval had the approval silently undone by the next
-- publish: an older change beat a newer one. 030 dropped the draft only for a
-- call-off's requester. The owner's rule (2026-10-21) is that later actions
-- always win, so an approval now discards the earlier draft of every cell it
-- publishes, the same way discard_schedule_drafts discards one. A change made
-- after the approval still wins at the next publish. Automatic approvals go
-- through resolve_shift_request_checked too and follow the same rule.
--
-- shift_request_draft_cells lets an approver see, before approving, which of
-- those cells have draft changes to warn about.

-- The cells an approval publishes, read from the request row:
-- a call-off or volunteer pickup writes the requester's day; a claimed pickup
-- moves the requester's shift to the claimer on that day; a swap writes both
-- people on both days.
CREATE OR REPLACE FUNCTION public.shift_request_published_cells(p_request_id UUID)
RETURNS TABLE (org_id UUID, emp_id UUID, shift_date DATE)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT DISTINCT cells.org_id, cells.emp_id, cells.shift_date
  FROM public.shift_requests AS request
  CROSS JOIN LATERAL (
    VALUES
      (request.org_id, request.requester_emp_id, request.requester_shift_date),
      (request.org_id,
        CASE WHEN request.type IN ('pickup', 'swap') THEN request.target_emp_id END,
        request.requester_shift_date),
      (request.org_id,
        CASE WHEN request.type = 'swap' THEN request.target_emp_id END,
        request.target_shift_date),
      (request.org_id,
        CASE WHEN request.type = 'swap' THEN request.requester_emp_id END,
        request.target_shift_date)
  ) AS cells(org_id, emp_id, shift_date)
  WHERE request.id = p_request_id
    AND cells.emp_id IS NOT NULL
    AND cells.shift_date IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.shift_request_published_cells(UUID)
  FROM PUBLIC, anon, authenticated;

-- discard_schedule_drafts (032) for one person's day: the draft snapshot goes
-- (the whole cell when nothing is published), the version moves so an open
-- editor sees the change, draft notes go and notes deleted only in the draft
-- come back. The deferred note triggers (064) then clear any note whose shift
-- the final state no longer has.
CREATE OR REPLACE FUNCTION public.discard_schedule_cell_draft_internal(
  p_org_id  UUID,
  p_emp_id  UUID,
  p_date    DATE,
  p_user_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_cell_id UUID;
BEGIN
  SELECT c.id
  INTO v_cell_id
  FROM public.schedule_cells c
  WHERE c.org_id = p_org_id
    AND c.emp_id = p_emp_id
    AND c.date = p_date
  FOR UPDATE;

  IF FOUND AND EXISTS (
    SELECT 1 FROM public.schedule_cell_snapshots d
    WHERE d.cell_id = v_cell_id AND d.org_id = p_org_id AND d.snapshot_kind = 'draft'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.schedule_cell_snapshots p
      WHERE p.cell_id = v_cell_id AND p.org_id = p_org_id AND p.snapshot_kind = 'published'
    ) THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = v_cell_id AND org_id = p_org_id AND snapshot_kind = 'draft';

      UPDATE public.schedule_cells
      SET version = version + 1, updated_by = p_user_id, updated_at = now()
      WHERE id = v_cell_id;
    ELSE
      DELETE FROM public.schedule_cells WHERE id = v_cell_id;
    END IF;
  END IF;

  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
    AND status = 'draft';

  UPDATE public.schedule_notes
  SET status = 'published'
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
    AND status = 'draft_deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.discard_schedule_cell_draft_internal(UUID, UUID, DATE, UUID)
  FROM PUBLIC, anon, authenticated;

-- 030's body, unchanged above the resolver call. The discard runs only once
-- the request reads approved, so a rejection or a refused approval keeps every
-- draft.
CREATE OR REPLACE FUNCTION public.resolve_shift_request_checked(
  p_request_id    UUID,
  p_approved      BOOLEAN,
  p_note          TEXT,
  p_admin_user_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_reason TEXT;
  v_cell RECORD;
BEGIN
  IF p_approved THEN
    SELECT org_id, type, requester_emp_id, requester_shift_date, requester_state,
           target_emp_id, target_shift_date, target_state
    INTO v_request
    FROM public.shift_requests
    WHERE id = p_request_id;

    IF FOUND
       AND v_request.type = 'swap'
       AND v_request.target_emp_id IS NOT NULL
       AND v_request.target_shift_date IS NOT NULL
       AND v_request.target_state IS NOT NULL THEN
      v_reason := public.swap_request_conflict(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        v_request.requester_state,
        v_request.target_emp_id,
        v_request.target_shift_date,
        v_request.target_state
      );
      IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: %', v_reason;
      END IF;
    END IF;
  END IF;

  PERFORM public.resolve_shift_request_unchecked(p_request_id, p_approved, p_note, p_admin_user_id);

  IF p_approved AND EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE id = p_request_id AND status = 'approved'
  ) THEN
    FOR v_cell IN
      SELECT * FROM public.shift_request_published_cells(p_request_id)
      ORDER BY emp_id, shift_date
    LOOP
      PERFORM public.discard_schedule_cell_draft_internal(
        v_cell.org_id, v_cell.emp_id, v_cell.shift_date, p_admin_user_id
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_request_checked(UUID, BOOLEAN, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

-- The cells an approval would publish whose draft differs from what is
-- published, compared field by field as publish compares them (039). A draft
-- equal to its published snapshot changes nothing and is not listed. Only an
-- approver of the request's organization may ask, and a Gridmaster only while
-- impersonating it.
CREATE OR REPLACE FUNCTION public.shift_request_draft_cells(p_request_id UUID)
RETURNS TABLE (emp_id UUID, shift_date DATE)
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
  SELECT cell.emp_id, cell.shift_date
  FROM public.shift_request_published_cells(p_request_id) AS cell
  JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'draft'
  ) AS draft ON TRUE
  LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'published'
  ) AS published ON TRUE
  WHERE draft.state_kind = 'deleted'
     OR published.state_kind IS DISTINCT FROM draft.state_kind
     OR published.absence_type_id IS DISTINCT FROM draft.absence_type_id
     OR published.custom_start_time IS DISTINCT FROM draft.custom_start_time
     OR published.custom_end_time IS DISTINCT FROM draft.custom_end_time
     OR COALESCE(published.shift_ids, '{}'::BIGINT[]) <> COALESCE(draft.shift_ids, '{}'::BIGINT[])
     OR COALESCE(published.job_ids, '{}'::BIGINT[]) <> COALESCE(draft.job_ids, '{}'::BIGINT[])
     OR COALESCE(published.is_mentored_flags, '{}'::BOOLEAN[]) <> COALESCE(draft.is_mentored_flags, '{}'::BOOLEAN[])
  ORDER BY cell.emp_id, cell.shift_date;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_request_draft_cells(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_request_draft_cells(UUID) TO authenticated;
