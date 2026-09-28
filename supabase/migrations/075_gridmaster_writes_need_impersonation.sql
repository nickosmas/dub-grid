-- 075: A Gridmaster changes an organization's schedule and requests only while
-- impersonating it (F-75).
--
-- The schedule, recurring, publish and request functions are granted to
-- `authenticated` and let any Gridmaster through, so a stale or stolen
-- Gridmaster token could edit, publish and settle requests in every
-- organization by calling them through the data API. The owner refused to
-- accept that, and chose not to ask for fresh proof every five minutes during
-- impersonated editing. So a Gridmaster's authority in an organization now
-- comes from an active impersonation of it: unexpired, not ended, and started
-- by the same auth session (`session_id`) that makes the call. Starting one
-- already needs fresh proof (055), so a stale token can no longer act.
--
-- Organization members are unaffected, including a Gridmaster who is also a
-- member of that organization.
--
-- The eight schedule and recurring functions check the organization through
-- `is_authorized_org` and `check_admin_permission_for_org`, so those two carry
-- the new rule. The request functions, `publish_schedule` and
-- `set_job_shift_overrides` decide on a Gridmaster inside long bodies. Each
-- keeps its body under an `_unguarded` name that `authenticated` cannot call,
-- and its original name becomes a guard that refuses a Gridmaster acting in an
-- organization they are not impersonating, then calls the body.
--
-- The guard recognises a Gridmaster by profile, as `publish_schedule` and
-- `user_can_approve_shift_requests` do, not by `is_gridmaster()`. Otherwise a
-- revoked Gridmaster session, which `is_gridmaster()` refuses, would skip the
-- guard and still be treated as a Gridmaster by those bodies.
--
-- Service-role callers (no JWT: publish and job overrides from their routes)
-- pass the guard. Their routes check the impersonation themselves.

CREATE OR REPLACE FUNCTION public.caller_impersonates_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.impersonation_sessions AS session
    WHERE session.gridmaster_id = auth.uid()
      AND session.target_org_id = p_org_id
      AND session.ended_at IS NULL
      AND session.expires_at > now()
      AND session.auth_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::UUID
  );
$$;

REVOKE ALL ON FUNCTION public.caller_impersonates_org(UUID) FROM PUBLIC, anon, authenticated;

-- True when a signed-in Gridmaster (by profile) acts in an organization they
-- are neither impersonating nor a member of.
CREATE OR REPLACE FUNCTION public.gridmaster_outside_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles AS profile
       WHERE profile.id = auth.uid() AND profile.platform_role = 'gridmaster'
     )
     AND public.caller_org_id() IS DISTINCT FROM p_org_id
     AND NOT public.caller_impersonates_org(p_org_id);
$$;

REVOKE ALL ON FUNCTION public.gridmaster_outside_org(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refuse_gridmaster_outside_org(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF public.gridmaster_outside_org(p_org_id) THEN
    RAISE EXCEPTION 'Start an impersonation of this organization to change its data'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_gridmaster_outside_org(UUID) FROM PUBLIC, anon, authenticated;

-- The eight schedule and recurring functions. Both helpers now return a
-- definite TRUE or FALSE. Their callers test `IF NOT helper(...)`, and with no
-- organization claim `caller_org_id() = p_org_id` is NULL: without the Gridmaster
-- branch short-circuiting to TRUE, the whole OR would be NULL, `NOT NULL` would
-- not raise, and a Gridmaster outside an impersonation would pass.
CREATE OR REPLACE FUNCTION public.is_authorized_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (public.is_gridmaster() AND public.caller_impersonates_org(p_org_id))
    OR public.caller_org_id() = p_org_id
    OR public.is_own_sandbox_org(p_org_id),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.check_admin_permission_for_org(p_permission TEXT, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (public.is_gridmaster() AND public.caller_impersonates_org(p_org_id))
    OR (public.caller_org_id() = p_org_id AND public.check_admin_permission(p_permission))
    OR public.is_own_sandbox_org(p_org_id),
    FALSE
  );
$$;

-- Requests.
ALTER FUNCTION public.create_shift_request(
  UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT, INTEGER, INTEGER
) RENAME TO create_shift_request_unguarded;
REVOKE ALL ON FUNCTION public.create_shift_request_unguarded(
  UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_shift_request(
  p_org_id UUID,
  p_type public.shift_request_type,
  p_requester_emp_id UUID,
  p_requester_shift_date DATE,
  p_target_emp_id UUID DEFAULT NULL,
  p_target_shift_date DATE DEFAULT NULL,
  p_idempotency_key UUID DEFAULT gen_random_uuid(),
  p_absence_type_id BIGINT DEFAULT NULL,
  p_requester_segment_index INTEGER DEFAULT NULL,
  p_target_segment_index INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  RETURN public.create_shift_request_unguarded(
    p_org_id, p_type, p_requester_emp_id, p_requester_shift_date, p_target_emp_id,
    p_target_shift_date, p_idempotency_key, p_absence_type_id, p_requester_segment_index,
    p_target_segment_index
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_shift_request(
  UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT, INTEGER, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shift_request(
  UUID, public.shift_request_type, UUID, DATE, UUID, DATE, UUID, BIGINT, INTEGER, INTEGER
) TO authenticated;

ALTER FUNCTION public.volunteer_for_open_shift(
  UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]
) RENAME TO volunteer_for_open_shift_unguarded;
REVOKE ALL ON FUNCTION public.volunteer_for_open_shift_unguarded(
  UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.volunteer_for_open_shift(
  p_org_id UUID,
  p_emp_id UUID,
  p_shift_date DATE,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_focus_area_id BIGINT,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  RETURN public.volunteer_for_open_shift_unguarded(
    p_org_id, p_emp_id, p_shift_date, p_shift_ids, p_job_ids, p_focus_area_id,
    p_custom_start_time, p_custom_end_time, p_is_mentored_flags
  );
END;
$$;
REVOKE ALL ON FUNCTION public.volunteer_for_open_shift(
  UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.volunteer_for_open_shift(
  UUID, UUID, DATE, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BOOLEAN[]
) TO authenticated;

-- The request's own organization, for the functions that take only its id.
CREATE OR REPLACE FUNCTION public.shift_request_org_id(p_request_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_id FROM public.shift_requests WHERE id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.shift_request_org_id(UUID) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.claim_shift_request(UUID, UUID) RENAME TO claim_shift_request_unguarded;
REVOKE ALL ON FUNCTION public.claim_shift_request_unguarded(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_shift_request(p_request_id UUID, p_claimer_emp_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(public.shift_request_org_id(p_request_id));
  PERFORM public.claim_shift_request_unguarded(p_request_id, p_claimer_emp_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_shift_request(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_shift_request(UUID, UUID) TO authenticated;

ALTER FUNCTION public.cancel_shift_request(UUID, UUID, TEXT)
  RENAME TO cancel_shift_request_unguarded;
REVOKE ALL ON FUNCTION public.cancel_shift_request_unguarded(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cancel_shift_request(
  p_request_id UUID,
  p_emp_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(public.shift_request_org_id(p_request_id));
  PERFORM public.cancel_shift_request_unguarded(p_request_id, p_emp_id, p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_shift_request(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_shift_request(UUID, UUID, TEXT) TO authenticated;

ALTER FUNCTION public.respond_to_shift_request(UUID, UUID, BOOLEAN)
  RENAME TO respond_to_shift_request_unguarded;
REVOKE ALL ON FUNCTION public.respond_to_shift_request_unguarded(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.respond_to_shift_request(
  p_request_id UUID,
  p_emp_id UUID,
  p_accept BOOLEAN
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(public.shift_request_org_id(p_request_id));
  PERFORM public.respond_to_shift_request_unguarded(p_request_id, p_emp_id, p_accept);
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_shift_request(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_shift_request(UUID, UUID, BOOLEAN) TO authenticated;

ALTER FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT)
  RENAME TO resolve_shift_request_unguarded;
REVOKE ALL ON FUNCTION public.resolve_shift_request_unguarded(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.resolve_shift_request(
  p_request_id UUID,
  p_approved BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(public.shift_request_org_id(p_request_id));
  PERFORM public.resolve_shift_request_unguarded(p_request_id, p_approved, p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- Publish and job overrides: a direct call with a Gridmaster's token is
-- guarded here; their routes call them as the service role and check the
-- impersonation themselves.
ALTER FUNCTION public.publish_schedule(UUID, DATE, DATE, UUID)
  RENAME TO publish_schedule_unguarded;
REVOKE ALL ON FUNCTION public.publish_schedule_unguarded(UUID, DATE, DATE, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_schedule_unguarded(UUID, DATE, DATE, UUID)
  TO service_role;

CREATE FUNCTION public.publish_schedule(
  p_org_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(p_org_id);
  RETURN public.publish_schedule_unguarded(p_org_id, p_start_date, p_end_date, p_actor_id);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_schedule(UUID, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule(UUID, DATE, DATE, UUID)
  TO authenticated, service_role;

ALTER FUNCTION public.set_job_shift_overrides(BIGINT, JSONB, JSONB, UUID)
  RENAME TO set_job_shift_overrides_unguarded;
REVOKE ALL ON FUNCTION public.set_job_shift_overrides_unguarded(BIGINT, JSONB, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_shift_overrides_unguarded(BIGINT, JSONB, JSONB, UUID)
  TO service_role;

CREATE FUNCTION public.set_job_shift_overrides(
  p_job_id BIGINT,
  p_time_overrides JSONB DEFAULT '{}'::JSONB,
  p_color_overrides JSONB DEFAULT '{}'::JSONB,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(
    (SELECT job.org_id FROM public.jobs AS job WHERE job.id = p_job_id)
  );
  PERFORM public.set_job_shift_overrides_unguarded(
    p_job_id, p_time_overrides, p_color_overrides, p_actor_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_job_shift_overrides(BIGINT, JSONB, JSONB, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_job_shift_overrides(BIGINT, JSONB, JSONB, UUID)
  TO authenticated, service_role;
