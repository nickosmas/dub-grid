-- 109: Restore on a date (item 51l).
--
-- An Offboarded person can be restored on a later date. The return is 103's
-- planned change with status `active`, held by a `removed` row instead of an
-- Active one: planned_from is the return day, with no end and no absence.
-- Until then they stay Offboarded in every way, so employee_schedulable_on,
-- which refuses any archived row, needs no change, and the planned-days
-- rewrite already returns early for a removed row. Restoring them by any path
-- ends the plan. The daily job restores them on the day the way a manual
-- Restore does.
SET lock_timeout = '5s';

COMMENT ON COLUMN public.employees.planned_status IS
  'A status change planned for planned_from (51g): away, removed after a last day (planned_from is the day after it), or suspended, for an Active person; active, the return day of an Offboarded one (51l). The person stays as they are until then.';

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_planned_status_known,
  ADD CONSTRAINT employees_planned_status_known
    CHECK (planned_status IS NULL OR planned_status IN ('away', 'removed', 'suspended', 'active')),
  DROP CONSTRAINT IF EXISTS employees_planned_only_when_active,
  ADD CONSTRAINT employees_planned_only_when_active
    CHECK (
      planned_status IS NULL
      OR (planned_status = 'active' AND status = 'removed')
      OR (
        planned_status <> 'active'
        AND status = 'active'
        AND archived_at IS NULL
        AND suspended_at IS NULL
      )
    ),
  DROP CONSTRAINT IF EXISTS employees_planned_return_has_no_end,
  ADD CONSTRAINT employees_planned_return_has_no_end
    CHECK (
      planned_status IS DISTINCT FROM 'active'
      OR (planned_until IS NULL AND planned_absence_type_id IS NULL)
    );

-- 105's guard, with a planned return kept while they stay Offboarded and
-- ended when they're restored; every other plan still ends on leaving Active.
CREATE OR REPLACE FUNCTION public.clear_away_until_off_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'inactive' OR NEW.archived_at IS NOT NULL THEN
    NEW.away_until := NULL;
  END IF;
  IF NEW.away_until IS NULL THEN
    NEW.away_absence_type_id := NULL;
  END IF;
  IF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL THEN
    NEW.suspended_at := NULL;
    NEW.suspended_by := NULL;
  END IF;
  IF NEW.suspended_at IS NULL THEN
    NEW.suspended_until := NULL;
  END IF;
  IF NEW.planned_status = 'active' THEN
    IF NEW.status <> 'removed' THEN
      NEW.planned_status := NULL;
    END IF;
  ELSIF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL OR NEW.suspended_at IS NOT NULL THEN
    NEW.planned_status := NULL;
  END IF;
  IF NEW.planned_status IS NULL THEN
    NEW.planned_from := NULL;
    NEW.planned_until := NULL;
    NEW.planned_note := NULL;
    NEW.planned_by := NULL;
  END IF;
  IF NEW.planned_until IS NULL THEN
    NEW.planned_absence_type_id := NULL;
  END IF;
  IF NEW.away_absence_type_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.away_absence_type_id IS DISTINCT FROM OLD.away_absence_type_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types a
      WHERE a.id = NEW.away_absence_type_id
        AND a.org_id = NEW.org_id
        AND a.archived_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Absence type not found in this organization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.planned_absence_type_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.planned_absence_type_id IS DISTINCT FROM OLD.planned_absence_type_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types a
      WHERE a.id = NEW.planned_absence_type_id
        AND a.org_id = NEW.org_id
        AND a.archived_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Absence type not found in this organization'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_away_until_off_away() FROM PUBLIC, anon, authenticated;
