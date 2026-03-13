-- Migration 071: Normalize shifts to reference shift_codes via FK
--
-- Replaces text columns (draft_label, published_label) with integer array
-- FK columns (draft_shift_code_ids, published_shift_code_ids) pointing to
-- shift_codes.id. Adds draft_is_delete boolean to replace the "OFF" sentinel.
--
-- Also normalizes regular_shifts.shift_label and shift_series.shift_label
-- to single FK columns (shift_code_id).

-- ── 1. Add new columns ──────────────────────────────────────────────────────

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS draft_shift_code_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_shift_code_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS draft_is_delete BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.regular_shifts
  ADD COLUMN IF NOT EXISTS shift_code_id INTEGER
    REFERENCES public.shift_codes(id) ON DELETE CASCADE;

ALTER TABLE public.shift_series
  ADD COLUMN IF NOT EXISTS shift_code_id INTEGER
    REFERENCES public.shift_codes(id) ON DELETE CASCADE;

-- ── 2. Backfill data ────────────────────────────────────────────────────────

-- Helper: resolve company_id + label → shift_code.id (prefer global code)
CREATE OR REPLACE FUNCTION _mig071_resolve_code_id(
  p_company_id UUID,
  p_label TEXT
) RETURNS INTEGER AS $$
  SELECT id FROM public.shift_codes
  WHERE company_id = p_company_id AND label = p_label
  ORDER BY
    CASE WHEN focus_area_id IS NULL THEN 0 ELSE 1 END,
    id
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Helper: resolve a slash-separated label string to an array of shift_code IDs
CREATE OR REPLACE FUNCTION _mig071_resolve_code_ids(
  p_company_id UUID,
  p_label TEXT
) RETURNS INTEGER[] AS $$
  SELECT COALESCE(
    ARRAY_AGG(_mig071_resolve_code_id(p_company_id, part.val) ORDER BY part.ord),
    '{}'
  )
  FROM unnest(string_to_array(p_label, '/'))
    WITH ORDINALITY AS part(val, ord)
  WHERE _mig071_resolve_code_id(p_company_id, part.val) IS NOT NULL;
$$ LANGUAGE SQL STABLE;

-- Backfill shifts: draft side
UPDATE public.shifts
SET
  draft_is_delete = (draft_label = 'OFF'),
  draft_shift_code_ids = CASE
    WHEN draft_label IS NULL OR draft_label = 'OFF' THEN '{}'
    ELSE _mig071_resolve_code_ids(company_id, draft_label)
  END
WHERE draft_label IS NOT NULL;

-- Backfill shifts: published side
UPDATE public.shifts
SET published_shift_code_ids = _mig071_resolve_code_ids(company_id, published_label)
WHERE published_label IS NOT NULL;

-- Backfill regular_shifts
UPDATE public.regular_shifts
SET shift_code_id = _mig071_resolve_code_id(company_id, shift_label)
WHERE shift_label IS NOT NULL AND shift_label != '';

-- Backfill shift_series
UPDATE public.shift_series
SET shift_code_id = _mig071_resolve_code_id(company_id, shift_label)
WHERE shift_label IS NOT NULL AND shift_label != '';

-- Drop helpers
DROP FUNCTION _mig071_resolve_code_ids(UUID, TEXT);
DROP FUNCTION _mig071_resolve_code_id(UUID, TEXT);

-- ── 3. Drop old columns ─────────────────────────────────────────────────────

ALTER TABLE public.shifts
  DROP COLUMN IF EXISTS draft_label,
  DROP COLUMN IF EXISTS published_label;

ALTER TABLE public.regular_shifts
  DROP COLUMN IF EXISTS shift_label;

ALTER TABLE public.shift_series
  DROP COLUMN IF EXISTS shift_label;

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shifts_draft_code_ids
  ON public.shifts USING GIN(draft_shift_code_ids);

CREATE INDEX IF NOT EXISTS idx_shifts_published_code_ids
  ON public.shifts USING GIN(published_shift_code_ids);

CREATE INDEX IF NOT EXISTS idx_regular_shifts_code_id
  ON public.regular_shifts(shift_code_id);

CREATE INDEX IF NOT EXISTS idx_shift_series_code_id
  ON public.shift_series(shift_code_id);

-- ── 5. Update publish_schedule RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Permission check (unchanged from migration 063)
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_company_role()::TEXT IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- ── A. SHIFTS ────────────────────────────────────────────────────────────

  -- 1. Handle deletion drafts: clear the published side
  UPDATE public.shifts
  SET published_shift_code_ids = '{}',
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_is_delete = TRUE;

  -- 2. Publish non-delete drafts: copy draft → published
  UPDATE public.shifts
  SET published_shift_code_ids = draft_shift_code_ids,
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND array_length(draft_shift_code_ids, 1) > 0
    AND draft_is_delete = FALSE;

  -- 3. Clean up empty rows (both sides empty, no delete pending)
  DELETE FROM public.shifts
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (published_shift_code_ids = '{}' OR published_shift_code_ids IS NULL)
    AND (draft_shift_code_ids = '{}' OR draft_shift_code_ids IS NULL)
    AND draft_is_delete = FALSE;

  -- ── B. NOTES ─────────────────────────────────────────────────────────────

  UPDATE public.schedule_notes
  SET status = 'published',
      updated_at = NOW()
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft';

  DELETE FROM public.schedule_notes
  WHERE company_id = p_org_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft_deleted';

END;
$$;
