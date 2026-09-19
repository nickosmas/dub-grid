-- Platform account termination.
--
-- A gridmaster can terminate a user account: the person loses every
-- organization membership, their employee rows are marked removed, every
-- session is cut, and no organization super admin can bring them back through
-- a role change, an invitation, or an employee reactivation. Only a gridmaster
-- can reinstate the account, after which access has to be granted again.
--
-- The same pass closes the gap that made gridmaster deactivation ineffective:
-- the JWT hook only stripped org claims from a deactivated user, and the web
-- proxy's profile fallback resolved them again on the next request. Both
-- deactivated and terminated accounts are now refused at token issue.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terminated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_by     UUID,
  ADD COLUMN IF NOT EXISTS terminated_reason TEXT;

COMMENT ON COLUMN public.profiles.terminated_at IS 'Set by a gridmaster through terminate_user_account. While set, the account cannot sign in, hold a membership, or be re-invited; only reinstate_user_account clears it.';

-- ── JWT hook: refuse deactivated and terminated accounts ─────────────────────

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
    e.status::TEXT          AS employee_status
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

-- ── Invariants: a terminated account cannot regain access ────────────────────
-- Enforced in the tables rather than only in the API routes, so a service-role
-- write from any organization-side route hits the same wall.

CREATE OR REPLACE FUNCTION public.is_account_terminated(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND terminated_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_terminated(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_terminated_membership()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Creating a membership, or reviving an archived one, for a terminated
  -- account is refused whoever the actor is. Archiving stays allowed so the
  -- termination itself and later cleanups can run.
  IF (TG_OP = 'INSERT' OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL))
     AND public.is_account_terminated(NEW.user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_TERMINATED: this account was terminated by the platform team and cannot rejoin an organization until a gridmaster reinstates it';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_terminated_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_terminated_membership ON public.organization_memberships;
CREATE TRIGGER guard_terminated_membership
  BEFORE INSERT OR UPDATE OF archived_at ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_terminated_membership();

CREATE OR REPLACE FUNCTION public.guard_terminated_employee()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- An employee row linked to a terminated account can only move to or stay
  -- at 'removed'; it cannot be reactivated or linked to the account again.
  IF NEW.user_id IS NOT NULL
     AND public.is_account_terminated(NEW.user_id)
     AND (
       NEW.status <> 'removed'
       OR (TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id)
       OR TG_OP = 'INSERT'
     ) THEN
    RAISE EXCEPTION 'ACCOUNT_TERMINATED: this account was terminated by the platform team and cannot be reactivated until a gridmaster reinstates it';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_terminated_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_terminated_employee ON public.employees;
CREATE TRIGGER guard_terminated_employee
  BEFORE INSERT OR UPDATE OF status, user_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.guard_terminated_employee();

CREATE OR REPLACE FUNCTION public.guard_terminated_invitation()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
     WHERE lower(u.email::TEXT) = lower(NEW.email)
       AND p.terminated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_TERMINATED: this account was terminated by the platform team and cannot be invited until a gridmaster reinstates it';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_terminated_invitation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_terminated_invitation ON public.invitations;
CREATE TRIGGER guard_terminated_invitation
  BEFORE INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_terminated_invitation();

-- ── Gridmaster RPCs ──────────────────────────────────────────────────────────
-- Called by the gridmaster routes through the service-role client after
-- requireGridmasterSession and a fresh sensitive-action check, with the acting
-- gridmaster passed explicitly. They are not granted to `authenticated`, so the
-- SECURITY DEFINER entry-point inventory locked in 016 stays as it is.

DROP FUNCTION IF EXISTS public.terminate_user_account(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reinstate_user_account(UUID);

CREATE OR REPLACE FUNCTION public.assert_platform_actor(p_actor_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: platform account actions run through the gridmaster API';
  END IF;
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_actor_id
       AND platform_role = 'gridmaster'
       AND deactivated_at IS NULL
       AND terminated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only an active gridmaster can do that';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_platform_actor(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.terminate_user_account(
  p_actor_id       UUID,
  p_target_user_id UUID,
  p_reason         TEXT
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_target      public.profiles;
  v_memberships INTEGER;
  v_employees   INTEGER;
BEGIN
  PERFORM public.assert_platform_actor(p_actor_id);
  IF p_target_user_id = p_actor_id THEN
    RAISE EXCEPTION 'You cannot terminate your own account';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF v_target.platform_role = 'gridmaster' THEN
    RAISE EXCEPTION 'Gridmaster accounts are managed from Gridmaster Accounts';
  END IF;
  IF v_target.terminated_at IS NOT NULL THEN
    RAISE EXCEPTION 'This account is already terminated';
  END IF;

  UPDATE public.profiles
     SET terminated_at = NOW(),
         terminated_by = p_actor_id,
         terminated_reason = trim(p_reason),
         org_id = NULL,
         updated_at = NOW()
   WHERE id = p_target_user_id;

  -- Order matters: the membership guard allows archiving, and the employee
  -- guard allows moving to 'removed', so both run after the flag is set.
  UPDATE public.organization_memberships
     SET archived_at = NOW(), archived_by = p_actor_id, updated_at = NOW()
   WHERE user_id = p_target_user_id AND archived_at IS NULL;
  GET DIAGNOSTICS v_memberships = ROW_COUNT;

  UPDATE public.employees
     SET status = 'removed',
         status_changed_at = NOW(),
         updated_at = NOW()
   WHERE user_id = p_target_user_id AND status <> 'removed';
  GET DIAGNOSTICS v_employees = ROW_COUNT;

  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'account_terminated')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'account_terminated';

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'memberships_archived', v_memberships,
    'employees_removed', v_employees
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reinstate_user_account(
  p_actor_id       UUID,
  p_target_user_id UUID
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_target public.profiles;
BEGIN
  PERFORM public.assert_platform_actor(p_actor_id);

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF v_target.terminated_at IS NULL THEN
    RAISE EXCEPTION 'This account is not terminated';
  END IF;

  -- Reinstating lifts the platform block only. Memberships stay archived and
  -- employee rows stay removed; a gridmaster grants access again explicitly,
  -- which keeps the audit trail honest about who let the person back in.
  UPDATE public.profiles
     SET terminated_at = NULL,
         terminated_by = NULL,
         terminated_reason = NULL,
         updated_at = NOW()
   WHERE id = p_target_user_id;

  RETURN jsonb_build_object('user_id', p_target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_user_account(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reinstate_user_account(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_user_account(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reinstate_user_account(UUID, UUID) TO service_role;

-- ── High-risk audit filter: terminations and platform kill switches ─────────
-- The export filter listed the per-organization feature override key but not
-- the platform switches, and it predates terminations.

CREATE OR REPLACE FUNCTION public.get_filtered_audit_log(
  p_org_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_action_prefix TEXT DEFAULT NULL,
  p_action_prefixes TEXT[] DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_target TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_high_risk_only BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT audit.*
  FROM public.audit_log AS audit
  LEFT JOIN public.employees AS employee
    ON audit.resource_type = 'employee'
    AND employee.id::text = audit.resource_id
  LEFT JOIN public.invitations AS invitation
    ON audit.resource_type = 'invitation'
    AND invitation.id::text = audit.resource_id
  LEFT JOIN public.profiles AS profile
    ON audit.resource_type IN ('user', 'organization_membership')
    AND profile.id::text = audit.resource_id
  LEFT JOIN public.profiles AS actor_profile
    ON actor_profile.id = audit.actor_id
  WHERE (p_org_id IS NULL OR audit.org_id = p_org_id)
    AND (p_action IS NULL OR audit.action = p_action)
    AND (p_action_prefix IS NULL OR audit.action LIKE p_action_prefix || '%')
    AND (
      p_action_prefixes IS NULL
      OR cardinality(p_action_prefixes) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_action_prefixes) AS prefix
        WHERE audit.action LIKE prefix || '%'
      )
    )
    AND (p_resource_type IS NULL OR audit.resource_type = p_resource_type)
    AND (p_actor_id IS NULL OR audit.actor_id = p_actor_id)
    AND (p_start_date IS NULL OR audit.created_at >= p_start_date)
    AND (p_end_date IS NULL OR audit.created_at <= p_end_date)
    AND (
      NOT p_high_risk_only
      OR audit.action IN (
        'account.deleted', 'audit.exported', 'feature_flags.updated', 'org.archived',
        'org.suspended', 'user.deactivated', 'user.force_logout', 'user.password_reset_sent',
        'user.terminated'
      )
      OR audit.action LIKE ANY (ARRAY['billing.%', 'gdpr.%', 'gridmaster_account.%', 'impersonation.%', 'platform_feature_flags.%'])
    )
    AND (
      p_target IS NULL
      OR concat_ws(
        ' ',
        audit.actor_email,
        audit.action,
        audit.resource_type,
        audit.resource_id,
        audit.details::text,
        actor_profile.first_name,
        actor_profile.last_name,
        employee.first_name,
        employee.last_name,
        employee.email,
        invitation.first_name,
        invitation.last_name,
        invitation.email,
        profile.first_name,
        profile.last_name
      ) ILIKE '%' || p_target || '%'
    )
  ORDER BY audit.created_at DESC, audit.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 5000)
  OFFSET GREATEST(p_offset, 0);
$$;

-- ── assign_org_role_by_email: revive an archived membership, match email case-insensitively ──
-- The gridmaster path to let a person back in after a reinstatement (or after
-- an ordinary removal) is this RPC, but its upsert only rewrote org_role and
-- left archived_at set, so the person stayed locked out. It also compared the
-- email case-sensitively while every sibling RPC lowercases.

CREATE OR REPLACE FUNCTION public.assign_org_role_by_email(
  p_email    TEXT,
  p_org_id   UUID,
  p_org_role public.org_role DEFAULT 'user'
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF p_email IS NULL OR p_email !~ '^\S+@\S+\.\S+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  IF NOT public.is_gridmaster()
     AND public.caller_org_role() = 'admin'
     AND p_org_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot assign admin or super_admin';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email::TEXT) = lower(p_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role)
  VALUES (target_user_id, p_org_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id),
        updated_at = NOW();

  PERFORM set_config('app.allow_role_change', 'true', true);

  -- Reviving an archived membership runs through guard_terminated_membership,
  -- so a terminated account still cannot be let back in this way.
  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW();
END;
$$;
