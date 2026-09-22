-- Account deletion is a super admin's decision. The application already
-- refuses a people manager's decision on an account_deletion request; this
-- restates the rule at the row level so a direct update through the
-- authenticated API cannot sidestep it. Profile updates keep the
-- canManageEmployees gate they had, and gridmasters keep their own policy.

DROP POLICY IF EXISTS "admin_profile_change_requests_update" ON public.profile_change_requests;

CREATE POLICY "admin_profile_change_requests_update"
  ON public.profile_change_requests FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND status = 'pending'
    AND (
      public.caller_org_role() = 'super_admin'
      OR (
        request_type = 'profile_update'
        AND public.check_admin_permission('canManageEmployees')
      )
    )
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND status IN ('approved', 'rejected')
    AND resolver_user_id = auth.uid()
    AND resolved_at IS NOT NULL
  );
