-- 120: A suspended person can't be marked away.
--
-- A Suspended person is `active` with suspended_at set (101). Moving them to
-- `inactive` (Away) cleared suspended_at in this trigger, since a suspension
-- only lives on an Active row, and the access-token hook refuses sign-in only
-- on suspended_at, so marking a suspended person away quietly gave their
-- access back. The owner's rule is that a suspended person is reinstated
-- before anything else; the routes follow it, and the database now refuses it
-- too:
--   - an update that moves a suspended person from active to inactive, unless
--     the same update lifts the suspension (sets suspended_at to NULL);
--   - planning time away (planned_status 'away') for someone suspended, which
--     this trigger used to drop without a word.
-- Offboarding a suspended person (status `removed`) still clears the
-- suspension as before, and a suspension still cancels time away already
-- planned. The daily job starts planned time away only for people who aren't
-- suspended, and a suspension can't coexist with a planned one, so it never
-- meets either refusal.
--
-- Both raise check_violation with a message the routes can show.
SET lock_timeout = '5s';

-- 109's guard, with the two refusals first.
CREATE OR REPLACE FUNCTION public.clear_away_until_off_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'active'
    AND OLD.suspended_at IS NOT NULL
    AND NEW.status = 'inactive'
    AND NEW.suspended_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'A suspended person can''t be marked away. Reinstate them first.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.planned_status = 'away'
    AND NEW.suspended_at IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.planned_status IS DISTINCT FROM 'away')
  THEN
    RAISE EXCEPTION 'A suspended person can''t have time away planned. Reinstate them first.'
      USING ERRCODE = 'check_violation';
  END IF;
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
