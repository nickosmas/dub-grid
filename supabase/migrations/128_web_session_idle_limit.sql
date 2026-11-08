-- 128: A web session left idle ends on the server too.
--
-- Audit finding F-204: the 30-minute web sign-out ran only in the browser, so
-- a session whose tab never ran its timer stayed renewable for as long as its
-- refresh token lived. The web now reports activity while someone is using a
-- tab (touch_web_session, at most every few minutes), and the token hook
-- refuses to renew a web session with no activity for 35 minutes: the
-- browser's 30, plus the gap between reports. The access token already issued
-- still runs out within the hour. Mobile sessions are never limited: the app
-- stays signed in until the person signs out (owner, 2026-11-08).
CREATE OR REPLACE FUNCTION public.web_session_is_idle(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_sessions AS s
    WHERE s.supabase_session_id = p_session_id
      AND s.user_id = p_user_id
      AND s.platform = 'web'
      AND s.last_active_at < NOW() - INTERVAL '35 minutes'
  );
$$;
REVOKE ALL ON FUNCTION public.web_session_is_idle(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- Records activity on the caller's own web session. A session already past
-- the limit stays ended, so a leftover access token can't revive it.
CREATE OR REPLACE FUNCTION public.touch_web_session()
RETURNS VOID
LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.user_sessions AS s
     SET last_active_at = NOW()
   WHERE s.supabase_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::UUID
     AND s.user_id = auth.uid()
     AND s.platform = 'web'
     AND s.last_active_at >= NOW() - INTERVAL '35 minutes'
     AND s.last_active_at < NOW() - INTERVAL '1 minute';
$$;
REVOKE ALL ON FUNCTION public.touch_web_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_web_session() TO authenticated;

-- 127's hook, unchanged apart from the idle check.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER VOLATILE
SET search_path = 'public'
AS $$
DECLARE
  claims         JSONB;
  user_profile   RECORD;
  uid            UUID;
  lock_until     TIMESTAMPTZ;
  v_session_id   UUID;
BEGIN
  claims := event -> 'claims';

  uid := (event ->> 'user_id')::UUID;
  IF uid IS NULL THEN
    uid := (event -> 'claims' ->> 'sub')::UUID;
  END IF;

  -- Platform-disabled accounts are refused at token issue, so neither a fresh
  -- sign-in nor a silent refresh carries a deactivated or terminated user back
  -- into an organization. Before this, a deactivated user only lost the org
  -- claims and the web proxy's profile fallback resolved them again, so an
  -- open session kept working indefinitely. The message is the sentinel the
  -- login routes pattern-match on for the "account disabled" UI, which is why
  -- this runs before the refresh-lock check: a termination also plants a lock,
  -- and its "session expired" envelope would otherwise win.
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = uid
       AND (deactivated_at IS NOT NULL OR terminated_at IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your account has been disabled. Contact your organization admin.'
      )
    );
  END IF;

  -- Clean up expired locks once, then check for an active one. (Active locks
  -- have locked_until > NOW(), so the cleanup never removes them.)
  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  SELECT locked_until INTO lock_until
    FROM public.jwt_refresh_locks
   WHERE user_id = uid
     AND locked_until > NOW();

  IF lock_until IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your session has expired. Please sign in again.'
      )
    );
  END IF;

  -- Per-session org isolation: when the auth event carries a session_id,
  -- the session's active_org_id (set by switch_org) overrides the user's
  -- default. This lets multiple devices keep independent org contexts.
  --
  -- On first contact for a session (no row yet), eagerly INSERT one that
  -- freezes active_org_id at the user's current default (profiles.org_id).
  -- Without it, an established session without a row would re-read
  -- profiles.org_id on every refresh and inherit cross-device switches —
  -- defeating per-session isolation. ON CONFLICT makes this a no-op on every
  -- mint after the first, so steady-state refresh cost is the single SELECT
  -- below. A fresh session holds profiles.org_id, unless the person can't get
  -- into that organization and has another they can (127). Only a first mint
  -- reaches that lookup, so a refresh never pays for it.
  v_session_id := NULLIF(event -> 'claims' ->> 'session_id', '')::UUID;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.user_sessions (user_id, supabase_session_id, active_org_id)
    SELECT uid, v_session_id, COALESCE(public.sign_in_org_instead_of_default(uid), p.org_id)
      FROM public.profiles p
     WHERE p.id = uid
       AND NOT EXISTS (
         SELECT 1 FROM public.user_sessions s
          WHERE s.supabase_session_id = v_session_id
       )
    ON CONFLICT (supabase_session_id) DO NOTHING;
  END IF;

  -- A web session nobody has used for longer than the limit isn't renewed
  -- (128). Only the web reports activity, so iOS, Android and a session whose
  -- platform was never recorded are never checked: the app stays signed in
  -- until the person signs out.
  IF v_session_id IS NOT NULL AND public.web_session_is_idle(v_session_id, uid) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your session has expired. Please sign in again.'
      )
    );
  END IF;

  -- Resolve profile, effective org, membership, org status, and the caller's
  -- employee row for the effective org in a single statement (previously a
  -- separate session lookup fed a second join query). Effective org =
  -- per-session active_org_id (if set) else profiles.org_id; the correlated
  -- subquery resolves it inline so the membership/organization/employee joins
  -- key off it in the same round-trip. When no session_id is present the
  -- subquery matches nothing and COALESCE falls back to profiles.org_id.
  -- Archived orgs (o.archived_at), suspended orgs (o.suspended_at), and
  -- deactivated users (p.deactivated_at) are filtered out. org_role is NOT
  -- coalesced — a NULL value means no membership, which must yield no org
  -- claims (prevents read access to an org the user has no membership for).
  -- e.status is read so the hook can refuse 'removed' employees and expose
  -- 'inactive' downstream as an employee_status claim. Gridmaster / unlinked
  -- super_admin users have no employees row → status is NULL → unaffected.
  SELECT
    eff.org_id              AS org_id,
    p.platform_role::TEXT   AS platform_role,
    cm.org_role::TEXT       AS org_role,
    o.slug                  AS org_slug,
    o.name                  AS org_name,
    e.status::TEXT          AS employee_status,
    e.suspended_at          AS employee_suspended_at,
    e.suspended_until       AS employee_suspended_until
  INTO user_profile
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT s.active_org_id
         FROM public.user_sessions s
        WHERE s.supabase_session_id = v_session_id
          AND s.user_id = uid),
      p.org_id
    ) AS org_id
  ) eff
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = p.id
   AND cm.org_id = eff.org_id
   AND cm.archived_at IS NULL
  LEFT JOIN public.organizations o
    ON o.id = eff.org_id
   AND o.archived_at IS NULL
   AND o.suspended_at IS NULL
  LEFT JOIN public.employees e
    ON e.user_id = p.id
   AND e.org_id = eff.org_id
  WHERE p.id = uid
    AND p.deactivated_at IS NULL;

  -- Removed employees are denied at the hook. This mirrors the
  -- jwt_refresh_locks 403 envelope above and kills both fresh sign-ins (the
  -- hook fires on signInWithPassword) and silent token refreshes in one place.
  -- The message string is the sentinel the login routes pattern-match on to
  -- surface a friendly "account disabled" UI — keep it stable.
  IF user_profile.employee_status = 'removed' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your account has been disabled. Contact your organization admin.'
      )
    );
  END IF;

  -- A suspended employee (101) keeps their place in the organization and on
  -- the schedule but can't sign in to it. Their other organizations are
  -- unaffected, since the join is to this organization's employee row. The
  -- message is the login routes' sentinel for "Access suspended"; a
  -- suspension with an end (105) adds " Until YYYY-MM-DD." after it.
  IF user_profile.employee_suspended_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your access has been suspended. Contact your organization admin.'
          || COALESCE(' Until ' || to_char(user_profile.employee_suspended_until, 'YYYY-MM-DD') || '.', '')
      )
    );
  END IF;

  -- Audit finding F-07: a verified TOTP factor is only known to the auth
  -- schema, so every other layer had to trust the client or pay a round trip
  -- to find out. Recomputed on every mint and refresh, so enrolling or
  -- unenrolling self-heals on the next token rather than stranding anyone.
  claims := jsonb_set(
    claims,
    '{mfa_enrolled}',
    to_jsonb(EXISTS (
      SELECT 1
      FROM auth.mfa_factors AS factor
      WHERE factor.user_id = uid
        AND factor.factor_type = 'totp'
        AND factor.status = 'verified'
    ))
  );

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(COALESCE(user_profile.platform_role, 'none')));
    claims := jsonb_set(claims, '{employee_status}', to_jsonb(COALESCE(user_profile.employee_status, 'none')));

    IF user_profile.org_id IS NOT NULL
       AND user_profile.org_role IS NOT NULL
       AND user_profile.org_slug IS NOT NULL THEN
      -- Valid membership + active org → set full org claims
      claims := jsonb_set(claims, '{org_role}',  to_jsonb(user_profile.org_role));
      claims := jsonb_set(claims, '{org_id}',    to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}',  to_jsonb(user_profile.org_slug));
      claims := jsonb_set(claims, '{org_name}',  to_jsonb(COALESCE(user_profile.org_name, '')));
    ELSE
      -- No membership, no org, or archived org → strip org context.
      -- Explicit removal prevents stale org_id/org_slug from persisting
      -- if the auth server carries forward claims from the previous token.
      claims := jsonb_set(claims, '{org_role}', '"user"');
      claims := claims - 'org_id' - 'org_slug' - 'org_name';
    END IF;
    -- Track last sign-in (debounced to avoid writes on every token refresh)
    UPDATE public.profiles
       SET last_sign_in_at = NOW()
     WHERE id = uid
       AND (last_sign_in_at IS NULL OR last_sign_in_at < NOW() - INTERVAL '5 minutes');

    -- NOTE: the trial clock is NOT started here. The hook fires on every token
    -- mint (including refresh) and sees the session's defaulted/resolved org, not
    -- the subdomain the user actually logged into (reconciliation happens client
    -- side, after this runs), so it cannot target the right org. Trials start on
    -- the first super_admin LOGIN via the start_trial_for_org RPC, called from the
    -- genuine web/mobile login flow. See trial_started_at in 001.
  ELSE
    claims := jsonb_set(claims, '{platform_role}',  '"none"');
    claims := jsonb_set(claims, '{org_role}',       '"user"');
    claims := jsonb_set(claims, '{employee_status}', '"none"');
    claims := claims - 'org_id' - 'org_slug' - 'org_name';
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
