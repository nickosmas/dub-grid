-- Migration 070: Allow empty roles on employees
-- The roles column had no DEFAULT, so inserting a row without roles failed with
-- a NOT NULL constraint violation. Add a DEFAULT '{}' and backfill any NULLs.

ALTER TABLE public.employees ALTER COLUMN roles SET DEFAULT '{}';

UPDATE public.employees SET roles = '{}' WHERE roles IS NULL;
