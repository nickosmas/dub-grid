-- 111: Past days are corrected, not drafted (item 53b).
--
-- A day before today is finished: it changes through a correction (110),
-- never through the draft. The two functions every single-day draft write
-- goes through refuse a day before the organization's today: the cell save
-- (paste, the edit panel, recurring fills, Auto-build, and the target of a
-- move) and the cell clear (bulk delete, the context menu, and the source of
-- a move). Series and import plan whole spans and are kept to today and later
-- by the page; a series can't start from a past cell, which opens for a
-- correction instead.
SET lock_timeout = '5s';

-- The organization's calendar day now.
CREATE OR REPLACE FUNCTION public.org_today(p_org_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'UTC'))::DATE
  FROM public.organizations o
  WHERE o.id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.org_today(UUID) FROM PUBLIC, anon, authenticated;

-- 110's draft-only wrapper, with a day before today refused.
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
  IF p_date < public.org_today(p_org_id) THEN
    RAISE EXCEPTION 'Past days are corrected, not drafted';
  END IF;
  RETURN public.write_schedule_cell_snapshot_any_kind(
    p_org_id, p_emp_id, p_date, p_snapshot_kind, p_state_kind, p_shift_ids, p_job_ids,
    p_absence_type_id, p_custom_start_time, p_custom_end_time, p_series_id, p_from_recurring,
    p_focus_area_id, p_expected_version, p_is_mentored_flags, p_absence_start_time,
    p_absence_end_time, p_allow_untimed_absence
  );
END;
$$;

-- The cell clear, renamed once and wrapped the same way.
DO $$
BEGIN
  IF to_regprocedure('public.delete_schedule_cell_draft_any_day(uuid, uuid, date, bigint)') IS NULL
  THEN
    ALTER FUNCTION public.delete_schedule_cell_draft(UUID, UUID, DATE, BIGINT)
      RENAME TO delete_schedule_cell_draft_any_day;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_schedule_cell_draft_any_day(UUID, UUID, DATE, BIGINT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_schedule_cell_draft(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_expected_version BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_date < public.org_today(p_org_id) THEN
    RAISE EXCEPTION 'Past days are corrected, not drafted';
  END IF;
  RETURN public.delete_schedule_cell_draft_any_day(p_org_id, p_emp_id, p_date, p_expected_version);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_schedule_cell_draft(UUID, UUID, DATE, BIGINT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_schedule_cell_draft(UUID, UUID, DATE, BIGINT)
  TO authenticated;
