-- ============================================================
-- DubGrid Migration 028: Required designations for shift types
-- ============================================================
-- Adds a required_designations TEXT[] column to shift_types.
-- An empty array (the default) means no restriction — any
-- employee designation is permitted.  A non-empty array means
-- only employees whose designation matches one of the listed
-- values are eligible for that shift type.
-- ============================================================

ALTER TABLE public.shift_types
  ADD COLUMN IF NOT EXISTS required_designations TEXT[] NOT NULL DEFAULT '{}';
