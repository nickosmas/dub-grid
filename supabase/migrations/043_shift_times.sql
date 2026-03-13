-- Migration 043: Shift times
-- 1. Add default start/end times to shift_types
-- 2. Add custom start/end time overrides to shifts
-- 3. Drop fte_weight from employees (no longer used)

-- ── shift_types: default times ───────────────────────────────────────────────

ALTER TABLE shift_types
  ADD COLUMN IF NOT EXISTS default_start_time TIME,
  ADD COLUMN IF NOT EXISTS default_end_time   TIME;

-- ── shifts: per-assignment time overrides ────────────────────────────────────

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS custom_start_time TIME,
  ADD COLUMN IF NOT EXISTS custom_end_time   TIME;

-- ── employees: remove fte_weight ─────────────────────────────────────────────

ALTER TABLE employees
  DROP COLUMN IF EXISTS fte_weight;
