-- ============================================================
-- DubGrid Migration 029: Per-org skill levels and roles
-- ============================================================
-- Adds two TEXT[] columns to the organizations table so admins
-- can manage the list of skill levels (designations) and roles
-- from the Settings page instead of relying on hardcoded values.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS skill_levels TEXT[] NOT NULL
    DEFAULT ARRAY['JLCSN','CSN III','CSN II','STAFF','—'::text];

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL
    DEFAULT ARRAY['DCSN','DVCSN','Supv','Mentor','CN','SC. Mgr.','Activity Coordinator','SC/Asst/Act/Cor'::text];
