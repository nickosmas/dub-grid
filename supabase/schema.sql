-- DubGrid schema (multi-tenant)
-- Run this once in the Supabase SQL Editor

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name           text NOT NULL DEFAULT 'My Organization',
  slug           text UNIQUE,
  address        text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  employee_count integer,
  skill_levels   text[] NOT NULL DEFAULT ARRAY['JLCSN','CSN III','CSN II','STAFF','—'::text],
  roles          text[] NOT NULL DEFAULT ARRAY['DCSN','DVCSN','Supv','Mentor','CN','SC. Mgr.','Activity Coordinator','SC/Asst/Act/Cor'::text],
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT organizations_name_key UNIQUE (name)
);

-- ── Org Members (links Supabase Auth users to organizations) ──────────────────
-- Used by RLS policies to scope data access per tenant.
CREATE TABLE IF NOT EXISTS org_members (
  org_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL,
  role     text NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  PRIMARY KEY (org_id, user_id)
);

-- ── Wings (dynamic per org — replaces hardcoded WINGS constant) ───────────────
CREATE TABLE IF NOT EXISTS wings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color_bg    text NOT NULL DEFAULT '#F1F5F9',
  color_text  text NOT NULL DEFAULT '#475569',
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, name)
);

-- ── Shift Types (dynamic per org — replaces hardcoded SHIFT_TYPES constant) ───
-- wing_name: NULL = general shift; otherwise the wing this shift belongs to.
-- is_general: true = also shown in the "General" section of the shift picker.
CREATE TABLE IF NOT EXISTS shift_types (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label               text NOT NULL,
  name                text NOT NULL,
  color               text NOT NULL DEFAULT '#F8FAFC',
  border_color        text NOT NULL DEFAULT '#CBD5E1',
  text_color          text NOT NULL DEFAULT '#64748B',
  counts_toward_day   boolean NOT NULL DEFAULT false,
  counts_toward_eve   boolean NOT NULL DEFAULT false,
  counts_toward_night boolean NOT NULL DEFAULT false,
  is_orientation      boolean NOT NULL DEFAULT false,
  is_general          boolean NOT NULL DEFAULT false,
  wing_name           text,
  sort_order          integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, label)
);

-- ── Employees ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text         NOT NULL,
  designation   text         NOT NULL DEFAULT 'STAFF',
  roles         text[]       NOT NULL DEFAULT '{}',
  fte_weight    numeric(4,2) NOT NULL DEFAULT 1.0,
  seniority     integer      NOT NULL,
  wings         text[]       NOT NULL DEFAULT '{}',
  phone         text         NOT NULL DEFAULT '',
  email         text         NOT NULL DEFAULT '',
  contact_notes text         NOT NULL DEFAULT '',
  UNIQUE(org_id, name)
);

-- ── Shifts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  emp_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        date   NOT NULL,
  shift_label text   NOT NULL,
  PRIMARY KEY (emp_id, date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS organizations_id_idx    ON organizations(id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON org_members(user_id);
CREATE INDEX IF NOT EXISTS wings_org_id_idx        ON wings(org_id);
CREATE INDEX IF NOT EXISTS shift_types_org_id_idx  ON shift_types(org_id);
CREATE INDEX IF NOT EXISTS employees_org_id_idx    ON employees(org_id);
CREATE INDEX IF NOT EXISTS shifts_emp_id_idx       ON shifts(emp_id);
CREATE INDEX IF NOT EXISTS shifts_date_idx         ON shifts(date);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts        ENABLE ROW LEVEL SECURITY;

-- Helper: returns org IDs the authenticated user belongs to
CREATE OR REPLACE FUNCTION current_user_orgs()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid();
$$;

-- RBAC helper: is the current user a Gridmaster?
CREATE OR REPLACE FUNCTION public.is_gridmaster()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND platform_role = 'gridmaster'::public.platform_role
  );
$$;

-- RBAC helper: caller's org_id from profiles
CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Policies for AUTHENTICATED users (multi-tenant, org-scoped) ───────────────

CREATE POLICY "auth_orgs_select" ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT current_user_orgs()) OR is_gridmaster());
CREATE POLICY "auth_orgs_insert" ON organizations FOR INSERT TO authenticated
  WITH CHECK (is_gridmaster());
CREATE POLICY "auth_orgs_update" ON organizations FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin') OR is_gridmaster());

CREATE POLICY "auth_org_members_select" ON org_members FOR SELECT TO authenticated
  USING (org_id IN (SELECT current_user_orgs()) OR is_gridmaster());
-- Only Gridmasters and org admins can add new members to an org.
-- Note: Supabase doesn't natively support subqueries in WITH CHECK easily if it causes infinite recursion.
-- But since current_user_orgs() checks SELECT which depends on id IN current_user_orgs(), no recursion here.
CREATE POLICY "auth_org_members_insert" ON org_members FOR INSERT TO authenticated
  WITH CHECK (
    is_gridmaster() OR 
    (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin'))
  );

CREATE POLICY "auth_wings_select" ON wings FOR SELECT TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_wings_insert" ON wings FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_wings_update" ON wings FOR UPDATE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_wings_delete" ON wings FOR DELETE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));

CREATE POLICY "auth_shift_types_select" ON shift_types FOR SELECT TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_shift_types_insert" ON shift_types FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_shift_types_update" ON shift_types FOR UPDATE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_shift_types_delete" ON shift_types FOR DELETE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));

CREATE POLICY "auth_employees_select" ON employees FOR SELECT TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_employees_insert" ON employees FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_employees_update" ON employees FOR UPDATE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));
CREATE POLICY "auth_employees_delete" ON employees FOR DELETE TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));

CREATE POLICY "auth_shifts_select" ON shifts FOR SELECT TO authenticated
  USING (emp_id IN (SELECT id FROM employees WHERE org_id IN (SELECT current_user_orgs())));
CREATE POLICY "auth_shifts_insert" ON shifts FOR INSERT TO authenticated
  WITH CHECK (emp_id IN (SELECT id FROM employees WHERE org_id IN (SELECT current_user_orgs())));
CREATE POLICY "auth_shifts_update" ON shifts FOR UPDATE TO authenticated
  USING (emp_id IN (SELECT id FROM employees WHERE org_id IN (SELECT current_user_orgs())));
CREATE POLICY "auth_shifts_delete" ON shifts FOR DELETE TO authenticated
  USING (emp_id IN (SELECT id FROM employees WHERE org_id IN (SELECT current_user_orgs())));

-- ── Policies for ANON role (single-tenant / pre-auth mode) ───────────────────
-- These allow the app to work without Supabase Auth configured.
-- Removed to enforce multi-tenancy auth.

-- CREATE POLICY "anon_organizations_all" ON organizations FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_wings_all"         ON wings         FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_shift_types_all"   ON shift_types   FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_employees_all"     ON employees     FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_shifts_all"        ON shifts        FOR ALL TO anon USING (true) WITH CHECK (true);
