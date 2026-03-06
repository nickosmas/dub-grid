-- ==========================================
-- REMOVE DUPLICATE EMPLOYEES & ADD CONSTRAINT
-- ==========================================
-- 1. Run this block in the Supabase SQL Editor.
-- 2. It will delete duplicate employees (keeping the one with the smallest ID).
-- 3. Then it will add a UNIQUE constraint to prevent future duplicates.

DO $$
BEGIN
  -- 1. Delete duplicate employees (along with their shifts due to ON DELETE CASCADE)
  DELETE FROM employees e1
  USING employees e2
  WHERE e1.org_id = e2.org_id
    AND e1.name = e2.name
    AND e1.id > e2.id;
    
  -- 2. Add the unique constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_org_id_name_key'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_org_id_name_key UNIQUE (org_id, name);
    RAISE NOTICE 'Added UNIQUE constraint to employees table.';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists.';
  END IF;

  RAISE NOTICE 'Successfully removed duplicate employees.';
END $$;
