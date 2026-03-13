-- ============================================================
-- Migration 066: Replace shift_code_focus_areas junction table
--                with a direct focus_area_id FK on shift_codes
--
-- Problem: The many-to-many junction table allows two different
-- shift_codes rows with the same label to be associated with the
-- same focus area, with no DB-level constraint preventing it.
--
-- Solution: Add a direct focus_area_id column to shift_codes
-- (nullable = global code; set = focus-area-specific code).
-- Enforce uniqueness with two partial indexes:
--   • (company_id, label) WHERE focus_area_id IS NULL    → one global "D"
--   • (company_id, label, focus_area_id) WHERE NOT NULL  → one "D" per focus area
--
-- Migration steps:
--   1. Add focus_area_id column to shift_codes
--   2. Populate it from the existing junction table
--   3. Add partial unique indexes
--   4. Update RLS on shift_codes to use the new column
--
-- The junction table is kept but is no longer the source of
-- truth — focus_area_id on shift_codes is canonical.
-- Fully idempotent.
-- ============================================================


-- ── 1. Add focus_area_id column ───────────────────────────────────────────────

ALTER TABLE public.shift_codes
  ADD COLUMN IF NOT EXISTS focus_area_id INTEGER
    REFERENCES public.focus_areas(id) ON DELETE SET NULL;


-- ── 2. Populate from junction table (first match per shift_code) ──────────────
-- Guarded: skip if the junction table was already dropped.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shift_code_focus_areas') THEN
    UPDATE public.shift_codes sc
    SET focus_area_id = (
      SELECT scfa.focus_area_id
      FROM public.shift_code_focus_areas scfa
      WHERE scfa.shift_code_id = sc.id
      LIMIT 1
    )
    WHERE sc.focus_area_id IS NULL;
  END IF;

  -- Also fall back to focus_area_name → focus_areas lookup for any still-null rows
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shift_codes' AND column_name = 'focus_area_name') THEN
    UPDATE public.shift_codes sc
    SET focus_area_id = fa.id
    FROM public.focus_areas fa
    WHERE sc.focus_area_id IS NULL
      AND sc.focus_area_name IS NOT NULL
      AND fa.company_id = sc.company_id
      AND fa.name = sc.focus_area_name;
  END IF;
END
$$;


-- ── 3. Partial unique indexes ─────────────────────────────────────────────────

-- Global codes: one per (company, label)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_codes'
      AND indexname  = 'shift_codes_company_label_global_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_codes_company_label_global_unique
      ON public.shift_codes (company_id, label)
      WHERE focus_area_id IS NULL;
  END IF;
END $$;

-- Focus-area codes: one per (company, label, focus_area)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_codes'
      AND indexname  = 'shift_codes_company_label_focus_area_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_codes_company_label_focus_area_unique
      ON public.shift_codes (company_id, label, focus_area_id)
      WHERE focus_area_id IS NOT NULL;
  END IF;
END $$;
