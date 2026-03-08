-- ============================================================
-- DubGrid Migration: Enhance shifts table with audit history
-- ============================================================
-- Keeps the simple shift_label model from v1 (emp_id, date,
-- shift_label) and adds org_id + audit columns for history
-- tracking (created_by, updated_by, created_at, updated_at).
-- Requirements: 3.1, 3.5, 7.1, 7.2
-- ============================================================

-- ── 1. ALTER shifts TABLE ─────────────────────────────────────────────────────
-- Add org_id and audit columns to the existing shifts table.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS org_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version    BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 2. INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_shifts_org_date ON public.shifts (org_id, date);

-- ── 3. UPDATED_AT TRIGGER ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_shifts_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON public.shifts;
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_shifts_updated_at();

