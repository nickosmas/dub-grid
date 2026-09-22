-- Audit finding F-08 (2026-09-21 full-project audit, archived with the
-- runtime resilience fix): members_select_employees gates rows, not columns,
-- so any member could read a colleague's contact details through the data
-- API and in the Realtime payload, although every application path masks
-- them unless the caller holds canViewEmployeeDetails or canManageEmployees.
-- Those four columns are read through the service role in the routes, so
-- the member grant drops them. The 004 table grant covers every column and
-- a column-level revoke cannot narrow it, so the table privilege goes and
-- only the readable columns come back. Policy expressions may reference a
-- column the caller cannot select, so the row policies are unchanged, and a
-- column added later is not granted by default.
REVOKE SELECT ON public.employees FROM authenticated;
GRANT SELECT (
  id,
  org_id,
  employee_number,
  first_name,
  last_name,
  seniority,
  certification_id,
  role_ids,
  focus_area_ids,
  employment_type,
  status,
  status_changed_at,
  archived_at,
  created_by,
  updated_by,
  created_at,
  updated_at,
  user_id,
  department_ids,
  dept_admin_ids,
  version
) ON public.employees TO authenticated;
