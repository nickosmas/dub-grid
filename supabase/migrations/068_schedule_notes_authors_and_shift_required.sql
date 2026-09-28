-- 068: Every schedule note names its author, and none exists without a shift.
--
-- The app writes notes with the service client, where auth.uid() is null, so
-- set_audit_fields (002) never stamped an author: every note carried null
-- created_by and updated_by. The publish dialog then listed note drafts as
-- "Unattributed", and "Discard my drafts" (discard_schedule_drafts matches
-- notes by updated_by) silently discarded none of them. The app now passes the
-- author itself; this recovers the authors of the notes already saved.

-- The author's own save is in the audit log: the route records every note
-- save as schedule_note.upserted against the cell and note type (and, since
-- 063, the shift). A note gets the most recent matching save's actor, the one
-- naming its shift first. An actor whose account is gone is skipped, since the
-- columns reference auth.users; a note with no matching save stays null.
CREATE TEMP TABLE schedule_note_authors ON COMMIT DROP AS
SELECT DISTINCT ON (n.id)
  n.id AS note_id,
  a.actor_id
FROM public.schedule_notes n
JOIN public.audit_log a
  ON a.action = 'schedule_note.upserted'
 AND a.org_id = n.org_id
 AND a.resource_id = n.emp_id::TEXT || '_' || n.date::TEXT
 AND (a.details->>'indicatorTypeId')::INTEGER = n.indicator_type_id
JOIN auth.users u ON u.id = a.actor_id
WHERE n.created_by IS NULL
  AND n.updated_by IS NULL
ORDER BY
  n.id,
  ((a.details->'shift'->>'jobId')::BIGINT IS NOT DISTINCT FROM n.job_id
    AND (a.details->'shift'->>'shiftId')::BIGINT IS NOT DISTINCT FROM n.shift_id) DESC,
  a.created_at DESC;

-- Recovering authorship is nobody's edit, so the audit trigger is off for it
-- and each note keeps its updated_at.
ALTER TABLE public.schedule_notes DISABLE TRIGGER trigger_schedule_notes_audit;

UPDATE public.schedule_notes n
SET created_by = sa.actor_id,
    updated_by = sa.actor_id
FROM schedule_note_authors sa
WHERE sa.note_id = n.id;

ALTER TABLE public.schedule_notes ENABLE TRIGGER trigger_schedule_notes_audit;

-- A note's creator never changes. set_audit_fields keeps it only when
-- auth.uid() is set, and the service client's upsert names the current editor
-- in created_by on every save, so the note keeps its own here. Named to run
-- after trigger_schedule_notes_audit.
CREATE OR REPLACE FUNCTION public.keep_schedule_note_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.created_by IS NOT NULL THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_schedule_note_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_schedule_notes_keep_creator ON public.schedule_notes;
CREATE TRIGGER trigger_schedule_notes_keep_creator
  BEFORE UPDATE ON public.schedule_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_schedule_note_creator();

-- A note describes one shift and cannot exist without it. 063 left the shift
-- nullable for notes no shift claimed; none remain (checked on production and
-- locally), and every write now names its shift. shift_id stays nullable: a
-- shiftless job's segment has none.
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT IF EXISTS schedule_notes_segment_key_check;

ALTER TABLE public.schedule_notes
  ALTER COLUMN job_id SET NOT NULL;
