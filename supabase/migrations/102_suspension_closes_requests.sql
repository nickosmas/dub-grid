-- 102: A suspension closes their open requests (item 51d).
--
-- Archiving someone already expires every open or waiting request they made
-- or are the other person on (002). Suspending them now does the same, except
-- that a pickup they claimed goes back up for others instead of closing on
-- whoever offered it. A claim is a pickup with a target and no absence type
-- (088); one offered to a named teammate carries one, and expires. No admin
-- note is written, so the other person on a swap isn't told why.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.close_shift_requests_on_suspension()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.suspended_at IS NULL AND NEW.suspended_at IS NOT NULL THEN
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
    WHERE org_id = NEW.org_id
      AND (requester_emp_id = NEW.id OR target_emp_id = NEW.id)
      AND status IN ('open', 'pending_approval');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.close_shift_requests_on_suspension() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_close_shift_requests_on_suspension ON public.employees;
CREATE TRIGGER trg_close_shift_requests_on_suspension
  AFTER UPDATE OF suspended_at ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.close_shift_requests_on_suspension();
