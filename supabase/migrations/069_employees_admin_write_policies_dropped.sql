-- 069: Staff records keep no write policy for signed-in admins.
--
-- Audit finding F-109 (2026-09-28): 065 revoked the table writes from
-- authenticated, which left admin_insert_employees, admin_update_employees
-- and admin_delete_employees granting nothing. A later broad grant (as 004's
-- GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated) would bring them
-- back into force and silently reopen F-100, so they go. 065's revoke also
-- left MAINTAIN (lock, vacuum, reindex; no data writes and not reachable
-- through the data API). The Gridmaster policy stays, behind 054's
-- fresh-proof restrictive policies, and reading is unchanged. 065's list of
-- SECURITY DEFINER writers also missed purge_expired_data, which is one.
DROP POLICY IF EXISTS admin_insert_employees ON public.employees;
DROP POLICY IF EXISTS admin_update_employees ON public.employees;
DROP POLICY IF EXISTS admin_delete_employees ON public.employees;

REVOKE MAINTAIN ON TABLE public.employees FROM authenticated;
