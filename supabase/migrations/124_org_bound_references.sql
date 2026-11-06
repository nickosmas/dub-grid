-- 124: A row's references stay inside its organization.
--
-- Audit finding F-192: org_id was checked on each row, but 30 foreign keys
-- between organization tables named only the other row's id, so nothing tied a
-- link to the same organization. A Super Admin could plant a cell for another
-- organization's employee, which then blocked that organization's own save
-- through schedule_cells_emp_id_date_key. With the employee link composite, a
-- cell can't name a foreign employee, so that index needs no change: its
-- ON CONFLICT callers keep working.
--
-- The three links to profiles aren't changed: a profile has no single
-- organization. ON DELETE SET NULL names its column because org_id is NOT NULL.
--
-- VALIDATE aborts this whole migration on an existing cross-organization row,
-- which is the moment to look at that row rather than a reason to skip it.

-- org_id never changes once written. F-190 moved rows between organizations
-- with a service-role update, which no policy sees. profiles.org_id is a default
-- organization, not ownership, so it and the nullable log tables are left out.
CREATE OR REPLACE FUNCTION public.refuse_org_id_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'A row cannot move to another organization.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_org_id_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnotnull
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_refuse_org_id_change BEFORE UPDATE OF org_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.refuse_org_id_change()',
      v_table
    );
  END LOOP;
END;
$$;

-- A Test Sandbox's clone copied these two ids from its source organization.
UPDATE public.employees AS e
SET away_absence_type_id = NULL
FROM public.organizations AS o, public.absence_types AS a
WHERE o.id = e.org_id
  AND o.workspace_kind = 'sandbox'
  AND a.id = e.away_absence_type_id
  AND a.org_id <> e.org_id;

UPDATE public.employees AS e
SET planned_absence_type_id = NULL
FROM public.organizations AS o, public.absence_types AS a
WHERE o.id = e.org_id
  AND o.workspace_kind = 'sandbox'
  AND a.id = e.planned_absence_type_id
  AND a.org_id <> e.org_id;

CREATE UNIQUE INDEX IF NOT EXISTS absence_types_org_id_id_key ON public.absence_types (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS certifications_org_id_id_key ON public.certifications (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_id_id_key ON public.departments (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_id_id_key ON public.employees (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS focus_areas_org_id_id_key ON public.focus_areas (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS indicator_types_org_id_id_key ON public.indicator_types (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_org_id_id_key ON public.jobs (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS publish_history_org_id_id_key ON public.publish_history (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS shift_categories_org_id_id_key ON public.shift_categories (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS shift_requests_org_id_id_key ON public.shift_requests (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS shift_series_org_id_id_key ON public.shift_series (org_id, id);

ALTER TABLE public.calendar_feed_tokens
  DROP CONSTRAINT calendar_feed_tokens_employee_id_fkey,
  ADD CONSTRAINT calendar_feed_tokens_employee_id_org_fkey FOREIGN KEY (org_id, employee_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.coverage_requirements
  DROP CONSTRAINT coverage_requirements_focus_area_id_fkey,
  ADD CONSTRAINT coverage_requirements_focus_area_id_org_fkey FOREIGN KEY (org_id, focus_area_id)
    REFERENCES public.focus_areas (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.coverage_requirements
  DROP CONSTRAINT coverage_requirements_job_id_fkey,
  ADD CONSTRAINT coverage_requirements_job_id_org_fkey FOREIGN KEY (org_id, job_id)
    REFERENCES public.jobs (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.coverage_requirements
  DROP CONSTRAINT coverage_requirements_preferred_shift_id_fkey,
  ADD CONSTRAINT coverage_requirements_preferred_shift_id_org_fkey FOREIGN KEY (org_id, preferred_shift_id)
    REFERENCES public.shift_categories (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.employee_job_preferences
  DROP CONSTRAINT employee_job_preferences_employee_id_fkey,
  ADD CONSTRAINT employee_job_preferences_employee_id_org_fkey FOREIGN KEY (org_id, employee_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.employee_shift_preferences
  DROP CONSTRAINT employee_shift_preferences_employee_id_fkey,
  ADD CONSTRAINT employee_shift_preferences_employee_id_org_fkey FOREIGN KEY (org_id, employee_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.employees
  DROP CONSTRAINT employees_away_absence_type_id_fkey,
  ADD CONSTRAINT employees_away_absence_type_id_org_fkey FOREIGN KEY (org_id, away_absence_type_id)
    REFERENCES public.absence_types (org_id, id) ON DELETE SET NULL (away_absence_type_id) NOT VALID;
ALTER TABLE public.employees
  DROP CONSTRAINT employees_certification_id_fkey,
  ADD CONSTRAINT employees_certification_id_org_fkey FOREIGN KEY (org_id, certification_id)
    REFERENCES public.certifications (org_id, id) ON DELETE SET NULL (certification_id) NOT VALID;
ALTER TABLE public.employees
  DROP CONSTRAINT employees_planned_absence_type_id_fkey,
  ADD CONSTRAINT employees_planned_absence_type_id_org_fkey FOREIGN KEY (org_id, planned_absence_type_id)
    REFERENCES public.absence_types (org_id, id) ON DELETE SET NULL (planned_absence_type_id) NOT VALID;
ALTER TABLE public.focus_areas
  DROP CONSTRAINT focus_areas_department_id_fkey,
  ADD CONSTRAINT focus_areas_department_id_org_fkey FOREIGN KEY (org_id, department_id)
    REFERENCES public.departments (org_id, id) ON DELETE SET NULL (department_id) NOT VALID;
ALTER TABLE public.invitations
  DROP CONSTRAINT invitations_employee_id_fkey,
  ADD CONSTRAINT invitations_employee_id_org_fkey FOREIGN KEY (org_id, employee_id)
    REFERENCES public.employees (org_id, id) ON DELETE SET NULL (employee_id) NOT VALID;
ALTER TABLE public.job_shift_overrides
  DROP CONSTRAINT job_shift_overrides_job_id_fkey,
  ADD CONSTRAINT job_shift_overrides_job_id_org_fkey FOREIGN KEY (org_id, job_id)
    REFERENCES public.jobs (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.job_shift_overrides
  DROP CONSTRAINT job_shift_overrides_shift_id_fkey,
  ADD CONSTRAINT job_shift_overrides_shift_id_org_fkey FOREIGN KEY (org_id, shift_id)
    REFERENCES public.shift_categories (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.profile_change_requests
  DROP CONSTRAINT profile_change_requests_requester_employee_id_fkey,
  ADD CONSTRAINT profile_change_requests_requester_employee_id_org_fkey FOREIGN KEY (org_id, requester_employee_id)
    REFERENCES public.employees (org_id, id) ON DELETE SET NULL (requester_employee_id) NOT VALID;
ALTER TABLE public.recurring_shifts
  DROP CONSTRAINT recurring_shifts_emp_id_fkey,
  ADD CONSTRAINT recurring_shifts_emp_id_org_fkey FOREIGN KEY (org_id, emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.schedule_cell_corrections
  DROP CONSTRAINT schedule_cell_corrections_emp_id_fkey,
  ADD CONSTRAINT schedule_cell_corrections_emp_id_org_fkey FOREIGN KEY (org_id, emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.schedule_cell_snapshots
  DROP CONSTRAINT schedule_cell_snapshots_absence_type_id_fkey,
  ADD CONSTRAINT schedule_cell_snapshots_absence_type_id_org_fkey FOREIGN KEY (org_id, absence_type_id)
    REFERENCES public.absence_types (org_id, id) ON DELETE SET NULL (absence_type_id) NOT VALID;
ALTER TABLE public.schedule_cells
  DROP CONSTRAINT schedule_cells_emp_id_fkey,
  ADD CONSTRAINT schedule_cells_emp_id_org_fkey FOREIGN KEY (org_id, emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.schedule_cells
  DROP CONSTRAINT schedule_cells_focus_area_id_fkey,
  ADD CONSTRAINT schedule_cells_focus_area_id_org_fkey FOREIGN KEY (org_id, focus_area_id)
    REFERENCES public.focus_areas (org_id, id) ON DELETE SET NULL (focus_area_id) NOT VALID;
ALTER TABLE public.schedule_cells
  DROP CONSTRAINT schedule_cells_series_id_fkey,
  ADD CONSTRAINT schedule_cells_series_id_org_fkey FOREIGN KEY (org_id, series_id)
    REFERENCES public.shift_series (org_id, id) ON DELETE SET NULL (series_id) NOT VALID;
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT schedule_notes_emp_id_fkey,
  ADD CONSTRAINT schedule_notes_emp_id_org_fkey FOREIGN KEY (org_id, emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT schedule_notes_focus_area_id_fkey,
  ADD CONSTRAINT schedule_notes_focus_area_id_org_fkey FOREIGN KEY (org_id, focus_area_id)
    REFERENCES public.focus_areas (org_id, id) ON DELETE SET NULL (focus_area_id) NOT VALID;
ALTER TABLE public.schedule_notes
  DROP CONSTRAINT schedule_notes_indicator_type_id_fkey,
  ADD CONSTRAINT schedule_notes_indicator_type_id_org_fkey FOREIGN KEY (org_id, indicator_type_id)
    REFERENCES public.indicator_types (org_id, id) NOT VALID;
ALTER TABLE public.schedule_publish_changes
  DROP CONSTRAINT schedule_publish_changes_publish_history_id_fkey,
  ADD CONSTRAINT schedule_publish_changes_publish_history_id_org_fkey FOREIGN KEY (org_id, publish_history_id)
    REFERENCES public.publish_history (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.shift_categories
  DROP CONSTRAINT shift_categories_focus_area_id_fkey,
  ADD CONSTRAINT shift_categories_focus_area_id_org_fkey FOREIGN KEY (org_id, focus_area_id)
    REFERENCES public.focus_areas (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.shift_requests
  DROP CONSTRAINT shift_requests_absence_type_id_fkey,
  ADD CONSTRAINT shift_requests_absence_type_id_org_fkey FOREIGN KEY (org_id, absence_type_id)
    REFERENCES public.absence_types (org_id, id) ON DELETE SET NULL (absence_type_id) NOT VALID;
ALTER TABLE public.shift_requests
  DROP CONSTRAINT shift_requests_parent_request_id_fkey,
  ADD CONSTRAINT shift_requests_parent_request_id_org_fkey FOREIGN KEY (org_id, parent_request_id)
    REFERENCES public.shift_requests (org_id, id) ON DELETE SET NULL (parent_request_id) NOT VALID;
ALTER TABLE public.shift_requests
  DROP CONSTRAINT shift_requests_requester_emp_id_fkey,
  ADD CONSTRAINT shift_requests_requester_emp_id_org_fkey FOREIGN KEY (org_id, requester_emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.shift_requests
  DROP CONSTRAINT shift_requests_target_emp_id_fkey,
  ADD CONSTRAINT shift_requests_target_emp_id_org_fkey FOREIGN KEY (org_id, target_emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE SET NULL (target_emp_id) NOT VALID;
ALTER TABLE public.shift_series
  DROP CONSTRAINT shift_series_emp_id_fkey,
  ADD CONSTRAINT shift_series_emp_id_org_fkey FOREIGN KEY (org_id, emp_id)
    REFERENCES public.employees (org_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.calendar_feed_tokens VALIDATE CONSTRAINT calendar_feed_tokens_employee_id_org_fkey;
ALTER TABLE public.coverage_requirements VALIDATE CONSTRAINT coverage_requirements_focus_area_id_org_fkey;
ALTER TABLE public.coverage_requirements VALIDATE CONSTRAINT coverage_requirements_job_id_org_fkey;
ALTER TABLE public.coverage_requirements VALIDATE CONSTRAINT coverage_requirements_preferred_shift_id_org_fkey;
ALTER TABLE public.employee_job_preferences VALIDATE CONSTRAINT employee_job_preferences_employee_id_org_fkey;
ALTER TABLE public.employee_shift_preferences VALIDATE CONSTRAINT employee_shift_preferences_employee_id_org_fkey;
ALTER TABLE public.employees VALIDATE CONSTRAINT employees_away_absence_type_id_org_fkey;
ALTER TABLE public.employees VALIDATE CONSTRAINT employees_certification_id_org_fkey;
ALTER TABLE public.employees VALIDATE CONSTRAINT employees_planned_absence_type_id_org_fkey;
ALTER TABLE public.focus_areas VALIDATE CONSTRAINT focus_areas_department_id_org_fkey;
ALTER TABLE public.invitations VALIDATE CONSTRAINT invitations_employee_id_org_fkey;
ALTER TABLE public.job_shift_overrides VALIDATE CONSTRAINT job_shift_overrides_job_id_org_fkey;
ALTER TABLE public.job_shift_overrides VALIDATE CONSTRAINT job_shift_overrides_shift_id_org_fkey;
ALTER TABLE public.profile_change_requests VALIDATE CONSTRAINT profile_change_requests_requester_employee_id_org_fkey;
ALTER TABLE public.recurring_shifts VALIDATE CONSTRAINT recurring_shifts_emp_id_org_fkey;
ALTER TABLE public.schedule_cell_corrections VALIDATE CONSTRAINT schedule_cell_corrections_emp_id_org_fkey;
ALTER TABLE public.schedule_cell_snapshots VALIDATE CONSTRAINT schedule_cell_snapshots_absence_type_id_org_fkey;
ALTER TABLE public.schedule_cells VALIDATE CONSTRAINT schedule_cells_emp_id_org_fkey;
ALTER TABLE public.schedule_cells VALIDATE CONSTRAINT schedule_cells_focus_area_id_org_fkey;
ALTER TABLE public.schedule_cells VALIDATE CONSTRAINT schedule_cells_series_id_org_fkey;
ALTER TABLE public.schedule_notes VALIDATE CONSTRAINT schedule_notes_emp_id_org_fkey;
ALTER TABLE public.schedule_notes VALIDATE CONSTRAINT schedule_notes_focus_area_id_org_fkey;
ALTER TABLE public.schedule_notes VALIDATE CONSTRAINT schedule_notes_indicator_type_id_org_fkey;
ALTER TABLE public.schedule_publish_changes VALIDATE CONSTRAINT schedule_publish_changes_publish_history_id_org_fkey;
ALTER TABLE public.shift_categories VALIDATE CONSTRAINT shift_categories_focus_area_id_org_fkey;
ALTER TABLE public.shift_requests VALIDATE CONSTRAINT shift_requests_absence_type_id_org_fkey;
ALTER TABLE public.shift_requests VALIDATE CONSTRAINT shift_requests_parent_request_id_org_fkey;
ALTER TABLE public.shift_requests VALIDATE CONSTRAINT shift_requests_requester_emp_id_org_fkey;
ALTER TABLE public.shift_requests VALIDATE CONSTRAINT shift_requests_target_emp_id_org_fkey;
ALTER TABLE public.shift_series VALIDATE CONSTRAINT shift_series_emp_id_org_fkey;

-- schedule_cell_segments has no foreign key to its shift or job, and a shift or
-- job may later be removed while a segment records it. So this refuses only an
-- id another organization owns.
CREATE OR REPLACE FUNCTION public.refuse_foreign_segment_reference()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.shift_categories
    WHERE id = NEW.shift_id AND org_id <> NEW.org_id
  ) OR EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = NEW.job_id AND org_id <> NEW.org_id
  ) THEN
    RAISE EXCEPTION 'A shift or job from another organization cannot be scheduled here.'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_foreign_segment_reference()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refuse_foreign_segment_reference
  BEFORE INSERT OR UPDATE OF org_id, shift_id, job_id ON public.schedule_cell_segments
  FOR EACH ROW EXECUTE FUNCTION public.refuse_foreign_segment_reference();

-- A department id has to be this organization's, not merely exist.
CREATE OR REPLACE FUNCTION public.validate_department_ids()
RETURNS TRIGGER
LANGUAGE PLPGSQL AS $$
BEGIN
  IF NEW.department_ids != '{}' THEN
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.department_ids) AS did
      WHERE did NOT IN (
        SELECT id FROM public.departments
        WHERE archived_at IS NULL AND org_id = NEW.org_id
      )
    ) THEN
      RAISE EXCEPTION 'Invalid department_ids: one or more department IDs do not exist or are archived';
    END IF;
  END IF;
  -- Auto-prune dept_admin_ids to stay a subset of department_ids
  IF NEW.dept_admin_ids != '{}' THEN
    NEW.dept_admin_ids := ARRAY(
      SELECT aid FROM unnest(NEW.dept_admin_ids) AS aid
      WHERE aid = ANY(NEW.department_ids)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- A staff member could file a change request naming a coworker's record, which
-- an approval then applied to the coworker.
DROP POLICY "own_profile_change_requests_insert" ON public.profile_change_requests;
CREATE POLICY "own_profile_change_requests_insert"
  ON public.profile_change_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    AND org_id = public.caller_org_id()
    AND status = 'pending'
    AND resolver_user_id IS NULL
    AND resolved_at IS NULL
    AND cancelled_at IS NULL
    AND (
      requester_employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.employees AS e
        WHERE e.id = requester_employee_id
          AND e.org_id = public.caller_org_id()
          AND e.user_id = auth.uid()
      )
    )
  );
