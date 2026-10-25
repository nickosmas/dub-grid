-- 092: An absence beside a shift keeps the time it covers (item 50b).
--
-- Since 082 a worked cell may carry an absence, read as "from the last shift's
-- end to the end of the day". That can't say someone arrived late, can't keep
-- a later shift's time once it comes off, and the server can't check it. The
-- absence now stores its own start and end, `HH:MM` like the custom times,
-- crossing midnight when the end is at or before the start.
--
-- Existing absences are backfilled from the last shift's effective end to its
-- scheduled end. One saved at the scheduled end (before 50a) covers nothing and
-- stays untimed; readers treat an untimed absence as before.
--
-- Function bodies are copied from their latest definitions (002, 032, 082,
-- 083, 085, 086, 087, 088) with only the absence times added. New arguments go
-- last with defaults and the old signatures are dropped, so callers that pass
-- no times keep working: a save fills the times the way the backfill does.

ALTER TABLE public.schedule_cell_snapshots
  ADD COLUMN absence_start_time TEXT,
  ADD COLUMN absence_end_time TEXT;

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_absence_times
  CHECK (
    (absence_start_time IS NULL AND absence_end_time IS NULL)
    OR (
      state_kind = 'worked'
      AND absence_type_id IS NOT NULL
      AND absence_start_time IS NOT NULL
      AND absence_end_time IS NOT NULL
      AND absence_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND absence_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND absence_start_time <> absence_end_time
    )
  );

-- The time an absence beside a shift covers when nobody said: from the last
-- shift's effective end to its scheduled end. No row when they match.
CREATE OR REPLACE FUNCTION public.rest_of_day_absence_fill_times(
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT,
  p_custom_end TEXT
)
RETURNS TABLE (start_time TEXT, end_time TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH worked AS (
    SELECT r.end_time
    FROM public.resolve_work_assignment_time_ranges(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start,
      p_custom_end
    ) r
    WHERE r.segment_position = COALESCE(array_length(p_job_ids, 1), 0)
  ),
  scheduled AS (
    SELECT r.end_time
    FROM public.resolve_work_assignment_time_ranges(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      NULL,
      NULL
    ) r
    WHERE r.segment_position = COALESCE(array_length(p_job_ids, 1), 0)
  )
  SELECT to_char(worked.end_time, 'HH24:MI'), to_char(scheduled.end_time, 'HH24:MI')
  FROM worked, scheduled
  WHERE worked.end_time IS NOT NULL
    AND scheduled.end_time IS NOT NULL
    AND worked.end_time <> scheduled.end_time;
$$;

-- Whether an absence's time overlaps any worked shift's effective time, with
-- the same clock-crossing rule as assert_non_overlapping_work_assignment_times.
CREATE OR REPLACE FUNCTION public.absence_times_overlap_work(
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT,
  p_custom_end TEXT,
  p_absence_start TEXT,
  p_absence_end TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_work_assignment_time_ranges(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start,
      p_custom_end
    ) w
    CROSS JOIN (
      SELECT p_absence_start::TIME AS start_time, p_absence_end::TIME AS end_time
    ) a
    WHERE CASE
      WHEN w.start_time < w.end_time AND a.start_time < a.end_time THEN
        w.start_time < a.end_time AND a.start_time < w.end_time
      WHEN w.start_time >= w.end_time AND a.start_time < a.end_time THEN
        (a.end_time > w.start_time) OR (a.start_time < w.end_time)
      WHEN w.start_time < w.end_time AND a.start_time >= a.end_time THEN
        (w.end_time > a.start_time) OR (w.start_time < a.end_time)
      ELSE TRUE
    END
  );
$$;

REVOKE EXECUTE ON FUNCTION public.rest_of_day_absence_fill_times(BIGINT[], BIGINT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.absence_times_overlap_work(BIGINT[], BIGINT[], TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Backfill. The schedulable-employee trigger would refuse a row belonging to
-- someone since made inactive; only the absence times change here, so it is
-- off for this one statement, as 061, 063 and 068 did for their data fixes.
ALTER TABLE public.schedule_cell_snapshots DISABLE TRIGGER trg_schedule_cell_snapshots_schedulable;
-- The notes trigger is deferred; fired at commit, its queued events would make
-- the ENABLE below fail ("pending trigger events"). It only clears notes of
-- shifts a cell lost, and the backfill loses none.
SET CONSTRAINTS public.trigger_schedule_notes_follow_snapshots IMMEDIATE;

WITH mixed AS (
  SELECT
    s.id,
    s.custom_start_time,
    s.custom_end_time,
    array_agg(seg.shift_id ORDER BY seg.position) AS shift_ids,
    array_agg(seg.job_id ORDER BY seg.position) AS job_ids
  FROM public.schedule_cell_snapshots s
  JOIN public.schedule_cell_segments seg ON seg.snapshot_id = s.id
  WHERE s.state_kind = 'worked'
    AND s.absence_type_id IS NOT NULL
    AND s.absence_start_time IS NULL
  GROUP BY s.id
),
filled AS (
  SELECT mixed.id, fill.start_time, fill.end_time
  FROM mixed
  CROSS JOIN LATERAL public.rest_of_day_absence_fill_times(
    mixed.shift_ids,
    mixed.job_ids,
    mixed.custom_start_time,
    mixed.custom_end_time
  ) fill
  WHERE NOT public.absence_times_overlap_work(
    mixed.shift_ids,
    mixed.job_ids,
    mixed.custom_start_time,
    mixed.custom_end_time,
    fill.start_time,
    fill.end_time
  )
)
UPDATE public.schedule_cell_snapshots s
SET absence_start_time = filled.start_time,
    absence_end_time = filled.end_time
FROM filled
WHERE s.id = filled.id;

ALTER TABLE public.schedule_cell_snapshots ENABLE TRIGGER trg_schedule_cell_snapshots_schedulable;
SET CONSTRAINTS public.trigger_schedule_notes_follow_snapshots DEFERRED;

-- ── Saving keeps, fills and checks the times ───────────────────────────────

-- The one place every snapshot write lands. A worked state with an absence
-- keeps the times it was given, or is filled as the backfill fills; given
-- times that cover nothing or overlap a worked shift are refused. When filling
-- finds no time (the shift was worked to its scheduled end) the absence stays
-- untimed, unless the caller requires times (the editor's save).
DROP FUNCTION public.sync_schedule_cell_snapshot(
  UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[], BOOLEAN[]
);
CREATE OR REPLACE FUNCTION public.sync_schedule_cell_snapshot(
  p_cell_id UUID,
  p_org_id UUID,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_absence_type_id BIGINT,
  p_custom_start_time TEXT,
  p_custom_end_time TEXT,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL,
  p_require_absence_times BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_segment_count INTEGER;
  v_index INTEGER;
  v_absence_start TEXT;
  v_absence_end TEXT;
BEGIN
  IF p_state_kind IS NULL THEN
    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = p_cell_id
      AND snapshot_kind = p_snapshot_kind;
    RETURN;
  END IF;

  IF p_state_kind = 'worked' AND p_absence_type_id IS NOT NULL THEN
    v_absence_start := to_char(NULLIF(TRIM(p_absence_start_time), '')::TIME, 'HH24:MI');
    v_absence_end := to_char(NULLIF(TRIM(p_absence_end_time), '')::TIME, 'HH24:MI');

    IF (v_absence_start IS NULL) <> (v_absence_end IS NULL) THEN
      RAISE EXCEPTION 'An absence needs both a start and an end time'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_absence_start IS NULL THEN
      SELECT fill.start_time, fill.end_time
      INTO v_absence_start, v_absence_end
      FROM public.rest_of_day_absence_fill_times(
        p_shift_ids, p_job_ids, p_custom_start_time, p_custom_end_time
      ) fill
      WHERE NOT public.absence_times_overlap_work(
        p_shift_ids, p_job_ids, p_custom_start_time, p_custom_end_time,
        fill.start_time, fill.end_time
      );
    ELSIF v_absence_start = v_absence_end
      OR public.absence_times_overlap_work(
        p_shift_ids, p_job_ids, p_custom_start_time, p_custom_end_time,
        v_absence_start, v_absence_end
      )
    THEN
      RAISE EXCEPTION 'The absence has to cover some of the shift''s time, apart from the time worked'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_absence_start IS NULL AND p_require_absence_times THEN
      RAISE EXCEPTION 'The absence has to cover some of the shift''s time, apart from the time worked'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.schedule_cell_snapshots (
    cell_id,
    org_id,
    snapshot_kind,
    state_kind,
    absence_type_id,
    custom_start_time,
    custom_end_time,
    absence_start_time,
    absence_end_time
  )
  VALUES (
    p_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    p_absence_type_id,
    p_custom_start_time,
    p_custom_end_time,
    v_absence_start,
    v_absence_end
  )
  ON CONFLICT (cell_id, snapshot_kind)
  DO UPDATE SET
    org_id = EXCLUDED.org_id,
    state_kind = EXCLUDED.state_kind,
    absence_type_id = EXCLUDED.absence_type_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time,
    absence_start_time = EXCLUDED.absence_start_time,
    absence_end_time = EXCLUDED.absence_end_time,
    updated_at = now()
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.schedule_cell_segments
  WHERE snapshot_id = v_snapshot_id;

  IF p_state_kind <> 'worked' THEN
    RETURN;
  END IF;

  v_segment_count := COALESCE(array_length(p_job_ids, 1), 0);
  IF v_segment_count <= 0 THEN
    RETURN;
  END IF;

  FOR v_index IN 1..v_segment_count LOOP
    INSERT INTO public.schedule_cell_segments (
      snapshot_id,
      org_id,
      position,
      shift_id,
      job_id,
      is_mentored
    )
    VALUES (
      v_snapshot_id,
      p_org_id,
      v_index - 1,
      p_shift_ids[v_index],
      p_job_ids[v_index],
      COALESCE(p_is_mentored_flags[v_index], false)
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_schedule_cell_snapshot(
  UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BIGINT[], BIGINT[], BOOLEAN[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

-- The editor's save. It requires times for an absence beside a shift, except
-- for a drag of a cell saved untimed before 50a (move_shift allows it).
DROP FUNCTION public.write_schedule_cell_snapshot(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, BOOLEAN[]
);
CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL,
  p_allow_untimed_absence BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_next_version BIGINT;
  v_cell_id UUID;
  v_actor_id UUID := auth.uid();
BEGIN
  IF p_snapshot_kind NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid snapshot kind: %', p_snapshot_kind;
  END IF;

  IF p_state_kind NOT IN ('worked', 'absence', 'deleted') THEN
    RAISE EXCEPTION 'Invalid state kind: %', p_state_kind;
  END IF;

  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_state_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked snapshots must include at least one segment';
  END IF;

  IF p_state_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence snapshots must include an absence type';
  END IF;

  IF p_state_kind IN ('absence', 'deleted') AND (
    COALESCE(array_length(p_shift_ids, 1), 0) > 0
    OR COALESCE(array_length(p_job_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Only worked snapshots may include segments';
  END IF;

  IF p_state_kind = 'worked' THEN
    PERFORM public.assert_non_overlapping_work_assignment_times(
      p_org_id,
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start_time,
      p_custom_end_time
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, v_cell.version;
    END IF;

    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        series_id = COALESCE(p_series_id, schedule_cells.series_id),
        from_recurring = CASE
          WHEN p_from_recurring IS TRUE THEN TRUE
          ELSE schedule_cells.from_recurring
        END,
        focus_area_id = COALESCE(p_focus_area_id, schedule_cells.focus_area_id),
        updated_by = v_actor_id,
        updated_at = now()
    WHERE id = v_cell.id
    RETURNING id INTO v_cell_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, NULL;
    END IF;

    v_next_version := 0;

    INSERT INTO public.schedule_cells (
      org_id,
      emp_id,
      date,
      focus_area_id,
      version,
      series_id,
      from_recurring,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_emp_id,
      p_date,
      p_focus_area_id,
      0,
      p_series_id,
      p_from_recurring,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_cell_id;
  END IF;

  PERFORM public.sync_schedule_cell_snapshot(
    v_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    CASE
      WHEN p_state_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END,
    p_absence_start_time,
    p_absence_end_time,
    NOT COALESCE(p_allow_untimed_absence, FALSE)
  );

  RETURN v_next_version;
END;
$$;

-- Recreated, so it takes the privileges the old signature had (016, 004).
REVOKE ALL ON FUNCTION public.write_schedule_cell_snapshot(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_schedule_cell_snapshot(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
) TO authenticated;

DROP FUNCTION public.write_schedule_cell_snapshot_internal(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, UUID, BOOLEAN[]
);
CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot_internal(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell public.schedule_cells%ROWTYPE;
  v_next_version BIGINT;
  v_cell_id UUID;
  v_actor_id UUID := COALESCE(p_actor_id, auth.uid());
BEGIN
  IF p_snapshot_kind NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid snapshot kind: %', p_snapshot_kind;
  END IF;

  IF p_state_kind NOT IN ('worked', 'absence', 'deleted') THEN
    RAISE EXCEPTION 'Invalid state kind: %', p_state_kind;
  END IF;

  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_state_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked snapshots must include at least one segment';
  END IF;

  IF p_state_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence snapshots must include an absence type';
  END IF;

  IF p_state_kind IN ('absence', 'deleted') AND (
    COALESCE(array_length(p_shift_ids, 1), 0) > 0
    OR COALESCE(array_length(p_job_ids, 1), 0) > 0
  ) THEN
    RAISE EXCEPTION 'Only worked snapshots may include segments';
  END IF;

  IF p_state_kind = 'worked' THEN
    PERFORM public.assert_non_overlapping_work_assignment_times(
      p_org_id,
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      p_custom_start_time,
      p_custom_end_time
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT *
  INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id
    AND emp_id = p_emp_id
    AND date = p_date
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_version IS NOT NULL AND v_cell.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, v_cell.version;
    END IF;

    v_next_version := v_cell.version + 1;

    UPDATE public.schedule_cells
    SET version = v_next_version,
        series_id = COALESCE(p_series_id, schedule_cells.series_id),
        from_recurring = CASE
          WHEN p_from_recurring IS TRUE THEN TRUE
          ELSE schedule_cells.from_recurring
        END,
        focus_area_id = COALESCE(p_focus_area_id, schedule_cells.focus_area_id),
        updated_by = v_actor_id,
        updated_at = now()
    WHERE id = v_cell.id
    RETURNING id INTO v_cell_id;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
        p_expected_version, NULL;
    END IF;

    v_next_version := 0;

    INSERT INTO public.schedule_cells (
      org_id,
      emp_id,
      date,
      focus_area_id,
      version,
      series_id,
      from_recurring,
      created_by,
      updated_by
    )
    VALUES (
      p_org_id,
      p_emp_id,
      p_date,
      p_focus_area_id,
      0,
      p_series_id,
      p_from_recurring,
      v_actor_id,
      v_actor_id
    )
    RETURNING id INTO v_cell_id;
  END IF;

  PERFORM public.sync_schedule_cell_snapshot(
    v_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    CASE
      WHEN p_state_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_state_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END,
    p_absence_start_time,
    p_absence_end_time
  );

  RETURN v_next_version;
END;
$$;

-- Only other SQL functions call it, as before (016).
REVOKE ALL ON FUNCTION public.write_schedule_cell_snapshot_internal(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT, BIGINT, UUID, BOOLEAN[], TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.build_schedule_cell_state_json(
  TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN[], BIGINT
);
CREATE OR REPLACE FUNCTION public.build_schedule_cell_state_json(
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_focus_area_id BIGINT DEFAULT NULL,
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH ordered_segments AS (
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'shiftId', segment.shift_id,
            'jobId', segment.job_id,
            'position', segment.ordinality - 1,
            'isMentored', COALESCE(segment.is_mentored, FALSE)
          )
          ORDER BY segment.ordinality
        ),
        '[]'::JSONB
      ) AS segments
    FROM unnest(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
  )
  SELECT jsonb_build_object(
    'kind', COALESCE(p_state_kind, 'deleted'),
    'segments', CASE
      WHEN p_state_kind = 'worked' THEN ordered_segments.segments
      ELSE '[]'::JSONB
    END,
    'focusAreaId', p_focus_area_id,
    'absenceTypeId', CASE
      WHEN p_state_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    'customStartTime', CASE
      WHEN p_state_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    'customEndTime', CASE
      WHEN p_state_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    'absenceStartTime', CASE
      WHEN p_state_kind = 'worked' AND p_absence_type_id IS NOT NULL THEN p_absence_start_time
      ELSE NULL
    END,
    'absenceEndTime', CASE
      WHEN p_state_kind = 'worked' AND p_absence_type_id IS NOT NULL THEN p_absence_end_time
      ELSE NULL
    END,
    'seriesId', p_series_id,
    'fromRecurring', COALESCE(p_from_recurring, FALSE)
  )
  FROM ordered_segments;
$$;

-- Only other SQL functions call it; nothing outside the database does.
REVOKE ALL ON FUNCTION public.build_schedule_cell_state_json(
  TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN[], BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT);
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
  is_mentored_flags BOOLEAN[],
  absence_start_time TEXT,
  absence_end_time TEXT
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
      snapshot.absence_start_time,
      snapshot.absence_end_time,
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
      snapshot.custom_end_time,
      snapshot.absence_start_time,
      snapshot.absence_end_time
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
    aggregated_segments.is_mentored_flags,
    aggregated_segments.absence_start_time,
    aggregated_segments.absence_end_time
  FROM aggregated_segments;
$$;

REVOKE EXECUTE ON FUNCTION public.get_schedule_cell_snapshot_payload(UUID, UUID, DATE, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ── Publish, import, drag and requests carry the times ─────────────────────
CREATE OR REPLACE FUNCTION public.publish_schedule_unguarded(p_org_id uuid, p_start_date date, p_end_date date, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
DECLARE
  v_changes JSONB := '[]'::JSONB;
  v_change_count INTEGER := 0;
  v_history_id UUID;
  v_note_new INTEGER := 0;
  v_note_deleted INTEGER := 0;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  v_is_gridmaster BOOLEAN := FALSE;
  v_org_role public.org_role := 'user'::public.org_role;
  r RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing actor identity';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_actor_id
      AND platform_role = 'gridmaster'
  )
  INTO v_is_gridmaster;

  SELECT COALESCE(
    (
      SELECT cm.org_role
      FROM public.organization_memberships cm
      WHERE cm.user_id = v_actor_id
        AND cm.org_id = p_org_id
        AND cm.archived_at IS NULL
      LIMIT 1
    ),
    'user'::public.org_role
  )
  INTO v_org_role;

  IF NOT (
    v_is_gridmaster
    OR v_org_role::TEXT IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- Enforce canPublishSchedule for admins (super_admin and gridmaster bypass)
  IF v_org_role::TEXT = 'admin' AND NOT v_is_gridmaster THEN
    IF NOT COALESCE(
      (SELECT (cm.admin_permissions->>'canPublishSchedule')::BOOLEAN
       FROM public.organization_memberships cm
       WHERE cm.user_id = v_actor_id
         AND cm.org_id = p_org_id
         AND cm.archived_at IS NULL),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to publish the schedule';
    END IF;
  END IF;

  -- Advisory lock prevents concurrent publishes for same org
  PERFORM pg_advisory_xact_lock(hashtext('publish_schedule_' || p_org_id::TEXT));

  -- Capture draft changes from canonical schedule cells and promote them.
  FOR r IN
    SELECT
      c.id AS cell_id,
      c.emp_id,
      c.date,
      c.series_id,
      c.from_recurring,
      c.focus_area_id,
      c.updated_by,
      draft.state_kind AS draft_state_kind,
      draft.absence_type_id AS draft_absence_type_id,
      draft.custom_start_time AS draft_custom_start,
      draft.custom_end_time AS draft_custom_end,
      draft.shift_ids AS draft_shift_ids,
      draft.job_ids AS draft_job_ids,
      draft.is_mentored_flags AS draft_is_mentored_flags,
      draft.absence_start_time AS draft_absence_start,
      draft.absence_end_time AS draft_absence_end,
      published.state_kind AS published_state_kind,
      published.absence_type_id AS published_absence_type_id,
      published.custom_start_time AS published_custom_start,
      published.custom_end_time AS published_custom_end,
      published.shift_ids AS published_shift_ids,
      published.job_ids AS published_job_ids,
      published.is_mentored_flags AS published_is_mentored_flags,
      published.absence_start_time AS published_absence_start,
      published.absence_end_time AS published_absence_end
    FROM public.schedule_cells c
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'draft'
    ) AS draft ON TRUE
    LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'published'
    ) AS published ON TRUE
    WHERE c.org_id = p_org_id
      AND c.date >= p_start_date
      AND c.date <= p_end_date
    -- Same order discard_schedule_drafts takes its locks in. Without it the
    -- scan returned cells in date order while the discard locked them by id,
    -- so two overlapping ranges running at once took the same rows in
    -- opposite orders and Postgres killed one with a deadlock (reproduced on
    -- two connections, SQLSTATE 40P01). No data was ever lost; the caller
    -- just saw a 500 instead of waiting its turn.
    ORDER BY c.id
  LOOP
    -- A draft that matches its published snapshot (an edit that was undone
    -- before publishing) changes nothing: recording it made the history say
    -- "1 edited", tinted the cell in the change overlay with nothing to show,
    -- and told the employee their shift was changed. Drop the draft and move on.
    IF r.draft_state_kind <> 'deleted'
      AND r.published_state_kind IS NOT DISTINCT FROM r.draft_state_kind
      AND r.published_absence_type_id IS NOT DISTINCT FROM r.draft_absence_type_id
      AND r.published_custom_start IS NOT DISTINCT FROM r.draft_custom_start
      AND r.published_custom_end IS NOT DISTINCT FROM r.draft_custom_end
      AND r.published_absence_start IS NOT DISTINCT FROM r.draft_absence_start
      AND r.published_absence_end IS NOT DISTINCT FROM r.draft_absence_end
      AND COALESCE(r.published_shift_ids, '{}'::BIGINT[]) = COALESCE(r.draft_shift_ids, '{}'::BIGINT[])
      AND COALESCE(r.published_job_ids, '{}'::BIGINT[]) = COALESCE(r.draft_job_ids, '{}'::BIGINT[])
      AND COALESCE(r.published_is_mentored_flags, '{}'::BOOLEAN[]) = COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
    THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.cell_id
        AND snapshot_kind = 'draft';
      CONTINUE;
    END IF;

    v_change_count := v_change_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'empId', r.emp_id,
      'date', r.date,
      'kind', CASE
        WHEN r.draft_state_kind = 'deleted' THEN 'deleted'
        WHEN r.published_state_kind IS NULL THEN 'new'
        ELSE 'modified'
      END,
      'fromState', CASE
        WHEN r.published_state_kind IS NULL THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.published_state_kind,
          r.published_shift_ids,
          r.published_job_ids,
          r.published_absence_type_id,
          r.published_custom_start,
          r.published_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.published_is_mentored_flags, '{}'::BOOLEAN[]),
          p_absence_start_time => r.published_absence_start,
          p_absence_end_time => r.published_absence_end
        )
      END,
      'toState', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.draft_state_kind,
          r.draft_shift_ids,
          r.draft_job_ids,
          r.draft_absence_type_id,
          r.draft_custom_start,
          r.draft_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[]),
          p_absence_start_time => r.draft_absence_start,
          p_absence_end_time => r.draft_absence_end
        )
      END,
      'fromAbsenceTypeId', r.published_absence_type_id,
      'toAbsenceTypeId', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_absence_type_id
      END,
      'updatedBy', r.updated_by,
      'fromCustomStart', r.published_custom_start,
      'fromCustomEnd', r.published_custom_end,
      'toCustomStart', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_start
      END,
      'toCustomEnd', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_end
      END
    ));

    IF r.draft_state_kind = 'deleted' THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.cell_id;
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        r.emp_id,
        r.date,
        'published',
        r.draft_state_kind,
        COALESCE(r.draft_shift_ids, '{}'::BIGINT[]),
        COALESCE(r.draft_job_ids, '{}'::BIGINT[]),
        r.draft_absence_type_id,
        r.draft_custom_start,
        r.draft_custom_end,
        r.series_id,
        r.from_recurring,
        r.focus_area_id,
        NULL,
        v_actor_id,
        COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => r.draft_absence_start,
        p_absence_end_time => r.draft_absence_end
      );

      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.cell_id
        AND snapshot_kind = 'draft';

      PERFORM public.prune_empty_schedule_cell(r.cell_id);
    END IF;
  END LOOP;

  -- Count note changes
  SELECT COUNT(*) INTO v_note_new FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft';
  SELECT COUNT(*) INTO v_note_deleted FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft_deleted';

  v_change_count := v_change_count + v_note_new + v_note_deleted;

  -- Insert publish_history record
  INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
  VALUES (p_org_id, v_actor_id, p_start_date, p_end_date, v_change_count)
  RETURNING id INTO v_history_id;

  -- Explode the in-memory changes array into one row per changed cell.
  INSERT INTO public.schedule_publish_changes (
    publish_history_id, org_id, emp_id, date, kind, from_state, to_state,
    from_absence_type_id, to_absence_type_id, updated_by,
    from_custom_start, from_custom_end, to_custom_start, to_custom_end
  )
  SELECT
    v_history_id,
    p_org_id,
    (c->>'empId')::UUID,
    (c->>'date')::DATE,
    c->>'kind',
    c->'fromState',
    c->'toState',
    NULLIF(c->>'fromAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'toAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'updatedBy', '')::UUID,
    -- Snapshot times are pipe-delimited per segment ("07:00|15:00" for a
    -- double shift). These TIME columns are a legacy summary the client only
    -- reads when a change carries no state JSON, so keep the first segment's
    -- time rather than failing the whole publish on the delimiter.
    NULLIF(split_part(COALESCE(c->>'fromCustomStart', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'fromCustomEnd', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'toCustomStart', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'toCustomEnd', ''), '|', 1), '')::TIME
  FROM jsonb_array_elements(v_changes) AS c;

  -- Notes: draft → published
  UPDATE public.schedule_notes
  SET status = 'published', updated_at = NOW()
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft';

  -- Notes: finalize deletions
  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft_deleted';

  -- Purge old history (keep last 100 per org)
  DELETE FROM public.publish_history
  WHERE org_id = p_org_id
    AND id NOT IN (
      SELECT id FROM public.publish_history
      WHERE org_id = p_org_id
      ORDER BY published_at DESC
      LIMIT 100
    );

  RETURN v_history_id;
END;
$$;

DROP FUNCTION public.move_shift(
  UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, BOOLEAN[]
);
CREATE OR REPLACE FUNCTION public.move_shift(
  p_org_id            UUID,
  p_source_emp_id     UUID,
  p_source_date       DATE,
  p_target_emp_id     UUID,
  p_target_date       DATE,
  p_kind              TEXT,
  p_shift_ids         BIGINT[],
  p_job_ids           BIGINT[],
  p_absence_type_id   BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time   TEXT DEFAULT NULL,
  p_drag_mode         TEXT DEFAULT 'move',
  p_expected_version  BIGINT DEFAULT NULL,
  p_target_expected_version BIGINT DEFAULT NULL,
  p_target_was_empty  BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_cell public.schedule_cells%ROWTYPE;
  v_target_cell public.schedule_cells%ROWTYPE;
  v_target_found BOOLEAN := FALSE;
  v_target_write_expected_version BIGINT;
  v_lock_key_src  TEXT;
  v_lock_key_tgt  TEXT;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  -- Org scoping: caller must belong to p_org_id (gridmaster exempt)
  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_drag_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Invalid drag mode: %', p_drag_mode;
  END IF;

  IF p_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Invalid move payload kind: %', p_kind;
  END IF;

  -- Reject no-op self-move
  IF p_source_emp_id = p_target_emp_id AND p_source_date = p_target_date THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- Validate target employee is active and belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_target_emp_id AND e.org_id = p_org_id
      AND e.status = 'active' AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target employee not found, archived, or inactive';
  END IF;

  -- Advisory locks in deterministic order to prevent deadlocks
  v_lock_key_src := p_source_emp_id::TEXT || '_' || p_source_date::TEXT;
  v_lock_key_tgt := p_target_emp_id::TEXT || '_' || p_target_date::TEXT;

  IF v_lock_key_src < v_lock_key_tgt THEN
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
  END IF;

  -- Validate source schedule cell exists and belongs to org
  SELECT *
  INTO v_source_cell
  FROM public.schedule_cells
  WHERE emp_id = p_source_emp_id
    AND date = p_source_date
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source shift not found';
  END IF;

  IF p_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence moves require an absence type';
  END IF;

  IF p_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked moves require at least one segment';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_kind = 'absence' AND (
    array_length(COALESCE(p_shift_ids, '{}'::BIGINT[]), 1) IS NOT NULL
    OR array_length(COALESCE(p_job_ids, '{}'::BIGINT[]), 1) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot move both worked segments and an absence type';
  END IF;

  -- Optimistic lock check
  IF p_expected_version IS NOT NULL AND v_source_cell.version != p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_source_cell.version;
  END IF;

  SELECT *
  INTO v_target_cell
  FROM public.schedule_cells
  WHERE emp_id = p_target_emp_id
    AND date = p_target_date
    AND org_id = p_org_id
  FOR UPDATE;

  v_target_found := FOUND;

  IF p_target_was_empty AND v_target_found THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected empty target, found version %',
      v_target_cell.version;
  END IF;

  IF p_target_expected_version IS NOT NULL THEN
    IF NOT v_target_found AND p_target_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, NULL;
    END IF;

    IF v_target_found AND v_target_cell.version IS DISTINCT FROM p_target_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, v_target_cell.version;
    END IF;
  END IF;

  v_target_write_expected_version := COALESCE(
    p_target_expected_version,
    CASE
      WHEN p_target_was_empty THEN 0
      WHEN v_target_found THEN v_target_cell.version
      ELSE 0
    END
  );

  PERFORM public.write_schedule_cell_snapshot(
    p_org_id,
    p_target_emp_id,
    p_target_date,
    'draft',
    p_kind,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    NULL,
    FALSE,
    v_source_cell.focus_area_id,
    v_target_write_expected_version,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END,
    p_absence_start_time => CASE WHEN p_kind = 'worked' THEN p_absence_start_time END,
    p_absence_end_time => CASE WHEN p_kind = 'worked' THEN p_absence_end_time END,
    -- A cell saved untimed before 50a still moves as it is.
    p_allow_untimed_absence => TRUE
  );

  -- Delete source only for real moves. Copies leave the origin untouched.
  IF p_drag_mode = 'move' THEN
    PERFORM public.delete_schedule_cell_draft(
      p_org_id,
      p_source_emp_id,
      p_source_date,
      p_expected_version
    );
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- Recreated, so it takes the privileges the old signature had (016, 004).
REVOKE ALL ON FUNCTION public.move_shift(
  UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, BOOLEAN[], TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_shift(
  UUID, UUID, DATE, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN, BOOLEAN[], TEXT, TEXT
) TO authenticated;
CREATE OR REPLACE FUNCTION public.import_previous_schedule(
  p_org_id        UUID,
  p_source_start  DATE,
  p_source_end    DATE,
  p_target_start  DATE,
  p_target_end    DATE,
  p_dry_run       BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  emp_id      UUID,
  source_date DATE,
  target_date DATE,
  outcome     TEXT,
  reason      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id        UUID := auth.uid();
  v_source_span     INTEGER;
  v_target_span     INTEGER;
  r                 RECORD;
  v_disq            TEXT;
  v_segment_disq    TEXT;
  v_segment_count   INTEGER;
  v_existing_version BIGINT;
BEGIN
  -- Permission gates: same as every other draft-write path.
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_source_start IS NULL OR p_source_end IS NULL
     OR p_target_start IS NULL OR p_target_end IS NULL THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF p_source_end < p_source_start OR p_target_end < p_target_start THEN
    RAISE EXCEPTION 'Range end precedes range start';
  END IF;

  v_source_span := (p_source_end - p_source_start) + 1;
  v_target_span := (p_target_end - p_target_start) + 1;
  IF v_source_span <> v_target_span THEN
    RAISE EXCEPTION 'Source and target ranges must cover the same number of days';
  END IF;

  -- Serialize concurrent imports against the same target.
  PERFORM pg_advisory_xact_lock(
    hashtext('import_previous_' || p_org_id::TEXT || '_' || p_target_start::TEXT)
  );

  -- Iterate the effective source cells. The CTE picks the draft if present
  -- and not deleted, else the published snapshot — matching the client's
  -- display rule. Cells whose effective snapshot is empty are dropped.
  FOR r IN
    WITH effective AS (
      SELECT
        c.emp_id,
        c.date AS source_date,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.id
          ELSE published.id
        END AS snapshot_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.state_kind
          ELSE published.state_kind
        END AS state_kind,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_type_id
          ELSE published.absence_type_id
        END AS absence_type_id,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_start_time
          ELSE published.custom_start_time
        END AS custom_start_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.custom_end_time
          ELSE published.custom_end_time
        END AS custom_end_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_start_time
          ELSE published.absence_start_time
        END AS absence_start_time,
        CASE
          WHEN draft.id IS NOT NULL AND draft.state_kind <> 'deleted'
            THEN draft.absence_end_time
          ELSE published.absence_end_time
        END AS absence_end_time
      FROM public.schedule_cells c
      LEFT JOIN public.schedule_cell_snapshots draft
        ON draft.cell_id = c.id AND draft.snapshot_kind = 'draft'
      LEFT JOIN public.schedule_cell_snapshots published
        ON published.cell_id = c.id AND published.snapshot_kind = 'published'
      WHERE c.org_id = p_org_id
        AND c.date BETWEEN p_source_start AND p_source_end
        AND (
          (draft.id IS NOT NULL AND draft.state_kind <> 'deleted')
          OR (draft.id IS NULL AND published.id IS NOT NULL)
        )
    ),
    with_segments AS (
      SELECT
        eff.emp_id,
        eff.source_date,
        eff.state_kind,
        eff.absence_type_id,
        eff.custom_start_time,
        eff.custom_end_time,
        eff.absence_start_time,
        eff.absence_end_time,
        COALESCE(
          ARRAY(
            SELECT seg.shift_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS shift_ids,
        COALESCE(
          ARRAY(
            SELECT seg.job_id
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BIGINT[]
        ) AS job_ids,
        COALESCE(
          ARRAY(
            SELECT COALESCE(seg.is_mentored, FALSE)
            FROM public.schedule_cell_segments seg
            WHERE seg.snapshot_id = eff.snapshot_id
            ORDER BY seg.position
          ),
          '{}'::BOOLEAN[]
        ) AS is_mentored_flags
      FROM effective eff
    )
    SELECT
      ws.emp_id,
      ws.source_date,
      (p_target_start + (ws.source_date - p_source_start))::DATE AS target_date,
      ws.state_kind,
      ws.absence_type_id,
      ws.custom_start_time,
      ws.custom_end_time,
      ws.absence_start_time,
      ws.absence_end_time,
      ws.shift_ids,
      ws.job_ids,
      ws.is_mentored_flags
    FROM with_segments ws
    ORDER BY ws.source_date, ws.emp_id
  LOOP
    -- Initialize OUT row for this iteration.
    emp_id := r.emp_id;
    source_date := r.source_date;
    target_date := r.target_date;
    outcome := NULL;
    reason := NULL;

    -- Defensive: effective state must actually have content. The CTE filters
    -- empty effective snapshots, but worked-with-zero-segments could slip
    -- past the filter; reject explicitly so the UI surfaces it.
    IF r.state_kind = 'worked' AND COALESCE(array_length(r.job_ids, 1), 0) = 0 THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF r.state_kind = 'absence' AND r.absence_type_id IS NULL THEN
      outcome := 'skipped';
      reason := 'source_has_no_content';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Employee active gate.
    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = r.emp_id
        AND e.org_id = p_org_id
        AND e.archived_at IS NULL
        AND e.status = 'active'
    ) THEN
      outcome := 'skipped';
      reason := 'employee_inactive';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Serialize check + write against any concurrent writer of this target
    -- cell using the same advisory key write_schedule_cell_snapshot_internal
    -- uses. Without this lock, a manual draft landing between the empty
    -- check and our write would be silently overwritten. Advisory locks are
    -- reentrant within one xact, so the inner write's lock acquisition is a
    -- no-op.
    PERFORM pg_advisory_xact_lock(
      hashtext('schedule_cell_' || r.emp_id::TEXT || '_' || r.target_date::TEXT)
    );

    -- Target already has effective content (any draft non-deleted, or any
    -- published). Uses the exact same rule grid display uses.
    IF public.schedule_cell_has_effective_content(p_org_id, r.emp_id, r.target_date) THEN
      outcome := 'skipped';
      reason := 'target_has_data';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Per-segment qualification gate (worked only). First failing segment
    -- names the reason.
    IF r.state_kind = 'worked' THEN
      v_segment_count := COALESCE(array_length(r.job_ids, 1), 0);
      v_disq := NULL;
      FOR i IN 1..v_segment_count LOOP
        v_segment_disq := public.is_employee_qualified_for_shift_job(
          r.emp_id, r.shift_ids[i], r.job_ids[i]
        );
        IF v_segment_disq IS NOT NULL THEN
          v_disq := v_segment_disq;
          EXIT;
        END IF;
      END LOOP;

      IF v_disq IS NOT NULL THEN
        outcome := 'skipped';
        reason := 'disqualified:' || v_disq;
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    -- All gates passed.
    IF p_dry_run THEN
      outcome := 'imported';
      reason := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT c.version INTO v_existing_version
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.emp_id = r.emp_id
      AND c.date = r.target_date;

    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.target_date,
      'draft',
      r.state_kind,
      CASE WHEN r.state_kind = 'worked' THEN r.shift_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind = 'worked' THEN r.job_ids ELSE '{}'::BIGINT[] END,
      CASE WHEN r.state_kind IN ('absence', 'worked') THEN r.absence_type_id ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_start_time ELSE NULL END,
      CASE WHEN r.state_kind = 'worked' THEN r.custom_end_time ELSE NULL END,
      NULL,
      FALSE,
      NULL,
      COALESCE(v_existing_version, 0),
      v_actor_id,
      CASE WHEN r.state_kind = 'worked' THEN r.is_mentored_flags ELSE '{}'::BOOLEAN[] END,
      p_absence_start_time => r.absence_start_time,
      p_absence_end_time => r.absence_end_time
    );

    outcome := 'imported';
    reason := NULL;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- Each write that keeps the cell's own absence keeps its times too.
CREATE OR REPLACE FUNCTION public.resolve_shift_request_unchecked(
  p_request_id    UUID,
  p_approved      BOOLEAN,
  p_note          TEXT,
  p_admin_user_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_admin_user_id UUID := p_admin_user_id;
  v_req_shift RECORD;
  v_tgt_shift RECORD;
  v_requester_state RECORD;
  v_target_state RECORD;
  v_requester_custom_start TEXT;
  v_requester_custom_end TEXT;
  v_target_custom_start TEXT;
  v_target_custom_end TEXT;
  v_source_matches BOOLEAN;
  v_row_count INTEGER;
  v_requester_employee RECORD;
  v_target_employee RECORD;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_requester_match_ordinal INTEGER;
  v_target_match_ordinal INTEGER;
  v_requester_segment_count INTEGER;
  v_target_segment_count INTEGER;
  v_remaining_shift_ids BIGINT[];
  v_remaining_job_ids BIGINT[];
  v_remaining_is_mentored_flags BOOLEAN[];
  v_remaining_custom_start TEXT;
  v_remaining_custom_end TEXT;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Request is not pending approval (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate org scoping
  IF v_request.org_id != public.caller_org_id() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: request belongs to a different organization';
  END IF;

  -- Authority and attribution come from p_admin_user_id, not the JWT:
  -- auto-approval acts for the approver who is party to the request, who
  -- is not always the caller. The org check above still ties the caller's
  -- session to this org, and only the two wrappers below can reach here.
  IF NOT public.user_can_approve_shift_requests(p_admin_user_id, v_request.org_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
  END IF;

  IF NOT p_approved THEN
    -- Rejecting a claimed public/calloff pickup releases it for another
    -- single applicant instead of permanently closing the open shift.
    IF v_request.type = 'pickup'
       AND v_request.target_emp_id IS NOT NULL
       AND v_request.target_state IS NULL THEN
      UPDATE public.shift_requests
      SET status = 'open',
          target_emp_id = NULL,
          target_shift_date = NULL,
          admin_user_id = v_admin_user_id,
          admin_note = p_note,
          resolved_at = NULL,
          updated_at = now()
      WHERE id = p_request_id;
      RETURN;
    END IF;

    -- Reject
    UPDATE public.shift_requests
    SET status = 'rejected', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- ── APPROVAL: execute the shift reassignment ──
  SELECT * INTO v_requester_state
  FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.requester_state);
  v_requester_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_requester_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF v_request.target_state IS NOT NULL THEN
    SELECT * INTO v_target_state
    FROM public.resolve_schedule_state_storage(v_request.org_id, v_request.target_state);
    v_target_custom_start := NULLIF(v_request.target_state->>'customStartTime', '');
    v_target_custom_end := NULLIF(v_request.target_state->>'customEndTime', '');
  END IF;

  -- ── CALLOFF: apply absence + spawn open pickup ──
  IF v_request.type = 'calloff' THEN
    -- Advisory lock on requester's shift
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));

    -- Re-validate requester's shift still matches snapshot
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the calloff was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);

    IF v_requester_segment_count <= 1 THEN
      -- Full-day calloff: preserve the existing absence-cell behavior.
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'absence',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_request.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        v_req_shift.version,
        v_admin_user_id
      );
    ELSE
      -- Partial calloff: remove only the selected segment. The calloff request
      -- remains the durable absence record for that individual shift.
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_start_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );
      v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
        v_req_shift.custom_end_time,
        v_requester_match_ordinal,
        v_requester_segment_count
      );

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_req_shift.absence_type_id,
        v_remaining_custom_start,
        v_remaining_custom_end,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    END IF;

    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = v_req_shift.cell_id
      AND snapshot_kind = 'draft';

    -- Auto-create an open pickup request so other staff can claim the vacated shift
    INSERT INTO public.shift_requests (
      org_id, type, status,
      requester_emp_id, requester_shift_date, requester_state,
      parent_request_id
    ) VALUES (
      v_request.org_id, 'pickup', 'open',
      v_request.requester_emp_id, v_request.requester_shift_date,
      v_request.requester_state,
      p_request_id
    );

    -- Mark calloff as approved
    UPDATE public.shift_requests
    SET status = 'approved', admin_user_id = v_admin_user_id,
        admin_note = p_note, resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;

    -- Cascade-cancel other active requests involving this shift
    UPDATE public.shift_requests
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: shift was called off',
        resolved_at = now(), updated_at = now()
    WHERE id != p_request_id
      AND parent_request_id IS DISTINCT FROM p_request_id
      AND org_id = v_request.org_id
      AND status IN ('open', 'pending_approval')
      AND (
        (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
        OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      );

    RETURN;
  END IF;

  -- Advisory lock on involved shifts to prevent concurrent modifications.
  -- Acquire in deterministic order (alphabetical by key) to prevent deadlocks.
  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NOT NULL THEN
      -- Calloff-claimed pickup: lock both requester and target shifts
      IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
         < (v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
      THEN
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      ELSE
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
        PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      END IF;
    ELSE
      -- Volunteer pickup: only lock the volunteer's date
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  ELSIF v_request.type = 'swap' THEN
    IF (v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT)
       < (v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT)
    THEN
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
    ELSE
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.target_emp_id::TEXT || '_' || v_request.target_shift_date::TEXT));
      PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_request.requester_emp_id::TEXT || '_' || v_request.requester_shift_date::TEXT));
    END IF;
  END IF;

  -- Re-validate both employees are still active (status could change between creation and approval)
  SELECT id, focus_area_ids, certification_id, role_ids
  INTO v_requester_employee
  FROM public.employees
    WHERE id = v_request.requester_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
  ;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requester is no longer active. Cannot approve.';
  END IF;

  IF v_request.target_emp_id IS NOT NULL THEN
    SELECT id, focus_area_ids, certification_id, role_ids
    INTO v_target_employee
    FROM public.employees
    WHERE id = v_request.target_emp_id AND org_id = v_request.org_id
      AND archived_at IS NULL AND status = 'active'
    ;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target employee is no longer active. Cannot approve.';
    END IF;
  END IF;

  -- Verify requester's shift still exists as snapshotted
  -- (Skip for volunteer pickups — there is no original shift to validate against)
  -- (Skip for a call-off's own open pickup: the call-off already took the shift)
  IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL)
     AND v_request.parent_request_id IS NULL THEN
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;

    v_requester_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_req_shift.custom_start_time,
      v_req_shift.custom_end_time,
      v_requester_state.shift_ids[1],
      v_requester_state.job_ids[1],
      COALESCE(v_requester_state.is_mentored_flags[1], FALSE),
      v_requester_custom_start,
      v_requester_custom_end
    );

    IF v_requester_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. Please ask the employee to resubmit.';
    END IF;
  END IF;

  IF v_request.type = 'pickup' THEN
    IF v_request.target_emp_id IS NULL THEN
      -- ── VOLUNTEER PICKUP: no source shift to transfer, just assign to volunteer ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteered shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_requester_employee.certification_id IS NOT NULL
                  AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_requester_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_requester_employee.certification_id IS NOT NULL
                    AND v_requester_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: volunteer is no longer assigned to the required focus area';
      END IF;

      SELECT COALESCE(
        NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
        1
      )
      INTO v_mentored_credit
      FROM public.organizations o
      WHERE o.id = v_request.org_id;

      v_day_of_week := EXTRACT(DOW FROM v_request.requester_shift_date)::INTEGER;

      FOR v_segment IN
        SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
        FROM unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      LOOP
        SELECT cr.min_staff
        INTO v_required_staff
        FROM public.coverage_requirements cr
        WHERE cr.org_id = v_request.org_id
          AND cr.focus_area_id = v_requester_state.focus_area_id
          AND cr.job_id = v_segment.job_id
          AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
          AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
          AND cr.min_staff > 0
        ORDER BY
          CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
          CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_required_staff IS NULL THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;

        SELECT COALESCE(SUM(
          CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
        ), 0)
        INTO v_actual_staff
        FROM public.employees e
        JOIN LATERAL public.get_schedule_cell_snapshot_payload(
          v_request.org_id,
          e.id,
          v_request.requester_shift_date,
          'published'
        ) snapshot ON TRUE
        JOIN LATERAL unnest(
          COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
          COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
        WHERE e.org_id = v_request.org_id
          AND e.archived_at IS NULL
          AND e.status = 'active'
          AND v_requester_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
          AND snapshot.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND snapshot.state_kind = 'worked'
          AND scheduled_segment.job_id = v_segment.job_id
          AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

        IF v_actual_staff >= v_required_staff THEN
          RAISE EXCEPTION 'Cannot approve: that open shift is no longer available';
        END IF;
      END LOOP;

      -- Re-check at approval: volunteer must not have an overlapping shift now
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF FOUND AND v_tgt_shift.state_kind = 'worked' AND v_tgt_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'The volunteer is absent for the rest of this day. Cannot approve.';
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The volunteer has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

    ELSE
      -- ── CALLOFF-CLAIMED PICKUP: transfer shift from requester to target ──

      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.requester_shift_date,
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        v_requester_custom_start,
        v_requester_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot approve: pickup shift has already started';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM unnest(COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
        JOIN public.jobs j ON j.id = request_jobs.job_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(array_agg(role.id ORDER BY role.sort_order, role.id), '{}'::BIGINT[]) AS role_ids
          FROM public.organization_roles role
          WHERE role.org_id = j.org_id
            AND role.id = ANY(j.eligible_role_ids)
            AND role.archived_at IS NULL
            AND role.is_schedule_role IS DISTINCT FROM FALSE
        ) eligible_roles ON TRUE
        WHERE j.archived_at IS NULL
          AND NOT (
            CASE
              WHEN array_length(eligible_roles.role_ids, 1) IS NOT NULL
                AND array_length(j.required_certification_ids, 1) IS NOT NULL
                AND COALESCE(j.eligibility_mode, 'and') = 'or'
              THEN
                (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                OR (
                  v_target_employee.certification_id IS NOT NULL
                  AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                )
              ELSE
                (
                  array_length(eligible_roles.role_ids, 1) IS NULL
                  OR (COALESCE(v_target_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
                )
                AND (
                  array_length(j.required_certification_ids, 1) IS NULL
                  OR (
                    v_target_employee.certification_id IS NOT NULL
                    AND v_target_employee.certification_id = ANY(j.required_certification_ids)
                  )
                )
            END
          )
      ) THEN
        RAISE EXCEPTION 'Cannot approve: target employee no longer meets the eligibility requirements for this shift';
      END IF;

      IF v_requester_state.focus_area_id IS NOT NULL
         AND NOT (v_requester_state.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
        RAISE EXCEPTION 'Cannot approve: target employee is no longer assigned to the required focus area';
      END IF;

      -- Re-check at approval: target must not have an overlapping shift on this date
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF v_request.absence_type_id IS NOT NULL
         AND (
           NOT FOUND
           OR public.build_schedule_cell_state_json(
                v_tgt_shift.state_kind,
                COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
                COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
                v_tgt_shift.absence_type_id,
                v_tgt_shift.custom_start_time,
                v_tgt_shift.custom_end_time,
                v_tgt_shift.series_id,
                v_tgt_shift.from_recurring,
                COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
              ) IS DISTINCT FROM v_request.target_state
         ) THEN
        RAISE EXCEPTION 'The target employee''s absence has been modified since the request was created. Please ask the employee to resubmit.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' AND v_tgt_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'The target employee is absent for the rest of this day. Cannot approve.';
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'The target employee has an overlapping shift on this date. Cannot approve.';
      END IF;

      IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          CASE
            WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
              THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
            WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
            ELSE v_tgt_shift.custom_start_time
          END,
          CASE
            WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
              THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
            WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
            ELSE v_tgt_shift.custom_end_time
          END,
          NULL,
          FALSE,
          CASE
            WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
            ELSE NULL
          END,
          v_tgt_shift.version,
          v_admin_user_id,
          COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      ELSE
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.target_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
          NULL,
          v_requester_custom_start,
          v_requester_custom_end,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
          v_admin_user_id,
          COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
        );
      END IF;

      IF v_request.parent_request_id IS NULL THEN
        v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);
      END IF;

      IF v_request.parent_request_id IS NOT NULL THEN
        -- A call-off's own open pickup: the requester's cell already shows
        -- the call-off, so it stays as it is.
        NULL;
      ELSIF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'absence',
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          v_request.absence_type_id,
          NULL,
          NULL,
          NULL,
          FALSE,
          v_requester_state.focus_area_id,
          v_req_shift.version,
          v_admin_user_id
        );

        DELETE FROM public.schedule_cell_snapshots
        WHERE cell_id = v_req_shift.cell_id
          AND snapshot_kind = 'draft';
      ELSIF v_requester_segment_count <= 1 THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          CASE WHEN v_req_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          v_req_shift.absence_type_id,
          NULL,
          NULL,
          NULL,
          FALSE,
          NULL,
          v_req_shift.version,
          v_admin_user_id,
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
      ELSE
        SELECT
          COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
          COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
        INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
        FROM unnest(
          COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
          COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
        ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
        WHERE segment.ordinality <> v_requester_match_ordinal;

        v_remaining_custom_start := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );
        v_remaining_custom_end := public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        );

        PERFORM public.write_schedule_cell_snapshot_internal(
          v_request.org_id,
          v_request.requester_emp_id,
          v_request.requester_shift_date,
          'published',
          'worked',
          COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
          COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
          v_req_shift.absence_type_id,
          v_remaining_custom_start,
          v_remaining_custom_end,
          NULL,
          FALSE,
          CASE
            WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
            ELSE NULL
          END,
          v_req_shift.version,
          v_admin_user_id,
          COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
      END IF;
    END IF;

  ELSIF v_request.type = 'swap' THEN
    IF v_request.requester_shift_date < CURRENT_DATE
       OR v_request.target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot approve: swap includes a past shift';
    END IF;

    -- Verify target's shift still exists as snapshotted
    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF NOT FOUND OR v_tgt_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    v_target_match_ordinal := public.find_matching_schedule_segment_ordinal(
      COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
      COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]),
      v_tgt_shift.custom_start_time,
      v_tgt_shift.custom_end_time,
      v_target_state.shift_ids[1],
      v_target_state.job_ids[1],
      COALESCE(v_target_state.is_mentored_flags[1], FALSE),
      v_target_custom_start,
      v_target_custom_end
    );

    IF v_target_match_ordinal IS NULL THEN
      RAISE EXCEPTION 'The target''s shift has been modified since the request was created. Please ask the employees to resubmit.';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.requester_shift_date,
      COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
      v_requester_custom_start,
      v_requester_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester shift has already started';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.target_shift_date,
      COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
      v_target_custom_start,
      v_target_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target shift has already started';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_requester_required_focus_area_ids
    FROM (
      SELECT v_req_shift.focus_area_id AS focus_area_id
      WHERE v_req_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    SELECT COALESCE(array_agg(DISTINCT required.focus_area_id), '{}'::BIGINT[])
    INTO v_target_required_focus_area_ids
    FROM (
      SELECT v_tgt_shift.focus_area_id AS focus_area_id
      WHERE v_tgt_shift.focus_area_id IS NOT NULL
      UNION
      SELECT sc.focus_area_id
      FROM unnest(COALESCE(v_target_state.shift_ids, '{}'::BIGINT[])) AS shift_ids(shift_id)
      JOIN public.shift_categories sc
        ON sc.id = shift_ids.shift_id
       AND sc.org_id = v_request.org_id
      WHERE sc.focus_area_id IS NOT NULL
    ) required;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_target_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: target employee is not eligible for the requester shift focus area';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'Cannot approve: requester is not eligible for the target shift focus area';
    END IF;

    -- Block if shifts have overlapping time slots (full cascade: custom → job override/default → shift).
    -- Applies to both same-day and cross-day swaps.

    -- Same-day: block if requester and target shifts overlap in time (pointless swap)
    IF v_request.requester_shift_date = v_request.target_shift_date THEN
      IF v_req_shift.absence_type_id IS NOT NULL OR v_tgt_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: someone in this swap is absent for the rest of the day';
      END IF;

      IF public.work_assignment_times_overlap(
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]), v_requester_custom_start, v_requester_custom_end,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]), COALESCE(v_target_state.job_ids, '{}'::BIGINT[]), v_target_custom_start, v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: shifts have overlapping time slots';
      END IF;
    ELSE
      -- Cross-day: requester's existing shift on target_date vs incoming target codes
      SELECT *
      INTO v_req_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published'
      );

      IF FOUND AND v_req_shift.state_kind = 'worked' AND v_req_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: requester is absent for the rest of the target''s date';
      END IF;

      IF FOUND
         AND v_req_shift.state_kind = 'worked'
         AND array_length(v_req_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
           v_req_shift.custom_start_time,
           v_req_shift.custom_end_time,
           COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
           v_target_custom_start,
           v_target_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: requester would have overlapping shift times on the target''s date';
      END IF;

      -- Cross-day: target's existing shift on requester_date vs incoming requester codes
      SELECT *
      INTO v_tgt_shift
      FROM public.get_schedule_cell_snapshot_payload(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published'
      );

      IF FOUND AND v_tgt_shift.state_kind = 'worked' AND v_tgt_shift.absence_type_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: target is absent for the rest of the requester''s date';
      END IF;

      IF FOUND
         AND v_tgt_shift.state_kind = 'worked'
         AND array_length(v_tgt_shift.job_ids, 1) IS NOT NULL
         AND public.work_assignment_times_overlap(
           COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
           v_tgt_shift.custom_start_time,
           v_tgt_shift.custom_end_time,
           COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
           COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
           v_requester_custom_start,
           v_requester_custom_end
         ) THEN
        RAISE EXCEPTION 'Cannot approve: target would have overlapping shift times on the requester''s date';
      END IF;
    END IF;

    -- Remove only the specific swapped segments from their original owners.
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);
    IF v_requester_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        CASE WHEN v_req_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_req_shift.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_req_shift.version,
        v_admin_user_id,
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_requester_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_req_shift.absence_type_id,
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_start_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_req_shift.custom_end_time,
          v_requester_match_ordinal,
          v_requester_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_requester_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_req_shift.absence_start_time,
        p_absence_end_time => v_req_shift.absence_end_time
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    v_target_segment_count := COALESCE(array_length(v_tgt_shift.job_ids, 1), 0);
    IF v_target_segment_count <= 1 THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        CASE WHEN v_tgt_shift.absence_type_id IS NOT NULL THEN 'absence' ELSE 'deleted' END,
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        v_tgt_shift.absence_type_id,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_tgt_shift.version,
        v_admin_user_id,
        p_absence_start_time => v_tgt_shift.absence_start_time,
        p_absence_end_time => v_tgt_shift.absence_end_time
      );
    ELSE
      SELECT
        COALESCE(array_agg(segment.shift_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.job_id ORDER BY segment.ordinality), '{}'::BIGINT[]),
        COALESCE(array_agg(segment.is_mentored ORDER BY segment.ordinality), '{}'::BOOLEAN[])
      INTO v_remaining_shift_ids, v_remaining_job_ids, v_remaining_is_mentored_flags
      FROM unnest(
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[])
      ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
      WHERE segment.ordinality <> v_target_match_ordinal;

      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_remaining_shift_ids, '{}'::BIGINT[]),
        COALESCE(v_remaining_job_ids, '{}'::BIGINT[]),
        v_tgt_shift.absence_type_id,
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_start_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        public.schedule_custom_times_except_ordinal(
          v_tgt_shift.custom_end_time,
          v_target_match_ordinal,
          v_target_segment_count
        ),
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_target_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[]),
        p_absence_start_time => v_tgt_shift.absence_start_time,
        p_absence_end_time => v_tgt_shift.absence_end_time
      );
    END IF;

    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF FOUND AND v_tgt_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_tgt_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_tgt_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_tgt_shift.custom_start_time IS NOT NULL AND v_requester_custom_start IS NOT NULL
            THEN v_tgt_shift.custom_start_time || '|' || v_requester_custom_start
          WHEN v_requester_custom_start IS NOT NULL THEN v_requester_custom_start
          ELSE v_tgt_shift.custom_start_time
        END,
        CASE
          WHEN v_tgt_shift.custom_end_time IS NOT NULL AND v_requester_custom_end IS NOT NULL
            THEN v_tgt_shift.custom_end_time || '|' || v_requester_custom_end
          WHEN v_requester_custom_end IS NOT NULL THEN v_requester_custom_end
          ELSE v_tgt_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_tgt_shift.focus_area_id = v_requester_state.focus_area_id THEN v_tgt_shift.focus_area_id
          ELSE NULL
        END,
        v_tgt_shift.version,
        v_admin_user_id,
        COALESCE(v_tgt_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.target_emp_id,
        v_request.requester_shift_date,
        'published',
        'worked',
        COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_requester_custom_start,
        v_requester_custom_end,
        NULL,
        FALSE,
        v_requester_state.focus_area_id,
        CASE WHEN FOUND THEN v_tgt_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_requester_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;

    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF FOUND AND v_req_shift.state_kind = 'worked' THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_req_shift.shift_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_req_shift.job_ids, '{}'::BIGINT[]) || COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        CASE
          WHEN v_req_shift.custom_start_time IS NOT NULL AND v_target_custom_start IS NOT NULL
            THEN v_req_shift.custom_start_time || '|' || v_target_custom_start
          WHEN v_target_custom_start IS NOT NULL THEN v_target_custom_start
          ELSE v_req_shift.custom_start_time
        END,
        CASE
          WHEN v_req_shift.custom_end_time IS NOT NULL AND v_target_custom_end IS NOT NULL
            THEN v_req_shift.custom_end_time || '|' || v_target_custom_end
          WHEN v_target_custom_end IS NOT NULL THEN v_target_custom_end
          ELSE v_req_shift.custom_end_time
        END,
        NULL,
        FALSE,
        CASE
          WHEN v_req_shift.focus_area_id = v_target_state.focus_area_id THEN v_req_shift.focus_area_id
          ELSE NULL
        END,
        v_req_shift.version,
        v_admin_user_id,
        COALESCE(v_req_shift.is_mentored_flags, '{}'::BOOLEAN[]) || COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.target_shift_date,
        'published',
        'worked',
        COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        NULL,
        v_target_custom_start,
        v_target_custom_end,
        NULL,
        FALSE,
        v_target_state.focus_area_id,
        CASE WHEN FOUND THEN v_req_shift.version ELSE 0 END,
        v_admin_user_id,
        COALESCE(v_target_state.is_mentored_flags, '{}'::BOOLEAN[])
      );
    END IF;
  END IF;

  -- Mark approved
  UPDATE public.shift_requests
  SET status = 'approved', admin_user_id = v_admin_user_id,
      admin_note = p_note, resolved_at = now(), updated_at = now()
  WHERE id = p_request_id;

  IF v_request.type = 'pickup' AND v_request.target_emp_id IS NULL THEN
    UPDATE public.shift_requests sr
    SET status = 'cancelled',
        admin_note = 'Auto-cancelled: open shift was taken by another approved volunteer',
        resolved_at = now(),
        updated_at = now()
    WHERE sr.id != p_request_id
      AND sr.org_id = v_request.org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = v_request.requester_shift_date
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL unnest(
          COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(v_requester_state.job_ids, '{}'::BIGINT[])
        ) AS approved_segment(shift_id, job_id) ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND other_segment.job_id = approved_segment.job_id
          AND other_segment.shift_id IS NOT DISTINCT FROM approved_segment.shift_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.resolve_schedule_state_storage(sr.org_id, sr.requester_state) other_state
        JOIN LATERAL unnest(
          COALESCE(other_state.shift_ids, '{}'::BIGINT[]),
          COALESCE(other_state.job_ids, '{}'::BIGINT[])
        ) AS other_segment(shift_id, job_id) ON TRUE
        JOIN LATERAL (
          SELECT requirement.min_staff
          FROM public.coverage_requirements requirement
          WHERE requirement.org_id = sr.org_id
            AND requirement.focus_area_id = other_state.focus_area_id
            AND requirement.job_id = other_segment.job_id
            AND (requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id OR requirement.preferred_shift_id IS NULL)
            AND (requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER OR requirement.day_of_week IS NULL)
            AND requirement.min_staff > 0
          ORDER BY
            CASE WHEN requirement.preferred_shift_id IS NOT DISTINCT FROM other_segment.shift_id THEN 0 ELSE 1 END,
            CASE WHEN requirement.day_of_week = EXTRACT(DOW FROM sr.requester_shift_date)::INTEGER THEN 0 ELSE 1 END
          LIMIT 1
        ) cr ON TRUE
        WHERE other_state.focus_area_id IS NOT DISTINCT FROM v_requester_state.focus_area_id
          AND (
            SELECT COALESCE(SUM(
              CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
            ), 0)
            FROM public.employees e
            JOIN LATERAL public.get_schedule_cell_snapshot_payload(
              sr.org_id,
              e.id,
              sr.requester_shift_date,
              'published'
            ) snapshot ON TRUE
            JOIN LATERAL unnest(
              COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
              COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
            ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
            WHERE e.org_id = sr.org_id
              AND e.archived_at IS NULL
              AND e.status = 'active'
              AND other_state.focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
              AND snapshot.focus_area_id IS NOT DISTINCT FROM other_state.focus_area_id
              AND snapshot.state_kind = 'worked'
              AND scheduled_segment.job_id = other_segment.job_id
              AND scheduled_segment.shift_id IS NOT DISTINCT FROM other_segment.shift_id
          ) >= cr.min_staff
      );
  END IF;

  -- Cascade-cancel all other active requests involving the modified shifts
  UPDATE public.shift_requests
  SET status = 'cancelled',
      admin_note = 'Auto-cancelled: shift was reassigned by another approved request',
      resolved_at = now(),
      updated_at = now()
  WHERE id != p_request_id
    AND org_id = v_request.org_id
    AND status IN ('open', 'pending_approval')
    AND (
      (requester_emp_id = v_request.requester_emp_id AND requester_shift_date = v_request.requester_shift_date)
      OR (target_emp_id = v_request.requester_emp_id AND target_shift_date = v_request.requester_shift_date)
      OR (v_request.type = 'swap' AND requester_emp_id = v_request.target_emp_id AND requester_shift_date = v_request.target_shift_date)
      OR (v_request.type = 'swap' AND target_emp_id = v_request.target_emp_id AND target_shift_date = v_request.target_shift_date)
    );
END;
$$;
