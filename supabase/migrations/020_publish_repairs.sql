-- Publishing repairs.
--
-- 1. finalize_scheduler_staffed_calloffs (019) raised "Schedule state must be
--    a JSON object" for every published cell that had no prior published
--    state, because publish_schedule stores that from_state as a JSON null
--    rather than a SQL NULL. Any publish that added a cell failed outright.
-- 2. publish_schedule cast the whole pipe-delimited custom time of a multi
--    segment cell ("07:00|15:00") to TIME, so a double shift with a custom
--    time on both segments could not be published either.
-- 3. publish_schedule recorded a draft identical to its published snapshot as
--    a "modified" change, which showed up as an edit in the banner, tinted an
--    unchanged cell in the change overlay, and notified the employee.

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

  -- publish_schedule writes a brand-new cell's from_state as a JSON null, not
  -- a SQL NULL, so IS NOT NULL let it through to the resolver, which rejects
  -- anything but an object and failed every publish that added a cell.
  IF jsonb_typeof(NEW.from_state) = 'object' THEN
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

CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_org_id     UUID,
  p_start_date DATE,
  p_end_date   DATE,
  p_actor_id   UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_changes JSONB := '[]'::JSONB;
  v_change_count INTEGER := 0;
  v_history_id UUID;
  v_note_new INTEGER := 0;
  v_note_deleted INTEGER := 0;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  v_is_gridmaster BOOLEAN := FALSE;
  v_org_role public.org_role := 'user'::public.org_role;
  r RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing actor identity';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_actor_id
      AND platform_role = 'gridmaster'
  )
  INTO v_is_gridmaster;

  SELECT COALESCE(
    (
      SELECT cm.org_role
      FROM public.organization_memberships cm
      WHERE cm.user_id = v_actor_id
        AND cm.org_id = p_org_id
        AND cm.archived_at IS NULL
      LIMIT 1
    ),
    'user'::public.org_role
  )
  INTO v_org_role;

  IF NOT (
    v_is_gridmaster
    OR v_org_role::TEXT IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to publish schedule';
  END IF;

  -- Enforce canPublishSchedule for admins (super_admin and gridmaster bypass)
  IF v_org_role::TEXT = 'admin' AND NOT v_is_gridmaster THEN
    IF NOT COALESCE(
      (SELECT (cm.admin_permissions->>'canPublishSchedule')::BOOLEAN
       FROM public.organization_memberships cm
       WHERE cm.user_id = v_actor_id
         AND cm.org_id = p_org_id
         AND cm.archived_at IS NULL),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Unauthorized: you do not have permission to publish the schedule';
    END IF;
  END IF;

  -- Advisory lock prevents concurrent publishes for same org
  PERFORM pg_advisory_xact_lock(hashtext('publish_schedule_' || p_org_id::TEXT));

  -- Capture draft changes from canonical schedule cells and promote them.
  FOR r IN
    SELECT
      c.id AS cell_id,
      c.emp_id,
      c.date,
      c.series_id,
      c.from_recurring,
      c.focus_area_id,
      c.updated_by,
      draft.state_kind AS draft_state_kind,
      draft.absence_type_id AS draft_absence_type_id,
      draft.custom_start_time AS draft_custom_start,
      draft.custom_end_time AS draft_custom_end,
      draft.shift_ids AS draft_shift_ids,
      draft.job_ids AS draft_job_ids,
      draft.is_mentored_flags AS draft_is_mentored_flags,
      published.state_kind AS published_state_kind,
      published.absence_type_id AS published_absence_type_id,
      published.custom_start_time AS published_custom_start,
      published.custom_end_time AS published_custom_end,
      published.shift_ids AS published_shift_ids,
      published.job_ids AS published_job_ids,
      published.is_mentored_flags AS published_is_mentored_flags
    FROM public.schedule_cells c
    JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'draft'
    ) AS draft ON TRUE
    LEFT JOIN LATERAL public.get_schedule_cell_snapshot_payload(
      p_org_id,
      c.emp_id,
      c.date,
      'published'
    ) AS published ON TRUE
    WHERE c.org_id = p_org_id
      AND c.date >= p_start_date
      AND c.date <= p_end_date
  LOOP
    -- A draft that matches its published snapshot (an edit that was undone
    -- before publishing) changes nothing: recording it made the history say
    -- "1 edited", tinted the cell in the change overlay with nothing to show,
    -- and told the employee their shift was changed. Drop the draft and move on.
    IF r.draft_state_kind <> 'deleted'
      AND r.published_state_kind IS NOT DISTINCT FROM r.draft_state_kind
      AND r.published_absence_type_id IS NOT DISTINCT FROM r.draft_absence_type_id
      AND r.published_custom_start IS NOT DISTINCT FROM r.draft_custom_start
      AND r.published_custom_end IS NOT DISTINCT FROM r.draft_custom_end
      AND COALESCE(r.published_shift_ids, '{}'::BIGINT[]) = COALESCE(r.draft_shift_ids, '{}'::BIGINT[])
      AND COALESCE(r.published_job_ids, '{}'::BIGINT[]) = COALESCE(r.draft_job_ids, '{}'::BIGINT[])
      AND COALESCE(r.published_is_mentored_flags, '{}'::BOOLEAN[]) = COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
    THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.cell_id
        AND snapshot_kind = 'draft';
      CONTINUE;
    END IF;

    v_change_count := v_change_count + 1;
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'empId', r.emp_id,
      'date', r.date,
      'kind', CASE
        WHEN r.draft_state_kind = 'deleted' THEN 'deleted'
        WHEN r.published_state_kind IS NULL THEN 'new'
        ELSE 'modified'
      END,
      'fromState', CASE
        WHEN r.published_state_kind IS NULL THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.published_state_kind,
          r.published_shift_ids,
          r.published_job_ids,
          r.published_absence_type_id,
          r.published_custom_start,
          r.published_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.published_is_mentored_flags, '{}'::BOOLEAN[])
        )
      END,
      'toState', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE public.build_schedule_cell_state_json(
          r.draft_state_kind,
          r.draft_shift_ids,
          r.draft_job_ids,
          r.draft_absence_type_id,
          r.draft_custom_start,
          r.draft_custom_end,
          r.series_id,
          r.from_recurring,
          COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
        )
      END,
      'fromAbsenceTypeId', r.published_absence_type_id,
      'toAbsenceTypeId', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_absence_type_id
      END,
      'updatedBy', r.updated_by,
      'fromCustomStart', r.published_custom_start,
      'fromCustomEnd', r.published_custom_end,
      'toCustomStart', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_start
      END,
      'toCustomEnd', CASE
        WHEN r.draft_state_kind = 'deleted' THEN NULL
        ELSE r.draft_custom_end
      END
    ));

    IF r.draft_state_kind = 'deleted' THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.cell_id;
    ELSE
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        r.emp_id,
        r.date,
        'published',
        r.draft_state_kind,
        COALESCE(r.draft_shift_ids, '{}'::BIGINT[]),
        COALESCE(r.draft_job_ids, '{}'::BIGINT[]),
        r.draft_absence_type_id,
        r.draft_custom_start,
        r.draft_custom_end,
        r.series_id,
        r.from_recurring,
        r.focus_area_id,
        NULL,
        v_actor_id,
        COALESCE(r.draft_is_mentored_flags, '{}'::BOOLEAN[])
      );

      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.cell_id
        AND snapshot_kind = 'draft';

      PERFORM public.prune_empty_schedule_cell(r.cell_id);
    END IF;
  END LOOP;

  -- Count note changes
  SELECT COUNT(*) INTO v_note_new FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft';
  SELECT COUNT(*) INTO v_note_deleted FROM public.schedule_notes
  WHERE org_id = p_org_id AND date >= p_start_date AND date <= p_end_date AND status = 'draft_deleted';

  v_change_count := v_change_count + v_note_new + v_note_deleted;

  -- Insert publish_history record
  INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
  VALUES (p_org_id, v_actor_id, p_start_date, p_end_date, v_change_count)
  RETURNING id INTO v_history_id;

  -- Explode the in-memory changes array into one row per changed cell.
  INSERT INTO public.schedule_publish_changes (
    publish_history_id, org_id, emp_id, date, kind, from_state, to_state,
    from_absence_type_id, to_absence_type_id, updated_by,
    from_custom_start, from_custom_end, to_custom_start, to_custom_end
  )
  SELECT
    v_history_id,
    p_org_id,
    (c->>'empId')::UUID,
    (c->>'date')::DATE,
    c->>'kind',
    c->'fromState',
    c->'toState',
    NULLIF(c->>'fromAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'toAbsenceTypeId', '')::BIGINT,
    NULLIF(c->>'updatedBy', '')::UUID,
    -- Snapshot times are pipe-delimited per segment ("07:00|15:00" for a
    -- double shift). These TIME columns are a legacy summary the client only
    -- reads when a change carries no state JSON, so keep the first segment's
    -- time rather than failing the whole publish on the delimiter.
    NULLIF(split_part(COALESCE(c->>'fromCustomStart', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'fromCustomEnd', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'toCustomStart', ''), '|', 1), '')::TIME,
    NULLIF(split_part(COALESCE(c->>'toCustomEnd', ''), '|', 1), '')::TIME
  FROM jsonb_array_elements(v_changes) AS c;

  -- Notes: draft → published
  UPDATE public.schedule_notes
  SET status = 'published', updated_at = NOW()
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft';

  -- Notes: finalize deletions
  DELETE FROM public.schedule_notes
  WHERE org_id = p_org_id
    AND date >= p_start_date AND date <= p_end_date
    AND status = 'draft_deleted';

  -- Create per-employee notifications for linked users
  FOR r IN
    SELECT DISTINCT ON (e.user_id)
           c->>'empId' AS emp_id,
           e.user_id,
           c->>'kind' AS kind,
           c->>'date' AS change_date
    FROM jsonb_array_elements(v_changes) AS c
    JOIN public.employees e ON e.id = (c->>'empId')::UUID
    WHERE e.user_id IS NOT NULL
      AND e.user_id <> v_actor_id
  LOOP
    INSERT INTO public.notifications (user_id, org_id, type, channel, category, title, message, metadata)
    VALUES (
      r.user_id,
      p_org_id,
      'shift_change',
      'in_app',
      'schedule',
      CASE r.kind
        WHEN 'new' THEN 'New shift assigned'
        WHEN 'modified' THEN 'Your shift was changed'
        WHEN 'deleted' THEN 'Your shift was removed'
      END,
      'Your schedule for ' || to_char(r.change_date::DATE, 'FMDay, FMMonth DD') || ' was updated.',
      jsonb_build_object(
        'empId', r.emp_id,
        'date', r.change_date,
        'kind', r.kind,
        'publishedBy', v_actor_id
      )
    );
  END LOOP;

  -- Purge old history (keep last 100 per org)
  DELETE FROM public.publish_history
  WHERE org_id = p_org_id
    AND id NOT IN (
      SELECT id FROM public.publish_history
      WHERE org_id = p_org_id
      ORDER BY published_at DESC
      LIMIT 100
    );

  RETURN v_history_id;
END;
$$;
