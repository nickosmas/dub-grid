-- Fix: Supabase Custom Access Token hook must return { "claims": <object> }.
-- Returning the full event can leave custom claims out of the issued JWT.
-- See https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT
    p.org_id,
    p.platform_role::TEXT AS platform_role,
    p.org_role::TEXT AS org_role,
    o.slug AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.org_id
  WHERE p.id = (event ->> 'user_id')::UUID;

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

  -- Return only the claims object; Supabase merges this into the JWT.
  RETURN jsonb_build_object('claims', claims);
END;
$$;
