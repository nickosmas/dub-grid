-- Migration: 022_drop_shifts_v2.sql
-- Purpose: Drop the shifts_v2 table — superseded by the enhanced shifts table.
-- The shifts table now carries org_id, user_id, version, created_by,
-- updated_by, created_at, and updated_at alongside the original
-- emp_id / date / shift_label columns.

DROP TABLE IF EXISTS public.shifts_v2 CASCADE;
