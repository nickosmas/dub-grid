-- Migration: 021_hook_check_jwt_refresh_locks.sql
-- Purpose: Make jwt_refresh_locks functional by checking it in the access token hook
--
-- Bug: The change_user_role RPC writes jwt_refresh_locks rows, but nothing
-- ever reads them. The design doc's "5-second token refresh block" after role
-- changes was non-functional — stale JWTs could persist.
--
-- Fix: The custom_access_token_hook now checks the locks table. If a lock
-- is active for the user, the hook returns an error response that tells
-- Supabase Auth to reject the token refresh, forcing re-authentication.
--
-- Note: Supabase auth hooks can signal an error by returning:
--   { "error": { "http_code": 403, "message": "..." } }
-- This causes the token refresh to fail, which forces the client to
-- re-authenticate and get a fresh JWT with updated claims.

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
  -- If locked, reject the token issuance so the client must re-authenticate
  -- with fresh credentials, receiving updated role claims.
  SELECT locked_until INTO lock_until
    FROM public.jwt_refresh_locks
   WHERE user_id = uid
     AND locked_until > NOW();

  IF lock_until IS NOT NULL THEN
    -- Clean up expired lock rows opportunistically
    DELETE FROM public.jwt_refresh_locks
     WHERE user_id = uid AND locked_until <= NOW();

    -- Return error to force re-authentication
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Session invalidated due to role change. Please sign in again.'
      )
    );
  END IF;

  -- Clean up any expired locks for this user
  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  SELECT
    p.org_id,
    p.platform_role::TEXT AS platform_role,
    p.org_role::TEXT AS org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.org_id
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

-- Re-apply owner so the hook bypasses RLS when reading profiles
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;

-- Grant access to jwt_refresh_locks for the hook (runs as postgres, but be explicit)
GRANT SELECT, DELETE ON public.jwt_refresh_locks TO postgres;
