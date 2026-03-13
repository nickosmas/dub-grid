-- ============================================================
-- Migration 046: Rename tables to match updated domain terminology
--   wings         → focus_areas
--   organizations → companies
--
-- PostgreSQL tracks FK constraints, RLS policies, indexes, and
-- triggers by OID (not name), so those all survive a table rename
-- automatically. Only stored functions that embed the old table
-- name as SQL text need to be re-created.
-- ============================================================

-- ── 1. Rename tables (idempotent — skips if source already renamed) ───────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wings') THEN
    ALTER TABLE public.wings RENAME TO focus_areas;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    ALTER TABLE public.organizations RENAME TO companies;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'org_invitations') THEN
    ALTER TABLE public.org_invitations RENAME TO invitations;
  END IF;
END $$;

-- ── 2. Re-create stored functions that reference public.organizations ─────────
--    These functions store SQL text; PostgreSQL does NOT auto-update them on
--    table rename, so they would fail at runtime unless replaced here.

-- custom_access_token_hook (latest: migration 021)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB;
  user_profile RECORD;
  uid          UUID;
  lock_until   TIMESTAMPTZ;
BEGIN
  claims := event -> 'claims';

  -- Resolve user id from event (user_id or claims.sub)
  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

  -- Check for active JWT refresh lock (written by change_user_role RPC).
  SELECT locked_until INTO lock_until
    FROM public.jwt_refresh_locks
   WHERE user_id = uid
     AND locked_until > NOW();

  IF lock_until IS NOT NULL THEN
    DELETE FROM public.jwt_refresh_locks
     WHERE user_id = uid AND locked_until <= NOW();

    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Session invalidated due to role change. Please sign in again.'
      )
    );
  END IF;

  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  SELECT
    p.org_id,
    p.platform_role::TEXT AS platform_role,
    p.org_role::TEXT AS org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.companies o ON o.id = p.org_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{org_role}',      to_jsonb(user_profile.org_role));
    IF user_profile.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(COALESCE(user_profile.org_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;

-- get_system_stats (migration 033)
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'org_count',       (SELECT count(*) FROM public.companies),
    'user_count',      (SELECT count(*) FROM public.profiles),
    'shift_count',     (SELECT count(*) FROM public.shifts),
    'active_sessions', (SELECT count(*) FROM auth.sessions WHERE not_after > now())
  ) INTO result;

  RETURN result;
END;
$$;

-- get_all_users_with_profiles (migration 033)
CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  platform_role public.platform_role,
  org_role public.org_role,
  org_id UUID,
  org_name TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    p.platform_role,
    p.org_role,
    p.org_id,
    o.name AS org_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.companies o ON p.org_id = o.id
  ORDER BY u.email ASC;
END;
$$;

-- send_invitation (latest: migration 018)
CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email    TEXT,
  p_role     TEXT,
  p_org_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite invitations;
BEGIN
  -- Authorization: only gridmasters or admins of the target org may invite
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role()::TEXT = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only org admins can send invitations';
  END IF;

  -- Clean up expired invites for the same email/org
  DELETE FROM invitations
   WHERE org_id = p_org_id
     AND email = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- Insert new invite with 72-hour expiry (default from table definition)
  INSERT INTO invitations (org_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;
