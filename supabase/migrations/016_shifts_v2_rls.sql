-- ============================================================
-- DubGrid RBAC Migration: RLS Policies for shifts Table
-- ============================================================
-- Implements Row Level Security policies for the shifts table:
-- - SELECT: org members can read shifts in their org
-- - INSERT/UPDATE/DELETE: scheduler+ roles only
-- - Gridmaster bypass for all operations
-- Requirements: 7.4
-- ============================================================

-- ── 1. ENSURE COLUMNS EXIST + ENABLE RLS ──────────────────────────────────────
-- Idempotent column additions in case migration 007 was partially applied.

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS org_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version    BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_shifts_org_date ON public.shifts (org_id, date);

CREATE OR REPLACE FUNCTION public.update_shifts_updated_at()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON public.shifts;
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_shifts_updated_at();

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Re-run safety
DROP POLICY IF EXISTS "shifts_select"  ON public.shifts;
DROP POLICY IF EXISTS "shifts_insert"  ON public.shifts;
DROP POLICY IF EXISTS "shifts_update"  ON public.shifts;
DROP POLICY IF EXISTS "shifts_delete"  ON public.shifts;

-- ── 2. SELECT POLICY ──────────────────────────────────────────────────────────

CREATE POLICY "shifts_select" ON public.shifts
  FOR SELECT
  USING (
    public.is_gridmaster()
    OR org_id = public.caller_org_id()
  );

-- ── 3. INSERT POLICY ──────────────────────────────────────────────────────────

CREATE POLICY "shifts_insert" ON public.shifts
  FOR INSERT
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

-- ── 4. UPDATE POLICY ──────────────────────────────────────────────────────────

CREATE POLICY "shifts_update" ON public.shifts
  FOR UPDATE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  )
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );

-- ── 5. DELETE POLICY ──────────────────────────────────────────────────────────

CREATE POLICY "shifts_delete" ON public.shifts
  FOR DELETE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'scheduler')
    )
  );
