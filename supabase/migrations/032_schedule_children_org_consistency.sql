-- Audit findings F-02 and F-03 (2026-09-21 full-project audit).
--
-- F-02: a schedule snapshot or segment could name a parent in another
-- organization. The write policies checked only the child's own org_id and
-- the readers joined parent to child without comparing organizations, so a
-- mismatched child shaped the other organization's canonical schedule read.
-- Organization consistency now lives in the relationship itself: composite
-- keys carry org_id from cell to snapshot to segment, the two admin write
-- policies require the parent to share the organization, and the two
-- readers guard their joins as defence in depth.
--
-- The pre-flight below refuses to run if any mismatched row already exists,
-- so a drifted database is reported rather than silently constrained.

DO $$
DECLARE
  v_snapshots INTEGER;
  v_segments INTEGER;
BEGIN
  SELECT count(*) INTO v_snapshots
  FROM public.schedule_cell_snapshots s
  JOIN public.schedule_cells c ON c.id = s.cell_id
  WHERE c.org_id <> s.org_id;

  SELECT count(*) INTO v_segments
  FROM public.schedule_cell_segments g
  JOIN public.schedule_cell_snapshots s ON s.id = g.snapshot_id
  WHERE s.org_id <> g.org_id;

  IF v_snapshots > 0 OR v_segments > 0 THEN
    RAISE EXCEPTION
      'Refusing to constrain schedule children: % snapshot(s) and % segment(s) name a parent in another organization. Repair them first.',
      v_snapshots, v_segments;
  END IF;
END;
$$;

ALTER TABLE public.schedule_cells
  ADD CONSTRAINT schedule_cells_id_org_id_key UNIQUE (id, org_id);

ALTER TABLE public.schedule_cell_snapshots
  ADD CONSTRAINT schedule_cell_snapshots_id_org_id_key UNIQUE (id, org_id);

-- The composite keys replace the single-column ones rather than sit beside
-- them: PostgREST refuses to embed a child table when two foreign keys lead
-- to the same parent, and every schedule read embeds these. A composite key
-- still guarantees the parent row exists, so nothing is lost.
ALTER TABLE public.schedule_cell_snapshots
  DROP CONSTRAINT schedule_cell_snapshots_cell_id_fkey,
  ADD CONSTRAINT schedule_cell_snapshots_cell_org_fkey
  FOREIGN KEY (cell_id, org_id) REFERENCES public.schedule_cells(id, org_id) ON DELETE CASCADE;

ALTER TABLE public.schedule_cell_segments
  DROP CONSTRAINT schedule_cell_segments_snapshot_id_fkey,
  ADD CONSTRAINT schedule_cell_segments_snapshot_org_fkey
  FOREIGN KEY (snapshot_id, org_id) REFERENCES public.schedule_cell_snapshots(id, org_id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "admin_write_schedule_cell_snapshots" ON public.schedule_cell_snapshots;

CREATE POLICY "admin_write_schedule_cell_snapshots"
  ON public.schedule_cell_snapshots FOR ALL TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canEditShifts')
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canEditShifts')
    AND EXISTS (
      SELECT 1 FROM public.schedule_cells parent
      WHERE parent.id = schedule_cell_snapshots.cell_id
        AND parent.org_id = schedule_cell_snapshots.org_id
    )
  );

DROP POLICY IF EXISTS "admin_write_schedule_cell_segments" ON public.schedule_cell_segments;

CREATE POLICY "admin_write_schedule_cell_segments"
  ON public.schedule_cell_segments FOR ALL TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canEditShifts')
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canEditShifts')
    AND EXISTS (
      SELECT 1 FROM public.schedule_cell_snapshots parent
      WHERE parent.id = schedule_cell_segments.snapshot_id
        AND parent.org_id = schedule_cell_segments.org_id
    )
  );

-- Readers restated from 002 with the parent-child organization guards on
-- their joins. Later migrations copy these from here.

CREATE OR REPLACE FUNCTION public.get_schedule_cell_snapshot_payload(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT
)
RETURNS TABLE (
  cell_id UUID,
  org_id UUID,
  emp_id UUID,
  date DATE,
  version BIGINT,
  focus_area_id BIGINT,
  series_id UUID,
  from_recurring BOOLEAN,
  state_kind TEXT,
  absence_type_id BIGINT,
  custom_start_time TEXT,
  custom_end_time TEXT,
  shift_ids BIGINT[],
  job_ids BIGINT[],
  is_mentored_flags BOOLEAN[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH aggregated_segments AS (
    SELECT
      c.id AS cell_id,
      c.org_id,
      c.emp_id,
      c.date,
      c.version,
      c.focus_area_id,
      c.series_id,
      c.from_recurring,
      snapshot.state_kind,
      snapshot.absence_type_id,
      snapshot.custom_start_time,
      snapshot.custom_end_time,
      COALESCE(
        array_agg(segments.shift_id ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BIGINT[]
      ) AS shift_ids,
      COALESCE(
        array_agg(segments.job_id ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BIGINT[]
      ) AS job_ids,
      COALESCE(
        array_agg(segments.is_mentored ORDER BY segments.position)
          FILTER (WHERE segments.id IS NOT NULL),
        '{}'::BOOLEAN[]
      ) AS is_mentored_flags
    FROM public.schedule_cells c
    JOIN public.schedule_cell_snapshots snapshot
      ON snapshot.cell_id = c.id
     AND snapshot.org_id = c.org_id
     AND snapshot.snapshot_kind = p_snapshot_kind
    LEFT JOIN public.schedule_cell_segments segments
      ON segments.snapshot_id = snapshot.id
     AND segments.org_id = snapshot.org_id
    WHERE c.org_id = p_org_id
      AND c.emp_id = p_emp_id
      AND c.date = p_date
    GROUP BY
      c.id,
      c.org_id,
      c.emp_id,
      c.date,
      c.version,
      c.focus_area_id,
      c.series_id,
      c.from_recurring,
      snapshot.id,
      snapshot.state_kind,
      snapshot.absence_type_id,
      snapshot.custom_start_time,
      snapshot.custom_end_time
  )
  SELECT
    aggregated_segments.cell_id,
    aggregated_segments.org_id,
    aggregated_segments.emp_id,
    aggregated_segments.date,
    aggregated_segments.version,
    aggregated_segments.focus_area_id,
    aggregated_segments.series_id,
    aggregated_segments.from_recurring,
    aggregated_segments.state_kind,
    aggregated_segments.absence_type_id,
    aggregated_segments.custom_start_time,
    aggregated_segments.custom_end_time,
    aggregated_segments.shift_ids,
    aggregated_segments.job_ids,
    aggregated_segments.is_mentored_flags
  FROM aggregated_segments;
$$;

CREATE OR REPLACE FUNCTION public.schedule_cell_has_effective_content(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedule_cells c
    LEFT JOIN public.schedule_cell_snapshots draft
      ON draft.cell_id = c.id
     AND draft.org_id = c.org_id
     AND draft.snapshot_kind = 'draft'
    LEFT JOIN public.schedule_cell_snapshots published
      ON published.cell_id = c.id
     AND published.org_id = c.org_id
     AND published.snapshot_kind = 'published'
    WHERE c.org_id = p_org_id
      AND c.emp_id = p_emp_id
      AND c.date = p_date
      AND (
        (draft.id IS NOT NULL AND draft.state_kind <> 'deleted')
        OR (draft.id IS NULL AND published.id IS NOT NULL)
      )
  );
$$;


-- F-03: discarding drafts selected draft-only cells in one request and
-- deleted their parent rows in later ones, so a publish that promoted a
-- selected cell in between lost published data. The whole discard is now one
-- transaction here. Locking the cell rows FOR UPDATE also blocks a concurrent
-- publish's snapshot write, whose foreign key needs a share lock on the same
-- rows, so the recheck below always sees the settled state. Service role
-- only: the app calls it after its own authorization, never a client.
CREATE OR REPLACE FUNCTION public.discard_schedule_drafts(
  p_org_id     UUID,
  p_user_id    UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_cell RECORD;
BEGIN
  FOR v_cell IN
    SELECT c.id
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND (p_start_date IS NULL OR c.date >= p_start_date)
      AND (p_end_date IS NULL OR c.date <= p_end_date)
      AND (p_user_id IS NULL OR c.updated_by = p_user_id)
      AND EXISTS (
        SELECT 1 FROM public.schedule_cell_snapshots d
        WHERE d.cell_id = c.id AND d.org_id = c.org_id AND d.snapshot_kind = 'draft'
      )
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    -- Decided under the lock, not from the selection above.
    IF EXISTS (
      SELECT 1 FROM public.schedule_cell_snapshots p
      WHERE p.cell_id = v_cell.id AND p.org_id = p_org_id AND p.snapshot_kind = 'published'
    ) THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = v_cell.id AND org_id = p_org_id AND snapshot_kind = 'draft';

      UPDATE public.schedule_cells
      SET version = version + 1, updated_by = p_user_id, updated_at = now()
      WHERE id = v_cell.id;
    ELSE
      DELETE FROM public.schedule_cells WHERE id = v_cell.id;
    END IF;
  END LOOP;

  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND status = 'draft'
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date)
    AND (p_user_id IS NULL OR updated_by = p_user_id);

  UPDATE public.schedule_notes
  SET status = 'published'
  WHERE org_id = p_org_id
    AND status = 'draft_deleted'
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date)
    AND (p_user_id IS NULL OR updated_by = p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discard_schedule_drafts(UUID, UUID, DATE, DATE) TO service_role;
