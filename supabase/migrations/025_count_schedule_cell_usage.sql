-- Delete-dependency checks used to pull every schedule cell of the
-- organization, with nested snapshots and segments, to answer "is this job,
-- shift or absence type used anywhere?" (finding F-55). This answers it with
-- one count. Cells of archived employees do not count, matching the previous
-- in-memory filter. Service-role only: the settings route scopes the
-- organization before calling it.

CREATE OR REPLACE FUNCTION public.count_schedule_cell_usage(
  p_org_id UUID,
  p_shift_id BIGINT DEFAULT NULL,
  p_job_id BIGINT DEFAULT NULL,
  p_absence_type_id BIGINT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT count(DISTINCT c.id)::integer
  FROM public.schedule_cells c
  JOIN public.employees e ON e.id = c.emp_id AND e.archived_at IS NULL
  JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
  LEFT JOIN public.schedule_cell_segments g ON g.snapshot_id = s.id
  WHERE c.org_id = p_org_id
    AND (
      (p_shift_id IS NOT NULL AND g.shift_id = p_shift_id)
      OR (p_job_id IS NOT NULL AND g.job_id = p_job_id)
      OR (p_absence_type_id IS NOT NULL AND s.absence_type_id = p_absence_type_id)
    );
$$;

REVOKE ALL ON FUNCTION public.count_schedule_cell_usage(UUID, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_schedule_cell_usage(UUID, BIGINT, BIGINT, BIGINT) TO service_role;
