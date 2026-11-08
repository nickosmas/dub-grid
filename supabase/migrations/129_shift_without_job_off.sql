-- 129: Turning off shifts without a job stops new ones and keeps the rest.
--
-- Settings > Jobs > Allow shifts without a job (organizations.
-- default_shift_enabled) used to hide the option in the pickers only. Auto-build,
-- recurring fills, copy, paste, drag, repeating shifts and Import Previous
-- Schedule could all still write one, as could a direct call.
--
-- With it off, a draft write may keep a shift without a job (the
-- default_shift_job system job) that its cell already holds, in the draft or the
-- published schedule, and may not add one. So a shift already scheduled stays,
-- counts toward coverage and can be edited or put back, and requests on it
-- still settle (they write the published schedule). Import skips such a day
-- with the reason shift_without_job_off.
--
-- Volunteering for an open shift is refused the same way, since its approval
-- writes the published schedule, past the draft check. A request made before
-- the setting was turned off still settles.
--
-- shift_without_job_usage counts what stays, for the Settings > Jobs dialog.
--
-- Cell saves, paste and drag go through write_schedule_cell_snapshot (111);
-- repeating shifts through write_schedule_cell_snapshot_internal (092); both
-- get the check. Bodies are copied from their latest definitions (092, 111, 118,
-- 126) with only the check added. CREATE OR REPLACE keeps their grants.
SET lock_timeout = '5s';

-- True when the segments add a shift without a job that this person's cell on
-- this date doesn't already hold, and the organization has them off.
CREATE OR REPLACE FUNCTION public.adds_shift_without_job(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[]
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_shift_ids, '{}'::BIGINT[]), COALESCE(p_job_ids, '{}'::BIGINT[]))
      AS segment(shift_id, job_id)
    JOIN public.jobs j
      ON j.id = segment.job_id
     AND j.org_id = p_org_id
     AND j.system_key = 'default_shift_job'
    JOIN public.organizations o
      ON o.id = p_org_id
     AND o.default_shift_enabled = FALSE
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.schedule_cells c
      JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      JOIN public.schedule_cell_segments held ON held.snapshot_id = s.id
      WHERE c.org_id = p_org_id
        AND c.emp_id = p_emp_id
        AND c.date = p_date
        AND held.job_id = segment.job_id
        AND held.shift_id IS NOT DISTINCT FROM segment.shift_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.adds_shift_without_job(UUID, UUID, DATE, BIGINT[], BIGINT[])
  FROM PUBLIC, anon, authenticated;

-- 111's draft writer, which saves, paste and drag use.
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
BEGIN
  IF p_snapshot_kind IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published cells are written by publishing, approvals and corrections';
  END IF;
  IF p_date < public.org_today(p_org_id) THEN
    RAISE EXCEPTION 'Past days are corrected, not drafted';
  END IF;
  IF p_state_kind = 'worked'
     AND public.adds_shift_without_job(p_org_id, p_emp_id, p_date, p_shift_ids, p_job_ids) THEN
    RAISE EXCEPTION 'Shifts without a job are off for this organization';
  END IF;
  RETURN public.write_schedule_cell_snapshot_any_kind(
    p_org_id, p_emp_id, p_date, p_snapshot_kind, p_state_kind, p_shift_ids, p_job_ids,
    p_absence_type_id, p_custom_start_time, p_custom_end_time, p_series_id, p_from_recurring,
    p_focus_area_id, p_expected_version, p_is_mentored_flags, p_absence_start_time,
    p_absence_end_time, p_allow_untimed_absence
  );
END;
$$;

-- 092's internal writer, which repeating shifts use.
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
  v_found BOOLEAN;
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
  v_found := FOUND;

  -- A draft keeps a shift without a job that this cell already holds, and
  -- takes no new one while the organization has them off. Published writes
  -- (approvals, corrections) settle work that already exists.
  IF p_snapshot_kind = 'draft'
     AND p_state_kind = 'worked'
     AND public.adds_shift_without_job(p_org_id, p_emp_id, p_date, p_shift_ids, p_job_ids) THEN
    RAISE EXCEPTION 'Shifts without a job are off for this organization';
  END IF;

  IF v_found THEN
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

-- 118's import, skipping a day that would add one.
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
  v_today           DATE := public.org_today(p_org_id);
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
  -- and not deleted, else the published snapshot, matching the client's
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
    -- Days before today are corrected, not drafted (111), so they're skipped.
    WHERE p_target_start + (ws.source_date - p_source_start) >= v_today
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
        AND public.employee_schedulable_on(e.id, r.target_date)
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

    -- Shifts without a job are off: a copy would add new ones.
    IF r.state_kind = 'worked'
       AND public.adds_shift_without_job(p_org_id, r.emp_id, r.target_date, r.shift_ids, r.job_ids) THEN
      outcome := 'skipped';
      reason := 'shift_without_job_off';
      RETURN NEXT;
      CONTINUE;
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

-- 126's volunteer wrapper, refusing an open shift without a job.
CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift(p_org_id uuid, p_emp_id uuid, p_shift_date date, p_shift_ids bigint[], p_job_ids bigint[], p_focus_area_id bigint, p_custom_start_time text DEFAULT NULL::text, p_custom_end_time text DEFAULT NULL::text, p_is_mentored_flags boolean[] DEFAULT '{}'::boolean[])
 RETURNS uuid
 LANGUAGE PLPGSQL
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  PERFORM public.refuse_caller_outside_org(p_org_id);
  IF public.adds_shift_without_job(p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids) THEN
    RAISE EXCEPTION 'Shifts without a job are off for this organization';
  END IF;
  RETURN public.volunteer_for_open_shift_unguarded(
    p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids, p_focus_area_id,
    p_custom_start_time, p_custom_end_time, p_is_mentored_flags
  );
END;
$$;

-- What a change to the setting touches, from the organization's today: shifts
-- without a job on the schedule (the draft where there is one), recurring days
-- that use one, and coverage requirements for one. The settings route calls it
-- with the service role.
CREATE OR REPLACE FUNCTION public.shift_without_job_usage(p_org_id UUID)
RETURNS TABLE (upcoming_shifts INTEGER, recurring_days INTEGER, coverage_requirements INTEGER)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH job AS (
    SELECT id FROM public.jobs WHERE org_id = p_org_id AND system_key = 'default_shift_job'
  ),
  today AS (
    SELECT public.org_today(p_org_id) AS day
  )
  SELECT
    (
      SELECT count(*)::INTEGER
      FROM public.schedule_cells c
      WHERE c.org_id = p_org_id
        AND c.date >= (SELECT day FROM today)
        AND EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          JOIN public.schedule_cell_segments segment ON segment.snapshot_id = s.id
          WHERE s.cell_id = c.id
            AND segment.job_id IN (SELECT id FROM job)
            AND (
              s.snapshot_kind = 'draft'
              OR NOT EXISTS (
                SELECT 1 FROM public.schedule_cell_snapshots draft
                WHERE draft.cell_id = c.id AND draft.snapshot_kind = 'draft'
              )
            )
        )
    ),
    (
      SELECT count(*)::INTEGER
      FROM public.recurring_shifts r
      WHERE r.org_id = p_org_id
        AND r.archived_at IS NULL
        AND (r.effective_until IS NULL OR r.effective_until >= (SELECT day FROM today))
        AND r.state->>'kind' = 'worked'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(r.state->'segments', '[]'::JSONB)) AS segment
          WHERE (segment->>'jobId')::BIGINT IN (SELECT id FROM job)
        )
    ),
    (
      SELECT count(DISTINCT (cr.focus_area_id, cr.preferred_shift_id))::INTEGER
      FROM public.coverage_requirements cr
      WHERE cr.org_id = p_org_id
        AND cr.job_id IN (SELECT id FROM job)
        AND cr.min_staff > 0
    );
$$;

REVOKE ALL ON FUNCTION public.shift_without_job_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_without_job_usage(UUID) TO service_role;
