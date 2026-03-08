-- Migration: RLS policies for org_invitations table
-- Requirements: 5.6, 5.7
-- Task: 7.3 Create RLS policies for org_invitations

-- Enable Row Level Security
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Gridmasters can see all invitations, Admins can see their org's invitations
CREATE POLICY "invitations_select" ON org_invitations FOR SELECT
  USING (
    public.is_gridmaster()
    OR (org_id = public.caller_org_id() AND public.caller_org_role()::TEXT = 'admin')
  );

-- INSERT policy: Only admins can create invitations, and only for non-admin/non-gridmaster roles
CREATE POLICY "invitations_insert" ON org_invitations FOR INSERT
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin')
    AND role_to_assign NOT IN ('admin', 'gridmaster')
  );

-- UPDATE policy: Only admins can revoke pending invitations (set revoked_at)
CREATE POLICY "invitations_revoke" ON org_invitations FOR UPDATE
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin')
    AND accepted_at IS NULL
  )
  WITH CHECK (revoked_at IS NOT NULL);

-- Add comments for documentation
COMMENT ON POLICY "invitations_select" ON org_invitations IS 'Gridmasters see all invitations; Admins see only their org invitations';
COMMENT ON POLICY "invitations_insert" ON org_invitations IS 'Admins can create invitations only for scheduler/supervisor/user roles';
COMMENT ON POLICY "invitations_revoke" ON org_invitations IS 'Admins can revoke pending (not yet accepted) invitations by setting revoked_at';
