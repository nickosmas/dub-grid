-- A swap was checked for conflicts only when a manager approved it
-- (resolve_shift_request): the two shifts overlapping on the same day, or
-- either person already working overlapping hours on the day a shift would
-- move to. Nothing stopped such a swap from being created, accepted by the
-- other person and queued, so the manager was the first to learn it could
-- not happen. The web and mobile pickers filter these out, but the API takes
-- any target the caller names and their pickers work from a cached schedule,
-- so the check belongs on the row itself.
--
-- One function answers "why can this swap not happen", and a BEFORE INSERT
-- trigger refuses the row with that reason. It also covers a case approval
-- never checked: a published absence (time off) on the day a shift would
-- move to, which approval would silently overwrite with the shift.

CREATE OR REPLACE FUNCTION public.swap_request_conflict(
  p_org_id UUID,
  p_requester_emp_id UUID,
  p_requester_shift_date DATE,
  p_requester_state JSONB,
  p_target_emp_id UUID,
  p_target_shift_date DATE,
  p_target_state JSONB
) RETURNS TEXT
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_requester RECORD;
  v_target RECORD;
  v_requester_start TEXT := NULLIF(p_requester_state->>'customStartTime', '');
  v_requester_end TEXT := NULLIF(p_requester_state->>'customEndTime', '');
  v_target_start TEXT := NULLIF(p_target_state->>'customStartTime', '');
  v_target_end TEXT := NULLIF(p_target_state->>'customEndTime', '');
  v_existing RECORD;
BEGIN
  SELECT * INTO v_requester
  FROM public.resolve_schedule_state_storage(p_org_id, p_requester_state);
  SELECT * INTO v_target
  FROM public.resolve_schedule_state_storage(p_org_id, p_target_state);

  IF p_requester_shift_date = p_target_shift_date THEN
    IF public.work_assignment_times_overlap(
      COALESCE(v_requester.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_requester.job_ids, '{}'::BIGINT[]),
      v_requester_start,
      v_requester_end,
      COALESCE(v_target.shift_ids, '{}'::BIGINT[]),
      COALESCE(v_target.job_ids, '{}'::BIGINT[]),
      v_target_start,
      v_target_end
    ) THEN
      RETURN 'These shifts overlap in time, so swapping them would change nothing';
    END IF;
    RETURN NULL;
  END IF;

  -- The requester takes the target's shift on the target's date.
  SELECT * INTO v_existing
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id, p_requester_emp_id, p_target_shift_date, 'published'
  );
  IF FOUND THEN
    IF v_existing.state_kind = 'absence' THEN
      RETURN 'The requester has time off on the date they would take over';
    END IF;
    IF v_existing.state_kind = 'worked'
       AND array_length(v_existing.job_ids, 1) IS NOT NULL
       AND public.work_assignment_times_overlap(
         COALESCE(v_existing.shift_ids, '{}'::BIGINT[]),
         COALESCE(v_existing.job_ids, '{}'::BIGINT[]),
         v_existing.custom_start_time,
         v_existing.custom_end_time,
         COALESCE(v_target.shift_ids, '{}'::BIGINT[]),
         COALESCE(v_target.job_ids, '{}'::BIGINT[]),
         v_target_start,
         v_target_end
       ) THEN
      RETURN 'The requester already works overlapping hours on the date they would take over';
    END IF;
  END IF;

  -- The target takes the requester's shift on the requester's date.
  SELECT * INTO v_existing
  FROM public.get_schedule_cell_snapshot_payload(
    p_org_id, p_target_emp_id, p_requester_shift_date, 'published'
  );
  IF FOUND THEN
    IF v_existing.state_kind = 'absence' THEN
      RETURN 'The other person has time off on the date they would take over';
    END IF;
    IF v_existing.state_kind = 'worked'
       AND array_length(v_existing.job_ids, 1) IS NOT NULL
       AND public.work_assignment_times_overlap(
         COALESCE(v_existing.shift_ids, '{}'::BIGINT[]),
         COALESCE(v_existing.job_ids, '{}'::BIGINT[]),
         v_existing.custom_start_time,
         v_existing.custom_end_time,
         COALESCE(v_requester.shift_ids, '{}'::BIGINT[]),
         COALESCE(v_requester.job_ids, '{}'::BIGINT[]),
         v_requester_start,
         v_requester_end
       ) THEN
      RETURN 'The other person already works overlapping hours on the date they would take over';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_request_conflict(UUID, UUID, DATE, JSONB, UUID, DATE, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refuse_conflicting_swap_request()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  IF NEW.type <> 'swap' OR NEW.target_emp_id IS NULL OR NEW.target_shift_date IS NULL THEN
    RETURN NEW;
  END IF;

  v_reason := public.swap_request_conflict(
    NEW.org_id,
    NEW.requester_emp_id,
    NEW.requester_shift_date,
    NEW.requester_state,
    NEW.target_emp_id,
    NEW.target_shift_date,
    NEW.target_state
  );

  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_refuse_conflicting_swap_request ON public.shift_requests;
CREATE TRIGGER trigger_refuse_conflicting_swap_request
  BEFORE INSERT ON public.shift_requests
  FOR EACH ROW
  WHEN (NEW.type = 'swap')
  EXECUTE FUNCTION public.refuse_conflicting_swap_request();

REVOKE ALL ON FUNCTION public.refuse_conflicting_swap_request() FROM PUBLIC, anon, authenticated;
