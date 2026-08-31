-- A Gridmaster account is platform-only and never represents a member of an
-- organization. Its login email must therefore not be saved as a staff contact
-- address, even on an unlinked employee row.

CREATE OR REPLACE FUNCTION public.check_employee_email_belongs_to_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_email_owner UUID;
  v_owner_has_employee_in_org BOOLEAN;
  v_owner_is_gridmaster BOOLEAN;
BEGIN
  IF btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_email_owner
  FROM auth.users
  WHERE lower(email::text) = lower(btrim(NEW.email))
  LIMIT 1;

  IF v_email_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT platform_role = 'gridmaster'::public.platform_role
  INTO v_owner_is_gridmaster
  FROM public.profiles
  WHERE id = v_email_owner;

  IF COALESCE(v_owner_is_gridmaster, FALSE) THEN
    RAISE EXCEPTION 'employee_email_belongs_to_gridmaster: % belongs to a Gridmaster account', NEW.email
      USING ERRCODE = '23505',
            CONSTRAINT = 'employee_email_belongs_to_user';
  END IF;

  IF v_email_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'employee_email_belongs_to_other_user: % belongs to a different account', NEW.email
      USING ERRCODE = '23505',
            CONSTRAINT = 'employee_email_belongs_to_user';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE org_id = NEW.org_id
      AND user_id = v_email_owner
      AND archived_at IS NULL
      AND id <> NEW.id
  ) INTO v_owner_has_employee_in_org;

  IF v_owner_has_employee_in_org THEN
    RAISE EXCEPTION 'employee_email_belongs_to_other_user: % belongs to another active member of this organization', NEW.email
      USING ERRCODE = '23505',
            CONSTRAINT = 'employee_email_belongs_to_user';
  END IF;

  RETURN NEW;
END;
$$;
