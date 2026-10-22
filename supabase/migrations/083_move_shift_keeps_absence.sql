-- 083: Moving or copying a worked cell keeps its rest-of-day absence.
--
-- Since 082 a worked cell may carry an absence for the rest of the day (item
-- 45), such as the Sick in D/E/Sick. `move_shift` still wrote the absence type
-- only for an absence move, so dragging D/E/Sick to another day landed D/E and
-- dropped the Sick. This copies its body from 002 and keeps the absence type
-- for a worked move too. A whole-day absence move is unchanged, and an absence
-- move with segments is still refused.

CREATE OR REPLACE FUNCTION public.move_shift(
  p_org_id            UUID,
  p_source_emp_id     UUID,
  p_source_date       DATE,
  p_target_emp_id     UUID,
  p_target_date       DATE,
  p_kind              TEXT,
  p_shift_ids         BIGINT[],
  p_job_ids           BIGINT[],
  p_absence_type_id   BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time   TEXT DEFAULT NULL,
  p_drag_mode         TEXT DEFAULT 'move',
  p_expected_version  BIGINT DEFAULT NULL,
  p_target_expected_version BIGINT DEFAULT NULL,
  p_target_was_empty  BOOLEAN DEFAULT FALSE,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
) RETURNS JSONB
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_cell public.schedule_cells%ROWTYPE;
  v_target_cell public.schedule_cells%ROWTYPE;
  v_target_found BOOLEAN := FALSE;
  v_target_write_expected_version BIGINT;
  v_lock_key_src  TEXT;
  v_lock_key_tgt  TEXT;
BEGIN
  -- Permission check
  IF NOT public.check_admin_permission_for_org('canEditShifts', p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: missing canEditShifts permission';
  END IF;

  -- Org scoping: caller must belong to p_org_id (gridmaster exempt)
  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  IF p_drag_mode NOT IN ('move', 'copy') THEN
    RAISE EXCEPTION 'Invalid drag mode: %', p_drag_mode;
  END IF;

  IF p_kind NOT IN ('worked', 'absence') THEN
    RAISE EXCEPTION 'Invalid move payload kind: %', p_kind;
  END IF;

  -- Reject no-op self-move
  IF p_source_emp_id = p_target_emp_id AND p_source_date = p_target_date THEN
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  -- Validate target employee is active and belongs to org
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_target_emp_id AND e.org_id = p_org_id
      AND e.status = 'active' AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target employee not found, archived, or inactive';
  END IF;

  -- Advisory locks in deterministic order to prevent deadlocks
  v_lock_key_src := p_source_emp_id::TEXT || '_' || p_source_date::TEXT;
  v_lock_key_tgt := p_target_emp_id::TEXT || '_' || p_target_date::TEXT;

  IF v_lock_key_src < v_lock_key_tgt THEN
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_tgt));
    PERFORM pg_advisory_xact_lock(hashtext('shift_lock_' || v_lock_key_src));
  END IF;

  -- Validate source schedule cell exists and belongs to org
  SELECT *
  INTO v_source_cell
  FROM public.schedule_cells
  WHERE emp_id = p_source_emp_id
    AND date = p_source_date
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source shift not found';
  END IF;

  IF p_kind = 'absence' AND p_absence_type_id IS NULL THEN
    RAISE EXCEPTION 'Absence moves require an absence type';
  END IF;

  IF p_kind = 'worked' AND COALESCE(array_length(p_job_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Worked moves require at least one segment';
  END IF;

  IF COALESCE(array_length(p_is_mentored_flags, 1), 0) NOT IN (0, COALESCE(array_length(p_job_ids, 1), 0)) THEN
    RAISE EXCEPTION 'Mentored segment flag lengths must match shift segment lengths';
  END IF;

  IF p_kind = 'absence' AND (
    array_length(COALESCE(p_shift_ids, '{}'::BIGINT[]), 1) IS NOT NULL
    OR array_length(COALESCE(p_job_ids, '{}'::BIGINT[]), 1) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot move both worked segments and an absence type';
  END IF;

  -- Optimistic lock check
  IF p_expected_version IS NOT NULL AND v_source_cell.version != p_expected_version THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_source_cell.version;
  END IF;

  SELECT *
  INTO v_target_cell
  FROM public.schedule_cells
  WHERE emp_id = p_target_emp_id
    AND date = p_target_date
    AND org_id = p_org_id
  FOR UPDATE;

  v_target_found := FOUND;

  IF p_target_was_empty AND v_target_found THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected empty target, found version %',
      v_target_cell.version;
  END IF;

  IF p_target_expected_version IS NOT NULL THEN
    IF NOT v_target_found AND p_target_expected_version <> 0 THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, NULL;
    END IF;

    IF v_target_found AND v_target_cell.version IS DISTINCT FROM p_target_expected_version THEN
      RAISE EXCEPTION 'Optimistic lock failed: expected target version %, found %',
        p_target_expected_version, v_target_cell.version;
    END IF;
  END IF;

  v_target_write_expected_version := COALESCE(
    p_target_expected_version,
    CASE
      WHEN p_target_was_empty THEN 0
      WHEN v_target_found THEN v_target_cell.version
      ELSE 0
    END
  );

  PERFORM public.write_schedule_cell_snapshot(
    p_org_id,
    p_target_emp_id,
    p_target_date,
    'draft',
    p_kind,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_shift_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_job_ids, '{}'::BIGINT[])
      ELSE '{}'::BIGINT[]
    END,
    CASE
      WHEN p_kind IN ('absence', 'worked') THEN p_absence_type_id
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_start_time
      ELSE NULL
    END,
    CASE
      WHEN p_kind = 'worked' THEN p_custom_end_time
      ELSE NULL
    END,
    NULL,
    FALSE,
    v_source_cell.focus_area_id,
    v_target_write_expected_version,
    CASE
      WHEN p_kind = 'worked' THEN COALESCE(p_is_mentored_flags, '{}'::BOOLEAN[])
      ELSE '{}'::BOOLEAN[]
    END
  );

  -- Delete source only for real moves. Copies leave the origin untouched.
  IF p_drag_mode = 'move' THEN
    PERFORM public.delete_schedule_cell_draft(
      p_org_id,
      p_source_emp_id,
      p_source_date,
      p_expected_version
    );
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
