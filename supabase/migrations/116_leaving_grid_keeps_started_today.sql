-- 116: Leaving the grid keeps today's shift once it has started.
--
-- 114 publishes the removal of every day from today on when someone leaves the
-- grid, so a person offboarded or marked away (with no return date) after
-- working part of today lost today's shift from history, hours and reports.
-- The owner's rule (2026-11-04): today's published day comes off only if it
-- hasn't started. Days after today are unchanged.
--
-- A day has started when the earliest scheduled time on it has come, in the
-- organization's time zone:
--   - each worked shift starts at its custom start (when the day has both a
--     custom start and end for it, as resolve_work_assignment_time_ranges
--     reads them), else the job's override for that shift, else the job's
--     default (a shiftless job), else the shift's own start;
--   - an absence that ends where the first shift starts (they arrived late)
--     moves the day's start back to the absence's start;
--   - a whole-day absence has no start, so it has started;
--   - a day whose start can't be worked out (a shift or job with no time)
--     counts as started and is kept.
-- A day with two shifts is kept whole once the first has started.
--
-- A started day today stays as it is: its published state, its notes and any
-- draft it holds. The same rule applies to the draft removals of someone away
-- with a return date (099), so a started day isn't drafted for removal either.
--
-- Open requests they're part of still close, a started shift today included:
-- the person can't act on them once they leave, and approving one would move
-- a shift they already began. The shift itself stays on their record.
SET lock_timeout = '5s';

-- Whether a day's schedule has started at now() in the organization's time
-- zone. Days before today have, days after haven't.
CREATE OR REPLACE FUNCTION public.schedule_day_has_started(
  p_org_id UUID,
  p_date DATE,
  p_state_kind TEXT,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT,
  p_custom_end TEXT,
  p_absence_start TEXT DEFAULT NULL,
  p_absence_end TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMP;
  v_starts TEXT[] := string_to_array(COALESCE(p_custom_start, ''), '|');
  v_ends TEXT[] := string_to_array(COALESCE(p_custom_end, ''), '|');
  v_start TIME;
  v_earliest TIME;
  v_idx INTEGER;
BEGIN
  SELECT now() AT TIME ZONE COALESCE(o.timezone, 'UTC')
  INTO v_now
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_now IS NULL OR p_date < v_now::DATE THEN
    RETURN TRUE;
  END IF;
  IF p_date > v_now::DATE THEN
    RETURN FALSE;
  END IF;
  IF p_state_kind = 'deleted' THEN
    RETURN FALSE;
  END IF;
  IF p_state_kind IS DISTINCT FROM 'worked' OR COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RETURN TRUE;
  END IF;

  FOR v_idx IN 1..array_length(p_job_ids, 1) LOOP
    IF NULLIF(TRIM(v_starts[v_idx]), '') IS NOT NULL
       AND NULLIF(TRIM(v_ends[v_idx]), '') IS NOT NULL THEN
      v_start := TRIM(v_starts[v_idx])::TIME;
    ELSE
      -- Archived jobs and shifts still carry their times; the day was
      -- scheduled with them.
      SELECT COALESCE(
        jso.start_time,
        CASE
          WHEN p_shift_ids[v_idx] IS NULL OR j.assignment_mode = 'shiftless' THEN j.default_start_time
        END,
        sc.start_time
      )
      INTO v_start
      FROM public.jobs j
      LEFT JOIN public.shift_categories sc ON sc.id = p_shift_ids[v_idx]
      LEFT JOIN public.job_shift_overrides jso
        ON jso.job_id = j.id
       AND jso.shift_id = p_shift_ids[v_idx]
      WHERE j.id = p_job_ids[v_idx]
        AND j.org_id = p_org_id;
    END IF;

    IF v_start IS NULL THEN
      RETURN TRUE;
    END IF;
    v_earliest := LEAST(v_earliest, v_start);
  END LOOP;

  IF NULLIF(p_absence_start, '') IS NOT NULL
     AND NULLIF(p_absence_end, '') IS NOT NULL
     AND p_absence_end::TIME = v_earliest THEN
    v_earliest := p_absence_start::TIME;
  END IF;

  RETURN v_now::TIME >= v_earliest;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_day_has_started(
  UUID, DATE, TEXT, BIGINT[], BIGINT[], TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

-- 114's clearing, with a started day today left as it is.
CREATE OR REPLACE FUNCTION public.clear_schedule_for_departed_employee(
  p_emp_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today DATE;
  v_until DATE;
  v_away_type BIGINT;
  v_off_grid BOOLEAN;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  v_changes JSONB := '[]'::JSONB;
  v_first DATE;
  v_last DATE;
  v_note_count INTEGER := 0;
  v_history_id UUID;
  v_today_started BOOLEAN := FALSE;
  v_started BOOLEAN;
  r RECORD;
  p RECORD;
BEGIN
  SELECT
    e.org_id,
    (now() AT TIME ZONE o.timezone)::DATE,
    CASE WHEN e.status = 'inactive' AND e.archived_at IS NULL THEN e.away_until END,
    CASE WHEN e.status = 'inactive' AND e.archived_at IS NULL THEN e.away_absence_type_id END,
    e.archived_at IS NOT NULL
      OR e.status = 'removed'
      OR (e.status = 'inactive' AND e.away_until IS NULL)
  INTO v_org_id, v_today, v_until, v_away_type, v_off_grid
  FROM public.employees e
  JOIN public.organizations o ON o.id = e.org_id
  WHERE e.id = p_emp_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_off_grid := v_off_grid AND v_actor_id IS NOT NULL;

  -- Publish's lock comes before the cell locks, as it does in publish, so a
  -- publish running at the same time waits instead of deadlocking.
  IF v_off_grid THEN
    PERFORM pg_advisory_xact_lock(hashtext('publish_schedule_' || v_org_id::TEXT));
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells.
  FOR r IN
    SELECT
      c.id,
      c.date,
      c.series_id,
      c.from_recurring,
      EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'published'
      ) AS has_published,
      (
        SELECT s.state_kind
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'draft'
      ) AS draft_state
    FROM public.schedule_cells c
    WHERE c.org_id = v_org_id
      AND c.emp_id = p_emp_id
      AND (v_until IS NULL OR c.date < v_until)
      AND (
        c.date >= v_today
        OR EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          WHERE s.cell_id = c.id
            AND s.snapshot_kind = 'draft'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          WHERE s.cell_id = c.id
            AND s.snapshot_kind = 'published'
        )
      )
      -- A day already holding their away absence (100) keeps it.
      AND NOT (
        v_away_type IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.schedule_cell_snapshots s
          WHERE s.cell_id = c.id
            AND s.state_kind = 'absence'
            AND s.absence_type_id = v_away_type
            AND s.absence_start_time IS NULL
            AND (
              s.snapshot_kind = 'draft'
              OR NOT EXISTS (
                SELECT 1
                FROM public.schedule_cell_snapshots d
                WHERE d.cell_id = c.id
                  AND d.snapshot_kind = 'draft'
              )
            )
        )
      )
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    v_started := FALSE;
    IF r.has_published AND r.date >= v_today THEN
      SELECT *
      INTO p
      FROM public.get_schedule_cell_snapshot_payload(v_org_id, p_emp_id, r.date, 'published');

      v_started := r.date = v_today AND public.schedule_day_has_started(
        v_org_id,
        r.date,
        p.state_kind,
        p.shift_ids,
        p.job_ids,
        p.custom_start_time,
        p.custom_end_time,
        p.absence_start_time,
        p.absence_end_time
      );
    END IF;

    IF NOT r.has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF v_started THEN
      -- Today, already under way: it stays published, with its notes and draft.
      v_today_started := TRUE;
    ELSIF r.date >= v_today AND v_off_grid THEN
      -- The change row publish_schedule_unguarded (092) writes for a removal.
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'date', r.date,
        'fromState', public.build_schedule_cell_state_json(
          p.state_kind,
          p.shift_ids,
          p.job_ids,
          p.absence_type_id,
          p.custom_start_time,
          p.custom_end_time,
          r.series_id,
          r.from_recurring,
          COALESCE(p.is_mentored_flags, '{}'::BOOLEAN[]),
          p_absence_start_time => p.absence_start_time,
          p_absence_end_time => p.absence_end_time
        ),
        'fromAbsenceTypeId', p.absence_type_id,
        'fromCustomStart', p.custom_start_time,
        'fromCustomEnd', p.custom_end_time
      ));
      v_first := LEAST(v_first, r.date);
      v_last := GREATEST(v_last, r.date);

      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF r.date >= v_today THEN
      IF r.draft_state IS DISTINCT FROM 'deleted' THEN
        UPDATE public.schedule_cells
        SET version = version + 1,
            updated_by = v_actor_id,
            updated_at = now()
        WHERE id = r.id;

        PERFORM public.sync_schedule_cell_snapshot(
          r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
          '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
        );
      END IF;
    ELSIF r.draft_state IS NOT NULL AND r.draft_state <> 'deleted' THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.id
        AND snapshot_kind = 'draft';
    END IF;
  END LOOP;

  IF v_off_grid THEN
    -- Their notes ahead go now too. Left to 064's trigger, a published note
    -- would only be marked for removal at the next publish.
    WITH gone AS (
      DELETE FROM public.schedule_notes
      WHERE org_id = v_org_id
        AND emp_id = p_emp_id
        AND (date > v_today OR (date = v_today AND NOT v_today_started))
      RETURNING status
    )
    SELECT COUNT(*) FILTER (WHERE status IN ('published', 'draft_deleted'))
    INTO v_note_count
    FROM gone;
  END IF;

  IF jsonb_array_length(v_changes) > 0 THEN
    INSERT INTO public.publish_history (org_id, published_by, start_date, end_date, change_count)
    VALUES (v_org_id, v_actor_id, v_first, v_last, jsonb_array_length(v_changes) + v_note_count)
    RETURNING id INTO v_history_id;

    INSERT INTO public.schedule_publish_changes (
      publish_history_id, org_id, emp_id, date, kind, from_state, to_state,
      from_absence_type_id, to_absence_type_id, updated_by,
      from_custom_start, from_custom_end, to_custom_start, to_custom_end
    )
    SELECT
      v_history_id,
      v_org_id,
      p_emp_id,
      (c->>'date')::DATE,
      'deleted',
      c->'fromState',
      NULL,
      NULLIF(c->>'fromAbsenceTypeId', '')::BIGINT,
      NULL,
      v_actor_id,
      -- The first segment's time, as publish keeps it (092).
      NULLIF(split_part(COALESCE(c->>'fromCustomStart', ''), '|', 1), '')::TIME,
      NULLIF(split_part(COALESCE(c->>'fromCustomEnd', ''), '|', 1), '')::TIME,
      NULL,
      NULL
    FROM jsonb_array_elements(v_changes) AS c;

    -- Publish keeps the last 100 per organization.
    DELETE FROM public.publish_history
    WHERE org_id = v_org_id
      AND id NOT IN (
        SELECT id FROM public.publish_history
        WHERE org_id = v_org_id
        ORDER BY published_at DESC
        LIMIT 100
      );
  END IF;

  IF v_until IS NULL THEN
    UPDATE public.recurring_shifts
    SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
    WHERE org_id = v_org_id
      AND emp_id = p_emp_id
      AND archived_at IS NULL;
  END IF;

  UPDATE public.shift_series
  SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
  WHERE org_id = v_org_id
    AND emp_id = p_emp_id
    AND archived_at IS NULL
    AND (v_until IS NULL OR end_date < v_until);

  UPDATE public.shift_requests
  SET status = 'expired', resolved_at = now(), updated_at = now()
  WHERE org_id = v_org_id
    AND (requester_emp_id = p_emp_id OR target_emp_id = p_emp_id)
    AND status IN ('open', 'pending_approval')
    AND (v_until IS NULL OR LEAST(requester_shift_date, target_shift_date) < v_until);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_for_departed_employee(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
