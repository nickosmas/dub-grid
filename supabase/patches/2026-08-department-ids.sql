-- ═════════════════════════════════════════════════════════════════════════════
-- Multi-department roles and certifications — 2026-08-20
--
-- The SQL half of "let a role or certification belong to several departments".
-- Migration 001 now declares `organization_roles.department_ids` and
-- `certifications.department_ids` as BIGINT[], but `npm run db:reset:remote` is
-- a full DROP SCHEMA + replay, so an edited migration never reaches a
-- provisioned database on its own. This is that change as an in-place upgrade.
--
--   psql "$DATABASE_URL" -f supabase/patches/2026-08-department-ids.sql
--
-- Run it on staging first, and run it BEFORE deploying the app: the new code
-- reads and writes `department_ids`, and every settings save, People-page
-- grouping and sandbox clone fails against a database that still has only
-- `department_id`.
--
-- Non-destructive by construction. It adds a column, backfills it from the old
-- one, and swaps indexes; the old `department_id` column and its foreign key
-- are deliberately LEFT IN PLACE, so a rollback to the previous deploy still
-- works. Dropping them is a separate, later step (section 5, commented out).
-- Safe to run twice: every step is guarded on its own result.
--
-- ONE THING IT WILL NOT DO FOR YOU (section 3). The old unique index allowed
-- the same name once per department, which is exactly how a credential that
-- spans departments had to be modelled — "RN (Nursing)" and "RN (Emergency)"
-- as two rows. The new index is per-org name, so those rows have to be merged
-- into one carrying both department ids, and merging means choosing which row
-- survives and re-pointing every employee, job and coverage row that
-- references the other. That is a data decision with your org's meaning
-- attached, not a mechanical one, so this script REFUSES rather than guessing:
-- it raises with the offending names and changes nothing. Merge them (the
-- query in section 3 lists them), then re-run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add the array column
--
-- Empty means org-wide, matching migration 001. NOT NULL with a default so no
-- reader ever has to handle NULL alongside empty as a second spelling of the
-- same thing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.organization_roles
  ADD COLUMN IF NOT EXISTS department_ids BIGINT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS department_ids BIGINT[] NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill from the single-department column
--
-- Guarded on the old column still existing, so a database that has already been
-- reset from migration 001 (where it never existed) skips this rather than
-- erroring. Only rows whose array is still empty are touched, which is what
-- makes a second run a no-op rather than a revert of any merging done since.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'organization_roles'
       AND column_name = 'department_id'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.organization_roles
         SET department_ids = ARRAY[department_id]
       WHERE department_id IS NOT NULL
         AND cardinality(department_ids) = 0
    $backfill$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'certifications'
       AND column_name = 'department_id'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.certifications
         SET department_ids = ARRAY[department_id]
       WHERE department_id IS NOT NULL
         AND cardinality(department_ids) = 0
    $backfill$;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Refuse to continue on names that the new unique index would reject
--
-- Read the raise as a work list, not a failure: these are the duplicate-per-
-- department rows the array column exists to replace. Merge each set into one
-- row with both department ids, re-point references, archive the leftovers,
-- then run this file again.
--
-- To see them without running the patch:
--
--   SELECT org_id, name, count(*), array_agg(id) AS role_ids
--     FROM public.organization_roles
--    WHERE archived_at IS NULL
--    GROUP BY org_id, name HAVING count(*) > 1;
--
--   SELECT org_id, name, count(*), array_agg(id) AS certification_ids
--     FROM public.certifications
--    WHERE archived_at IS NULL
--    GROUP BY org_id, name HAVING count(*) > 1;
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  conflicts TEXT;
BEGIN
  SELECT string_agg(format('organization_roles: org %s, name %L (%s rows: %s)',
                           org_id, name, row_count, ids), E'\n')
    INTO conflicts
    FROM (
      SELECT org_id, name, count(*) AS row_count, array_agg(id) AS ids
        FROM public.organization_roles
       WHERE archived_at IS NULL
       GROUP BY org_id, name
      HAVING count(*) > 1
    ) duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION E'Duplicate active role names block the new unique index.\nMerge these into one row each (department_ids takes both departments), then re-run:\n%', conflicts;
  END IF;

  SELECT string_agg(format('certifications: org %s, name %L (%s rows: %s)',
                           org_id, name, row_count, ids), E'\n')
    INTO conflicts
    FROM (
      SELECT org_id, name, count(*) AS row_count, array_agg(id) AS ids
        FROM public.certifications
       WHERE archived_at IS NULL
       GROUP BY org_id, name
      HAVING count(*) > 1
    ) duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION E'Duplicate active certification names block the new unique index.\nMerge these into one row each (department_ids takes both departments), then re-run:\n%', conflicts;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Swap the indexes
--
-- The old unique indexes keyed on COALESCE(department_id, -1); the new ones are
-- per-org name, since a name no longer needs duplicating to reach a second
-- department. The department lookups become GIN, which is what an array
-- containment search can use.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.organization_roles_org_name_dept_active_unique;
DROP INDEX IF EXISTS public.idx_organization_roles_department_id;

CREATE UNIQUE INDEX IF NOT EXISTS organization_roles_org_name_active_unique
  ON public.organization_roles(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organization_roles_department_ids
  ON public.organization_roles USING GIN (department_ids);

DROP INDEX IF EXISTS public.certifications_org_name_dept_active_unique;
DROP INDEX IF EXISTS public.idx_certifications_department_id;

CREATE UNIQUE INDEX IF NOT EXISTS certifications_org_name_active_unique
  ON public.certifications(org_id, name) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_certifications_department_ids
  ON public.certifications USING GIN (department_ids);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Retiring the old column — LATER, and only once the deploy has settled
--
-- Left for a follow-up on purpose: while `department_id` is still there, a
-- rollback to the previous release keeps working. Migration 001 no longer
-- declares it, so a database that has run this patch and one built fresh from
-- 001 differ by exactly these two columns until this is run.
--
--   ALTER TABLE public.organization_roles DROP COLUMN IF EXISTS department_id;
--   ALTER TABLE public.certifications DROP COLUMN IF EXISTS department_id;
--
-- (Their FK constraints to departments(id) go with the columns.)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Verification ────────────────────────────────────────────────────────────
-- Run after applying. Expected results in comments.

-- Both array columns exist (expect: 2)
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND column_name = 'department_ids'
--    AND table_name IN ('organization_roles', 'certifications');

-- Nothing was left behind by the backfill (expect: 0 for both)
-- SELECT count(*) FROM public.organization_roles
--  WHERE department_id IS NOT NULL AND cardinality(department_ids) = 0;
-- SELECT count(*) FROM public.certifications
--  WHERE department_id IS NOT NULL AND cardinality(department_ids) = 0;

-- The new indexes are in place (expect: 4)
-- SELECT count(*) FROM pg_indexes
--  WHERE schemaname = 'public' AND indexname IN (
--    'organization_roles_org_name_active_unique',
--    'idx_organization_roles_department_ids',
--    'certifications_org_name_active_unique',
--    'idx_certifications_department_ids');
