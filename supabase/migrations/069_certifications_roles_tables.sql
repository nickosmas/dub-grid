-- Migration 069: Extract certifications & roles from companies JSONB into their own tables
-- Mirrors the focus_areas table pattern.

-- ── Create tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.certifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  abbr        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS certifications_company_id_idx ON public.certifications(company_id);

CREATE TABLE IF NOT EXISTS public.company_roles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  abbr        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS company_roles_company_id_idx ON public.company_roles(company_id);

-- ── Migrate data from JSONB columns ──────────────────────────────────────────

INSERT INTO public.certifications (company_id, name, abbr, sort_order)
SELECT
  c.id,
  (elem->>'name')::text,
  COALESCE((elem->>'abbr')::text, (elem->>'name')::text),
  (row_number() OVER (PARTITION BY c.id ORDER BY ordinality) - 1)::int
FROM public.companies c,
     jsonb_array_elements(c.skill_levels) WITH ORDINALITY AS t(elem, ordinality)
WHERE c.skill_levels IS NOT NULL AND jsonb_array_length(c.skill_levels) > 0;

INSERT INTO public.company_roles (company_id, name, abbr, sort_order)
SELECT
  c.id,
  (elem->>'name')::text,
  COALESCE((elem->>'abbr')::text, (elem->>'name')::text),
  (row_number() OVER (PARTITION BY c.id ORDER BY ordinality) - 1)::int
FROM public.companies c,
     jsonb_array_elements(c.roles) WITH ORDINALITY AS t(elem, ordinality)
WHERE c.roles IS NOT NULL AND jsonb_array_length(c.roles) > 0;

-- ── Drop old JSONB columns ───────────────────────────────────────────────────

ALTER TABLE public.companies DROP COLUMN IF EXISTS skill_levels;
ALTER TABLE public.companies DROP COLUMN IF EXISTS roles;

-- ── RLS — certifications ─────────────────────────────────────────────────────

ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gridmaster_all_certifications"
  ON public.certifications FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_certifications"
  ON public.certifications FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admin_insert_certifications"
  ON public.certifications FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_certifications"
  ON public.certifications FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_certifications"
  ON public.certifications FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- ── RLS — company_roles ──────────────────────────────────────────────────────

ALTER TABLE public.company_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gridmaster_all_company_roles"
  ON public.company_roles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "org_members_select_company_roles"
  ON public.company_roles FOR SELECT TO authenticated
  USING (company_id = public.caller_org_id());

CREATE POLICY "admin_insert_company_roles"
  ON public.company_roles FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_company_roles"
  ON public.company_roles FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_org_id());

CREATE POLICY "admin_delete_company_roles"
  ON public.company_roles FOR DELETE TO authenticated
  USING (
    company_id = public.caller_org_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );
