-- 080: Repeating shifts can keep existing shifts and change part of a series.
--
-- Creating a series used to overwrite every shift on its dates. With
-- `p_keep_existing` it skips a date that already holds a shift or an off day,
-- so that day stays as it was and does not join the series. The day the series
-- was made from (`p_origin_date`) is always written: it is the shift being
-- repeated. A skipped day still counts toward `p_max_occurrences`, so the
-- series ends where its preview said it would.
--
-- Editing and removing a series used to cover every occurrence. Both now take
-- an inclusive date range (`p_from_date`, `p_to_date`, either open), which is
-- how "This and earlier" and "This and later" reach the database. The series
-- template follows an edit only when the range runs to the series' end, since
-- it describes the shifts still to come. Removing the later part ends the
-- series the day before; removing every occurrence archives it as before.
--
-- An edit no longer brings back an occurrence that was removed on its own
-- after publishing (a draft "deleted" snapshot that keeps the series id).
--
-- New parameters change the signatures, so the old ones are dropped first. A
-- new function is executable by PUBLIC, so each is revoked from PUBLIC and
-- anon and granted to `authenticated` only, as 016 left the old ones.

DROP FUNCTION IF EXISTS public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER);
DROP FUNCTION IF EXISTS public.update_series_all_shifts(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.delete_shift_series(UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_shift_series(
  p_series_id UUID,
  p_emp_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_frequency public.shift_series_frequency,
  p_days_of_week SMALLINT[] DEFAULT NULL,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT NULL,
  p_max_occurrences INTEGER DEFAULT NULL,
  p_keep_existing BOOLEAN DEFAULT FALSE,
  p_origin_date DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_series_id UUID := COALESCE(p_series_id, gen_random_uuid());
  v_state RECORD;
  v_current_date DATE := p_start_date;
  v_end_date DATE := LEAST(
    COALESCE(p_end_date, (p_start_date + INTERVAL '7 months')::DATE),
    p_start_date + 183 * 14
  );
  v_cap INTEGER := LEAST(COALESCE(p_max_occurrences, 183), 183);
  v_occurrence_count INTEGER := 0;
  v_start_day_of_week INTEGER := EXTRACT(DOW FROM p_start_date)::INTEGER;
  v_day_of_week INTEGER;
  v_day_index INTEGER;
  v_week_index INTEGER;
  v_day_match BOOLEAN;
  v_include BOOLEAN;
  v_existing_cell_id UUID;
  v_existing_version BIGINT;
  v_existing_kind TEXT;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Series start date is required';
  END IF;

  IF v_end_date < p_start_date THEN
    RAISE EXCEPTION 'Series end date must be on or after start date';
  END IF;

  IF v_cap <= 0 THEN
    RAISE EXCEPTION 'Series max occurrences must be positive';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_emp_id
      AND e.org_id = p_org_id
      AND e.archived_at IS NULL
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Employee not found, archived, or inactive';
  END IF;

  INSERT INTO public.shift_series (
    id,
    emp_id,
    org_id,
    state,
    frequency,
    days_of_week,
    start_date,
    end_date,
    max_occurrences
  ) VALUES (
    v_series_id,
    p_emp_id,
    p_org_id,
    jsonb_set(p_state, '{seriesId}', to_jsonb(v_series_id::TEXT), TRUE),
    p_frequency,
    p_days_of_week,
    p_start_date,
    p_end_date,
    p_max_occurrences
  );

  WHILE v_current_date <= v_end_date AND v_occurrence_count < v_cap LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
    v_day_index := v_current_date - p_start_date;
    v_week_index := FLOOR(v_day_index / 7.0)::INTEGER;
    v_day_match := CASE
      WHEN array_length(p_days_of_week, 1) IS NULL THEN v_day_of_week = v_start_day_of_week
      ELSE v_day_of_week = ANY(p_days_of_week)
    END;
    v_include := CASE p_frequency
      WHEN 'daily' THEN TRUE
      WHEN 'weekly' THEN v_day_match
      WHEN 'biweekly' THEN v_week_index % 2 = 0 AND v_day_match
      ELSE FALSE
    END;

    IF v_include THEN
      SELECT c.id, c.version
      INTO v_existing_cell_id, v_existing_version
      FROM public.schedule_cells c
      WHERE c.org_id = p_org_id
        AND c.emp_id = p_emp_id
        AND c.date = v_current_date
      FOR UPDATE;

      IF NOT FOUND THEN
        v_existing_cell_id := NULL;
        v_existing_version := 0;
      END IF;

      -- What an editor sees in the cell: its draft, else its published state.
      v_existing_kind := NULL;
      IF p_keep_existing
        AND v_existing_cell_id IS NOT NULL
        AND v_current_date IS DISTINCT FROM p_origin_date THEN
        SELECT snapshot.state_kind
        INTO v_existing_kind
        FROM public.schedule_cell_snapshots snapshot
        WHERE snapshot.cell_id = v_existing_cell_id
        ORDER BY (snapshot.snapshot_kind = 'draft') DESC
        LIMIT 1;
      END IF;

      IF v_existing_kind IS NULL OR v_existing_kind = 'deleted' THEN
        PERFORM public.write_schedule_cell_snapshot_internal(
          p_org_id,
          p_emp_id,
          v_current_date,
          'draft',
          v_state.state_kind,
          v_state.shift_ids,
          v_state.job_ids,
          v_state.absence_type_id,
          NULL,
          NULL,
          v_series_id,
          FALSE,
          v_state.focus_area_id,
          v_existing_version,
          auth.uid(),
          v_state.is_mentored_flags
        );
      END IF;

      v_occurrence_count := v_occurrence_count + 1;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_series_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER, BOOLEAN, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shift_series(UUID, UUID, UUID, JSONB, public.shift_series_frequency, SMALLINT[], DATE, DATE, INTEGER, BOOLEAN, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_series_all_shifts(
  p_series_id UUID,
  p_org_id UUID,
  p_state JSONB,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_state RECORD;
  r RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  SELECT *
  INTO v_state
  FROM public.resolve_schedule_state_storage(p_org_id, p_state);

  FOR r IN
    SELECT c.emp_id, c.date, c.version, c.focus_area_id, c.from_recurring
    FROM public.schedule_cells c
    WHERE c.org_id = p_org_id
      AND c.series_id = p_series_id
      AND (p_from_date IS NULL OR c.date >= p_from_date)
      AND (p_to_date IS NULL OR c.date <= p_to_date)
      AND NOT EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots draft
        WHERE draft.cell_id = c.id
          AND draft.snapshot_kind = 'draft'
          AND draft.state_kind = 'deleted'
      )
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      p_org_id,
      r.emp_id,
      r.date,
      'draft',
      v_state.state_kind,
      v_state.shift_ids,
      v_state.job_ids,
      v_state.absence_type_id,
      NULL,
      NULL,
      p_series_id,
      COALESCE(r.from_recurring, FALSE),
      COALESCE(v_state.focus_area_id, r.focus_area_id),
      r.version,
      auth.uid(),
      v_state.is_mentored_flags
    );
  END LOOP;

  IF p_to_date IS NULL THEN
    UPDATE public.shift_series
    SET state = p_state,
        updated_by = auth.uid(),
        updated_at = NOW()
    WHERE org_id = p_org_id
      AND id = p_series_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_series_all_shifts(UUID, UUID, JSONB, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_series_all_shifts(UUID, UUID, JSONB, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_shift_series(
  p_series_id UUID,
  p_org_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS INTEGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_has_published BOOLEAN;
  r RECORD;
BEGIN
  IF NOT public.check_admin_permission_for_org('canManageShiftSeries', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canManageShiftSeries permission';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  FOR r IN
    SELECT id, emp_id, date, version
    FROM public.schedule_cells
    WHERE org_id = p_org_id
      AND series_id = p_series_id
      AND (p_from_date IS NULL OR date >= p_from_date)
      AND (p_to_date IS NULL OR date <= p_to_date)
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.schedule_cell_snapshots snapshot
      WHERE snapshot.cell_id = r.id
        AND snapshot.snapshot_kind = 'published'
    )
    INTO v_has_published;

    IF v_has_published THEN
      PERFORM public.write_schedule_cell_snapshot_internal(
        p_org_id,
        r.emp_id,
        r.date,
        'draft',
        'deleted',
        '{}'::BIGINT[],
        '{}'::BIGINT[],
        NULL,
        NULL,
        NULL,
        NULL,
        FALSE,
        NULL,
        r.version,
        auth.uid()
      );
    ELSE
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    END IF;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  UPDATE public.schedule_cells
  SET series_id = NULL
  WHERE org_id = p_org_id
    AND series_id = p_series_id
    AND (p_from_date IS NULL OR date >= p_from_date)
    AND (p_to_date IS NULL OR date <= p_to_date);

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_cells
    WHERE org_id = p_org_id
      AND series_id = p_series_id
  ) THEN
    UPDATE public.shift_series
    SET archived_at = NOW(),
        updated_by = auth.uid(),
        updated_at = NOW()
    WHERE org_id = p_org_id
      AND id = p_series_id;
  ELSIF p_from_date IS NOT NULL AND p_to_date IS NULL THEN
    UPDATE public.shift_series
    SET end_date = p_from_date - 1,
        updated_by = auth.uid(),
        updated_at = NOW()
    WHERE org_id = p_org_id
      AND id = p_series_id;
  END IF;

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_shift_series(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shift_series(UUID, UUID, DATE, DATE) TO authenticated;
