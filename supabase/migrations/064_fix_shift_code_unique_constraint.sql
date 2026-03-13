-- ============================================================
-- Migration 064: Fix shift_code uniqueness — drop legacy constraint
--
-- Problem: The original schema created UNIQUE(org_id, label) on
-- shift_types, named 'shift_types_org_id_label_key'. When org_id
-- was renamed to company_id (migration 048) the constraint kept
-- its original name. Migration 051 tried to drop the constraint
-- by the wrong name ('shift_types_company_id_label_key'), so the
-- old constraint survived all subsequent migrations unnoticed.
--
-- Additionally, the partial unique indexes added by migration 051
-- are predicated on (focus_area_name IS NULL). Since migration 056
-- made the junction table the source of truth and upsertShiftCode
-- always writes focus_area_name = NULL, these indexes cover ALL
-- rows — still blocking the same label in different focus areas.
--
-- Fix:
--   1. Drop the legacy global unique constraint.
--   2. Drop the focus_area_name-based partial unique indexes.
--
-- Uniqueness semantics after this migration:
--   • Global codes (no junction rows): enforced at application level.
--   • Per-focus-area codes: the junction table PK prevents the same
--     shift_code from being linked to the same focus area twice.
--     Different rows with the same label but different focus areas
--     are explicitly allowed (that's the new intended behavior).
--
-- Fully idempotent.
-- ============================================================


-- ── 1. Drop the legacy global unique constraint ───────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'shift_codes'
      AND constraint_name = 'shift_types_org_id_label_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_codes DROP CONSTRAINT shift_types_org_id_label_key;
  END IF;
END $$;

-- Safety: also drop any variant if it was recreated under a different name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'shift_codes'
      AND constraint_name = 'shift_codes_company_id_label_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_codes DROP CONSTRAINT shift_codes_company_id_label_key;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'shift_codes'
      AND constraint_name = 'shift_types_company_id_label_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE public.shift_codes DROP CONSTRAINT shift_types_company_id_label_key;
  END IF;
END $$;


-- ── 2. Drop focus_area_name-based partial unique indexes ──────────────────────
--    These were created by migration 051 and renamed by migration 055.
--    They are predicated on focus_area_name IS NULL / IS NOT NULL, but since
--    focus_area_name is now always NULL (junction table is source of truth),
--    the IS NULL index covers all rows — same blocking effect as the full
--    unique constraint.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'shift_codes_company_label_general_unique'
  ) THEN
    DROP INDEX public.shift_codes_company_label_general_unique;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'shift_codes_company_label_area_unique'
  ) THEN
    DROP INDEX public.shift_codes_company_label_area_unique;
  END IF;
END $$;

-- Also drop old names from before migration 055 rename (if still present)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'shift_types_company_label_general_unique'
  ) THEN
    DROP INDEX public.shift_types_company_label_general_unique;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'shift_types_company_label_area_unique'
  ) THEN
    DROP INDEX public.shift_types_company_label_area_unique;
  END IF;
END $$;
