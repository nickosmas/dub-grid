-- Audit finding F-21 (2026-09-22 re-review of migration 033): the member
-- column grant on profiles handed back terms_accepted_at and terms_version,
-- although only the terms route writes them, through the service role. With
-- the grant an organization admin could record a colleague's consent through
-- the data API. The table privilege goes again and only the four columns a
-- member may edit come back; the service role keeps full update.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, updated_at, version)
  ON public.profiles TO authenticated;
