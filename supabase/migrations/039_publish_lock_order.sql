-- Audit finding F-19 (2026-09-22 audit, recorded unverified and confirmed on
-- 2026-09-22 with a two-connection reproduction): publish_schedule iterated
-- its cells in the scan's order while discard_schedule_drafts locks them by
-- id, so overlapping publishes and discards could deadlock. The loop now
-- takes the same order. Restated from 020 with that single hunk; 039 is now
-- the canonical publish_schedule text.

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
    -- Same order discard_schedule_drafts takes its locks in. Without it the
    -- scan returned cells in date order while the discard locked them by id,
    -- so two overlapping ranges running at once took the same rows in
    -- opposite orders and Postgres killed one with a deadlock (reproduced on
    -- two connections, SQLSTATE 40P01). No data was ever lost; the caller
    -- just saw a 500 instead of waiting its turn.
    ORDER BY c.id
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
