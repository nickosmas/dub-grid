-- 126: A caller acts only in the organization their session is signed in to.
--
-- Audit findings F-194, F-195, F-198, F-212 and F-213. Publishing, role changes,
-- creating a request and volunteering checked a membership alone, so someone
-- suspended in one organization could still act there from a session in
-- another. Settling a request compared the request with caller_org_id() using
-- !=, which is NULL when caller_org_id() is NULL, so a token with a second
-- factor still to answer, or with no live organization, skipped the check.
--
-- caller_org_id() also reads the person's suspension, as the token hook does,
-- so a token issued before a suspension stops at the database too. A Test
-- Sandbox is the one other place a session can act, and only while its owner
-- could still enter it.
CREATE OR REPLACE FUNCTION public.caller_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT claimed.org_id
  FROM (
    SELECT
      NULLIF(auth.jwt() ->> 'org_id', '')::UUID AS org_id,
      NULLIF(auth.jwt() ->> 'session_id', '')::UUID AS session_id
  ) AS claimed
  JOIN public.profiles AS profile
    ON profile.id = auth.uid()
   AND profile.deactivated_at IS NULL
  JOIN public.organization_memberships AS membership
    ON membership.user_id = auth.uid()
   AND membership.org_id = claimed.org_id
   AND membership.archived_at IS NULL
  JOIN public.organizations AS organization
    ON organization.id = claimed.org_id
   AND organization.archived_at IS NULL
   AND organization.suspended_at IS NULL
  WHERE claimed.org_id IS NOT NULL
    AND NOT public.caller_mfa_challenge_pending()
    AND NOT EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.org_id = claimed.org_id
        AND employee.user_id = auth.uid()
        AND employee.suspended_at IS NOT NULL
    )
    AND (
      claimed.session_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.user_sessions AS session
        WHERE session.user_id = auth.uid()
          AND session.supabase_session_id = claimed.session_id
      )
    );
$$;

-- Mirrors canUseTestSandbox in the app: the sandbox is a copy of staff records,
-- so it needs what those records need in the organization it came from.
CREATE OR REPLACE FUNCTION public.is_own_sandbox_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_org_id
      AND o.workspace_kind = 'sandbox'
      AND o.sandbox_owner_user_id = auth.uid()
      AND o.sandbox_owner_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::UUID
      AND o.archived_at IS NULL
      AND NOT public.caller_mfa_challenge_pending()
      AND (
        public.is_gridmaster()
        OR EXISTS (
          SELECT 1
          FROM public.organization_memberships membership
          JOIN public.organizations source ON source.id = membership.org_id
          WHERE membership.org_id = o.sandbox_source_org_id
            AND membership.user_id = auth.uid()
            AND membership.archived_at IS NULL
            AND source.archived_at IS NULL
            AND source.suspended_at IS NULL
            AND (
              membership.org_role = 'super_admin'
              OR (
                membership.org_role = 'admin'
                AND COALESCE((membership.admin_permissions ->> 'canManageEmployees')::BOOLEAN, FALSE)
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.employees employee
              WHERE employee.org_id = membership.org_id
                AND employee.user_id = auth.uid()
                AND employee.suspended_at IS NOT NULL
            )
        )
      )
  );
$$;

-- The service role states its actor and has no session to compare. A Gridmaster
-- is held by refuse_gridmaster_outside_org.
CREATE OR REPLACE FUNCTION public.refuse_caller_outside_org(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_gridmaster() THEN
    RETURN;
  END IF;
  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: sign in to this organization first' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_caller_outside_org(UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refuse_request_outside_session_org(p_request_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF public.is_gridmaster() THEN
    RETURN;
  END IF;
  IF NOT public.is_authorized_org(public.shift_request_org_id(p_request_id)) THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Both ways of settling a request come through here, the approver's and
-- auto_approve_shift_request, and only their guards reach the body below it.
CREATE OR REPLACE FUNCTION public.resolve_shift_request_checked(p_request_id uuid, p_approved boolean, p_note text, p_admin_user_id uuid)
 RETURNS void
 LANGUAGE PLPGSQL
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_reason TEXT;
  v_cell RECORD;
BEGIN
  PERFORM public.refuse_request_outside_session_org(p_request_id);

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

  IF p_approved AND EXISTS (
    SELECT 1 FROM public.shift_requests
    WHERE id = p_request_id AND status = 'approved'
  ) THEN
    FOR v_cell IN
      SELECT * FROM public.shift_request_published_cells(p_request_id)
      ORDER BY emp_id, shift_date
    LOOP
      PERFORM public.discard_schedule_cell_draft_internal(
        v_cell.org_id, v_cell.emp_id, v_cell.shift_date, p_admin_user_id
      );
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_request_draft_cells(p_request_id uuid)
 RETURNS TABLE(emp_id uuid, shift_date date, has_shift_changes boolean, has_note_changes boolean)
 LANGUAGE PLPGSQL
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT request.org_id INTO v_org_id
  FROM public.shift_requests AS request
  WHERE request.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  PERFORM public.refuse_gridmaster_outside_org(v_org_id);
  PERFORM public.refuse_request_outside_session_org(p_request_id);

  IF NOT public.user_can_approve_shift_requests(auth.uid(), v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: you do not have permission to approve shift requests';
  END IF;

  RETURN QUERY
  SELECT cell.emp_id, cell.shift_date, shift_change.changed, note_change.changed
  FROM public.shift_request_published_cells(p_request_id) AS cell
  LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'draft'
  ) AS draft ON TRUE
  LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
    cell.org_id, cell.emp_id, cell.shift_date, 'published'
  ) AS published ON TRUE
  CROSS JOIN LATERAL (
    SELECT draft.cell_id IS NOT NULL AND (
      draft.state_kind = 'deleted'
      OR published.state_kind IS DISTINCT FROM draft.state_kind
      OR published.absence_type_id IS DISTINCT FROM draft.absence_type_id
      OR published.custom_start_time IS DISTINCT FROM draft.custom_start_time
      OR published.custom_end_time IS DISTINCT FROM draft.custom_end_time
      OR published.absence_start_time IS DISTINCT FROM draft.absence_start_time
      OR published.absence_end_time IS DISTINCT FROM draft.absence_end_time
      OR COALESCE(published.shift_ids, '{}'::BIGINT[]) <> COALESCE(draft.shift_ids, '{}'::BIGINT[])
      OR COALESCE(published.job_ids, '{}'::BIGINT[]) <> COALESCE(draft.job_ids, '{}'::BIGINT[])
      OR COALESCE(published.is_mentored_flags, '{}'::BOOLEAN[]) <> COALESCE(draft.is_mentored_flags, '{}'::BOOLEAN[])
    ) AS changed
  ) AS shift_change
  -- What discard_schedule_cell_draft_internal (086) undoes: draft notes, and
  -- notes deleted only in the draft.
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_notes note
      WHERE note.org_id = cell.org_id
        AND note.emp_id = cell.emp_id
        AND note.date = cell.shift_date
        AND note.status IN ('draft', 'draft_deleted')
    ) AS changed
  ) AS note_change
  WHERE shift_change.changed OR note_change.changed
  ORDER BY cell.emp_id, cell.shift_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_schedule(p_org_id uuid, p_start_date date, p_end_date date, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE PLPGSQL
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  PERFORM public.refuse_caller_outside_org(p_org_id);
  RETURN public.publish_schedule_unguarded(p_org_id, p_start_date, p_end_date, p_actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_shift_request(p_org_id uuid, p_type shift_request_type, p_requester_emp_id uuid, p_requester_shift_date date, p_target_emp_id uuid DEFAULT NULL::uuid, p_target_shift_date date DEFAULT NULL::date, p_idempotency_key uuid DEFAULT gen_random_uuid(), p_absence_type_id bigint DEFAULT NULL::bigint, p_requester_segment_index integer DEFAULT NULL::integer, p_target_segment_index integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE PLPGSQL
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  PERFORM public.refuse_caller_outside_org(p_org_id);
  RETURN public.create_shift_request_unguarded(
    p_org_id, p_type, p_requester_emp_id, p_requester_shift_date, p_target_emp_id,
    p_target_shift_date, p_idempotency_key, p_absence_type_id, p_requester_segment_index,
    p_target_segment_index
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.volunteer_for_open_shift(p_org_id uuid, p_emp_id uuid, p_shift_date date, p_shift_ids bigint[], p_job_ids bigint[], p_focus_area_id bigint, p_custom_start_time text DEFAULT NULL::text, p_custom_end_time text DEFAULT NULL::text, p_is_mentored_flags boolean[] DEFAULT '{}'::boolean[])
 RETURNS uuid
 LANGUAGE PLPGSQL
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  PERFORM public.refuse_caller_outside_org(p_org_id);
  RETURN public.volunteer_for_open_shift_unguarded(
    p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids, p_focus_area_id,
    p_custom_start_time, p_custom_end_time, p_is_mentored_flags
  );
END;
$$;

ALTER FUNCTION public.change_user_role(p_target_user_id uuid, p_new_role text, p_changed_by_id uuid, p_idempotency_key text, p_org_id uuid, p_expected_updated_at timestamp with time zone)
  RENAME TO change_user_role_unguarded;
REVOKE ALL ON FUNCTION public.change_user_role_unguarded(p_target_user_id uuid, p_new_role text, p_changed_by_id uuid, p_idempotency_key text, p_org_id uuid, p_expected_updated_at timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.change_user_role(p_target_user_id uuid, p_new_role text, p_changed_by_id uuid, p_idempotency_key text, p_org_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_caller_outside_org(
    COALESCE(p_org_id, (SELECT profile.org_id FROM public.profiles AS profile WHERE profile.id = p_target_user_id))
  );
  RETURN public.change_user_role_unguarded(
    p_target_user_id, p_new_role, p_changed_by_id, p_idempotency_key, p_org_id, p_expected_updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.change_user_role(p_target_user_id uuid, p_new_role text, p_changed_by_id uuid, p_idempotency_key text, p_org_id uuid, p_expected_updated_at timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(p_target_user_id uuid, p_new_role text, p_changed_by_id uuid, p_idempotency_key text, p_org_id uuid, p_expected_updated_at timestamp with time zone) TO authenticated, service_role;
