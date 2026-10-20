-- 082: A worked cell can carry an off day for the rest of the day.
--
-- Item 45 lets one schedule cell hold up to two worked shifts plus an off day
-- (an absence type) for the rest of the day, such as D/Bereavement or
-- D/E/Sick. The cell stays `worked`, so every reader that branches on the kind
-- keeps showing the worked shifts; the off day rides in the snapshot's
-- existing `absence_type_id`. A whole-day off day is still an `absence` cell
-- with no segments or times.
--
-- Until now a worked snapshot's absence type was refused or set to NULL on the
-- way in. This relaxes the snapshot check and keeps the absence type in the
-- five functions that dropped it, schedule import among them. Publishing
-- needs no change: it already compares and copies the stored absence type. Each body is copied from its latest
-- definition (002) with only the absence handling changed. The off day carries
-- no times, so custom times stay one entry per worked segment.

ALTER TABLE public.schedule_cell_snapshots
  DROP CONSTRAINT schedule_cell_snapshots_valid_state;

ALTER TABLE public.schedule_cell_snapshots ADD CONSTRAINT schedule_cell_snapshots_valid_state
  CHECK (
    state_kind = 'worked'
    OR (
      state_kind = 'absence'
      AND absence_type_id IS NOT NULL
      AND custom_start_time IS NULL
      AND custom_end_time IS NULL
    )
    OR (
      state_kind = 'deleted'
      AND absence_type_id IS NULL
      AND custom_start_time IS NULL
      AND custom_end_time IS NULL
    )
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
  p_focus_area_id BIGINT DEFAULT NULL
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
    'seriesId', p_series_id,
    'fromRecurring', COALESCE(p_from_recurring, FALSE)
  )
  FROM ordered_segments;
$$;

CREATE OR REPLACE FUNCTION public.resolve_schedule_state_storage(
  p_org_id UUID,
  p_state JSONB
) RETURNS TABLE (
  state_kind TEXT,
  shift_ids BIGINT[],
  job_ids BIGINT[],
  is_mentored_flags BOOLEAN[],
  absence_type_id BIGINT,
  focus_area_id BIGINT
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_state_kind TEXT;
  v_absence_type_id BIGINT;
  v_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_job_ids BIGINT[] := '{}'::BIGINT[];
  v_is_mentored_flags BOOLEAN[] := '{}'::BOOLEAN[];
  v_focus_area_id BIGINT;
BEGIN
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'Schedule state must be a JSON object';
  END IF;

  v_state_kind := COALESCE(p_state->>'kind', '');
  IF v_state_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Schedule state must be either worked or absence';
  END IF;

  v_absence_type_id := NULLIF(p_state->>'absenceTypeId', '')::BIGINT;
  v_focus_area_id := NULLIF(p_state->>'focusAreaId', '')::BIGINT;

  IF v_state_kind = 'worked' THEN
    SELECT
      COALESCE(
        array_agg(NULLIF(segment->>'shiftId', 'null')::BIGINT ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BIGINT[]
      ),
      COALESCE(
        array_agg((segment->>'jobId')::BIGINT ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BIGINT[]
      ),
      COALESCE(
        array_agg(COALESCE((segment->>'isMentored')::BOOLEAN, false) ORDER BY COALESCE((segment->>'position')::INTEGER, ordinality - 1)),
        '{}'::BOOLEAN[]
      )
    INTO v_shift_ids, v_job_ids, v_is_mentored_flags
    FROM jsonb_array_elements(COALESCE(p_state->'segments', '[]'::JSONB)) WITH ORDINALITY AS segments(segment, ordinality);

    IF array_length(v_job_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Worked schedule state must include at least one segment';
    END IF;

    IF array_position(v_job_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Worked schedule state cannot include a segment without jobId';
    END IF;

    IF v_absence_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.absence_types at
      WHERE at.id = v_absence_type_id
        AND at.org_id = p_org_id
        AND at.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found in this organization';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_job_ids) AS job_id
      LEFT JOIN public.jobs j
        ON j.id = job_id
       AND j.org_id = p_org_id
       AND j.archived_at IS NULL
      WHERE j.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more schedule state jobs were not found in this organization';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(v_shift_ids) AS shift_id
      LEFT JOIN public.shift_categories sc
        ON sc.id = shift_id
       AND sc.org_id = p_org_id
       AND sc.archived_at IS NULL
      WHERE shift_id IS NOT NULL
        AND sc.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more schedule state shifts were not found in this organization';
    END IF;

    IF v_focus_area_id IS NULL THEN
      SELECT sc.focus_area_id
      INTO v_focus_area_id
      FROM unnest(v_shift_ids) WITH ORDINALITY AS segment(shift_id, ordinality)
      JOIN public.shift_categories sc
        ON sc.id = segment.shift_id
       AND sc.org_id = p_org_id
      WHERE segment.shift_id IS NOT NULL
      ORDER BY segment.ordinality
      LIMIT 1;
    END IF;
  ELSE
    IF v_absence_type_id IS NULL THEN
      RAISE EXCEPTION 'Absence schedule state must include absenceTypeId';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.absence_types at
      WHERE at.id = v_absence_type_id
        AND at.org_id = p_org_id
        AND at.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Absence type not found in this organization';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_state_kind,
    v_shift_ids,
    v_job_ids,
    v_is_mentored_flags,
    v_absence_type_id,
    v_focus_area_id;
END;
$$;

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
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
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
    END
  );

  RETURN v_next_version;
END;
$$;

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
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
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
    END
  );

  RETURN v_next_version;
END;
$$;

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
        END AS custom_end_time
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
      CASE WHEN r.state_kind = 'worked' THEN r.is_mentored_flags ELSE '{}'::BOOLEAN[] END
    );

    outcome := 'imported';
    reason := NULL;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;
