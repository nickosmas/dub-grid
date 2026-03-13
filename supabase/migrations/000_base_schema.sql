-- ============================================================
-- Migration 000: Base schema (tables that pre-existed RBAC migrations)
-- ============================================================
-- Creates the foundational tables that migration 001+ expects.
-- Functions and RLS policies are created by later migrations.

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Organizations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
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

-- ── Org Members ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_members (
  org_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL,
  role     text NOT NULL DEFAULT 'member',
  PRIMARY KEY (org_id, user_id)
);

-- ── Wings ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color_bg    text NOT NULL DEFAULT '#F1F5F9',
  color_text  text NOT NULL DEFAULT '#475569',
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, name)
);

-- ── Shift Types ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_types (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.employees (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.shifts (
  emp_id      uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date        date   NOT NULL,
  shift_label text   NOT NULL,
  PRIMARY KEY (emp_id, date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS organizations_id_idx    ON public.organizations(id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS wings_org_id_idx        ON public.wings(org_id);
CREATE INDEX IF NOT EXISTS shift_types_org_id_idx  ON public.shift_types(org_id);
CREATE INDEX IF NOT EXISTS employees_org_id_idx    ON public.employees(org_id);
CREATE INDEX IF NOT EXISTS shifts_emp_id_idx       ON public.shifts(emp_id);
CREATE INDEX IF NOT EXISTS shifts_date_idx         ON public.shifts(date);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts        ENABLE ROW LEVEL SECURITY;
