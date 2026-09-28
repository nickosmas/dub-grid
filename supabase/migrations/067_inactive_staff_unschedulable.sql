-- Only active staff can be scheduled, and billing counts only them.
--
-- The RPCs that write a schedule cell already refuse an inactive or removed
-- employee, but series updates, recurring templates, requests and direct
-- table writes (RLS checks permission, not the person) did not. One trigger
-- per table now refuses any write that would schedule a non-active person;
-- clearing (a `deleted` state) and archiving always pass, so leftovers can
-- still be removed.

CREATE OR REPLACE FUNCTION public.refuse_unschedulable_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'schedule_cell_snapshots' THEN
      IF NEW.state_kind = 'deleted' THEN
        RETURN NEW;
      END IF;
      SELECT c.emp_id INTO v_emp_id
      FROM public.schedule_cells c
      WHERE c.id = NEW.cell_id;
    WHEN 'schedule_cell_segments' THEN
      SELECT c.emp_id INTO v_emp_id
      FROM public.schedule_cell_snapshots s
      JOIN public.schedule_cells c ON c.id = s.cell_id
      WHERE s.id = NEW.snapshot_id;
    WHEN 'shift_requests' THEN
      v_emp_id := NEW.requester_emp_id;
    ELSE
      IF NEW.archived_at IS NOT NULL THEN
        RETURN NEW;
      END IF;
      v_emp_id := NEW.emp_id;
  END CASE;

  IF v_emp_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = v_emp_id
      AND e.status = 'active'
      AND e.archived_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Employee not found, archived, or inactive'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_unschedulable_employee() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_schedule_cell_snapshots_schedulable
  BEFORE INSERT OR UPDATE ON public.schedule_cell_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.refuse_unschedulable_employee();

CREATE OR REPLACE TRIGGER trg_schedule_cell_segments_schedulable
  BEFORE INSERT OR UPDATE ON public.schedule_cell_segments
  FOR EACH ROW EXECUTE FUNCTION public.refuse_unschedulable_employee();

CREATE OR REPLACE TRIGGER trg_recurring_shifts_schedulable
  BEFORE INSERT OR UPDATE ON public.recurring_shifts
  FOR EACH ROW EXECUTE FUNCTION public.refuse_unschedulable_employee();

CREATE OR REPLACE TRIGGER trg_shift_series_schedulable
  BEFORE INSERT OR UPDATE ON public.shift_series
  FOR EACH ROW EXECUTE FUNCTION public.refuse_unschedulable_employee();

-- Requests are gated on insert only: an existing request must still be able
-- to expire, be cancelled or be settled after its requester leaves.
CREATE OR REPLACE TRIGGER trg_shift_requests_requester_schedulable
  BEFORE INSERT ON public.shift_requests
  FOR EACH ROW EXECUTE FUNCTION public.refuse_unschedulable_employee();

-- Leaving clears what is ahead and keeps what happened. From the
-- organization's today on, a draft-only cell goes and a published shift
-- becomes a pending removal, so the next publish shows the gap. Before today,
-- only unpublished drafts are discarded: the gate above means publish could
-- never carry them. Templates and series are archived and open requests
-- expire. Reactivating restores none of it. The pending removals are credited
-- to the caller, or to `p_actor_id` for a service-role write, so they appear
-- under that editor's drafts at publish.
CREATE OR REPLACE FUNCTION public.clear_schedule_for_departed_employee(
  p_emp_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today DATE;
  v_actor_id UUID := COALESCE(auth.uid(), p_actor_id);
  r RECORD;
BEGIN
  SELECT e.org_id, (now() AT TIME ZONE o.timezone)::DATE
  INTO v_org_id, v_today
  FROM public.employees e
  JOIN public.organizations o ON o.id = e.org_id
  WHERE e.id = p_emp_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Id order, as publish_schedule and discard_schedule_drafts lock cells.
  FOR r IN
    SELECT
      c.id,
      c.date,
      EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'published'
      ) AS has_published,
      (
        SELECT s.state_kind
        FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id
          AND s.snapshot_kind = 'draft'
      ) AS draft_state
    FROM public.schedule_cells c
    WHERE c.org_id = v_org_id
      AND c.emp_id = p_emp_id
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    IF NOT r.has_published THEN
      DELETE FROM public.schedule_cells
      WHERE id = r.id;
    ELSIF r.date >= v_today THEN
      IF r.draft_state IS DISTINCT FROM 'deleted' THEN
        UPDATE public.schedule_cells
        SET version = version + 1,
            updated_by = v_actor_id,
            updated_at = now()
        WHERE id = r.id;

        PERFORM public.sync_schedule_cell_snapshot(
          r.id, v_org_id, 'draft', 'deleted', NULL, NULL, NULL,
          '{}'::BIGINT[], '{}'::BIGINT[], '{}'::BOOLEAN[]
        );
      END IF;
    ELSIF r.draft_state IS NOT NULL AND r.draft_state <> 'deleted' THEN
      DELETE FROM public.schedule_cell_snapshots
      WHERE cell_id = r.id
        AND snapshot_kind = 'draft';
    END IF;
  END LOOP;

  UPDATE public.recurring_shifts
  SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
  WHERE org_id = v_org_id
    AND emp_id = p_emp_id
    AND archived_at IS NULL;

  UPDATE public.shift_series
  SET archived_at = now(), updated_by = v_actor_id, updated_at = now()
  WHERE org_id = v_org_id
    AND emp_id = p_emp_id
    AND archived_at IS NULL;

  UPDATE public.shift_requests
  SET status = 'expired', resolved_at = now(), updated_at = now()
  WHERE org_id = v_org_id
    AND (requester_emp_id = p_emp_id OR target_emp_id = p_emp_id)
    AND status IN ('open', 'pending_approval');
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_for_departed_employee(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clear_schedule_on_employee_departure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The status routes write with the service client and name the actor in
  -- updated_by.
  PERFORM public.clear_schedule_for_departed_employee(NEW.id, NEW.updated_by);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_schedule_on_employee_departure() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_clear_schedule_on_employee_departure
  AFTER UPDATE OF status, archived_at ON public.employees
  FOR EACH ROW
  WHEN (
    OLD.status = 'active' AND OLD.archived_at IS NULL
    AND (NEW.status <> 'active' OR NEW.archived_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.clear_schedule_on_employee_departure();

-- Staff who left before this migration get the same clearing once.
DO $$
DECLARE
  v_emp_id UUID;
BEGIN
  FOR v_emp_id IN
    SELECT e.id
    FROM public.employees e
    WHERE e.status <> 'active' OR e.archived_at IS NOT NULL
    ORDER BY e.id
  LOOP
    PERFORM public.clear_schedule_for_departed_employee(v_emp_id);
  END LOOP;
END;
$$;
