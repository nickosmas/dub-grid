-- ============================================================================
-- Migration 088: Deduplicate profiles ↔ company_memberships
--
-- Removes company_role and admin_permissions from profiles.
-- company_memberships becomes the single source of truth for per-company
-- role and permissions. The JWT hook, RLS helpers, and RPCs are updated
-- to JOIN company_memberships using profiles.company_id (the active company).
-- ============================================================================


-- ── 1. Update custom_access_token_hook ────────────────────────────────────────
-- Now JOINs company_memberships to get company_role for the active company.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL VOLATILE SECURITY DEFINER
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
    COALESCE(cm.company_role::TEXT, 'user') AS company_role,
    c.slug                 AS company_slug
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.company_memberships cm
    ON cm.user_id = p.id AND cm.company_id = p.company_id
  LEFT JOIN public.companies c ON c.id = p.company_id
  WHERE p.id = uid;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',  to_jsonb(user_profile.platform_role));
    claims := jsonb_set(claims, '{company_role}',   to_jsonb(user_profile.company_role));
    IF user_profile.company_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{company_id}',   to_jsonb(user_profile.company_id::TEXT));
      claims := jsonb_set(claims, '{company_slug}', to_jsonb(COALESCE(user_profile.company_slug, '')));
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{company_role}',  '"user"');
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

ALTER FUNCTION public.custom_access_token_hook(jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;


-- ── 2. Update caller_company_role() ───────────────────────────────────────────
-- Reads from company_memberships via the caller's active company_id.

CREATE OR REPLACE FUNCTION public.caller_company_role()
RETURNS public.company_role
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(cm.company_role, 'user'::public.company_role)
  FROM public.profiles p
  LEFT JOIN public.company_memberships cm
    ON cm.user_id = p.id AND cm.company_id = p.company_id
  WHERE p.id = auth.uid();
$$;


-- ── 3. Update switch_company() ────────────────────────────────────────────────
-- No longer copies role/perms into profiles — just validates membership
-- and updates the active company pointer.

CREATE OR REPLACE FUNCTION public.switch_company(target_company_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();

  -- Gridmaster bypass: validate company exists but don't update profiles
  -- (gridmaster_no_org constraint requires NULL company_id).
  IF public.is_gridmaster() THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
      RAISE EXCEPTION 'Company not found';
    END IF;
    RETURN;
  END IF;

  -- Regular users: validate membership exists
  IF NOT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id = v_uid AND company_id = target_company_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  -- Update active company pointer only
  UPDATE public.profiles
  SET company_id = target_company_id,
      updated_at = NOW()
  WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_company(UUID) TO authenticated;


-- ── 4. Update change_user_role() ──────────────────────────────────────────────
-- Reads/writes company_role on company_memberships instead of profiles.

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
  v_target_company_id    UUID;
  v_caller_platform_role TEXT;
  v_caller_company_role  TEXT;
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

  -- 2. Get target user's active company from profiles.
  SELECT company_id INTO v_target_company_id
  FROM profiles
  WHERE id = p_target_user_id;

  IF v_target_company_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active company';
  END IF;

  -- 3. Lock the target's membership row and read current role.
  SELECT company_role::TEXT INTO v_old_role
  FROM company_memberships
  WHERE user_id = p_target_user_id AND company_id = v_target_company_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user has no membership for their active company';
  END IF;

  -- 4. Read the caller's role from auth.uid().
  SELECT p.platform_role::TEXT, p.company_id
  INTO v_caller_platform_role, v_caller_company_id
  FROM profiles p
  WHERE p.id = auth.uid();

  SELECT cm.company_role::TEXT INTO v_caller_company_role
  FROM company_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.company_id = v_caller_company_id;

  IF v_caller_company_role IS NULL AND v_caller_platform_role <> 'gridmaster' THEN
    RAISE EXCEPTION 'Caller not found or has no membership';
  END IF;

  -- 5. Only admins, super_admins, and gridmasters are authorised to change roles.
  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_company_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- 6. Non-gridmaster admins/super_admins may only change roles within their own company.
  IF v_caller_platform_role <> 'gridmaster' THEN
    IF v_caller_company_id IS NULL OR v_caller_company_id <> v_target_company_id THEN
      RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your company';
    END IF;
  END IF;

  -- 7. Admins cannot promote to admin, super_admin, or gridmaster.
  IF COALESCE(v_caller_company_role, 'user') = 'admin'
     AND p_new_role IN ('gridmaster', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin, super_admin, or gridmaster';
  END IF;

  -- 8. Apply the role change on company_memberships.
  UPDATE company_memberships
  SET company_role = p_new_role::company_role
  WHERE user_id = p_target_user_id AND company_id = v_target_company_id;

  -- 9. Bump version on profiles for optimistic locking.
  UPDATE profiles
  SET version    = version + 1,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  -- 10. Write immutable audit log record.
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 11. Write JWT refresh lock to force token refresh after role change.
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


-- ── 5. Update assign_company_role_by_email() ──────────────────────────────────
-- Writes to company_memberships. Also ensures a profiles row exists with the
-- company as the active company (if not already set).

CREATE OR REPLACE FUNCTION public.assign_company_role_by_email(
  p_email        TEXT,
  p_company_id   UUID,
  p_company_role public.company_role DEFAULT 'user'
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT (
    public.is_gridmaster()
    OR (
      public.caller_company_id() = p_company_id
      AND public.caller_company_role() IN ('admin', 'super_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = p_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;

  -- Ensure a profiles row exists (company_id defaults to the assigned company
  -- if they don't have an active one yet).
  INSERT INTO public.profiles (id, company_id, platform_role)
  VALUES (target_user_id, p_company_id, 'none')
  ON CONFLICT (id) DO UPDATE
    SET company_id = COALESCE(profiles.company_id, EXCLUDED.company_id),
        updated_at = NOW();

  -- Upsert into company_memberships (the authoritative source for roles).
  INSERT INTO public.company_memberships (user_id, company_id, company_role)
  VALUES (target_user_id, p_company_id, p_company_role)
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET company_role = EXCLUDED.company_role;
END;
$$;


-- ── 6. Update get_all_users_with_profiles() ───────────────────────────────────
-- JOINs company_memberships for company_role.

DROP FUNCTION IF EXISTS public.get_all_users_with_profiles();

CREATE OR REPLACE FUNCTION public.get_all_users_with_profiles()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  platform_role   public.platform_role,
  company_role    public.company_role,
  org_id          UUID,
  org_name        TEXT,
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
    COALESCE(cm.company_role, 'user'::public.company_role) AS company_role,
    p.company_id AS org_id,
    o.name       AS org_name,
    p.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  LEFT JOIN public.company_memberships cm
    ON cm.user_id = p.id AND cm.company_id = p.company_id
  LEFT JOIN public.companies o ON p.company_id = o.id
  ORDER BY u.email ASC;
END;
$$;


-- ── 7. Drop the sync trigger (no role on profiles to sync) ────────────────────

DROP TRIGGER IF EXISTS sync_profile_role_to_membership ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_to_membership();


-- ── 8. Drop columns from profiles ────────────────────────────────────────────
-- company_memberships is now the single source of truth.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS company_role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS admin_permissions;
