-- Requests read an overnight shift by its real times (2026-10-25).
--
-- 094 made a cell's own shifts overlap by real times, so Early 6 AM - 2 PM
-- and Night 11 PM - 7 AM are a valid double. Requests still folded the
-- night's morning onto the day it starts, so a pickup, claim, volunteer or
-- swap of that pair was refused. Two checks change:
--
-- work_assignment_times_overlap compares two people's shifts on the same date
-- (every caller passes one date), now as minutes from that day's midnight with
-- an overnight end on the next day. The next-day clash stays the adjacent-day
-- check's job.
--
-- rest_of_day_absence_conflict's arrived-late branch compares the absence
-- with the shift taken the same way. An arrived-late absence starts at the
-- work's scheduled start, on that date, so it runs forward from the same
-- midnight, including 11 PM - 1 AM beside a night shift.
--
-- absence_times_overlap_work (092) deliberately keeps folding by clock. It
-- also checks an absence against its own cell's work at save, where a
-- left-early absence on a night shift (work 11 PM - 3 AM, absence 3 AM - 7 AM)
-- really is on the next day.
--
-- Both functions are restated from their latest bodies (002 and 093) with
-- only those parts changed. CREATE OR REPLACE keeps their grants.

CREATE OR REPLACE FUNCTION public.work_assignment_times_overlap(
  p_shift_ids_a      BIGINT[],
  p_job_ids_a        BIGINT[],
  p_custom_start_a   TEXT,
  p_custom_end_a     TEXT,
  p_shift_ids_b      BIGINT[],
  p_job_ids_b        BIGINT[],
  p_custom_start_b   TEXT,
  p_custom_end_b     TEXT
) RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH a AS (
    SELECT EXTRACT(EPOCH FROM r.start_time) / 60 AS start_minute,
      EXTRACT(EPOCH FROM r.end_time) / 60
        + CASE WHEN r.end_time <= r.start_time THEN 1440 ELSE 0 END AS end_minute
    FROM public.resolve_work_assignment_time_ranges(
      p_shift_ids_a,
      p_job_ids_a,
      p_custom_start_a,
      p_custom_end_a
    ) r
  ),
  b AS (
    SELECT EXTRACT(EPOCH FROM r.start_time) / 60 AS start_minute,
      EXTRACT(EPOCH FROM r.end_time) / 60
        + CASE WHEN r.end_time <= r.start_time THEN 1440 ELSE 0 END AS end_minute
    FROM public.resolve_work_assignment_time_ranges(
      p_shift_ids_b,
      p_job_ids_b,
      p_custom_start_b,
      p_custom_end_b
    ) r
  )
  SELECT EXISTS (
    SELECT 1
    FROM a
    CROSS JOIN b
    WHERE a.start_minute < b.end_minute
      AND b.start_minute < a.end_minute
  );
$$;

CREATE OR REPLACE FUNCTION public.rest_of_day_absence_conflict(
  p_org_id UUID,
  p_emp_id UUID,
  p_date DATE,
  p_taken_shift_ids BIGINT[],
  p_taken_job_ids BIGINT[],
  p_taken_custom_start TEXT,
  p_taken_custom_end TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cell RECORD;
  v_work_start INTEGER;
  v_work_end INTEGER;
  v_work_minutes INTEGER;
  v_absence_start INTEGER;
  v_absence_end INTEGER;
  v_starts_after INTEGER;
  v_ends_before INTEGER;
BEGIN
  SELECT * INTO v_cell
  FROM public.get_schedule_cell_snapshot_payload(p_org_id, p_emp_id, p_date, 'published');
  IF NOT FOUND OR v_cell.state_kind IS DISTINCT FROM 'worked' OR v_cell.absence_type_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_cell.absence_start_time IS NULL OR v_cell.absence_end_time IS NULL THEN
    RETURN 'for the rest of that day';
  END IF;

  -- The work's span, first start to last end, in minutes after midnight.
  SELECT (EXTRACT(HOUR FROM w.start_time) * 60 + EXTRACT(MINUTE FROM w.start_time))::INTEGER
  INTO v_work_start
  FROM public.resolve_work_assignment_time_ranges(
    COALESCE(v_cell.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_cell.job_ids, '{}'::BIGINT[]),
    v_cell.custom_start_time,
    v_cell.custom_end_time
  ) w
  ORDER BY w.segment_position
  LIMIT 1;
  SELECT (EXTRACT(HOUR FROM w.end_time) * 60 + EXTRACT(MINUTE FROM w.end_time))::INTEGER
  INTO v_work_end
  FROM public.resolve_work_assignment_time_ranges(
    COALESCE(v_cell.shift_ids, '{}'::BIGINT[]),
    COALESCE(v_cell.job_ids, '{}'::BIGINT[]),
    v_cell.custom_start_time,
    v_cell.custom_end_time
  ) w
  ORDER BY w.segment_position DESC
  LIMIT 1;
  IF v_work_start IS NULL OR v_work_end IS NULL THEN
    RETURN 'for the rest of that day';
  END IF;

  -- The side rule the apps use (schedule-core absenceSideOf): left early when
  -- the absence starts within the work's span or nearer its end.
  v_work_minutes := ((v_work_end - v_work_start) % 1440 + 1440) % 1440;
  IF v_work_minutes = 0 THEN
    v_work_minutes := 1440;
  END IF;
  v_absence_start := (EXTRACT(HOUR FROM v_cell.absence_start_time::TIME) * 60
    + EXTRACT(MINUTE FROM v_cell.absence_start_time::TIME))::INTEGER;
  v_absence_end := (EXTRACT(HOUR FROM v_cell.absence_end_time::TIME) * 60
    + EXTRACT(MINUTE FROM v_cell.absence_end_time::TIME))::INTEGER;
  v_starts_after := ((v_absence_start - v_work_start) % 1440 + 1440) % 1440;
  IF v_starts_after <= v_work_minutes THEN
    RETURN 'for the rest of that day';
  END IF;
  v_ends_before := ((v_work_start - v_absence_end) % 1440 + 1440) % 1440;
  IF v_ends_before >= v_starts_after - v_work_minutes THEN
    RETURN 'for the rest of that day';
  END IF;

  -- Arrived late: only a shift the absence overlaps is out, both read from
  -- that day's midnight with an overnight end on the next day.
  IF EXISTS (
    SELECT 1
    FROM public.resolve_work_assignment_time_ranges(
      COALESCE(p_taken_shift_ids, '{}'::BIGINT[]),
      COALESCE(p_taken_job_ids, '{}'::BIGINT[]),
      p_taken_custom_start,
      p_taken_custom_end
    ) w
    WHERE EXTRACT(EPOCH FROM w.start_time) / 60
        < v_absence_end + CASE WHEN v_absence_end <= v_absence_start THEN 1440 ELSE 0 END
      AND v_absence_start
        < EXTRACT(EPOCH FROM w.end_time) / 60
          + CASE WHEN w.end_time <= w.start_time THEN 1440 ELSE 0 END
  ) THEN
    RETURN 'during that shift';
  END IF;
  RETURN NULL;
END;
$$;
