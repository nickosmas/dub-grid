-- Two shift editor fixes (2026-10-25).
--
-- A series edit over several days rewrote every day's custom times as empty,
-- although the panel and the docs say times change one day at a time. Each
-- day now keeps its own times while its shifts stay the same; a day whose
-- shifts the edit changes takes the new shifts' standard times, since its old
-- times belonged to shifts it no longer has. The day being edited is saved
-- again by the client with the panel's times, as before.
--
-- The same-day overlap check folded an overnight shift's morning onto the day
-- it starts, so Early 5 AM - 1 PM beside Night 11 PM - 7 AM was refused. It
-- now reads each shift by its real times, running past midnight, as the
-- editor and the TypeScript save check (`checkAssignmentDefinitionOverlap`) do.
--
-- Both functions are restated from their latest bodies (080 and 002) with only
-- those parts changed. CREATE OR REPLACE keeps their grants.

CREATE OR REPLACE FUNCTION public.update_series_all_shifts(
  p_series_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_state RECORD;
  r RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  FOR r IN
    SELECT c.emp_id, c.date, c.version, c.focus_area_id, c.from_recurring,
      current_snapshot.custom_start_time,
      current_snapshot.custom_end_time,
      current_snapshot.shift_ids
    FROM public.schedule_cells c
    LEFT JOIN LATERAL (
      SELECT snapshot.custom_start_time,
        snapshot.custom_end_time,
        ARRAY(
          SELECT segment.shift_id
          FROM public.schedule_cell_segments segment
          WHERE segment.snapshot_id = snapshot.id
          ORDER BY segment.position
        ) AS shift_ids
      FROM public.schedule_cell_snapshots snapshot
      WHERE snapshot.cell_id = c.id
      ORDER BY (snapshot.snapshot_kind = 'draft') DESC
      LIMIT 1
    ) current_snapshot ON TRUE
    WHERE c.org_id = p_org_id
      AND c.series_id = p_series_id
      AND (p_from_date IS NULL OR c.date >= p_from_date)
      AND (p_to_date IS NULL OR c.date <= p_to_date)
      AND NOT EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots draft
        WHERE draft.cell_id = c.id
          AND draft.snapshot_kind = 'draft'
          AND draft.state_kind = 'deleted'
      )
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.date,
      'draft',
      v_state.state_kind,
      v_state.shift_ids,
      v_state.job_ids,
      v_state.absence_type_id,
      CASE WHEN r.shift_ids IS NOT DISTINCT FROM v_state.shift_ids THEN r.custom_start_time END,
      CASE WHEN r.shift_ids IS NOT DISTINCT FROM v_state.shift_ids THEN r.custom_end_time END,
      p_series_id,
      COALESCE(r.from_recurring, FALSE),
      COALESCE(v_state.focus_area_id, r.focus_area_id),
      r.version,
      auth.uid(),
      v_state.is_mentored_flags
    );
  END LOOP;

  IF p_to_date IS NULL THEN
    UPDATE public.shift_series
    SET state = p_state,
        updated_by = auth.uid(),
        updated_at = NOW()
    WHERE org_id = p_org_id
      AND id = p_series_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_non_overlapping_work_assignment_times(
  p_org_id UUID,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT DEFAULT NULL,
  p_custom_end TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_overlap RECORD;
BEGIN
  IF array_length(p_job_ids, 1) IS NULL OR array_length(p_job_ids, 1) < 2 THEN
    RETURN;
  END IF;

  -- Overlaps are only a hard error for orgs that opted into conflict
  -- prevention; everyone else gets the schedule editor's soft warning and is
  -- free to save the cell anyway.
  IF NOT COALESCE(
    (SELECT o.enforce_conflict_prevention FROM public.organizations o WHERE o.id = p_org_id),
    FALSE
  ) THEN
    RETURN;
  END IF;

  -- Minutes from the start of the day; an overnight shift ends on the next.
  WITH ranges AS (
    SELECT range.segment_position,
      EXTRACT(EPOCH FROM range.start_time) / 60 AS start_minute,
      EXTRACT(EPOCH FROM range.end_time) / 60
        + CASE WHEN range.end_time <= range.start_time THEN 1440 ELSE 0 END AS end_minute
    FROM public.resolve_work_assignment_time_ranges(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start,
      p_custom_end
    ) range
  )
  SELECT a.segment_position AS position_a, b.segment_position AS position_b
  INTO v_overlap
  FROM ranges a
  JOIN ranges b
    ON a.segment_position < b.segment_position
   AND a.start_minute < b.end_minute
   AND b.start_minute < a.end_minute
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Worked segments % and % have overlapping time ranges',
      v_overlap.position_a, v_overlap.position_b
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
