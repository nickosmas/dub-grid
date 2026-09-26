-- 056: Only the server writes the audit tables (F-32).
--
-- authenticated_insert_audit_log let any signed-in user insert an audit row
-- as themselves with any action and details, including a security.auth.login
-- success carrying their own sessionHash that would suppress the real record,
-- and role_change_log's audit_insert policy let a Super Admin or Gridmaster
-- write role history directly. Every application write already uses the
-- service role (the routes and server helpers), and every database function
-- that writes either table is SECURITY DEFINER, so signed-in callers keep
-- reading through the existing policies and lose only writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.role_change_log FROM authenticated;
