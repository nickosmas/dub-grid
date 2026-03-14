-- ============================================================================
-- Migration 002: Functions, Triggers & Hooks
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. RBAC HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
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
    ON cm.user_id = p.id AND cm.org_id = p.org_id
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
  SELECT COUNT(*)::INTEGER FROM public.schedule_draft_sessions;
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
LANGUAGE PLPGSQL SECURITY DEFINER
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
        'message', 'Session invalidated due to role change. Please sign in again.'
      )
    );
  END IF;

  -- Clean up any expired locks
  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  -- Resolve user profile with org context
  -- Archived orgs are filtered out (AND o.archived_at IS NULL)
  SELECT
    p.org_id,
    p.platform_role::TEXT  AS platform_role,
    COALESCE(cm.org_role::TEXT, 'user') AS org_role,
    o.slug                 AS org_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = p.id AND cm.org_id = p.org_id
  LEFT JOIN public.organizations o
    ON o.id = p.org_id AND o.archived_at IS NULL
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',  to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{org_role}',       to_jsonb(user_profile.org_role));
    IF user_profile.org_id IS NOT NULL AND user_profile.org_slug IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}',       to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}',     to_jsonb(user_profile.org_slug));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
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
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CASCADE TRIGGERS
-- ══════════════════════════════════════════════════════════════════════════════

-- Focus area rename → propagate to schedule_notes
CREATE OR REPLACE FUNCTION public.cascade_wing_rename()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.schedule_notes
    SET focus_area_name = NEW.name
    WHERE org_id = NEW.org_id
      AND focus_area_name = OLD.name;
  END IF;

  RETURN NEW;
END;
$$;

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

CREATE TRIGGER trigger_wings_audit
  BEFORE INSERT OR UPDATE ON public.focus_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_employees_audit
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_shift_types_audit
  BEFORE INSERT OR UPDATE ON public.shift_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_shifts_audit
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_schedule_notes_audit
  BEFORE INSERT OR UPDATE ON public.schedule_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_regular_shifts_audit
  BEFORE INSERT OR UPDATE ON public.regular_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trigger_shift_series_audit
  BEFORE INSERT OR UPDATE ON public.shift_series
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- Shifts updated_at (fires in addition to audit trigger)
CREATE TRIGGER trigger_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_shifts_updated_at();

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


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── change_user_role ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role          TEXT;
  v_target_org_id     UUID;
  v_caller_platform_role TEXT;
  v_caller_org_role   TEXT;
  v_caller_org_id     UUID;
BEGIN
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  SELECT org_id INTO v_target_org_id
  FROM profiles WHERE id = p_target_user_id;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active organization';
  END IF;

  SELECT org_role::TEXT INTO v_old_role
  FROM organization_memberships
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user has no membership for their active organization';
  END IF;

  SELECT p.platform_role::TEXT, p.org_id
  INTO v_caller_platform_role, v_caller_org_id
  FROM profiles p WHERE p.id = auth.uid();

  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_caller_org_id;

  IF v_caller_org_role IS NULL AND v_caller_platform_role <> 'gridmaster' THEN
    RAISE EXCEPTION 'Caller not found or has no membership';
  END IF;

  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_org_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  IF v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_org_id IS NULL OR v_caller_org_id <> v_target_org_id THEN
      RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your organization';
    END IF;
  END IF;

  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND p_new_role IN ('gridmaster', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin, super_admin, or gridmaster';
  END IF;

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

COMMENT ON FUNCTION public.change_user_role IS 'Race-condition-safe role change RPC. Verifies caller identity via auth.uid(), gates on admin/super_admin/gridmaster, enforces company scoping, and prevents admin self-promotion.';


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

  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (target_user_id, p_org_id, p_org_role)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role;
END;
$$;


-- ── assign_gridmaster_by_email ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_gridmaster_by_email(p_email TEXT)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
BEGIN
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
    WHERE user_id = v_uid AND org_id = target_org_id
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

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (v_uid, NOW() + INTERVAL '2 seconds', 'org_switch')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '2 seconds', reason = 'org_switch';
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

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id     UUID,
  p_start_date DATE,
  p_end_date   DATE
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_org_id() = p_org_id
      AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- Promote drafts → published
  UPDATE public.shifts
  SET published_shift_code_ids = draft_shift_code_ids,
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND draft_is_delete = FALSE
    AND array_length(draft_shift_code_ids, 1) IS NOT NULL;

  -- Handle draft-deletes
  DELETE FROM public.shifts
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND draft_is_delete = TRUE;

  -- Clean up empty rows
  DELETE FROM public.shifts
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND (published_shift_code_ids IS NULL OR array_length(published_shift_code_ids, 1) IS NULL)
    AND (draft_shift_code_ids IS NULL OR array_length(draft_shift_code_ids, 1) IS NULL)
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
END;
$$;


-- ── send_invitation ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email  TEXT,
  p_role   TEXT,
  p_org_id UUID
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

  DELETE FROM public.invitations
   WHERE org_id = p_org_id AND lower(email) = lower(p_email)
     AND (expires_at < NOW() OR revoked_at IS NOT NULL OR accepted_at IS NOT NULL);

  INSERT INTO public.invitations (org_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), lower(p_email), p_role::public.org_role)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'invitation_id', v_invite.id,
    'token',         v_invite.token,
    'expires_at',    v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_invitation(TEXT, TEXT, UUID) TO authenticated;


-- ── accept_invitation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_invite     public.invitations;
  v_uid        UUID;
  v_user_email TEXT;
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

  INSERT INTO public.profiles (id, org_id, platform_role)
  VALUES (v_uid, v_invite.org_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id = COALESCE(profiles.org_id, EXCLUDED.org_id), updated_at = NOW();

  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (v_uid, v_invite.org_id, v_invite.role_to_assign)
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role;

  UPDATE public.profiles
  SET org_id = v_invite.org_id, updated_at = NOW()
  WHERE id = v_uid AND org_id IS NULL;

  INSERT INTO public.jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (v_uid, NOW() + INTERVAL '2 seconds', 'invitation_accepted')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '2 seconds', reason = 'invitation_accepted';

  RETURN jsonb_build_object(
    'status', 'accepted', 'org_id', v_invite.org_id, 'role', v_invite.role_to_assign::TEXT
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID) TO authenticated;


-- ── start_impersonation ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_impersonation(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
DECLARE
  v_session impersonation_sessions;
  v_target_org_id UUID;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  SELECT org_id INTO v_target_org_id
  FROM profiles WHERE id = p_target_user_id;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no organization';
  END IF;

  INSERT INTO impersonation_sessions (gridmaster_id, target_user_id, target_org_id)
    VALUES (auth.uid(), p_target_user_id, v_target_org_id)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object('session_id', v_session.session_id, 'expires_at', v_session.expires_at);
END;
$$;

COMMENT ON FUNCTION public.start_impersonation IS 'Creates an impersonation session for a Gridmaster to impersonate a target user. Returns session_id and expires_at.';


-- ── end_impersonation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_impersonation(p_session_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM impersonation_sessions
   WHERE session_id = p_session_id AND gridmaster_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.end_impersonation IS 'Ends an impersonation session. Only the owning Gridmaster can end their own sessions.';


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
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT u.id, u.email::TEXT, p.platform_role,
    COALESCE(cm.org_role, 'user'::public.org_role), p.org_id,
    o.name, p.created_at, u.last_sign_in_at
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
  created_at        TIMESTAMPTZ
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
    COALESCE(cm.org_role, 'user'::public.org_role), cm.admin_permissions, p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.organization_memberships cm ON cm.user_id = p.id AND cm.org_id = p_org_id
  WHERE p.org_id = p_org_id
  ORDER BY u.email ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_users(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_audit_log(
  p_org_id  UUID DEFAULT NULL,
  p_limit   INTEGER DEFAULT 50,
  p_offset  INTEGER DEFAULT 0
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
  ORDER BY rcl.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_log(UUID, INTEGER, INTEGER) TO authenticated;
