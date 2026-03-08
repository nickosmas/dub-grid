-- DubGrid Migration 031: Cleanup legacy tables
-- Superseded by profiles table and Custom Access Token Hook RBAC.

-- 1. Drop the legacy tables
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.super_admins CASCADE;

-- 2. Clean up any remaining policies that might reference these tables
-- Most were dropped in full_setup.sql, but we ensure none remain.
DROP POLICY IF EXISTS "auth_org_members_select" ON public.organizations;
DROP POLICY IF EXISTS "auth_org_members_insert" ON public.organizations;
DROP POLICY IF EXISTS "auth_org_members_update" ON public.organizations;
DROP POLICY IF EXISTS "auth_org_members_delete" ON public.organizations;
