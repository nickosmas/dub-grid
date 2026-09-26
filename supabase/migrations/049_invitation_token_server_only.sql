-- 049: An invitation's token and every write to it are server-only.
--
-- Audit finding F-70 (41d4 re-review, 2026-09-26): invitations_select lets an
-- organization's Admins and Super Admins read their organization's rows, and
-- the 004 table grant covers every column, so an Admin could read a pending
-- Super Admin invitation's token through the data API and register as that
-- invitee. invitations_revoke also let an Admin who manages employees update
-- any column directly, including role_to_assign, email and invited_by, past
-- every route check. The browser only reads invitations, never the token;
-- every write goes through a route under the service role or a SECURITY
-- DEFINER function (send_invitation, accept_invitation, the replacement and
-- rollback functions, the revocation triggers and purge_expired_data).
--
-- As in 036, the table privilege goes and only the readable columns come
-- back; a column added later is not granted by default. The row policies are
-- unchanged: they still gate rows, and a write policy with no privilege
-- behind it grants nothing.
REVOKE ALL ON TABLE public.invitations FROM authenticated;
GRANT SELECT (
  id,
  org_id,
  invited_by,
  email,
  role_to_assign,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at,
  employee_id,
  first_name,
  last_name,
  phone,
  department_ids,
  dept_admin_ids
) ON public.invitations TO authenticated;
