-- ============================================================
-- DubGrid Migration 030: Remove redundant designations column
-- ============================================================
-- The organizations table now uses skill_levels (TEXT[]) to store 
-- the categories formerly described as "designations".
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'organizations' 
          AND column_name = 'designations'
    ) THEN
        ALTER TABLE public.organizations DROP COLUMN designations;
    END IF;
END $$;
