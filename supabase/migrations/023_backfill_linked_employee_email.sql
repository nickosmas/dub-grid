-- One email per person, part two.
--
-- 022 keeps a linked staff row in step with a later login-email change. It
-- does nothing for rows that were linked with a blank email in the first
-- place, which is how the seed and the older invitation flow left them, so
-- the People pages showed no email for someone who plainly signs in with one.
--
-- Two repairs. A BEFORE trigger on employees fills a blank email from the
-- account whenever a row is linked (or its email is blanked while linked), so
-- the state cannot recur. Then a one-time backfill for the rows already in
-- that state, one row at a time so an unlinked duplicate in one organization
-- (unique_active_employee_email_per_org) skips with a warning instead of
-- failing the migration. `version` stays untouched.

CREATE OR REPLACE FUNCTION public.fill_linked_employee_email()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_login_email TEXT;
BEGIN
  IF NEW.user_id IS NULL OR btrim(COALESCE(NEW.email, '')) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT u.email INTO v_login_email FROM auth.users u WHERE u.id = NEW.user_id;
  IF v_login_email IS NOT NULL AND btrim(v_login_email) <> '' THEN
    NEW.email := v_login_email;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_linked_employee_email() FROM PUBLIC;

-- Runs before check_employee_email_belongs_to_user (alphabetical order), which
-- then sees the owner's own address and passes.
DROP TRIGGER IF EXISTS a_fill_linked_employee_email ON public.employees;
CREATE TRIGGER a_fill_linked_employee_email
  BEFORE INSERT OR UPDATE OF email, user_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.fill_linked_employee_email();

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT e.id, e.org_id, u.email AS login_email
      FROM public.employees e
      JOIN auth.users u ON u.id = e.user_id
     WHERE e.archived_at IS NULL
       AND btrim(COALESCE(e.email, '')) = ''
       AND u.email IS NOT NULL
       AND btrim(u.email) <> ''
  LOOP
    BEGIN
      UPDATE public.employees SET email = v_row.login_email WHERE id = v_row.id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE WARNING
          'backfill_linked_employee_email: employee % in org % keeps a blank email, % is already used there',
          v_row.id, v_row.org_id, v_row.login_email;
    END;
  END LOOP;
END;
$$;
