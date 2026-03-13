-- ============================================================
-- Migration 077: Legacy terminology cleanup
--
-- Updates all SQL functions to use current terminology:
--   organization → company
--   org_id       → company_id
--   org_role     → company_role
--   org_slug     → company_slug
--
-- Changes:
--   1.  change_user_role       — Fix broken column refs (org_role → company_role, org_id → company_id)
--   2.  start_impersonation    — Fix broken column ref  (profiles.org_id → company_id)
--   3.  Rename column           impersonation_sessions.target_org_id → target_company_id
--   4.  caller_company_id()    — New primary function; caller_org_id() becomes shim
--   5.  Drop caller_org_role() shim (all callers updated in this migration)
--   6.  publish_schedule        — Rename param p_org_id → p_company_id
--   7.  send_invitation         — Rename param p_org_id → p_company_id, use caller_company_role()
--   8.  get_all_users_with_profiles — Rename return columns org_id/org_name → company_id/company_name
--   9.  get_system_stats        — Rename JSON key org_count → company_count
--  10.  generate_company_slug   — New primary; drop generate_org_slug
--  11.  Drop assign_org_role_by_email & assign_org_admin_by_email shims
--  12.  custom_access_token_hook — Emit company_id/company_slug alongside org_id/org_slug
-- ============================================================


-- ── 1. Fix change_user_role ─────────────────────────────────────────────────
-- The function references profiles.org_role and profiles.org_id which were
-- renamed in migrations 048/053. This is BROKEN — any call would error with
-- "column org_role does not exist".

CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role             TEXT;
  v_company_id           UUID;
  v_caller_company_role  TEXT;
  v_caller_platform_role TEXT;
  v_caller_company_id    UUID;
BEGIN
  -- 0. Verify p_changed_by_id matches the actual authenticated caller.
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- 1. Idempotency check: return early if this key was already processed.
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 2. Lock the target row to serialize concurrent role changes.
  SELECT company_role::TEXT, company_id INTO v_old_role, v_company_id
    FROM profiles
   WHERE id = p_target_user_id
     FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 3. Read the caller's role from auth.uid() — never from the caller-supplied param.
  SELECT company_role::TEXT, platform_role::TEXT, company_id
    INTO v_caller_company_role, v_caller_platform_role, v_caller_company_id
    FROM profiles
   WHERE id = auth.uid();

  IF v_caller_company_role IS NULL THEN
    RAISE EXCEPTION 'Caller not found';
  END IF;

  -- 4. Only admins, super_admins, and gridmasters are authorised to change roles.
  IF v_caller_platform_role <> 'gridmaster'
     AND v_caller_company_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- 5. Non-gridmaster admins/super_admins may only change roles within their own company.
  IF v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_company_id IS NULL OR v_caller_company_id <> v_company_id THEN
      RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your company';
    END IF;
  END IF;

  -- 6. Admins cannot promote to admin, super_admin, or gridmaster.
  IF v_caller_company_role = 'admin' AND p_new_role IN ('gridmaster', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin, super_admin, or gridmaster';
  END IF;

  -- 7. Apply the role change with version increment.
  UPDATE profiles
     SET company_role = p_new_role::company_role,
         version      = version + 1,
         updated_at   = NOW()
   WHERE id = p_target_user_id;

  -- 8. Write immutable audit log record.
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 9. Write JWT refresh lock to force token refresh after role change.
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds',
        reason       = 'role_change';

  RETURN jsonb_build_object(
    'status',    'success',
    'from_role', v_old_role,
    'to_role',   p_new_role
  );
END;
$$;

COMMENT ON FUNCTION public.change_user_role IS
  'Race-condition-safe role change RPC. Verifies caller identity via auth.uid(), '
  'gates on admin/super_admin/gridmaster, enforces company scoping, and prevents '
  'admin self-promotion.';


-- ── 2. Fix start_impersonation ──────────────────────────────────────────────
-- References profiles.org_id which was renamed to company_id in migration 048.

CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session impersonation_sessions;
  v_target_company_id UUID;
BEGIN
  -- Verify caller is gridmaster
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Only gridmaster can impersonate users';
  END IF;

  -- Get target user's company_id for scoping data access
  SELECT company_id INTO v_target_company_id
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_target_company_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no company';
  END IF;

  -- Create session with 30-minute expiry
  INSERT INTO impersonation_sessions (gridmaster_id, target_user_id, target_company_id)
    VALUES (auth.uid(), p_target_user_id, v_target_company_id)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id', v_session.session_id,
    'expires_at', v_session.expires_at
  );
END;
$$;


-- ── 3. Rename impersonation_sessions.target_org_id → target_company_id ──────

ALTER TABLE public.impersonation_sessions
  RENAME COLUMN target_org_id TO target_company_id;


-- ── 4. caller_company_id() — new primary, caller_org_id() becomes shim ──────

CREATE OR REPLACE FUNCTION public.caller_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Keep old name as a shim — every RLS policy calls this.
CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT public.caller_company_id();
$$;


-- ── 5. Drop caller_org_role() shim ──────────────────────────────────────────
-- All callers (send_invitation, RLS policies) now use caller_company_role().

DROP FUNCTION IF EXISTS public.caller_org_role();


-- ── 6. publish_schedule — rename param p_org_id → p_company_id ──────────────
-- Must DROP first — CREATE OR REPLACE cannot rename parameters.

DROP FUNCTION IF EXISTS public.publish_schedule(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  -- Permission check
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_company_id() = p_company_id
      AND public.caller_company_role()::TEXT IN ('super_admin', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- ── A. SHIFTS ──────────────────────────────────────────────────────────────

  -- 1. Handle deletion drafts: clear the published side
  UPDATE public.shifts
  SET published_shift_code_ids = '{}',
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND draft_is_delete = TRUE;

  -- 2. Publish non-delete drafts: copy draft → published
  UPDATE public.shifts
  SET published_shift_code_ids = draft_shift_code_ids,
      draft_shift_code_ids = '{}',
      draft_is_delete = FALSE,
      updated_at = NOW(),
      updated_by = auth.uid()
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND array_length(draft_shift_code_ids, 1) > 0
    AND draft_is_delete = FALSE;

  -- 3. Clean up empty rows (both sides empty, no delete pending)
  DELETE FROM public.shifts
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (published_shift_code_ids = '{}' OR published_shift_code_ids IS NULL)
    AND (draft_shift_code_ids = '{}' OR draft_shift_code_ids IS NULL)
    AND draft_is_delete = FALSE;

  -- ── B. NOTES ───────────────────────────────────────────────────────────────

  UPDATE public.schedule_notes
  SET status = 'published',
      updated_at = NOW()
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft';

  DELETE FROM public.schedule_notes
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND status = 'draft_deleted';

END;
$$;


-- ── 7. send_invitation — rename param, use caller_company_role() ────────────
-- Must DROP first — CREATE OR REPLACE cannot rename parameters.

DROP FUNCTION IF EXISTS public.send_invitation(TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.send_invitation(
  p_email      TEXT,
  p_role       TEXT,
  p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Authorization: only gridmasters or admins/super_admins of the target company may invite
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_company_id() = p_company_id
      AND public.caller_company_role()::TEXT IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only company admins can send invitations';
  END IF;

  -- Clean up expired invites for the same email/company
  DELETE FROM public.invitations
   WHERE company_id = p_company_id
     AND email = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- Insert new invite with 72-hour expiry (default from table definition)
  INSERT INTO public.invitations (company_id, invited_by, email, role_to_assign)
    VALUES (p_company_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  RETURN jsonb_build_object(
    'token',      v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;


-- ── 8. get_all_users_with_profiles — rename return columns ──────────────────

DROP FUNCTION IF EXISTS public.get_all_users_with_profiles();

CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  platform_role   public.platform_role,
  company_role    public.company_role,
  company_id      UUID,
  company_name    TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    p.platform_role,
    p.company_role,
    p.company_id,
    c.name       AS company_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.companies c ON p.company_id = c.id
  ORDER BY u.email ASC;
END;
$$;


-- ── 9. get_system_stats — rename JSON key ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'company_count',   (SELECT count(*) FROM public.companies),
    'user_count',      (SELECT count(*) FROM public.profiles),
    'shift_count',     (SELECT count(*) FROM public.shifts),
    'active_sessions', (SELECT count(*) FROM auth.sessions WHERE not_after > now())
  ) INTO result;

  RETURN result;
END;
$$;


-- ── 10. generate_company_slug — new primary, drop old ───────────────────────

CREATE OR REPLACE FUNCTION public.generate_company_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
$$;

DROP FUNCTION IF EXISTS public.generate_org_slug(TEXT);


-- ── 11. Drop backward-compat shims ─────────────────────────────────────────
-- assign_org_role_by_email and assign_org_admin_by_email were shims created
-- in migration 053. No client code calls them after this migration.

DROP FUNCTION IF EXISTS public.assign_org_role_by_email(TEXT, UUID, public.company_role);
DROP FUNCTION IF EXISTS public.assign_org_admin_by_email(UUID, TEXT);


-- ── 12. custom_access_token_hook — emit both old+new JWT claim keys ─────────
-- Adds company_id and company_slug claims alongside existing org_id/org_slug
-- so client code can gradually migrate to the new names.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
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

  DELETE FROM public.jwt_refresh_locks
   WHERE user_id = uid AND locked_until <= NOW();

  SELECT
    p.company_id,
    p.platform_role::TEXT  AS platform_role,
    p.company_role::TEXT   AS company_role,
    c.slug                 AS company_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',  to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{company_role}',   to_jsonb(user_profile.company_role));
    IF user_profile.company_id IS NOT NULL THEN
      -- New canonical claim keys
      claims := jsonb_set(claims, '{company_id}',   to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{company_slug}', to_jsonb(COALESCE(user_profile.company_slug, '')));
      -- Backward-compat keys (remove in a future migration after all clients are updated)
      claims := jsonb_set(claims, '{org_id}',       to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}',     to_jsonb(COALESCE(user_profile.company_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{company_role}',  '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
