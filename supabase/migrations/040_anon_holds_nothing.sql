-- Audit finding F-23 (2026-09-22): the baseline grants in 004 gave `anon`
-- SELECT, INSERT, UPDATE and DELETE on every public table. Only two policies
-- name that role: the cookie banner's insert, and a deny-all. Row-level
-- security therefore refused `anon` every row and nothing was exposed, but a
-- future policy written without `TO authenticated` would have been backed by
-- a table grant nobody intended. The grants go; the banner keeps the one it
-- needs, and signed-in access is unchanged because it belongs to
-- `authenticated`.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- The cookie banner records a decision before anyone signs in, through
-- anon_insert_cookie_consent. It writes and never reads.
GRANT INSERT ON public.cookie_consents TO anon;
