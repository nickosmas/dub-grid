-- 108: One Offboard (item 51k).
--
-- Offboarding someone now ends their organization membership whoever does it,
-- so the employee row and the membership always agree. Two changes:
--
-- 1. A pickup they claimed goes back up for others when they're offboarded,
--    as suspending them does (102), instead of expiring on whoever offered it.
--    Everything else they're part of still expires, as before (002).
-- 2. A one-off repair: a membership still live for someone offboarded (an
--    Admin's Offboard before 51k only changed the employee row) is archived,
--    dated from the offboarding. Access doesn't change: the JWT hook already
--    refuses an offboarded person whatever their membership says.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.expire_shift_requests_on_employee_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    -- A claim is a pickup with a target and no absence type (088); one offered
    -- to a named teammate carries one, and expires below.
    UPDATE public.shift_requests
    SET status = 'open',
        target_emp_id = NULL,
        target_shift_date = NULL,
        updated_at = now()
    WHERE org_id = NEW.org_id
      AND type = 'pickup'
      AND status = 'pending_approval'
      AND target_emp_id = NEW.id
      AND requester_emp_id <> NEW.id
      AND absence_type_id IS NULL;

    UPDATE public.shift_requests
    SET status = 'expired', resolved_at = now(), updated_at = now()
    WHERE (requester_emp_id = OLD.id OR target_emp_id = OLD.id)
      AND status IN ('open', 'pending_approval');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_shift_requests_on_employee_archive() FROM PUBLIC, anon, authenticated;

UPDATE public.organization_memberships m
SET archived_at = COALESCE(e.archived_at, e.status_changed_at, now()),
    archived_by = NULL
FROM public.employees e
WHERE e.org_id = m.org_id
  AND e.user_id = m.user_id
  AND e.status = 'removed'
  AND m.archived_at IS NULL;
