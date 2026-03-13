-- ============================================================
-- Migration 054: Per-focus-area shift categories
--
-- Problem: shift_categories had UNIQUE (company_id, name) and
-- UNIQUE (company_id, code) which forced all categories to be
-- company-global. Different focus areas couldn't have their own
-- "Day" category with different time windows (e.g. ICU Day 07:00–15:30
-- vs Emergency Day 07:00–19:00).
--
-- Solution:
--   1. Add nullable focus_area_id FK to shift_categories.
--      NULL  = global category (used by general/off-day shift codes)
--      non-NULL = focus-area-specific category
--   2. Drop the existing company-wide UNIQUE constraints.
--   3. Replace with four partial unique indexes:
--      a) (company_id, name)              WHERE focus_area_id IS NULL
--      b) (company_id, focus_area_id, name) WHERE focus_area_id IS NOT NULL
--      c) (company_id, code)              WHERE focus_area_id IS NULL
--      d) (company_id, focus_area_id, code) WHERE focus_area_id IS NOT NULL
--   4. Cascade: focus_area deleted → its categories are deleted too (CASCADE).
--
-- Existing rows are left with focus_area_id = NULL (global) — no data loss.
--
-- Fully idempotent.
-- ============================================================


-- ── 1. Add focus_area_id column (nullable) ────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'shift_categories'
      AND column_name  = 'focus_area_id'
  ) THEN
    ALTER TABLE public.shift_categories
      ADD COLUMN focus_area_id bigint
        REFERENCES public.focus_areas(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ── 2. Drop old company-wide UNIQUE constraints ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema   = 'public'
      AND table_name     = 'shift_categories'
      AND constraint_name = 'shift_categories_company_id_name_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_categories
      DROP CONSTRAINT shift_categories_company_id_name_key;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema   = 'public'
      AND table_name     = 'shift_categories'
      AND constraint_name = 'shift_categories_company_id_code_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_categories
      DROP CONSTRAINT shift_categories_company_id_code_key;
  END IF;
END $$;


-- ── 3. Create partial unique indexes ─────────────────────────────────────────

-- Global: (company_id, name) unique when focus_area_id IS NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_categories'
      AND indexname  = 'shift_categories_global_name_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_categories_global_name_unique
      ON public.shift_categories (company_id, name)
      WHERE focus_area_id IS NULL;
  END IF;
END $$;

-- Per-area: (company_id, focus_area_id, name) unique when focus_area_id IS NOT NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_categories'
      AND indexname  = 'shift_categories_area_name_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_categories_area_name_unique
      ON public.shift_categories (company_id, focus_area_id, name)
      WHERE focus_area_id IS NOT NULL;
  END IF;
END $$;

-- Global: (company_id, code) unique when focus_area_id IS NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_categories'
      AND indexname  = 'shift_categories_global_code_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_categories_global_code_unique
      ON public.shift_categories (company_id, code)
      WHERE focus_area_id IS NULL;
  END IF;
END $$;

-- Per-area: (company_id, focus_area_id, code) unique when focus_area_id IS NOT NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_categories'
      AND indexname  = 'shift_categories_area_code_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_categories_area_code_unique
      ON public.shift_categories (company_id, focus_area_id, code)
      WHERE focus_area_id IS NOT NULL;
  END IF;
END $$;
