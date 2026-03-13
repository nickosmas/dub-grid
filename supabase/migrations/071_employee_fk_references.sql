-- ============================================================
-- Migration 071: Replace string-based employee references with FK IDs
--
-- Employees currently store certifications, roles, and focus areas
-- as string names. This migration switches to ID-based references:
--   designation TEXT        → certification_id BIGINT (FK)
--   roles TEXT[]            → role_ids BIGINT[]
--   focus_areas TEXT[]      → focus_area_ids INTEGER[]
--
-- Benefits: referential integrity, no cascade-rename needed,
-- prevents orphaned references.
-- ============================================================


-- ── 1. Add new FK columns ───────────────────────────────────────────────────

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS certification_id BIGINT
    REFERENCES public.certifications(id) ON DELETE SET NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS role_ids BIGINT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS focus_area_ids INTEGER[] NOT NULL DEFAULT '{}';


-- ── 2. Backfill certification_id from designation ───────────────────────────

UPDATE public.employees e
SET certification_id = c.id
FROM public.certifications c
WHERE c.company_id = e.company_id
  AND c.name = e.designation
  AND e.designation IS NOT NULL
  AND e.designation != ''
  AND e.designation != '—'
  AND e.certification_id IS NULL;


-- ── 3. Backfill role_ids from roles[] ───────────────────────────────────────

UPDATE public.employees e
SET role_ids = COALESCE(
  (
    SELECT ARRAY_AGG(cr.id ORDER BY cr.sort_order)
    FROM public.company_roles cr
    WHERE cr.company_id = e.company_id
      AND cr.name = ANY(e.roles)
  ),
  '{}'
)
WHERE e.roles IS NOT NULL AND array_length(e.roles, 1) > 0;


-- ── 4. Backfill focus_area_ids from focus_areas[] ───────────────────────────

UPDATE public.employees e
SET focus_area_ids = COALESCE(
  (
    SELECT ARRAY_AGG(fa.id ORDER BY fa.sort_order)
    FROM public.focus_areas fa
    WHERE fa.company_id = e.company_id
      AND fa.name = ANY(e.focus_areas)
  ),
  '{}'
)
WHERE e.focus_areas IS NOT NULL AND array_length(e.focus_areas, 1) > 0;


-- ── 5. Drop old string columns ─────────────────────────────────────────────

ALTER TABLE public.employees DROP COLUMN IF EXISTS designation;
ALTER TABLE public.employees DROP COLUMN IF EXISTS roles;
ALTER TABLE public.employees DROP COLUMN IF EXISTS focus_areas;


-- ── 6. Indexes for efficient lookups ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS employees_certification_id_idx
  ON public.employees(certification_id);

CREATE INDEX IF NOT EXISTS employees_role_ids_idx
  ON public.employees USING GIN(role_ids);

CREATE INDEX IF NOT EXISTS employees_focus_area_ids_idx
  ON public.employees USING GIN(focus_area_ids);


-- ── 7. Drop the cascade wing-rename trigger (no longer needed) ──────────────

DROP TRIGGER IF EXISTS trg_cascade_focus_area_rename ON public.focus_areas;
DROP FUNCTION IF EXISTS fn_cascade_focus_area_rename();
