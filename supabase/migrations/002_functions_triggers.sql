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


CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;


CREATE OR REPLACE FUNCTION public.caller_org_role()
RETURNS public.org_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(cm.org_role, 'user'::public.org_role)
  FROM public.profiles p
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = p.id AND cm.org_id = p.org_id AND cm.archived_at IS NULL
  WHERE p.id = auth.uid();
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

  -- Check for active JWT refresh lock (role change, org switch, etc.)
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
        'message', 'Your session has expired. Please sign in again.'
      )
    );
  END IF;

  -- Clean up any expired locks
  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  -- Resolve user profile with org context.
  -- Archived orgs are filtered out (AND o.archived_at IS NULL).
  -- Suspended orgs are filtered out (AND o.suspended_at IS NULL).
  -- Deactivated users get no org claims (AND p.deactivated_at IS NULL on membership join).
  -- org_role is NOT coalesced — a NULL value means no membership exists,
  -- which must result in no org claims being set (prevents read access
  -- to an org the user has no membership for).
  SELECT
    p.org_id,
    p.platform_role::TEXT  AS platform_role,
    cm.org_role::TEXT       AS org_role,
    o.slug                 AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = p.id AND cm.org_id = p.org_id AND cm.archived_at IS NULL
  LEFT JOIN public.organizations o
    ON o.id = p.org_id AND o.archived_at IS NULL AND o.suspended_at IS NULL
  WHERE p.id = uid
    AND p.deactivated_at IS NULL;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}', to_jsonb(COALESCE(user_profile.platform_role, 'none')));

    IF user_profile.org_id IS NOT NULL
       AND user_profile.org_role IS NOT NULL
       AND user_profile.org_slug IS NOT NULL THEN
      -- Valid membership + active org → set full org claims
      claims := jsonb_set(claims, '{org_role}',  to_jsonb(user_profile.org_role));
      claims := jsonb_set(claims, '{org_id}',    to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}',  to_jsonb(user_profile.org_slug));
    ELSE
      -- No membership, no org, or archived org → strip org context.
      -- Explicit removal prevents stale org_id/org_slug from persisting
      -- if the auth server carries forward claims from the previous token.
      claims := jsonb_set(claims, '{org_role}', '"user"');
      claims := claims - 'org_id' - 'org_slug';
    END IF;
    -- Track last sign-in (debounced to avoid writes on every token refresh)
    UPDATE public.profiles
       SET last_sign_in_at = NOW()
     WHERE id = uid
       AND (last_sign_in_at IS NULL OR last_sign_in_at < NOW() - INTERVAL '5 minutes');
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
    claims := claims - 'org_id' - 'org_slug';
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

-- shifts updated_at trigger (separate from audit)
CREATE OR REPLACE FUNCTION public.update_shifts_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
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

-- Certification delete → remove from shift_codes.required_certification_ids
CREATE OR REPLACE FUNCTION public.remove_certification_from_shift_codes()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE public.shift_codes
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
      target_user_id, changed_by_id, from_role, to_role,
      change_type, permissions_before, permissions_after, idempotency_key
    ) VALUES (
      NEW.user_id, auth.uid(), NEW.org_role::TEXT, NEW.org_role::TEXT,
      'permission_change', OLD.admin_permissions, NEW.admin_permissions,
      'perm-' || NEW.user_id || '-' || extract(epoch from NOW())::TEXT
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

CREATE TRIGGER trigger_shift_codes_audit
  BEFORE INSERT OR UPDATE ON public.shift_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_absence_types_audit
  BEFORE INSERT OR UPDATE ON public.absence_types
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_shifts_audit
  BEFORE INSERT OR UPDATE ON public.shifts
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

CREATE TRIGGER trigger_coverage_rule_configs_audit
  BEFORE INSERT OR UPDATE ON public.coverage_rule_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_coverage_rule_config_codes_audit
  BEFORE INSERT OR UPDATE ON public.coverage_rule_config_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_indicator_types_audit
  BEFORE INSERT OR UPDATE ON public.indicator_types
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- Shifts updated_at (fires in addition to audit trigger)
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_shifts_updated_at();

CREATE TRIGGER trigger_org_memberships_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trigger_invitations_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cascade triggers
CREATE TRIGGER trg_certifications_delete_cascade
  AFTER DELETE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.remove_certification_from_shift_codes();

CREATE TRIGGER trg_log_permission_change
  AFTER UPDATE OF admin_permissions ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE TRIGGER trg_membership_deleted
  AFTER DELETE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.on_membership_deleted();

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

  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND p_new_role IN ('gridmaster', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin, super_admin, or gridmaster';
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
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds', reason = 'role_change';

  RETURN jsonb_build_object('status', 'success', 'from_role', v_old_role, 'to_role', p_new_role);
END;
$$;

COMMENT ON FUNCTION public.change_user_role IS 'Race-condition-safe role change RPC. Verifies caller identity via auth.uid(), gates on admin/super_admin/gridmaster, enforces org scoping (explicit p_org_id or fallback to target profiles.org_id), and prevents admin self-promotion.';


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

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  INSERT INTO public.profiles (id, platform_role)
  VALUES (target_user_id, 'gridmaster')
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster',
        updated_at    = NOW();
END;
$$;


-- ── switch_org ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.switch_org(target_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();

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

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = target_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  UPDATE public.profiles
  SET org_id = target_org_id, updated_at = NOW()
  WHERE id = v_uid;

  -- No jwt_refresh_lock here: the caller refreshes immediately after this RPC,
  -- and the JWT hook reads profiles.org_id from DB so the new claims resolve
  -- correctly. A lock would block the caller's own refreshSession() call.
  -- Other tabs/devices pick up the new org on their next natural token refresh.
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_org(UUID) TO authenticated;


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
  v_active_oid UUID;
BEGIN
  v_uid := auth.uid();

  SELECT p.org_id INTO v_active_oid
  FROM public.profiles p WHERE p.id = v_uid;

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
  WHERE cm.user_id = v_uid ORDER BY o.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;


-- ── publish_schedule ──────────────────────────────────────────────────────────

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

  -- Capture shift changes BEFORE applying them (includes absence type + custom time changes)
  FOR r IN
    SELECT s.emp_id, s.date,
           s.published_shift_code_ids AS old_ids,
           s.draft_shift_code_ids AS new_ids,
           s.published_absence_type_id AS old_absence_type_id,
           s.draft_absence_type_id AS new_absence_type_id,
           s.draft_is_delete,
           s.updated_by,
           s.published_custom_start_time AS old_custom_start,
           s.published_custom_end_time AS old_custom_end,
           s.draft_custom_start_time AS new_custom_start,
           s.draft_custom_end_time AS new_custom_end
    FROM public.shifts s
    WHERE s.org_id = p_org_id
      AND s.date >= p_start_date AND s.date <= p_end_date
      AND (
        (s.draft_is_delete = TRUE AND (
          array_length(s.published_shift_code_ids, 1) IS NOT NULL
          OR s.published_absence_type_id IS NOT NULL
        ))
        OR (array_length(s.draft_shift_code_ids, 1) IS NOT NULL
            AND s.draft_shift_code_ids IS DISTINCT FROM s.published_shift_code_ids)
        OR (s.draft_absence_type_id IS NOT NULL
            AND s.draft_absence_type_id IS DISTINCT FROM s.published_absence_type_id)
        OR (s.draft_absence_type_id IS NULL AND s.published_absence_type_id IS NOT NULL
            AND s.draft_is_delete = FALSE AND array_length(s.draft_shift_code_ids, 1) IS NOT NULL)
        OR (s.draft_custom_start_time IS DISTINCT FROM s.published_custom_start_time
            AND s.draft_custom_start_time IS NOT NULL)
        OR (s.draft_custom_end_time IS DISTINCT FROM s.published_custom_end_time
            AND s.draft_custom_end_time IS NOT NULL)
      )
  LOOP
    v_change_count := v_change_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'empId', r.emp_id,
      'date', r.date,
      'kind', CASE
        WHEN r.draft_is_delete THEN 'deleted'
        WHEN array_length(r.old_ids, 1) IS NULL AND r.old_absence_type_id IS NULL THEN 'new'
        ELSE 'modified'
      END,
      'from', COALESCE(to_jsonb(r.old_ids), '[]'::JSONB),
      'to', CASE WHEN r.draft_is_delete THEN '[]'::JSONB ELSE COALESCE(to_jsonb(r.new_ids), '[]'::JSONB) END,
      'fromAbsenceTypeId', r.old_absence_type_id,
      'toAbsenceTypeId', CASE WHEN r.draft_is_delete THEN NULL ELSE r.new_absence_type_id END,
      'updatedBy', r.updated_by,
      'fromCustomStart', r.old_custom_start,
      'fromCustomEnd', r.old_custom_end,
      'toCustomStart', CASE WHEN r.draft_is_delete THEN NULL ELSE r.new_custom_start END,
      'toCustomEnd', CASE WHEN r.draft_is_delete THEN NULL ELSE r.new_custom_end END
    ));
  END LOOP;

  -- Count note changes
  SELECT COUNT(*) INTO v_note_new FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft';
  SELECT COUNT(*) INTO v_note_deleted FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft_deleted';

  v_change_count := v_change_count + v_note_new + v_note_deleted;

  -- Insert publish_history record
  INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count, changes)
  VALUES (p_org_id, v_actor_id, p_start_date, p_end_date, v_change_count, v_changes)
  RETURNING id INTO v_history_id;

  -- Promote drafts → published (shift codes, absence types, and custom times)
  -- Shift codes and absence types are mutually exclusive. When one is promoted,
  -- the other must be cleared to satisfy the shifts_code_or_absence_not_both
  -- constraint and to keep published state consistent.
  UPDATE public.shifts
  SET published_shift_code_ids = CASE
        WHEN draft_absence_type_id IS NOT NULL THEN '{}'::BIGINT[]
        WHEN array_length(draft_shift_code_ids, 1) IS NOT NULL THEN draft_shift_code_ids
        ELSE published_shift_code_ids
      END,
      published_absence_type_id = CASE
        WHEN array_length(draft_shift_code_ids, 1) IS NOT NULL THEN NULL
        WHEN draft_absence_type_id IS NOT NULL THEN draft_absence_type_id
        ELSE published_absence_type_id
      END,
      published_custom_start_time = COALESCE(draft_custom_start_time, published_custom_start_time),
      published_custom_end_time = COALESCE(draft_custom_end_time, published_custom_end_time),
      draft_shift_code_ids = '{}',
      draft_absence_type_id = NULL,
      draft_custom_start_time = NULL,
      draft_custom_end_time = NULL,
      draft_is_delete = FALSE,
      version = version + 1,
      updated_at = NOW(),
      updated_by = v_actor_id
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND draft_is_delete = FALSE
    AND (array_length(draft_shift_code_ids, 1) IS NOT NULL
         OR draft_absence_type_id IS NOT NULL
         OR draft_custom_start_time IS NOT NULL
         OR draft_custom_end_time IS NOT NULL);

  -- Handle draft-deletes
  DELETE FROM public.shifts
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND draft_is_delete = TRUE;

  -- Clean up empty rows (no shift codes, no absence types, no custom times, not a draft-delete)
  DELETE FROM public.shifts
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND (published_shift_code_ids IS NULL OR array_length(published_shift_code_ids, 1) IS NULL)
    AND (draft_shift_code_ids IS NULL OR array_length(draft_shift_code_ids, 1) IS NULL)
    AND published_absence_type_id IS NULL
    AND draft_absence_type_id IS NULL
    AND published_custom_start_time IS NULL
    AND published_custom_end_time IS NULL
    AND draft_is_delete = FALSE;

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

CREATE OR REPLACE FUNCTION public.move_shift(
  p_org_id            UUID,
  p_source_emp_id     UUID,
  p_source_date       DATE,
  p_target_emp_id     UUID,
  p_target_date       DATE,
  p_shift_code_ids    BIGINT[],
  p_absence_type_id   BIGINT DEFAULT NULL,
  p_drag_mode         TEXT DEFAULT 'move',
  p_expected_version  BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_shift  RECORD;
  v_lock_key_src  TEXT;
  v_lock_key_tgt  TEXT;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission('canEditShifts') THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  -- Org scoping: caller must belong to p_org_id (gridmaster exempt)
  IF NOT public.is_gridmaster() AND public.caller_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_drag_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Invalid drag mode: %', p_drag_mode;
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

  -- Validate source shift exists and belongs to org
  SELECT * INTO v_source_shift FROM public.shifts
  WHERE emp_id = p_source_emp_id AND date = p_source_date AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source shift not found';
  END IF;

  IF p_absence_type_id IS NOT NULL AND array_length(COALESCE(p_shift_code_ids, '{}'::BIGINT[]), 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot move both shift codes and an absence type';
  END IF;

  -- Optimistic lock check
  IF p_expected_version IS NOT NULL AND v_source_shift.version != p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_source_shift.version;
  END IF;

  -- Create at target (upsert) — custom times go to draft columns
  INSERT INTO public.shifts (
    emp_id, date, org_id, draft_shift_code_ids, draft_absence_type_id, draft_is_delete,
    draft_custom_start_time, draft_custom_end_time, focus_area_id,
    created_by, updated_by
  ) VALUES (
    p_target_emp_id,
    p_target_date,
    p_org_id,
    CASE
      WHEN p_absence_type_id IS NOT NULL THEN '{}'::BIGINT[]
      ELSE COALESCE(p_shift_code_ids, '{}'::BIGINT[])
    END,
    p_absence_type_id,
    false,
    CASE
      WHEN p_absence_type_id IS NOT NULL THEN NULL
      ELSE COALESCE(v_source_shift.draft_custom_start_time, v_source_shift.published_custom_start_time)
    END,
    CASE
      WHEN p_absence_type_id IS NOT NULL THEN NULL
      ELSE COALESCE(v_source_shift.draft_custom_end_time, v_source_shift.published_custom_end_time)
    END,
    v_source_shift.focus_area_id,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (emp_id, date) DO UPDATE SET
    draft_shift_code_ids     = EXCLUDED.draft_shift_code_ids,
    draft_absence_type_id    = EXCLUDED.draft_absence_type_id,
    draft_is_delete          = false,
    draft_custom_start_time  = EXCLUDED.draft_custom_start_time,
    draft_custom_end_time    = EXCLUDED.draft_custom_end_time,
    focus_area_id            = EXCLUDED.focus_area_id,
    updated_by               = auth.uid(),
    version                  = shifts.version + 1;

  -- Delete source only for real moves. Copies leave the origin untouched.
  IF p_drag_mode = 'move' THEN
    IF (v_source_shift.published_shift_code_ids IS NOT NULL
        AND array_length(v_source_shift.published_shift_code_ids, 1) > 0)
       OR v_source_shift.published_absence_type_id IS NOT NULL THEN
      UPDATE public.shifts
      SET draft_shift_code_ids = '{}', draft_absence_type_id = NULL,
          draft_is_delete = true,
          updated_by = auth.uid(), version = version + 1
      WHERE emp_id = p_source_emp_id AND date = p_source_date;
    ELSE
      DELETE FROM public.shifts
      WHERE emp_id = p_source_emp_id AND date = p_source_date;
    END IF;
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_shift(UUID, UUID, DATE, UUID, DATE, BIGINT[], BIGINT, TEXT, BIGINT) TO authenticated;


-- ── series shift bulk editors ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_series_all_shifts(
  p_series_id UUID,
  p_new_shift_code_id BIGINT,
  p_org_id UUID,
  p_new_absence_type_id BIGINT DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.check_admin_permission('canEditShifts') THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_gridmaster() AND public.caller_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_new_shift_code_id IS NULL AND p_new_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'A series update must provide either a shift code or an absence type';
  END IF;

  UPDATE public.shifts
  SET draft_shift_code_ids = CASE
        WHEN p_new_absence_type_id IS NOT NULL THEN '{}'::BIGINT[]
        ELSE ARRAY[p_new_shift_code_id]
      END,
      draft_absence_type_id = CASE
        WHEN p_new_absence_type_id IS NOT NULL THEN p_new_absence_type_id
        ELSE NULL
      END,
      draft_is_delete = FALSE,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND series_id = p_series_id;

  UPDATE public.shift_series
  SET shift_code_id = CASE
        WHEN p_new_absence_type_id IS NOT NULL THEN NULL
        ELSE p_new_shift_code_id
      END,
      absence_type_id = CASE
        WHEN p_new_absence_type_id IS NOT NULL THEN p_new_absence_type_id
        ELSE NULL
      END,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND id = p_series_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_series_all_shifts(UUID, BIGINT, UUID, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_shift_series(
  p_series_id UUID,
  p_org_id UUID
) RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  IF NOT public.check_admin_permission('canEditShifts') THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_gridmaster() AND public.caller_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  UPDATE public.shifts
  SET draft_is_delete = TRUE,
      draft_shift_code_ids = '{}',
      draft_absence_type_id = NULL,
      series_id = NULL,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND series_id = p_series_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  UPDATE public.shift_series
  SET archived_at = NOW(),
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE org_id = p_org_id
    AND id = p_series_id;

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
  p_shift_code_id BIGINT DEFAULT NULL,
  p_absence_type_id BIGINT DEFAULT NULL,
  p_effective_from DATE DEFAULT CURRENT_DATE
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_recurring_shift_id UUID;
BEGIN
  IF NOT public.check_admin_permission('canManageRecurringShifts') THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageRecurringShifts permission';
  END IF;

  IF NOT public.is_gridmaster() AND public.caller_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_day_of_week < 0 OR p_day_of_week > 6 THEN
    RAISE EXCEPTION 'Invalid day_of_week: must be between 0 and 6';
  END IF;

  IF (p_shift_code_id IS NULL AND p_absence_type_id IS NULL)
     OR (p_shift_code_id IS NOT NULL AND p_absence_type_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Recurring shift must specify exactly one of shift_code_id or absence_type_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Employee not found in this organization';
  END IF;

  IF p_shift_code_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shift_codes sc
    WHERE sc.id = p_shift_code_id
      AND sc.org_id = p_org_id
      AND sc.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Shift code not found in this organization';
  END IF;

  IF p_absence_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.absence_types at
    WHERE at.id = p_absence_type_id
      AND at.org_id = p_org_id
      AND at.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Absence type not found in this organization';
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
    shift_code_id,
    absence_type_id,
    effective_from,
    effective_until
  ) VALUES (
    p_emp_id,
    p_org_id,
    p_day_of_week,
    CASE
      WHEN p_absence_type_id IS NOT NULL THEN NULL
      ELSE p_shift_code_id
    END,
    CASE
      WHEN p_absence_type_id IS NOT NULL THEN p_absence_type_id
      ELSE NULL
    END,
    COALESCE(p_effective_from, CURRENT_DATE),
    NULL
  )
  RETURNING id INTO v_recurring_shift_id;

  RETURN v_recurring_shift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_recurring_shift(UUID, UUID, SMALLINT, BIGINT, BIGINT, DATE) TO authenticated;


-- ── apply_recurring_schedules (server-side, DST-safe) ────────────────────────
-- Fills empty schedule slots from recurring shift templates.
-- Uses PostgreSQL DATE arithmetic (immune to DST issues).
-- Reads fresh data from DB (no stale client-side closures).

CREATE OR REPLACE FUNCTION public.apply_recurring_schedules(
  p_org_id     UUID,
  p_start_date DATE,
  p_end_date   DATE
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current   DATE;
  v_inserted  INTEGER := 0;
  v_results   JSONB := '[]'::JSONB;
  r           RECORD;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission('canApplyRecurringSchedule') THEN
    RAISE EXCEPTION 'Unauthorized: missing canApplyRecurringSchedule permission';
  END IF;

  -- Validate org scoping
  IF NOT public.is_gridmaster() AND public.caller_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  -- Iterate dates using pure DATE arithmetic (DST-safe)
  v_current := p_start_date;
  WHILE v_current <= p_end_date LOOP
    -- A row only blocks autofill when the scheduler grid would currently show
    -- a live assignment there. Draft-deleted rows should be treated as empty so
    -- the server-side fill behavior matches the grid the user sees.
    -- ── Shift-code recurring templates ──
    -- For each active recurring shift template matching this day-of-week,
    -- pick the most recent effectiveFrom per employee (DISTINCT ON + ORDER BY DESC)
    FOR r IN
      SELECT DISTINCT ON (rs.emp_id)
        rs.emp_id, rs.shift_code_id, sc.label AS shift_label,
        NULL::BIGINT AS absence_type_id, NULL::TEXT AS absence_label
      FROM public.recurring_shifts rs
      JOIN public.shift_codes sc
        ON sc.id = rs.shift_code_id AND sc.archived_at IS NULL
      WHERE rs.org_id = p_org_id
        AND rs.archived_at IS NULL
        AND rs.shift_code_id IS NOT NULL
        AND rs.day_of_week = EXTRACT(DOW FROM v_current)::INTEGER
        AND rs.effective_from <= v_current
        AND (rs.effective_until IS NULL OR rs.effective_until >= v_current)
        -- Only for employees whose grid cell is effectively empty on this date
        AND NOT EXISTS (
          SELECT 1 FROM public.shifts s
          WHERE s.emp_id = rs.emp_id
            AND s.date = v_current
            AND (
              (
                (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                  OR s.draft_is_delete = TRUE
                  OR s.draft_custom_start_time IS NOT NULL
                  OR s.draft_custom_end_time IS NOT NULL
                )
                AND s.draft_is_delete = FALSE
                AND (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                )
              )
              OR (
                NOT (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                  OR s.draft_is_delete = TRUE
                  OR s.draft_custom_start_time IS NOT NULL
                  OR s.draft_custom_end_time IS NOT NULL
                )
                AND (
                  array_length(s.published_shift_code_ids, 1) IS NOT NULL
                  OR s.published_absence_type_id IS NOT NULL
                )
              )
            )
        )
      ORDER BY rs.emp_id, rs.effective_from DESC
    LOOP
      INSERT INTO public.shifts (
        emp_id, date, org_id, draft_shift_code_ids,
        draft_is_delete, from_recurring, created_by, updated_by
      ) VALUES (
        r.emp_id, v_current, p_org_id, ARRAY[r.shift_code_id],
        false, true, auth.uid(), auth.uid()
      )
      ON CONFLICT (emp_id, date) DO UPDATE
      SET draft_shift_code_ids = ARRAY[r.shift_code_id],
          draft_absence_type_id = NULL,
          draft_is_delete = FALSE,
          draft_custom_start_time = NULL,
          draft_custom_end_time = NULL,
          from_recurring = TRUE,
          updated_by = auth.uid(),
          updated_at = NOW(),
          version = shifts.version + 1
      WHERE NOT (
        (
          (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
            OR shifts.draft_is_delete = TRUE
            OR shifts.draft_custom_start_time IS NOT NULL
            OR shifts.draft_custom_end_time IS NOT NULL
          )
          AND shifts.draft_is_delete = FALSE
          AND (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
          )
        )
        OR (
          NOT (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
            OR shifts.draft_is_delete = TRUE
            OR shifts.draft_custom_start_time IS NOT NULL
            OR shifts.draft_custom_end_time IS NOT NULL
          )
          AND (
            array_length(shifts.published_shift_code_ids, 1) IS NOT NULL
            OR shifts.published_absence_type_id IS NOT NULL
          )
        )
      );

      IF FOUND THEN
        v_inserted := v_inserted + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'empId', r.emp_id,
          'date', to_char(v_current, 'YYYY-MM-DD'),
          'label', r.shift_label,
          'shiftCodeId', r.shift_code_id
        ));
      END IF;
    END LOOP;

    -- ── Absence-type recurring templates ──
    FOR r IN
      SELECT DISTINCT ON (rs.emp_id)
        rs.emp_id, rs.absence_type_id, at.label AS absence_label
      FROM public.recurring_shifts rs
      JOIN public.absence_types at
        ON at.id = rs.absence_type_id AND at.archived_at IS NULL
      WHERE rs.org_id = p_org_id
        AND rs.archived_at IS NULL
        AND rs.absence_type_id IS NOT NULL
        AND rs.day_of_week = EXTRACT(DOW FROM v_current)::INTEGER
        AND rs.effective_from <= v_current
        AND (rs.effective_until IS NULL OR rs.effective_until >= v_current)
        AND NOT EXISTS (
          SELECT 1 FROM public.shifts s
          WHERE s.emp_id = rs.emp_id
            AND s.date = v_current
            AND (
              (
                (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                  OR s.draft_is_delete = TRUE
                  OR s.draft_custom_start_time IS NOT NULL
                  OR s.draft_custom_end_time IS NOT NULL
                )
                AND s.draft_is_delete = FALSE
                AND (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                )
              )
              OR (
                NOT (
                  array_length(s.draft_shift_code_ids, 1) IS NOT NULL
                  OR s.draft_absence_type_id IS NOT NULL
                  OR s.draft_is_delete = TRUE
                  OR s.draft_custom_start_time IS NOT NULL
                  OR s.draft_custom_end_time IS NOT NULL
                )
                AND (
                  array_length(s.published_shift_code_ids, 1) IS NOT NULL
                  OR s.published_absence_type_id IS NOT NULL
                )
              )
            )
        )
      ORDER BY rs.emp_id, rs.effective_from DESC
    LOOP
      INSERT INTO public.shifts (
        emp_id, date, org_id, draft_shift_code_ids, draft_absence_type_id,
        draft_is_delete, from_recurring, created_by, updated_by
      ) VALUES (
        r.emp_id, v_current, p_org_id, '{}', r.absence_type_id,
        false, true, auth.uid(), auth.uid()
      )
      ON CONFLICT (emp_id, date) DO UPDATE
      SET draft_shift_code_ids = '{}'::BIGINT[],
          draft_absence_type_id = r.absence_type_id,
          draft_is_delete = FALSE,
          draft_custom_start_time = NULL,
          draft_custom_end_time = NULL,
          from_recurring = TRUE,
          updated_by = auth.uid(),
          updated_at = NOW(),
          version = shifts.version + 1
      WHERE NOT (
        (
          (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
            OR shifts.draft_is_delete = TRUE
            OR shifts.draft_custom_start_time IS NOT NULL
            OR shifts.draft_custom_end_time IS NOT NULL
          )
          AND shifts.draft_is_delete = FALSE
          AND (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
          )
        )
        OR (
          NOT (
            array_length(shifts.draft_shift_code_ids, 1) IS NOT NULL
            OR shifts.draft_absence_type_id IS NOT NULL
            OR shifts.draft_is_delete = TRUE
            OR shifts.draft_custom_start_time IS NOT NULL
            OR shifts.draft_custom_end_time IS NOT NULL
          )
          AND (
            array_length(shifts.published_shift_code_ids, 1) IS NOT NULL
            OR shifts.published_absence_type_id IS NOT NULL
          )
        )
      );

      IF FOUND THEN
        v_inserted := v_inserted + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'empId', r.emp_id,
          'date', to_char(v_current, 'YYYY-MM-DD'),
          'label', r.absence_label,
          'absenceTypeId', r.absence_type_id
        ));
      END IF;
    END LOOP;

    v_current := v_current + 1;  -- DATE + INTEGER is DST-safe in PostgreSQL
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'shifts', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_recurring_schedules(UUID, DATE, DATE) TO authenticated;


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
  IF NOT public.is_gridmaster() THEN
    v_caller_role := public.caller_org_role()::TEXT;
    IF public.caller_org_id() <> p_org_id OR v_caller_role <> 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: only super_admin can send invitations';
    END IF;
  END IF;

  IF p_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role: must be admin or user';
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

    SELECT first_name, last_name INTO v_emp_first_name, v_emp_last_name
    FROM public.employees
    WHERE id = v_invite.employee_id AND org_id = v_invite.org_id;
  ELSE
    -- App-only invite: use name from invitation record
    v_emp_first_name := v_invite.first_name;
    v_emp_last_name := v_invite.last_name;
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (v_uid, v_invite.org_id, 'none', v_emp_first_name, v_emp_last_name)
  ON CONFLICT (id) DO UPDATE
    SET org_id     = COALESCE(profiles.org_id, EXCLUDED.org_id),
        first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
        last_name  = COALESCE(EXCLUDED.last_name, profiles.last_name),
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


-- ── link_employee_to_user ────────────────────────────────────────────────────
-- Directly link an existing org user to an employee record (no invitation needed).
-- Use case: user already has an account and is already a member of this org.

CREATE OR REPLACE FUNCTION public.link_employee_to_user(
  p_employee_id  UUID,
  p_user_id      UUID,
  p_org_id       UUID
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_membership public.organization_memberships;
BEGIN
  -- Authorization: gridmaster, super_admin, or admin with canManageEmployees
  IF NOT public.is_gridmaster() THEN
    SELECT *
      INTO v_membership
      FROM public.organization_memberships
     WHERE user_id = auth.uid()
       AND org_id = p_org_id
       AND archived_at IS NULL
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unauthorized: org mismatch';
    END IF;

    IF v_membership.org_role <> 'super_admin'
       AND NOT (
         v_membership.org_role = 'admin'
         AND COALESCE((v_membership.admin_permissions->>'canManageEmployees')::BOOLEAN, FALSE)
       )
    THEN
      RAISE EXCEPTION 'Unauthorized: missing canManageEmployees permission';
    END IF;
  END IF;

  -- Validate org exists
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found or archived';
  END IF;

  -- Validate employee belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = p_employee_id AND org_id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Employee not found in this organization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = p_employee_id AND user_id IS NOT NULL AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Employee already has a linked user account';
  END IF;

  -- Validate user is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = p_user_id AND org_id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Validate user is not already linked to another employee in this org
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE org_id = p_org_id AND user_id = p_user_id AND id <> p_employee_id
  ) THEN
    RAISE EXCEPTION 'User is already linked to another employee in this organization';
  END IF;

  -- Link them
  UPDATE public.employees
  SET user_id = p_user_id,
      updated_at = NOW()
  WHERE id = p_employee_id AND org_id = p_org_id;

  RETURN jsonb_build_object('status', 'linked', 'employee_id', p_employee_id, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_employee_to_user(UUID, UUID, UUID) TO authenticated;


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
  v_active_count INTEGER;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  v_caller_id := auth.uid();

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

  -- Notify the target user about the impersonation (scoped to target org)
  INSERT INTO notifications (user_id, org_id, type, title, message, metadata)
  VALUES (
    p_target_user_id,
    v_target_org_id,
    'impersonation_start',
    'Account access notice',
    'A platform administrator is currently reviewing your account for support purposes.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification)
    )
  );

  -- Notify all org super_admins about the impersonation (security transparency).
  -- Excludes the target user (already notified above) to avoid duplicate notifications.
  INSERT INTO notifications (user_id, org_id, type, title, message, metadata)
  SELECT
    cm.user_id,
    v_target_org_id,
    'impersonation_start',
    'Impersonation session started',
    'A platform administrator has started an impersonation session in your organization.',
    jsonb_build_object(
      'session_id', v_session.session_id,
      'expires_at', v_session.expires_at,
      'justification', trim(p_justification),
      'target_user_id', p_target_user_id
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
BEGIN
  -- Soft-delete: update instead of delete
  UPDATE impersonation_sessions
     SET ended_at = now(),
         end_reason = p_reason
   WHERE session_id = p_session_id
     AND gridmaster_id = auth.uid()
     AND ended_at IS NULL
  RETURNING target_user_id, target_org_id INTO v_target_user_id, v_target_org_id;

  -- Notify the target user that the impersonation ended (scoped to target org)
  IF v_target_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, org_id, type, title, message, metadata)
    VALUES (
      v_target_user_id,
      v_target_org_id,
      'impersonation_end',
      'Account access ended',
      'A platform administrator has finished reviewing your account.',
      jsonb_build_object('session_id', p_session_id, 'end_reason', p_reason)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.end_impersonation IS 'Soft-ends an impersonation session (sets ended_at + reason). Inserts a notification for the target user.';


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
  id         UUID,
  type       TEXT,
  channel    TEXT,
  category   TEXT,
  title      TEXT,
  message    TEXT,
  metadata   JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.type, n.channel, n.category, n.title, n.message, n.metadata, n.read_at, n.created_at
  FROM notifications n
  WHERE n.user_id = auth.uid()
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
  WHERE id = p_notification_id AND user_id = auth.uid();
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
    AND (org_id = public.caller_org_id() OR org_id IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;


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
    'shift_count',        (SELECT count(*) FROM public.shifts),
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
  ORDER BY u.email ASC;
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
    tp.org_id, o.name
  FROM public.role_change_log rcl
  LEFT JOIN auth.users tu ON tu.id = rcl.target_user_id
  LEFT JOIN auth.users cu ON cu.id = rcl.changed_by_id
  LEFT JOIN public.profiles tp ON tp.id = rcl.target_user_id
  LEFT JOIN public.organizations o ON o.id = tp.org_id
  WHERE (p_org_id IS NULL OR tp.org_id = p_org_id)
    AND (p_target_user_id IS NULL OR rcl.target_user_id = p_target_user_id)
  ORDER BY rcl.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log(UUID, INTEGER, INTEGER, UUID) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- SHIFT REQUESTS: Pickup & Swap Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- ── shift_times_overlap ──────────────────────────────────────────────────────
-- Returns TRUE if any shift code in set A has a category time window that
-- overlaps with any shift code in set B. Handles overnight shifts (start > end).

CREATE OR REPLACE FUNCTION public.shift_times_overlap(
  p_code_ids_a INT8[],
  p_code_ids_b INT8[]
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shift_codes sc1
    JOIN public.shift_categories cat1 ON cat1.id = sc1.category_id
    CROSS JOIN public.shift_codes sc2
    JOIN public.shift_categories cat2 ON cat2.id = sc2.category_id
    WHERE sc1.id = ANY(p_code_ids_a) AND sc2.id = ANY(p_code_ids_b)
      AND cat1.start_time IS NOT NULL AND cat1.end_time IS NOT NULL
      AND cat2.start_time IS NOT NULL AND cat2.end_time IS NOT NULL
      AND (
        CASE
          -- Both normal (start < end): standard overlap
          WHEN cat1.start_time < cat1.end_time AND cat2.start_time < cat2.end_time THEN
            cat1.start_time < cat2.end_time AND cat2.start_time < cat1.end_time
          -- cat1 overnight (covers [start1,24:00) + [00:00,end1)), cat2 normal
          WHEN cat1.start_time >= cat1.end_time AND cat2.start_time < cat2.end_time THEN
            -- cat2 overlaps [start1, 24:00) OR cat2 overlaps [00:00, end1)
            (cat2.end_time > cat1.start_time) OR (cat2.start_time < cat1.end_time)
          -- cat1 normal, cat2 overnight (covers [start2,24:00) + [00:00,end2))
          WHEN cat1.start_time < cat1.end_time AND cat2.start_time >= cat2.end_time THEN
            -- cat1 overlaps [start2, 24:00) OR cat1 overlaps [00:00, end2)
            (cat1.end_time > cat2.start_time) OR (cat1.start_time < cat2.end_time)
          -- Both overnight: always overlap
          ELSE TRUE
        END
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.shift_times_overlap(INT8[], INT8[]) TO authenticated;


-- ── resolve_shift_time_ranges ──────────────────────────────────────────────
-- Resolves effective time ranges for a set of shift codes using the cascade:
-- 1. Instance custom times (pipe-delimited TEXT params)
-- 2. Shift code default_start_time / default_end_time
-- 3. Shift category start_time / end_time
-- 4. No row returned = duration-based (no conflict possible)

CREATE OR REPLACE FUNCTION public.resolve_shift_time_ranges(
  p_shift_code_ids   BIGINT[],
  p_custom_start     TEXT DEFAULT NULL,  -- pipe-delimited per code
  p_custom_end       TEXT DEFAULT NULL   -- pipe-delimited per code
) RETURNS TABLE(start_time TIME, end_time TIME)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_starts TEXT[];
  v_ends TEXT[];
  v_code_id BIGINT;
  v_idx INT := 1;
  v_start TEXT;
  v_end TEXT;
  v_sc RECORD;
  v_cat RECORD;
BEGIN
  v_starts := string_to_array(COALESCE(p_custom_start, ''), '|');
  v_ends := string_to_array(COALESCE(p_custom_end, ''), '|');

  FOREACH v_code_id IN ARRAY p_shift_code_ids LOOP
    v_start := NULLIF(TRIM(v_starts[v_idx]), '');
    v_end := NULLIF(TRIM(v_ends[v_idx]), '');

    -- Level 1: Instance custom times
    IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
      start_time := v_start::TIME;
      end_time := v_end::TIME;
      RETURN NEXT;
    ELSE
      -- Level 2: Shift code defaults
      SELECT sc.default_start_time, sc.default_end_time, sc.category_id
      INTO v_sc
      FROM public.shift_codes sc WHERE sc.id = v_code_id;

      IF v_sc IS NOT NULL AND v_sc.default_start_time IS NOT NULL AND v_sc.default_end_time IS NOT NULL THEN
        start_time := v_sc.default_start_time;
        end_time := v_sc.default_end_time;
        RETURN NEXT;
      ELSIF v_sc IS NOT NULL AND v_sc.category_id IS NOT NULL THEN
        -- Level 3: Category times
        SELECT cat.start_time, cat.end_time INTO v_cat
        FROM public.shift_categories cat WHERE cat.id = v_sc.category_id;

        IF v_cat IS NOT NULL AND v_cat.start_time IS NOT NULL AND v_cat.end_time IS NOT NULL THEN
          start_time := v_cat.start_time;
          end_time := v_cat.end_time;
          RETURN NEXT;
        END IF;
        -- Level 4: No times (duration-based) — skip, no row returned
      END IF;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_shift_time_ranges(BIGINT[], TEXT, TEXT) TO authenticated;


-- ── shift_times_overlap_v2 ─────────────────────────────────────────────────
-- Full-cascade version: resolves times from custom → code default → category
-- before checking overlap. Use this instead of shift_times_overlap.

CREATE OR REPLACE FUNCTION public.shift_times_overlap_v2(
  p_code_ids_a      BIGINT[],
  p_custom_start_a  TEXT,
  p_custom_end_a    TEXT,
  p_code_ids_b      BIGINT[],
  p_custom_start_b  TEXT,
  p_custom_end_b    TEXT
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_shift_time_ranges(p_code_ids_a, p_custom_start_a, p_custom_end_a) a
    CROSS JOIN public.resolve_shift_time_ranges(p_code_ids_b, p_custom_start_b, p_custom_end_b) b
    WHERE (
      CASE
        -- Both normal (start < end): standard overlap
        WHEN a.start_time < a.end_time AND b.start_time < b.end_time THEN
          a.start_time < b.end_time AND b.start_time < a.end_time
        -- a overnight, b normal
        WHEN a.start_time >= a.end_time AND b.start_time < b.end_time THEN
          (b.end_time > a.start_time) OR (b.start_time < a.end_time)
        -- a normal, b overnight
        WHEN a.start_time < a.end_time AND b.start_time >= b.end_time THEN
          (a.end_time > b.start_time) OR (a.start_time < b.end_time)
        -- Both overnight: always overlap
        ELSE TRUE
      END
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.shift_times_overlap_v2(BIGINT[], TEXT, TEXT, BIGINT[], TEXT, TEXT) TO authenticated;


-- ── create_shift_request ────────────────────────────────────────────────────
-- Creates a pickup, swap, or calloff request. Validates shift ownership and snapshots data.

-- Drop old 7-param overload so the 8-param version is the only one
DROP FUNCTION IF EXISTS public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID);

CREATE OR REPLACE FUNCTION public.create_shift_request(
  p_org_id              UUID,
  p_type                public.shift_request_type,
  p_requester_emp_id    UUID,
  p_requester_shift_date DATE,
  p_target_emp_id       UUID DEFAULT NULL,
  p_target_shift_date   DATE DEFAULT NULL,
  p_idempotency_key     UUID DEFAULT gen_random_uuid(),
  p_absence_type_id     BIGINT DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request_id UUID;
  v_requester_shift RECORD;
  v_target_shift RECORD;
  v_requester_employee RECORD;
  v_initial_status public.shift_request_status;
BEGIN
  -- Idempotency: return existing if already created
  SELECT id INTO v_request_id FROM public.shift_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_request_id; END IF;

  -- Validate calloff-specific constraints
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
  ELSIF p_absence_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only calloff requests can have an absence type';
  END IF;

  -- Validate requester is an active employee in this org
  SELECT id, user_id, status, focus_area_ids INTO v_requester_employee
  FROM public.employees
  WHERE id = p_requester_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  -- Validate caller is the requester (employee's linked user) or admin+
  IF v_requester_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND public.caller_org_role()::TEXT NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: you can only create requests for your own shifts';
  END IF;

  -- Validate requester owns a published shift on this date
  SELECT emp_id, date, published_shift_code_ids, published_absence_type_id,
         focus_area_id, published_custom_start_time, published_custom_end_time
  INTO v_requester_shift
  FROM public.shifts
  WHERE emp_id = p_requester_emp_id AND date = p_requester_shift_date AND org_id = p_org_id;

  IF NOT FOUND OR array_length(v_requester_shift.published_shift_code_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No published shift found for this employee on this date';
  END IF;

  -- Fall back to employee's primary focus area when shift has no focus_area_id
  IF v_requester_shift.focus_area_id IS NULL THEN
    v_requester_shift.focus_area_id := v_requester_employee.focus_area_ids[1];
  END IF;

  -- Check not an absence (can't avail an off day)
  IF v_requester_shift.published_absence_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create a request for an off-day shift';
  END IF;

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

  -- For swaps: validate target
  IF p_type = 'swap' THEN
    IF p_target_emp_id IS NULL OR p_target_shift_date IS NULL THEN
      RAISE EXCEPTION 'Swap requests require a target employee and shift date';
    END IF;

    IF p_requester_emp_id = p_target_emp_id THEN
      RAISE EXCEPTION 'Cannot swap with yourself';
    END IF;

    -- Validate target employee exists and is active
    IF NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = p_target_emp_id AND org_id = p_org_id AND archived_at IS NULL AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Target employee not found, archived, or inactive';
    END IF;

    -- Validate target owns a published shift on the target date
    SELECT emp_id, date, published_shift_code_ids, published_absence_type_id,
           focus_area_id, published_custom_start_time, published_custom_end_time
    INTO v_target_shift
    FROM public.shifts
    WHERE emp_id = p_target_emp_id AND date = p_target_shift_date AND org_id = p_org_id;

    IF NOT FOUND OR array_length(v_target_shift.published_shift_code_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Target employee has no published shift on the specified date';
    END IF;

    -- Check target shift is not an absence
    IF v_target_shift.published_absence_type_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot swap with an off-day shift';
    END IF;

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
      requester_emp_id, requester_shift_date, requester_shift_code_ids,
      requester_focus_area_id, requester_custom_start_time, requester_custom_end_time,
      target_emp_id, target_shift_date, target_shift_code_ids,
      target_focus_area_id, target_custom_start_time, target_custom_end_time,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_shift.published_shift_code_ids,
      v_requester_shift.focus_area_id, v_requester_shift.published_custom_start_time, v_requester_shift.published_custom_end_time,
      p_target_emp_id, p_target_shift_date,
      v_target_shift.published_shift_code_ids,
      v_target_shift.focus_area_id,
      v_target_shift.published_custom_start_time,
      v_target_shift.published_custom_end_time,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSIF p_type = 'calloff' THEN
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_shift_code_ids,
      requester_focus_area_id, requester_custom_start_time, requester_custom_end_time,
      absence_type_id, idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_shift.published_shift_code_ids,
      v_requester_shift.focus_area_id, v_requester_shift.published_custom_start_time, v_requester_shift.published_custom_end_time,
      p_absence_type_id, p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_shift_code_ids,
      requester_focus_area_id, requester_custom_start_time, requester_custom_end_time,
      target_emp_id, target_shift_date,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, v_initial_status,
      p_requester_emp_id, p_requester_shift_date, v_requester_shift.published_shift_code_ids,
      v_requester_shift.focus_area_id, v_requester_shift.published_custom_start_time, v_requester_shift.published_custom_end_time,
      NULL, NULL,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT) TO authenticated;


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

  -- Validate claimer is active employee in same org
  SELECT id, user_id, certification_id, status, focus_area_ids INTO v_claimer
  FROM public.employees
  WHERE id = p_claimer_emp_id AND org_id = v_request.org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claimer employee not found or archived';
  END IF;

  IF v_claimer.status != 'active' THEN
    RAISE EXCEPTION 'Claimer employee is not active';
  END IF;

  -- Validate caller is the claimer
  IF v_claimer.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND public.caller_org_role()::TEXT NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: you can only claim requests for yourself';
  END IF;

  -- Check certification requirements
  -- Handle NULL certification_id: if claimer has no cert, they fail any cert requirement
  IF EXISTS (
    SELECT 1 FROM public.shift_codes sc
    WHERE sc.id = ANY(v_request.requester_shift_code_ids)
      AND array_length(sc.required_certification_ids, 1) IS NOT NULL
      AND (
        v_claimer.certification_id IS NULL
        OR NOT (v_claimer.certification_id = ANY(sc.required_certification_ids))
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the certification requirements for this shift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_codes sc
    WHERE sc.id = ANY(v_request.requester_shift_code_ids)
      AND sc.focus_area_id IS NOT NULL
      AND NOT (sc.focus_area_id = ANY(COALESCE(v_claimer.focus_area_ids, '{}'::BIGINT[])))
  ) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  -- Block if claimer has a shift on the same date with overlapping time
  IF EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.emp_id = p_claimer_emp_id
      AND s.date = v_request.requester_shift_date
      AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
      AND public.shift_times_overlap_v2(
            s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
            v_request.requester_shift_code_ids, v_request.requester_custom_start_time, v_request.requester_custom_end_time
          )
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
-- Target employee accepts or declines a swap request.

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
BEGIN
  -- Lock and fetch
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.type != 'swap' THEN
    RAISE EXCEPTION 'Only swap requests can be responded to';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate caller is the target employee
  SELECT id, user_id INTO v_emp FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_emp.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: only the target employee can respond';
  END IF;

  IF v_request.target_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'You are not the target of this swap request';
  END IF;

  IF p_accept THEN
    -- Verify requester's shift still matches snapshot
    SELECT * INTO v_req_shift
    FROM public.shifts
    WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

    IF NOT FOUND OR v_req_shift.published_shift_code_ids IS DISTINCT FROM v_request.requester_shift_code_ids THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    -- Verify target's shift still matches snapshot
    SELECT * INTO v_tgt_shift
    FROM public.shifts
    WHERE emp_id = v_request.target_emp_id AND date = v_request.target_shift_date;

    IF NOT FOUND OR v_tgt_shift.published_shift_code_ids IS DISTINCT FROM v_request.target_shift_code_ids THEN
      RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
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
  v_row_count INTEGER;
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
    -- Reject
    UPDATE public.shift_requests
    SET status = 'rejected', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- ── APPROVAL: execute the shift reassignment ──

  -- ── CALLOFF: apply absence + spawn open pickup ──
  IF v_request.type = 'calloff' THEN
    -- Advisory lock on requester's shift
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));

    -- Re-validate requester's shift still matches snapshot
    SELECT * INTO v_req_shift
    FROM public.shifts
    WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

    IF NOT FOUND OR v_req_shift.published_shift_code_ids IS DISTINCT FROM v_request.requester_shift_code_ids THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    -- Replace published shift with absence type
    UPDATE public.shifts
    SET published_shift_code_ids = '{}',
        published_absence_type_id = v_request.absence_type_id,
        published_custom_start_time = NULL,
        published_custom_end_time = NULL,
        draft_shift_code_ids = '{}',
        draft_absence_type_id = v_request.absence_type_id,
        version = version + 1,
        updated_by = v_admin_user_id,
        updated_at = now()
    WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

    -- Auto-create an open pickup request so other staff can claim the vacated shift
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_shift_code_ids,
      requester_focus_area_id, requester_custom_start_time, requester_custom_end_time,
      parent_request_id
    ) VALUES (
      v_request.org_id, 'pickup', 'open',
      v_request.requester_emp_id, v_request.requester_shift_date, v_request.requester_shift_code_ids,
      v_request.requester_focus_area_id, v_request.requester_custom_start_time, v_request.requester_custom_end_time,
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
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_request.requester_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Requester is no longer active. Cannot approve.';
  END IF;

  IF v_request.target_emp_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_request.target_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target employee is no longer active. Cannot approve.';
  END IF;

  -- Verify requester's shift still exists as snapshotted
  -- (Skip for volunteer pickups — there is no original shift to validate against)
  IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL) THEN
    SELECT * INTO v_req_shift
    FROM public.shifts
    WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

    IF NOT FOUND OR v_req_shift.published_shift_code_ids IS DISTINCT FROM v_request.requester_shift_code_ids THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;
  END IF;

  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NULL THEN
      -- ── VOLUNTEER PICKUP: no source shift to transfer, just assign to volunteer ──

      -- Re-check at approval: volunteer must not have an overlapping shift now
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.requester_emp_id
          AND s.date = v_request.requester_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap_v2(
                s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
                v_request.requester_shift_code_ids, v_request.requester_custom_start_time, v_request.requester_custom_end_time
              )
      ) THEN
        RAISE EXCEPTION 'The volunteer has an overlapping shift on this date. Cannot approve.';
      END IF;

      -- Insert shift for volunteer (merge if they already have a non-overlapping shift)
      INSERT INTO public.shifts (
        emp_id, date, org_id, user_id,
        published_shift_code_ids, draft_shift_code_ids,
        focus_area_id, published_custom_start_time, published_custom_end_time,
        created_by, updated_by
      )
      SELECT
        v_request.requester_emp_id, v_request.requester_shift_date, v_request.org_id, e.user_id,
        v_request.requester_shift_code_ids, '{}',
        v_request.requester_focus_area_id, v_request.requester_custom_start_time, v_request.requester_custom_end_time,
        v_admin_user_id, v_admin_user_id
      FROM public.employees e
      WHERE e.id = v_request.requester_emp_id
      ON CONFLICT (emp_id, date) DO UPDATE SET
        published_shift_code_ids = shifts.published_shift_code_ids || EXCLUDED.published_shift_code_ids,
        published_custom_start_time = CASE
          WHEN shifts.published_custom_start_time IS NOT NULL AND EXCLUDED.published_custom_start_time IS NOT NULL
            THEN shifts.published_custom_start_time || '|' || EXCLUDED.published_custom_start_time
          WHEN EXCLUDED.published_custom_start_time IS NOT NULL THEN EXCLUDED.published_custom_start_time
          ELSE shifts.published_custom_start_time
        END,
        published_custom_end_time = CASE
          WHEN shifts.published_custom_end_time IS NOT NULL AND EXCLUDED.published_custom_end_time IS NOT NULL
            THEN shifts.published_custom_end_time || '|' || EXCLUDED.published_custom_end_time
          WHEN EXCLUDED.published_custom_end_time IS NOT NULL THEN EXCLUDED.published_custom_end_time
          ELSE shifts.published_custom_end_time
        END,
        focus_area_id = CASE
          WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
          ELSE NULL
        END,
        version = shifts.version + 1,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to assign shift: volunteer employee not found';
      END IF;

    ELSE
      -- ── CALLOFF-CLAIMED PICKUP: transfer shift from requester to target ──

      -- Re-check at approval: target must not have an overlapping shift on this date
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.target_emp_id
          AND s.date = v_request.requester_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap_v2(
                s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
                v_request.requester_shift_code_ids, v_request.requester_custom_start_time, v_request.requester_custom_end_time
              )
      ) THEN
        RAISE EXCEPTION 'The target employee has an overlapping shift on this date. Cannot approve.';
      END IF;

      -- Delete requester's shift
      DELETE FROM public.shifts
      WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

      -- Insert as target's shift (merge if target already has a non-overlapping shift on this date)
      INSERT INTO public.shifts (
        emp_id, date, org_id, user_id,
        published_shift_code_ids, draft_shift_code_ids,
        focus_area_id, published_custom_start_time, published_custom_end_time,
        created_by, updated_by
      )
      SELECT
        v_request.target_emp_id, v_request.requester_shift_date, v_request.org_id, e.user_id,
        v_request.requester_shift_code_ids, '{}',
        v_request.requester_focus_area_id, v_request.requester_custom_start_time, v_request.requester_custom_end_time,
        v_admin_user_id, v_admin_user_id
      FROM public.employees e
      WHERE e.id = v_request.target_emp_id
      ON CONFLICT (emp_id, date) DO UPDATE SET
        published_shift_code_ids = shifts.published_shift_code_ids || EXCLUDED.published_shift_code_ids,
        published_custom_start_time = CASE
          WHEN shifts.published_custom_start_time IS NOT NULL AND EXCLUDED.published_custom_start_time IS NOT NULL
            THEN shifts.published_custom_start_time || '|' || EXCLUDED.published_custom_start_time
          WHEN EXCLUDED.published_custom_start_time IS NOT NULL THEN EXCLUDED.published_custom_start_time
          ELSE shifts.published_custom_start_time
        END,
        published_custom_end_time = CASE
          WHEN shifts.published_custom_end_time IS NOT NULL AND EXCLUDED.published_custom_end_time IS NOT NULL
            THEN shifts.published_custom_end_time || '|' || EXCLUDED.published_custom_end_time
          WHEN EXCLUDED.published_custom_end_time IS NOT NULL THEN EXCLUDED.published_custom_end_time
          ELSE shifts.published_custom_end_time
        END,
        focus_area_id = CASE
          WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
          ELSE NULL
        END,
        version = shifts.version + 1,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to reassign shift: target employee not found';
      END IF;
    END IF;

  ELSIF v_request.type = 'swap' THEN
    -- Verify target's shift still exists as snapshotted
    SELECT * INTO v_tgt_shift
    FROM public.shifts
    WHERE emp_id = v_request.target_emp_id AND date = v_request.target_shift_date;

    IF NOT FOUND OR v_tgt_shift.published_shift_code_ids IS DISTINCT FROM v_request.target_shift_code_ids THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    -- Block if shifts have overlapping time slots (full cascade: custom → code default → category).
    -- Applies to both same-day and cross-day swaps.

    -- Same-day: block if requester and target shifts overlap in time (pointless swap)
    IF v_request.requester_shift_date = v_request.target_shift_date THEN
      IF public.shift_times_overlap_v2(
           v_request.requester_shift_code_ids, v_request.requester_custom_start_time, v_request.requester_custom_end_time,
           v_request.target_shift_code_ids, v_request.target_custom_start_time, v_request.target_custom_end_time
         ) THEN
        RAISE EXCEPTION 'Cannot approve: shifts have overlapping time slots';
      END IF;
    ELSE
      -- Cross-day: requester's existing shift on target_date vs incoming target codes
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.requester_emp_id AND s.date = v_request.target_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap_v2(
                s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
                v_request.target_shift_code_ids, v_request.target_custom_start_time, v_request.target_custom_end_time
              )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: requester would have overlapping shift times on the target''s date';
      END IF;

      -- Cross-day: target's existing shift on requester_date vs incoming requester codes
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.target_emp_id AND s.date = v_request.requester_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap_v2(
                s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
                v_request.requester_shift_code_ids, v_request.requester_custom_start_time, v_request.requester_custom_end_time
              )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: target would have overlapping shift times on the requester''s date';
      END IF;
    END IF;

    -- Delete the specific swapped shifts from their original owners
    DELETE FROM public.shifts
    WHERE (emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date)
       OR (emp_id = v_request.target_emp_id AND date = v_request.target_shift_date);

    -- Give requester's old shift to target on requester_date (merge if target already has a shift there)
    INSERT INTO public.shifts (
      emp_id, date, org_id, user_id,
      published_shift_code_ids, draft_shift_code_ids,
      focus_area_id, published_custom_start_time, published_custom_end_time,
      created_by, updated_by
    )
    SELECT
      v_request.target_emp_id, v_request.requester_shift_date, v_request.org_id, e.user_id,
      v_request.requester_shift_code_ids, '{}',
      v_request.requester_focus_area_id, v_request.requester_custom_start_time, v_request.requester_custom_end_time,
      v_admin_user_id, v_admin_user_id
    FROM public.employees e WHERE e.id = v_request.target_emp_id
    ON CONFLICT (emp_id, date) DO UPDATE SET
      published_shift_code_ids = shifts.published_shift_code_ids || EXCLUDED.published_shift_code_ids,
      -- Merge pipe-delimited custom times (each segment maps to a shift code)
      published_custom_start_time = CASE
        WHEN shifts.published_custom_start_time IS NOT NULL AND EXCLUDED.published_custom_start_time IS NOT NULL
          THEN shifts.published_custom_start_time || '|' || EXCLUDED.published_custom_start_time
        WHEN EXCLUDED.published_custom_start_time IS NOT NULL THEN EXCLUDED.published_custom_start_time
        ELSE shifts.published_custom_start_time
      END,
      published_custom_end_time = CASE
        WHEN shifts.published_custom_end_time IS NOT NULL AND EXCLUDED.published_custom_end_time IS NOT NULL
          THEN shifts.published_custom_end_time || '|' || EXCLUDED.published_custom_end_time
        WHEN EXCLUDED.published_custom_end_time IS NOT NULL THEN EXCLUDED.published_custom_end_time
        ELSE shifts.published_custom_end_time
      END,
      -- Keep existing focus area (double shift spans areas; NULL if they differ)
      focus_area_id = CASE
        WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
        ELSE NULL
      END,
      version = shifts.version + 1,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Failed to swap shift: target employee not found';
    END IF;

    -- Give target's old shift to requester on target_date (merge if requester already has a shift there)
    INSERT INTO public.shifts (
      emp_id, date, org_id, user_id,
      published_shift_code_ids, draft_shift_code_ids,
      focus_area_id, published_custom_start_time, published_custom_end_time,
      created_by, updated_by
    )
    SELECT
      v_request.requester_emp_id, v_request.target_shift_date, v_request.org_id, e.user_id,
      v_request.target_shift_code_ids, '{}',
      v_request.target_focus_area_id, v_request.target_custom_start_time, v_request.target_custom_end_time,
      v_admin_user_id, v_admin_user_id
    FROM public.employees e WHERE e.id = v_request.requester_emp_id
    ON CONFLICT (emp_id, date) DO UPDATE SET
      published_shift_code_ids = shifts.published_shift_code_ids || EXCLUDED.published_shift_code_ids,
      published_custom_start_time = CASE
        WHEN shifts.published_custom_start_time IS NOT NULL AND EXCLUDED.published_custom_start_time IS NOT NULL
          THEN shifts.published_custom_start_time || '|' || EXCLUDED.published_custom_start_time
        WHEN EXCLUDED.published_custom_start_time IS NOT NULL THEN EXCLUDED.published_custom_start_time
        ELSE shifts.published_custom_start_time
      END,
      published_custom_end_time = CASE
        WHEN shifts.published_custom_end_time IS NOT NULL AND EXCLUDED.published_custom_end_time IS NOT NULL
          THEN shifts.published_custom_end_time || '|' || EXCLUDED.published_custom_end_time
        WHEN EXCLUDED.published_custom_end_time IS NOT NULL THEN EXCLUDED.published_custom_end_time
        ELSE shifts.published_custom_end_time
      END,
      focus_area_id = CASE
        WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
        ELSE NULL
      END,
      version = shifts.version + 1,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Failed to swap shift: requester employee not found';
    END IF;
  END IF;

  -- Mark approved
  UPDATE public.shift_requests
  SET status = 'approved', admin_user_id = v_admin_user_id,
      admin_note = p_note, resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;

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
  SELECT id, user_id INTO v_emp FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_request.requester_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'Only the requester can cancel this request';
  END IF;

  IF v_emp.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND public.caller_org_role()::TEXT NOT IN ('super_admin', 'admin') THEN
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

CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift(
  p_org_id              UUID,
  p_emp_id              UUID,
  p_shift_date          DATE,
  p_shift_code_ids      BIGINT[],
  p_focus_area_id       BIGINT,
  p_custom_start_time   TEXT DEFAULT NULL,
  p_custom_end_time     TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request_id UUID;
  v_employee RECORD;
BEGIN
  -- Validate shift_code_ids is non-empty
  IF array_length(p_shift_code_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one shift code is required';
  END IF;

  -- Validate employee is active in this org
  SELECT id, user_id, certification_id, status, focus_area_ids INTO v_employee
  FROM public.employees
  WHERE id = p_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  IF v_employee.status != 'active' THEN
    RAISE EXCEPTION 'Employee is not active';
  END IF;

  -- Validate caller is the employee or admin+
  IF v_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND public.caller_org_role()::TEXT NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: you can only volunteer for yourself';
  END IF;

  -- Check certification requirements
  IF EXISTS (
    SELECT 1 FROM public.shift_codes sc
    WHERE sc.id = ANY(p_shift_code_ids)
      AND array_length(sc.required_certification_ids, 1) IS NOT NULL
      AND (
        v_employee.certification_id IS NULL
        OR NOT (v_employee.certification_id = ANY(sc.required_certification_ids))
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the certification requirements for this shift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.shift_codes sc
    WHERE sc.id = ANY(p_shift_code_ids)
      AND sc.focus_area_id IS NOT NULL
      AND NOT (sc.focus_area_id = ANY(COALESCE(v_employee.focus_area_ids, '{}'::BIGINT[])))
  ) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  -- Check time conflicts: volunteer must not have an overlapping shift on this date
  IF EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.emp_id = p_emp_id
      AND s.date = p_shift_date
      AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
      AND public.shift_times_overlap_v2(
            s.published_shift_code_ids, s.published_custom_start_time, s.published_custom_end_time,
            p_shift_code_ids, p_custom_start_time, p_custom_end_time
          )
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

  -- Create the volunteer pickup request (pending_approval immediately)
  INSERT INTO public.shift_requests (
    org_id, type, status,
    requester_emp_id, requester_shift_date, requester_shift_code_ids,
    requester_focus_area_id, requester_custom_start_time, requester_custom_end_time
  ) VALUES (
    p_org_id, 'pickup', 'pending_approval',
    p_emp_id, p_shift_date, p_shift_code_ids,
    p_focus_area_id, p_custom_start_time, p_custom_end_time
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.volunteer_for_open_shift(UUID, UUID, DATE, BIGINT[], BIGINT, TEXT, TEXT) TO authenticated;


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


-- ── Shift Code Time Overlap Check ─────────────────────────────────────────────
-- Trigger function: prevents saving a shift with multiple codes whose default
-- time ranges overlap. Handles overnight shifts (end_time < start_time).

CREATE OR REPLACE FUNCTION public.check_shift_code_time_overlap()
RETURNS TRIGGER
LANGUAGE PLPGSQL STABLE
SET search_path = 'public'
AS $$
DECLARE
  v_code_ids BIGINT[];
  v_overlap RECORD;
BEGIN
  v_code_ids := NEW.draft_shift_code_ids;

  -- Nothing to check if fewer than 2 codes
  IF array_length(v_code_ids, 1) IS NULL OR array_length(v_code_ids, 1) < 2 THEN
    RETURN NEW;
  END IF;

  -- Find the first pair of codes with overlapping time ranges.
  -- Normalise each code's time range to minutes-from-midnight:
  --   start_min = extract(hour)*60 + extract(minute)
  --   end_min   = same, but if end <= start (overnight), add 1440 (24h)
  -- Standard overlap: start_a < end_b AND start_b < end_a
  SELECT a.label AS label_a, b.label AS label_b
  INTO v_overlap
  FROM shift_codes a
  CROSS JOIN shift_codes b
  WHERE a.id = ANY(v_code_ids)
    AND b.id = ANY(v_code_ids)
    AND a.id < b.id
    AND a.default_start_time IS NOT NULL
    AND a.default_end_time IS NOT NULL
    AND b.default_start_time IS NOT NULL
    AND b.default_end_time IS NOT NULL
    AND (
      (extract(hour FROM a.default_start_time) * 60 + extract(minute FROM a.default_start_time))
      <
      (extract(hour FROM b.default_end_time) * 60 + extract(minute FROM b.default_end_time)
       + CASE WHEN b.default_end_time <= b.default_start_time THEN 1440 ELSE 0 END)
    )
    AND (
      (extract(hour FROM b.default_start_time) * 60 + extract(minute FROM b.default_start_time))
      <
      (extract(hour FROM a.default_end_time) * 60 + extract(minute FROM a.default_end_time)
       + CASE WHEN a.default_end_time <= a.default_start_time THEN 1440 ELSE 0 END)
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Shift codes "%" and "%" have overlapping time ranges',
      v_overlap.label_a, v_overlap.label_b
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_shift_code_overlap
  BEFORE INSERT OR UPDATE OF draft_shift_code_ids ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_shift_code_time_overlap();


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

    -- Purge old shifts (beyond retention period from their date)
    WITH deleted AS (
      DELETE FROM shifts s
      WHERE s.org_id = org.id
        AND s.date < (CURRENT_DATE - org.data_retention_days)::TEXT
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
         ph.start_date, ph.end_date, ph.change_count, ph.changes, ph.published_at
  FROM public.publish_history ph
  LEFT JOIN public.profiles p ON p.id = ph.published_by
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
    (SELECT om.org_id, COUNT(*) AS cnt FROM public.organization_memberships om GROUP BY om.org_id) m
  FULL OUTER JOIN
    (SELECT emp.org_id, COUNT(*) AS cnt FROM public.employees emp WHERE emp.archived_at IS NULL GROUP BY emp.org_id) e
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
LANGUAGE SQL SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE public.employees
  SET focus_area_ids = array_remove(focus_area_ids, p_focus_area_id)
  WHERE focus_area_ids @> ARRAY[p_focus_area_id]
    AND org_id = public.caller_org_id();
$$;

COMMENT ON FUNCTION public.remove_focus_area_from_employees IS 'Removes a focus area ID from all employee arrays in a single UPDATE.';


-- ── People Directory (union of employees + app-only users) ──────────────────

CREATE OR REPLACE FUNCTION public.get_org_directory(p_org_id UUID)
RETURNS TABLE (
  person_id               TEXT,
  source                  TEXT,
  employee_id             UUID,
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
  management_dept_admin_ids BIGINT[]
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (
    public.is_gridmaster()
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
    COALESCE(cm.dept_admin_ids, emp_inv.dept_admin_ids, '{}'::BIGINT[]) AS management_dept_admin_ids
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
    cm2.dept_admin_ids AS management_dept_admin_ids
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
    inv3.dept_admin_ids AS management_dept_admin_ids
  FROM public.invitations inv3
  WHERE inv3.org_id = p_org_id
    AND inv3.employee_id IS NULL
    AND inv3.accepted_at IS NULL
    AND inv3.revoked_at IS NULL

  ORDER BY seniority NULLS LAST, first_name, last_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_directory(UUID) TO authenticated;


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


-- ══════════════════════════════════════════════════════════════════════════════
-- ONBOARDING
-- ══════════════════════════════════════════════════════════════════════════════

-- Lets any authenticated user mark their own onboarding as completed.
-- SECURITY DEFINER so it bypasses RLS (users can't UPDATE memberships directly).
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending onboarding found for this user/org';
  END IF;
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
