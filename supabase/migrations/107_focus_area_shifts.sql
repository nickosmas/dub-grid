-- 107: Losing a focus area (item 51i).
--
-- Taking someone off a focus area asks what to do with their upcoming shifts
-- there. The save route counts them with upcoming_focus_area_shifts to ask,
-- and, when the answer is Clear, runs clear_focus_area_shifts after the person
-- is saved. Both read a day by the same rule, so what is counted is what is
-- cleared. Service role only: the routes check permission first.
SET lock_timeout = '5s';

-- The focus area, of p_focus_area_ids, that a snapshot is a worked shift in:
-- one its shifts belong to, or, when none of its shifts belongs to any focus
-- area, the cell's own. NULL for an absence, a removed day, or a shift
-- elsewhere. A web save doesn't record the cell's focus area, so the shift's
-- comes first.
CREATE OR REPLACE FUNCTION public.snapshot_focus_area_in(
  p_snapshot_id UUID,
  p_cell_focus_area_id BIGINT,
  p_focus_area_ids BIGINT[]
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.state_kind <> 'worked' THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.schedule_cell_segments g
      JOIN public.shift_categories sc ON sc.id = g.shift_id
      WHERE g.snapshot_id = s.id
        AND sc.focus_area_id IS NOT NULL
    ) THEN (
      SELECT min(sc.focus_area_id)
      FROM public.schedule_cell_segments g
      JOIN public.shift_categories sc ON sc.id = g.shift_id
      WHERE g.snapshot_id = s.id
        AND sc.focus_area_id = ANY (p_focus_area_ids)
    )
    WHEN p_cell_focus_area_id = ANY (p_focus_area_ids) THEN p_cell_focus_area_id
    ELSE NULL
  END
  FROM public.schedule_cell_snapshots s
  WHERE s.id = p_snapshot_id;
$$;

REVOKE ALL ON FUNCTION public.snapshot_focus_area_in(UUID, BIGINT, BIGINT[]) FROM PUBLIC, anon, authenticated;

-- Per focus area of p_focus_area_ids: how many days from today (in the
-- organization's timezone) the person is scheduled to work there, as the
-- schedule stands now (the draft, or the published day when it has no draft),
-- and the first and last of them.
CREATE OR REPLACE FUNCTION public.upcoming_focus_area_shifts(
  p_emp_id UUID,
  p_focus_area_ids BIGINT[]
)
RETURNS TABLE (focus_area_id BIGINT, shift_count INTEGER, first_date DATE, last_date DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH person AS (
    SELECT e.org_id, (now() AT TIME ZONE o.timezone)::DATE AS today
    FROM public.employees e
    JOIN public.organizations o ON o.id = e.org_id
    WHERE e.id = p_emp_id
  ),
  days AS (
    SELECT
      c.date,
      public.snapshot_focus_area_in(COALESCE(d.id, p.id), c.focus_area_id, p_focus_area_ids) AS area
    FROM public.schedule_cells c
    JOIN person ON person.org_id = c.org_id
    LEFT JOIN public.schedule_cell_snapshots d
      ON d.cell_id = c.id AND d.snapshot_kind = 'draft'
    LEFT JOIN public.schedule_cell_snapshots p
      ON p.cell_id = c.id AND p.snapshot_kind = 'published'
    WHERE c.emp_id = p_emp_id
      AND c.date >= person.today
  )
  SELECT area, count(*)::INTEGER, min(date), max(date)
  FROM days
  WHERE area IS NOT NULL
  GROUP BY area
  ORDER BY area;
$$;

REVOKE ALL ON FUNCTION public.upcoming_focus_area_shifts(UUID, BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upcoming_focus_area_shifts(UUID, BIGINT[]) TO service_role;

-- Clears in the draft every day upcoming_focus_area_shifts counts, as 103
-- clears a planned Away's days: a day never published is deleted, a published
-- one is removed in the draft. A day whose draft put the shift there over a
-- published day that isn't a shift there goes back to what was published.
-- Then expires the open requests the person made for a cleared day, and swaps
-- where a cleared day is the shift they'd give. Returns the days cleared.
CREATE OR REPLACE FUNCTION public.clear_focus_area_shifts(
  p_emp_id UUID,
  p_focus_area_ids BIGINT[],
  p_actor_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today DATE;
  v_dates DATE[] := '{}';
  v_draft public.schedule_cell_snapshots%ROWTYPE;
  v_published public.schedule_cell_snapshots%ROWTYPE;
  v_has_draft BOOLEAN;
  v_has_published BOOLEAN;
  v_published_here BOOLEAN;
  r RECORD;
BEGIN
  SELECT e.org_id, (now() AT TIME ZONE o.timezone)::DATE
  INTO v_org_id, v_today
  FROM public.employees e
  JOIN public.organizations o ON o.id = e.org_id
  WHERE e.id = p_emp_id;
  IF NOT FOUND OR COALESCE(cardinality(p_focus_area_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells; each
  -- day is decided under its lock.
  FOR r IN
    SELECT c.id, c.date, c.focus_area_id
    FROM public.schedule_cells c
    WHERE c.org_id = v_org_id
      AND c.emp_id = p_emp_id
      AND c.date >= v_today
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    SELECT * INTO v_draft
    FROM public.schedule_cell_snapshots
    WHERE cell_id = r.id AND snapshot_kind = 'draft';
    v_has_draft := FOUND;

    SELECT * INTO v_published
    FROM public.schedule_cell_snapshots
    WHERE cell_id = r.id AND snapshot_kind = 'published';
    v_has_published := FOUND;

    v_published_here := v_has_published AND public.snapshot_focus_area_in(
      v_published.id, r.focus_area_id, p_focus_area_ids
    ) IS NOT NULL;

    CONTINUE WHEN NOT (
      CASE
        WHEN v_has_draft THEN public.snapshot_focus_area_in(
          v_draft.id, r.focus_area_id, p_focus_area_ids
        ) IS NOT NULL
        ELSE v_published_here
      END
    );

    v_dates := v_dates || r.date;

    IF NOT v_has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF v_has_draft AND NOT v_published_here THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE id = v_draft.id;

      UPDATE public.schedule_cells
      SET version = version + 1,
          updated_by = p_actor_id,
          updated_at = now()
      WHERE id = r.id;
    ELSE
      UPDATE public.schedule_cells
      SET version = version + 1,
          updated_by = p_actor_id,
          updated_at = now()
      WHERE id = r.id;

      PERFORM public.sync_schedule_cell_snapshot(
        r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
        '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
      );
    END IF;
  END LOOP;

  IF cardinality(v_dates) > 0 THEN
    UPDATE public.shift_requests
    SET status = 'expired', resolved_at = now(), updated_at = now()
    WHERE org_id = v_org_id
      AND status IN ('open', 'pending_approval')
      AND (
        (requester_emp_id = p_emp_id AND requester_shift_date = ANY (v_dates))
        OR (
          type = 'swap'
          AND target_emp_id = p_emp_id
          AND target_shift_date = ANY (v_dates)
        )
      );
  END IF;

  RETURN cardinality(v_dates);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_focus_area_shifts(UUID, BIGINT[], UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_focus_area_shifts(UUID, BIGINT[], UUID) TO service_role;
