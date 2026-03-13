-- ============================================================
-- Migration 080: Soft-delete for master data tables
--
-- Adds `archived_at TIMESTAMPTZ DEFAULT NULL` to all six master
-- data tables. NULL = active, non-NULL = archived.
--
-- When a shift code (or certification, role, etc.) is "deleted,"
-- the app sets archived_at instead of deleting the row. This
-- preserves all FK references and array IDs so historical shifts
-- always resolve their labels.
--
-- Changes:
--   1. Add archived_at column to 6 tables
--   2. Drop old unique constraints, recreate as partial indexes
--      excluding archived rows (allows re-creating same name)
--   3. Change regular_shifts/shift_series FK from CASCADE → RESTRICT
--   4. Add filtered indexes for efficient active-only queries
-- ============================================================


-- ── 1. Add archived_at column ────────────────────────────────────────────────

ALTER TABLE public.shift_codes      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.certifications   ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.company_roles    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.focus_areas      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.indicator_types  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.shift_categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;


-- ── 2. Update unique constraints to exclude archived rows ────────────────────

-- shift_codes: two partial indexes from migration 066
DROP INDEX IF EXISTS public.shift_codes_company_label_global_unique;
CREATE UNIQUE INDEX shift_codes_company_label_global_unique
  ON public.shift_codes (company_id, label)
  WHERE focus_area_id IS NULL AND archived_at IS NULL;

DROP INDEX IF EXISTS public.shift_codes_company_label_focus_area_unique;
CREATE UNIQUE INDEX shift_codes_company_label_focus_area_unique
  ON public.shift_codes (company_id, label, focus_area_id)
  WHERE focus_area_id IS NOT NULL AND archived_at IS NULL;

-- certifications: inline UNIQUE from migration 069
ALTER TABLE public.certifications
  DROP CONSTRAINT IF EXISTS certifications_company_id_name_key;
CREATE UNIQUE INDEX certifications_company_name_active_unique
  ON public.certifications (company_id, name)
  WHERE archived_at IS NULL;

-- company_roles: inline UNIQUE from migration 069
ALTER TABLE public.company_roles
  DROP CONSTRAINT IF EXISTS company_roles_company_id_name_key;
CREATE UNIQUE INDEX company_roles_company_name_active_unique
  ON public.company_roles (company_id, name)
  WHERE archived_at IS NULL;

-- focus_areas: originally wings table, constraint name preserved as wings_org_id_name_key
ALTER TABLE public.focus_areas
  DROP CONSTRAINT IF EXISTS wings_org_id_name_key;
CREATE UNIQUE INDEX focus_areas_company_name_active_unique
  ON public.focus_areas (company_id, name)
  WHERE archived_at IS NULL;

-- indicator_types: constraint name preserved as indicator_types_org_id_name_key
ALTER TABLE public.indicator_types
  DROP CONSTRAINT IF EXISTS indicator_types_org_id_name_key;
CREATE UNIQUE INDEX indicator_types_company_name_active_unique
  ON public.indicator_types (company_id, name)
  WHERE archived_at IS NULL;

-- shift_categories: two partial indexes from migration 054
DROP INDEX IF EXISTS public.shift_categories_global_name_unique;
CREATE UNIQUE INDEX shift_categories_global_name_unique
  ON public.shift_categories (company_id, name)
  WHERE focus_area_id IS NULL AND archived_at IS NULL;

DROP INDEX IF EXISTS public.shift_categories_area_name_unique;
CREATE UNIQUE INDEX shift_categories_area_name_unique
  ON public.shift_categories (company_id, focus_area_id, name)
  WHERE focus_area_id IS NOT NULL AND archived_at IS NULL;


-- ── 3. Change FK behavior: CASCADE → RESTRICT ───────────────────────────────
-- With soft-delete, the app never hard-deletes shift codes. RESTRICT acts as
-- a safety net: if someone tries to raw-SQL DELETE a referenced code, it fails
-- instead of silently cascade-deleting templates and series.

-- regular_shifts.shift_code_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    USING (constraint_name, table_schema)
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'regular_shifts'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'shift_code_id';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.regular_shifts DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.regular_shifts
  ADD CONSTRAINT regular_shifts_shift_code_id_fkey
    FOREIGN KEY (shift_code_id) REFERENCES public.shift_codes(id) ON DELETE RESTRICT;

-- shift_series.shift_code_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    USING (constraint_name, table_schema)
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'shift_series'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'shift_code_id';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shift_series DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.shift_series
  ADD CONSTRAINT shift_series_shift_code_id_fkey
    FOREIGN KEY (shift_code_id) REFERENCES public.shift_codes(id) ON DELETE RESTRICT;


-- ── 4. Add filtered indexes for efficient active-only queries ────────────────

CREATE INDEX IF NOT EXISTS idx_shift_codes_active
  ON public.shift_codes (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certifications_active
  ON public.certifications (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_roles_active
  ON public.company_roles (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_focus_areas_active
  ON public.focus_areas (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_indicator_types_active
  ON public.indicator_types (company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shift_categories_active
  ON public.shift_categories (company_id) WHERE archived_at IS NULL;


-- ============================================================
-- Part B: Remove legacy JWT claims & rename admin permission key
--
-- 1. Rename JSONB key canManageOrgSettings → canManageCompanySettings
--    in profiles.admin_permissions
-- 2. Update custom_access_token_hook to stop emitting legacy
--    org_id, org_slug claims (only emit company_id, company_slug)
-- ============================================================


-- ── B1. Rename admin_permissions JSONB key ──────────────────────────────────
UPDATE public.profiles
SET admin_permissions = (
  admin_permissions - 'canManageOrgSettings'
  || jsonb_build_object('canManageCompanySettings', admin_permissions -> 'canManageOrgSettings')
)
WHERE admin_permissions IS NOT NULL
  AND admin_permissions ? 'canManageOrgSettings';


-- ── B2. Remove legacy org_id/org_slug from JWT hook ─────────────────────────
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
