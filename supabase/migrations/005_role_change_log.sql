-- Migration: 005_role_change_log.sql
-- Purpose: Create role_change_log table for audit trail and idempotency checking
-- Requirements: 1.2, 1.3, 8.1

-- Create role_change_log table
CREATE TABLE public.role_change_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  UUID NOT NULL REFERENCES auth.users(id),
  changed_by_id   UUID NOT NULL REFERENCES auth.users(id),
  from_role       TEXT NOT NULL,
  to_role         TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE public.role_change_log IS 'Immutable audit log for all role changes in the system';

-- Index for idempotency key lookups (fast duplicate detection)
CREATE INDEX idx_role_change_log_idempotency_key ON role_change_log (idempotency_key);

-- Index for querying role changes by target user, ordered by most recent first
CREATE INDEX idx_role_change_log_target_user_created ON role_change_log (target_user_id, created_at DESC);
