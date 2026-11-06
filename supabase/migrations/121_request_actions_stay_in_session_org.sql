-- 121: Acting on a shift request stays inside the session's organization.
--
-- Audit finding F-195: claim, respond and cancel authorize on
-- employees.user_id = auth.uid() with no organization, so someone employed in
-- two organizations could act on one's request from a session in the other.
-- The route then dispatched its alert under the session's organization, which
-- sent one organization's staff names to the other's approvers. A Gridmaster
-- is held by refuse_gridmaster_outside_org instead.
CREATE OR REPLACE FUNCTION public.refuse_request_outside_session_org(p_request_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF public.is_gridmaster() THEN
    RETURN;
  END IF;
  IF public.shift_request_org_id(p_request_id) IS DISTINCT FROM public.caller_org_id() THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_request_outside_session_org(UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_shift_request(p_request_id UUID, p_claimer_emp_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM public.refuse_gridmaster_outside_org(public.shift_request_org_id(p_request_id));
  PERFORM public.refuse_request_outside_session_org(p_request_id);
  PERFORM public.claim_shift_request_unguarded(p_request_id, p_claimer_emp_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_shift_request(
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
  PERFORM public.refuse_request_outside_session_org(p_request_id);
  PERFORM public.cancel_shift_request_unguarded(p_request_id, p_emp_id, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_shift_request(
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
  PERFORM public.refuse_request_outside_session_org(p_request_id);
  PERFORM public.respond_to_shift_request_unguarded(p_request_id, p_emp_id, p_accept);
END;
$$;
