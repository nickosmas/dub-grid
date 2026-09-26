-- 052: Organization memberships are written by the server only.
--
-- Audit finding F-60 (41d3, 2026-09-25): gridmaster_all_memberships is FOR
-- ALL, and the 004 table grant gives authenticated every privilege, so a
-- Gridmaster's token could insert or update a Super Admin membership straight
-- through the data API, past every route gate. No application path writes
-- memberships as a signed-in user: the routes use the service role, and every
-- function that writes them (accept_invitation, the role and Gridmaster
-- functions, onboarding and tour completion, account termination and erasure)
-- is SECURITY DEFINER. Reading stays as it was; the row policies are
-- unchanged, and a write policy with no privilege behind it grants nothing.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.organization_memberships FROM authenticated;
