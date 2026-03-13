-- ============================================================================
-- Migration 087: Multi-company membership
--
-- Adds a junction table so users can belong to multiple companies.
-- profiles.company_id remains the "active" company; switch_company
-- validates membership before allowing a switch and copies the
-- role + admin_permissions from the membership row into profiles.
-- ============================================================================

-- ── 1. Junction table ───────────────────────────────────────────────────────

CREATE TABLE public.company_memberships (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_role      public.company_role NOT NULL DEFAULT 'user',
  admin_permissions JSONB DEFAULT NULL,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

CREATE INDEX idx_company_memberships_user_id
  ON public.company_memberships(user_id);

CREATE INDEX idx_company_memberships_company_id
  ON public.company_memberships(company_id);

-- ── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships (needed for company switcher)
CREATE POLICY "own_memberships_select"
  ON public.company_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins/super_admins can see memberships in their active company
CREATE POLICY "admin_memberships_select"
  ON public.company_memberships FOR SELECT TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- Gridmaster can see and manage all memberships
CREATE POLICY "gridmaster_all_memberships"
  ON public.company_memberships FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- Super_admins can insert memberships for their company
CREATE POLICY "super_admin_insert_memberships"
  ON public.company_memberships FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() = 'super_admin'
  );

-- Super_admins can update memberships in their company
CREATE POLICY "super_admin_update_memberships"
  ON public.company_memberships FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() = 'super_admin'
  )
  WITH CHECK (company_id = public.caller_company_id());

-- Super_admins can remove memberships from their company
CREATE POLICY "super_admin_delete_memberships"
  ON public.company_memberships FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() = 'super_admin'
  );

-- ── 3. Validated switch_company (supersedes migration 086) ──────────────────

CREATE OR REPLACE FUNCTION public.switch_company(target_company_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_membership RECORD;
  v_uid        UUID;
BEGIN
  v_uid := auth.uid();

  -- Gridmaster bypass: they have NULL company_id (gridmaster_no_org constraint)
  -- so we just validate the company exists but don't update profiles.
  IF public.is_gridmaster() THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
      RAISE EXCEPTION 'Company not found';
    END IF;
    RETURN;
  END IF;

  -- Regular users: validate membership exists
  SELECT company_role, admin_permissions
  INTO v_membership
  FROM public.company_memberships
  WHERE user_id = v_uid
    AND company_id = target_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  -- Update active company + copy role/perms from membership
  UPDATE public.profiles
  SET company_id        = target_company_id,
      company_role      = v_membership.company_role,
      admin_permissions = v_membership.admin_permissions,
      updated_at        = NOW()
  WHERE id = v_uid;
END;
$$;

-- Grant already exists from migration 086, but re-state for clarity
GRANT EXECUTE ON FUNCTION public.switch_company(UUID) TO authenticated;

-- ── 4. Sync trigger: profiles → company_memberships ─────────────────────────
-- When company_role or admin_permissions is updated on profiles (e.g. by
-- super_admin changing someone's role), sync back to the membership row
-- so switch_company copies the correct values later.

CREATE OR REPLACE FUNCTION public.sync_profile_to_membership()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.platform_role = 'gridmaster' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NOT NULL AND (
    OLD.company_role IS DISTINCT FROM NEW.company_role
    OR OLD.admin_permissions IS DISTINCT FROM NEW.admin_permissions
  ) THEN
    UPDATE public.company_memberships
    SET company_role      = NEW.company_role,
        admin_permissions = NEW.admin_permissions
    WHERE user_id = NEW.id
      AND company_id = NEW.company_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_profile_role_to_membership
  AFTER UPDATE OF company_role, admin_permissions ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_membership();

-- ── 5. Backfill existing profiles into memberships ──────────────────────────

INSERT INTO public.company_memberships (user_id, company_id, company_role, admin_permissions)
SELECT id, company_id, company_role, admin_permissions
FROM public.profiles
WHERE company_id IS NOT NULL
  AND platform_role <> 'gridmaster'
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ── 6. get_my_companies() RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_companies()
RETURNS TABLE (
  company_id   UUID,
  company_name TEXT,
  company_slug TEXT,
  company_role public.company_role,
  is_active    BOOLEAN
)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid        UUID;
  v_active_cid UUID;
BEGIN
  v_uid := auth.uid();

  SELECT p.company_id INTO v_active_cid
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- Gridmaster sees all companies
  IF public.is_gridmaster() THEN
    RETURN QUERY
    SELECT
      c.id   AS company_id,
      c.name AS company_name,
      c.slug AS company_slug,
      'user'::public.company_role AS company_role,
      (c.id = v_active_cid) AS is_active
    FROM public.companies c
    ORDER BY c.name;
    RETURN;
  END IF;

  -- Regular users: only their memberships
  RETURN QUERY
  SELECT
    cm.company_id,
    c.name  AS company_name,
    c.slug  AS company_slug,
    cm.company_role,
    (cm.company_id = v_active_cid) AS is_active
  FROM public.company_memberships cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = v_uid
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_companies() TO authenticated;
