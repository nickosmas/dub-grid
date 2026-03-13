-- ============================================================
-- Migration 057: Drop code column from shift_categories
--
-- The code field was intended as a short tally label but is
-- not needed — category names serve this purpose directly.
-- ============================================================

-- Drop partial unique indexes on code first
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'shift_categories' AND indexname = 'shift_categories_global_code_unique'
  ) THEN
    DROP INDEX public.shift_categories_global_code_unique;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'shift_categories' AND indexname = 'shift_categories_area_code_unique'
  ) THEN
    DROP INDEX public.shift_categories_area_code_unique;
  END IF;
END $$;

-- Drop the code column
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shift_categories' AND column_name = 'code'
  ) THEN
    ALTER TABLE public.shift_categories DROP COLUMN code;
  END IF;
END $$;
