-- Migration 058: Rename shifts.org_id → shifts.company_id
--
-- Migration 048 incorrectly noted that the shifts table had no direct org_id
-- column and skipped renaming it. This migration corrects that oversight.
--
-- Changes:
--   1. Rename shifts.org_id → shifts.company_id (idempotent)
--   2. Drop stale index idx_shifts_org_date, recreate as idx_shifts_company_date
-- ============================================================

-- ── 1. Column rename (idempotent) ────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shifts' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.shifts RENAME COLUMN org_id TO company_id;
  END IF;
END $$;

-- ── 2. Recreate index with updated column name ────────────────────────────────

DROP INDEX IF EXISTS public.idx_shifts_org_date;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'shifts' AND indexname = 'idx_shifts_company_date'
  ) THEN
    CREATE INDEX idx_shifts_company_date ON public.shifts(company_id, date);
  END IF;
END $$;
