-- ============================================================================
-- Migration 002: Functions, Triggers & Hooks
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. RBAC HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND platform_role = 'gridmaster'
  );
$$;


-- Per-session org context: the org_id claim baked into this device's JWT
-- (written by custom_access_token_hook from user_sessions.active_org_id), so
-- each device stays isolated.
--
-- The claim is the ONLY source, and a missing claim means no org — NULL, which
-- every `org_id = public.caller_org_id()` policy evaluates to NULL and so
-- matches no rows. This function has to fail closed, because the hook strips
-- org_id precisely when the membership is invalid (archived membership,
-- archived/suspended org, deactivated user). It used to fall back to
-- profiles.org_id "for legacy tokens", which inverted that: a member removed
-- from an org lost the claim, fell through to profiles.org_id — which nothing
-- nulls on a soft archive — and kept SELECT on the entire org forever, as a
-- non-member. profiles.org_id is a per-user default for the NEXT sign-in, not a
-- session's identity; reading it here would also leak a sibling device's
-- switch_org into this session.
CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT NULLIF(auth.jwt() ->> 'org_id', '')::UUID;
$$;


-- Joins memberships on caller_org_id() (now JWT-sourced) rather than
-- profiles.org_id, so the role reflects this session's active org and not
-- whatever org another device most recently switched to.
CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT cm.org_role
       FROM public.organization_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.org_id = public.caller_org_id()
        AND cm.archived_at IS NULL
      LIMIT 1),
    'user'::public.org_role
  );
$$;


CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
$$;


CREATE OR REPLACE FUNCTION public.count_active_draft_sessions()
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM public.schedule_draft_sessions
  WHERE org_id = public.caller_org_id();
$$;


-- ── check_admin_permission ──────────────────────────────────────────────────
-- Returns TRUE if the current caller has the given fine-grained admin permission.
-- Gridmasters and super_admins always pass. Admins are checked against the
-- admin_permissions JSONB column in organization_memberships. Users always fail.
CREATE OR REPLACE FUNCTION public.check_admin_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    public.is_gridmaster()
    OR public.caller_org_role()::TEXT = 'super_admin'
    OR (
      public.caller_org_role()::TEXT = 'admin'
      AND COALESCE(
        (SELECT (cm.admin_permissions->>p_permission)::BOOLEAN
         FROM public.organization_memberships cm
         WHERE cm.user_id = auth.uid() AND cm.org_id = public.caller_org_id()),
        FALSE
      )
    );
$$;


-- ── Sandbox-aware org authorization ─────────────────────────────────────────
-- The sandbox flow (apps/web/src/lib/api-auth.ts, middleware.ts,
-- requireOrgPermissions) deliberately never refreshes the caller's JWT, so
-- caller_org_id() always returns the user's REAL org even while they're
-- inside a Test Sandbox. These helpers extend the org/permission checks used
-- by schedule-mutating RPCs to also accept the caller's own sandbox org,
-- mirroring the ownership check already used at the app layer.
CREATE OR REPLACE FUNCTION public.is_own_sandbox_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_org_id
      AND o.workspace_kind = 'sandbox'
      AND o.sandbox_owner_user_id = auth.uid()
      AND o.archived_at IS NULL
  );
$$;


CREATE OR REPLACE FUNCTION public.is_authorized_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    public.is_gridmaster()
    OR public.caller_org_id() = p_org_id
    OR public.is_own_sandbox_org(p_org_id);
$$;


-- Sandbox-aware companion to check_admin_permission(). Does not replace it —
-- check_admin_permission() is used broadly by RLS policies elsewhere and
-- stays real-org-only. Only schedule-mutating RPCs call this variant. A
-- sandbox owner is unconditionally treated as authorized within their own
-- sandbox, matching the app layer's widening of org_role to "super_admin"
-- inside sandbox mode (api-auth.ts requireAuthenticatedUserWithClaims).
CREATE OR REPLACE FUNCTION public.check_admin_permission_for_org(p_permission TEXT, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    public.is_gridmaster()
    OR (public.caller_org_id() = p_org_id AND public.check_admin_permission(p_permission))
    OR public.is_own_sandbox_org(p_org_id);
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CUSTOM ACCESS TOKEN HOOK (JWT Claims)
--
-- Writes platform_role, org_role, org_id, org_slug at the TOP LEVEL of JWT.
-- Filters archived orgs. Checks jwt_refresh_locks and returns 403 if locked.
-- Must be SECURITY DEFINER owned by postgres with VOLATILE.
-- ══════════════════════════════════════════════════════════════════════════════

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

-- Hook must be owned by postgres and accessible to supabase_auth_admin
ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO service_role;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. AUTH TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_full_name TEXT;
  v_first     TEXT;
  v_last      TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  );

  IF NEW.raw_user_meta_data->>'first_name' IS NOT NULL THEN
    v_first := NEW.raw_user_meta_data->>'first_name';
    v_last  := NEW.raw_user_meta_data->>'last_name';
  ELSIF v_full_name IS NOT NULL THEN
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := CASE
      WHEN position(' ' IN v_full_name) > 0
        THEN substring(v_full_name FROM position(' ' IN v_full_name) + 1)
      ELSE NULL
    END;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, v_first, v_last)
  ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name;

  RETURN NEW;
END;
$$;

-- Trigger on auth.users (in auth schema, must be created here)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Generic audit fields trigger
CREATE OR REPLACE FUNCTION public.set_audit_fields()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();

  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by = auth.uid();
      NEW.updated_by = auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_by = auth.uid();
      NEW.created_by = OLD.created_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CASCADE TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

-- Certification delete → remove from jobs.required_certification_ids
CREATE OR REPLACE FUNCTION public.remove_certification_from_assignments()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE public.jobs
  SET required_certification_ids = array_remove(required_certification_ids, OLD.id)
  WHERE org_id = OLD.org_id
    AND OLD.id = ANY(required_certification_ids);
  RETURN OLD;
END;
$$;

-- Permission change → audit log
CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.admin_permissions IS DISTINCT FROM NEW.admin_permissions THEN
    INSERT INTO public.role_change_log (
      org_id, target_user_id, changed_by_id, from_role, to_role,
      change_type, permissions_before, permissions_after, idempotency_key
    ) VALUES (
      NEW.org_id, NEW.user_id, auth.uid(), NEW.org_role::TEXT, NEW.org_role::TEXT,
      'permission_change', OLD.admin_permissions, NEW.admin_permissions,
      'perm-' || NEW.user_id || '-' || NEW.org_id || '-' || extract(epoch from NOW())::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Membership deleted → clear profiles.org_id + force JWT refresh
CREATE OR REPLACE FUNCTION public.on_membership_deleted()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = OLD.user_id AND org_id = OLD.org_id
  ) THEN
    UPDATE public.profiles
    SET org_id = NULL, updated_at = NOW()
    WHERE id = OLD.user_id;

    INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
      VALUES (OLD.user_id, NOW() + INTERVAL '5 seconds', 'membership_removed')
    ON CONFLICT (user_id) DO UPDATE
      SET locked_until = NOW() + INTERVAL '5 seconds',
          reason       = 'membership_removed';
  END IF;

  RETURN OLD;
END;
$$;

-- Membership ARCHIVED → the same teardown as a delete.
--
-- Removing someone from an organization is a soft archive everywhere in the app
-- (DELETE /api/organizations/access sets archived_at; nothing hard-deletes the
-- row), so on_membership_deleted above never fired for a real removal. That left
-- two holes, both closed here:
--
--   1. profiles.org_id kept pointing at the org the user was just removed from.
--      Paired with the old caller_org_id() fallback that was a permanent, total
--      read leak; caller_org_id() now fails closed, and this keeps the stale
--      pointer from resurfacing through get_my_organizations or a fresh sign-in.
--   2. No jwt_refresh_locks row, so the already-minted token kept its org_id and
--      org_role until it expired — up to an hour of continued admin access after
--      removal. The lock makes the next refresh 403 and sign the device out.
--
-- Deliberately a trigger function rather than a callable helper shared with
-- on_membership_deleted: a function returning `trigger` cannot be reached over
-- PostgREST, so the blanket EXECUTE grant in 004 cannot turn "clear any user's
-- org pointer" into an RPC.
CREATE OR REPLACE FUNCTION public.on_membership_archived()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  -- Read BEFORE the UPDATE below nulls it, or the lock check that reuses it
  -- would always see false.
  v_was_default BOOLEAN;
BEGIN
  v_was_default := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.user_id AND org_id = NEW.org_id
  );

  IF v_was_default THEN
    UPDATE public.profiles
    SET org_id = NULL, updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  -- Kill the outstanding tokens, but only when one of them can still be
  -- claiming THIS org: either it is the user's default for a fresh sign-in, or
  -- some device's session is pinned to it. profiles.org_id alone is not the
  -- test, because org context is per session — a phone can sit in the archived
  -- org while the profile default points elsewhere.
  --
  -- Conditional because the lock is per USER, not per session: it 403s the next
  -- refresh on every device they own. Firing it unconditionally would sign
  -- someone out of the org they are actively working in because they were
  -- removed from an unrelated one they had not touched in months.
  IF v_was_default OR EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE user_id = NEW.user_id AND active_org_id = NEW.org_id
  ) THEN
    INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
      VALUES (NEW.user_id, NOW() + INTERVAL '5 seconds', 'membership_removed')
    ON CONFLICT (user_id) DO UPDATE
      SET locked_until = NOW() + INTERVAL '5 seconds',
          reason       = 'membership_removed';
  END IF;

  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. ATTACH TRIGGERS TO TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- Audit field triggers
CREATE TRIGGER trigger_organizations_audit
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_focus_areas_audit
  BEFORE INSERT OR UPDATE ON public.focus_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_employees_audit
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_jobs_audit
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_absence_types_audit
  BEFORE INSERT OR UPDATE ON public.absence_types
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_schedule_cells_audit
  BEFORE INSERT OR UPDATE ON public.schedule_cells
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_schedule_notes_audit
  BEFORE INSERT OR UPDATE ON public.schedule_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_recurring_shifts_audit
  BEFORE INSERT OR UPDATE ON public.recurring_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_shift_series_audit
  BEFORE INSERT OR UPDATE ON public.shift_series
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_coverage_requirements_audit
  BEFORE INSERT OR UPDATE ON public.coverage_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_indicator_types_audit
  BEFORE INSERT OR UPDATE ON public.indicator_types
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_org_memberships_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trigger_invitations_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trigger_mobile_device_tokens_updated_at
  BEFORE UPDATE ON public.mobile_device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trigger_platform_feature_flags_updated_at
  BEFORE UPDATE ON public.platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cascade triggers
CREATE TRIGGER trg_certifications_delete_cascade
  AFTER DELETE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.remove_certification_from_assignments();

CREATE TRIGGER trg_log_permission_change
  AFTER UPDATE OF admin_permissions ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE TRIGGER trg_membership_deleted
  AFTER DELETE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.on_membership_deleted();

-- The path removals actually take. Fires only on the null → set transition, so
-- re-archiving an already-archived row (or any other UPDATE touching the column)
-- cannot re-lock a user out of a session they have since legitimately rebuilt.
CREATE TRIGGER trg_membership_archived
  AFTER UPDATE OF archived_at ON public.organization_memberships
  FOR EACH ROW
  WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
  EXECUTE FUNCTION public.on_membership_archived();

-- Guard: prevent direct UPDATE of org_role on organization_memberships.
-- All role changes must go through change_user_role() RPC which sets the
-- session variable 'app.allow_role_change' = 'true' before mutating.
-- This ensures every role change goes through the audit trail, idempotency,
-- advisory lock, and JWT refresh lock machinery.
CREATE OR REPLACE FUNCTION public.guard_org_role_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF OLD.org_role IS DISTINCT FROM NEW.org_role THEN
    IF current_setting('app.allow_role_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Direct org_role changes are not allowed. Use change_user_role() RPC.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_org_role_change
  BEFORE UPDATE OF org_role ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_role_change();


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── change_user_role ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT,
  p_org_id          UUID DEFAULT NULL,  -- explicit org context for multi-org
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role          TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_target_org_id     UUID;
  v_caller_platform_role TEXT;
  v_caller_org_role   TEXT;
  v_caller_org_id     UUID;
BEGIN
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- Self-action guard: no one may change their own org role (neither demotion
  -- nor promotion). Mirrors the gridmaster self-demotion guard. Forces another
  -- admin to act, which also prevents self-inflicted lockout.
  IF p_target_user_id = p_changed_by_id THEN
    RAISE EXCEPTION 'SELF_ACTION_FORBIDDEN: you cannot change your own role';
  END IF;

  -- Advisory lock prevents two callers from changing the same user's role
  -- simultaneously (last-write-wins race). Released at end of transaction.
  PERFORM pg_advisory_xact_lock(hashtext('change_role_' || p_target_user_id::TEXT));

  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- Resolve the org context: prefer explicit p_org_id, fall back to target's active org.
  IF p_org_id IS NOT NULL THEN
    v_target_org_id := p_org_id;
  ELSE
    SELECT org_id INTO v_target_org_id
    FROM profiles WHERE id = p_target_user_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active organization';
  END IF;

  SELECT org_role::TEXT, updated_at INTO v_old_role, v_current_updated_at
  FROM organization_memberships
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user has no membership for this organization';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Organization membership changed elsewhere';
  END IF;

  SELECT p.platform_role::TEXT
  INTO v_caller_platform_role
  FROM profiles p WHERE p.id = auth.uid();

  -- Resolve caller's role in the target org (not their active org).
  v_caller_org_id := v_target_org_id;
  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_target_org_id;

  IF v_caller_org_role IS NULL AND v_caller_platform_role <> 'gridmaster' THEN
    RAISE EXCEPTION 'Caller not found or has no membership';
  END IF;

  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_org_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- Org scoping: caller must have membership in the target org (already verified above).
  IF v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_org_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your organization';
    END IF;
  END IF;

  -- Tier guard: an admin may not touch privileged accounts in either
  -- direction. They cannot promote anyone INTO admin/super_admin/gridmaster,
  -- and cannot change the role of a target who already holds one of those
  -- tiers (which would otherwise let an admin demote a super_admin). Only
  -- super_admins and gridmasters manage privileged roles.
  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND (
       v_old_role IN ('gridmaster', 'admin', 'super_admin')
       OR p_new_role IN ('gridmaster', 'admin', 'super_admin')
     ) THEN
    RAISE EXCEPTION 'admin cannot change the role of an admin, super_admin, or gridmaster';
  END IF;

  -- Prevent demotion of the last super_admin in an org.
  IF v_old_role = 'super_admin' AND p_new_role <> 'super_admin' THEN
    IF (SELECT count(*) FROM organization_memberships
        WHERE org_id = v_target_org_id
          AND org_role = 'super_admin'
          AND user_id <> p_target_user_id
          AND archived_at IS NULL) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last super_admin of an organization';
    END IF;
  END IF;

  -- Set session flag to bypass the guard_org_role_change trigger.
  -- This is the ONLY authorised path for org_role mutations.
  PERFORM set_config('app.allow_role_change', 'true', true);

  UPDATE organization_memberships
  SET org_role = p_new_role::org_role
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id;

  UPDATE profiles
  SET version = version + 1, updated_at = NOW()
  WHERE id = p_target_user_id;

  INSERT INTO role_change_log
    (org_id, target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (v_target_org_id, p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds', reason = 'role_change';

  RETURN jsonb_build_object('status', 'success', 'from_role', v_old_role, 'to_role', p_new_role);
END;
$$;

COMMENT ON FUNCTION public.change_user_role IS 'Race-condition-safe role change RPC. Verifies caller identity via auth.uid(), gates on admin/super_admin/gridmaster, enforces org scoping (explicit p_org_id or fallback to target profiles.org_id), prevents admin self-promotion, and blocks any self role change (you cannot change your own role).';


-- ── assign_org_role_by_email ──────────────────────────────────────────────────

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
  -- Validate email format
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

  -- Tier guard: a non-gridmaster admin may only assign the 'user' role. They
  -- cannot grant admin or super_admin (which would let an admin self-promote
  -- or escalate anyone). Only super_admins and gridmasters assign privileged
  -- roles via this path.
  IF NOT public.is_gridmaster()
     AND public.caller_org_role() = 'admin'
     AND p_org_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot assign admin or super_admin';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role)
  VALUES (target_user_id, p_org_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id),
        updated_at = NOW();

  -- Bypass guard_org_role_change trigger — this is an authorised role path.
  PERFORM set_config('app.allow_role_change', 'true', true);

  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        updated_at = NOW();
END;
$$;


-- ── assign_gridmaster_by_email ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_gridmaster_by_email(p_email TEXT)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: only gridmaster can assign gridmaster role';
  END IF;

  SELECT (public.promote_gridmaster_by_email(p_email)->>'user_id')::UUID
  INTO target_user_id;
END;
$$;


-- ── switch_org ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.switch_org(target_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid        UUID;
  v_session_id UUID;
BEGIN
  v_uid := auth.uid();
  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;

  IF public.is_gridmaster() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = target_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Organization not found';
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = v_uid AND org_id = target_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  -- Reject switching a normal member into an archived OR suspended org. The JWT
  -- hook strips claims for suspended orgs anyway, but blocking the switch up
  -- front avoids landing the session in a no-org limbo. (Gridmasters are exempt
  -- above — oversight must still reach suspended orgs.)
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = target_org_id AND archived_at IS NULL AND suspended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Per-session org isolation: write active_org_id on the caller's user_sessions
  -- row so only this device's next JWT refresh adopts the new org. Other active
  -- sessions for this user keep their own active_org_id and are unaffected.
  -- Upserts to handle the window before the client first calls track-session.
  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.user_sessions (user_id, supabase_session_id, active_org_id)
    VALUES (v_uid, v_session_id, target_org_id)
    ON CONFLICT (supabase_session_id) DO UPDATE
      SET active_org_id  = EXCLUDED.active_org_id,
          last_active_at = NOW();
  END IF;

  -- Also update profiles.org_id as the default org for FUTURE sessions
  -- (e.g., next fresh sign-in on a new device). This does NOT affect existing
  -- sessions' claims because the hook prefers user_sessions.active_org_id.
  UPDATE public.profiles
  SET org_id = target_org_id, updated_at = NOW()
  WHERE id = v_uid;

  -- NOTE: switching orgs does NOT start a trial. switch_org is called by
  -- automatic reconciliation (web subdomain alignment after login, mobile
  -- switchMobileOrgIfNeeded on auth/refresh), not only by deliberate user
  -- switches, so a billing side effect here leaks trials onto orgs the user
  -- never chose to use. Trials start on the first super_admin LOGIN, via the
  -- start_trial_for_org RPC called from the genuine login flow (see below).

  -- No jwt_refresh_lock here: the caller refreshes immediately after this RPC,
  -- and the JWT hook reads from user_sessions.active_org_id (this session only).
  -- A lock would block the caller's own refreshSession() call. Other sessions
  -- are unaffected and do not need to refresh.
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_org(UUID) TO authenticated;


-- ── start_trial_for_org ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_trial_for_org(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Start the org's 14-day trial the first time a super_admin GENUINELY logs in to
  -- it. Called only from the real login flow (web login handler / mobile
  -- loginMobileUser), never from token refresh, automatic org reconciliation, or
  -- switch_org. Idempotent: guarded by trial_ends_at IS NULL. Self-gated to a
  -- super_admin membership so members/admins cannot start a trial. Keep the 14-day
  -- interval in sync with DEFAULT_TRIAL_DAYS in packages/domain/src/billing.ts.
  UPDATE public.organizations o
     SET trial_started_at = NOW(),
         trial_ends_at    = NOW() + INTERVAL '14 days'
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

GRANT EXECUTE ON FUNCTION public.start_trial_for_org(UUID) TO authenticated;


-- ── notify_gridmasters_of_org_event ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_gridmasters_of_org_event()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_type             TEXT;
  v_priority         TEXT := 'normal';
  v_title            TEXT;
  v_message          TEXT;
  v_name             TEXT := COALESCE(NEW.name, 'An organization');
  -- Parallel fan-out to org super_admins for billing-relevant transitions.
  -- Super_admins can't see platform-category rows (org_id = NULL); they need
  -- an org-scoped billing-category row to surface in their inbox.
  v_billing_type     TEXT;
  v_billing_priority TEXT := 'normal';
  v_billing_title    TEXT;
  v_billing_message  TEXT;
  -- Per-transition metadata for the super_admin row. Defaults to empty so the
  -- inbox modal renders just the title + message (no noisy DETAILS block with
  -- the org's own id/name). Set an actionUrl + actionLabel where there is a
  -- concrete next step the super_admin should take.
  v_billing_metadata JSONB := '{}'::jsonb;
BEGIN
  -- Surface important org lifecycle events to every gridmaster as an in-app
  -- notification, written with org_id = NULL so it shows regardless of the
  -- gridmaster's current org context (the get_notifications RPC returns rows where
  -- org_id IS NULL). Fires on every writer of the organizations table (web login,
  -- mobile login, gridmaster portal, org self-delete, Stripe webhook), so there is
  -- a single source of truth. Emits at most one notification per row change and
  -- returns NULL without inserting for non-noteworthy changes (settings edits,
  -- repeated identical Stripe 'updated' events) to keep the gridmaster feed quiet.
  IF TG_OP = 'INSERT' THEN
    v_type    := 'org_created';
    v_title   := 'New organization created';
    v_message := v_name || ' was just created.';
  ELSIF NEW.trial_started_at IS NOT NULL AND OLD.trial_started_at IS NULL THEN
    v_type    := 'org_trial_started';
    v_title   := 'Trial started';
    v_message := v_name || ' started its trial.';
    -- Super_admins see a billing-flavored welcome alert in their org inbox.
    v_billing_type     := 'billing_subscription_changed';
    v_billing_title    := 'Trial started';
    v_billing_message  := 'Your 14-day free trial is now active. Start a subscription before it ends to keep your team running.';
    v_billing_metadata := jsonb_build_object(
      'actionUrl',   '/settings?section=org-billing',
      'actionLabel', 'Start subscription'
    );
  ELSIF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    v_type     := 'org_archived';
    v_priority := 'high';
    v_title    := 'Organization archived';
    v_message  := v_name || ' was archived.';
  ELSIF NEW.archived_at IS NULL AND OLD.archived_at IS NOT NULL THEN
    v_type    := 'org_restored';
    v_title   := 'Organization restored';
    v_message := v_name || ' was restored.';
  ELSIF NEW.suspended_at IS NOT NULL AND OLD.suspended_at IS NULL THEN
    v_type     := 'org_suspended';
    v_priority := 'high';
    v_title    := 'Organization suspended';
    v_message  := v_name || ' was suspended.';
    -- Super_admins must learn immediately when their org is suspended.
    v_billing_type     := 'billing_subscription_changed';
    v_billing_priority := 'high';
    v_billing_title    := 'Your organization was suspended';
    v_billing_message  := 'Access to your organization has been suspended. Contact support to restore access.';
  ELSIF NEW.suspended_at IS NULL AND OLD.suspended_at IS NOT NULL THEN
    v_type    := 'org_unsuspended';
    v_title   := 'Organization unsuspended';
    v_message := v_name || ' was unsuspended.';
    v_billing_type    := 'billing_subscription_changed';
    v_billing_title   := 'Your organization was unsuspended';
    v_billing_message := 'Access to your organization has been restored.';
  ELSIF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    IF OLD.subscription_status = 'trialing' AND NEW.subscription_status = 'active' THEN
      v_type    := 'org_subscription_converted';
      v_title   := 'Trial converted to paid';
      v_message := v_name || ' converted from trial to a paid subscription.';
      v_billing_type    := 'billing_subscription_changed';
      v_billing_title   := 'Welcome to your paid plan';
      v_billing_message := 'Your trial was converted to a paid subscription. Thanks for your support.';
    ELSIF NEW.subscription_status = 'canceled' THEN
      v_type     := 'org_subscription_canceled';
      v_priority := 'high';
      v_title    := 'Subscription canceled';
      v_message  := v_name || ' canceled its subscription.';
      v_billing_type     := 'billing_subscription_changed';
      v_billing_priority := 'high';
      v_billing_title    := 'Subscription canceled';
      v_billing_message  := 'Your subscription was canceled. Resubscribe to keep access after the current period ends.';
    ELSIF NEW.subscription_status IN ('past_due', 'unpaid')
          AND OLD.subscription_status NOT IN ('past_due', 'unpaid') THEN
      -- Fire once when the org first enters a failed-payment state; a later
      -- past_due -> unpaid escalation must not produce a second alert.
      v_type     := 'org_payment_failed';
      v_priority := 'high';
      v_title    := 'Payment failed';
      v_message  := 'A payment for ' || v_name || ' failed.';
      v_billing_type     := 'billing_payment_failed';
      v_billing_priority := 'high';
      v_billing_title    := 'Payment failed';
      v_billing_message  := 'A payment for your subscription failed. Update your payment method to avoid losing access.';
    ELSE
      RETURN NULL;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- A notification is a side effect of the org operation that fired this trigger
  -- (trial start, Stripe webhook sync, org create/suspend/archive). Never let a
  -- failure here roll back that operation: swallow and log instead of propagating.
  BEGIN
    INSERT INTO public.notifications (
      user_id, org_id, type, channel, category, priority, title, message, metadata
    )
    SELECT
      p.id, NULL, v_type, 'in_app', 'platform', v_priority, v_title, v_message,
      jsonb_build_object('orgId', NEW.id, 'orgName', NEW.name, 'slug', NEW.slug)
    FROM public.profiles p
    WHERE p.platform_role = 'gridmaster';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_gridmasters_of_org_event: failed to notify gridmasters for org % (%): %',
      NEW.id, v_type, SQLERRM;
  END;

  -- Parallel super_admin fan-out (only for billing-relevant transitions where
  -- v_billing_type was set above). Org-scoped (org_id = NEW.id) so the row
  -- appears in the super_admin's org inbox under the billing category.
  IF v_billing_type IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        user_id, org_id, type, channel, category, priority, title, message, metadata
      )
      SELECT
        cm.user_id, NEW.id, v_billing_type, 'in_app', 'billing', v_billing_priority,
        v_billing_title, v_billing_message, v_billing_metadata
      FROM public.organization_memberships cm
      WHERE cm.org_id = NEW.id
        AND cm.org_role = 'super_admin'
        AND cm.archived_at IS NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_gridmasters_of_org_event: failed to notify super_admins for org % (%): %',
        NEW.id, v_billing_type, SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

-- Notify gridmasters of important org lifecycle events (trial start, create,
-- archive/restore, suspend/unsuspend, subscription conversion/cancel/payment fail).
-- Attached here (not in section 5) so the trigger is created after its function exists.
CREATE TRIGGER trg_notify_gridmasters_of_org_event
  AFTER INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.notify_gridmasters_of_org_event();


-- ── security_email_changed + security_password_changed ───────────────────────
-- Intentionally NOT wired today.
--
-- Email + password changes happen client-side via supabase.auth.updateUser,
-- so the only reliable producer is a DB trigger on auth.users. An earlier
-- iteration shipped DB triggers that wrote in-app rows. That was wrong:
-- the actor is the user staring at the app, so an in-app "your password
-- changed" alert is noise — the legitimate security value lives out-of-band
-- (email to the on-file/old address, push to other devices).
--
-- DB triggers can't reach Resend or Expo Push directly. A correct producer
-- needs either pg_net to POST an internal route, or a client-side callback
-- that hits a server route after updateUser succeeds. Until that's wired,
-- these alerts are intentionally absent rather than created as in-app spam.


-- ── get_my_organizations ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (
  org_id    UUID,
  org_name  TEXT,
  org_slug  TEXT,
  org_role  public.org_role,
  is_active BOOLEAN
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid        UUID;
  v_session_id UUID;
  v_active_oid UUID;
BEGIN
  v_uid := auth.uid();
  v_session_id := NULLIF(auth.jwt() ->> 'session_id', '')::UUID;

  -- `is_active` means "the org THIS device is in", so it has to resolve the
  -- same way custom_access_token_hook resolves the claims: the calling
  -- session's active_org_id first, profiles.org_id only as the no-session-row
  -- fallback. Reading profiles.org_id alone reported another device's most
  -- recent switch_org as this device's current org — and the mobile login flow
  -- believes it, skipping switch_org + refreshSession whenever is_active is
  -- true, which left the app showing one org's name over another org's data.
  SELECT COALESCE(
    (SELECT s.active_org_id
       FROM public.user_sessions s
      WHERE s.supabase_session_id = v_session_id
        AND s.user_id = v_uid),
    (SELECT p.org_id FROM public.profiles p WHERE p.id = v_uid)
  ) INTO v_active_oid;

  IF public.is_gridmaster() THEN
    RETURN QUERY
    SELECT o.id, o.name, o.slug, 'user'::public.org_role, (o.id = v_active_oid)
    FROM public.organizations o ORDER BY o.name;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cm.org_id, o.name, o.slug, cm.org_role, (cm.org_id = v_active_oid)
  FROM public.organization_memberships cm
  JOIN public.organizations o ON o.id = cm.org_id
  WHERE cm.user_id = v_uid
    AND cm.archived_at IS NULL
    AND o.archived_at IS NULL
  ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;


-- ── publish_schedule ──────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.build_schedule_cell_state_json(TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN[], BIGINT);
DROP FUNCTION IF EXISTS public.build_schedule_cell_state_json(TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN[]);

CREATE OR REPLACE FUNCTION public.build_schedule_cell_state_json(
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_focus_area_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH ordered_segments AS (
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'shiftId', segment.shift_id,
            'jobId', segment.job_id,
            'position', segment.ordinality - 1,
            'isMentored', COALESCE(segment.is_mentored, FALSE)
          )
          ORDER BY segment.ordinality
        ),
        '[]'::JSONB
      ) AS segments
    FROM unnest(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
  )
  SELECT jsonb_build_object(
    'kind', COALESCE(p_state_kind, 'deleted'),
    'segments', CASE
      WHEN p_state_kind = 'worked' THEN ordered_segments.segments
      ELSE '[]'::JSONB
    END,
    'focusAreaId', p_focus_area_id,
    'absenceTypeId', CASE
      WHEN p_state_kind = 'absence' THEN p_absence_type_id
      ELSE NULL
    END,
    'customStartTime', CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    'customEndTime', CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    'seriesId', p_series_id,
    'fromRecurring', COALESCE(p_from_recurring, FALSE)
  )
  FROM ordered_segments;
$$;

DROP FUNCTION IF EXISTS public.publish_schedule(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id     UUID,
  p_start_date DATE,
  p_end_date   DATE,
  p_actor_id   UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_changes JSONB := '[]'::JSONB;
  v_change_count INTEGER := 0;
  v_history_id UUID;
  v_note_new INTEGER := 0;
  v_note_deleted INTEGER := 0;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  v_is_gridmaster BOOLEAN := FALSE;
  v_org_role public.org_role := 'user'::public.org_role;
  r RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing actor identity';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_actor_id
      AND platform_role = 'gridmaster'
  )
  INTO v_is_gridmaster;

  SELECT COALESCE(
    (
      SELECT cm.org_role
      FROM public.organization_memberships cm
      WHERE cm.user_id = v_actor_id
        AND cm.org_id = p_org_id
        AND cm.archived_at IS NULL
      LIMIT 1
    ),
    'user'::public.org_role
  )
  INTO v_org_role;

  IF NOT (
    v_is_gridmaster
    OR v_org_role::TEXT IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- Enforce canPublishSchedule for admins (super_admin and gridmaster bypass)
  IF v_org_role::TEXT = 'admin' AND NOT v_is_gridmaster THEN
    IF NOT COALESCE(
      (SELECT (cm.admin_permissions->>'canPublishSchedule')::BOOLEAN
       FROM public.organization_memberships cm
       WHERE cm.user_id = v_actor_id
         AND cm.org_id = p_org_id
         AND cm.archived_at IS NULL),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to publish the schedule';
    END IF;
  END IF;

  -- Advisory lock prevents concurrent publishes for same org
  PERFORM pg_advisory_xact_lock(hashtext('publish_schedule_' || p_org_id::TEXT));

  -- Capture draft changes from canonical schedule cells and promote them.
  FOR r IN
    SELECT
      c.id AS cell_id,
      c.emp_id,
      c.date,
      c.series_id,
      c.from_recurring,
      c.focus_area_id,
      c.updated_by,
      draft.state_kind AS draft_state_kind,
      draft.absence_type_id AS draft_absence_type_id,
      draft.custom_start_time AS draft_custom_start,
      draft.custom_end_time AS draft_custom_end,
      draft.shift_ids AS draft_shift_ids,
      draft.job_ids AS draft_job_ids,
      draft.is_mentored_flags AS draft_is_mentored_flags,
      published.state_kind AS published_state_kind,
      published.absence_type_id AS published_absence_type_id,
      published.custom_start_time AS published_custom_start,
      published.custom_end_time AS published_custom_end,
      published.shift_ids AS published_shift_ids,
      published.job_ids AS published_job_ids,
      published.is_mentored_flags AS published_is_mentored_flags
    FROM public.schedule_cells c
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'draft'
    ) AS draft ON TRUE
    LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'published'
    ) AS published ON TRUE
    WHERE c.org_id = p_org_id
      AND c.date >= p_start_date
      AND c.date <= p_end_date
  LOOP
    v_change_count := v_change_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'empId', r.emp_id,
      'date', r.date,
      'kind', CASE
        WHEN r.draft_state_kind = 'deleted' THEN 'deleted'
        WHEN r.published_state_kind IS NULL THEN 'new'
        ELSE 'modified'
      END,
      'fromState', CASE
        WHEN r.published_state_kind IS NULL THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.published_state_kind,
          r.published_shift_ids,
          r.published_job_ids,
          r.published_absence_type_id,
          r.published_custom_start,
          r.published_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.published_is_mentored_flags, '{}'::BOOLEAN[])
        )
      END,
      'toState', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.draft_state_kind,
          r.draft_shift_ids,
          r.draft_job_ids,
          r.draft_absence_type_id,
          r.draft_custom_start,
          r.draft_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
        )
      END,
      'fromAbsenceTypeId', r.published_absence_type_id,
      'toAbsenceTypeId', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_absence_type_id
      END,
      'updatedBy', r.updated_by,
      'fromCustomStart', r.published_custom_start,
      'fromCustomEnd', r.published_custom_end,
      'toCustomStart', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_start
      END,
      'toCustomEnd', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_end
      END
    ));

    IF r.draft_state_kind = 'deleted' THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.cell_id;
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        r.emp_id,
        r.date,
        'published',
        r.draft_state_kind,
        COALESCE(r.draft_shift_ids, '{}'::BIGINT[]),
        COALESCE(r.draft_job_ids, '{}'::BIGINT[]),
        r.draft_absence_type_id,
        r.draft_custom_start,
        r.draft_custom_end,
        r.series_id,
        r.from_recurring,
        r.focus_area_id,
        NULL,
        v_actor_id,
        COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
      );

      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.cell_id
        AND snapshot_kind = 'draft';

      PERFORM public.prune_empty_schedule_cell(r.cell_id);
    END IF;
  END LOOP;

  -- Count note changes
  SELECT COUNT(*) INTO v_note_new FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft';
  SELECT COUNT(*) INTO v_note_deleted FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft_deleted';

  v_change_count := v_change_count + v_note_new + v_note_deleted;

  -- Insert publish_history record
  INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
  VALUES (p_org_id, v_actor_id, p_start_date, p_end_date, v_change_count)
  RETURNING id INTO v_history_id;

  -- Explode the in-memory changes array into one row per changed cell.
  INSERT INTO public.schedule_publish_changes (
    publish_history_id, org_id, emp_id, date, kind, from_state, to_state,
    from_absence_type_id, to_absence_type_id, updated_by,
    from_custom_start, from_custom_end, to_custom_start, to_custom_end
  )
  SELECT
    v_history_id,
    p_org_id,
    (c->>'empId')::UUID,
    (c->>'date')::DATE,
    c->>'kind',
    c->'fromState',
    c->'toState',
    NULLIF(c->>'fromAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'toAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'updatedBy', '')::UUID,
    NULLIF(c->>'fromCustomStart', '')::TIME,
    NULLIF(c->>'fromCustomEnd', '')::TIME,
    NULLIF(c->>'toCustomStart', '')::TIME,
    NULLIF(c->>'toCustomEnd', '')::TIME
  FROM jsonb_array_elements(v_changes) AS c;

  -- Notes: draft → published
  UPDATE public.schedule_notes
  SET status = 'published', updated_at = NOW()
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft';

  -- Notes: finalize deletions
  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft_deleted';

  -- Create per-employee notifications for linked users
  FOR r IN
    SELECT DISTINCT ON (e.user_id)
           c->>'empId' AS emp_id,
           e.user_id,
           c->>'kind' AS kind,
           c->>'date' AS change_date
    FROM jsonb_array_elements(v_changes) AS c
    JOIN public.employees e ON e.id = (c->>'empId')::UUID
    WHERE e.user_id IS NOT NULL
      AND e.user_id <> v_actor_id
  LOOP
    INSERT INTO public.notifications (user_id, org_id, type, channel, category, title, message, metadata)
    VALUES (
      r.user_id,
      p_org_id,
      'shift_change',
      'in_app',
      'schedule',
      CASE r.kind
        WHEN 'new' THEN 'New shift assigned'
        WHEN 'modified' THEN 'Your shift was changed'
        WHEN 'deleted' THEN 'Your shift was removed'
      END,
      'Your schedule for ' || to_char(r.change_date::DATE, 'FMDay, FMMonth DD') || ' was updated.',
      jsonb_build_object(
        'empId', r.emp_id,
        'date', r.change_date,
        'kind', r.kind,
        'publishedBy', v_actor_id
      )
    );
  END LOOP;

  -- Purge old history (keep last 100 per org)
  DELETE FROM public.publish_history
  WHERE org_id = p_org_id
    AND id NOT IN (
      SELECT id FROM public.publish_history
      WHERE org_id = p_org_id
      ORDER BY published_at DESC
      LIMIT 100
    );

  RETURN v_history_id;
END;
$$;


-- ── move_shift (atomic drag-and-drop) ────────────────────────────────────────
-- Atomically moves a shift from one employee+date to another.
-- Prevents duplication that can occur when the two-step client-side approach
-- partially fails.

DROP FUNCTION IF EXISTS public.move_shift(UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN[]);
DROP FUNCTION IF EXISTS public.move_shift(UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, BOOLEAN[]);

CREATE OR REPLACE FUNCTION public.move_shift(
  p_org_id            UUID,
  p_source_emp_id     UUID,
  p_source_date       DATE,
  p_target_emp_id     UUID,
  p_target_date       DATE,
  p_kind              TEXT,
  p_shift_ids         BIGINT[],
  p_job_ids           BIGINT[],
  p_absence_type_id   BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time   TEXT DEFAULT NULL,
  p_drag_mode         TEXT DEFAULT 'move',
  p_expected_version  BIGINT DEFAULT NULL,
  p_target_expected_version BIGINT DEFAULT NULL,
  p_target_was_empty  BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_cell public.schedule_cells%ROWTYPE;
  v_target_cell public.schedule_cells%ROWTYPE;
  v_target_found BOOLEAN := FALSE;
  v_target_write_expected_version BIGINT;
  v_lock_key_src  TEXT;
  v_lock_key_tgt  TEXT;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  -- Org scoping: caller must belong to p_org_id (gridmaster exempt)
  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_drag_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Invalid drag mode: %', p_drag_mode;
  END IF;

  IF p_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Invalid move payload kind: %', p_kind;
  END IF;

  -- Reject no-op self-move
  IF p_source_emp_id = p_target_emp_id AND p_source_date = p_target_date THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- Validate target employee is active and belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_target_emp_id AND e.org_id = p_org_id
      AND e.status = 'active' AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target employee not found, archived, or inactive';
  END IF;

  -- Advisory locks in deterministic order to prevent deadlocks
  v_lock_key_src := p_source_emp_id::TEXT || '_' || p_source_date::TEXT;
  v_lock_key_tgt := p_target_emp_id::TEXT || '_' || p_target_date::TEXT;

  IF v_lock_key_src < v_lock_key_tgt THEN
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
  END IF;

  -- Validate source schedule cell exists and belongs to org
  SELECT *
  INTO v_source_cell
  FROM public.schedule_cells
  WHERE emp_id = p_source_emp_id
    AND date = p_source_date
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source shift not found';
  END IF;

  IF p_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence moves require an absence type';
  END IF;

  IF p_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked moves require at least one segment';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_kind = 'absence' AND (
    array_length(COALESCE(p_shift_ids, '{}'::BIGINT[]), 1) IS NOT NULL
    OR array_length(COALESCE(p_job_ids, '{}'::BIGINT[]), 1) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot move both worked segments and an absence type';
  END IF;

  -- Optimistic lock check
  IF p_expected_version IS NOT NULL AND v_source_cell.version != p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_source_cell.version;
  END IF;

  SELECT *
  INTO v_target_cell
  FROM public.schedule_cells
  WHERE emp_id = p_target_emp_id
    AND date = p_target_date
    AND org_id = p_org_id
  FOR UPDATE;

  v_target_found := FOUND;

  IF p_target_was_empty AND v_target_found THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected empty target, found version %',
      v_target_cell.version;
  END IF;

  IF p_target_expected_version IS NOT NULL THEN
    IF NOT v_target_found AND p_target_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, NULL;
    END IF;

    IF v_target_found AND v_target_cell.version IS DISTINCT FROM p_target_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, v_target_cell.version;
    END IF;
  END IF;

  v_target_write_expected_version := COALESCE(
    p_target_expected_version,
    CASE
      WHEN p_target_was_empty THEN 0
      WHEN v_target_found THEN v_target_cell.version
      ELSE 0
    END
  );

  PERFORM public.write_schedule_cell_snapshot(
    p_org_id,
    p_target_emp_id,
    p_target_date,
    'draft',
    p_kind,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind = 'absence' THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    NULL,
    FALSE,
    v_source_cell.focus_area_id,
    v_target_write_expected_version,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END
  );

  -- Delete source only for real moves. Copies leave the origin untouched.
  IF p_drag_mode = 'move' THEN
    PERFORM public.delete_schedule_cell_draft(
      p_org_id,
      p_source_emp_id,
      p_source_date,
      p_expected_version
    );
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_shift(UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, BOOLEAN[]) TO authenticated;


-- ── schedule state storage helpers ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_schedule_state_storage(
  p_org_id UUID,
  p_state JSONB
) RETURNS TABLE (
  state_kind TEXT,
  shift_ids BIGINT[],
  job_ids BIGINT[],
  is_mentored_flags BOOLEAN[],
  absence_type_id BIGINT,
  focus_area_id BIGINT
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_state_kind TEXT;
  v_absence_type_id BIGINT;
  v_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_job_ids BIGINT[] := '{}'::BIGINT[];
  v_is_mentored_flags BOOLEAN[] := '{}'::BOOLEAN[];
  v_focus_area_id BIGINT;
BEGIN
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'Schedule state must be a JSON object';
  END IF;

  v_state_kind := COALESCE(p_state->>'kind', '');
  IF v_state_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Schedule state must be either worked or absence';
  END IF;

  v_absence_type_id := NULLIF(p_state->>'absenceTypeId', '')::BIGINT;
  v_focus_area_id := NULLIF(p_state->>'focusAreaId', '')::BIGINT;

  IF v_state_kind = 'worked' THEN
    SELECT
      COALESCE(
        array_agg(NULLIF(segment->>'shiftId', 'null')::BIGINT ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BIGINT[]
      ),
      COALESCE(
        array_agg((segment->>'jobId')::BIGINT ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BIGINT[]
      ),
      COALESCE(
        array_agg(COALESCE((segment->>'isMentored')::BOOLEAN, false) ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BOOLEAN[]
      )
    INTO v_shift_ids, v_job_ids, v_is_mentored_flags
    FROM jsonb_array_elements(COALESCE(p_state->'segments', '[]'::JSONB)) WITH ORDINALITY AS segments(segment, ordinality);

    IF array_length(v_job_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Worked schedule state must include at least one segment';
    END IF;

    IF array_position(v_job_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Worked schedule state cannot include a segment without jobId';
    END IF;

    IF v_absence_type_id IS NOT NULL THEN
      RAISE EXCEPTION 'Worked schedule state cannot include absenceTypeId';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_job_ids) AS job_id
      LEFT JOIN public.jobs j
        ON j.id = job_id
       AND j.org_id = p_org_id
       AND j.archived_at IS NULL
      WHERE j.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more schedule state jobs were not found in this organization';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_shift_ids) AS shift_id
      LEFT JOIN public.shift_categories sc
        ON sc.id = shift_id
       AND sc.org_id = p_org_id
       AND sc.archived_at IS NULL
      WHERE shift_id IS NOT NULL
        AND sc.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more schedule state shifts were not found in this organization';
    END IF;

    IF v_focus_area_id IS NULL THEN
      SELECT sc.focus_area_id
      INTO v_focus_area_id
      FROM unnest(v_shift_ids) WITH ORDINALITY AS segment(shift_id, ordinality)
      JOIN public.shift_categories sc
        ON sc.id = segment.shift_id
       AND sc.org_id = p_org_id
      WHERE segment.shift_id IS NOT NULL
      ORDER BY segment.ordinality
      LIMIT 1;
    END IF;
  ELSE
    IF v_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Absence schedule state must include absenceTypeId';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.absence_types at
      WHERE at.id = v_absence_type_id
        AND at.org_id = p_org_id
        AND at.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found in this organization';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_state_kind,
    v_shift_ids,
    v_job_ids,
    v_is_mentored_flags,
    CASE WHEN v_state_kind = 'absence' THEN v_absence_type_id ELSE NULL END,
    v_focus_area_id;
END;
$$;


-- ── series shift bulk editors ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.update_series_all_shifts(UUID, BIGINT, BIGINT, UUID, BIGINT);
DROP FUNCTION IF EXISTS public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER);

CREATE OR REPLACE FUNCTION public.create_shift_series(
  p_series_id UUID,
  p_emp_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_frequency public.shift_series_frequency,
  p_days_of_week SMALLINT[] DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT NULL,
  p_max_occurrences INTEGER DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_series_id UUID := COALESCE(p_series_id, gen_random_uuid());
  v_state RECORD;
  v_current_date DATE := p_start_date;
  v_end_date DATE := COALESCE(p_end_date, (p_start_date + INTERVAL '7 months')::DATE);
  v_cap INTEGER := COALESCE(p_max_occurrences, 183);
  v_occurrence_count INTEGER := 0;
  v_start_day_of_week INTEGER := EXTRACT(DOW FROM p_start_date)::INTEGER;
  v_day_of_week INTEGER;
  v_day_index INTEGER;
  v_week_index INTEGER;
  v_day_match BOOLEAN;
  v_include BOOLEAN;
  v_existing_version BIGINT;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Series start date is required';
  END IF;

  IF v_end_date < p_start_date THEN
    RAISE EXCEPTION 'Series end date must be on or after start date';
  END IF;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'Series max occurrences must be positive';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  INSERT INTO public.shift_series (
    id,
    emp_id,
    org_id,
    state,
    frequency,
    days_of_week,
    start_date,
    end_date,
    max_occurrences
  ) VALUES (
    v_series_id,
    p_emp_id,
    p_org_id,
    jsonb_set(p_state, '{seriesId}', to_jsonb(v_series_id::TEXT), TRUE),
    p_frequency,
    p_days_of_week,
    p_start_date,
    p_end_date,
    p_max_occurrences
  );

  WHILE v_current_date <= v_end_date AND v_occurrence_count < v_cap LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
    v_day_index := v_current_date - p_start_date;
    v_week_index := FLOOR(v_day_index / 7.0)::INTEGER;
    v_day_match := CASE
      WHEN array_length(p_days_of_week, 1) IS NULL THEN v_day_of_week = v_start_day_of_week
      ELSE v_day_of_week = ANY(p_days_of_week)
    END;
    v_include := CASE p_frequency
      WHEN 'daily' THEN TRUE
      WHEN 'weekly' THEN v_day_match
      WHEN 'biweekly' THEN v_week_index % 2 = 0 AND v_day_match
      ELSE FALSE
    END;

    IF v_include THEN
      SELECT c.version
      INTO v_existing_version
      FROM public.schedule_cells c
      WHERE c.org_id = p_org_id
        AND c.emp_id = p_emp_id
        AND c.date = v_current_date
      FOR UPDATE;

      IF NOT FOUND THEN
        v_existing_version := 0;
      END IF;

      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        p_emp_id,
        v_current_date,
        'draft',
        v_state.state_kind,
        v_state.shift_ids,
        v_state.job_ids,
        v_state.absence_type_id,
        NULL,
        NULL,
        v_series_id,
        FALSE,
        v_state.focus_area_id,
        v_existing_version,
        auth.uid(),
        v_state.is_mentored_flags
      );

      v_occurrence_count := v_occurrence_count + 1;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_series_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_series_all_shifts(
  p_series_id UUID,
  p_org_id UUID,
  p_state JSONB
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_state RECORD;
  r RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  FOR r IN
    SELECT emp_id, date, version, focus_area_id, from_recurring
    FROM public.schedule_cells
    WHERE org_id = p_org_id
      AND series_id = p_series_id
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.date,
      'draft',
      v_state.state_kind,
      v_state.shift_ids,
      v_state.job_ids,
      v_state.absence_type_id,
      NULL,
      NULL,
      p_series_id,
      COALESCE(r.from_recurring, FALSE),
      COALESCE(v_state.focus_area_id, r.focus_area_id),
      r.version,
      auth.uid(),
      v_state.is_mentored_flags
    );
  END LOOP;

  UPDATE public.shift_series
  SET state = p_state,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND id = p_series_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_series_all_shifts(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_shift_series(
  p_series_id UUID,
  p_org_id UUID
) RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_has_published BOOLEAN;
  r RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  FOR r IN
    SELECT id, emp_id, date, version
    FROM public.schedule_cells
    WHERE org_id = p_org_id
      AND series_id = p_series_id
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_cell_snapshots snapshot
      WHERE snapshot.cell_id = r.id
        AND snapshot.snapshot_kind = 'published'
    )
    INTO v_has_published;

    IF v_has_published THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        r.emp_id,
        r.date,
        'draft',
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        r.version,
        auth.uid()
      );
    ELSE
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    END IF;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  UPDATE public.shift_series
  SET archived_at = NOW(),
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND id = p_series_id;

  UPDATE public.schedule_cells
  SET series_id = NULL
  WHERE org_id = p_org_id
    AND series_id = p_series_id;

  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_shift_series(UUID, UUID) TO authenticated;


-- ── upsert_recurring_shift ──────────────────────────────────────────────────
-- Archives the current active recurring template for an employee/day before
-- inserting the next one. This keeps recurring schedule saves atomic and
-- aligned with the active-row partial unique index on recurring_shifts.

CREATE OR REPLACE FUNCTION public.upsert_recurring_shift(
  p_emp_id UUID,
  p_org_id UUID,
  p_day_of_week SMALLINT,
  p_state JSONB,
  p_effective_from DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_recurring_shift_id UUID;
  v_state RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageRecurringShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageRecurringShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_day_of_week < 0 OR p_day_of_week > 6 THEN
    RAISE EXCEPTION 'Invalid day_of_week: must be between 0 and 6';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Employee not found in this organization';
  END IF;

  UPDATE public.recurring_shifts
  SET archived_at = NOW()
  WHERE emp_id = p_emp_id
    AND org_id = p_org_id
    AND day_of_week = p_day_of_week
    AND archived_at IS NULL;

  INSERT INTO public.recurring_shifts (
    emp_id,
    org_id,
    day_of_week,
    state,
    effective_from,
    effective_until
  ) VALUES (
    p_emp_id,
    p_org_id,
    p_day_of_week,
    p_state,
    COALESCE(p_effective_from, CURRENT_DATE),
    NULL
  )
  RETURNING id INTO v_recurring_shift_id;

  RETURN v_recurring_shift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_recurring_shift(UUID, UUID, SMALLINT, JSONB, DATE) TO authenticated;


CREATE OR REPLACE FUNCTION public.schedule_cell_has_effective_content(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_cells c
    LEFT JOIN public.schedule_cell_snapshots draft
      ON draft.cell_id = c.id
     AND draft.snapshot_kind = 'draft'
    LEFT JOIN public.schedule_cell_snapshots published
      ON published.cell_id = c.id
     AND published.snapshot_kind = 'published'
    WHERE c.org_id = p_org_id
      AND c.emp_id = p_emp_id
      AND c.date = p_date
      AND (
        (draft.id IS NOT NULL AND draft.state_kind <> 'deleted')
        OR (draft.id IS NULL AND published.id IS NOT NULL)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.schedule_cell_has_effective_content(UUID, UUID, DATE) TO authenticated;


-- ── is_employee_qualified_for_shift_job ───────────────────────────────────────
-- Server-side mirror of the client's isEmployeeQualifiedForAssignableShift
-- (apps/web/src/lib/assignable-shifts.ts). Returns NULL when the employee is
-- qualified for the (shift, job) pair, or one of 'focus_area' / 'role' / 'cert'
-- naming the gate that rejected them.
--
-- Used by import_previous_schedule to skip cells whose qualification has
-- drifted since the source period was authored.

CREATE OR REPLACE FUNCTION public.is_employee_qualified_for_shift_job(
  p_emp_id   UUID,
  p_shift_id BIGINT,
  p_job_id   BIGINT
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_focus_area_ids BIGINT[];
  v_emp_role_ids       BIGINT[];
  v_emp_certification_id BIGINT;
  v_emp_org_id         UUID;
  v_shift_focus_area_id BIGINT;
  v_job_eligible_role_ids BIGINT[];
  v_job_required_cert_ids BIGINT[];
  v_job_eligibility_mode TEXT;
  v_schedule_role_ids  BIGINT[];
  v_filtered_role_ids  BIGINT[];
  v_roles_ok           BOOLEAN;
  v_certs_ok           BOOLEAN;
  v_has_role_gate      BOOLEAN;
  v_has_cert_gate      BOOLEAN;
BEGIN
  SELECT focus_area_ids, role_ids, certification_id, org_id
    INTO v_emp_focus_area_ids, v_emp_role_ids, v_emp_certification_id, v_emp_org_id
  FROM public.employees
  WHERE id = p_emp_id;

  IF v_emp_org_id IS NULL THEN
    -- Employee row vanished; caller should treat as inactive elsewhere.
    RETURN 'role';
  END IF;

  -- Focus area gate (shift-scoped)
  IF p_shift_id IS NOT NULL THEN
    SELECT focus_area_id INTO v_shift_focus_area_id
    FROM public.shift_categories
    WHERE id = p_shift_id;
    IF v_shift_focus_area_id IS NOT NULL
       AND NOT (v_shift_focus_area_id = ANY(v_emp_focus_area_ids)) THEN
      RETURN 'focus_area';
    END IF;
  END IF;

  -- Job gates (role + certification)
  SELECT eligible_role_ids, required_certification_ids, eligibility_mode
    INTO v_job_eligible_role_ids, v_job_required_cert_ids, v_job_eligibility_mode
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_eligible_role_ids IS NULL THEN
    -- Job vanished; surface as a role-gate failure rather than crashing the
    -- whole import.
    RETURN 'role';
  END IF;

  -- Mirror the client's getScheduleEligibleRoleIds (assignable-shifts.ts):
  -- only roles flagged is_schedule_role count toward the role gate. NOTE:
  -- archived roles are NOT filtered out — the client's editor still treats
  -- them as eligible if a job references them, so the import must agree to
  -- avoid disqualifying shifts the user could create elsewhere on the page.
  IF COALESCE(array_length(v_job_eligible_role_ids, 1), 0) > 0 THEN
    SELECT COALESCE(array_agg(orole.id), '{}'::BIGINT[])
      INTO v_schedule_role_ids
    FROM public.organization_roles orole
    WHERE orole.org_id = v_emp_org_id
      AND orole.is_schedule_role = TRUE
      AND orole.id = ANY(v_job_eligible_role_ids);
    v_filtered_role_ids := v_schedule_role_ids;
  ELSE
    v_filtered_role_ids := '{}'::BIGINT[];
  END IF;

  v_has_role_gate := COALESCE(array_length(v_filtered_role_ids, 1), 0) > 0;
  v_has_cert_gate := COALESCE(array_length(v_job_required_cert_ids, 1), 0) > 0;

  v_roles_ok := NOT v_has_role_gate
    OR EXISTS (
      SELECT 1 FROM unnest(v_filtered_role_ids) AS r(id)
      WHERE r.id = ANY(v_emp_role_ids)
    );

  v_certs_ok := NOT v_has_cert_gate
    OR (v_emp_certification_id IS NOT NULL
        AND v_emp_certification_id = ANY(v_job_required_cert_ids));

  IF v_has_role_gate AND v_has_cert_gate
     AND COALESCE(v_job_eligibility_mode, 'and') = 'or' THEN
    IF v_roles_ok OR v_certs_ok THEN
      RETURN NULL;
    END IF;
    -- Both failed; surface the role gate first (matches client message order).
    RETURN 'role';
  END IF;

  IF NOT v_roles_ok THEN
    RETURN 'role';
  END IF;
  IF NOT v_certs_ok THEN
    RETURN 'cert';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_employee_qualified_for_shift_job(UUID, BIGINT, BIGINT) TO authenticated;


-- ── import_previous_schedule ──────────────────────────────────────────────────
-- Server-owned atomic operation that copies the effective contents of the
-- source date range into the target date range as drafts.
--
-- - Source data is read from the DB (effective = draft if non-deleted, else
--   published). Cells with no effective content are excluded.
-- - Target emptiness is decided by schedule_cell_has_effective_content — the
--   same rule recurring-schedule application uses, so phantom DB shapes never
--   create disagreement between import logic and grid display.
-- - Skip reasons are reported per source row, so the UI can explain every
--   missing copy.
--
-- Idempotent: re-running the function on the same target range short-circuits
-- because the freshly written drafts make the target non-empty.

CREATE OR REPLACE FUNCTION public.import_previous_schedule(
  p_org_id        UUID,
  p_source_start  DATE,
  p_source_end    DATE,
  p_target_start  DATE,
  p_target_end    DATE,
  p_dry_run       BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  emp_id      UUID,
  source_date DATE,
  target_date DATE,
  outcome     TEXT,
  reason      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id        UUID := auth.uid();
  v_source_span     INTEGER;
  v_target_span     INTEGER;
  r                 RECORD;
  v_disq            TEXT;
  v_segment_disq    TEXT;
  v_segment_count   INTEGER;
  v_existing_version BIGINT;
BEGIN
  -- Permission gates: same as every other draft-write path.
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_source_start IS NULL OR p_source_end IS NULL
     OR p_target_start IS NULL OR p_target_end IS NULL THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF p_source_end < p_source_start OR p_target_end < p_target_start THEN
    RAISE EXCEPTION 'Range end precedes range start';
  END IF;

  v_source_span := (p_source_end - p_source_start) + 1;
  v_target_span := (p_target_end - p_target_start) + 1;
  IF v_source_span <> v_target_span THEN
    RAISE EXCEPTION 'Source and target ranges must cover the same number of days';
  END IF;

  -- Serialize concurrent imports against the same target.
  PERFORM pg_advisory_xact_lock(
    hashtext('import_previous_' || p_org_id::TEXT || '_' || p_target_start::TEXT)
  );

  -- Iterate the effective source cells. The CTE picks the draft if present
  -- and not deleted, else the published snapshot — matching the client's
  -- display rule. Cells whose effective snapshot is empty are dropped.
  FOR r IN
    WITH effective AS (
      SELECT
        c.emp_id,
        c.date AS source_date,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.id
          ELSE published.id
        END AS snapshot_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.state_kind
          ELSE published.state_kind
        END AS state_kind,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_type_id
          ELSE published.absence_type_id
        END AS absence_type_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_start_time
          ELSE published.custom_start_time
        END AS custom_start_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_end_time
          ELSE published.custom_end_time
        END AS custom_end_time
      FROM public.schedule_cells c
      LEFT JOIN public.schedule_cell_snapshots draft
        ON draft.cell_id = c.id AND draft.snapshot_kind = 'draft'
      LEFT JOIN public.schedule_cell_snapshots published
        ON published.cell_id = c.id AND published.snapshot_kind = 'published'
      WHERE c.org_id = p_org_id
        AND c.date BETWEEN p_source_start AND p_source_end
        AND (
          (draft.id IS NOT NULL AND draft.state_kind <> 'deleted')
          OR (draft.id IS NULL AND published.id IS NOT NULL)
        )
    ),
    with_segments AS (
      SELECT
        eff.emp_id,
        eff.source_date,
        eff.state_kind,
        eff.absence_type_id,
        eff.custom_start_time,
        eff.custom_end_time,
        COALESCE(
          ARRAY(
            SELECT seg.shift_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS shift_ids,
        COALESCE(
          ARRAY(
            SELECT seg.job_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS job_ids,
        COALESCE(
          ARRAY(
            SELECT COALESCE(seg.is_mentored, FALSE)
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BOOLEAN[]
        ) AS is_mentored_flags
      FROM effective eff
    )
    SELECT
      ws.emp_id,
      ws.source_date,
      (p_target_start + (ws.source_date - p_source_start))::DATE AS target_date,
      ws.state_kind,
      ws.absence_type_id,
      ws.custom_start_time,
      ws.custom_end_time,
      ws.shift_ids,
      ws.job_ids,
      ws.is_mentored_flags
    FROM with_segments ws
    ORDER BY ws.source_date, ws.emp_id
  LOOP
    -- Initialize OUT row for this iteration.
    emp_id := r.emp_id;
    source_date := r.source_date;
    target_date := r.target_date;
    outcome := NULL;
    reason := NULL;

    -- Defensive: effective state must actually have content. The CTE filters
    -- empty effective snapshots, but worked-with-zero-segments could slip
    -- past the filter; reject explicitly so the UI surfaces it.
    IF r.state_kind = 'worked' AND COALESCE(array_length(r.job_ids, 1), 0) = 0 THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF r.state_kind = 'absence' AND r.absence_type_id IS NULL THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Employee active gate.
    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = r.emp_id
        AND e.org_id = p_org_id
        AND e.archived_at IS NULL
        AND e.status = 'active'
    ) THEN
      outcome := 'skipped';
      reason := 'employee_inactive';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Serialize check + write against any concurrent writer of this target
    -- cell using the same advisory key write_schedule_cell_snapshot_internal
    -- uses. Without this lock, a manual draft landing between the empty
    -- check and our write would be silently overwritten. Advisory locks are
    -- reentrant within one xact, so the inner write's lock acquisition is a
    -- no-op.
    PERFORM pg_advisory_xact_lock(
      hashtext('schedule_cell_' || r.emp_id::TEXT || '_' || r.target_date::TEXT)
    );

    -- Target already has effective content (any draft non-deleted, or any
    -- published). Uses the exact same rule grid display uses.
    IF public.schedule_cell_has_effective_content(p_org_id, r.emp_id, r.target_date) THEN
      outcome := 'skipped';
      reason := 'target_has_data';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Per-segment qualification gate (worked only). First failing segment
    -- names the reason.
    IF r.state_kind = 'worked' THEN
      v_segment_count := COALESCE(array_length(r.job_ids, 1), 0);
      v_disq := NULL;
      FOR i IN 1..v_segment_count LOOP
        v_segment_disq := public.is_employee_qualified_for_shift_job(
          r.emp_id, r.shift_ids[i], r.job_ids[i]
        );
        IF v_segment_disq IS NOT NULL THEN
          v_disq := v_segment_disq;
          EXIT;
        END IF;
      END LOOP;

      IF v_disq IS NOT NULL THEN
        outcome := 'skipped';
        reason := 'disqualified:' || v_disq;
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- All gates passed.
    IF p_dry_run THEN
      outcome := 'imported';
      reason := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT c.version INTO v_existing_version
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.emp_id = r.emp_id
      AND c.date = r.target_date;

    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.target_date,
      'draft',
      r.state_kind,
      CASE WHEN r.state_kind = 'worked' THEN r.shift_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind = 'worked' THEN r.job_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind = 'absence' THEN r.absence_type_id ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_start_time ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_end_time ELSE NULL END,
      NULL,
      FALSE,
      NULL,
      COALESCE(v_existing_version, 0),
      v_actor_id,
      CASE WHEN r.state_kind = 'worked' THEN r.is_mentored_flags ELSE '{}'::BOOLEAN[] END
    );

    outcome := 'imported';
    reason := NULL;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_previous_schedule(UUID, DATE, DATE, DATE, DATE, BOOLEAN) TO authenticated;


-- ── send_invitation ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email          TEXT,
  p_role           TEXT,
  p_org_id         UUID,
  p_employee_id    UUID DEFAULT NULL,
  p_first_name     TEXT DEFAULT NULL,
  p_last_name      TEXT DEFAULT NULL,
  p_phone          TEXT DEFAULT NULL,
  p_department_ids   BIGINT[] DEFAULT '{}',
  p_dept_admin_ids   BIGINT[] DEFAULT '{}'
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invite   public.invitations;
  v_caller_role TEXT;
BEGIN
  -- Trusted backend path: API routes authorize the caller via
  -- requireOrgPermissions / canManageEmployees and then invoke this RPC
  -- through the service-role client (where auth.uid() / JWT claims are
  -- absent). Direct authenticated callers still have to be a gridmaster
  -- or a super_admin of the target org.
  IF (auth.jwt() ->> 'role') <> 'service_role' AND NOT public.is_gridmaster() THEN
    v_caller_role := public.caller_org_role()::TEXT;
    IF public.caller_org_id() <> p_org_id OR v_caller_role <> 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: only super_admin can send invitations';
    END IF;
  END IF;

  IF p_role NOT IN ('admin', 'user', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: must be super_admin, admin, or user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found or archived';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_memberships cm
    JOIN auth.users u ON u.id = cm.user_id
    WHERE cm.org_id = p_org_id AND lower(u.email::TEXT) = lower(p_email)
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Validate employee if provided
  IF p_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = p_employee_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Employee not found in this organization';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = p_employee_id AND user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Employee already has a linked user account';
    END IF;
  END IF;

  DELETE FROM public.invitations
   WHERE org_id = p_org_id AND lower(email) = lower(p_email)
     AND (expires_at < NOW() OR revoked_at IS NOT NULL OR accepted_at IS NOT NULL);

  -- Block duplicate: an active (pending) invitation already exists for this email
  IF EXISTS (
    SELECT 1 FROM public.invitations
     WHERE org_id = p_org_id AND lower(email) = lower(p_email)
       AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at >= NOW()
  ) THEN
    RAISE EXCEPTION 'An active invitation already exists for this email';
  END IF;

  INSERT INTO public.invitations (org_id, invited_by, email, role_to_assign, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids)
    VALUES (p_org_id, auth.uid(), lower(p_email), p_role::public.org_role, p_employee_id, p_first_name, p_last_name, p_phone, p_department_ids, p_dept_admin_ids)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'invitation_id', v_invite.id,
    'token',         v_invite.token,
    'expires_at',    v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_invitation(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BIGINT[], BIGINT[]) TO authenticated;


-- ── accept_invitation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invite          public.invitations;
  v_uid             UUID;
  v_user_email      TEXT;
  v_emp_first_name  TEXT;
  v_emp_last_name   TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite
  FROM public.invitations WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_invite.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation has already been accepted'; END IF;
  IF v_invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation has been revoked'; END IF;
  IF v_invite.expires_at < NOW() THEN RAISE EXCEPTION 'Invitation has expired'; END IF;

  SELECT email::TEXT INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(v_user_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_invite.org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization no longer exists';
  END IF;

  UPDATE public.invitations SET accepted_at = NOW() WHERE id = v_invite.id;

  -- Link employee record to auth user and copy names if employee_id is present
  IF v_invite.employee_id IS NOT NULL THEN
    UPDATE public.employees
    SET user_id = v_uid, updated_at = NOW()
    WHERE id = v_invite.employee_id
      AND org_id = v_invite.org_id
      AND user_id IS NULL;

    -- Cross-org case: if the accepting user already has a profile name
    -- (they have an account from another org), overwrite the employees row's
    -- first/last name with the canonical profile name. The admin's typed
    -- "Margaret Sullivan" gets replaced by Alice's real "Alice Smith" so
    -- the roster doesn't lie about who's actually scheduled.
    UPDATE public.employees e
    SET first_name = COALESCE(p.first_name, e.first_name),
        last_name  = COALESCE(p.last_name,  e.last_name),
        updated_at = NOW()
    FROM public.profiles p
    WHERE e.id = v_invite.employee_id
      AND e.org_id = v_invite.org_id
      AND p.id = v_uid
      AND (p.first_name IS NOT NULL OR p.last_name IS NOT NULL);

    SELECT first_name, last_name INTO v_emp_first_name, v_emp_last_name
    FROM public.employees
    WHERE id = v_invite.employee_id AND org_id = v_invite.org_id;
  ELSE
    -- App-only invite: no employees row was pre-created. Create one now so the
    -- new member gets a per-org employee_number (every org member has a badge).
    -- Names are guaranteed populated on the invitation by the send_invitation
    -- path. Seniority lands at end-of-list; admin can drag to reorder later.
    -- The BEFORE INSERT trigger stamps employee_number from the org counter.
    v_emp_first_name := v_invite.first_name;
    v_emp_last_name := v_invite.last_name;

    INSERT INTO public.employees (
      org_id, user_id, first_name, last_name, phone,
      department_ids, dept_admin_ids,
      employment_type, status, seniority
    )
    VALUES (
      v_invite.org_id, v_uid, v_invite.first_name, v_invite.last_name, v_invite.phone,
      v_invite.department_ids, v_invite.dept_admin_ids,
      'full_time', 'active',
      COALESCE((SELECT MAX(seniority) FROM public.employees WHERE org_id = v_invite.org_id), 0) + 1
    );
  END IF;

  -- Existing user's profile name is canonical across orgs and must not be
  -- overwritten by an invite (admin-typed name in another org is just a
  -- convenient pre-fill). COALESCE order: keep existing profile fields when
  -- present; only fall through to the invite-supplied name on insert/null.
  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (v_uid, v_invite.org_id, 'none', v_emp_first_name, v_emp_last_name)
  ON CONFLICT (id) DO UPDATE
    SET org_id     = COALESCE(profiles.org_id, EXCLUDED.org_id),
        first_name = COALESCE(profiles.first_name, EXCLUDED.first_name),
        last_name  = COALESCE(profiles.last_name, EXCLUDED.last_name),
        updated_at = NOW();

  -- Bypass guard_org_role_change trigger — this is an authorised role path.
  PERFORM set_config('app.allow_role_change', 'true', true);

  INSERT INTO public.organization_memberships (user_id, org_id, org_role, department_ids, dept_admin_ids, phone)
  VALUES (v_uid, v_invite.org_id, v_invite.role_to_assign, v_invite.department_ids, v_invite.dept_admin_ids, v_invite.phone)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        department_ids = CASE WHEN EXCLUDED.department_ids != '{}' THEN EXCLUDED.department_ids ELSE organization_memberships.department_ids END,
        dept_admin_ids = CASE WHEN EXCLUDED.dept_admin_ids != '{}' THEN EXCLUDED.dept_admin_ids ELSE organization_memberships.dept_admin_ids END;

  UPDATE public.profiles
  SET org_id = v_invite.org_id, updated_at = NOW()
  WHERE id = v_uid AND org_id IS NULL;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (v_uid, NOW() + INTERVAL '2 seconds', 'invitation_accepted')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '2 seconds', reason = 'invitation_accepted';

  RETURN jsonb_build_object(
    'status', 'accepted',
    'org_id', v_invite.org_id,
    'role', v_invite.role_to_assign::TEXT,
    'org_slug', (SELECT slug FROM public.organizations WHERE id = v_invite.org_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;


-- ── revoke_invitation_on_email_change ────────────────────────────────────────
-- Auto-revoke pending invitations when an employee's email is changed.
-- Prevents stale invitations from blocking re-invites with the new email.

CREATE OR REPLACE FUNCTION public.revoke_invitation_on_email_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.invitations
    SET revoked_at = NOW()
    WHERE employee_id = OLD.id
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at >= NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_revoke_invitation_on_email_change
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_invitation_on_email_change();


-- Auto-revoke pending invitations when an employee is archived (soft-deleted).
CREATE OR REPLACE FUNCTION public.revoke_invitation_on_employee_archive()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    UPDATE public.invitations
    SET revoked_at = NOW()
    WHERE employee_id = OLD.id
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at >= NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_revoke_invitation_on_employee_archive
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_invitation_on_employee_archive();


-- Auto-expire pending shift requests when an employee is archived (soft-deleted).
-- Mirrors the invitation revocation trigger above.
CREATE OR REPLACE FUNCTION public.expire_shift_requests_on_employee_archive()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    UPDATE public.shift_requests
    SET status = 'expired', resolved_at = NOW(), updated_at = NOW()
    WHERE (requester_emp_id = OLD.id OR target_emp_id = OLD.id)
      AND status IN ('open', 'pending_approval');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_expire_shift_requests_on_employee_archive
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.expire_shift_requests_on_employee_archive();


-- ── employee_number: stamp + immutability ───────────────────────────────────
-- assign_employee_number: BEFORE INSERT trigger that atomically stamps
-- NEW.employee_number from organizations.next_employee_number and bumps the
-- counter. SECURITY DEFINER so it can read/write organizations regardless of
-- caller RLS. The SELECT … FOR UPDATE row-locks the org row, serialising
-- concurrent inserts within an org without blocking other orgs. Any value the
-- caller supplied for employee_number is overwritten (numbers are never chosen
-- by clients — the trigger is the sole source of truth).

CREATE OR REPLACE FUNCTION public.assign_employee_number()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT next_employee_number INTO v_next
  FROM public.organizations
  WHERE id = NEW.org_id
  FOR UPDATE;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Organization % not found', NEW.org_id;
  END IF;

  NEW.employee_number := v_next;

  UPDATE public.organizations
  SET next_employee_number = next_employee_number + 1
  WHERE id = NEW.org_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_employees_assign_number
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_employee_number();


-- prevent_employee_number_change: BEFORE UPDATE trigger that enforces
-- immutability of employee_number. Even super_admins can't change it — a
-- person's badge ID is a permanent record. Belt-and-suspenders alongside the
-- API not exposing a write path.

CREATE OR REPLACE FUNCTION public.prevent_employee_number_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'employee_number is immutable (was %, attempted %)',
      OLD.employee_number, NEW.employee_number;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_employees_immutable_number
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_number_change();


-- check_employee_email_belongs_to_user: BEFORE INSERT/UPDATE trigger that
-- enforces "if a linked employees row has an email AND that email exists in
-- auth.users, the email's owner must be the linked user." The existing
-- partial UNIQUE index (unique_active_employee_email_per_org) only catches
-- two employees rows with the same email; it doesn't catch the case where
-- a management member's row has email = '' but their auth account email
-- gets accidentally typed onto a different scheduled employee's row.
--
-- Pre-created rows (user_id IS NULL) are exempt so the cross-org invite
-- flow still works: admin pre-creates with alice@example.com, leaves user_id
-- NULL, sends invite. Once Alice accepts, accept_invitation sets user_id;
-- this trigger re-validates (BEFORE UPDATE OF user_id) and sees that the
-- email belongs to Alice — match — allow.

CREATE OR REPLACE FUNCTION public.check_employee_email_belongs_to_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_email_owner UUID;
  v_owner_has_employee_in_org BOOLEAN;
BEGIN
  IF btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  -- Look up the auth user (if any) that owns this email.
  SELECT id INTO v_email_owner
  FROM auth.users
  WHERE lower(email::text) = lower(btrim(NEW.email))
  LIMIT 1;

  -- Unregistered emails are fine (contact-only addresses).
  IF v_email_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- The canonical case: the row is linked to the email's owner.
  IF v_email_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Linked to a DIFFERENT user from the email's owner → always block.
  -- (E.g. admin types Nic's email onto Margaret's row where Margaret is
  -- linked to user X.)
  IF NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'employee_email_belongs_to_other_user: % belongs to a different account', NEW.email
      USING ERRCODE = '23505',
            CONSTRAINT = 'employee_email_belongs_to_user';
  END IF;

  -- Pre-created row (user_id IS NULL): allowed ONLY when the email's
  -- owner is NOT already a member of this org with their own employees
  -- row. Cross-org invites are fine — Alice (Org A only) can be
  -- pre-created in Org B. Same-org sloppy data entry — Margaret's row
  -- with Nic's email when Nic is already on the team — is blocked.
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE org_id = NEW.org_id
      AND user_id = v_email_owner
      AND archived_at IS NULL
      AND id <> NEW.id
  ) INTO v_owner_has_employee_in_org;

  IF v_owner_has_employee_in_org THEN
    RAISE EXCEPTION 'employee_email_belongs_to_other_user: % belongs to another active member of this organization', NEW.email
      USING ERRCODE = '23505',
            CONSTRAINT = 'employee_email_belongs_to_user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_employees_email_belongs_to_user
  BEFORE INSERT OR UPDATE OF email, user_id ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.check_employee_email_belongs_to_user();


-- ── start_impersonation ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id UUID,
  p_justification TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_session impersonation_sessions;
  v_target_org_id UUID;
  v_caller_id UUID;
  v_caller_email TEXT;
  v_active_count INTEGER;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  v_caller_id := auth.uid();
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Self-impersonation prevention (defense in depth with CHECK constraint)
  IF v_caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot impersonate yourself';
  END IF;

  -- Validate justification (10–500 characters for meaningful reason)
  IF p_justification IS NULL OR length(trim(p_justification)) < 10 OR length(p_justification) > 500 THEN
    RAISE EXCEPTION 'Justification must be between 10 and 500 characters';
  END IF;

  -- Multi-level impersonation prevention: block if caller already has an active session
  SELECT count(*) INTO v_active_count
  FROM impersonation_sessions
  WHERE gridmaster_id = v_caller_id
    AND ended_at IS NULL
    AND expires_at > now();

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Cannot start a new impersonation while another session is active. End the current session first.';
  END IF;

  -- Resolve target org: use explicit param if provided, else fall back to profile
  IF p_target_org_id IS NOT NULL THEN
    -- Validate that the target user has a membership in the specified org
    IF NOT EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE user_id = p_target_user_id AND org_id = p_target_org_id
    ) THEN
      RAISE EXCEPTION 'Target user does not belong to the specified organization';
    END IF;
    v_target_org_id := p_target_org_id;
  ELSE
    SELECT org_id INTO v_target_org_id
    FROM profiles WHERE id = p_target_user_id;
  END IF;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no organization';
  END IF;

  INSERT INTO impersonation_sessions (
    gridmaster_id, target_user_id, target_org_id,
    justification, ip_address, user_agent
  )
  VALUES (
    v_caller_id, p_target_user_id, v_target_org_id,
    trim(p_justification), p_ip_address, p_user_agent
  )
  RETURNING * INTO v_session;

  -- Notify the target user about the impersonation (scoped to target org).
  -- Explicit channel/category so the email-prefs lookup in sendNotification
  -- (keyed on category) resolves correctly if anyone wires impersonation to
  -- the email path later. Category 'security' is in the default-email-on set.
  INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
  VALUES (
    p_target_user_id,
    v_target_org_id,
    'impersonation_start',
    'in_app',
    'security',
    'Account access notice',
    'A platform administrator is currently reviewing your account for support purposes.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification),
      'gridmaster_id', v_caller_id,
      'gridmaster_email', v_caller_email
    )
  );

  -- Notify all org super_admins about the impersonation (security transparency).
  -- Excludes the target user (already notified above) to avoid duplicate notifications.
  INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
  SELECT
    cm.user_id,
    v_target_org_id,
    'impersonation_start',
    'in_app',
    'security',
    'Impersonation session started',
    'A platform administrator has started an impersonation session in your organization.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification),
      'target_user_id', p_target_user_id,
      'gridmaster_id', v_caller_id,
      'gridmaster_email', v_caller_email
    )
  FROM organization_memberships cm
  WHERE cm.org_id = v_target_org_id
    AND cm.org_role = 'super_admin'
    AND cm.archived_at IS NULL
    AND cm.user_id <> p_target_user_id;

  RETURN jsonb_build_object('session_id', v_session.session_id, 'expires_at', v_session.expires_at);
END;
$$;

COMMENT ON FUNCTION public.start_impersonation IS 'Creates an impersonation session for a Gridmaster. Requires mandatory justification (min 10 chars). Prevents self-impersonation and multi-level impersonation. Inserts a notification for the target user. Returns session_id and expires_at.';


-- ── end_impersonation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_impersonation(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'manual'
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_target_user_id UUID;
  v_target_org_id  UUID;
  v_caller_id      UUID;
  v_caller_email   TEXT;
BEGIN
  v_caller_id := auth.uid();
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Soft-delete: update instead of delete
  UPDATE impersonation_sessions
     SET ended_at = now(),
         end_reason = p_reason
   WHERE session_id = p_session_id
     AND gridmaster_id = v_caller_id
     AND ended_at IS NULL
  RETURNING target_user_id, target_org_id INTO v_target_user_id, v_target_org_id;

  -- Notify the target user that the impersonation ended (scoped to target org).
  -- Explicit channel/category (see start_impersonation for rationale).
  IF v_target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
    VALUES (
      v_target_user_id,
      v_target_org_id,
      'impersonation_end',
      'in_app',
      'security',
      'Account access ended',
      'A platform administrator has finished reviewing your account.',
      jsonb_build_object(
        'session_id', p_session_id,
        'end_reason', p_reason,
        'gridmaster_id', v_caller_id,
        'gridmaster_email', v_caller_email
      )
    );

    -- Parity with start_impersonation: notify org super_admins so they see
    -- both the start and end of any impersonation in their org.
    INSERT INTO notifications (user_id, org_id, type, channel, category, title, message, metadata)
    SELECT
      cm.user_id,
      v_target_org_id,
      'impersonation_end',
      'in_app',
      'security',
      'Impersonation session ended',
      'A platform administrator''s impersonation session in your organization ended.',
      jsonb_build_object(
        'session_id', p_session_id,
        'end_reason', p_reason,
        'target_user_id', v_target_user_id,
        'gridmaster_id', v_caller_id,
        'gridmaster_email', v_caller_email
      )
    FROM organization_memberships cm
    WHERE cm.org_id = v_target_org_id
      AND cm.org_role = 'super_admin'
      AND cm.archived_at IS NULL
      AND cm.user_id <> v_target_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.end_impersonation IS 'Soft-ends an impersonation session (sets ended_at + reason). Inserts a notification for the target user and for org super_admins (parity with start_impersonation).';


-- ── get_impersonation_history ─────────────────────────────────────────────────

-- Must DROP first because return type is changing (new columns added)
DROP FUNCTION IF EXISTS public.get_impersonation_history(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_impersonation_history(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  session_id       UUID,
  gridmaster_id    UUID,
  gridmaster_email TEXT,
  target_user_id   UUID,
  target_email     TEXT,
  target_org_id    UUID,
  target_org_name  TEXT,
  justification    TEXT,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  end_reason       TEXT,
  expires_at       TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lazy cleanup: mark expired-but-unclosed sessions
  UPDATE impersonation_sessions imp
     SET ended_at = imp.expires_at,
         end_reason = 'expired'
   WHERE imp.ended_at IS NULL
     AND imp.expires_at < now();

  RETURN QUERY
  SELECT s.session_id, s.gridmaster_id, gm.email::TEXT,
         s.target_user_id, tu.email::TEXT,
         s.target_org_id, o.name,
         s.justification, s.ip_address, s.user_agent,
         s.created_at, s.ended_at, s.end_reason, s.expires_at
  FROM impersonation_sessions s
  JOIN auth.users gm ON gm.id = s.gridmaster_id
  JOIN auth.users tu ON tu.id = s.target_user_id
  LEFT JOIN organizations o ON o.id = s.target_org_id
  ORDER BY s.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_impersonation_history(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_impersonation_history IS 'Returns paginated impersonation session history with justification and audit fields. Gridmaster only. Lazy-cleans expired sessions.';


-- ── Notification RPCs ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_notifications(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id          UUID,
  type        TEXT,
  channel     TEXT,
  category    TEXT,
  priority    TEXT,
  title       TEXT,
  message     TEXT,
  metadata    JSONB,
  read_at     TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.type, n.channel, n.category, n.priority, n.title, n.message, n.metadata, n.read_at, n.archived_at, n.created_at
  FROM notifications n
  WHERE n.user_id = auth.uid()
    AND n.archived_at IS NULL
    AND n.channel = 'in_app'
    AND (n.org_id = public.caller_org_id() OR n.org_id IS NULL)
  ORDER BY n.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notifications(INTEGER, INTEGER) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND (org_id = public.caller_org_id() OR org_id IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_notification_facets()
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT jsonb_build_object(
    'totalInbox', (
      SELECT COUNT(*)::INTEGER FROM notifications
      WHERE user_id = auth.uid() AND archived_at IS NULL
        AND channel = 'in_app'
        AND (org_id = public.caller_org_id() OR org_id IS NULL)
    ),
    'totalUnread', (
      SELECT COUNT(*)::INTEGER FROM notifications
      WHERE user_id = auth.uid() AND read_at IS NULL AND archived_at IS NULL
        AND channel = 'in_app'
        AND (org_id = public.caller_org_id() OR org_id IS NULL)
    ),
    'totalArchived', (
      SELECT COUNT(*)::INTEGER FROM notifications
      WHERE user_id = auth.uid() AND archived_at IS NOT NULL
        AND channel = 'in_app'
        AND (org_id = public.caller_org_id() OR org_id IS NULL)
    ),
    'byCategory', COALESCE((
      SELECT jsonb_object_agg(COALESCE(category, 'uncategorized'), c)
      FROM (
        SELECT category, COUNT(*)::INTEGER AS c
        FROM notifications
        WHERE user_id = auth.uid() AND archived_at IS NULL
          AND channel = 'in_app'
          AND (org_id = public.caller_org_id() OR org_id IS NULL)
        GROUP BY category
      ) t
    ), '{}'::jsonb),
    'byPriority', COALESCE((
      SELECT jsonb_object_agg(priority, c)
      FROM (
        SELECT priority, COUNT(*)::INTEGER AS c
        FROM notifications
        WHERE user_id = auth.uid() AND archived_at IS NULL
          AND channel = 'in_app'
          AND (org_id = public.caller_org_id() OR org_id IS NULL)
        GROUP BY priority
      ) t
    ), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_facets() TO authenticated;


-- ── force_logout_user ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.force_logout_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can force-logout users';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'force_logout')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'force_logout';

  INSERT INTO public.role_change_log (
    target_user_id, changed_by_id, from_role, to_role, change_type, idempotency_key
  ) VALUES (
    p_target_user_id, auth.uid(), 'n/a', 'n/a', 'role_change',
    'logout-' || p_target_user_id || '-' || extract(epoch from NOW())::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_logout_user(UUID) TO authenticated;


-- ── Gridmaster dashboard RPCs ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT jsonb_build_object(
    'organization_count', (SELECT count(*) FROM public.organizations),
    'user_count',         (SELECT count(*) FROM public.profiles),
    'shift_count',        (SELECT count(*) FROM public.schedule_cells),
    'active_sessions',    (SELECT count(*) FROM auth.sessions WHERE not_after > now())
  ) INTO result;

  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  platform_role   public.platform_role,
  org_role        public.org_role,
  org_id          UUID,
  org_name        TEXT,
  org_slug        TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT u.id, u.email::TEXT, p.platform_role,
    COALESCE(cm.org_role, 'user'::public.org_role), p.org_id,
    o.name, o.slug, p.created_at, u.last_sign_in_at, p.deactivated_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.organization_memberships cm ON cm.user_id = p.id AND cm.org_id = p.org_id
  LEFT JOIN public.organizations o ON p.org_id = o.id
  WHERE COALESCE(p.platform_role, 'none'::public.platform_role) <> 'gridmaster'::public.platform_role
  ORDER BY u.email ASC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_gridmaster_accounts()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  first_name      TEXT,
  last_name       TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID
)
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT u.id, u.email::TEXT, p.first_name, p.last_name,
    p.created_at, u.last_sign_in_at, p.deactivated_at, p.deactivated_by
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.platform_role = 'gridmaster'
  ORDER BY COALESCE(p.deactivated_at, 'infinity'::TIMESTAMPTZ) DESC, u.email ASC;
END;
$$;


CREATE OR REPLACE FUNCTION public.promote_gridmaster_by_email(p_email TEXT)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email::TEXT) = lower(p_email);

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  UPDATE public.organization_memberships
  SET archived_at = COALESCE(archived_at, NOW()),
      archived_by = auth.uid(),
      updated_at = NOW()
  WHERE user_id = target_user_id
    AND archived_at IS NULL;

  INSERT INTO public.profiles (id, org_id, platform_role, updated_at)
  VALUES (target_user_id, NULL, 'gridmaster', NOW())
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster',
        org_id = NULL,
        updated_at = NOW();

  DELETE FROM public.user_sessions WHERE user_id = target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_promotion')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_promotion';

  RETURN jsonb_build_object('user_id', target_user_id, 'email', p_email);
END;
$$;


CREATE OR REPLACE FUNCTION public.demote_gridmaster_account(
  p_target_user_id UUID,
  p_org_id UUID,
  p_org_role public.org_role
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_email TEXT;
  target_was_active BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot demote your own gridmaster account'; END IF;

  SELECT u.email::TEXT, p.deactivated_at IS NULL
  INTO target_email, target_was_active
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id
    AND p.platform_role = 'gridmaster';

  IF target_email IS NULL THEN RAISE EXCEPTION 'Gridmaster account not found'; END IF;

  IF target_was_active AND (
    SELECT count(*)
    FROM public.profiles
    WHERE platform_role = 'gridmaster'
      AND deactivated_at IS NULL
      AND id <> p_target_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'Cannot remove the last active gridmaster account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  UPDATE public.profiles
  SET platform_role = 'none',
      org_id = p_org_id,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  INSERT INTO public.organization_memberships (user_id, org_id, org_role, archived_at, archived_by, updated_at)
  VALUES (p_target_user_id, p_org_id, p_org_role, NULL, NULL, NOW())
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW();

  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_demotion')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_demotion';

  RETURN jsonb_build_object('user_id', p_target_user_id, 'email', target_email, 'org_id', p_org_id, 'org_role', p_org_role);
END;
$$;


CREATE OR REPLACE FUNCTION public.set_gridmaster_account_deactivated(
  p_target_user_id UUID,
  p_deactivate BOOLEAN
)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_email TEXT;
  target_was_active BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot change activation for your own gridmaster account'; END IF;

  SELECT u.email::TEXT, p.deactivated_at IS NULL
  INTO target_email, target_was_active
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_target_user_id
    AND p.platform_role = 'gridmaster';

  IF target_email IS NULL THEN RAISE EXCEPTION 'Gridmaster account not found'; END IF;

  IF p_deactivate AND target_was_active AND (
    SELECT count(*)
    FROM public.profiles
    WHERE platform_role = 'gridmaster'
      AND deactivated_at IS NULL
      AND id <> p_target_user_id
  ) = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate the last active gridmaster account';
  END IF;

  UPDATE public.profiles
  SET deactivated_at = CASE WHEN p_deactivate THEN NOW() ELSE NULL END,
      deactivated_by = CASE WHEN p_deactivate THEN auth.uid() ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  IF p_deactivate THEN
    DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;
  END IF;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 minutes', 'gridmaster_activation_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 minutes', reason = 'gridmaster_activation_change';

  RETURN jsonb_build_object('user_id', p_target_user_id, 'email', target_email, 'deactivated', p_deactivate);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_org_users(p_org_id UUID)
RETURNS TABLE (
  id                UUID,
  email             TEXT,
  first_name        TEXT,
  last_name         TEXT,
  platform_role     public.platform_role,
  org_role          public.org_role,
  admin_permissions JSONB,
  created_at        TIMESTAMPTZ,
  last_sign_in_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ,
  department_ids    BIGINT[],
  dept_admin_ids    BIGINT[]
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT p.id, u.email::TEXT, p.first_name, p.last_name, p.platform_role,
    cm.org_role, cm.admin_permissions, p.created_at,
    u.last_sign_in_at, cm.updated_at, cm.department_ids, cm.dept_admin_ids
  FROM public.organization_memberships cm
  JOIN public.profiles p ON p.id = cm.user_id
  JOIN auth.users u ON u.id = cm.user_id
  WHERE cm.org_id = p_org_id
    AND cm.archived_at IS NULL
    AND p.platform_role <> 'gridmaster'
  ORDER BY u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_users(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_org_id           UUID DEFAULT NULL,
  p_limit            INTEGER DEFAULT 50,
  p_offset           INTEGER DEFAULT 0,
  p_target_user_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  id               UUID,
  target_user_id   UUID,
  target_email     TEXT,
  changed_by_id    UUID,
  changed_by_email TEXT,
  from_role        TEXT,
  to_role          TEXT,
  created_at       TIMESTAMPTZ,
  org_id           UUID,
  org_name         TEXT
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT rcl.id, rcl.target_user_id, tu.email::TEXT, rcl.changed_by_id,
    cu.email::TEXT, rcl.from_role, rcl.to_role, rcl.created_at,
    rcl.org_id, o.name
  FROM public.role_change_log rcl
  LEFT JOIN auth.users tu ON tu.id = rcl.target_user_id
  LEFT JOIN auth.users cu ON cu.id = rcl.changed_by_id
  LEFT JOIN public.organizations o ON o.id = rcl.org_id
  WHERE (p_org_id IS NULL OR rcl.org_id = p_org_id)
    AND (p_target_user_id IS NULL OR rcl.target_user_id = p_target_user_id)
  ORDER BY rcl.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log(UUID, INTEGER, INTEGER, UUID) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SHIFT REQUESTS: Pickup & Swap Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- ── resolve_work_assignment_time_ranges ─────────────────────────────────────
-- Resolves effective time ranges for ordered worked segments using the
-- canonical shift/job pair metadata cascade:
-- 1. Instance custom times (pipe-delimited TEXT params)
-- 2. Job shift override for the segment's shift
-- 3. Job default times for shiftless segments or shiftless jobs
-- 4. Shift category start/end times
-- 5. No row returned = duration-based (no conflict possible)

CREATE OR REPLACE FUNCTION public.resolve_work_assignment_time_ranges(
  p_shift_ids      BIGINT[],
  p_job_ids        BIGINT[],
  p_custom_start   TEXT DEFAULT NULL,
  p_custom_end     TEXT DEFAULT NULL
) RETURNS TABLE(segment_position INTEGER, start_time TIME, end_time TIME)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_starts TEXT[];
  v_ends TEXT[];
  v_idx INT;
  v_shift_id BIGINT;
  v_job_id BIGINT;
  v_start TEXT;
  v_end TEXT;
  v_assignment_mode TEXT;
  v_default_start TIME;
  v_default_end TIME;
  v_override_start TIME;
  v_override_end TIME;
  v_shift_start TIME;
  v_shift_end TIME;
BEGIN
  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  v_starts := string_to_array(COALESCE(p_custom_start, ''), '|');
  v_ends := string_to_array(COALESCE(p_custom_end, ''), '|');

  FOR v_idx IN 1..COALESCE(array_length(p_job_ids, 1), 0) LOOP
    v_shift_id := p_shift_ids[v_idx];
    v_job_id := p_job_ids[v_idx];
    v_start := NULLIF(TRIM(v_starts[v_idx]), '');
    v_end := NULLIF(TRIM(v_ends[v_idx]), '');

    IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
      segment_position := v_idx;
      start_time := v_start::TIME;
      end_time := v_end::TIME;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT
      j.assignment_mode,
      j.default_start_time,
      j.default_end_time,
      jso.start_time,
      jso.end_time,
      sc.start_time,
      sc.end_time
    INTO
      v_assignment_mode,
      v_default_start,
      v_default_end,
      v_override_start,
      v_override_end,
      v_shift_start,
      v_shift_end
    FROM public.jobs j
    LEFT JOIN public.shift_categories sc ON sc.id = v_shift_id
    LEFT JOIN public.job_shift_overrides jso ON jso.job_id = v_job_id AND jso.shift_id = v_shift_id
    WHERE j.id = v_job_id
      AND j.archived_at IS NULL;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    segment_position := v_idx;
    start_time := COALESCE(
      v_override_start,
      CASE
        WHEN v_shift_id IS NULL OR v_assignment_mode = 'shiftless' THEN v_default_start
        ELSE NULL
      END,
      v_shift_start
    );
    end_time := COALESCE(
      v_override_end,
      CASE
        WHEN v_shift_id IS NULL OR v_assignment_mode = 'shiftless' THEN v_default_end
        ELSE NULL
      END,
      v_shift_end
    );

    IF start_time IS NOT NULL AND end_time IS NOT NULL THEN
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_work_assignment_time_ranges(BIGINT[], BIGINT[], TEXT, TEXT) TO authenticated;


-- ── work_assignment_times_overlap ───────────────────────────────────────────
-- Canonical overlap check for worked segments based on ordered shift/job pairs.

CREATE OR REPLACE FUNCTION public.work_assignment_times_overlap(
  p_shift_ids_a      BIGINT[],
  p_job_ids_a        BIGINT[],
  p_custom_start_a   TEXT,
  p_custom_end_a     TEXT,
  p_shift_ids_b      BIGINT[],
  p_job_ids_b        BIGINT[],
  p_custom_start_b   TEXT,
  p_custom_end_b     TEXT
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_work_assignment_time_ranges(
      p_shift_ids_a,
      p_job_ids_a,
      p_custom_start_a,
      p_custom_end_a
    ) a
    CROSS JOIN public.resolve_work_assignment_time_ranges(
      p_shift_ids_b,
      p_job_ids_b,
      p_custom_start_b,
      p_custom_end_b
    ) b
    WHERE (
      CASE
        WHEN a.start_time < a.end_time AND b.start_time < b.end_time THEN
          a.start_time < b.end_time AND b.start_time < a.end_time
        WHEN a.start_time >= a.end_time AND b.start_time < b.end_time THEN
          (b.end_time > a.start_time) OR (b.start_time < a.end_time)
        WHEN a.start_time < a.end_time AND b.start_time >= b.end_time THEN
          (a.end_time > b.start_time) OR (a.start_time < b.end_time)
        ELSE TRUE
      END
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.work_assignment_times_overlap(BIGINT[], BIGINT[], TEXT, TEXT, BIGINT[], BIGINT[], TEXT, TEXT) TO authenticated;


-- ── has_work_assignment_started ─────────────────────────────────────────────
-- Conservative started-shift gate using org-local time and the earliest
-- resolved segment start. If no usable start time exists, treat as started.

CREATE OR REPLACE FUNCTION public.has_work_assignment_started(
  p_org_id         UUID,
  p_shift_date     DATE,
  p_shift_ids      BIGINT[],
  p_job_ids        BIGINT[],
  p_custom_start   TEXT,
  p_custom_end     TEXT
)
RETURNS BOOLEAN
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_timezone TEXT := 'UTC';
  v_local_now TIMESTAMP;
  v_local_date DATE;
  v_earliest_start TIME;
BEGIN
  SELECT COALESCE(timezone, 'UTC')
  INTO v_org_timezone
  FROM public.organizations
  WHERE id = p_org_id;

  v_local_now := now() AT TIME ZONE v_org_timezone;
  v_local_date := v_local_now::DATE;

  IF p_shift_date < v_local_date THEN
    RETURN TRUE;
  END IF;

  IF p_shift_date > v_local_date THEN
    RETURN FALSE;
  END IF;

  SELECT MIN(r.start_time)
  INTO v_earliest_start
  FROM public.resolve_work_assignment_time_ranges(
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start,
    p_custom_end
  ) r;

  IF v_earliest_start IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_local_now::TIME >= v_earliest_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_work_assignment_started(UUID, DATE, BIGINT[], BIGINT[], TEXT, TEXT) TO authenticated;


-- ── segment-scoped request helpers ─────────────────────────────────────────
-- Request actions identify split-shift segments by chronological index so the
-- user-facing "Shift 1" is always the earliest resolved shift.

CREATE OR REPLACE FUNCTION public.schedule_custom_time_at(
  p_custom_time TEXT,
  p_segment_ordinal INTEGER
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT NULLIF(split_part(COALESCE(p_custom_time, ''), '|', p_segment_ordinal), '');
$$;

CREATE OR REPLACE FUNCTION public.schedule_custom_times_except_ordinal(
  p_custom_time TEXT,
  p_excluded_ordinal INTEGER,
  p_segment_count INTEGER
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE
SET search_path = 'public'
AS $$
  WITH parts AS (
    SELECT
      idx,
      COALESCE(NULLIF(split_part(COALESCE(p_custom_time, ''), '|', idx), ''), '') AS value
    FROM generate_series(1, GREATEST(COALESCE(p_segment_count, 0), 0)) AS idx
    WHERE idx <> p_excluded_ordinal
  )
  SELECT CASE
    WHEN BOOL_OR(value <> '') THEN string_agg(value, '|' ORDER BY idx)
    ELSE NULL
  END
  FROM parts;
$$;

CREATE OR REPLACE FUNCTION public.resolve_schedule_segment_ordinal(
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT,
  p_custom_end TEXT,
  p_segment_index INTEGER DEFAULT NULL
) RETURNS INTEGER
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_segment_count INTEGER := COALESCE(array_length(p_job_ids, 1), 0);
  v_index INTEGER := COALESCE(p_segment_index, 0);
  v_ordinal INTEGER;
BEGIN
  IF v_segment_count = 0 THEN
    RAISE EXCEPTION 'No worked shift segment found';
  END IF;

  IF p_segment_index IS NULL AND v_segment_count > 1 THEN
    RAISE EXCEPTION 'Multiple shifts exist on this date. Select the shift to request.';
  END IF;

  IF v_index < 0 OR v_index >= v_segment_count THEN
    RAISE EXCEPTION 'Selected shift segment is out of range';
  END IF;

  SELECT ordered_segments.ordinality
  INTO v_ordinal
  FROM (
    SELECT
      segment.ordinality,
      time_ranges.start_time,
      time_ranges.end_time
    FROM generate_subscripts(p_job_ids, 1) AS segment(ordinality)
    LEFT JOIN public.resolve_work_assignment_time_ranges(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start,
      p_custom_end
    ) time_ranges
      ON time_ranges.segment_position = segment.ordinality
    ORDER BY
      time_ranges.start_time IS NULL,
      time_ranges.start_time,
      time_ranges.end_time,
      segment.ordinality
    OFFSET v_index
    LIMIT 1
  ) ordered_segments;

  IF v_ordinal IS NULL THEN
    RAISE EXCEPTION 'Selected shift segment could not be resolved';
  END IF;

  RETURN v_ordinal;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_matching_schedule_segment_ordinal(
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_is_mentored_flags BOOLEAN[],
  p_custom_start TEXT,
  p_custom_end TEXT,
  p_match_shift_id BIGINT,
  p_match_job_id BIGINT,
  p_match_is_mentored BOOLEAN,
  p_match_custom_start TEXT,
  p_match_custom_end TEXT
) RETURNS INTEGER
LANGUAGE SQL STABLE
SET search_path = 'public'
AS $$
  SELECT segment.ordinality
  FROM generate_subscripts(p_job_ids, 1) AS segment(ordinality)
  WHERE p_job_ids[segment.ordinality] = p_match_job_id
    AND p_shift_ids[segment.ordinality] IS NOT DISTINCT FROM p_match_shift_id
    AND COALESCE(p_is_mentored_flags[segment.ordinality], FALSE) IS NOT DISTINCT FROM COALESCE(p_match_is_mentored, FALSE)
    AND public.schedule_custom_time_at(p_custom_start, segment.ordinality) IS NOT DISTINCT FROM p_match_custom_start
    AND public.schedule_custom_time_at(p_custom_end, segment.ordinality) IS NOT DISTINCT FROM p_match_custom_end
  ORDER BY segment.ordinality
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_custom_time_at(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_custom_times_except_ordinal(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_schedule_segment_ordinal(BIGINT[], BIGINT[], TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_matching_schedule_segment_ordinal(BIGINT[], BIGINT[], BOOLEAN[], TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, TEXT, TEXT) TO authenticated;


-- ── assert_non_overlapping_work_assignment_times ────────────────────────────
-- Prevents saving a worked cell whose ordered segments have overlapping
-- effective time windows after resolving custom/job/shift timing. Only enforced
-- for orgs with `enforce_conflict_prevention` on ("When enabled, overlapping
-- shifts cannot be saved") — otherwise overlaps are a warning, not a block.

DROP FUNCTION IF EXISTS public.assert_non_overlapping_work_assignment_times(BIGINT[], BIGINT[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.assert_non_overlapping_work_assignment_times(
  p_org_id UUID,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT DEFAULT NULL,
  p_custom_end TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_overlap RECORD;
BEGIN
  IF array_length(p_job_ids, 1) IS NULL OR array_length(p_job_ids, 1) < 2 THEN
    RETURN;
  END IF;

  -- Overlaps are only a hard error for orgs that opted into conflict
  -- prevention; everyone else gets the schedule editor's soft warning and is
  -- free to save the cell anyway.
  IF NOT COALESCE(
    (SELECT o.enforce_conflict_prevention FROM public.organizations o WHERE o.id = p_org_id),
    FALSE
  ) THEN
    RETURN;
  END IF;

  SELECT a.segment_position AS position_a, b.segment_position AS position_b
  INTO v_overlap
  FROM public.resolve_work_assignment_time_ranges(
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start,
    p_custom_end
  ) a
  CROSS JOIN public.resolve_work_assignment_time_ranges(
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start,
    p_custom_end
  ) b
  WHERE a.segment_position < b.segment_position
    AND (
      CASE
        WHEN a.start_time < a.end_time AND b.start_time < b.end_time THEN
          a.start_time < b.end_time AND b.start_time < a.end_time
        WHEN a.start_time >= a.end_time AND b.start_time < b.end_time THEN
          (b.end_time > a.start_time) OR (b.start_time < a.end_time)
        WHEN a.start_time < a.end_time AND b.start_time >= b.end_time THEN
          (a.end_time > b.start_time) OR (a.start_time < b.end_time)
        ELSE TRUE
      END
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Worked segments % and % have overlapping time ranges',
      v_overlap.position_a, v_overlap.position_b
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_non_overlapping_work_assignment_times(UUID, BIGINT[], BIGINT[], TEXT, TEXT) TO authenticated;


-- ── create_shift_request ────────────────────────────────────────────────────
-- Creates a pickup, swap, or calloff request. Validates shift ownership and snapshots data.

-- Drop old overloads so the segment-aware version is the only one
DROP FUNCTION IF EXISTS public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID);
DROP FUNCTION IF EXISTS public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT);

CREATE OR REPLACE FUNCTION public.create_shift_request(
  p_org_id              UUID,
  p_type                public.shift_request_type,
  p_requester_emp_id    UUID,
  p_requester_shift_date DATE,
  p_target_emp_id       UUID DEFAULT NULL,
  p_target_shift_date   DATE DEFAULT NULL,
  p_idempotency_key     UUID DEFAULT gen_random_uuid(),
  p_absence_type_id     BIGINT DEFAULT NULL,
  p_requester_segment_index INTEGER DEFAULT NULL,
  p_target_segment_index INTEGER DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request_id UUID;
  v_requester_shift RECORD;
  v_target_shift RECORD;
  v_requester_employee RECORD;
  v_target_employee RECORD;
  v_requester_shift_focus_area_id BIGINT;
  v_initial_status public.shift_request_status;
  v_requester_state JSONB;
  v_target_state JSONB;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_requester_segment_ordinal INTEGER;
  v_target_segment_ordinal INTEGER;
  v_requester_selected_shift_ids BIGINT[];
  v_requester_selected_job_ids BIGINT[];
  v_requester_selected_is_mentored_flags BOOLEAN[];
  v_target_selected_shift_ids BIGINT[];
  v_target_selected_job_ids BIGINT[];
  v_target_selected_is_mentored_flags BOOLEAN[];
  v_requester_selected_custom_start TEXT;
  v_requester_selected_custom_end TEXT;
  v_target_selected_custom_start TEXT;
  v_target_selected_custom_end TEXT;
BEGIN
  -- Idempotency: return existing if already created
  SELECT id INTO v_request_id FROM public.shift_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_request_id; END IF;

  IF p_requester_shift_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create a request for a past shift';
  END IF;

  -- Validate calloff and targeted-pickup absence constraints
  IF p_type = 'calloff' THEN
    IF p_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Calloff requests require an absence type';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.absence_types
      WHERE id = p_absence_type_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found or archived';
    END IF;
  ELSIF p_type = 'pickup' AND (
    p_target_emp_id IS NOT NULL
    OR p_target_shift_date IS NOT NULL
    OR p_absence_type_id IS NOT NULL
  ) THEN
    IF p_target_emp_id IS NULL OR p_target_shift_date IS NULL OR p_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Targeted pickup requests require a target employee, target shift date, and absence type';
    END IF;

    IF p_target_shift_date IS DISTINCT FROM p_requester_shift_date THEN
      RAISE EXCEPTION 'Targeted pickup requests must target the requester shift date';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.absence_types
      WHERE id = p_absence_type_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found or archived';
    END IF;
  ELSIF p_absence_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only calloff and targeted pickup requests can have an absence type';
  END IF;

  -- Validate requester is an active employee in this org
  SELECT id, user_id, status, focus_area_ids INTO v_requester_employee
  FROM public.employees
  WHERE id = p_requester_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  -- Validate caller is the requester (employee's linked user) or admin+ IN
  -- THIS org (or their own sandbox). caller_org_role() alone reflects the
  -- caller's role in their *current session* org, which can differ from
  -- p_org_id — checking it without an org match let an admin of one org
  -- act on another org's shift requests.
  IF v_requester_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only create requests for your own shifts';
  END IF;

  -- Validate requester owns a published shift on this date
  SELECT *
  INTO v_requester_shift
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id,
    p_requester_emp_id,
    p_requester_shift_date,
    'published'
  );

  IF NOT FOUND
     OR v_requester_shift.state_kind IS DISTINCT FROM 'worked'
     OR array_length(v_requester_shift.job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No published shift found for this employee on this date';
  END IF;

  v_requester_segment_ordinal := public.resolve_schedule_segment_ordinal(
    COALESCE(v_requester_shift.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_requester_shift.job_ids, '{}'::BIGINT[]),
    v_requester_shift.custom_start_time,
    v_requester_shift.custom_end_time,
    p_requester_segment_index
  );
  v_requester_selected_shift_ids := ARRAY[v_requester_shift.shift_ids[v_requester_segment_ordinal]];
  v_requester_selected_job_ids := ARRAY[v_requester_shift.job_ids[v_requester_segment_ordinal]];
  v_requester_selected_is_mentored_flags := ARRAY[
    COALESCE(v_requester_shift.is_mentored_flags[v_requester_segment_ordinal], FALSE)
  ];
  v_requester_selected_custom_start := public.schedule_custom_time_at(
    v_requester_shift.custom_start_time,
    v_requester_segment_ordinal
  );
  v_requester_selected_custom_end := public.schedule_custom_time_at(
    v_requester_shift.custom_end_time,
    v_requester_segment_ordinal
  );

  IF public.has_work_assignment_started(
    p_org_id,
    p_requester_shift_date,
    COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[]),
    COALESCE(v_requester_selected_job_ids, '{}'::BIGINT[]),
    v_requester_selected_custom_start,
    v_requester_selected_custom_end
  ) THEN
    RAISE EXCEPTION 'Cannot create a request for a shift that has already started';
  END IF;

  v_requester_shift_focus_area_id := v_requester_shift.focus_area_id;

  -- Fall back to employee's primary focus area when shift has no focus_area_id
  IF v_requester_shift.focus_area_id IS NULL THEN
    v_requester_shift.focus_area_id := v_requester_employee.focus_area_ids[1];
  END IF;

  -- Check not an absence (can't avail an off day)
  IF v_requester_shift.absence_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create a request for an off-day shift';
  END IF;

  IF (p_type = 'swap' OR (p_type = 'pickup' AND p_target_emp_id IS NOT NULL))
     AND (
       array_length(v_requester_selected_shift_ids, 1) IS NULL
       OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[])) AS requester_segments(shift_id)
         WHERE requester_segments.shift_id IS NULL
       )
     ) THEN
    RAISE EXCEPTION 'This request requires a scheduled shift';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
  INTO v_requester_required_focus_area_ids
  FROM (
    SELECT v_requester_shift_focus_area_id AS focus_area_id
    WHERE v_requester_shift_focus_area_id IS NOT NULL
    UNION
    SELECT sc.focus_area_id
    FROM unnest(COALESCE(v_requester_selected_shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
    JOIN public.shift_categories sc
      ON sc.id = shift_ids.shift_id
     AND sc.org_id = p_org_id
    WHERE sc.focus_area_id IS NOT NULL
  ) required;

  v_requester_state := public.build_schedule_cell_state_json(
    'worked',
    v_requester_selected_shift_ids,
    v_requester_selected_job_ids,
    NULL,
    v_requester_selected_custom_start,
    v_requester_selected_custom_end,
    v_requester_shift.series_id,
    v_requester_shift.from_recurring,
    COALESCE(v_requester_selected_is_mentored_flags, '{}'::BOOLEAN[])
  );

  -- Check no active request already exists for this shift (as requester or target)
  IF EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE requester_emp_id = p_requester_emp_id
      AND requester_shift_date = p_requester_shift_date
      AND org_id = p_org_id
      AND status IN ('open', 'pending_approval')
  ) THEN
    RAISE EXCEPTION 'An active request already exists for this shift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE target_emp_id = p_requester_emp_id
      AND target_shift_date = p_requester_shift_date
      AND org_id = p_org_id
      AND status IN ('open', 'pending_approval')
  ) THEN
    RAISE EXCEPTION 'This shift is already involved in another active request';
  END IF;

  -- Calloffs go straight to pending_approval; pickups/swaps start as open
  IF p_type = 'calloff' THEN
    v_initial_status := 'pending_approval';
  ELSE
    v_initial_status := 'open';
  END IF;

  -- For targeted pickups: validate the requested teammate has an absence on the same date
  IF p_type = 'pickup' AND p_target_emp_id IS NOT NULL THEN
    IF p_requester_emp_id = p_target_emp_id THEN
      RAISE EXCEPTION 'Cannot request yourself for pickup';
    END IF;

    -- Validate target employee exists and is active
    SELECT id, focus_area_ids
    INTO v_target_employee
    FROM public.employees
    WHERE id = p_target_emp_id AND org_id = p_org_id AND archived_at IS NULL AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee not found, archived, or inactive';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Target employee is not eligible for the requester shift focus area';
    END IF;

    SELECT *
    INTO v_target_shift
    FROM public.get_schedule_cell_snapshot_payload(
      p_org_id,
      p_target_emp_id,
      p_target_shift_date,
      'published'
    );

    IF NOT FOUND OR v_target_shift.state_kind IS DISTINCT FROM 'absence' THEN
      RAISE EXCEPTION 'Target employee has no published absence on the specified date';
    END IF;

    v_target_state := public.build_schedule_cell_state_json(
      'absence',
      '{}'::BIGINT[],
      '{}'::BIGINT[],
      v_target_shift.absence_type_id,
      NULL,
      NULL,
      v_target_shift.series_id,
      v_target_shift.from_recurring,
      '{}'::BOOLEAN[]
    );

    IF EXISTS (
      SELECT 1 FROM public.shift_requests
      WHERE (
        (requester_emp_id = p_target_emp_id AND requester_shift_date = p_target_shift_date)
        OR (target_emp_id = p_target_emp_id AND target_shift_date = p_target_shift_date)
      )
        AND org_id = p_org_id
        AND status IN ('open', 'pending_approval')
    ) THEN
      RAISE EXCEPTION 'The target employee is already involved in another active request on this date';
    END IF;
  END IF;

  -- For swaps: validate target
  IF p_type = 'swap' THEN
    IF p_target_emp_id IS NULL OR p_target_shift_date IS NULL THEN
      RAISE EXCEPTION 'Swap requests require a target employee and shift date';
    END IF;

    IF p_requester_emp_id = p_target_emp_id THEN
      RAISE EXCEPTION 'Cannot swap with yourself';
    END IF;

    IF p_target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot create a swap request for a past target shift';
    END IF;

    -- Validate target employee exists and is active
    SELECT id, focus_area_ids
    INTO v_target_employee
    FROM public.employees
      WHERE id = p_target_emp_id AND org_id = p_org_id AND archived_at IS NULL AND status = 'active'
    ;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee not found, archived, or inactive';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Target employee is not eligible for the requester shift focus area';
    END IF;

    -- Validate target owns a published shift on the target date
    SELECT *
    INTO v_target_shift
    FROM public.get_schedule_cell_snapshot_payload(
      p_org_id,
      p_target_emp_id,
      p_target_shift_date,
      'published'
    );

    IF NOT FOUND
       OR v_target_shift.state_kind IS DISTINCT FROM 'worked'
       OR array_length(v_target_shift.job_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Target employee has no published shift on the specified date';
    END IF;

    v_target_segment_ordinal := public.resolve_schedule_segment_ordinal(
      COALESCE(v_target_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_shift.job_ids, '{}'::BIGINT[]),
      v_target_shift.custom_start_time,
      v_target_shift.custom_end_time,
      p_target_segment_index
    );
    v_target_selected_shift_ids := ARRAY[v_target_shift.shift_ids[v_target_segment_ordinal]];
    v_target_selected_job_ids := ARRAY[v_target_shift.job_ids[v_target_segment_ordinal]];
    v_target_selected_is_mentored_flags := ARRAY[
      COALESCE(v_target_shift.is_mentored_flags[v_target_segment_ordinal], FALSE)
    ];
    v_target_selected_custom_start := public.schedule_custom_time_at(
      v_target_shift.custom_start_time,
      v_target_segment_ordinal
    );
    v_target_selected_custom_end := public.schedule_custom_time_at(
      v_target_shift.custom_end_time,
      v_target_segment_ordinal
    );

    IF public.has_work_assignment_started(
      p_org_id,
      p_target_shift_date,
      COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_selected_job_ids, '{}'::BIGINT[]),
      v_target_selected_custom_start,
      v_target_selected_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot create a swap request for a target shift that has already started';
    END IF;

    -- Check target shift is not an absence
    IF v_target_shift.absence_type_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot swap with an off-day shift';
    END IF;

    IF array_length(v_target_selected_shift_ids, 1) IS NULL
       OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[])) AS target_segments(shift_id)
         WHERE target_segments.shift_id IS NULL
       ) THEN
      RAISE EXCEPTION 'Cannot swap with a general job';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_target_required_focus_area_ids
    FROM (
      SELECT v_target_shift.focus_area_id AS focus_area_id
      WHERE v_target_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_target_selected_shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = p_org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Requester is not eligible for the target shift focus area';
    END IF;

    v_target_state := public.build_schedule_cell_state_json(
      'worked',
      v_target_selected_shift_ids,
      v_target_selected_job_ids,
      NULL,
      v_target_selected_custom_start,
      v_target_selected_custom_end,
      v_target_shift.series_id,
      v_target_shift.from_recurring,
      COALESCE(v_target_selected_is_mentored_flags, '{}'::BOOLEAN[])
    );

    -- Block if target's shift is already involved in any active request
    IF EXISTS (
      SELECT 1 FROM public.shift_requests
      WHERE (
        (requester_emp_id = p_target_emp_id AND requester_shift_date = p_target_shift_date)
        OR (target_emp_id = p_target_emp_id AND target_shift_date = p_target_shift_date)
      )
        AND org_id = p_org_id
        AND status IN ('open', 'pending_approval')
    ) THEN
      RAISE EXCEPTION 'The target''s shift is already involved in another active request';
    END IF;
  END IF;

  -- Create the request
  IF p_type = 'swap' THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date, target_state,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date,
      v_requester_state,
      p_target_emp_id, p_target_shift_date, v_target_state,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSIF p_type = 'calloff' THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      absence_type_id, idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      p_absence_type_id, p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSIF p_type = 'pickup' AND p_target_emp_id IS NOT NULL THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date, target_state,
      absence_type_id, idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      p_target_emp_id, p_target_shift_date, v_target_state,
      p_absence_type_id, p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      target_emp_id, target_shift_date,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_state,
      NULL, NULL,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT, INTEGER, INTEGER) TO authenticated;


-- ── claim_shift_request ─────────────────────────────────────────────────────
-- An employee claims an open pickup request. Time-based conflict check.

CREATE OR REPLACE FUNCTION public.claim_shift_request(
  p_request_id   UUID,
  p_claimer_emp_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_claimer RECORD;
  v_existing_shift RECORD;
  v_request_state RECORD;
  v_request_custom_start TEXT;
  v_request_custom_end TEXT;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.type != 'pickup' THEN
    RAISE EXCEPTION 'Only pickup requests can be claimed';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  IF v_request.requester_emp_id = p_claimer_emp_id THEN
    RAISE EXCEPTION 'Cannot claim your own request';
  END IF;

  SELECT * INTO v_request_state
  FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);

  IF v_request_state.state_kind IS DISTINCT FROM 'worked' THEN
    RAISE EXCEPTION 'Only worked shift requests can be claimed';
  END IF;

  v_request_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_request_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF public.has_work_assignment_started(
    v_request.org_id,
    v_request.requester_shift_date,
    COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
    v_request_custom_start,
    v_request_custom_end
  ) THEN
    RAISE EXCEPTION 'Cannot claim a pickup request for a shift that has already started';
  END IF;

  -- Validate claimer is active employee in same org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_claimer
  FROM public.employees
  WHERE id = p_claimer_emp_id AND org_id = v_request.org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claimer employee not found or archived';
  END IF;

  IF v_claimer.status != 'active' THEN
    RAISE EXCEPTION 'Claimer employee is not active';
  END IF;

  -- Validate caller is the claimer, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_claimer.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = v_request.org_id OR public.is_own_sandbox_org(v_request.org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only claim requests for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_request_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
    JOIN public.jobs j ON j.id = request_jobs.job_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
      FROM public.organization_roles role
      WHERE role.org_id = j.org_id
        AND role.id = ANY(j.eligible_role_ids)
        AND role.archived_at IS NULL
        AND role.is_schedule_role IS DISTINCT FROM FALSE
    ) eligible_roles ON TRUE
    WHERE j.archived_at IS NULL
      AND NOT (
        CASE
          WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
            AND array_length(j.required_certification_ids, 1) IS NOT NULL
            AND COALESCE(j.eligibility_mode, 'and') = 'or'
          THEN
            (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_claimer.certification_id IS NOT NULL
              AND v_claimer.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_claimer.certification_id IS NOT NULL
                AND v_claimer.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF v_request_state.focus_area_id IS NOT NULL
     AND NOT (v_request_state.focus_area_id = ANY(COALESCE(v_claimer.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  -- Block if claimer has a shift on the same date with overlapping time
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    v_request.org_id,
    p_claimer_emp_id,
    v_request.requester_shift_date,
    'published'
  );

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
       v_request_custom_start,
       v_request_custom_end
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Block if claimer is already involved in another active request on this date.
  -- Exclude calloff-spawned pickups where the claimer is the former shift owner
  -- (they called off and should still be able to pick up a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = v_request.org_id
      AND sr.id != p_request_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_claimer_emp_id AND sr.requester_shift_date = v_request.requester_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_claimer_emp_id AND sr.target_shift_date = v_request.requester_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  -- Claim the request
  UPDATE public.shift_requests
  SET target_emp_id = p_claimer_emp_id,
      status = 'pending_approval',
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_shift_request(UUID, UUID) TO authenticated;


-- ── respond_to_shift_request ────────────────────────────────────────────────
-- Target employee accepts or declines a swap or targeted pickup request.

CREATE OR REPLACE FUNCTION public.respond_to_shift_request(
  p_request_id UUID,
  p_emp_id     UUID,
  p_accept     BOOLEAN
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_emp RECORD;
  v_req_shift RECORD;
  v_tgt_shift RECORD;
  v_current_state JSONB;
  v_requester_state RECORD;
  v_target_state RECORD;
  v_requester_custom_start TEXT;
  v_requester_custom_end TEXT;
  v_target_custom_start TEXT;
  v_target_custom_end TEXT;
  v_requester_match_ordinal INTEGER;
  v_target_match_ordinal INTEGER;
  v_requester_employee RECORD;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
BEGIN
  -- Lock and fetch
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.type != 'swap'
     AND NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only swap or targeted pickup requests can be responded to';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate caller is the target employee
  SELECT id, user_id, focus_area_ids INTO v_emp FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_emp.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: only the target employee can respond';
  END IF;

  IF v_request.target_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'You are not the target of this request';
  END IF;

  IF p_accept THEN
    IF v_request.requester_shift_date < CURRENT_DATE
       OR v_request.target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot accept a request for a past shift';
    END IF;

    SELECT * INTO v_requester_state
    FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);
    v_requester_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
    v_requester_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

    IF v_request.target_state IS NOT NULL THEN
      SELECT * INTO v_target_state
      FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.target_state);
      v_target_custom_start := NULLIF(v_request.target_state->>'customStartTime', '');
      v_target_custom_end := NULLIF(v_request.target_state->>'customEndTime', '');
    END IF;

    -- Verify requester's shift still matches snapshot
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.requester_shift_date,
            COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
            COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
            v_requester_custom_start,
            v_requester_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot accept a request for a shift that has already started';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_requester_required_focus_area_ids
    FROM (
      SELECT v_req_shift.focus_area_id AS focus_area_id
      WHERE v_req_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_emp.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'You are no longer eligible for the requester shift focus area';
    END IF;

    -- Verify target's shift still matches snapshot
    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF v_request.type = 'swap' THEN
      IF NOT FOUND OR v_tgt_shift.state_kind IS DISTINCT FROM 'worked' THEN
        RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
      END IF;

      v_target_match_ordinal := public.find_matching_schedule_segment_ordinal(
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]),
        v_tgt_shift.custom_start_time,
        v_tgt_shift.custom_end_time,
        v_target_state.shift_ids[1],
        v_target_state.job_ids[1],
        COALESCE(v_target_state.is_mentored_flags[1], FALSE),
        v_target_custom_start,
        v_target_custom_end
      );

      IF v_target_match_ordinal IS NULL THEN
        RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
      END IF;
    ELSIF NOT FOUND
       OR public.build_schedule_cell_state_json(
            v_tgt_shift.state_kind,
            COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
            COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
            v_tgt_shift.absence_type_id,
            v_tgt_shift.custom_start_time,
            v_tgt_shift.custom_end_time,
            v_tgt_shift.series_id,
            v_tgt_shift.from_recurring,
            COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
          ) IS DISTINCT FROM v_request.target_state THEN
      RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    IF v_request.type = 'swap' THEN
      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.target_shift_date,
        COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        v_target_custom_start,
        v_target_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot accept a request for a shift that has already started';
      END IF;

      SELECT id, focus_area_ids
      INTO v_requester_employee
      FROM public.employees
      WHERE id = v_request.requester_emp_id
        AND org_id = v_request.org_id
        AND archived_at IS NULL
        AND status = 'active';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requester is no longer active. This request is no longer valid.';
      END IF;

      SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
      INTO v_target_required_focus_area_ids
      FROM (
        SELECT v_tgt_shift.focus_area_id AS focus_area_id
        WHERE v_tgt_shift.focus_area_id IS NOT NULL
        UNION
        SELECT sc.focus_area_id
        FROM unnest(COALESCE(v_target_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
        JOIN public.shift_categories sc
          ON sc.id = shift_ids.shift_id
         AND sc.org_id = v_request.org_id
        WHERE sc.focus_area_id IS NOT NULL
      ) required;

      IF EXISTS (
        SELECT 1
        FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
        WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
      ) THEN
        RAISE EXCEPTION 'Requester is no longer eligible for your shift focus area';
      END IF;
    END IF;

    UPDATE public.shift_requests
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_request_id;
  ELSE
    UPDATE public.shift_requests
    SET status = 'rejected', resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_shift_request(UUID, UUID, BOOLEAN) TO authenticated;


-- ── resolve_shift_request ───────────────────────────────────────────────────
-- Admin approves or rejects a pending request. On approval, executes the shift
-- reassignment atomically.

CREATE OR REPLACE FUNCTION public.resolve_shift_request(
  p_request_id   UUID,
  p_approved     BOOLEAN,
  p_note         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_admin_user_id UUID := auth.uid();
  v_req_shift RECORD;
  v_tgt_shift RECORD;
  v_requester_state RECORD;
  v_target_state RECORD;
  v_requester_custom_start TEXT;
  v_requester_custom_end TEXT;
  v_target_custom_start TEXT;
  v_target_custom_end TEXT;
  v_source_matches BOOLEAN;
  v_row_count INTEGER;
  v_requester_employee RECORD;
  v_target_employee RECORD;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_requester_match_ordinal INTEGER;
  v_target_match_ordinal INTEGER;
  v_requester_segment_count INTEGER;
  v_target_segment_count INTEGER;
  v_remaining_shift_ids BIGINT[];
  v_remaining_job_ids BIGINT[];
  v_remaining_is_mentored_flags BOOLEAN[];
  v_remaining_custom_start TEXT;
  v_remaining_custom_end TEXT;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  -- Validate admin permissions
  IF NOT (
    public.is_gridmaster()
    OR public.caller_org_role()::TEXT = 'super_admin'
  ) THEN
    -- Check canApproveShiftRequests for admins
    IF public.caller_org_role()::TEXT = 'admin' THEN
      IF NOT COALESCE(
        (SELECT (cm.admin_permissions->>'canApproveShiftRequests')::BOOLEAN
         FROM public.organization_memberships cm
         WHERE cm.user_id = v_admin_user_id AND cm.org_id = public.caller_org_id()),
        FALSE
      ) THEN
        RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: insufficient permissions';
    END IF;
  END IF;

  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Request is not pending approval (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate org scoping
  IF v_request.org_id != public.caller_org_id() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: request belongs to a different organization';
  END IF;

  IF NOT p_approved THEN
    -- Rejecting a claimed public/calloff pickup releases it for another
    -- single applicant instead of permanently closing the open shift.
    IF v_request.type = 'pickup'
       AND v_request.target_emp_id IS NOT NULL
       AND v_request.target_state IS NULL THEN
      UPDATE public.shift_requests
      SET status = 'open',
          target_emp_id = NULL,
          target_shift_date = NULL,
          admin_user_id = v_admin_user_id,
          admin_note = p_note,
          resolved_at = NULL,
          updated_at = now()
      WHERE id = p_request_id;
      RETURN;
    END IF;

    -- Reject
    UPDATE public.shift_requests
    SET status = 'rejected', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- ── APPROVAL: execute the shift reassignment ──
  SELECT * INTO v_requester_state
  FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);
  v_requester_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_requester_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF v_request.target_state IS NOT NULL THEN
    SELECT * INTO v_target_state
    FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.target_state);
    v_target_custom_start := NULLIF(v_request.target_state->>'customStartTime', '');
    v_target_custom_end := NULLIF(v_request.target_state->>'customEndTime', '');
  END IF;

  -- ── CALLOFF: apply absence + spawn open pickup ──
  IF v_request.type = 'calloff' THEN
    -- Advisory lock on requester's shift
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));

    -- Re-validate requester's shift still matches snapshot
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);

    IF v_requester_segment_count <= 1 THEN
      -- Full-day calloff: preserve the existing absence-cell behavior.
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'absence',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_request.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        v_req_shift.version,
        v_admin_user_id
      );
    ELSE
      -- Partial calloff: remove only the selected segment. The calloff request
      -- remains the durable absence record for that individual shift.
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_start_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );
      v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_end_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        NULL,
        v_remaining_custom_start,
        v_remaining_custom_end,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = v_req_shift.cell_id
      AND snapshot_kind = 'draft';

    -- Auto-create an open pickup request so other staff can claim the vacated shift
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      parent_request_id
    ) VALUES (
      v_request.org_id, 'pickup', 'open',
      v_request.requester_emp_id, v_request.requester_shift_date,
      v_request.requester_state,
      p_request_id
    );

    -- Mark calloff as approved
    UPDATE public.shift_requests
    SET status = 'approved', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;

    -- Cascade-cancel other active requests involving this shift
    UPDATE public.shift_requests
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: shift was called off',
        resolved_at = now(), updated_at = now()
    WHERE id != p_request_id
      AND org_id = v_request.org_id
      AND status IN ('open', 'pending_approval')
      AND (
        (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
        OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      );

    RETURN;
  END IF;

  -- Advisory lock on involved shifts to prevent concurrent modifications.
  -- Acquire in deterministic order (alphabetical by key) to prevent deadlocks.
  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NOT NULL THEN
      -- Calloff-claimed pickup: lock both requester and target shifts
      IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
         < (v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
      THEN
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      ELSE
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      END IF;
    ELSE
      -- Volunteer pickup: only lock the volunteer's date
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  ELSIF v_request.type = 'swap' THEN
    IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
       < (v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT)
    THEN
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  END IF;

  -- Re-validate both employees are still active (status could change between creation and approval)
  SELECT id, focus_area_ids, certification_id, role_ids
  INTO v_requester_employee
  FROM public.employees
    WHERE id = v_request.requester_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
  ;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requester is no longer active. Cannot approve.';
  END IF;

  IF v_request.target_emp_id IS NOT NULL THEN
    SELECT id, focus_area_ids, certification_id, role_ids
    INTO v_target_employee
    FROM public.employees
    WHERE id = v_request.target_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
    ;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee is no longer active. Cannot approve.';
    END IF;
  END IF;

  -- Verify requester's shift still exists as snapshotted
  -- (Skip for volunteer pickups — there is no original shift to validate against)
  IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL) THEN
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;
  END IF;

  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NULL THEN
      -- ── VOLUNTEER PICKUP: no source shift to transfer, just assign to volunteer ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteered shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_requester_employee.certification_id IS NOT NULL
                  AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_requester_employee.certification_id IS NOT NULL
                    AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer is no longer assigned to the required focus area';
      END IF;

      SELECT COALESCE(
        NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
        1
      )
      INTO v_mentored_credit
      FROM public.organizations o
      WHERE o.id = v_request.org_id;

      v_day_of_week := EXTRACT(DOW FROM v_request.requester_shift_date)::INTEGER;

      FOR v_segment IN
        SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
        FROM unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      LOOP
        SELECT cr.min_staff
        INTO v_required_staff
        FROM public.coverage_requirements cr
        WHERE cr.org_id = v_request.org_id
          AND cr.focus_area_id = v_requester_state.focus_area_id
          AND cr.job_id = v_segment.job_id
          AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
          AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
          AND cr.min_staff > 0
        ORDER BY
          CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
          CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_required_staff IS NULL THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;

        SELECT COALESCE(SUM(
          CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
        ), 0)
        INTO v_actual_staff
        FROM public.employees e
        JOIN LATERAL public.get_schedule_cell_snapshot_payload(
          v_request.org_id,
          e.id,
          v_request.requester_shift_date,
          'published'
        ) snapshot ON TRUE
        JOIN LATERAL unnest(
          COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
        WHERE e.org_id = v_request.org_id
          AND e.archived_at IS NULL
          AND e.status = 'active'
          AND v_requester_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
          AND snapshot.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND snapshot.state_kind = 'worked'
          AND scheduled_segment.job_id = v_segment.job_id
          AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

        IF v_actual_staff >= v_required_staff THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;
      END LOOP;

      -- Re-check at approval: volunteer must not have an overlapping shift now
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The volunteer has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

    ELSE
      -- ── CALLOFF-CLAIMED PICKUP: transfer shift from requester to target ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: pickup shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_target_employee.certification_id IS NOT NULL
                  AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_target_employee.certification_id IS NOT NULL
                    AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: target employee no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: target employee is no longer assigned to the required focus area';
      END IF;

      -- Re-check at approval: target must not have an overlapping shift on this date
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF v_request.absence_type_id IS NOT NULL
         AND (
           NOT FOUND
           OR public.build_schedule_cell_state_json(
                v_tgt_shift.state_kind,
                COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
                COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
                v_tgt_shift.absence_type_id,
                v_tgt_shift.custom_start_time,
                v_tgt_shift.custom_end_time,
                v_tgt_shift.series_id,
                v_tgt_shift.from_recurring,
                COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
              ) IS DISTINCT FROM v_request.target_state
         ) THEN
        RAISE EXCEPTION 'The target employee''s absence has been modified since the request was created. Please ask the employee to resubmit.';
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The target employee has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

      v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);

      IF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'absence',
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          v_request.absence_type_id,
          NULL,
          NULL,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          v_req_shift.version,
          v_admin_user_id
        );

        DELETE FROM public.schedule_cell_snapshots
        WHERE cell_id = v_req_shift.cell_id
          AND snapshot_kind = 'draft';
      ELSIF v_requester_segment_count <= 1 THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'deleted',
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          NULL,
          NULL,
          NULL,
          NULL,
          FALSE,
          NULL,
          v_req_shift.version,
          v_admin_user_id
        );
      ELSE
        SELECT
          COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
        INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
        FROM unnest(
          COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
        WHERE segment.ordinality <> v_requester_match_ordinal;

        v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );
        v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );

        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
          COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
          NULL,
          v_remaining_custom_start,
          v_remaining_custom_end,
          NULL,
          FALSE,
          CASE
            WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
            ELSE NULL
          END,
          v_req_shift.version,
          v_admin_user_id,
          COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;
    END IF;

  ELSIF v_request.type = 'swap' THEN
    IF v_request.requester_shift_date < CURRENT_DATE
       OR v_request.target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot approve: swap includes a past shift';
    END IF;

    -- Verify target's shift still exists as snapshotted
    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF NOT FOUND OR v_tgt_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    v_target_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_tgt_shift.custom_start_time,
      v_tgt_shift.custom_end_time,
      v_target_state.shift_ids[1],
      v_target_state.job_ids[1],
      COALESCE(v_target_state.is_mentored_flags[1], FALSE),
      v_target_custom_start,
      v_target_custom_end
    );

    IF v_target_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.requester_shift_date,
      COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
      v_requester_custom_start,
      v_requester_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester shift has already started';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.target_shift_date,
      COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
      v_target_custom_start,
      v_target_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target shift has already started';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_requester_required_focus_area_ids
    FROM (
      SELECT v_req_shift.focus_area_id AS focus_area_id
      WHERE v_req_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_target_required_focus_area_ids
    FROM (
      SELECT v_tgt_shift.focus_area_id AS focus_area_id
      WHERE v_tgt_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_target_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target employee is not eligible for the requester shift focus area';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester is not eligible for the target shift focus area';
    END IF;

    -- Block if shifts have overlapping time slots (full cascade: custom → job override/default → shift).
    -- Applies to both same-day and cross-day swaps.

    -- Same-day: block if requester and target shifts overlap in time (pointless swap)
    IF v_request.requester_shift_date = v_request.target_shift_date THEN
      IF public.work_assignment_times_overlap(
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]), v_requester_custom_start, v_requester_custom_end,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_target_state.job_ids, '{}'::BIGINT[]), v_target_custom_start, v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: shifts have overlapping time slots';
      END IF;
    ELSE
      -- Cross-day: requester's existing shift on target_date vs incoming target codes
      SELECT *
      INTO v_req_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published'
      );

      IF FOUND
         AND v_req_shift.state_kind = 'worked'
         AND array_length(v_req_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
           v_req_shift.custom_start_time,
           v_req_shift.custom_end_time,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
           v_target_custom_start,
           v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: requester would have overlapping shift times on the target''s date';
      END IF;

      -- Cross-day: target's existing shift on requester_date vs incoming requester codes
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: target would have overlapping shift times on the requester''s date';
      END IF;
    END IF;

    -- Remove only the specific swapped segments from their original owners.
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);
    IF v_requester_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_req_shift.version,
        v_admin_user_id
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        NULL,
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    v_target_segment_count := COALESCE(array_length(v_tgt_shift.job_ids, 1), 0);
    IF v_target_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_tgt_shift.version,
        v_admin_user_id
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_target_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        NULL,
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_start_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_end_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_target_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
            THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
          WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
          ELSE v_tgt_shift.custom_start_time
        END,
        CASE
          WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
            THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
          WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
          ELSE v_tgt_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_requester_custom_start,
        v_requester_custom_end,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF FOUND AND v_req_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_req_shift.custom_start_time IS NOT NULL AND v_target_custom_start IS NOT NULL
            THEN v_req_shift.custom_start_time || '|' || v_target_custom_start
          WHEN v_target_custom_start IS NOT NULL THEN v_target_custom_start
          ELSE v_req_shift.custom_start_time
        END,
        CASE
          WHEN v_req_shift.custom_end_time IS NOT NULL AND v_target_custom_end IS NOT NULL
            THEN v_req_shift.custom_end_time || '|' || v_target_custom_end
          WHEN v_target_custom_end IS NOT NULL THEN v_target_custom_end
          ELSE v_req_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_target_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_target_custom_start,
        v_target_custom_end,
        NULL,
        FALSE,
        v_target_state.focus_area_id,
        CASE WHEN FOUND THEN v_req_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;
  END IF;

  -- Mark approved
  UPDATE public.shift_requests
  SET status = 'approved', admin_user_id = v_admin_user_id,
      admin_note = p_note, resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;

  IF v_request.type = 'pickup' AND v_request.target_emp_id IS NULL THEN
    UPDATE public.shift_requests sr
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: open shift was taken by another approved volunteer',
        resolved_at = now(),
        updated_at = now()
    WHERE sr.id != p_request_id
      AND sr.org_id = v_request.org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = v_request.requester_shift_date
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])
        ) AS approved_segment(shift_id, job_id) ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND other_segment.job_id = approved_segment.job_id
          AND other_segment.shift_id IS NOT DISTINCT FROM approved_segment.shift_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL (
          SELECT requirement.min_staff
          FROM public.coverage_requirements requirement
          WHERE requirement.org_id = sr.org_id
            AND requirement.focus_area_id = other_state.focus_area_id
            AND requirement.job_id = other_segment.job_id
            AND (requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id OR requirement.preferred_shift_id IS NULL)
            AND (requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER OR requirement.day_of_week IS NULL)
            AND requirement.min_staff > 0
          ORDER BY
            CASE WHEN requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id THEN 0 ELSE 1 END,
            CASE WHEN requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER THEN 0 ELSE 1 END
          LIMIT 1
        ) cr ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND (
            SELECT COALESCE(SUM(
              CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
            ), 0)
            FROM public.employees e
            JOIN LATERAL public.get_schedule_cell_snapshot_payload(
              sr.org_id,
              e.id,
              sr.requester_shift_date,
              'published'
            ) snapshot ON TRUE
            JOIN LATERAL unnest(
              COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
            ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
            WHERE e.org_id = sr.org_id
              AND e.archived_at IS NULL
              AND e.status = 'active'
              AND other_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
              AND snapshot.focus_area_id IS NOT DISTINCT FROM other_state.focus_area_id
              AND snapshot.state_kind = 'worked'
              AND scheduled_segment.job_id = other_segment.job_id
              AND scheduled_segment.shift_id IS NOT DISTINCT FROM other_segment.shift_id
          ) >= cr.min_staff
      );
  END IF;

  -- Cascade-cancel all other active requests involving the modified shifts
  UPDATE public.shift_requests
  SET status = 'cancelled',
      admin_note = 'Auto-cancelled: shift was reassigned by another approved request',
      resolved_at = now(),
      updated_at = now()
  WHERE id != p_request_id
    AND org_id = v_request.org_id
    AND status IN ('open', 'pending_approval')
    AND (
      (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
      OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      OR (v_request.type = 'swap' AND requester_emp_id = v_request.target_emp_id AND requester_shift_date = v_request.target_shift_date)
      OR (v_request.type = 'swap' AND target_emp_id = v_request.target_emp_id AND target_shift_date = v_request.target_shift_date)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;


-- ── cancel_shift_request ────────────────────────────────────────────────────
-- Requester cancels their own request.

CREATE OR REPLACE FUNCTION public.cancel_shift_request(
  p_request_id UUID,
  p_emp_id     UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_emp RECORD;
BEGIN
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.status NOT IN ('open', 'pending_approval') THEN
    RAISE EXCEPTION 'Request cannot be cancelled (status: %)', v_request.status;
  END IF;

  -- Validate caller is the requester
  SELECT id, user_id INTO v_emp
  FROM public.employees
  WHERE id = p_emp_id AND org_id = v_request.org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_request.requester_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'Only the requester can cancel this request';
  END IF;

  -- Or admin+ IN THIS org (or their own sandbox) — see create_shift_request
  -- for why the org match is required.
  IF v_emp.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = v_request.org_id OR public.is_own_sandbox_org(v_request.org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.shift_requests
  SET status = 'cancelled', resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_shift_request(UUID, UUID) TO authenticated;


-- ── volunteer_for_open_shift ────────────────────────────────────────────────
-- Employee volunteers for a coverage-gap open shift (no existing shift_request).
-- Creates a pickup request with status='pending_approval' (volunteer IS the requester,
-- target_emp_id is NULL to distinguish from calloff-claimed pickups).

DROP FUNCTION IF EXISTS public.volunteer_for_open_shift(UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]);
DROP FUNCTION IF EXISTS public.volunteer_for_open_shift(UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift(
  p_org_id              UUID,
  p_emp_id              UUID,
  p_shift_date          DATE,
  p_shift_ids           BIGINT[],
  p_job_ids             BIGINT[],
  p_focus_area_id       BIGINT,
  p_custom_start_time   TEXT DEFAULT NULL,
  p_custom_end_time     TEXT DEFAULT NULL,
  p_is_mentored_flags   BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request_id UUID;
  v_employee RECORD;
  v_existing_shift RECORD;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF array_length(p_is_mentored_flags, 1) IS NOT NULL
     AND array_length(p_is_mentored_flags, 1) != array_length(p_job_ids, 1) THEN
    RAISE EXCEPTION 'Mentored flag and job ID segment lengths must match';
  END IF;

  -- Validate worked assignment is non-empty
  IF array_length(p_job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one worked segment is required';
  END IF;

  -- Validate employee is active in this org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_employee
  FROM public.employees
  WHERE id = p_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  IF v_employee.status != 'active' THEN
    RAISE EXCEPTION 'Employee is not active';
  END IF;

  -- Validate caller is the employee, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only volunteer for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
    JOIN public.jobs j ON j.id = request_jobs.job_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
      FROM public.organization_roles role
      WHERE role.org_id = j.org_id
        AND role.id = ANY(j.eligible_role_ids)
        AND role.archived_at IS NULL
        AND role.is_schedule_role IS DISTINCT FROM FALSE
    ) eligible_roles ON TRUE
    WHERE j.archived_at IS NULL
      AND NOT (
        CASE
          WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
            AND array_length(j.required_certification_ids, 1) IS NOT NULL
            AND COALESCE(j.eligibility_mode, 'and') = 'or'
          THEN
            (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_employee.certification_id IS NOT NULL
              AND v_employee.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_employee.certification_id IS NOT NULL
                AND v_employee.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF p_focus_area_id IS NOT NULL
     AND NOT (p_focus_area_id = ANY(COALESCE(v_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  IF public.has_work_assignment_started(
    p_org_id,
    p_shift_date,
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start_time,
    p_custom_end_time
  ) THEN
    RAISE EXCEPTION 'Cannot volunteer for a shift that has already started';
  END IF;

  SELECT COALESCE(
    NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
    1
  )
  INTO v_mentored_credit
  FROM public.organizations o
  WHERE o.id = p_org_id;

  v_day_of_week := EXTRACT(DOW FROM p_shift_date)::INTEGER;

  FOR v_segment IN
    SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
    FROM unnest(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(
      'open_shift_volunteer_' ||
      p_org_id::TEXT || '_' ||
      p_shift_date::TEXT || '_' ||
      COALESCE(p_focus_area_id::TEXT, 'none') || '_' ||
      COALESCE(v_segment.shift_id::TEXT, 'none') || '_' ||
      v_segment.job_id::TEXT
    ));

    SELECT cr.min_staff
    INTO v_required_staff
    FROM public.coverage_requirements cr
    WHERE cr.org_id = p_org_id
      AND cr.focus_area_id = p_focus_area_id
      AND cr.job_id = v_segment.job_id
      AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
      AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
      AND cr.min_staff > 0
    ORDER BY
      CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
      CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_required_staff IS NULL THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.shift_requests sr
      JOIN LATERAL public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
      JOIN LATERAL unnest(
        COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(request_state.job_ids, '{}'::BIGINT[])
      ) AS request_segment(shift_id, job_id) ON TRUE
      WHERE sr.org_id = p_org_id
        AND sr.type = 'pickup'
        AND sr.status = 'pending_approval'
        AND sr.target_emp_id IS NULL
        AND sr.parent_request_id IS NULL
        AND sr.requester_emp_id = p_emp_id
        AND sr.requester_shift_date = p_shift_date
        AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
        AND request_segment.job_id = v_segment.job_id
        AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id
    ) THEN
      RAISE EXCEPTION 'You already volunteered for this open shift';
    END IF;

    SELECT COUNT(DISTINCT sr.id)
    INTO v_pending_volunteer_count
    FROM public.shift_requests sr
    JOIN LATERAL public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
    JOIN LATERAL unnest(
      COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(request_state.job_ids, '{}'::BIGINT[])
    ) AS request_segment(shift_id, job_id) ON TRUE
    WHERE sr.org_id = p_org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = p_shift_date
      AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND request_segment.job_id = v_segment.job_id
      AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
    ), 0)
    INTO v_actual_staff
    FROM public.employees e
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      e.id,
      p_shift_date,
      'published'
    ) snapshot ON TRUE
    JOIN LATERAL unnest(
      COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
    WHERE e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND e.status = 'active'
      AND p_focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
      AND snapshot.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND snapshot.state_kind = 'worked'
      AND scheduled_segment.job_id = v_segment.job_id
      AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    IF v_actual_staff + COALESCE(v_pending_volunteer_count, 0) >= v_required_staff THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;
  END LOOP;

  -- Check time conflicts: volunteer must not have an overlapping shift on this date
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id,
    p_emp_id,
    p_shift_date,
    'published'
  );

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(p_shift_ids, '{}'::BIGINT[]),
       COALESCE(p_job_ids, '{}'::BIGINT[]),
       p_custom_start_time,
       p_custom_end_time
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Check no active request already exists for this employee on this date.
  -- Exclude calloff-spawned pickups where the employee is the former shift owner
  -- (they called off and should still be able to volunteer for a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = p_org_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_emp_id AND sr.requester_shift_date = p_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_emp_id AND sr.target_shift_date = p_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  INSERT INTO public.shift_requests (
    org_id, type, status,
    requester_emp_id, requester_shift_date, requester_state
  ) VALUES (
    p_org_id, 'pickup', 'pending_approval',
    p_emp_id, p_shift_date,
    public.build_schedule_cell_state_json(
      'worked',
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      NULL,
      p_custom_start_time,
      p_custom_end_time,
      NULL,
      FALSE,
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[]),
      p_focus_area_id
    )
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.volunteer_for_open_shift(UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]) TO authenticated;


-- ── expire_shift_requests ───────────────────────────────────────────────────
-- Bulk-expire stale requests. Called by application cron or manually.
-- Restricted to gridmaster only (cron calls via service_role bypass RLS).

CREATE OR REPLACE FUNCTION public.expire_shift_requests()
RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Only gridmaster can call this directly; service_role bypasses RLS for cron
  IF NOT public.is_gridmaster() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: only gridmaster or system cron can expire requests';
  END IF;

  UPDATE public.shift_requests
  SET status = 'expired', resolved_at = now(), updated_at = now()
  WHERE status IN ('open', 'pending_approval')
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_shift_requests() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- DATA RETENTION CLEANUP
-- ══════════════════════════════════════════════════════════════════════════════

-- Purges archived data older than the organization's retention period.
-- Designed to be called by a cron job (e.g. pg_cron or Supabase Edge Function).
CREATE OR REPLACE FUNCTION public.purge_expired_data()
RETURNS TABLE(org_id UUID, employees_purged BIGINT, shifts_purged BIGINT, audit_purged BIGINT, invitations_purged BIGINT, requests_purged BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org RECORD;
  e_count BIGINT;
  s_count BIGINT;
  a_count BIGINT;
  i_count BIGINT;
  r_count BIGINT;
BEGIN
  -- Auth check: only service-role (cron) or gridmasters may call this.
  IF auth.uid() IS NOT NULL AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'unauthorized: restricted to service role or gridmaster';
  END IF;

  FOR org IN
    SELECT o.id, o.data_retention_days
    FROM organizations o
    WHERE o.archived_at IS NULL
      AND o.data_retention_days > 0
  LOOP
    -- Purge archived employees past retention
    WITH deleted AS (
      DELETE FROM employees e
      WHERE e.org_id = org.id
        AND e.archived_at IS NOT NULL
        AND e.archived_at < now() - (org.data_retention_days || ' days')::INTERVAL
      RETURNING 1
    )
    SELECT count(*) INTO e_count FROM deleted;

    -- Purge old schedule cells (beyond retention period from their date).
    -- schedule_cell_snapshots/schedule_cell_segments cascade via FK
    -- (ON DELETE CASCADE), so no separate cleanup is needed for those.
    -- (There is no "shifts" table in this schema — schedule data lives in
    -- schedule_cells; the old reference here predates the schema
    -- consolidation and made this loop error out on every invocation.)
    WITH deleted AS (
      DELETE FROM schedule_cells s
      WHERE s.org_id = org.id
        AND s.date < (CURRENT_DATE - org.data_retention_days)
      RETURNING 1
    )
    SELECT count(*) INTO s_count FROM deleted;

    -- Purge old audit log entries
    WITH deleted AS (
      DELETE FROM audit_log al
      WHERE al.org_id = org.id
        AND al.created_at < now() - (org.data_retention_days || ' days')::INTERVAL
      RETURNING 1
    )
    SELECT count(*) INTO a_count FROM deleted;

    -- Purge expired invitations (older than retention + 30 days)
    WITH deleted AS (
      DELETE FROM invitations inv
      WHERE inv.org_id = org.id
        AND inv.created_at < now() - ((org.data_retention_days + 30) || ' days')::INTERVAL
      RETURNING 1
    )
    SELECT count(*) INTO i_count FROM deleted;

    -- Purge resolved shift requests past retention
    WITH deleted AS (
      DELETE FROM shift_requests sr
      WHERE sr.org_id = org.id
        AND sr.status NOT IN ('open', 'pending_approval')
        AND sr.updated_at < now() - (org.data_retention_days || ' days')::INTERVAL
      RETURNING 1
    )
    SELECT count(*) INTO r_count FROM deleted;

    org_id := org.id;
    employees_purged := e_count;
    shifts_purged := s_count;
    audit_purged := a_count;
    invitations_purged := i_count;
    requests_purged := r_count;

    IF e_count > 0 OR s_count > 0 OR a_count > 0 OR i_count > 0 OR r_count > 0 THEN
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_data IS 'Purges archived/old data per organization retention policy. Call via cron.';


-- ══════════════════════════════════════════════════════════════════════════════
-- GDPR DATA ERASURE
-- ══════════════════════════════════════════════════════════════════════════════

-- Anonymizes a user's personal data across the platform (GDPR Right to Erasure).
-- Does NOT delete the auth.users row — caller must do that separately via admin API.
CREATE OR REPLACE FUNCTION public.gdpr_erase_user_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  emp_count BIGINT;
BEGIN
  -- Auth check: only the target user, gridmasters, or service-role (auth.uid() IS NULL) may call this.
  -- purge_scheduled_accounts() calls this internally via service-role context where auth.uid() IS NULL.
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'unauthorized: caller must be the target user or a gridmaster';
  END IF;

  -- 1. Anonymize profile
  UPDATE profiles
    SET first_name = 'Deleted', last_name = 'User', mfa_enabled = false
    WHERE id = p_user_id;

  -- 2. Remove org memberships
  DELETE FROM organization_memberships WHERE user_id = p_user_id;

  -- 3. Anonymize linked employees (keep record structure, remove PII)
  UPDATE employees
    SET first_name = 'Deleted', last_name = 'User',
        email = '', phone = '', contact_notes = '',
        user_id = NULL
    WHERE user_id = p_user_id;
  GET DIAGNOSTICS emp_count = ROW_COUNT;

  -- 4. Anonymize audit log entries
  UPDATE audit_log SET actor_email = NULL WHERE actor_id = p_user_id;

  -- 5. Delete notifications
  DELETE FROM notifications WHERE user_id = p_user_id;

  -- 6. Delete notification preferences
  DELETE FROM notification_preferences WHERE user_id = p_user_id;

  -- 7. Delete user sessions
  DELETE FROM user_sessions WHERE user_id = p_user_id;

  -- 8. Delete terms acceptances
  DELETE FROM terms_acceptances WHERE user_id = p_user_id;

  -- 9. Anonymize role change log entries
  UPDATE role_change_log
    SET target_user_id = '00000000-0000-0000-0000-000000000000'
    WHERE target_user_id = p_user_id;
  UPDATE role_change_log
    SET changed_by_id = '00000000-0000-0000-0000-000000000000'
    WHERE changed_by_id = p_user_id;

  result := jsonb_build_object(
    'user_id', p_user_id,
    'employees_anonymized', emp_count,
    'status', 'erased'
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.gdpr_erase_user_data IS 'Anonymizes all PII for a user across the platform (GDPR Article 17 compliance).';


--- ══════════════════════════════════════════════════════════════════════════════
--- flag_inactive_accounts
--- Flags profiles inactive for longer than retention_days for scheduled deletion.
--- Accounts get a 30-day grace period before purge_scheduled_accounts erases them.
--- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.flag_inactive_accounts(
  retention_days INT DEFAULT 730
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flagged_count BIGINT;
BEGIN
  -- Auth check: only service-role (cron) or gridmasters may call this.
  IF auth.uid() IS NOT NULL AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'unauthorized: restricted to service role or gridmaster';
  END IF;

  UPDATE profiles
     SET scheduled_deletion_at  = NOW() + INTERVAL '30 days',
         deactivation_warned_at = NOW()
   WHERE last_sign_in_at IS NOT NULL
     AND last_sign_in_at < NOW() - (retention_days || ' days')::INTERVAL
     AND platform_role != 'gridmaster'
     AND scheduled_deletion_at IS NULL;

  GET DIAGNOSTICS flagged_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'flagged_count', flagged_count,
    'retention_days', retention_days,
    'run_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.flag_inactive_accounts IS 'Flags inactive accounts for scheduled GDPR deletion after a grace period.';


--- ══════════════════════════════════════════════════════════════════════════════
--- purge_scheduled_accounts
--- Erases PII for accounts past their scheduled_deletion_at date.
--- Calls gdpr_erase_user_data for each. Does NOT delete auth.users — the
--- calling API endpoint or cron handler must call auth.admin.deleteUser.
--- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.purge_scheduled_accounts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec         RECORD;
  purged_count BIGINT := 0;
BEGIN
  -- Auth check: only service-role (cron) or gridmasters may call this.
  IF auth.uid() IS NOT NULL AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'unauthorized: restricted to service role or gridmaster';
  END IF;

  FOR rec IN
    SELECT id FROM profiles
     WHERE scheduled_deletion_at IS NOT NULL
       AND scheduled_deletion_at <= NOW()
       AND platform_role != 'gridmaster'
  LOOP
    PERFORM gdpr_erase_user_data(rec.id);
    purged_count := purged_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'purged_count', purged_count,
    'run_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.purge_scheduled_accounts IS 'Erases PII for accounts past their scheduled deletion date (GDPR Article 17).';


-- ── update_schedule_last_viewed ─────────────────────────────────────────────
-- Fire-and-forget: records when the current user last viewed the schedule.
-- Used to replace the fixed 24h publish window with per-user tracking.

CREATE OR REPLACE FUNCTION public.update_schedule_last_viewed(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE organization_memberships
  SET schedule_last_viewed_at = now()
  WHERE user_id = auth.uid() AND org_id = p_org_id;
END;
$$;

COMMENT ON FUNCTION public.update_schedule_last_viewed IS 'Updates schedule_last_viewed_at for the calling user in the given org.';


-- ── get_schedule_last_viewed ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_schedule_last_viewed(p_org_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT schedule_last_viewed_at
  FROM organization_memberships
  WHERE user_id = auth.uid() AND org_id = p_org_id;
$$;

COMMENT ON FUNCTION public.get_schedule_last_viewed IS 'Returns when the calling user last viewed the schedule in the given org.';


-- ── get_publish_history (paginated) ─────────────────────────────────────────
-- Returns paginated publish history with the publisher name resolved.

CREATE OR REPLACE FUNCTION public.get_publish_history(
  p_org_id  UUID,
  p_limit   INTEGER DEFAULT 20,
  p_offset  INTEGER DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  published_by     UUID,
  published_by_name TEXT,
  start_date       DATE,
  end_date         DATE,
  change_count     INTEGER,
  changes          JSONB,
  published_at     TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT ph.id, ph.published_by,
         COALESCE(NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''), 'Unknown') AS published_by_name,
         ph.start_date, ph.end_date, ph.change_count,
         COALESCE(agg.changes, '[]'::JSONB) AS changes,
         ph.published_at
  FROM public.publish_history ph
  LEFT JOIN public.profiles p ON p.id = ph.published_by
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'empId', spc.emp_id,
      'date', spc.date,
      'kind', spc.kind,
      'fromState', spc.from_state,
      'toState', spc.to_state,
      'fromAbsenceTypeId', spc.from_absence_type_id,
      'toAbsenceTypeId', spc.to_absence_type_id,
      'updatedBy', spc.updated_by,
      'fromCustomStart', spc.from_custom_start,
      'fromCustomEnd', spc.from_custom_end,
      'toCustomStart', spc.to_custom_start,
      'toCustomEnd', spc.to_custom_end
    )) AS changes
    FROM public.schedule_publish_changes spc
    WHERE spc.publish_history_id = ph.id
  ) agg ON TRUE
  WHERE ph.org_id = p_org_id
    AND ph.org_id = public.caller_org_id()
  ORDER BY ph.published_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.get_publish_history IS 'Returns paginated publish history for an org with publisher names resolved.';


-- ══════════════════════════════════════════════════════════════════════════════
-- PERFORMANCE: Aggregation & Batch RPCs
-- ══════════════════════════════════════════════════════════════════════════════

-- Server-side tenant stats aggregation (replaces 2 full table scans + client-side aggregation)
CREATE OR REPLACE FUNCTION public.get_tenant_stats()
RETURNS TABLE(org_id UUID, user_count BIGINT, employee_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Auth check: only gridmasters may view cross-org tenant stats.
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'unauthorized: restricted to gridmaster';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(m.org_id, e.org_id) AS org_id,
    COALESCE(m.cnt, 0) AS user_count,
    COALESCE(e.cnt, 0) AS employee_count
  FROM
    (
      SELECT om.org_id, COUNT(*) AS cnt
      FROM public.organization_memberships om
      JOIN public.profiles p ON p.id = om.user_id
      JOIN public.organizations o ON o.id = om.org_id AND o.workspace_kind = 'real'
      WHERE om.archived_at IS NULL
        AND p.platform_role <> 'gridmaster'
      GROUP BY om.org_id
    ) m
  FULL OUTER JOIN
    (
      SELECT emp.org_id, COUNT(*) AS cnt
      FROM public.employees emp
      JOIN public.organizations o ON o.id = emp.org_id AND o.workspace_kind = 'real'
      WHERE emp.archived_at IS NULL
      GROUP BY emp.org_id
    ) e
  ON m.org_id = e.org_id;
END;
$$;

COMMENT ON FUNCTION public.get_tenant_stats IS 'Returns per-org user and employee counts aggregated server-side.';

UPDATE public.organizations
SET
  address_line_1 = address
WHERE
  COALESCE(address, '') <> ''
  AND COALESCE(address_line_1, '') = '';


-- Batch remove a focus area ID from all employee focus_area_ids arrays (replaces N+1 loop)
CREATE OR REPLACE FUNCTION public.remove_focus_area_from_employees(p_focus_area_id BIGINT)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- service_role is a trusted backend caller (settings/config/route.ts calls
  -- this after its own requireOrgPermissions('canManageFocusAreas') check via
  -- the service client, which carries no auth.uid()/JWT org context) —
  -- mirrors the same service_role carve-out used by send_invitation and
  -- get_org_directory.
  IF (auth.jwt() ->> 'role') <> 'service_role'
     AND NOT public.check_admin_permission('canManageFocusAreas') THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to manage focus areas';
  END IF;

  UPDATE public.employees
  SET focus_area_ids = array_remove(focus_area_ids, p_focus_area_id)
  WHERE focus_area_ids @> ARRAY[p_focus_area_id]
    AND org_id = public.caller_org_id();
END;
$$;

COMMENT ON FUNCTION public.remove_focus_area_from_employees IS 'Removes a focus area ID from all employee arrays in a single UPDATE.';


-- ── People Directory (union of employees + app-only users) ──────────────────

CREATE OR REPLACE FUNCTION public.get_org_directory(
  p_org_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  person_id               TEXT,
  source                  TEXT,
  employee_id             UUID,
  employee_number         INTEGER,
  user_id                 UUID,
  first_name              TEXT,
  last_name               TEXT,
  email                   TEXT,
  phone                   TEXT,
  employee_status         TEXT,
  org_role                TEXT,
  has_app_access          BOOLEAN,
  focus_area_ids          BIGINT[],
  certification_id        BIGINT,
  role_ids                BIGINT[],
  seniority               INTEGER,
  last_sign_in_at         TIMESTAMPTZ,
  invitation_status       TEXT,
  scheduled_department_ids BIGINT[],
  scheduled_dept_admin_ids BIGINT[],
  management_department_ids BIGINT[],
  management_dept_admin_ids BIGINT[],
  membership_updated_at TIMESTAMPTZ,
  membership_admin_permissions JSONB
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (
    -- Trusted backend path: API routes authorize the caller via
    -- requireOrgPermissions, then invoke this through the service-role client
    -- (where auth.uid()/JWT org claims are absent). Direct authenticated callers
    -- must still be a gridmaster or a super_admin/admin of the target org.
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role() IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY

  -- All employees, enriched with management membership or pending employee-linked invite.
  SELECT
    e.id::TEXT AS person_id,
    'employee'::TEXT AS source,
    e.id AS employee_id,
    e.employee_number,
    e.user_id AS user_id,
    e.first_name,
    e.last_name,
    COALESCE(NULLIF(e.email, ''), au.email::TEXT, emp_inv.email, '') AS email,
    COALESCE(NULLIF(e.phone, ''), cm.phone, emp_inv.phone, '') AS phone,
    e.status::TEXT AS employee_status,
    COALESCE(cm.org_role::TEXT, emp_inv.role_to_assign::TEXT, NULL) AS org_role,
    (cm.user_id IS NOT NULL) AS has_app_access,
    e.focus_area_ids,
    e.certification_id,
    e.role_ids,
    e.seniority,
    au.last_sign_in_at,
    emp_inv.invitation_status,
    COALESCE(e.department_ids, '{}'::BIGINT[]) AS scheduled_department_ids,
    COALESCE(e.dept_admin_ids, '{}'::BIGINT[]) AS scheduled_dept_admin_ids,
    COALESCE(cm.department_ids, emp_inv.department_ids, '{}'::BIGINT[]) AS management_department_ids,
    COALESCE(cm.dept_admin_ids, emp_inv.dept_admin_ids, '{}'::BIGINT[]) AS management_dept_admin_ids,
    cm.updated_at AS membership_updated_at,
    cm.admin_permissions AS membership_admin_permissions
  FROM public.employees e
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = e.user_id AND cm.org_id = p_org_id AND cm.archived_at IS NULL
  LEFT JOIN auth.users au
    ON au.id = e.user_id
  LEFT JOIN LATERAL (
    SELECT
      inv.email,
      COALESCE(inv.phone, '') AS phone,
      inv.role_to_assign,
      inv.department_ids,
      inv.dept_admin_ids,
      CASE
        WHEN inv.expires_at < NOW() THEN 'expired'
        ELSE 'pending'
      END AS invitation_status
    FROM public.invitations inv
    WHERE inv.employee_id = e.id
      AND inv.org_id = p_org_id
      AND inv.accepted_at IS NULL
      AND inv.revoked_at IS NULL
    ORDER BY inv.created_at DESC
    LIMIT 1
  ) emp_inv ON TRUE
  WHERE e.org_id = p_org_id
    AND e.archived_at IS NULL

  UNION ALL

  -- Active org members without a linked employee.
  SELECT
    ('u:' || cm2.user_id::TEXT) AS person_id,
    'user_only'::TEXT AS source,
    NULL::UUID AS employee_id,
    NULL::INTEGER AS employee_number,
    cm2.user_id AS user_id,
    p.first_name,
    p.last_name,
    au2.email::TEXT AS email,
    COALESCE(cm2.phone, '') AS phone,
    NULL::TEXT AS employee_status,
    cm2.org_role::TEXT AS org_role,
    TRUE AS has_app_access,
    '{}'::BIGINT[] AS focus_area_ids,
    NULL::BIGINT AS certification_id,
    '{}'::BIGINT[] AS role_ids,
    NULL::INTEGER AS seniority,
    au2.last_sign_in_at,
    NULL::TEXT AS invitation_status,
    '{}'::BIGINT[] AS scheduled_department_ids,
    '{}'::BIGINT[] AS scheduled_dept_admin_ids,
    cm2.department_ids AS management_department_ids,
    cm2.dept_admin_ids AS management_dept_admin_ids,
    cm2.updated_at AS membership_updated_at,
    cm2.admin_permissions AS membership_admin_permissions
  FROM public.organization_memberships cm2
  JOIN public.profiles p ON p.id = cm2.user_id
  JOIN auth.users au2 ON au2.id = cm2.user_id
  WHERE cm2.org_id = p_org_id
    AND cm2.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.employees emp
      WHERE emp.user_id = cm2.user_id
        AND emp.org_id = p_org_id
    )

  UNION ALL

  -- Pending app-only invitations with management assignments.
  SELECT
    ('inv:' || inv3.id::TEXT) AS person_id,
    'pending_invite'::TEXT AS source,
    NULL::UUID AS employee_id,
    NULL::INTEGER AS employee_number,
    NULL::UUID AS user_id,
    COALESCE(inv3.first_name, '') AS first_name,
    COALESCE(inv3.last_name, '') AS last_name,
    inv3.email,
    COALESCE(inv3.phone, '') AS phone,
    NULL::TEXT AS employee_status,
    inv3.role_to_assign::TEXT AS org_role,
    FALSE AS has_app_access,
    '{}'::BIGINT[] AS focus_area_ids,
    NULL::BIGINT AS certification_id,
    '{}'::BIGINT[] AS role_ids,
    NULL::INTEGER AS seniority,
    NULL::TIMESTAMPTZ AS last_sign_in_at,
    CASE WHEN inv3.expires_at < NOW() THEN 'expired' ELSE 'pending' END AS invitation_status,
    '{}'::BIGINT[] AS scheduled_department_ids,
    '{}'::BIGINT[] AS scheduled_dept_admin_ids,
    inv3.department_ids AS management_department_ids,
    inv3.dept_admin_ids AS management_dept_admin_ids,
    NULL::TIMESTAMPTZ AS membership_updated_at,
    NULL::JSONB AS membership_admin_permissions
  FROM public.invitations inv3
  WHERE inv3.org_id = p_org_id
    AND inv3.employee_id IS NULL
    AND inv3.accepted_at IS NULL
    AND inv3.revoked_at IS NULL

  ORDER BY seniority NULLS LAST, first_name, last_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_directory(UUID, INT, INT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- DEPARTMENT HIERARCHY VALIDATION TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Validate department_ids array values exist in departments table ───────────
-- Applied to: employees, organization_memberships, invitations
-- These tables use BIGINT[] arrays (no FK constraints possible), so we validate
-- via trigger that all referenced department IDs exist and are not archived.

CREATE OR REPLACE FUNCTION public.validate_department_ids()
RETURNS TRIGGER
LANGUAGE PLPGSQL AS $$
BEGIN
  IF NEW.department_ids != '{}' THEN
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.department_ids) AS did
      WHERE did NOT IN (SELECT id FROM public.departments WHERE archived_at IS NULL)
    ) THEN
      RAISE EXCEPTION 'Invalid department_ids: one or more department IDs do not exist or are archived';
    END IF;
  END IF;
  -- Auto-prune dept_admin_ids to stay a subset of department_ids
  IF NEW.dept_admin_ids != '{}' THEN
    NEW.dept_admin_ids := ARRAY(
      SELECT aid FROM unnest(NEW.dept_admin_ids) AS aid
      WHERE aid = ANY(NEW.department_ids)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_validate_dept_ids
  BEFORE INSERT OR UPDATE OF department_ids, dept_admin_ids ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_ids();

CREATE TRIGGER trg_memberships_validate_dept_ids
  BEFORE INSERT OR UPDATE OF department_ids, dept_admin_ids ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_ids();

CREATE TRIGGER trg_invitations_validate_dept_ids
  BEFORE INSERT OR UPDATE OF department_ids, dept_admin_ids ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_ids();


-- ── Validate focus_areas.department_id references a scheduled department ──────
-- Prevents linking a focus area to a management department.

CREATE OR REPLACE FUNCTION public.validate_focus_area_department()
RETURNS TRIGGER
LANGUAGE PLPGSQL AS $$
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.departments
      WHERE id = NEW.department_id AND type = 'scheduled'
    ) THEN
      RAISE EXCEPTION 'Focus areas can only belong to scheduled departments, not management departments';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_focus_areas_validate_dept_type
  BEFORE INSERT OR UPDATE OF department_id ON public.focus_areas
  FOR EACH ROW EXECUTE FUNCTION public.validate_focus_area_department();


-- ── Validate jobs placement references scheduled departments/focus areas ─────

CREATE OR REPLACE FUNCTION public.validate_job_placement()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.department_ids := COALESCE(NEW.department_ids, '{}'::BIGINT[]);
  NEW.focus_area_ids := COALESCE(NEW.focus_area_ids, '{}'::BIGINT[]);
  NEW.applicable_shift_ids := COALESCE(NEW.applicable_shift_ids, '{}'::BIGINT[]);

  -- Scheduled jobs inherit colors from shift_categories. Keep stored job color
  -- columns neutral unless this is a shiftless job where the job owns its color.
  IF NEW.assignment_mode <> 'shiftless' THEN
    NEW.color := '#E2E8F0';
    NEW.border_color := 'transparent';
    NEW.text_color := '#1E293B';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.department_ids) AS dept_ids(department_id)
    LEFT JOIN public.departments d ON d.id = dept_ids.department_id
    WHERE d.id IS NULL OR d.archived_at IS NOT NULL OR d.type <> 'scheduled'
  ) THEN
    RAISE EXCEPTION 'Jobs can only reference existing scheduled departments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.focus_area_ids) AS focus_area_ids(focus_area_id)
    LEFT JOIN public.focus_areas fa ON fa.id = focus_area_ids.focus_area_id
    WHERE fa.id IS NULL OR fa.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Jobs can only reference existing focus areas';
  END IF;

  IF array_length(NEW.department_ids, 1) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(NEW.focus_area_ids) AS focus_area_ids(focus_area_id)
    JOIN public.focus_areas fa ON fa.id = focus_area_ids.focus_area_id
    WHERE fa.department_id IS NULL OR NOT (fa.department_id = ANY(NEW.department_ids))
  ) THEN
    RAISE EXCEPTION 'Selected job focus areas must belong to the selected scheduled departments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.applicable_shift_ids) AS shift_ids(shift_id)
    LEFT JOIN public.shift_categories sc ON sc.id = shift_ids.shift_id
    WHERE sc.id IS NULL OR sc.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Jobs can only reference existing shifts';
  END IF;

  IF NEW.assignment_mode = 'shiftless' AND array_length(NEW.applicable_shift_ids, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Shiftless jobs cannot target specific shifts';
  END IF;

  IF (array_length(NEW.focus_area_ids, 1) IS NOT NULL OR array_length(NEW.department_ids, 1) IS NOT NULL)
     AND EXISTS (
      SELECT 1
      FROM unnest(NEW.applicable_shift_ids) AS shift_ids(shift_id)
      JOIN public.shift_categories sc ON sc.id = shift_ids.shift_id
      LEFT JOIN public.focus_areas fa ON fa.id = sc.focus_area_id
      WHERE sc.focus_area_id IS NULL
        OR (
          array_length(NEW.focus_area_ids, 1) IS NOT NULL
          AND NOT (sc.focus_area_id = ANY(NEW.focus_area_ids))
        )
        OR (
          array_length(NEW.focus_area_ids, 1) IS NULL
          AND array_length(NEW.department_ids, 1) IS NOT NULL
          AND (fa.department_id IS NULL OR NOT (fa.department_id = ANY(NEW.department_ids)))
        )
    ) THEN
    RAISE EXCEPTION 'Selected job shifts must belong to the selected placement';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_validate_placement
  BEFORE INSERT OR UPDATE OF assignment_mode, department_ids, focus_area_ids, applicable_shift_ids, color, border_color, text_color
  ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_placement();


-- Prunes job_shift_overrides rows that no longer match the job's placement
-- after department_ids/focus_area_ids/applicable_shift_ids change. Previously
-- (when overrides lived in JSONB on the same row) a placement change could
-- leave stale, invisible override keys behind with no cleanup at all.
CREATE OR REPLACE FUNCTION public.prune_invalid_job_shift_overrides()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.job_shift_overrides jso
  USING public.shift_categories sc
  LEFT JOIN public.focus_areas fa ON fa.id = sc.focus_area_id
  WHERE jso.job_id = NEW.id
    AND sc.id = jso.shift_id
    AND (
      sc.archived_at IS NOT NULL
      OR (
        array_length(NEW.applicable_shift_ids, 1) IS NOT NULL
        AND NOT (jso.shift_id = ANY(NEW.applicable_shift_ids))
      )
      OR (
        array_length(NEW.focus_area_ids, 1) IS NOT NULL
        AND (sc.focus_area_id IS NULL OR NOT (sc.focus_area_id = ANY(NEW.focus_area_ids)))
      )
      OR (
        array_length(NEW.focus_area_ids, 1) IS NULL
        AND array_length(NEW.department_ids, 1) IS NOT NULL
        AND (fa.department_id IS NULL OR NOT (fa.department_id = ANY(NEW.department_ids)))
      )
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_prune_invalid_shift_overrides
  AFTER UPDATE OF department_ids, focus_area_ids, applicable_shift_ids
  ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.prune_invalid_job_shift_overrides();


-- Validates job_shift_overrides rows: shift must be non-archived and belong
-- to the job's selected focus areas/departments (same rules that used to be
-- enforced against JSONB keys inside validate_job_placement()).
CREATE OR REPLACE FUNCTION public.validate_job_shift_override()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_job public.jobs;
  v_shift public.shift_categories;
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job override must reference an existing job';
  END IF;
  NEW.org_id := v_job.org_id;

  SELECT * INTO v_shift FROM public.shift_categories WHERE id = NEW.shift_id;
  IF v_shift.id IS NULL OR v_shift.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Job overrides can only reference existing shifts';
  END IF;

  IF array_length(v_job.focus_area_ids, 1) IS NOT NULL
     AND (v_shift.focus_area_id IS NULL OR NOT (v_shift.focus_area_id = ANY(v_job.focus_area_ids)))
  THEN
    RAISE EXCEPTION 'Job overrides must target shifts inside the selected placement';
  ELSIF array_length(v_job.focus_area_ids, 1) IS NULL
        AND array_length(v_job.department_ids, 1) IS NOT NULL
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.focus_areas fa
      WHERE fa.id = v_shift.focus_area_id AND fa.department_id = ANY(v_job.department_ids)
    ) THEN
      RAISE EXCEPTION 'Job overrides must target shifts inside the selected placement';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_shift_overrides_validate
  BEFORE INSERT OR UPDATE ON public.job_shift_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_job_shift_override();


-- Replaces a job's full set of shift time/color overrides in one call.
-- Accepts the same JSONB-map shape the client already builds
-- ({ [shiftId]: { startTime, endTime } } / { [shiftId]: color }), so no
-- client-side changes are needed — only the storage moved to a real table.
CREATE OR REPLACE FUNCTION public.set_job_shift_overrides(
  p_job_id BIGINT,
  p_time_overrides JSONB DEFAULT '{}'::jsonb,
  p_color_overrides JSONB DEFAULT '{}'::jsonb,
  p_actor_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID;
  -- check_admin_permission_for_org() reads auth.uid()/auth.jwt(), which are
  -- empty when this RPC is invoked via a service-role client (no JWT
  -- context) — accept an explicit actor id for that case, same pattern as
  -- publish_schedule().
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  v_is_gridmaster BOOLEAN := FALSE;
  v_org_role public.org_role := 'user'::public.org_role;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing actor identity';
  END IF;

  SELECT org_id INTO v_org_id FROM public.jobs WHERE id = p_job_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor_id AND platform_role = 'gridmaster'
  ) INTO v_is_gridmaster;

  SELECT COALESCE(
    (SELECT cm.org_role FROM public.organization_memberships cm
     WHERE cm.user_id = v_actor_id AND cm.org_id = v_org_id AND cm.archived_at IS NULL LIMIT 1),
    'user'::public.org_role
  ) INTO v_org_role;

  IF NOT (v_is_gridmaster OR v_org_role::TEXT IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to manage schedule definitions';
  END IF;

  IF v_org_role::TEXT = 'admin' AND NOT v_is_gridmaster THEN
    IF NOT COALESCE(
      (SELECT (cm.admin_permissions->>'canManageScheduleDefinitions')::BOOLEAN
       FROM public.organization_memberships cm
       WHERE cm.user_id = v_actor_id AND cm.org_id = v_org_id AND cm.archived_at IS NULL),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to manage schedule definitions';
    END IF;
  END IF;

  -- Remove overrides for shifts no longer present in either map.
  DELETE FROM public.job_shift_overrides jso
  WHERE jso.job_id = p_job_id
    AND jso.shift_id::TEXT NOT IN (
      SELECT jsonb_object_keys(p_time_overrides)
      UNION
      SELECT jsonb_object_keys(p_color_overrides)
    );

  -- Upsert one row per shift_id present in either map.
  INSERT INTO public.job_shift_overrides (job_id, org_id, shift_id, start_time, end_time, color)
  SELECT
    p_job_id,
    v_org_id,
    shift_ids.shift_id,
    NULLIF(p_time_overrides -> shift_ids.shift_id::TEXT ->> 'startTime', '')::TIME,
    NULLIF(p_time_overrides -> shift_ids.shift_id::TEXT ->> 'endTime', '')::TIME,
    NULLIF(p_color_overrides ->> shift_ids.shift_id::TEXT, '')
  FROM (
    SELECT jsonb_object_keys(p_time_overrides)::BIGINT AS shift_id
    UNION
    SELECT jsonb_object_keys(p_color_overrides)::BIGINT AS shift_id
  ) shift_ids
  ON CONFLICT (job_id, shift_id) DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    color = EXCLUDED.color,
    updated_at = now();

  -- Drop rows that ended up with no override data at all (mirrors the
  -- client's normalizeShiftTimeOverrides/normalizeShiftColorOverrides
  -- dropping empty entries).
  DELETE FROM public.job_shift_overrides
  WHERE job_id = p_job_id
    AND start_time IS NULL AND end_time IS NULL AND color IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_job_shift_overrides(BIGINT, JSONB, JSONB, UUID) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- NORMALIZED SCHEDULE CELLS
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.sync_schedule_cell_snapshot(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[], BOOLEAN[]);
DROP FUNCTION IF EXISTS public.sync_schedule_cell_snapshot(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[]);
DROP FUNCTION IF EXISTS public.move_shift(UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.write_schedule_cell_snapshot(UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.write_schedule_cell_snapshot(UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.write_schedule_cell_snapshot_internal(UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, UUID);
DROP FUNCTION IF EXISTS public.write_schedule_cell_snapshot_internal(UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, UUID);

CREATE OR REPLACE FUNCTION public.sync_schedule_cell_snapshot(
  p_cell_id UUID,
  p_org_id UUID,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_absence_type_id BIGINT,
  p_custom_start_time TEXT,
  p_custom_end_time TEXT,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_segment_count INTEGER;
  v_index INTEGER;
BEGIN
  IF p_state_kind IS NULL THEN
    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = p_cell_id
      AND snapshot_kind = p_snapshot_kind;
    RETURN;
  END IF;

  INSERT INTO public.schedule_cell_snapshots (
    cell_id,
    org_id,
    snapshot_kind,
    state_kind,
    absence_type_id,
    custom_start_time,
    custom_end_time
  )
  VALUES (
    p_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    p_absence_type_id,
    p_custom_start_time,
    p_custom_end_time
  )
  ON CONFLICT (cell_id, snapshot_kind)
  DO UPDATE SET
    org_id = EXCLUDED.org_id,
    state_kind = EXCLUDED.state_kind,
    absence_type_id = EXCLUDED.absence_type_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time,
    updated_at = now()
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.schedule_cell_segments
  WHERE snapshot_id = v_snapshot_id;

  IF p_state_kind <> 'worked' THEN
    RETURN;
  END IF;

  v_segment_count := COALESCE(array_length(p_job_ids, 1), 0);
  IF v_segment_count <= 0 THEN
    RETURN;
  END IF;

  FOR v_index IN 1..v_segment_count LOOP
    INSERT INTO public.schedule_cell_segments (
      snapshot_id,
      org_id,
      position,
      shift_id,
      job_id,
      is_mentored
    )
    VALUES (
      v_snapshot_id,
      p_org_id,
      v_index - 1,
      p_shift_ids[v_index],
      p_job_ids[v_index],
      COALESCE(p_is_mentored_flags[v_index], false)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_schedule_cell_snapshot_payload(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT
)
RETURNS TABLE (
  cell_id UUID,
  org_id UUID,
  emp_id UUID,
  date DATE,
  version BIGINT,
  focus_area_id BIGINT,
  series_id UUID,
  from_recurring BOOLEAN,
  state_kind TEXT,
  absence_type_id BIGINT,
  custom_start_time TEXT,
  custom_end_time TEXT,
  shift_ids BIGINT[],
  job_ids BIGINT[],
  is_mentored_flags BOOLEAN[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH aggregated_segments AS (
    SELECT
      c.id AS cell_id,
      c.org_id,
      c.emp_id,
      c.date,
      c.version,
      c.focus_area_id,
      c.series_id,
      c.from_recurring,
      snapshot.state_kind,
      snapshot.absence_type_id,
      snapshot.custom_start_time,
      snapshot.custom_end_time,
      COALESCE(
        array_agg(segments.shift_id ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BIGINT[]
      ) AS shift_ids,
      COALESCE(
        array_agg(segments.job_id ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BIGINT[]
      ) AS job_ids,
      COALESCE(
        array_agg(segments.is_mentored ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BOOLEAN[]
      ) AS is_mentored_flags
    FROM public.schedule_cells c
    JOIN public.schedule_cell_snapshots snapshot
      ON snapshot.cell_id = c.id
     AND snapshot.snapshot_kind = p_snapshot_kind
    LEFT JOIN public.schedule_cell_segments segments
      ON segments.snapshot_id = snapshot.id
    WHERE c.org_id = p_org_id
      AND c.emp_id = p_emp_id
      AND c.date = p_date
    GROUP BY
      c.id,
      c.org_id,
      c.emp_id,
      c.date,
      c.version,
      c.focus_area_id,
      c.series_id,
      c.from_recurring,
      snapshot.id,
      snapshot.state_kind,
      snapshot.absence_type_id,
      snapshot.custom_start_time,
      snapshot.custom_end_time
  )
  SELECT
    aggregated_segments.cell_id,
    aggregated_segments.org_id,
    aggregated_segments.emp_id,
    aggregated_segments.date,
    aggregated_segments.version,
    aggregated_segments.focus_area_id,
    aggregated_segments.series_id,
    aggregated_segments.from_recurring,
    aggregated_segments.state_kind,
    aggregated_segments.absence_type_id,
    aggregated_segments.custom_start_time,
    aggregated_segments.custom_end_time,
    aggregated_segments.shift_ids,
    aggregated_segments.job_ids,
    aggregated_segments.is_mentored_flags
  FROM aggregated_segments;
$$;

CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_next_version BIGINT;
  v_cell_id UUID;
  v_actor_id UUID := auth.uid();
BEGIN
  IF p_snapshot_kind NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid snapshot kind: %', p_snapshot_kind;
  END IF;

  IF p_state_kind NOT IN ('worked', 'absence', 'deleted') THEN
    RAISE EXCEPTION 'Invalid state kind: %', p_state_kind;
  END IF;

  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_state_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked snapshots must include at least one segment';
  END IF;

  IF p_state_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence snapshots must include an absence type';
  END IF;

  IF p_state_kind IN ('absence', 'deleted') AND (
    COALESCE(array_length(p_shift_ids, 1), 0) > 0
    OR COALESCE(array_length(p_job_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Only worked snapshots may include segments';
  END IF;

  IF p_state_kind = 'worked' THEN
    PERFORM public.assert_non_overlapping_work_assignment_times(
      p_org_id,
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start_time,
      p_custom_end_time
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, v_cell.version;
    END IF;

    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        series_id = COALESCE(p_series_id, schedule_cells.series_id),
        from_recurring = CASE
          WHEN p_from_recurring IS TRUE THEN TRUE
          ELSE schedule_cells.from_recurring
        END,
        focus_area_id = COALESCE(p_focus_area_id, schedule_cells.focus_area_id),
        updated_by = v_actor_id,
        updated_at = now()
    WHERE id = v_cell.id
    RETURNING id INTO v_cell_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, NULL;
    END IF;

    v_next_version := 0;

    INSERT INTO public.schedule_cells (
      org_id,
      emp_id,
      date,
      focus_area_id,
      version,
      series_id,
      from_recurring,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_emp_id,
      p_date,
      p_focus_area_id,
      0,
      p_series_id,
      p_from_recurring,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_cell_id;
  END IF;

  PERFORM public.sync_schedule_cell_snapshot(
    v_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    CASE
      WHEN p_state_kind = 'absence' THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END
  );

  RETURN v_next_version;
END;
$$;

-- NOT granted to authenticated: this takes a raw p_org_id and, being SECURITY
-- DEFINER, consults no RLS and no caller_org_id(), so a direct RPC call was a
-- read of any org's schedule cells for anyone holding the UUIDs. It is an
-- internal: ~23 SQL callers reach it from inside other SECURITY DEFINER
-- functions (which run as the owner, so the revoke does not affect them), and
-- the only TypeScript caller uses the service client. See the revoke in 004,
-- which is where it has to live to survive that file's blanket grant.
GRANT EXECUTE ON FUNCTION public.write_schedule_cell_snapshot(UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, BOOLEAN[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot_internal(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_next_version BIGINT;
  v_cell_id UUID;
  v_actor_id UUID := COALESCE(p_actor_id, auth.uid());
BEGIN
  IF p_snapshot_kind NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid snapshot kind: %', p_snapshot_kind;
  END IF;

  IF p_state_kind NOT IN ('worked', 'absence', 'deleted') THEN
    RAISE EXCEPTION 'Invalid state kind: %', p_state_kind;
  END IF;

  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_state_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked snapshots must include at least one segment';
  END IF;

  IF p_state_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence snapshots must include an absence type';
  END IF;

  IF p_state_kind IN ('absence', 'deleted') AND (
    COALESCE(array_length(p_shift_ids, 1), 0) > 0
    OR COALESCE(array_length(p_job_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Only worked snapshots may include segments';
  END IF;

  IF p_state_kind = 'worked' THEN
    PERFORM public.assert_non_overlapping_work_assignment_times(
      p_org_id,
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start_time,
      p_custom_end_time
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, v_cell.version;
    END IF;

    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        series_id = COALESCE(p_series_id, schedule_cells.series_id),
        from_recurring = CASE
          WHEN p_from_recurring IS TRUE THEN TRUE
          ELSE schedule_cells.from_recurring
        END,
        focus_area_id = COALESCE(p_focus_area_id, schedule_cells.focus_area_id),
        updated_by = v_actor_id,
        updated_at = now()
    WHERE id = v_cell.id
    RETURNING id INTO v_cell_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, NULL;
    END IF;

    v_next_version := 0;

    INSERT INTO public.schedule_cells (
      org_id,
      emp_id,
      date,
      focus_area_id,
      version,
      series_id,
      from_recurring,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_emp_id,
      p_date,
      p_focus_area_id,
      0,
      p_series_id,
      p_from_recurring,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_cell_id;
  END IF;

  PERFORM public.sync_schedule_cell_snapshot(
    v_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    CASE
      WHEN p_state_kind = 'absence' THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END
  );

  RETURN v_next_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_empty_schedule_cell(
  p_cell_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.schedule_cells
  WHERE id = p_cell_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.schedule_cell_snapshots snapshots
      WHERE snapshots.cell_id = p_cell_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_schedule_cell_draft(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_expected_version BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_has_published BOOLEAN := FALSE;
  v_next_version BIGINT := 0;
BEGIN
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_cell.version;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_cell_snapshots snapshot
    WHERE snapshot.cell_id = v_cell.id
      AND snapshot.snapshot_kind = 'published'
  )
  INTO v_has_published;

  IF v_has_published THEN
    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = v_cell.id;

    PERFORM public.sync_schedule_cell_snapshot(
      v_cell.id,
      p_org_id,
      'draft',
      'deleted',
      NULL,
      NULL,
      NULL,
      '{}'::BIGINT[],
      '{}'::BIGINT[],
      '{}'::BOOLEAN[]
    );

    RETURN v_next_version;
  END IF;

  DELETE FROM public.schedule_cells
  WHERE id = v_cell.id;

  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_schedule_cell_draft(UUID, UUID, DATE, BIGINT) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- ONBOARDING
-- ══════════════════════════════════════════════════════════════════════════════

-- Lets any authenticated user mark their own onboarding as completed.
-- SECURITY DEFINER so it bypasses RLS (users can't UPDATE memberships directly).
-- Idempotent: if onboarding is already complete (or the user has no row), the
-- call is a no-op rather than an error, so a stale Skip click never blocks the
-- user from leaving the wizard.
CREATE OR REPLACE FUNCTION public.complete_onboarding(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_memberships
  SET onboarding_completed_at = NOW()
  WHERE user_id = auth.uid()
    AND org_id = p_org_id
    AND onboarding_completed_at IS NULL;
END;
$$;

-- Mark a tooltip tour as completed for the current user in the given org.
-- SECURITY DEFINER so it bypasses RLS (same pattern as complete_onboarding).
CREATE OR REPLACE FUNCTION public.complete_tooltip_tour(p_org_id UUID, p_page_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_memberships
  SET tooltip_tours_completed = tooltip_tours_completed || jsonb_build_object(p_page_key, now())
  WHERE user_id = auth.uid()
    AND org_id = p_org_id;
END;
$$;
