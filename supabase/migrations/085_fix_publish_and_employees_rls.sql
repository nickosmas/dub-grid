-- ============================================================
-- Migration 085: Fix publish_schedule RPC + employees SELECT RLS
--
-- Two bugs that prevent regular users from seeing published shifts:
--
-- 1. publish_schedule() references stale columns (draft_label /
--    published_label) and the dropped caller_org_id() function.
--    Also, the parameter is named p_org_id but the client sends
--    p_company_id. The RPC silently fails so drafts are never
--    promoted to published.
--
-- 2. employees SELECT RLS restricts regular users to only their
--    own record (matched by email). Since fetchShifts() uses an
--    INNER JOIN through employees, regular users see zero shifts.
--    Regular users need to read all employees to view the schedule.
-- ============================================================


-- ── 1. Replace publish_schedule with corrected version ───────────────────────

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Ensure caller has permission (gridmaster, super_admin, or admin)
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_company_id() = p_company_id
      AND public.caller_company_role()::TEXT IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- ── A. SHIFTS ──────────────────────────────────────────────────────────────

  -- Promote drafts: copy draft_shift_code_ids → published_shift_code_ids,
  -- then clear the draft columns.
  UPDATE public.shifts
  SET published_shift_code_ids = draft_shift_code_ids,
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_is_delete = FALSE
    AND array_length(draft_shift_code_ids, 1) IS NOT NULL;

  -- Handle draft-deletes: remove the shift row entirely.
  DELETE FROM public.shifts
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_is_delete = TRUE;

  -- Clean up any rows with both columns empty (edge case).
  DELETE FROM public.shifts
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (published_shift_code_ids IS NULL OR array_length(published_shift_code_ids, 1) IS NULL)
    AND (draft_shift_code_ids IS NULL OR array_length(draft_shift_code_ids, 1) IS NULL)
    AND draft_is_delete = FALSE;

  -- ── B. NOTES ───────────────────────────────────────────────────────────────

  -- Commit added notes: status 'draft' → 'published'
  UPDATE public.schedule_notes
  SET status = 'published',
      updated_at = NOW()
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft';

  -- Finalize deleted notes: delete where status 'draft_deleted'
  DELETE FROM public.schedule_notes
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft_deleted';

END;
$$;


-- ── 2. Fix employees SELECT RLS ─────────────────────────────────────────────
-- Allow all company members (including regular users) to view all employees
-- in their company so they can see the full schedule.

DROP POLICY IF EXISTS "members_select_employees" ON public.employees;

CREATE POLICY "members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());
