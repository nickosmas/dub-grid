-- An approver who is party to a shift request no longer waits for a peer:
-- once the request would enter the queue, it is approved on their behalf,
-- attributed to them, with a note that says so. The counterparty's consent
-- (a recipient accepting a swap or targeted pickup) is unchanged.
--
-- resolve_shift_request_unchecked took its approver from auth.uid(), so a
-- regular recipient accepting an approver's swap could never run it as the
-- approver. The body is restated once here with a p_admin_user_id
-- parameter: a text-equivalence test proves it equals the 002 text except
-- for the three hunks named below. This file is now the canonical resolver
-- text; later migrations copy from here, not from 002.
--
--   A. v_admin_user_id is the parameter, not auth.uid().
--   B. The JWT-bound permission block after BEGIN is removed.
--   C. A membership-based check of p_admin_user_id runs after the org check.
--
-- The 028 swap-conflict recheck moves into a private _checked wrapper that
-- both the manual and the automatic path share. The public
-- resolve_shift_request keeps its signature and grant and passes auth.uid().

-- check_admin_permission with the user and organization as parameters,
-- for deciding who the approver is when the caller is not the approver.
CREATE OR REPLACE FUNCTION public.user_can_approve_shift_requests(
  p_user_id UUID,
  p_org_id  UUID
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = p_user_id
        AND profile.platform_role = 'gridmaster'
        AND profile.deactivated_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      JOIN public.profiles AS profile
        ON profile.id = membership.user_id
       AND profile.deactivated_at IS NULL
      WHERE membership.user_id = p_user_id
        AND membership.org_id = p_org_id
        AND membership.archived_at IS NULL
        AND (
          membership.org_role = 'super_admin'
          OR (
            membership.org_role = 'admin'
            AND COALESCE((membership.admin_permissions->>'canApproveShiftRequests')::BOOLEAN, FALSE)
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_approve_shift_requests(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT);

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
        NULL,
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
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
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
  IF NOT (v_request.type = 'pickup' AND v_request.target_emp_id IS NULL) THEN
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

      v_requester_segment_count := COALESCE(array_length(v_req_shift.job_ids, 1), 0);

      IF v_requester_segment_count <= 1 AND v_request.absence_type_id IS NOT NULL THEN
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
          'deleted',
          '{}'::BIGINT[],
          '{}'::BIGINT[],
          NULL,
          NULL,
          NULL,
          NULL,
          FALSE,
          NULL,
          v_req_shift.version,
          v_admin_user_id
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
          NULL,
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
          COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
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
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_req_shift.version,
        v_admin_user_id
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
        NULL,
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
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
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
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        v_tgt_shift.version,
        v_admin_user_id
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
        NULL,
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
        COALESCE(v_remaining_is_mentored_flags, '{}'::BOOLEAN[])
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

REVOKE ALL ON FUNCTION public.resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

-- The 028 conflict recheck, shared by both approval paths.
CREATE OR REPLACE FUNCTION public.resolve_shift_request_checked(
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
  v_reason TEXT;
BEGIN
  IF p_approved THEN
    SELECT org_id, type, requester_emp_id, requester_shift_date, requester_state,
           target_emp_id, target_shift_date, target_state
    INTO v_request
    FROM public.shift_requests
    WHERE id = p_request_id;

    IF FOUND
       AND v_request.type = 'swap'
       AND v_request.target_emp_id IS NOT NULL
       AND v_request.target_shift_date IS NOT NULL
       AND v_request.target_state IS NOT NULL THEN
      v_reason := public.swap_request_conflict(
        v_request.org_id,
        v_request.requester_emp_id,
        v_request.requester_shift_date,
        v_request.requester_state,
        v_request.target_emp_id,
        v_request.target_shift_date,
        v_request.target_state
      );
      IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot approve: %', v_reason;
      END IF;
    END IF;
  END IF;

  PERFORM public.resolve_shift_request_unchecked(p_request_id, p_approved, p_note, p_admin_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_request_checked(UUID, BOOLEAN, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_shift_request(
  p_request_id   UUID,
  p_approved     BOOLEAN,
  p_note         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.resolve_shift_request_checked(p_request_id, p_approved, p_note, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- Called by the app right after a request enters pending_approval. Returns
-- the approver and note when it approved, NULL when nothing qualified (no
-- approver among the parties, already decided, expired, or an impersonating
-- gridmaster), and raises only for a caller who has no business with the
-- request. Any validation failure inside the resolver propagates and leaves
-- the row untouched, so the caller falls back to the queue.
CREATE OR REPLACE FUNCTION public.auto_approve_shift_request(
  p_request_id UUID
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request RECORD;
  v_requester_user_id UUID;
  v_target_user_id UUID;
  v_approver_user_id UUID;
  v_approver_name TEXT;
  v_note TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not authenticated';
  END IF;

  -- A gridmaster acts under impersonation here; the platform never decides
  -- an organization's requests on its own authority.
  IF public.is_gridmaster() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.org_id != public.caller_org_id() THEN
    RAISE EXCEPTION 'Unauthorized: request belongs to a different organization';
  END IF;

  SELECT user_id INTO v_requester_user_id
  FROM public.employees
  WHERE id = v_request.requester_emp_id AND org_id = v_request.org_id;

  SELECT user_id INTO v_target_user_id
  FROM public.employees
  WHERE id = v_request.target_emp_id AND org_id = v_request.org_id;

  -- A missing target compares as NULL, which would slip past a plain OR.
  IF NOT (
    v_caller IS NOT DISTINCT FROM v_requester_user_id
    OR v_caller IS NOT DISTINCT FROM v_target_user_id
    OR public.caller_org_role()::TEXT IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: you are not party to this request';
  END IF;

  IF v_request.status != 'pending_approval' OR v_request.expires_at < now() THEN
    RETURN NULL;
  END IF;

  -- Parties only, the actor first. A call-off's own open pickup was authored
  -- by the system, so the absent person's rights do not carry to a claimer.
  IF (v_caller IS NOT DISTINCT FROM v_requester_user_id OR v_caller IS NOT DISTINCT FROM v_target_user_id)
     AND public.user_can_approve_shift_requests(v_caller, v_request.org_id) THEN
    v_approver_user_id := v_caller;
  ELSIF v_request.parent_request_id IS NULL
        AND public.user_can_approve_shift_requests(v_requester_user_id, v_request.org_id) THEN
    v_approver_user_id := v_requester_user_id;
  ELSIF public.user_can_approve_shift_requests(v_target_user_id, v_request.org_id) THEN
    v_approver_user_id := v_target_user_id;
  ELSE
    RETURN NULL;
  END IF;

  SELECT NULLIF(BTRIM(CONCAT_WS(' ', e.first_name, e.last_name)), '') INTO v_approver_name
  FROM public.employees e
  WHERE e.user_id = v_approver_user_id AND e.org_id = v_request.org_id
  LIMIT 1;

  v_note := format(
    'Auto-approved: %s can approve shift requests',
    COALESCE(v_approver_name, 'An approver')
  );

  PERFORM public.resolve_shift_request_checked(p_request_id, TRUE, v_note, v_approver_user_id);

  RETURN jsonb_build_object('approverUserId', v_approver_user_id, 'adminNote', v_note);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_approve_shift_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_approve_shift_request(UUID) TO authenticated;
