-- 112: A correction's reason is typed and optional (item 53c).
--
-- 110 asked for one of five fixed reasons, and a note for Other. The owner's
-- call (2026-10-28) is a reason typed in, or none: the reason column now
-- holds that text (1 to 500 characters, or NULL), and the note column goes.
-- A row 110 wrote keeps its reason as the label it was picked by, with its
-- note after it.
SET lock_timeout = '5s';

ALTER TABLE public.schedule_cell_corrections
  DROP CONSTRAINT IF EXISTS schedule_cell_corrections_check,
  DROP CONSTRAINT IF EXISTS schedule_cell_corrections_reason_check,
  ALTER COLUMN reason DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schedule_cell_corrections'
      AND column_name = 'note'
  ) THEN
    UPDATE public.schedule_cell_corrections
    SET reason = left(
      concat_ws(
        ': ',
        CASE reason
          WHEN 'called_off' THEN 'Called off'
          WHEN 'left_early' THEN 'Left early'
          WHEN 'swapped' THEN 'Swapped with someone'
          WHEN 'wrong_shift' THEN 'Wrong shift recorded'
          WHEN 'other' THEN NULL
          ELSE reason
        END,
        note
      ),
      500
    );
    UPDATE public.schedule_cell_corrections SET reason = NULL WHERE reason = '';
    ALTER TABLE public.schedule_cell_corrections DROP COLUMN note;
  END IF;
END;
$$;

ALTER TABLE public.schedule_cell_corrections
  DROP CONSTRAINT IF EXISTS schedule_cell_corrections_reason_length;
ALTER TABLE public.schedule_cell_corrections
  ADD CONSTRAINT schedule_cell_corrections_reason_length
  CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500);

COMMENT ON COLUMN public.schedule_cell_corrections.reason IS
  'Why the day was corrected, as typed (112); NULL when none was given.';

DROP FUNCTION IF EXISTS public.correct_schedule_cell(
  UUID, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN[],
  TEXT, TEXT, TEXT, TEXT
);

-- 110's correction, with the reason typed and optional.
CREATE OR REPLACE FUNCTION public.correct_schedule_cell(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_today DATE;
  v_cell public.schedule_cells%ROWTYPE;
  v_before JSONB;
  v_after JSONB;
  v_version BIGINT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Correction not allowed: no signed-in user';
  END IF;

  IF NOT (
    public.check_admin_permission_for_org('canEditShifts', p_org_id)
    AND public.check_admin_permission_for_org('canPublishSchedule', p_org_id)
  ) THEN
    RAISE EXCEPTION 'Correction not allowed: it needs Edit shifts and Publish schedule';
  END IF;

  IF NOT public.is_authorized_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: org mismatch';
  END IF;

  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'UTC'))::DATE
  INTO v_today
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF p_date IS NULL OR v_today IS NULL OR p_date >= v_today THEN
    RAISE EXCEPTION 'Correction not allowed: only a day before today can be corrected';
  END IF;

  IF p_date < v_today - 14 AND NOT public.caller_is_super_admin_for_org(p_org_id) THEN
    RAISE EXCEPTION 'Correction not allowed: a day more than 14 days ago needs a Super Admin';
  END IF;

  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Correction not allowed: the reason is longer than 500 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_emp_id AND e.org_id = p_org_id
  ) OR NOT public.employee_could_work_on(p_emp_id, p_date) THEN
    RAISE EXCEPTION 'Correction not allowed: they couldn''t have worked that day';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('schedule_cell_' || p_emp_id::TEXT || '_' || p_date::TEXT));

  SELECT * INTO v_cell
  FROM public.schedule_cells
  WHERE org_id = p_org_id AND emp_id = p_emp_id AND date = p_date
  FOR UPDATE;

  IF p_expected_version IS NOT NULL
    AND COALESCE(v_cell.version, 0) IS DISTINCT FROM p_expected_version
  THEN
    RAISE EXCEPTION 'Optimistic lock failed: expected version %, found %',
      p_expected_version, v_cell.version;
  END IF;

  -- publish_history keeps only an organization's newest rows, so a day whose
  -- range was trimmed still counts when its cell holds a published state.
  IF NOT EXISTS (
    SELECT 1 FROM public.publish_history h
    WHERE h.org_id = p_org_id AND p_date BETWEEN h.start_date AND h.end_date
  ) AND NOT EXISTS (
    SELECT 1 FROM public.schedule_cell_snapshots s
    WHERE s.cell_id = v_cell.id AND s.org_id = p_org_id AND s.snapshot_kind = 'published'
  ) THEN
    RAISE EXCEPTION 'Correction not allowed: this day was never published';
  END IF;

  SELECT to_jsonb(payload) INTO v_before
  FROM public.get_schedule_cell_snapshot_payload(p_org_id, p_emp_id, p_date, 'published') payload
  LIMIT 1;

  -- An approval does the same (086): an older draft must not be published
  -- over the correction later.
  PERFORM public.discard_schedule_cell_draft_internal(p_org_id, p_emp_id, p_date, v_actor_id);

  v_version := public.write_schedule_cell_snapshot_internal(
    p_org_id,
    p_emp_id,
    p_date,
    'published',
    p_state_kind,
    p_shift_ids,
    p_job_ids,
    p_absence_type_id,
    p_custom_start_time,
    p_custom_end_time,
    NULL,
    FALSE,
    p_focus_area_id,
    NULL,
    v_actor_id,
    p_is_mentored_flags,
    p_absence_start_time,
    p_absence_end_time
  );

  SELECT to_jsonb(payload) INTO v_after
  FROM public.get_schedule_cell_snapshot_payload(p_org_id, p_emp_id, p_date, 'published') payload
  LIMIT 1;

  INSERT INTO public.schedule_cell_corrections (
    org_id, emp_id, date, reason, before, after, corrected_by
  ) VALUES (
    p_org_id, p_emp_id, p_date, v_reason, v_before, v_after, v_actor_id
  );

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_schedule_cell(
  UUID, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN[],
  TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_schedule_cell(
  UUID, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN[],
  TEXT, TEXT, TEXT
) TO authenticated;
