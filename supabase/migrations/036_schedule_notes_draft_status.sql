-- Migration: 036_schedule_notes_draft_status.sql
-- Purpose: Support draft vs published states for schedule notes.
--          Allows notes added or deleted in "Edit Mode" to be part of the 
--          Publish/Discard flow.

-- 1. Add status column
-- Values: 'published', 'draft', 'draft_deleted'
ALTER TABLE public.schedule_notes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'draft', 'draft_deleted'));

-- 2. Update publish_schedule RPC to handle notes
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Ensure caller has permission (Admin or Scheduler)
  IF NOT (
    public.is_gridmaster() 
    OR (
      public.caller_org_id() = p_org_id 
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- ── A. SHIFTS ──────────────────────────────────────────────────────────────
  -- Update shifts in range: move draft to published
  -- If draft_label is 'OFF', we effectively clear the shift (set published to NULL).
  UPDATE public.shifts
  SET published_label = CASE WHEN draft_label = 'OFF' THEN NULL ELSE draft_label END,
      draft_label = NULL,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_label IS NOT NULL;

  -- Clean up shifts that are now empty (OFF drafts that were published, leaving both labels NULL)
  DELETE FROM public.shifts
  WHERE org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND published_label IS NULL 
    AND draft_label IS NULL;

  -- ── B. NOTES ───────────────────────────────────────────────────────────────
  -- Commit added notes: status 'draft' -> 'published'
  UPDATE public.schedule_notes
  SET status = 'published',
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft';

  -- Finalize deleted notes: delete where status 'draft_deleted'
  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft_deleted';

END;
$$;
