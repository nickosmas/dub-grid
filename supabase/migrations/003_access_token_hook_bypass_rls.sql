-- Allow the Custom Access Token hook to read profiles by running as postgres (bypasses RLS).
-- If ALTER OWNER fails (e.g. "role postgres does not exist"), run only the CREATE OR REPLACE
-- block and check Supabase Auth logs when signing in for hook errors.

-- 1) Hook must read profiles; RLS can block the SELECT when the function runs as its owner.
--    Running as postgres bypasses RLS (Supabase Cloud).
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;

-- 2) Support both event shapes: 'user_id' (docs) and 'sub' inside claims (some runtimes).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB;
  user_profile RECORD;
  uid          UUID;
BEGIN
  claims := event -> 'claims';

  -- Resolve user id from event (user_id or claims.sub)
  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

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

-- Re-apply owner in case CREATE OR REPLACE reset it
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
