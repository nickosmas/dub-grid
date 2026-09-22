-- Audit finding F-07, second half: the session boundary in the application
-- refuses an enrolled caller below aal2, but the data API and Realtime speak
-- to Postgres directly, so the same token still read every row the caller's
-- organization holds. The two policy helpers every policy is written on top
-- of now answer NULL / false for that caller, which closes both.
--
-- Measured before writing this (local stack, 2026-09-22): aal2 survives a
-- token refresh, and `mfa_enrolled` is recomputed by the access token hook on
-- every mint, so an answered challenge stays answered and an unenrolment
-- heals on the next refresh rather than stranding the account. A token minted
-- before migration 037 carries no claim and is treated as not enrolled.
--
-- Both functions are restated from 016 with one added clause; nothing else
-- moves, and 038 is now their canonical text.

CREATE OR REPLACE FUNCTION public.caller_mfa_challenge_pending()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
SET search_path = 'public'
AS $$
  SELECT COALESCE((auth.jwt() ->> 'mfa_enrolled')::BOOLEAN, FALSE)
     AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2';
$$;

REVOKE ALL ON FUNCTION public.caller_mfa_challenge_pending() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT NOT public.caller_mfa_challenge_pending() AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.platform_role = 'gridmaster'
      AND profile.deactivated_at IS NULL
      AND (
        NULLIF(auth.jwt() ->> 'session_id', '')::UUID IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.user_sessions AS session
          WHERE session.user_id = auth.uid()
            AND session.supabase_session_id =
              NULLIF(auth.jwt() ->> 'session_id', '')::UUID
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT claimed.org_id
  FROM (
    SELECT
      NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id,
      NULLIF(auth.jwt() ->> 'session_id', '')::UUID AS session_id
  ) AS claimed
  JOIN public.profiles AS profile
    ON profile.id = auth.uid()
   AND profile.deactivated_at IS NULL
  JOIN public.organization_memberships AS membership
    ON membership.user_id = auth.uid()
   AND membership.org_id = claimed.org_id
   AND membership.archived_at IS NULL
  JOIN public.organizations AS organization
    ON organization.id = claimed.org_id
   AND organization.archived_at IS NULL
   AND organization.suspended_at IS NULL
  WHERE claimed.org_id IS NOT NULL
    AND NOT public.caller_mfa_challenge_pending()
    AND (
      claimed.session_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.user_sessions AS session
        WHERE session.user_id = auth.uid()
          AND session.supabase_session_id = claimed.session_id
      )
    );
$$;
