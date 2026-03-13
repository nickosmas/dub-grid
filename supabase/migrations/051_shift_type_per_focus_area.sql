-- ============================================================
-- Migration 051: Per-focus-area shift type definitions
--
-- Problem: shift_types had UNIQUE (company_id, label) which
-- prevented the same label code (e.g. "D") from being
-- configured differently in different focus areas.
-- e.g. ICU "D" 07:00–15:30 vs Emergency "D" 07:00–19:00.
--
-- Solution:
--   1. Drop the existing global unique constraint on
--      (company_id, label).
--   2. Replace with two partial unique indexes:
--      a) (company_id, label) WHERE focus_area_name IS NULL
--         → general shifts remain globally unique per company
--      b) (company_id, label, focus_area_name) WHERE focus_area_name IS NOT NULL
--         → per-focus-area shifts unique within their area
--
-- This means:
--   • General shifts (focus_area_name IS NULL) keep a single
--     company-wide code — useful for OFF/SICK/VAC/FLOAT etc.
--   • Focus-area shifts can reuse the same label code across
--     different areas, each with independent configuration
--     (start/end times, colors, designations, category, etc.)
--
-- Client-side resolution: getShiftStyle(label, focusAreaName?)
--   → look up (label, focusAreaName) first
--   → fall back to (label, NULL) for generals/cross-section use
--
-- Fully idempotent.
-- ============================================================


-- ── 1. Drop the old global unique constraint ──────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema      = 'public'
      AND table_name        = 'shift_types'
      AND constraint_name   = 'shift_types_company_id_label_key'
      AND constraint_type   = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_types
      DROP CONSTRAINT shift_types_company_id_label_key;
  END IF;
END $$;


-- ── 2. Create partial unique index for general shifts ─────────────────────────
--    (company_id, label) unique when focus_area_name IS NULL

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_types'
      AND indexname  = 'shift_types_company_label_general_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_types_company_label_general_unique
      ON public.shift_types (company_id, label)
      WHERE focus_area_name IS NULL;
  END IF;
END $$;


-- ── 3. Create partial unique index for focus-area-specific shifts ─────────────
--    (company_id, label, focus_area_name) unique when focus_area_name IS NOT NULL

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'shift_types'
      AND indexname  = 'shift_types_company_label_area_unique'
  ) THEN
    CREATE UNIQUE INDEX shift_types_company_label_area_unique
      ON public.shift_types (company_id, label, focus_area_name)
      WHERE focus_area_name IS NOT NULL;
  END IF;
END $$;
