-- ============================================================
-- Migration 050: Shift Categories
--
-- Replaces hardcoded counts_toward_day / counts_toward_eve /
-- counts_toward_night / is_orientation boolean columns on
-- shift_types with a per-company shift_categories table.
--
-- Each company defines its own categories (e.g. "Day", "Evening",
-- "Night") with custom names, short codes, colors, and optional
-- time windows. Shift types reference a category via FK.
--
-- Steps:
--   1. Create public.shift_categories table + RLS
--   2. Seed one category row per company for each boolean flag
--      that has at least one shift_type using it
--   3. Add category_id FK column to shift_types (nullable)
--   4. Backfill category_id from existing boolean flags
--      (priority: day > eve > night > orientation)
--   5. Drop counts_toward_day, counts_toward_eve,
--      counts_toward_night, is_orientation from shift_types
--
-- Fully idempotent: every step guards with IF NOT EXISTS /
-- column existence checks.
-- ============================================================


-- ── 1. Create shift_categories ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shift_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid   NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text   NOT NULL,        -- full name, e.g. "Day", "Evening"
  code        text   NOT NULL,        -- short label shown on tally rows, e.g. "D", "EVE"
  color       text   NOT NULL DEFAULT '#F8FAFC',
  start_time  time,                   -- optional window start (informational)
  end_time    time,                   -- optional window end
  sort_order  int    NOT NULL DEFAULT 0,
  UNIQUE (company_id, name),
  UNIQUE (company_id, code)
);

ALTER TABLE public.shift_categories ENABLE ROW LEVEL SECURITY;

-- Gridmaster: full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_categories'
      AND policyname = 'gridmaster_all_shift_categories'
  ) THEN
    CREATE POLICY "gridmaster_all_shift_categories"
      ON public.shift_categories FOR ALL TO authenticated
      USING (public.is_gridmaster())
      WITH CHECK (public.is_gridmaster());
  END IF;
END $$;

-- All org members: read own company's categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_categories'
      AND policyname = 'org_members_select_shift_categories'
  ) THEN
    CREATE POLICY "org_members_select_shift_categories"
      ON public.shift_categories FOR SELECT TO authenticated
      USING (company_id = public.caller_org_id());
  END IF;
END $$;

-- Admin / super_admin / scheduler: create, update, delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_categories'
      AND policyname = 'scheduler_insert_shift_categories'
  ) THEN
    CREATE POLICY "scheduler_insert_shift_categories"
      ON public.shift_categories FOR INSERT TO authenticated
      WITH CHECK (
        company_id = public.caller_org_id()
        AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_categories'
      AND policyname = 'scheduler_update_shift_categories'
  ) THEN
    CREATE POLICY "scheduler_update_shift_categories"
      ON public.shift_categories FOR UPDATE TO authenticated
      USING (
        company_id = public.caller_org_id()
        AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
      )
      WITH CHECK (company_id = public.caller_org_id());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_categories'
      AND policyname = 'scheduler_delete_shift_categories'
  ) THEN
    CREATE POLICY "scheduler_delete_shift_categories"
      ON public.shift_categories FOR DELETE TO authenticated
      USING (
        company_id = public.caller_org_id()
        AND public.caller_org_role() IN ('admin', 'super_admin', 'scheduler')
      );
  END IF;
END $$;


-- ── 2. Seed default categories from existing boolean flags ────────────────────
--
-- For each company that has at least one shift_type with a given boolean=true,
-- insert a default category. Companies with no shift_types using a given flag
-- get no category for it (clean slate).
--
-- Only runs if the old columns still exist (idempotent on re-run after column drop).

DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'shift_types'
      AND column_name  = 'counts_toward_day'
  ) INTO col_exists;

  IF col_exists THEN
    -- Day
    INSERT INTO public.shift_categories (company_id, name, code, color, sort_order)
    SELECT DISTINCT company_id, 'Day', 'DAY', '#EFF6FF', 0
    FROM   public.shift_types
    WHERE  counts_toward_day = true
    ON CONFLICT (company_id, name) DO NOTHING;

    -- Evening
    INSERT INTO public.shift_categories (company_id, name, code, color, sort_order)
    SELECT DISTINCT company_id, 'Evening', 'EVE', '#FFF7ED', 1
    FROM   public.shift_types
    WHERE  counts_toward_eve = true
    ON CONFLICT (company_id, name) DO NOTHING;

    -- Night
    INSERT INTO public.shift_categories (company_id, name, code, color, sort_order)
    SELECT DISTINCT company_id, 'Night', 'NGT', '#F5F3FF', 2
    FROM   public.shift_types
    WHERE  counts_toward_night = true
    ON CONFLICT (company_id, name) DO NOTHING;

    -- Orientation
    INSERT INTO public.shift_categories (company_id, name, code, color, sort_order)
    SELECT DISTINCT company_id, 'Orientation', 'ORI', '#F0FDF4', 3
    FROM   public.shift_types
    WHERE  is_orientation = true
    ON CONFLICT (company_id, name) DO NOTHING;
  END IF;
END $$;


-- ── 3. Add category_id FK to shift_types ─────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'shift_types'
      AND column_name  = 'category_id'
  ) THEN
    ALTER TABLE public.shift_types
      ADD COLUMN category_id bigint
        REFERENCES public.shift_categories(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ── 4. Backfill category_id from boolean flags ────────────────────────────────
--
-- Priority: day > evening > night > orientation
-- Only runs if old boolean columns still exist.

DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'shift_types'
      AND column_name  = 'counts_toward_day'
  ) INTO col_exists;

  IF col_exists THEN
    -- Day
    UPDATE public.shift_types st
    SET    category_id = sc.id
    FROM   public.shift_categories sc
    WHERE  sc.company_id = st.company_id
      AND  sc.name       = 'Day'
      AND  st.counts_toward_day = true
      AND  st.category_id IS NULL;

    -- Evening (only if not already set by day)
    UPDATE public.shift_types st
    SET    category_id = sc.id
    FROM   public.shift_categories sc
    WHERE  sc.company_id = st.company_id
      AND  sc.name       = 'Evening'
      AND  st.counts_toward_eve = true
      AND  st.category_id IS NULL;

    -- Night
    UPDATE public.shift_types st
    SET    category_id = sc.id
    FROM   public.shift_categories sc
    WHERE  sc.company_id = st.company_id
      AND  sc.name       = 'Night'
      AND  st.counts_toward_night = true
      AND  st.category_id IS NULL;

    -- Orientation
    UPDATE public.shift_types st
    SET    category_id = sc.id
    FROM   public.shift_categories sc
    WHERE  sc.company_id = st.company_id
      AND  sc.name       = 'Orientation'
      AND  st.is_orientation = true
      AND  st.category_id IS NULL;
  END IF;
END $$;


-- ── 5. Drop obsolete boolean columns from shift_types ─────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types'
      AND column_name = 'counts_toward_day'
  ) THEN
    ALTER TABLE public.shift_types DROP COLUMN counts_toward_day;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types'
      AND column_name = 'counts_toward_eve'
  ) THEN
    ALTER TABLE public.shift_types DROP COLUMN counts_toward_eve;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types'
      AND column_name = 'counts_toward_night'
  ) THEN
    ALTER TABLE public.shift_types DROP COLUMN counts_toward_night;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_types'
      AND column_name = 'is_orientation'
  ) THEN
    ALTER TABLE public.shift_types DROP COLUMN is_orientation;
  END IF;
END $$;
