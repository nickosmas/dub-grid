-- ============================================================
-- Migration 060: Add timezone column to companies table
--
-- Stores the company's IANA timezone (e.g. "America/New_York").
-- Nullable — null means the company has not configured a timezone.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;
