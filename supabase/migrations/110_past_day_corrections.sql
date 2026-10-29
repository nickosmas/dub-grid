-- 110: Past-day corrections (item 53a).
--
-- A manager can fix a day that has already happened: the published cell for
-- one person on one past day changes at once, with a reason, and nothing else
-- moves. No publish happens, so nobody is alerted and Publish History stays
-- as each publish left it; the change is kept in its own record with Before,
-- After, the reason and who made it. It needs Edit shifts and Publish
-- schedule; a day more than 14 days ago needs a Super Admin (owner decisions,
-- 2026-10-28).
--
-- A correction may write a day the person can't be scheduled on today but
-- could have worked then, such as a day before they went Away, so the
-- schedulable-employee trigger asks that question for a published write to a
-- past day. And the cell-save function stops writing published cells: until
-- now anyone with Edit shifts could publish a cell through it directly.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.schedule_cell_corrections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  emp_id        UUID NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  reason        TEXT NOT NULL
    CHECK (reason IN ('called_off', 'left_early', 'swapped', 'wrong_shift', 'other')),
  note          TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  before        JSONB,
  after         JSONB,
  corrected_by  UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  corrected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reason <> 'other' OR note IS NOT NULL)
);

COMMENT ON TABLE public.schedule_cell_corrections IS
  'One row per past-day correction (53a): the published cell before and after, why, and who made it. Written only by correct_schedule_cell.';

CREATE INDEX IF NOT EXISTS idx_schedule_cell_corrections_org_date
  ON public.schedule_cell_corrections (org_id, date);
CREATE INDEX IF NOT EXISTS idx_schedule_cell_corrections_emp_date
  ON public.schedule_cell_corrections (org_id, emp_id, date);

ALTER TABLE public.schedule_cell_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schedule_cell_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.schedule_cell_corrections TO authenticated;

DROP POLICY IF EXISTS "editors_select_schedule_cell_corrections"
  ON public.schedule_cell_corrections;
CREATE POLICY "editors_select_schedule_cell_corrections"
  ON public.schedule_cell_corrections FOR SELECT TO authenticated
  USING (public.check_admin_permission_for_org('canEditShifts', org_id));

-- Whether someone could have been scheduled on a day, asked about a day that
-- has passed: not offboarded, on or after their first day, and when Away
-- now, before the day they went away (the organization's date of
-- status_changed_at) or from their return date. Suspension never blocks a
-- day. employee_schedulable_on answers for today's rules instead.
CREATE OR REPLACE FUNCTION public.employee_could_work_on(p_emp_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.organizations o ON o.id = e.org_id
    WHERE e.id = p_emp_id
      AND p_date IS NOT NULL
      AND isfinite(p_date)
      AND e.archived_at IS NULL
      AND (e.first_day IS NULL OR p_date >= e.first_day)
      AND (
        e.status = 'active'
        OR (
          e.status = 'inactive'
          AND (
            p_date < (e.status_changed_at AT TIME ZONE COALESCE(o.timezone, 'UTC'))::DATE
            OR p_date >= e.away_until
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.employee_could_work_on(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- A Super Admin of the organization, or a Gridmaster impersonating it: the
-- only people who may correct a day more than 14 days ago.
CREATE OR REPLACE FUNCTION public.caller_is_super_admin_for_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (public.is_gridmaster() AND public.caller_impersonates_org(p_org_id))
    OR (
      (public.caller_org_id() = p_org_id OR public.is_own_sandbox_org(p_org_id))
      AND public.caller_org_role()::TEXT = 'super_admin'
    ),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.caller_is_super_admin_for_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_super_admin_for_org(UUID) TO authenticated;

-- 100's trigger, with a published write to a past day checked against the
-- day itself: allowed when they could have worked it then or can be
-- scheduled on it now. Every other write is checked as before.
CREATE OR REPLACE FUNCTION public.refuse_unschedulable_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_date DATE;
  v_published BOOLEAN := FALSE;
  v_today DATE;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'schedule_cell_snapshots' THEN
      IF NEW.state_kind = 'deleted' THEN
        RETURN NEW;
      END IF;
      SELECT c.emp_id, c.date INTO v_emp_id, v_date
      FROM public.schedule_cells c
      WHERE c.id = NEW.cell_id;
      IF NEW.state_kind = 'absence'
        AND NEW.absence_start_time IS NULL
        AND public.is_away_absence_day(v_emp_id, v_date, NEW.absence_type_id)
      THEN
        RETURN NEW;
      END IF;
      v_published := NEW.snapshot_kind = 'published';
    WHEN 'schedule_cell_segments' THEN
      SELECT c.emp_id, c.date, s.snapshot_kind = 'published'
      INTO v_emp_id, v_date, v_published
      FROM public.schedule_cell_snapshots s
      JOIN public.schedule_cells c ON c.id = s.cell_id
      WHERE s.id = NEW.snapshot_id;
    WHEN 'shift_requests' THEN
      v_emp_id := NEW.requester_emp_id;
      v_date := LEAST(NEW.requester_shift_date, NEW.target_shift_date);
    ELSE
      IF NEW.archived_at IS NOT NULL THEN
        RETURN NEW;
      END IF;
      v_emp_id := NEW.emp_id;
      v_date := 'infinity'::DATE;
  END CASE;

  IF v_emp_id IS NULL OR public.employee_schedulable_on(v_emp_id, v_date) THEN
    RETURN NEW;
  END IF;

  IF v_published THEN
    SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'UTC'))::DATE
    INTO v_today
    FROM public.employees e
    JOIN public.organizations o ON o.id = e.org_id
    WHERE e.id = v_emp_id;
    IF v_date < v_today AND public.employee_could_work_on(v_emp_id, v_date) THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Employee not found, archived, or inactive'
    USING ERRCODE = 'check_violation';
END;
$$;

-- Corrects one person's published day. The cell arguments are
-- write_schedule_cell_snapshot's; p_reason is one of the table's reasons and
-- p_note is required for 'other'. Returns the cell's new version.
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
  p_reason TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_note TEXT := NULLIF(btrim(p_note), '');
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

  IF p_reason IS NULL
    OR p_reason NOT IN ('called_off', 'left_early', 'swapped', 'wrong_shift', 'other')
  THEN
    RAISE EXCEPTION 'Correction not allowed: pick a reason';
  END IF;

  IF p_reason = 'other' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Correction not allowed: say what happened';
  END IF;

  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Correction not allowed: the note is longer than 500 characters';
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
    org_id, emp_id, date, reason, note, before, after, corrected_by
  ) VALUES (
    p_org_id, p_emp_id, p_date, p_reason, v_note, v_before, v_after, v_actor_id
  );

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_schedule_cell(
  UUID, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN[],
  TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_schedule_cell(
  UUID, UUID, DATE, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, BIGINT, BIGINT, BOOLEAN[],
  TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- The cell-save function writes drafts only. Publishing, approvals and
-- corrections write published cells through write_schedule_cell_snapshot_internal.
-- Renamed once; a second run (the migration's own test) finds it done.
DO $$
BEGIN
  IF to_regprocedure(
    'public.write_schedule_cell_snapshot_any_kind(uuid, uuid, date, text, text, bigint[], '
    'bigint[], bigint, text, text, uuid, boolean, bigint, bigint, boolean[], text, text, boolean)'
  ) IS NULL THEN
    ALTER FUNCTION public.write_schedule_cell_snapshot(
      UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT,
      BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
    ) RENAME TO write_schedule_cell_snapshot_any_kind;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.write_schedule_cell_snapshot_any_kind(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT,
  BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_schedule_cell_snapshot(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_shift_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_job_ids BIGINT[] DEFAULT '{}'::BIGINT[],
  p_absence_type_id BIGINT DEFAULT NULL,
  p_custom_start_time TEXT DEFAULT NULL,
  p_custom_end_time TEXT DEFAULT NULL,
  p_series_id UUID DEFAULT NULL,
  p_from_recurring BOOLEAN DEFAULT FALSE,
  p_focus_area_id BIGINT DEFAULT NULL,
  p_expected_version BIGINT DEFAULT NULL,
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[],
  p_absence_start_time TEXT DEFAULT NULL,
  p_absence_end_time TEXT DEFAULT NULL,
  p_allow_untimed_absence BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_snapshot_kind IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published cells are written by publishing, approvals and corrections';
  END IF;
  RETURN public.write_schedule_cell_snapshot_any_kind(
    p_org_id, p_emp_id, p_date, p_snapshot_kind, p_state_kind, p_shift_ids, p_job_ids,
    p_absence_type_id, p_custom_start_time, p_custom_end_time, p_series_id, p_from_recurring,
    p_focus_area_id, p_expected_version, p_is_mentored_flags, p_absence_start_time,
    p_absence_end_time, p_allow_untimed_absence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.write_schedule_cell_snapshot(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT,
  BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_schedule_cell_snapshot(
  UUID, UUID, DATE, TEXT, TEXT, BIGINT[], BIGINT[], BIGINT, TEXT, TEXT, UUID, BOOLEAN, BIGINT,
  BIGINT, BOOLEAN[], TEXT, TEXT, BOOLEAN
) TO authenticated;
