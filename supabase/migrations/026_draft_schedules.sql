-- Migration: 026_draft_schedules.sql
-- Purpose: Support draft vs published states for shifts.
--
-- We rename the existing shift_label to draft_label and add published_label.
-- All existing shifts are considered published.

-- 1. Add published_label and rename shift_label to draft_label
ALTER TABLE public.shifts 
  RENAME COLUMN shift_label TO draft_label;

ALTER TABLE public.shifts 
  ADD COLUMN published_label TEXT;

-- 2. Backfill existing shifts to be published
UPDATE public.shifts
SET published_label = draft_label,
    draft_label = NULL;

-- 3. Create RPC for publishing schedule
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

END;
$$;
