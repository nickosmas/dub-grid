-- A schedule cell shows "Custom time" whenever custom_start_time and
-- custom_end_time are set; nothing compared them with the segment's own
-- default. Staffing an open shift on the web wrote the resolved default into
-- those columns, so every assignment made that way looked deliberately
-- retimed. The client no longer sends a default as custom; this makes the
-- database refuse to store one, whichever caller sends it, and repairs the
-- rows already written that way.
--
-- normalize_schedule_custom_times blanks a per-segment slot only when both
-- its start and end equal the default resolved by
-- resolve_work_assignment_time_ranges (job/shift override, then the job's
-- own time for a shiftless segment, then the shift category). A slot where
-- only one end differs is a real edit and is kept. Slots beyond the segment
-- list and values that are not a time are left alone.

CREATE OR REPLACE FUNCTION public.normalize_schedule_custom_times(
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_custom_start TEXT,
  p_custom_end TEXT,
  OUT custom_start TEXT,
  OUT custom_end TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment_count INTEGER := COALESCE(array_length(p_job_ids, 1), 0);
  v_starts TEXT[];
  v_ends TEXT[];
  v_slot_count INTEGER;
  v_idx INTEGER;
  v_start TEXT;
  v_end TEXT;
  v_default_start TIME;
  v_default_end TIME;
BEGIN
  custom_start := p_custom_start;
  custom_end := p_custom_end;
  IF (p_custom_start IS NULL AND p_custom_end IS NULL) OR v_segment_count = 0 THEN
    RETURN;
  END IF;

  v_starts := string_to_array(COALESCE(p_custom_start, ''), '|');
  v_ends := string_to_array(COALESCE(p_custom_end, ''), '|');
  v_slot_count := GREATEST(
    COALESCE(array_length(v_starts, 1), 0),
    COALESCE(array_length(v_ends, 1), 0)
  );

  FOR v_idx IN 1..v_slot_count LOOP
    v_starts[v_idx] := COALESCE(v_starts[v_idx], '');
    v_ends[v_idx] := COALESCE(v_ends[v_idx], '');
    v_start := NULLIF(TRIM(v_starts[v_idx]), '');
    v_end := NULLIF(TRIM(v_ends[v_idx]), '');
    IF v_idx > v_segment_count OR v_start IS NULL OR v_end IS NULL THEN
      CONTINUE;
    END IF;
    IF v_start !~ '^\d{1,2}:\d{2}(:\d{2})?$' OR v_end !~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
      CONTINUE;
    END IF;

    SELECT range.start_time, range.end_time
    INTO v_default_start, v_default_end
    FROM public.resolve_work_assignment_time_ranges(p_shift_ids, p_job_ids, NULL, NULL) AS range
    WHERE range.segment_position = v_idx;

    IF FOUND
      AND v_default_start IS NOT NULL
      AND v_default_end IS NOT NULL
      AND v_start::TIME = v_default_start
      AND v_end::TIME = v_default_end
    THEN
      v_starts[v_idx] := '';
      v_ends[v_idx] := '';
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM unnest(v_starts) AS value WHERE value <> '')
    OR EXISTS (SELECT 1 FROM unnest(v_ends) AS value WHERE value <> '')
  THEN
    custom_start := array_to_string(v_starts, '|');
    custom_end := array_to_string(v_ends, '|');
  ELSE
    custom_start := NULL;
    custom_end := NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_schedule_custom_times(BIGINT[], BIGINT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- Same signature and body as 002, plus the normalization for worked cells.
-- Every snapshot write (web upserts, moves, series, recurring, imports,
-- publish, request approvals) goes through here.

CREATE OR REPLACE FUNCTION public.sync_schedule_cell_snapshot(
  p_cell_id UUID,
  p_org_id UUID,
  p_snapshot_kind TEXT,
  p_state_kind TEXT,
  p_absence_type_id BIGINT,
  p_custom_start_time TEXT,
  p_custom_end_time TEXT,
  p_shift_ids BIGINT[],
  p_job_ids BIGINT[],
  p_is_mentored_flags BOOLEAN[] DEFAULT '{}'::BOOLEAN[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_segment_count INTEGER;
  v_index INTEGER;
  v_custom_start_time TEXT := p_custom_start_time;
  v_custom_end_time TEXT := p_custom_end_time;
BEGIN
  IF p_state_kind IS NULL THEN
    DELETE FROM public.schedule_cell_snapshots
    WHERE cell_id = p_cell_id
      AND snapshot_kind = p_snapshot_kind;
    RETURN;
  END IF;

  IF p_state_kind = 'worked' THEN
    SELECT normalized.custom_start, normalized.custom_end
    INTO v_custom_start_time, v_custom_end_time
    FROM public.normalize_schedule_custom_times(
      p_shift_ids,
      p_job_ids,
      p_custom_start_time,
      p_custom_end_time
    ) AS normalized;
  END IF;

  INSERT INTO public.schedule_cell_snapshots (
    cell_id,
    org_id,
    snapshot_kind,
    state_kind,
    absence_type_id,
    custom_start_time,
    custom_end_time
  )
  VALUES (
    p_cell_id,
    p_org_id,
    p_snapshot_kind,
    p_state_kind,
    p_absence_type_id,
    v_custom_start_time,
    v_custom_end_time
  )
  ON CONFLICT (cell_id, snapshot_kind)
  DO UPDATE SET
    org_id = EXCLUDED.org_id,
    state_kind = EXCLUDED.state_kind,
    absence_type_id = EXCLUDED.absence_type_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time,
    updated_at = now()
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.schedule_cell_segments
  WHERE snapshot_id = v_snapshot_id;

  IF p_state_kind <> 'worked' THEN
    RETURN;
  END IF;

  v_segment_count := COALESCE(array_length(p_job_ids, 1), 0);
  IF v_segment_count <= 0 THEN
    RETURN;
  END IF;

  FOR v_index IN 1..v_segment_count LOOP
    INSERT INTO public.schedule_cell_segments (
      snapshot_id,
      org_id,
      position,
      shift_id,
      job_id,
      is_mentored
    )
    VALUES (
      v_snapshot_id,
      p_org_id,
      v_index - 1,
      p_shift_ids[v_index],
      p_job_ids[v_index],
      COALESCE(p_is_mentored_flags[v_index], false)
    );
  END LOOP;
END;
$$;

-- Repair rows already written with a default stored as custom. Draft and
-- published snapshots are both repaired so the change badges do not light
-- up from the repair alone. The IS DISTINCT FROM guard makes a rerun a no-op.

WITH resolved AS (
  SELECT
    snapshot.id,
    normalized.custom_start,
    normalized.custom_end
  FROM public.schedule_cell_snapshots AS snapshot
  CROSS JOIN LATERAL (
    SELECT
      array_agg(segment.shift_id ORDER BY segment.position) AS shift_ids,
      array_agg(segment.job_id ORDER BY segment.position) AS job_ids
    FROM public.schedule_cell_segments AS segment
    WHERE segment.snapshot_id = snapshot.id
  ) AS segments
  CROSS JOIN LATERAL public.normalize_schedule_custom_times(
    segments.shift_ids,
    segments.job_ids,
    snapshot.custom_start_time,
    snapshot.custom_end_time
  ) AS normalized
  WHERE snapshot.state_kind = 'worked'
    AND (snapshot.custom_start_time IS NOT NULL OR snapshot.custom_end_time IS NOT NULL)
)
UPDATE public.schedule_cell_snapshots AS snapshot
SET custom_start_time = resolved.custom_start,
    custom_end_time = resolved.custom_end,
    updated_at = now()
FROM resolved
WHERE snapshot.id = resolved.id
  AND (
    snapshot.custom_start_time IS DISTINCT FROM resolved.custom_start
    OR snapshot.custom_end_time IS DISTINCT FROM resolved.custom_end
  );
