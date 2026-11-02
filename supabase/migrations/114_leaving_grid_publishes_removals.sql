-- 114: Leaving the grid publishes the removals.
--
-- Leaving Active turned each published day ahead into a pending removal (067)
-- so the next publish would show the gap. The grid shows only Active people
-- and Away people with a return date, so for anyone Offboarded, archived or
-- Away with no return date those removals sat in the Draft changes count with
-- no cell to see them in, and their shifts stayed live until someone
-- published the period blind.
--
-- Taking someone off the grid now publishes their removals at once (owner,
-- 2026-10-29): every published day from today on goes, with its notes, under
-- one publish_history row credited to whoever changed the status. Days the
-- draft had already cleared (a planned away or last day, 103 and 104) go the
-- same way. No alert is sent, since publish alerts leave from the web route
-- (087). Away with a return date keeps 099's draft removals, which the grid
-- shows. With no actor to credit, the removals stay pending as before.
--
-- The loop also stops locking a person's whole history (F-174): a past day
-- is touched only when it holds a draft, or has nothing published at all.
SET lock_timeout = '5s';

-- 100's clearing, with the days ahead published when they leave the grid.
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
    IF NOT r.has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF r.date >= v_today AND v_off_grid THEN
      SELECT *
      INTO p
      FROM public.get_schedule_cell_snapshot_payload(v_org_id, p_emp_id, r.date, 'published');

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
        AND date >= v_today
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

-- What's already pending on people off the grid goes the same way, credited
-- to whoever last changed their record. Anyone with no one to credit is left
-- pending and counted.
DO $cleanup$
DECLARE
  v_done INTEGER := 0;
  v_left INTEGER := 0;
  e RECORD;
BEGIN
  FOR e IN
    SELECT emp.id, emp.updated_by
    FROM public.employees emp
    JOIN public.organizations o ON o.id = emp.org_id
    WHERE (
        emp.archived_at IS NOT NULL
        OR emp.status = 'removed'
        OR (emp.status = 'inactive' AND emp.away_until IS NULL)
      )
      AND EXISTS (
        SELECT 1
        FROM public.schedule_cells c
        JOIN public.schedule_cell_snapshots d
          ON d.cell_id = c.id AND d.snapshot_kind = 'draft' AND d.state_kind = 'deleted'
        JOIN public.schedule_cell_snapshots p
          ON p.cell_id = c.id AND p.snapshot_kind = 'published'
        WHERE c.emp_id = emp.id
          AND c.date >= (now() AT TIME ZONE o.timezone)::DATE
      )
    ORDER BY emp.id
  LOOP
    IF e.updated_by IS NULL THEN
      v_left := v_left + 1;
    ELSE
      PERFORM public.clear_schedule_for_departed_employee(e.id, e.updated_by);
      v_done := v_done + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '114: published pending removals for % people off the grid; % left pending with no one to credit',
    v_done, v_left;
END
$cleanup$;
