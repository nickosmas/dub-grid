-- ==========================================================================
-- Migration 005: Reject stale organization claims after membership removal
-- ==========================================================================
-- An access token is immutable until it expires. `org_id` in its JWT can
-- therefore outlive a soft-archived membership. All tenant RLS policies use
-- caller_org_id(), so validate that claimed org against the live membership
-- row before returning it.

CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT claimed.org_id
  FROM (
    SELECT NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id
  ) AS claimed
  WHERE claimed.org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id = claimed.org_id
        AND membership.archived_at IS NULL
    );
$$;
