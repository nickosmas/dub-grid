-- Approval re-checked a swap for overlapping hours but never for time off:
-- a published absence on the day a shift would move to, added after the
-- request was made, was silently overwritten by the shift. Creation has
-- refused that since 026; approval now asks the same question first.
--
-- resolve_shift_request is over a thousand lines, so rather than restate it
-- the existing body is kept under a private name and a thin function of the
-- same signature runs the conflict check and then delegates. The private
-- copy loses its authenticated grant so the check cannot be skipped by
-- calling it directly; the public name keeps the grant the app relies on.

ALTER FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT)
  RENAME TO resolve_shift_request_unchecked;

REVOKE ALL ON FUNCTION public.resolve_shift_request_unchecked(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_shift_request(
  p_request_id   UUID,
  p_approved     BOOLEAN,
  p_note         TEXT DEFAULT NULL
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

  PERFORM public.resolve_shift_request_unchecked(p_request_id, p_approved, p_note);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;
