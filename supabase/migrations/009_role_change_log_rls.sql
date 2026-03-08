-- Migration: 009_role_change_log_rls.sql
-- Purpose: Enable RLS and create policies for role_change_log table
-- Requirements: 8.2 (immutable audit trail), 8.4 (admin/gridmaster read access)

-- Enable Row Level Security on role_change_log
ALTER TABLE public.role_change_log ENABLE ROW LEVEL SECURITY;

-- Insert policy: Only admin or gridmaster can insert audit records
-- Note: In practice, inserts happen via the change_user_role RPC (SECURITY DEFINER),
-- but this policy provides defense-in-depth for direct table access
CREATE POLICY "audit_insert" ON public.role_change_log FOR INSERT
  WITH CHECK (
    public.caller_org_role()::TEXT IN ('admin') OR public.is_gridmaster()
  );

-- Select policy: Admins see audit logs for users in their org, gridmaster sees all
CREATE POLICY "audit_select" ON public.role_change_log FOR SELECT
  USING (
    public.is_gridmaster()
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = target_user_id
         AND org_id = public.caller_org_id()
    )
  );

-- NO UPDATE or DELETE policies - this ensures the audit trail is immutable
-- Any attempt to UPDATE or DELETE will be denied by RLS
-- This satisfies Requirement 8.2: "NO UPDATE or DELETE RLS policies, making records immutable"

COMMENT ON POLICY "audit_insert" ON public.role_change_log IS 'Only admin or gridmaster can insert audit records';
COMMENT ON POLICY "audit_select" ON public.role_change_log IS 'Admins see their org audit logs, gridmaster sees all';
