-- 101: Suspended, access (item 51c).
--
-- A suspended person keeps their role, their place on the schedule and their
-- seat, but can't sign in to the organization. Suspension is its own columns,
-- so they stay `active`; leaving Active (Away or Archived) ends it. The hook
-- refuses them at every token issue and refresh; the status routes sign them
-- out everywhere and disable their push when suspending. The hook below is
-- 037's, copied unchanged apart from the suspension check.
SET lock_timeout = '5s';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.suspended_at IS
  'When their access to this organization was suspended; NULL when it is not. A suspended person stays active and schedulable but cannot sign in.';

-- 100's guard, extended: leaving Active, or being archived, ends a suspension.
CREATE OR REPLACE FUNCTION public.clear_away_until_off_away()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'inactive' OR NEW.archived_at IS NOT NULL THEN
    NEW.away_until := NULL;
  END IF;
  IF NEW.away_until IS NULL THEN
    NEW.away_absence_type_id := NULL;
  END IF;
  IF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL THEN
    NEW.suspended_at := NULL;
    NEW.suspended_by := NULL;
  END IF;
  IF NEW.away_absence_type_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.away_absence_type_id IS DISTINCT FROM OLD.away_absence_type_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types a
      WHERE a.id = NEW.away_absence_type_id
        AND a.org_id = NEW.org_id
        AND a.archived_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Absence type not found in this organization'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_away_until_off_away() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_employees_clear_away_until
  BEFORE INSERT OR UPDATE OF status, archived_at, away_until, away_absence_type_id, suspended_at
  ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.clear_away_until_off_away();

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_suspended_only_when_active,
  ADD CONSTRAINT employees_suspended_only_when_active
  CHECK (suspended_at IS NULL OR (status = 'active' AND archived_at IS NULL));

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
  -- below. The current token's effective org is unchanged either way: a
  -- freshly inserted row holds active_org_id = profiles.org_id.
  v_session_id := NULLIF(event -> 'claims' ->> 'session_id', '')::UUID;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.user_sessions (user_id, supabase_session_id, active_org_id)
    SELECT uid, v_session_id, p.org_id
      FROM public.profiles p
     WHERE p.id = uid
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
    e.suspended_at          AS employee_suspended_at
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
  -- message is the login routes' sentinel for "Access suspended".
  IF user_profile.employee_suspended_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Your access has been suspended. Contact your organization admin.'
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
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;
