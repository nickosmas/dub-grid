-- Migration: Create impersonation_sessions table
-- Requirements: 4.1, 4.2, 4.3
-- Allows Gridmasters to impersonate tenant users for support purposes

CREATE TABLE public.impersonation_sessions (
  session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gridmaster_id    UUID NOT NULL REFERENCES auth.users(id),
  target_user_id   UUID NOT NULL REFERENCES auth.users(id),
  target_org_id    UUID NOT NULL REFERENCES organizations(id),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Requirement 4.2: Prevent duplicate active sessions for same gridmaster/target pair
  CONSTRAINT one_active_session_per_target UNIQUE (gridmaster_id, target_user_id)
);

-- Requirement 4.3: Index on expires_at for efficient cleanup queries
CREATE INDEX idx_impersonation_sessions_expires_at ON impersonation_sessions (expires_at);

-- Add comment for documentation
COMMENT ON TABLE public.impersonation_sessions IS 'Tracks active Gridmaster impersonation sessions for tenant user support';
COMMENT ON COLUMN public.impersonation_sessions.session_id IS 'Unique identifier for the impersonation session';
COMMENT ON COLUMN public.impersonation_sessions.gridmaster_id IS 'The Gridmaster user performing the impersonation';
COMMENT ON COLUMN public.impersonation_sessions.target_user_id IS 'The tenant user being impersonated';
COMMENT ON COLUMN public.impersonation_sessions.target_org_id IS 'The organization of the target user for scoping data access';
COMMENT ON COLUMN public.impersonation_sessions.expires_at IS 'Session expiry time (default 30 minutes from creation)';
COMMENT ON COLUMN public.impersonation_sessions.created_at IS 'Timestamp when the session was created';
