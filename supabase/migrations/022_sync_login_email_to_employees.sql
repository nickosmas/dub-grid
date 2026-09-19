-- One email per person.
--
-- A staff record's email and the account's login email were two independent
-- stores with a one-way consistency check (006) and no synchronisation. The
-- application now changes the login email when a manager edits a linked staff
-- record; this trigger closes the other direction, so an account whose owner
-- confirms a new login email carries it onto every linked, active staff row in
-- every organization.
--
-- Rows are updated one organization at a time. A staff row in one
-- organization may already hold the address without being linked to anyone
-- (unique_active_employee_email_per_org); that row stays as it is and a
-- warning is raised, because a duplicate elsewhere must never turn a
-- confirmed login-email change into a failed request. `version` is left
-- untouched: the web route's optimistic check runs right after an
-- application-driven change, and the row it expects has not been edited by
-- anyone else.

CREATE OR REPLACE FUNCTION public.sync_employee_email_from_auth()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_employee RECORD;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  FOR v_employee IN
    SELECT id, org_id
      FROM public.employees
     WHERE user_id = NEW.id
       AND archived_at IS NULL
       AND lower(btrim(email)) IS DISTINCT FROM lower(btrim(NEW.email))
  LOOP
    BEGIN
      UPDATE public.employees
         SET email = NEW.email
       WHERE id = v_employee.id;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE WARNING
          'sync_employee_email_from_auth: employee % in org % keeps its email, % is already used there',
          v_employee.id, v_employee.org_id, NEW.email;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_employee_email_from_auth() FROM PUBLIC;

CREATE OR REPLACE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_employee_email_from_auth();
