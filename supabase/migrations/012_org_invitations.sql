-- Migration: org_invitations table for invite-only registration
-- Requirements: 5.2, 5.3, 5.6

-- Create org_invitations table
CREATE TABLE public.org_invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by       UUID NOT NULL REFERENCES auth.users(id),
  email            TEXT NOT NULL,
  role_to_assign   TEXT NOT NULL CHECK (role_to_assign IN ('scheduler', 'supervisor', 'user')),
  token            UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  accepted_at      TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensures only one pending invite per email per org
  CONSTRAINT one_pending_invite UNIQUE (org_id, email)
);

-- Index on token for fast lookup during invitation acceptance
CREATE INDEX idx_org_invitations_token ON org_invitations (token);

-- Index on (org_id, email) for efficient queries by org and email
CREATE INDEX idx_org_invitations_org_email ON org_invitations (org_id, email);

-- Add comment for documentation
COMMENT ON TABLE public.org_invitations IS 'Stores organization invitations for invite-only registration';
COMMENT ON COLUMN public.org_invitations.role_to_assign IS 'Role to assign when invitation is accepted. Restricted to scheduler, supervisor, or user.';
COMMENT ON COLUMN public.org_invitations.token IS 'Unique token sent to invitee for accepting the invitation';
COMMENT ON COLUMN public.org_invitations.expires_at IS 'Invitation expires 72 hours after creation';
COMMENT ON COLUMN public.org_invitations.accepted_at IS 'Timestamp when invitation was accepted, NULL if pending';
COMMENT ON COLUMN public.org_invitations.revoked_at IS 'Timestamp when invitation was revoked by admin, NULL if active';
COMMENT ON CONSTRAINT one_pending_invite ON public.org_invitations IS 'Ensures only one pending invitation per email per organization';
