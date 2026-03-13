-- ============================================================
-- Migration 082: Remove legacy JWT claims & rename admin permission key
--
-- 1. Rename JSONB key canManageOrgSettings → canManageCompanySettings
--    in profiles.admin_permissions
-- 2. Update custom_access_token_hook to stop emitting legacy
--    org_id, org_slug claims (only emit company_id, company_slug)
-- ============================================================


-- ── 1. Rename admin_permissions JSONB key ─────────────────────────────────────
-- Renames canManageOrgSettings → canManageCompanySettings in all rows
-- that have admin_permissions set.

UPDATE public.profiles
SET admin_permissions = (
  admin_permissions - 'canManageOrgSettings'
  || jsonb_build_object('canManageCompanySettings', admin_permissions -> 'canManageOrgSettings')
)
WHERE admin_permissions IS NOT NULL
  AND admin_permissions ? 'canManageOrgSettings';


-- ── 2. Remove legacy org_id/org_slug from JWT hook ────────────────────────────
-- The custom_access_token_hook previously emitted both company_* and org_*
-- claims for backward compatibility. Now that all clients read company_*,
-- remove the legacy org_id and org_slug claims.

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

  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

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
    p.company_id,
    p.platform_role::TEXT  AS platform_role,
    p.company_role::TEXT   AS company_role,
    c.slug                 AS company_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',  to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{company_role}',   to_jsonb(user_profile.company_role));
    IF user_profile.company_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{company_id}',   to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{company_slug}', to_jsonb(COALESCE(user_profile.company_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{company_role}',  '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
