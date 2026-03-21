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

CREATE TRIGGER trigger_indicator_types_audit
  BEFORE INSERT OR UPDATE ON public.indicator_types
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

  -- Advisory lock prevents two callers from changing the same user's role
  -- simultaneously (last-write-wins race). Released at end of transaction.
  PERFORM pg_advisory_xact_lock(hashtext('change_role_' || p_target_user_id::TEXT));

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
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
DECLARE
  v_changes JSONB := '[]'::JSONB;
  v_change_count INTEGER := 0;
  v_history_id UUID;
  v_note_new INTEGER := 0;
  v_note_deleted INTEGER := 0;
  r RECORD;
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

  -- Enforce canPublishSchedule for admins (super_admin and gridmaster bypass)
  IF public.caller_org_role()::TEXT = 'admin' AND NOT public.is_gridmaster() THEN
    IF NOT COALESCE(
      (SELECT (cm.admin_permissions->>'canPublishSchedule')::BOOLEAN
       FROM public.organization_memberships cm
       WHERE cm.user_id = auth.uid() AND cm.org_id = p_org_id),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to publish the schedule';
    END IF;
  END IF;

  -- Advisory lock prevents concurrent publishes for same org
  PERFORM pg_advisory_xact_lock(hashtext('publish_schedule_' || p_org_id::TEXT));

  -- Capture shift changes BEFORE applying them
  FOR r IN
    SELECT s.emp_id, s.date,
           s.published_shift_code_ids AS old_ids,
           s.draft_shift_code_ids AS new_ids,
           s.draft_is_delete,
           s.updated_by
    FROM public.shifts s
    WHERE s.org_id = p_org_id
      AND s.date >= p_start_date AND s.date <= p_end_date
      AND (
        (s.draft_is_delete = TRUE AND array_length(s.published_shift_code_ids, 1) IS NOT NULL)
        OR (array_length(s.draft_shift_code_ids, 1) IS NOT NULL
            AND s.draft_shift_code_ids IS DISTINCT FROM s.published_shift_code_ids)
      )
  LOOP
    v_change_count := v_change_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'empId', r.emp_id,
      'date', r.date,
      'kind', CASE
        WHEN r.draft_is_delete THEN 'deleted'
        WHEN array_length(r.old_ids, 1) IS NULL THEN 'new'
        ELSE 'modified'
      END,
      'from', COALESCE(to_jsonb(r.old_ids), '[]'::JSONB),
      'to', CASE WHEN r.draft_is_delete THEN '[]'::JSONB ELSE COALESCE(to_jsonb(r.new_ids), '[]'::JSONB) END,
      'updatedBy', r.updated_by
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
  VALUES (p_org_id, auth.uid(), p_start_date, p_end_date, v_change_count, v_changes)
  RETURNING id INTO v_history_id;

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

  -- Purge old history (keep last 20 per org)
  DELETE FROM public.publish_history
  WHERE org_id = p_org_id
    AND id NOT IN (
      SELECT id FROM public.publish_history
      WHERE org_id = p_org_id
      ORDER BY published_at DESC
      LIMIT 20
    );

  RETURN v_history_id;
END;
$$;


-- ── send_invitation ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email        TEXT,
  p_role         TEXT,
  p_org_id       UUID,
  p_employee_id  UUID DEFAULT NULL
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

  INSERT INTO public.invitations (org_id, invited_by, email, role_to_assign, employee_id)
    VALUES (p_org_id, auth.uid(), lower(p_email), p_role::public.org_role, p_employee_id)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'invitation_id', v_invite.id,
    'token',         v_invite.token,
    'expires_at',    v_invite.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_invitation(TEXT, TEXT, UUID, UUID) TO authenticated;


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
  END IF;

  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (v_uid, v_invite.org_id, 'none', v_emp_first_name, v_emp_last_name)
  ON CONFLICT (id) DO UPDATE
    SET org_id     = COALESCE(profiles.org_id, EXCLUDED.org_id),
        first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
        last_name  = COALESCE(EXCLUDED.last_name, profiles.last_name),
        updated_at = NOW();

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
  v_caller_role TEXT;
BEGIN
  -- Authorization: gridmaster or super_admin in this org
  IF NOT public.is_gridmaster() THEN
    v_caller_role := public.caller_org_role()::TEXT;
    IF public.caller_org_id() <> p_org_id OR v_caller_role <> 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: only super_admin can link employees';
    END IF;
  END IF;

  -- Validate org exists
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = p_org_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Organization not found or archived';
  END IF;

  -- Validate employee belongs to org and is not already linked
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

  -- Validate user is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = p_user_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  -- Validate user is not already linked to another employee in this org
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE org_id = p_org_id AND user_id = p_user_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is already linked to another employee in this organization';
  END IF;

  -- Link them
  UPDATE public.employees
  SET user_id = p_user_id, updated_at = NOW()
  WHERE id = p_employee_id AND org_id = p_org_id;

  RETURN jsonb_build_object('status', 'linked', 'employee_id', p_employee_id, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_employee_to_user(UUID, UUID, UUID) TO authenticated;


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


-- ── create_shift_request ────────────────────────────────────────────────────
-- Creates a pickup or swap request. Validates shift ownership and snapshots data.

CREATE OR REPLACE FUNCTION public.create_shift_request(
  p_org_id              UUID,
  p_type                public.shift_request_type,
  p_requester_emp_id    UUID,
  p_requester_shift_date DATE,
  p_target_emp_id       UUID DEFAULT NULL,
  p_target_shift_date   DATE DEFAULT NULL,
  p_idempotency_key     UUID DEFAULT gen_random_uuid()
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request_id UUID;
  v_requester_shift RECORD;
  v_target_shift RECORD;
  v_requester_employee RECORD;
BEGIN
  -- Idempotency: return existing if already created
  SELECT id INTO v_request_id FROM public.shift_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_request_id; END IF;

  -- Validate requester is an active employee in this org
  SELECT id, user_id, status INTO v_requester_employee
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
  SELECT emp_id, date, published_shift_code_ids, focus_area_id,
         custom_start_time, custom_end_time
  INTO v_requester_shift
  FROM public.shifts
  WHERE emp_id = p_requester_emp_id AND date = p_requester_shift_date AND org_id = p_org_id;

  IF NOT FOUND OR array_length(v_requester_shift.published_shift_code_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No published shift found for this employee on this date';
  END IF;

  -- Check no off-day codes (can't avail an off day)
  IF EXISTS (
    SELECT 1 FROM public.shift_codes
    WHERE id = ANY(v_requester_shift.published_shift_code_ids)
      AND is_off_day = TRUE
  ) THEN
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
    SELECT emp_id, date, published_shift_code_ids, focus_area_id,
           custom_start_time, custom_end_time
    INTO v_target_shift
    FROM public.shifts
    WHERE emp_id = p_target_emp_id AND date = p_target_shift_date AND org_id = p_org_id;

    IF NOT FOUND OR array_length(v_target_shift.published_shift_code_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Target employee has no published shift on the specified date';
    END IF;

    -- Check target shift has no off-day codes
    IF EXISTS (
      SELECT 1 FROM public.shift_codes
      WHERE id = ANY(v_target_shift.published_shift_code_ids)
        AND is_off_day = TRUE
    ) THEN
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
      p_org_id, p_type, 'open',
      p_requester_emp_id, p_requester_shift_date, v_requester_shift.published_shift_code_ids,
      v_requester_shift.focus_area_id, v_requester_shift.custom_start_time, v_requester_shift.custom_end_time,
      p_target_emp_id, p_target_shift_date,
      v_target_shift.published_shift_code_ids,
      v_target_shift.focus_area_id,
      v_target_shift.custom_start_time,
      v_target_shift.custom_end_time,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_shift_code_ids,
      requester_focus_area_id, requester_custom_start_time, requester_custom_end_time,
      target_emp_id, target_shift_date,
      idempotency_key
    ) VALUES (
      p_org_id, p_type, 'open',
      p_requester_emp_id, p_requester_shift_date, v_requester_shift.published_shift_code_ids,
      v_requester_shift.focus_area_id, v_requester_shift.custom_start_time, v_requester_shift.custom_end_time,
      NULL, NULL,
      p_idempotency_key
    ) RETURNING id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_shift_request(UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID) TO authenticated;


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
  SELECT id, user_id, certification_id, status INTO v_claimer
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

  -- Block if claimer has a shift on the same date with overlapping time
  IF EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.emp_id = p_claimer_emp_id
      AND s.date = v_request.requester_shift_date
      AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
      AND public.shift_times_overlap(s.published_shift_code_ids, v_request.requester_shift_code_ids)
  ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Block if claimer is already involved in another active request on this date
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = v_request.org_id
      AND sr.id != p_request_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_claimer_emp_id AND sr.requester_shift_date = v_request.requester_shift_date)
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

  -- Advisory lock on involved shifts to prevent concurrent modifications.
  -- Acquire in deterministic order (alphabetical by key) to prevent deadlocks.
  IF v_request.type = 'pickup' THEN
    -- Lock both requester and target shifts (UPSERT may merge into target's existing row)
    IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
       < (v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
    THEN
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
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
  SELECT * INTO v_req_shift
  FROM public.shifts
  WHERE emp_id = v_request.requester_emp_id AND date = v_request.requester_shift_date;

  IF NOT FOUND OR v_req_shift.published_shift_code_ids IS DISTINCT FROM v_request.requester_shift_code_ids THEN
    RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
  END IF;

  IF v_request.type = 'pickup' THEN
    -- Re-check at approval: target must not have an overlapping shift on this date
    IF EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.emp_id = v_request.target_emp_id
        AND s.date = v_request.requester_shift_date
        AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
        AND public.shift_times_overlap(s.published_shift_code_ids, v_request.requester_shift_code_ids)
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
      focus_area_id, custom_start_time, custom_end_time,
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
      custom_start_time = CASE
        WHEN shifts.custom_start_time IS NOT NULL AND EXCLUDED.custom_start_time IS NOT NULL
          THEN shifts.custom_start_time || '|' || EXCLUDED.custom_start_time
        WHEN EXCLUDED.custom_start_time IS NOT NULL THEN EXCLUDED.custom_start_time
        ELSE shifts.custom_start_time
      END,
      custom_end_time = CASE
        WHEN shifts.custom_end_time IS NOT NULL AND EXCLUDED.custom_end_time IS NOT NULL
          THEN shifts.custom_end_time || '|' || EXCLUDED.custom_end_time
        WHEN EXCLUDED.custom_end_time IS NOT NULL THEN EXCLUDED.custom_end_time
        ELSE shifts.custom_end_time
      END,
      focus_area_id = CASE
        WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
        ELSE NULL
      END,
      updated_by = EXCLUDED.updated_by,
      updated_at = now();

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Failed to reassign shift: target employee not found';
    END IF;

  ELSIF v_request.type = 'swap' THEN
    -- Verify target's shift still exists as snapshotted
    SELECT * INTO v_tgt_shift
    FROM public.shifts
    WHERE emp_id = v_request.target_emp_id AND date = v_request.target_shift_date;

    IF NOT FOUND OR v_tgt_shift.published_shift_code_ids IS DISTINCT FROM v_request.target_shift_code_ids THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    -- Block if shifts have overlapping time slots (via shift_categories start/end times).
    -- Applies to both same-day and cross-day swaps.

    -- Same-day: block if requester and target shifts overlap in time (pointless swap)
    IF v_request.requester_shift_date = v_request.target_shift_date THEN
      IF public.shift_times_overlap(v_request.requester_shift_code_ids, v_request.target_shift_code_ids) THEN
        RAISE EXCEPTION 'Cannot approve: shifts have overlapping time slots';
      END IF;
    ELSE
      -- Cross-day: requester's existing shift on target_date vs incoming target codes
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.requester_emp_id AND s.date = v_request.target_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap(s.published_shift_code_ids, v_request.target_shift_code_ids)
      ) THEN
        RAISE EXCEPTION 'Cannot approve: requester would have overlapping shift times on the target''s date';
      END IF;

      -- Cross-day: target's existing shift on requester_date vs incoming requester codes
      IF EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE s.emp_id = v_request.target_emp_id AND s.date = v_request.requester_shift_date
          AND array_length(s.published_shift_code_ids, 1) IS NOT NULL
          AND public.shift_times_overlap(s.published_shift_code_ids, v_request.requester_shift_code_ids)
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
      focus_area_id, custom_start_time, custom_end_time,
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
      custom_start_time = CASE
        WHEN shifts.custom_start_time IS NOT NULL AND EXCLUDED.custom_start_time IS NOT NULL
          THEN shifts.custom_start_time || '|' || EXCLUDED.custom_start_time
        WHEN EXCLUDED.custom_start_time IS NOT NULL THEN EXCLUDED.custom_start_time
        ELSE shifts.custom_start_time
      END,
      custom_end_time = CASE
        WHEN shifts.custom_end_time IS NOT NULL AND EXCLUDED.custom_end_time IS NOT NULL
          THEN shifts.custom_end_time || '|' || EXCLUDED.custom_end_time
        WHEN EXCLUDED.custom_end_time IS NOT NULL THEN EXCLUDED.custom_end_time
        ELSE shifts.custom_end_time
      END,
      -- Keep existing focus area (double shift spans areas; NULL if they differ)
      focus_area_id = CASE
        WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
        ELSE NULL
      END,
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
      focus_area_id, custom_start_time, custom_end_time,
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
      custom_start_time = CASE
        WHEN shifts.custom_start_time IS NOT NULL AND EXCLUDED.custom_start_time IS NOT NULL
          THEN shifts.custom_start_time || '|' || EXCLUDED.custom_start_time
        WHEN EXCLUDED.custom_start_time IS NOT NULL THEN EXCLUDED.custom_start_time
        ELSE shifts.custom_start_time
      END,
      custom_end_time = CASE
        WHEN shifts.custom_end_time IS NOT NULL AND EXCLUDED.custom_end_time IS NOT NULL
          THEN shifts.custom_end_time || '|' || EXCLUDED.custom_end_time
        WHEN EXCLUDED.custom_end_time IS NOT NULL THEN EXCLUDED.custom_end_time
        ELSE shifts.custom_end_time
      END,
      focus_area_id = CASE
        WHEN shifts.focus_area_id = EXCLUDED.focus_area_id THEN shifts.focus_area_id
        ELSE NULL
      END,
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
