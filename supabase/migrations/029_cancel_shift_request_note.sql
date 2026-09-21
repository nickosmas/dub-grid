-- A manager who withdraws a request its recipient has not answered (a swap,
-- or a pickup offered to one person) can leave a note for both people, the
-- way approving or rejecting can. cancel_shift_request gains an optional
-- note that lands in admin_note; the requester's own cancel leaves it null.
--
-- The two-argument signature is dropped rather than kept beside the new one:
-- a defaulted third parameter would make a two-argument call ambiguous.

DROP FUNCTION IF EXISTS public.cancel_shift_request(UUID, UUID);

CREATE OR REPLACE FUNCTION public.cancel_shift_request(
  p_request_id UUID,
  p_emp_id     UUID,
  p_note       TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_emp RECORD;
BEGIN
  SELECT * INTO v_request
  FROM public.shift_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_request.status NOT IN ('open', 'pending_approval') THEN
    RAISE EXCEPTION 'Request cannot be cancelled (status: %)', v_request.status;
  END IF;

  -- Validate caller is the requester
  SELECT id, user_id INTO v_emp
  FROM public.employees
  WHERE id = p_emp_id AND org_id = v_request.org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF v_request.requester_emp_id != p_emp_id THEN
    RAISE EXCEPTION 'Only the requester can cancel this request';
  END IF;

  -- Or admin+ IN THIS org (or their own sandbox) - see create_shift_request
  -- for why the org match is required.
  IF v_emp.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_gridmaster()
     AND NOT (
       (public.caller_org_id() = v_request.org_id OR public.is_own_sandbox_org(v_request.org_id))
       AND public.caller_org_role()::TEXT IN ('super_admin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.shift_requests
  SET status = 'cancelled',
      admin_note = COALESCE(NULLIF(BTRIM(p_note), ''), admin_note),
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_shift_request(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_shift_request(UUID, UUID, TEXT) TO authenticated;
