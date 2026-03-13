-- Migration: 027_draft_shifts.sql
-- Purpose: Add drafting/publishing capability to shifts.
-- Note: Migration 026 already renamed shift_label → draft_label, so this
-- only ensures columns exist and handles any remaining backfill.

-- 1. Ensure columns exist (idempotent)
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS draft_label TEXT,
  ADD COLUMN IF NOT EXISTS published_label TEXT;

-- 2. Backfill only if shift_label still exists (026 may have already renamed it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shifts' AND column_name = 'shift_label'
  ) THEN
    EXECUTE 'UPDATE public.shifts SET draft_label = shift_label, published_label = shift_label WHERE shift_label IS NOT NULL';
    EXECUTE 'ALTER TABLE public.shifts DROP COLUMN shift_label';
  END IF;
END $$;

-- 4. Create the publish RPC
-- This takes all drafts for an org within a date range and publishes them.
-- If draft_label is 'OFF', it clears the shift entirely (simulated deletion).
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ensure caller is authorized
  IF NOT (
    public.is_gridmaster() 
    OR (
      p_org_id = public.caller_org_id() 
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- 1. Apply draft -> published for standard drafts
  UPDATE public.shifts
  SET 
    published_label = draft_label,
    updated_at = NOW(),
    -- if called from a user context, set updated_by
    updated_by = COALESCE(auth.uid(), updated_by)
  WHERE 
    org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_label IS NOT NULL
    AND draft_label != 'OFF'
    AND draft_label != COALESCE(published_label, '');

  -- 2. Delete rows where draft_label was explicitly set to 'OFF' (simulated deletion)
  DELETE FROM public.shifts
  WHERE 
    org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_label = 'OFF';

  -- 3. (Optional cleanup) For good measure, clear any remaining shifts where published_label is null
  DELETE FROM public.shifts
  WHERE 
    org_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND published_label IS NULL;

END;
$$;
