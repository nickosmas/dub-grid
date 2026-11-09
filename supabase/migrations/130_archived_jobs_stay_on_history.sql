-- 130: Shifts that use an archived job keep working as history.
--
-- Settings promises an archived job "stays on past schedules but can't be
-- picked for anything new". 117 read existing state leniently in publishing and
-- approval; this does the same for the rest, and stops an archived job
-- spreading to cells that don't hold it.
--
-- New work is refused: a draft write (saves, paste, drag through move_shift,
-- Fill from Recurring) may keep an archived job its cell already holds, in the
-- draft or the published schedule, and may not add one, the way 129 treats a
-- shift without a job while they're off. Volunteering for one is refused too,
-- Import Previous Schedule skips a day that would add one (reason
-- archived_job), and editing a repeating series may keep one only if the
-- series has it.
--
-- Existing work settles: claiming a pickup and answering a swap read the
-- request's shifts with resolve_existing_schedule_state_storage (117), as
-- approval already does, and volunteering reads other people's pending
-- requests that way, so one request on an archived job no longer refuses every
-- volunteer that day. Editing a series reads its state that way too.
--
-- Bodies are copied from their latest definitions (129, 099, 002 as renamed in
-- 075, 118) with only those changes. CREATE OR REPLACE keeps their grants.
SET lock_timeout = '5s';

-- True when the segments add an archived job that this person's cell on this
-- date doesn't already hold.
CREATE OR REPLACE FUNCTION public.adds_archived_job(
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
     AND j.archived_at IS NOT NULL
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

REVOKE ALL ON FUNCTION public.adds_archived_job(UUID, UUID, DATE, BIGINT[], BIGINT[])
  FROM PUBLIC, anon, authenticated;


-- 129's draft writer, which saves, paste, drag and Fill from Recurring use.
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
  IF p_state_kind = 'worked'
     AND public.adds_archived_job(p_org_id, p_emp_id, p_date, p_shift_ids, p_job_ids) THEN
    RAISE EXCEPTION 'An archived job stays on the shifts that already have it and can''t be added to another';
  END IF;
  RETURN public.write_schedule_cell_snapshot_any_kind(
    p_org_id, p_emp_id, p_date, p_snapshot_kind, p_state_kind, p_shift_ids, p_job_ids,
    p_absence_type_id, p_custom_start_time, p_custom_end_time, p_series_id, p_from_recurring,
    p_focus_area_id, p_expected_version, p_is_mentored_flags, p_absence_start_time,
    p_absence_end_time, p_allow_untimed_absence
  );
END;
$$;

-- 129's volunteer wrapper.
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
  IF public.adds_archived_job(p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids) THEN
    RAISE EXCEPTION 'An archived job stays on the shifts that already have it and can''t be added to another';
  END IF;
  RETURN public.volunteer_for_open_shift_unguarded(
    p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids, p_focus_area_id,
    p_custom_start_time, p_custom_end_time, p_is_mentored_flags
  );
END;
$$;

-- 099's volunteering, reading other people's pending requests as they stand.
CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift_unguarded(
  p_org_id              UUID,
  p_emp_id              UUID,
  p_shift_date          DATE,
  p_shift_ids           BIGINT[],
  p_job_ids             BIGINT[],
  p_focus_area_id       BIGINT,
  p_custom_start_time   TEXT DEFAULT NULL,
  p_custom_end_time     TEXT DEFAULT NULL,
  p_is_mentored_flags   BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request_id UUID;
  v_employee RECORD;
  v_existing_shift RECORD;
  v_segment RECORD;
  v_required_staff INTEGER;
  v_actual_staff NUMERIC;
  v_pending_volunteer_count INTEGER;
  v_day_of_week INTEGER;
  v_mentored_credit NUMERIC := 1;
BEGIN
  IF COALESCE(array_length(p_shift_ids, 1), 0) != COALESCE(array_length(p_job_ids, 1), 0) THEN
    RAISE EXCEPTION 'Shift ID and job ID segment lengths must match';
  END IF;

  IF array_length(p_is_mentored_flags, 1) IS NOT NULL
     AND array_length(p_is_mentored_flags, 1) != array_length(p_job_ids, 1) THEN
    RAISE EXCEPTION 'Mentored flag and job ID segment lengths must match';
  END IF;

  -- Validate worked assignment is non-empty
  IF array_length(p_job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one worked segment is required';
  END IF;

  -- Validate employee is active in this org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_employee
  FROM public.employees
  WHERE id = p_emp_id AND org_id = p_org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found or archived';
  END IF;

  IF NOT public.employee_schedulable_on(v_employee.id, p_shift_date) THEN
    RAISE EXCEPTION 'Employee is not active';
  END IF;

  -- Validate caller is the employee, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_employee.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only volunteer for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
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
            (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_employee.certification_id IS NOT NULL
              AND v_employee.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_employee.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_employee.certification_id IS NOT NULL
                AND v_employee.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF p_focus_area_id IS NOT NULL
     AND NOT (p_focus_area_id = ANY(COALESCE(v_employee.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  IF public.has_work_assignment_started(
    p_org_id,
    p_shift_date,
    COALESCE(p_shift_ids, '{}'::BIGINT[]),
    COALESCE(p_job_ids, '{}'::BIGINT[]),
    p_custom_start_time,
    p_custom_end_time
  ) THEN
    RAISE EXCEPTION 'Cannot volunteer for a shift that has already started';
  END IF;

  SELECT COALESCE(
    NULLIF(o.coverage_rule_config->>'mentoredCoverageCreditPercent', '')::NUMERIC / 100,
    1
  )
  INTO v_mentored_credit
  FROM public.organizations o
  WHERE o.id = p_org_id;

  v_day_of_week := EXTRACT(DOW FROM p_shift_date)::INTEGER;

  FOR v_segment IN
    SELECT segment.shift_id, segment.job_id, COALESCE(segment.is_mentored, FALSE) AS is_mentored
    FROM unnest(
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS segment(shift_id, job_id, is_mentored, ordinality)
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(
      'open_shift_volunteer_' ||
      p_org_id::TEXT || '_' ||
      p_shift_date::TEXT || '_' ||
      COALESCE(p_focus_area_id::TEXT, 'none') || '_' ||
      COALESCE(v_segment.shift_id::TEXT, 'none') || '_' ||
      v_segment.job_id::TEXT
    ));

    SELECT cr.min_staff
    INTO v_required_staff
    FROM public.coverage_requirements cr
    WHERE cr.org_id = p_org_id
      AND cr.focus_area_id = p_focus_area_id
      AND cr.job_id = v_segment.job_id
      AND (cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id OR cr.preferred_shift_id IS NULL)
      AND (cr.day_of_week = v_day_of_week OR cr.day_of_week IS NULL)
      AND cr.min_staff > 0
    ORDER BY
      CASE WHEN cr.preferred_shift_id IS NOT DISTINCT FROM v_segment.shift_id THEN 0 ELSE 1 END,
      CASE WHEN cr.day_of_week = v_day_of_week THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_required_staff IS NULL THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.shift_requests sr
      JOIN LATERAL public.resolve_existing_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
      JOIN LATERAL unnest(
        COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(request_state.job_ids, '{}'::BIGINT[])
      ) AS request_segment(shift_id, job_id) ON TRUE
      WHERE sr.org_id = p_org_id
        AND sr.type = 'pickup'
        AND sr.status = 'pending_approval'
        AND sr.target_emp_id IS NULL
        AND sr.parent_request_id IS NULL
        AND sr.requester_emp_id = p_emp_id
        AND sr.requester_shift_date = p_shift_date
        AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
        AND request_segment.job_id = v_segment.job_id
        AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id
    ) THEN
      RAISE EXCEPTION 'You already volunteered for this open shift';
    END IF;

    SELECT COUNT(DISTINCT sr.id)
    INTO v_pending_volunteer_count
    FROM public.shift_requests sr
    JOIN LATERAL public.resolve_existing_schedule_state_storage(sr.org_id, sr.requester_state) request_state ON TRUE
    JOIN LATERAL unnest(
      COALESCE(request_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(request_state.job_ids, '{}'::BIGINT[])
    ) AS request_segment(shift_id, job_id) ON TRUE
    WHERE sr.org_id = p_org_id
      AND sr.type = 'pickup'
      AND sr.status = 'pending_approval'
      AND sr.target_emp_id IS NULL
      AND sr.parent_request_id IS NULL
      AND sr.requester_shift_date = p_shift_date
      AND request_state.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND request_segment.job_id = v_segment.job_id
      AND request_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    SELECT COALESCE(SUM(
      CASE WHEN COALESCE(scheduled_segment.is_mentored, FALSE) THEN v_mentored_credit ELSE 1 END
    ), 0)
    INTO v_actual_staff
    FROM public.employees e
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      e.id,
      p_shift_date,
      'published'
    ) snapshot ON TRUE
    JOIN LATERAL unnest(
      COALESCE(snapshot.shift_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.job_ids, '{}'::BIGINT[]),
      COALESCE(snapshot.is_mentored_flags, '{}'::BOOLEAN[])
    ) WITH ORDINALITY AS scheduled_segment(shift_id, job_id, is_mentored, ordinality) ON TRUE
    WHERE e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND public.employee_schedulable_on(e.id, p_shift_date)
      AND p_focus_area_id = ANY(COALESCE(e.focus_area_ids, '{}'::BIGINT[]))
      AND snapshot.focus_area_id IS NOT DISTINCT FROM p_focus_area_id
      AND snapshot.state_kind = 'worked'
      AND scheduled_segment.job_id = v_segment.job_id
      AND scheduled_segment.shift_id IS NOT DISTINCT FROM v_segment.shift_id;

    IF v_actual_staff + COALESCE(v_pending_volunteer_count, 0) >= v_required_staff THEN
      RAISE EXCEPTION 'That open shift is no longer available';
    END IF;
  END LOOP;

  -- Check time conflicts: volunteer must not have an overlapping shift on this date
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id,
    p_emp_id,
    p_shift_date,
    'published'
  );

  v_absence_conflict := public.rest_of_day_absence_conflict(
    p_org_id,
    p_emp_id,
    p_shift_date,
    p_shift_ids,
    p_job_ids,
    p_custom_start_time,
    p_custom_end_time
  );
  IF v_absence_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'You are absent %', v_absence_conflict;
  END IF;

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(p_shift_ids, '{}'::BIGINT[]),
       COALESCE(p_job_ids, '{}'::BIGINT[]),
       p_custom_start_time,
       p_custom_end_time
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Check no active request already exists for this employee on this date.
  -- Exclude calloff-spawned pickups where the employee is the former shift owner
  -- (they called off and should still be able to volunteer for a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = p_org_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_emp_id AND sr.requester_shift_date = p_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_emp_id AND sr.target_shift_date = p_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  INSERT INTO public.shift_requests (
    org_id, type, status,
    requester_emp_id, requester_shift_date, requester_state
  ) VALUES (
    p_org_id, 'pickup', 'pending_approval',
    p_emp_id, p_shift_date,
    public.build_schedule_cell_state_json(
      'worked',
      COALESCE(p_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_job_ids, '{}'::BIGINT[]),
      NULL,
      p_custom_start_time,
      p_custom_end_time,
      NULL,
      FALSE,
      COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[]),
      p_focus_area_id
    )
  ) RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- 099's claim, reading the pickup's shift as it stands.
CREATE OR REPLACE FUNCTION public.claim_shift_request_unguarded(
  p_request_id   UUID,
  p_claimer_emp_id UUID
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_absence_conflict TEXT;
  v_request RECORD;
  v_claimer RECORD;
  v_existing_shift RECORD;
  v_request_state RECORD;
  v_request_custom_start TEXT;
  v_request_custom_end TEXT;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.type != 'pickup' THEN
    RAISE EXCEPTION 'Only pickup requests can be claimed';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  IF v_request.requester_emp_id = p_claimer_emp_id THEN
    RAISE EXCEPTION 'Cannot claim your own request';
  END IF;

  SELECT * INTO v_request_state
  FROM public.resolve_existing_schedule_state_storage(v_request.org_id, v_request.requester_state);

  IF v_request_state.state_kind IS DISTINCT FROM 'worked' THEN
    RAISE EXCEPTION 'Only worked shift requests can be claimed';
  END IF;

  v_request_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
  v_request_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

  IF public.has_work_assignment_started(
    v_request.org_id,
    v_request.requester_shift_date,
    COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
    v_request_custom_start,
    v_request_custom_end
  ) THEN
    RAISE EXCEPTION 'Cannot claim a pickup request for a shift that has already started';
  END IF;

  -- Validate claimer is active employee in same org
  SELECT id, user_id, certification_id, role_ids, status, focus_area_ids INTO v_claimer
  FROM public.employees
  WHERE id = p_claimer_emp_id AND org_id = v_request.org_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claimer employee not found or archived';
  END IF;

  IF NOT public.employee_schedulable_on(v_claimer.id, v_request.requester_shift_date) THEN
    RAISE EXCEPTION 'Claimer employee is not active';
  END IF;

  -- Validate caller is the claimer, or admin+ IN THIS org (or their own
  -- sandbox) — see create_shift_request for why the org match is required.
  IF v_claimer.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = v_request.org_id OR public.is_own_sandbox_org(v_request.org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized: you can only claim requests for yourself';
  END IF;

  -- Check job eligibility requirements. Items inside each gate are alternatives;
  -- eligibility_mode only controls how role and certification gates combine.
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(v_request_state.job_ids, '{}'::BIGINT[])) AS request_jobs(job_id)
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
            (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            OR (
              v_claimer.certification_id IS NOT NULL
              AND v_claimer.certification_id = ANY(j.required_certification_ids)
            )
          ELSE
            (
              array_length(eligible_roles.role_ids, 1) IS NULL
              OR (COALESCE(v_claimer.role_ids, '{}'::BIGINT[]) && eligible_roles.role_ids)
            )
            AND (
              array_length(j.required_certification_ids, 1) IS NULL
              OR (
                v_claimer.certification_id IS NOT NULL
                AND v_claimer.certification_id = ANY(j.required_certification_ids)
              )
            )
        END
      )
  ) THEN
    RAISE EXCEPTION 'You do not meet the eligibility requirements for this shift';
  END IF;

  IF v_request_state.focus_area_id IS NOT NULL
     AND NOT (v_request_state.focus_area_id = ANY(COALESCE(v_claimer.focus_area_ids, '{}'::BIGINT[]))) THEN
    RAISE EXCEPTION 'You are not assigned to the focus area required for this shift';
  END IF;

  -- Block if claimer has a shift on the same date with overlapping time
  SELECT *
  INTO v_existing_shift
  FROM public.get_schedule_cell_snapshot_payload(
    v_request.org_id,
    p_claimer_emp_id,
    v_request.requester_shift_date,
    'published'
  );

  v_absence_conflict := public.rest_of_day_absence_conflict(
    v_request.org_id,
    p_claimer_emp_id,
    v_request.requester_shift_date,
    v_request_state.shift_ids,
    v_request_state.job_ids,
    v_request_custom_start,
    v_request_custom_end
  );
  IF v_absence_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'You are absent %', v_absence_conflict;
  END IF;

  IF FOUND
     AND v_existing_shift.state_kind = 'worked'
     AND array_length(v_existing_shift.job_ids, 1) IS NOT NULL
     AND public.work_assignment_times_overlap(
       COALESCE(v_existing_shift.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_existing_shift.job_ids, '{}'::BIGINT[]),
       v_existing_shift.custom_start_time,
       v_existing_shift.custom_end_time,
       COALESCE(v_request_state.shift_ids, '{}'::BIGINT[]),
       COALESCE(v_request_state.job_ids, '{}'::BIGINT[]),
       v_request_custom_start,
       v_request_custom_end
     ) THEN
    RAISE EXCEPTION 'You have a shift with overlapping times on this date';
  END IF;

  -- Block if claimer is already involved in another active request on this date.
  -- Exclude calloff-spawned pickups where the claimer is the former shift owner
  -- (they called off and should still be able to pick up a different shift).
  IF EXISTS (
    SELECT 1 FROM public.shift_requests sr
    WHERE sr.org_id = v_request.org_id
      AND sr.id != p_request_id
      AND sr.status IN ('open', 'pending_approval')
      AND (
        (sr.requester_emp_id = p_claimer_emp_id AND sr.requester_shift_date = v_request.requester_shift_date
         AND NOT (sr.type = 'pickup' AND sr.parent_request_id IS NOT NULL))
        OR (sr.target_emp_id = p_claimer_emp_id AND sr.target_shift_date = v_request.requester_shift_date)
      )
  ) THEN
    RAISE EXCEPTION 'You are involved in another active shift request on this date';
  END IF;

  -- Claim the request
  UPDATE public.shift_requests
  SET target_emp_id = p_claimer_emp_id,
      target_shift_date = v_request.requester_shift_date,
      status = 'pending_approval',
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

-- 002's response (075 renamed it), reading both shifts as they stand.
CREATE OR REPLACE FUNCTION public.respond_to_shift_request_unguarded(
  p_request_id UUID,
  p_emp_id     UUID,
  p_accept     BOOLEAN
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_emp RECORD;
  v_req_shift RECORD;
  v_tgt_shift RECORD;
  v_current_state JSONB;
  v_requester_state RECORD;
  v_target_state RECORD;
  v_requester_custom_start TEXT;
  v_requester_custom_end TEXT;
  v_target_custom_start TEXT;
  v_target_custom_end TEXT;
  v_requester_match_ordinal INTEGER;
  v_target_match_ordinal INTEGER;
  v_requester_employee RECORD;
  v_requester_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
  v_target_required_focus_area_ids BIGINT[] := '{}'::BIGINT[];
BEGIN
  -- Lock and fetch
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.type != 'swap'
     AND NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only swap or targeted pickup requests can be responded to';
  END IF;

  IF v_request.status != 'open' THEN
    RAISE EXCEPTION 'Request is no longer open (status: %)', v_request.status;
  END IF;

  IF v_request.expires_at < now() THEN
    RAISE EXCEPTION 'Request has expired';
  END IF;

  -- Validate caller is the target employee
  SELECT id, user_id, focus_area_ids INTO v_emp FROM public.employees WHERE id = p_emp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_emp.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_gridmaster() THEN
    RAISE EXCEPTION 'Unauthorized: only the target employee can respond';
  END IF;

  IF v_request.target_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'You are not the target of this request';
  END IF;

  IF p_accept THEN
    IF v_request.requester_shift_date < CURRENT_DATE
       OR v_request.target_shift_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot accept a request for a past shift';
    END IF;

    SELECT * INTO v_requester_state
    FROM public.resolve_existing_schedule_state_storage(v_request.org_id, v_request.requester_state);
    v_requester_custom_start := NULLIF(v_request.requester_state->>'customStartTime', '');
    v_requester_custom_end := NULLIF(v_request.requester_state->>'customEndTime', '');

    IF v_request.target_state IS NOT NULL THEN
      SELECT * INTO v_target_state
      FROM public.resolve_existing_schedule_state_storage(v_request.org_id, v_request.target_state);
      v_target_custom_start := NULLIF(v_request.target_state->>'customStartTime', '');
      v_target_custom_end := NULLIF(v_request.target_state->>'customEndTime', '');
    END IF;

    -- Verify requester's shift still matches snapshot
    SELECT *
    INTO v_req_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.requester_emp_id,
      v_request.requester_shift_date,
      'published'
    );

    IF NOT FOUND OR v_req_shift.state_kind IS DISTINCT FROM 'worked' THEN
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. This request is no longer valid.';
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
      RAISE EXCEPTION 'The requester''s shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    IF public.has_work_assignment_started(
      v_request.org_id,
      v_request.requester_shift_date,
            COALESCE(v_requester_state.shift_ids, '{}'::BIGINT[]),
            COALESCE(v_requester_state.job_ids, '{}'::BIGINT[]),
            v_requester_custom_start,
            v_requester_custom_end
    ) THEN
      RAISE EXCEPTION 'Cannot accept a request for a shift that has already started';
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

    IF EXISTS (
      SELECT 1
      FROM unnest(v_requester_required_focus_area_ids) AS required(focus_area_id)
      WHERE NOT (required.focus_area_id = ANY(COALESCE(v_emp.focus_area_ids, '{}'::BIGINT[])))
    ) THEN
      RAISE EXCEPTION 'You are no longer eligible for the requester shift focus area';
    END IF;

    -- Verify target's shift still matches snapshot
    SELECT *
    INTO v_tgt_shift
    FROM public.get_schedule_cell_snapshot_payload(
      v_request.org_id,
      v_request.target_emp_id,
      v_request.target_shift_date,
      'published'
    );

    IF v_request.type = 'swap' THEN
      IF NOT FOUND OR v_tgt_shift.state_kind IS DISTINCT FROM 'worked' THEN
        RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
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
        RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
      END IF;
    ELSIF NOT FOUND
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
          ) IS DISTINCT FROM v_request.target_state THEN
      RAISE EXCEPTION 'Your shift has been modified since the request was created. This request is no longer valid.';
    END IF;

    IF v_request.type = 'swap' THEN
      IF public.has_work_assignment_started(
        v_request.org_id,
        v_request.target_shift_date,
        COALESCE(v_target_state.shift_ids, '{}'::BIGINT[]),
        COALESCE(v_target_state.job_ids, '{}'::BIGINT[]),
        v_target_custom_start,
        v_target_custom_end
      ) THEN
        RAISE EXCEPTION 'Cannot accept a request for a shift that has already started';
      END IF;

      SELECT id, focus_area_ids
      INTO v_requester_employee
      FROM public.employees
      WHERE id = v_request.requester_emp_id
        AND org_id = v_request.org_id
        AND archived_at IS NULL
        AND status = 'active';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requester is no longer active. This request is no longer valid.';
      END IF;

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
        FROM unnest(v_target_required_focus_area_ids) AS required(focus_area_id)
        WHERE NOT (required.focus_area_id = ANY(COALESCE(v_requester_employee.focus_area_ids, '{}'::BIGINT[])))
      ) THEN
        RAISE EXCEPTION 'Requester is no longer eligible for your shift focus area';
      END IF;
    END IF;

    UPDATE public.shift_requests
    SET status = 'pending_approval', updated_at = now()
    WHERE id = p_request_id;
  ELSE
    UPDATE public.shift_requests
    SET status = 'rejected', resolved_at = now(), updated_at = now()
    WHERE id = p_request_id;
  END IF;
END;
$$;

-- 129's import, skipping a day that would add an archived job.
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

    -- An archived job stays on the cells that hold it: a copy would add it.
    IF r.state_kind = 'worked'
       AND public.adds_archived_job(p_org_id, r.emp_id, r.target_date, r.shift_ids, r.job_ids) THEN
      outcome := 'skipped';
      reason := 'archived_job';
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

-- 118's series edit.
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
  FROM public.resolve_existing_schedule_state_storage(p_org_id, p_state);

  -- An archived job stays on a series that already has it, and joins no other.
  IF EXISTS (
    SELECT 1
    FROM unnest(
      COALESCE(v_state.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_state.job_ids, '{}'::BIGINT[])
    ) AS segment(shift_id, job_id)
    JOIN public.jobs j
      ON j.id = segment.job_id
     AND j.org_id = p_org_id
     AND j.archived_at IS NOT NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.shift_series ss
      CROSS JOIN LATERAL public.resolve_existing_schedule_state_storage(ss.org_id, ss.state) held
      CROSS JOIN LATERAL unnest(
        COALESCE(held.shift_ids, '{}'::BIGINT[]),
        COALESCE(held.job_ids, '{}'::BIGINT[])
      ) AS held_segment(shift_id, job_id)
      WHERE ss.org_id = p_org_id
        AND ss.id = p_series_id
        AND held_segment.job_id = segment.job_id
        AND held_segment.shift_id IS NOT DISTINCT FROM segment.shift_id
    )
  ) THEN
    RAISE EXCEPTION 'An archived job stays on the shifts that already have it and can''t be added to another';
  END IF;

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
      -- Days before today stay as they are.
      AND c.date >= public.org_today(p_org_id)
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
