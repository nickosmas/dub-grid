-- ═════════════════════════════════════════════════════════════════════════════
-- Org-isolation patch — 2026-08-18
--
-- The SQL half of the cross-tenant audit. Every statement here is already in
-- migrations 002/004; this file exists only because `npm run db:reset:remote`
-- is a full DROP SCHEMA + replay, so an edited migration never reaches a
-- provisioned database on its own.
--
-- Everything below is CREATE OR REPLACE FUNCTION / CREATE TRIGGER / REVOKE:
-- idempotent, non-destructive, safe to run against a live database, and safe to
-- run twice. No table is touched and no data is moved.
--
--   psql "$DATABASE_URL" -f supabase/patches/2026-08-org-isolation.sql
--
-- Run it on staging first. Order matters in one place only: section 4's REVOKEs
-- must come last, since a blanket GRANT after them would undo them again.
--
-- EXPECTED BEHAVIOUR CHANGE (section 1): any access token minted before this
-- ran that carries no `org_id` claim resolves to NO organization instead of
-- falling back to the user's profile default. Affected sessions see empty data
-- until their next token refresh (<= 1h, automatic). That is the fix, not a
-- side effect: the old fallback is what let removed members keep reading.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. caller_org_id() fails closed and checks live membership          [audit C1]
--
-- Every org-scoped RLS policy is `USING (org_id = public.caller_org_id())`.
-- The access-token hook strips org_id when a new token is minted for an
-- invalid membership, but an already-issued token still carries its old claim.
-- Validate that claim against the current membership row so soft-archiving a
-- member immediately makes every org-scoped RLS policy reject that token.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT claimed.org_id
  FROM (
    SELECT NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id
  ) AS claimed
  WHERE claimed.org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id = claimed.org_id
        AND membership.archived_at IS NULL
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Archiving a membership tears down like deleting one                [C1]
--
-- trg_membership_deleted is AFTER DELETE only, and nothing in the app hard
-- deletes a membership row, so it had never fired for a real removal. Without
-- it profiles.org_id kept pointing at the org, and no jwt_refresh_locks row was
-- written — so the already-minted token kept its org_id and org_role until it
-- expired, up to an hour of continued access after removal.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_membership_archived()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  -- Read BEFORE the UPDATE below nulls it, or the lock check that reuses it
  -- would always see false.
  v_was_default BOOLEAN;
BEGIN
  v_was_default := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.user_id AND org_id = NEW.org_id
  );

  IF v_was_default THEN
    UPDATE public.profiles
    SET org_id = NULL, updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  -- Only when an outstanding token can still be claiming THIS org. The lock is
  -- per USER, so it 403s the next refresh on every device they own — firing it
  -- unconditionally would sign someone out of the org they are actively working
  -- in because they were removed from an unrelated one.
  IF v_was_default OR EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = NEW.user_id AND active_org_id = NEW.org_id
  ) THEN
    INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
      VALUES (NEW.user_id, NOW() + INTERVAL '5 seconds', 'membership_removed')
    ON CONFLICT (user_id) DO UPDATE
      SET locked_until = NOW() + INTERVAL '5 seconds',
          reason       = 'membership_removed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_archived ON public.organization_memberships;
CREATE TRIGGER trg_membership_archived
  AFTER UPDATE OF archived_at ON public.organization_memberships
  FOR EACH ROW
  WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
  EXECUTE FUNCTION public.on_membership_archived();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_my_organizations().is_active is per SESSION, not per profile   [H1]
--
-- It read profiles.org_id, a global that switch_org rewrites on every device,
-- so it reported another device's most recent switch as this device's current
-- org. The mobile login flow trusts that flag and skips switch_org +
-- refreshSession when it is true, which left the app rendering one org's
-- identity over another org's data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (
  org_id    UUID,
  org_name  TEXT,
  org_slug  TEXT,
  org_role  public.org_role,
  is_active BOOLEAN
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid        UUID;
  v_session_id UUID;
  v_active_oid UUID;
BEGIN
  v_uid := auth.uid();
  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;

  SELECT COALESCE(
    (SELECT s.active_org_id
       FROM public.user_sessions s
      WHERE s.supabase_session_id = v_session_id
        AND s.user_id = v_uid),
    (SELECT p.org_id FROM public.profiles p WHERE p.id = v_uid)
  ) INTO v_active_oid;

  IF public.is_gridmaster() THEN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, 'user'::public.org_role, (o.id = v_active_oid)
    FROM public.organizations o ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cm.org_id, o.name, o.slug, cm.org_role, (cm.org_id = v_active_oid)
  FROM public.organization_memberships cm
  JOIN public.organizations o ON o.id = cm.org_id
  WHERE cm.user_id = v_uid
    AND cm.archived_at IS NULL
    AND o.archived_at IS NULL
  ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Internal functions revoked — MUST BE LAST                          [C2]
--
-- 004_grants.sql runs `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO
-- authenticated` after 002 has created these, silently undoing 002's REVOKE on
-- the access-token hook. Reachable over PostgREST, that hook minted and
-- returned any user's claims for an attacker-supplied user_id, and wrote
-- user_sessions / profiles rows for them.
--
-- The three schedule functions are the same shape: SECURITY DEFINER, a raw
-- p_org_id / p_cell_id parameter, no RLS and no caller_org_id() check. Revoked
-- rather than guarded from inside, because ~23 other SQL functions call them
-- and a guard that fails inside one returns ZERO ROWS instead of an error — a
-- wrong assumption would have silently emptied the schedule. Those callers are
-- all SECURITY DEFINER, so they execute as the owner and the revoke does not
-- reach them; the one TypeScript caller uses service_role, still granted.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_schedule_cell_snapshot(
  UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[], BOOLEAN[]
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prune_empty_schedule_cell(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run after applying. Expected results in comments.
-- ─────────────────────────────────────────────────────────────────────────────

-- No profiles fallback left in caller_org_id (expect: f)
-- SELECT pg_get_functiondef('public.caller_org_id()'::regprocedure) LIKE '%profiles%';

-- Archive trigger exists (expect: 1)
-- SELECT count(*) FROM pg_trigger
--  WHERE tgname = 'trg_membership_archived' AND NOT tgisinternal;

-- The hook is no longer executable by authenticated (expect: f)
-- SELECT has_function_privilege('authenticated',
--        'public.custom_access_token_hook(jsonb)', 'EXECUTE');

-- The hook IS still executable by GoTrue (expect: t)
-- SELECT has_function_privilege('supabase_auth_admin',
--        'public.custom_access_token_hook(jsonb)', 'EXECUTE');
