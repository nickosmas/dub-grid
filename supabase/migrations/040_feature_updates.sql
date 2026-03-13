-- ============================================================
-- Migration 040: Add super_admin to org_role enum
-- Must commit before 041 can use the new value.
-- ============================================================

ALTER TYPE public.org_role ADD VALUE IF NOT EXISTS 'super_admin';
