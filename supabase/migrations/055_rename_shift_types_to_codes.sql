-- ============================================================
-- Migration 055: Rename shift_types → shift_codes
--
-- "Shift code" more precisely describes each record: the label
-- field IS the code shown in grid cells (e.g. "D", "EVE", "N").
-- "Shift types" was ambiguous; "shift codes" aligns with how
-- staff schedulers and healthcare facilities use the term.
--
-- Steps:
--   1. Rename the table: shift_types → shift_codes
--   2. Rename partial unique indexes created in migration 051
--   3. Rename admin_permissions JSONB key in profiles:
--      canManageShiftTypes → canManageShiftCodes
--
-- Notes:
--   - All FK references auto-update in PostgreSQL on table rename
--   - RLS policies follow the table rename automatically
--   - Index names are cosmetic but kept consistent
--
-- Fully idempotent.
-- ============================================================


-- ── 1. Rename table ───────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shift_types'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shift_codes'
  ) THEN
    ALTER TABLE public.shift_types RENAME TO shift_codes;
  END IF;
END $$;


-- ── 2. Rename partial unique indexes ─────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'shift_types_company_label_general_unique'
  ) THEN
    ALTER INDEX public.shift_types_company_label_general_unique
      RENAME TO shift_codes_company_label_general_unique;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'shift_types_company_label_area_unique'
  ) THEN
    ALTER INDEX public.shift_types_company_label_area_unique
      RENAME TO shift_codes_company_label_area_unique;
  END IF;
END $$;


-- ── 3. Rename canManageShiftTypes → canManageShiftCodes in admin_permissions ──
--
-- Migrates the JSONB key in profiles.admin_permissions for any rows
-- that still have the old key name.

UPDATE public.profiles
SET admin_permissions =
  (admin_permissions - 'canManageShiftTypes')
  || jsonb_build_object('canManageShiftCodes', admin_permissions -> 'canManageShiftTypes')
WHERE admin_permissions ? 'canManageShiftTypes';
