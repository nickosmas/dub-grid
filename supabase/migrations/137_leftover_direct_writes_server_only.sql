-- 137: The last direct writes a signed-in user held go, and removing a focus
-- area from people names its organization.
--
-- As in 122, only the privilege goes; every write already runs through a route
-- under the service role or a SECURITY DEFINER function, and a policy with no
-- privilege behind it grants nothing.
--
-- F-200: a Super Admin could update write-once organization fields through the
-- data API, the subdomain among them, which frees the old name for another
-- organization to claim. Settings are saved by organizations/settings and
-- billing by the billing routes, both through the service client. Revoking the
-- table privilege also revokes 004's column grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organizations FROM authenticated;

-- F-214: an Admin who could edit notes could insert a published note or delete
-- one directly, past publish, the audit log and alerts. schedule/manage writes
-- every note with the service client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.schedule_notes FROM authenticated;

-- F-215: a direct delete of a focus area, shift or job let its ON DELETE
-- actions, which run as the table owner, rewrite published schedule rows past
-- the settings route's in-use checks. The settings route archives or checks use
-- first, through the service client.
REVOKE DELETE, TRUNCATE
  ON TABLE public.focus_areas, public.shift_categories, public.jobs
  FROM authenticated;

-- F-216: the service client has no organization in its token, so filtering on
-- caller_org_id() matched nobody and archiving a focus area left it on every
-- person. The caller now names the organization; anyone but the service role
-- must be signed in to it and allowed to manage focus areas.
DROP FUNCTION IF EXISTS public.remove_focus_area_from_employees(BIGINT);

CREATE OR REPLACE FUNCTION public.remove_focus_area_from_employees(
  p_focus_area_id BIGINT,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'An organization is required' USING ERRCODE = '22004';
  END IF;

  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: sign in first' USING ERRCODE = '42501';
    END IF;
    PERFORM public.refuse_caller_outside_org(p_org_id);
    IF NOT public.check_admin_permission('canManageFocusAreas') THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to manage focus areas'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.employees
  SET focus_area_ids = array_remove(focus_area_ids, p_focus_area_id)
  WHERE org_id = p_org_id
    AND focus_area_ids @> ARRAY[p_focus_area_id];
END;
$$;
COMMENT ON FUNCTION public.remove_focus_area_from_employees(BIGINT, UUID) IS
  'Removes a focus area ID from every person in one organization.';

REVOKE ALL ON FUNCTION public.remove_focus_area_from_employees(BIGINT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_focus_area_from_employees(BIGINT, UUID)
  TO authenticated, service_role;
