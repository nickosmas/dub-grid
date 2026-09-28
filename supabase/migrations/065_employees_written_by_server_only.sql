-- 065: Staff records are written by the server only.
--
-- Audit finding F-100 (2026-09-28): admin_update_employees and
-- admin_delete_employees let any Admin with canManageEmployees write any staff
-- record in their organization, and the 004 table grant gives authenticated
-- every privilege, so an Admin's token could set a Super Admin's linked record
-- to 'removed' straight through the data API, past the status route's tier and
-- self-action guards, and the access-token hook would then refuse that Super
-- Admin's sign-in. No application path writes employees as a signed-in user:
-- the routes use the service role, and every function that writes them
-- (accept_invitation, gdpr_erase_user_data, remove_focus_area_from_employees,
-- sync_employee_email_from_auth, terminate_user_account,
-- update_mobile_employee_with_audit) is SECURITY DEFINER. Reading stays as it
-- was (036's column grants and the SELECT policies); a write policy with no
-- privilege behind it grants nothing.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.employees FROM authenticated;
