-- 127: Being refused one organization doesn't cost someone their others.
--
-- Audit finding F-224: a new session starts in profiles.org_id, and the token
-- hook refuses anyone suspended from or removed by that organization, so someone
-- whose default was that organization couldn't sign in anywhere, though they
-- were still welcome in another. switch_org made it worse: signing in at the
-- suspended organization's own address moved that default there before the
-- refresh failed. The hook now starts a new session in an organization they can
-- use, and switch_org refuses a suspended target before it writes anything, with
-- the sentinel the sign-in routes read for Access suspended. profiles.org_id
-- stays as it is, so they land back there once reinstated.
--
-- Audit finding F-194: set_job_shift_overrides and start_trial_for_org were the
-- last writes reading a membership alone (126).
CREATE OR REPLACE FUNCTION public.sign_in_org_instead_of_default(p_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT membership.org_id
  FROM public.organization_memberships AS membership
  JOIN public.organizations AS organization ON organization.id = membership.org_id
  LEFT JOIN public.employees AS employee
    ON employee.org_id = membership.org_id
   AND employee.user_id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.archived_at IS NULL
    AND organization.archived_at IS NULL
    AND organization.suspended_at IS NULL
    AND organization.workspace_kind <> 'sandbox'
    AND employee.suspended_at IS NULL
    AND employee.status IS DISTINCT FROM 'removed'
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      JOIN public.employees AS refused
        ON refused.org_id = profile.org_id
       AND refused.user_id = profile.id
      WHERE profile.id = p_user_id
        AND (refused.suspended_at IS NOT NULL OR refused.status = 'removed')
    )
  ORDER BY membership.joined_at, membership.org_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.sign_in_org_instead_of_default(UUID)
  FROM PUBLIC, anon, authenticated;

-- 105's hook, unchanged apart from where a new session starts.
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

CREATE OR REPLACE FUNCTION public.switch_org(target_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_suspended_until DATE;
BEGIN
  IF NOT public.is_gridmaster() THEN
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = target_org_id AND workspace_kind = 'sandbox'
    ) THEN
      RAISE EXCEPTION 'Organization not found';
    END IF;

    SELECT employee.suspended_until INTO v_suspended_until
    FROM public.employees AS employee
    WHERE employee.org_id = target_org_id
      AND employee.user_id = auth.uid()
      AND employee.suspended_at IS NOT NULL;
    IF FOUND THEN
      RAISE EXCEPTION '%', 'Your access has been suspended. Contact your organization admin.'
        || COALESCE(' Until ' || to_char(v_suspended_until, 'YYYY-MM-DD') || '.', '');
    END IF;
  END IF;
  PERFORM public.switch_org_unguarded(target_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_job_shift_overrides(
  p_job_id BIGINT,
  p_time_overrides JSONB DEFAULT '{}'::JSONB,
  p_color_overrides JSONB DEFAULT '{}'::JSONB,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID := (SELECT job.org_id FROM public.jobs AS job WHERE job.id = p_job_id);
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(v_org_id);
  PERFORM public.refuse_caller_outside_org(v_org_id);
  PERFORM public.set_job_shift_overrides_unguarded(
    p_job_id, p_time_overrides, p_color_overrides, p_actor_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_trial_for_org(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_caller_outside_org(p_org_id);

  UPDATE public.organizations o
     SET trial_started_at = NOW(),
         trial_ends_at    = NOW() + make_interval(days => COALESCE(
           o.trial_length_days_override,
           (SELECT s.default_trial_days FROM public.platform_billing_settings s WHERE s.id),
           14
         ))
   WHERE o.id = p_org_id
     AND o.subscription_status = 'trialing'
     AND o.trial_ends_at IS NULL
     AND o.archived_at IS NULL
     AND o.suspended_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.organization_memberships m
        WHERE m.user_id = auth.uid()
          AND m.org_id = p_org_id
          AND m.org_role = 'super_admin'
          AND m.archived_at IS NULL
     );
END;
$$;
