-- ============================================================
-- Migration 076: Replace focus_area_name (TEXT) with focus_area_id (FK)
--
-- Both `shifts` and `schedule_notes` stored their focus-area
-- association as a plain text name. This migration replaces
-- that with a proper INTEGER FK to focus_areas(id).
--
-- Steps:
--   1. Add focus_area_id to shifts, backfill, drop focus_area_name
--   2. Add focus_area_id to schedule_notes, backfill, swap unique
--      constraint, drop focus_area_name
--   3. Drop the cascade_wing_rename trigger & function (no longer
--      needed — FK handles referential integrity)
-- ============================================================

-- ── 1. shifts ─────────────────────────────────────────────────────────────────

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS focus_area_id INTEGER REFERENCES public.focus_areas(id) ON DELETE SET NULL;

UPDATE public.shifts s
SET focus_area_id = fa.id
FROM public.focus_areas fa
WHERE s.focus_area_name IS NOT NULL
  AND s.focus_area_name = fa.name
  AND s.company_id = fa.company_id;

ALTER TABLE public.shifts DROP COLUMN IF EXISTS focus_area_name;

-- ── 2. schedule_notes ─────────────────────────────────────────────────────────

ALTER TABLE public.schedule_notes
  ADD COLUMN IF NOT EXISTS focus_area_id INTEGER REFERENCES public.focus_areas(id) ON DELETE SET NULL;

UPDATE public.schedule_notes sn
SET focus_area_id = fa.id
FROM public.focus_areas fa
WHERE sn.focus_area_name IS NOT NULL
  AND sn.focus_area_name = fa.name
  AND sn.company_id = fa.company_id;

-- Swap the unique constraint from (emp_id, date, note_type, focus_area_name)
-- to (emp_id, date, note_type, focus_area_id)
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT IF EXISTS schedule_notes_emp_id_date_note_type_focus_area_name_key;

ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_emp_id_date_note_type_focus_area_id_key
  UNIQUE (emp_id, date, note_type, focus_area_id);

ALTER TABLE public.schedule_notes DROP COLUMN IF EXISTS focus_area_name;

-- ── 3. Drop cascade_wing_rename trigger & function ────────────────────────────
-- The trigger only existed to propagate name changes to text columns.
-- With FK references, referential integrity is handled by PostgreSQL.

DROP TRIGGER IF EXISTS trg_wing_rename_cascade ON public.focus_areas;
DROP FUNCTION IF EXISTS public.cascade_wing_rename();
