-- Migration: 025_audit_columns.sql
-- Purpose: Add created_by, updated_by, created_at, and updated_at to organizations, wings, shift_types, employees, and schedule_notes.
--          Installs a trigger to automatically update these fields.

-- 1. Create a generic trigger function
CREATE OR REPLACE FUNCTION public.set_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Always set updated_at when updating
  NEW.updated_at = NOW();
  
  -- If auth.uid() is available (called from a client), record the user ID
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by = auth.uid();
      NEW.updated_by = auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_by = auth.uid();
      -- Ensure created_by doesn't get overwritten on UPDATE
      NEW.created_by = OLD.created_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Add columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_organizations_audit ON public.organizations;
CREATE TRIGGER trigger_organizations_audit
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


-- 3. Add columns to wings
ALTER TABLE public.wings
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_wings_audit ON public.wings;
CREATE TRIGGER trigger_wings_audit
  BEFORE INSERT OR UPDATE ON public.wings
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


-- 4. Add columns to shift_types
ALTER TABLE public.shift_types
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_shift_types_audit ON public.shift_types;
CREATE TRIGGER trigger_shift_types_audit
  BEFORE INSERT OR UPDATE ON public.shift_types
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


-- 5. Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_employees_audit ON public.employees;
CREATE TRIGGER trigger_employees_audit
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


-- 6. Add updated_by to schedule_notes (created_by and created_at/updated_at already exist)
ALTER TABLE public.schedule_notes
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trigger_schedule_notes_audit ON public.schedule_notes;
CREATE TRIGGER trigger_schedule_notes_audit
  BEFORE INSERT OR UPDATE ON public.schedule_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();


-- 7. Modify the existing shifts trigger to use the new generic audit trigger
-- Shifts already has created_by, updated_by, created_at, updated_at
DROP TRIGGER IF EXISTS trigger_shifts_updated_at ON public.shifts;
DROP TRIGGER IF EXISTS trigger_shifts_audit ON public.shifts;

CREATE TRIGGER trigger_shifts_audit
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();
