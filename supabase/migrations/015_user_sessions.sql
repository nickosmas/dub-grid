-- Migration: user_sessions table for per-device session management
-- Requirements: 6.1, 6.6

-- Create user_sessions table
CREATE TABLE public.user_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_label        TEXT,
  ip_address          INET,
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refresh_token_hash  TEXT UNIQUE NOT NULL
);

-- Add index for efficient queries by user and last active time
CREATE INDEX idx_user_sessions_user_last_active ON user_sessions (user_id, last_active_at DESC);

-- Enable Row Level Security
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/manage their own sessions
-- This policy applies to ALL operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "own_sessions_only" ON user_sessions
  FOR ALL USING (user_id = auth.uid());

-- Add comment for documentation
COMMENT ON TABLE user_sessions IS 'Tracks individual device sessions for per-device session management';
COMMENT ON COLUMN user_sessions.refresh_token_hash IS 'Hashed refresh token for session identification - UNIQUE constraint prevents duplicate sessions';
COMMENT ON COLUMN user_sessions.device_label IS 'User-friendly device identifier (e.g., "Chrome on MacOS")';
COMMENT ON COLUMN user_sessions.ip_address IS 'IP address of the device at session creation';
