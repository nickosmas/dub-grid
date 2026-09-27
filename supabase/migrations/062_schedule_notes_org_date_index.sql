-- 062: Serve an organization's schedule notes by date.
--
-- The web schedule and every mobile team schedule read notes by org_id over a
-- date range, ordered by date. With only an (org_id) index that read scans the
-- organization's whole note history. (org_id, date) serves it, and any read by
-- org_id alone, so the single-column index it supersedes is dropped.
--
-- Additive for readers: no query changes, and the drop only removes an index
-- the new one covers.

CREATE INDEX IF NOT EXISTS idx_schedule_notes_org_date
  ON public.schedule_notes (org_id, date);

DROP INDEX IF EXISTS public.idx_schedule_notes_org;
