-- Migration: 006_jwt_refresh_locks.sql
-- Purpose: Create jwt_refresh_locks table to prevent stale JWT race conditions after role changes
-- Requirements: 2.1, 2.4

-- Create jwt_refresh_locks table
CREATE TABLE public.jwt_refresh_locks (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL,
  reason       TEXT
);

-- Add comment for documentation
COMMENT ON TABLE public.jwt_refresh_locks IS 'Temporary locks preventing JWT refresh during role transitions to avoid stale token race conditions';
COMMENT ON COLUMN public.jwt_refresh_locks.user_id IS 'User whose JWT refresh is temporarily blocked';
COMMENT ON COLUMN public.jwt_refresh_locks.locked_until IS 'Timestamp until which new token issuance is blocked';
COMMENT ON COLUMN public.jwt_refresh_locks.reason IS 'Reason for the lock (e.g., role_change, security_incident)';
