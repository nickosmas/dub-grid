-- Migration: 063_fix_publish_schedule_permissions.sql
-- Purpose: Fix publish_schedule RPC — two bugs:
--
-- 1. Permission check used defunct 'scheduler' role (removed in 049) and
--    omitted 'super_admin'. Fixes: use caller_company_role() IN ('super_admin','admin').
-- 2. Column names stale: shifts.org_id → company_id (migration 058),
--    schedule_notes.org_id → company_id (migration 048).

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Ensure caller has permission (super_admin or admin)
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_company_role()::TEXT IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- ── A. SHIFTS ──────────────────────────────────────────────────────────────
  -- Update shifts in range: move draft to published
  -- If draft_label is 'OFF', we effectively clear the shift (set published to NULL).
  -- Note: shifts.org_id was renamed to shifts.company_id in migration 058.
  UPDATE public.shifts
  SET published_label = CASE WHEN draft_label = 'OFF' THEN NULL ELSE draft_label END,
      draft_label = NULL,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_label IS NOT NULL;

  -- Clean up shifts that are now empty (OFF drafts that were published, leaving both labels NULL)
  DELETE FROM public.shifts
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND published_label IS NULL
    AND draft_label IS NULL;

  -- ── B. NOTES ───────────────────────────────────────────────────────────────
  -- Commit added notes: status 'draft' -> 'published'
  -- Note: schedule_notes.org_id was renamed to schedule_notes.company_id in migration 048.
  UPDATE public.schedule_notes
  SET status = 'published',
      updated_at = NOW()
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft';

  -- Finalize deleted notes: delete where status 'draft_deleted'
  DELETE FROM public.schedule_notes
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft_deleted';

END;
$$;
