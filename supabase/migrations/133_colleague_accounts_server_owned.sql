-- 133: A colleague's account is for the people who act on it.
--
-- org_member_profiles_select let any member read every profile in their
-- organization through the data API: a colleague's last sign-in, whether
-- their account is deactivated or set for deletion, and whether they use
-- two-step verification. Those are account statuses. A regular member now
-- reads only their own profile (own_profile_select); Admins and Super Admins,
-- who manage people and edit their names through admin_profiles_update (an
-- UPDATE only reaches rows the caller can select), keep reading their
-- organization's profiles. Names reach regular members through the server
-- routes, and no client, policy, function that runs as the caller, or
-- Realtime filter reads another member's profile as a regular member.
DROP POLICY IF EXISTS org_member_profiles_select ON public.profiles;

CREATE POLICY org_member_profiles_select
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );
