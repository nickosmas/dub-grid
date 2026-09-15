-- Resolve a calloff-backed open pickup only when a scheduler's matching draft
-- reaches the published schedule. The trigger runs inside publish_schedule's
-- transaction, so the schedule and request cannot diverge.

CREATE OR REPLACE FUNCTION public.finalize_scheduler_staffed_calloffs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_to_state_kind TEXT;
  v_to_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_to_job_ids BIGINT[] := '{}'::BIGINT[];
  v_from_shift_ids BIGINT[] := '{}'::BIGINT[];
  v_from_job_ids BIGINT[] := '{}'::BIGINT[];
  v_remaining JSONB := '[]'::JSONB;
  v_candidate_remaining JSONB;
  v_request RECORD;
  v_request_index INTEGER;
  v_match_index INTEGER;
  v_matches BOOLEAN;
BEGIN
  IF NEW.to_state IS NULL OR NEW.to_state->>'kind' IS DISTINCT FROM 'worked' THEN
    RETURN NEW;
  END IF;

  SELECT state_kind, shift_ids, job_ids
  INTO v_to_state_kind, v_to_shift_ids, v_to_job_ids
  FROM public.resolve_schedule_state_storage(NEW.org_id, NEW.to_state);

  IF v_to_state_kind IS DISTINCT FROM 'worked' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_state IS NOT NULL THEN
    SELECT shift_ids, job_ids
    INTO v_from_shift_ids, v_from_job_ids
    FROM public.resolve_schedule_state_storage(NEW.org_id, NEW.from_state);
  END IF;

  WITH to_segments AS (
    SELECT
      segment.shift_id,
      segment.job_id,
      segment.ordinality,
      row_number() OVER (
        PARTITION BY segment.shift_id, segment.job_id
        ORDER BY segment.ordinality
      ) AS occurrence
    FROM unnest(v_to_shift_ids, v_to_job_ids)
      WITH ORDINALITY AS segment(shift_id, job_id, ordinality)
  ),
  from_counts AS (
    SELECT segment.shift_id, segment.job_id, count(*) AS segment_count
    FROM unnest(v_from_shift_ids, v_from_job_ids)
      AS segment(shift_id, job_id)
    GROUP BY segment.shift_id, segment.job_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('shiftId', added.shift_id, 'jobId', added.job_id)
      ORDER BY added.ordinality
    ),
    '[]'::JSONB
  )
  INTO v_remaining
  FROM to_segments added
  LEFT JOIN from_counts prior
    ON prior.shift_id IS NOT DISTINCT FROM added.shift_id
   AND prior.job_id IS NOT DISTINCT FROM added.job_id
  WHERE added.occurrence > COALESCE(prior.segment_count, 0);

  IF jsonb_array_length(v_remaining) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT history.published_by
  INTO v_actor_id
  FROM public.publish_history history
  WHERE history.id = NEW.publish_history_id
    AND history.org_id = NEW.org_id;

  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT
      request.id,
      parent.absence_type_id,
      request_state.shift_ids,
      request_state.job_ids
    FROM public.shift_requests request
    JOIN public.shift_requests parent
      ON parent.id = request.parent_request_id
     AND parent.org_id = request.org_id
     AND parent.type = 'calloff'
     AND parent.status = 'approved'
     AND parent.absence_type_id IS NOT NULL
    JOIN public.employees requester
      ON requester.id = request.requester_emp_id
     AND requester.org_id = request.org_id
    JOIN public.employees target
      ON target.id = NEW.emp_id
     AND target.org_id = NEW.org_id
     AND target.status = 'active'
     AND target.archived_at IS NULL
    JOIN LATERAL public.resolve_schedule_state_storage(
      request.org_id,
      request.requester_state
    ) request_state ON TRUE
    WHERE request.org_id = NEW.org_id
      AND request.requester_shift_date = NEW.date
      AND request.type = 'pickup'
      AND request.status = 'open'
      AND request.parent_request_id IS NOT NULL
      AND request_state.state_kind = 'worked'
      AND COALESCE(request_state.focus_area_id, requester.focus_area_ids[1]) = ANY(target.focus_area_ids)
    ORDER BY request.created_at, request.id
    FOR UPDATE OF request SKIP LOCKED
  LOOP
    IF COALESCE(array_length(v_request.job_ids, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    v_candidate_remaining := v_remaining;
    v_matches := TRUE;

    FOR v_request_index IN 1..array_length(v_request.job_ids, 1) LOOP
      v_match_index := NULL;

      SELECT (item.ordinality - 1)::INTEGER
      INTO v_match_index
      FROM jsonb_array_elements(v_candidate_remaining)
        WITH ORDINALITY AS item(value, ordinality)
      WHERE NULLIF(item.value->>'shiftId', 'null')::BIGINT
              IS NOT DISTINCT FROM v_request.shift_ids[v_request_index]
        AND NULLIF(item.value->>'jobId', 'null')::BIGINT
              IS NOT DISTINCT FROM v_request.job_ids[v_request_index]
      ORDER BY item.ordinality
      LIMIT 1;

      IF v_match_index IS NULL THEN
        v_matches := FALSE;
        EXIT;
      END IF;

      v_candidate_remaining := v_candidate_remaining - v_match_index;
    END LOOP;

    IF v_matches THEN
      UPDATE public.shift_requests
      SET status = 'approved',
          target_emp_id = NEW.emp_id,
          target_shift_date = NEW.date,
          absence_type_id = v_request.absence_type_id,
          admin_user_id = v_actor_id,
          admin_note = 'Assigned through the published schedule',
          resolved_at = now(),
          updated_at = now()
      WHERE id = v_request.id
        AND status = 'open';

      IF FOUND THEN
        v_remaining := v_candidate_remaining;
        EXIT WHEN jsonb_array_length(v_remaining) = 0;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_scheduler_staffed_calloffs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_finalize_scheduler_staffed_calloffs
  ON public.schedule_publish_changes;
CREATE TRIGGER trigger_finalize_scheduler_staffed_calloffs
  AFTER INSERT ON public.schedule_publish_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.finalize_scheduler_staffed_calloffs();
