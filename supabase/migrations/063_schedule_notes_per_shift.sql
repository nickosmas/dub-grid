-- 063: A schedule note belongs to one shift, not to every shift in its focus area.
--
-- A cell's shifts are the segments of one snapshot, and a note was unique on
-- (emp_id, date, indicator_type_id, focus_area_id) alone, so two shifts in the
-- same focus area (a Day and an Evening in one unit) shared a single note row:
-- turning a note on for one turned it on for both.
--
-- A segment is identified by its (shift_id, job_id) pair. shift_id alone is
-- null for a shiftless job, and segment ids are recreated with every snapshot,
-- so neither serves. Both columns stay null for a note that no shift claims,
-- which keeps today's per-focus-area behaviour for it.

ALTER TABLE public.schedule_notes
  ADD COLUMN shift_id BIGINT,
  ADD COLUMN job_id BIGINT;

ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_segment_key_check
  CHECK (shift_id IS NULL OR job_id IS NOT NULL);

-- The old key would refuse the copies the backfill makes for a double shift.
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT schedule_notes_emp_id_date_indicator_type_id_focus_area_id_key;

-- Backfill against the snapshot the editor sees (the draft when there is one).
-- A segment claims a note in its focus area, and a general shift or shiftless
-- job (no focus area of its own) claims one in whichever area it sits. Where
-- several segments claim a note, each gets its own row, so a note shown on both
-- shifts of a double shift today is still shown on both. A backfill is nobody's
-- edit, so the audit trigger is off for it and each row keeps its author.
CREATE TEMP TABLE schedule_note_segments ON COMMIT DROP AS
SELECT DISTINCT ON (n.id, seg.shift_id, seg.job_id)
  n.id AS note_id,
  seg.shift_id,
  seg.job_id,
  seg.position
FROM public.schedule_notes n
JOIN public.schedule_cells c
  ON c.org_id = n.org_id AND c.emp_id = n.emp_id AND c.date = n.date
JOIN LATERAL (
  SELECT s.id, s.state_kind
  FROM public.schedule_cell_snapshots s
  WHERE s.cell_id = c.id
  ORDER BY (s.snapshot_kind = 'draft') DESC
  LIMIT 1
) effective ON effective.state_kind = 'worked'
JOIN public.schedule_cell_segments seg ON seg.snapshot_id = effective.id
LEFT JOIN public.shift_categories sc ON sc.id = seg.shift_id
WHERE n.focus_area_id IS NOT NULL
  AND (sc.focus_area_id IS NULL OR sc.focus_area_id = n.focus_area_id)
ORDER BY n.id, seg.shift_id, seg.job_id, seg.position;

ALTER TABLE public.schedule_notes DISABLE TRIGGER trigger_schedule_notes_audit;

INSERT INTO public.schedule_notes (
  org_id, emp_id, date, indicator_type_id, status, focus_area_id,
  created_by, updated_by, created_at, updated_at, shift_id, job_id
)
SELECT
  n.org_id, n.emp_id, n.date, n.indicator_type_id, n.status, n.focus_area_id,
  n.created_by, n.updated_by, n.created_at, n.updated_at, ns.shift_id, ns.job_id
FROM schedule_note_segments ns
JOIN public.schedule_notes n ON n.id = ns.note_id
WHERE (ns.note_id, ns.position) NOT IN (
  SELECT note_id, min(position) FROM schedule_note_segments GROUP BY note_id
);

UPDATE public.schedule_notes n
SET shift_id = ns.shift_id, job_id = ns.job_id
FROM schedule_note_segments ns
WHERE ns.note_id = n.id
  AND ns.position = (
    SELECT min(first.position) FROM schedule_note_segments first WHERE first.note_id = n.id
  );

ALTER TABLE public.schedule_notes ENABLE TRIGGER trigger_schedule_notes_audit;

ALTER TABLE public.schedule_notes
  ADD CONSTRAINT schedule_notes_segment_unique
  UNIQUE NULLS NOT DISTINCT (emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id);

-- A note naming a shift must name one the cell actually has. The rest of the
-- rule and its scoping are unchanged from 015.
CREATE OR REPLACE FUNCTION public.enforce_schedule_note_has_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
BEGIN
  SELECT effective.id INTO v_snapshot_id
  FROM public.schedule_cells c
  JOIN LATERAL (
    -- The draft supersedes the published snapshot, including a draft that
    -- clears the cell, which is how the app resolves the same question.
    SELECT s.id, s.state_kind
    FROM public.schedule_cell_snapshots s
    WHERE s.cell_id = c.id
    ORDER BY (s.snapshot_kind = 'draft') DESC
    LIMIT 1
  ) effective ON TRUE
  WHERE c.org_id = NEW.org_id
    AND c.emp_id = NEW.emp_id
    AND c.date = NEW.date
    AND effective.state_kind = 'worked';

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Schedule notes require a worked shift on the same cell'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.schedule_cell_segments seg
    WHERE seg.snapshot_id = v_snapshot_id
      AND seg.job_id = NEW.job_id
      AND seg.shift_id IS NOT DISTINCT FROM NEW.shift_id
  ) THEN
    RAISE EXCEPTION 'Schedule note names a shift the cell does not have'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_schedule_notes_require_shift ON public.schedule_notes;
CREATE TRIGGER trigger_schedule_notes_require_shift
  BEFORE INSERT OR UPDATE OF org_id, emp_id, date, indicator_type_id, focus_area_id, shift_id, job_id
  ON public.schedule_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_schedule_note_has_shift();
