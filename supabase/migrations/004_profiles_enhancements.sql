-- ============================================================
-- DubGrid RBAC Migration: Profiles Table Enhancements
-- ============================================================
-- Adds version and role_locked columns to support race-condition-safe
-- role changes with optimistic locking.
-- Requirements: 1.1, 1.5
-- ============================================================

-- ── 1. ADD VERSION COLUMN ─────────────────────────────────────────────────────
-- Used for optimistic locking during concurrent role changes.
-- Incremented on each successful role update to detect conflicts.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- ── 2. ADD ROLE_LOCKED COLUMN ─────────────────────────────────────────────────
-- Indicates whether the user's role is currently locked (e.g., during
-- a role change transaction) to prevent concurrent modifications.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. ADD COMMENT FOR DOCUMENTATION ──────────────────────────────────────────

COMMENT ON COLUMN public.profiles.version IS 'Optimistic lock version counter for race-condition-safe role changes';
COMMENT ON COLUMN public.profiles.role_locked IS 'Flag indicating if role is currently locked during a change operation';
