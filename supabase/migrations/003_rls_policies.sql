-- ============================================================================
-- Migration 003: Row Level Security Policies
--
-- Pattern: gridmaster bypass → member SELECT → admin/super_admin WRITE
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ENABLE RLS ON ALL TABLES
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicator_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jwt_refresh_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_shifts_draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_history ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. PROFILES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "org_member_profiles_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.caller_org_id()
  );

CREATE POLICY "admin_profiles_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND platform_role = 'none'
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ORGANIZATIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.caller_org_id());

CREATE POLICY "admin_update_organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    id = public.caller_org_id()
    AND public.caller_org_role() = 'super_admin'
  )
  WITH CHECK (id = public.caller_org_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ORGANIZATION MEMBERSHIPS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_memberships"
  ON public.organization_memberships FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

CREATE POLICY "own_memberships_select"
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_memberships_select"
  ON public.organization_memberships FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "super_admin_insert_memberships"
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'super_admin'
  );

CREATE POLICY "super_admin_update_memberships"
  ON public.organization_memberships FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'super_admin'
  )
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "super_admin_delete_memberships"
  ON public.organization_memberships FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role() = 'super_admin'
    AND user_id != auth.uid()  -- prevent super_admin from deleting their own membership
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. STANDARD ORG-SCOPED TABLES (gridmaster ALL + member SELECT + admin CRUD)
--    Applies to: organization_roles, focus_areas, certifications, employees,
--                shift_categories, shift_codes, schedule_notes,
--                schedule_draft_sessions
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper macro pattern: each table gets the same 5 policies

-- ── organization_roles ────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_organization_roles"
  ON public.organization_roles FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_organization_roles"
  ON public.organization_roles FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_organization_roles"
  ON public.organization_roles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin');

CREATE POLICY "admin_update_organization_roles"
  ON public.organization_roles FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin')
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_organization_roles"
  ON public.organization_roles FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin');


-- ── focus_areas ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_focus_areas"
  ON public.focus_areas FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_focus_areas"
  ON public.focus_areas FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_focus_areas"
  ON public.focus_areas FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageFocusAreas'));

CREATE POLICY "admin_update_focus_areas"
  ON public.focus_areas FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageFocusAreas'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_focus_areas"
  ON public.focus_areas FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageFocusAreas'));


-- ── certifications ────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_certifications"
  ON public.certifications FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_certifications"
  ON public.certifications FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_certifications"
  ON public.certifications FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin');

CREATE POLICY "admin_update_certifications"
  ON public.certifications FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin')
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_certifications"
  ON public.certifications FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.caller_org_role() = 'super_admin');


-- ── employees ─────────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_employees"
  ON public.employees FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageEmployees'));

CREATE POLICY "admin_update_employees"
  ON public.employees FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageEmployees'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_employees"
  ON public.employees FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageEmployees'));


-- ── shift_categories ──────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_categories"
  ON public.shift_categories FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_shift_categories"
  ON public.shift_categories FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_shift_categories"
  ON public.shift_categories FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));

CREATE POLICY "admin_update_shift_categories"
  ON public.shift_categories FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_shift_categories"
  ON public.shift_categories FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));


-- ── shift_codes ───────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_codes"
  ON public.shift_codes FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_shift_codes"
  ON public.shift_codes FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_shift_codes"
  ON public.shift_codes FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));

CREATE POLICY "admin_update_shift_codes"
  ON public.shift_codes FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_shift_codes"
  ON public.shift_codes FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));


-- ── absence_types ──────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_absence_types"
  ON public.absence_types FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_absence_types"
  ON public.absence_types FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_absence_types"
  ON public.absence_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));

CREATE POLICY "admin_update_absence_types"
  ON public.absence_types FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_absence_types"
  ON public.absence_types FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageShiftCodes'));


-- ── schedule_notes ────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_notes"
  ON public.schedule_notes FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_notes"
  ON public.schedule_notes FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canEditNotes'));

CREATE POLICY "admin_update_notes"
  ON public.schedule_notes FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canEditNotes'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_notes"
  ON public.schedule_notes FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canEditNotes'));


-- ── schedule_draft_sessions ───────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_draft_sessions"
  ON public.schedule_draft_sessions FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_draft_sessions"
  ON public.schedule_draft_sessions FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_draft_sessions"
  ON public.schedule_draft_sessions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canEditShifts'));

CREATE POLICY "admin_update_draft_sessions"
  ON public.schedule_draft_sessions FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canEditShifts'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_draft_sessions"
  ON public.schedule_draft_sessions FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canEditShifts'));


-- ── recurring_shifts_draft_sessions ─────────────────────────────────────────

CREATE POLICY "gridmaster_all_recurring_drafts"
  ON public.recurring_shifts_draft_sessions FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_recurring_drafts"
  ON public.recurring_shifts_draft_sessions FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_recurring_drafts"
  ON public.recurring_shifts_draft_sessions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageRecurringShifts'));

CREATE POLICY "admin_update_recurring_drafts"
  ON public.recurring_shifts_draft_sessions FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageRecurringShifts'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_recurring_drafts"
  ON public.recurring_shifts_draft_sessions FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageRecurringShifts'));


-- ── publish_history ──────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_publish_history"
  ON public.publish_history FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_publish_history"
  ON public.publish_history FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. SHIFTS (employee-scoped — uses EXISTS subquery for org check)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_insert_shifts"
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (
    public.check_admin_permission('canEditShifts')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id
        AND e.org_id = public.caller_org_id()
        AND e.status IN ('active', 'benched')
        AND e.archived_at IS NULL
    )
  );

CREATE POLICY "admin_update_shifts"
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    public.check_admin_permission('canEditShifts')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id
        AND e.org_id = public.caller_org_id()
        AND e.status IN ('active', 'benched')
        AND e.archived_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = emp_id
        AND e.org_id = public.caller_org_id()
    )
  );

CREATE POLICY "admin_delete_shifts"
  ON public.shifts FOR DELETE TO authenticated
  USING (
    public.check_admin_permission('canEditShifts')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shifts.emp_id AND e.org_id = public.caller_org_id()
    )
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. REGULAR_SHIFTS & SHIFT_SERIES (gridmaster OR org admin)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── recurring_shifts ────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_recurring_shifts"
  ON public.recurring_shifts FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "recurring_shifts_select"
  ON public.recurring_shifts FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "recurring_shifts_insert"
  ON public.recurring_shifts FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageRecurringShifts')
  );

CREATE POLICY "recurring_shifts_update"
  ON public.recurring_shifts FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageRecurringShifts')
  );

CREATE POLICY "recurring_shifts_delete"
  ON public.recurring_shifts FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageRecurringShifts')
  );

-- ── shift_series ──────────────────────────────────────────────────────────────

CREATE POLICY "gridmaster_all_shift_series"
  ON public.shift_series FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "shift_series_select"
  ON public.shift_series FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageShiftSeries')
  );

CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageShiftSeries')
  );

CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageShiftSeries')
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. INDICATOR TYPES (gridmaster ALL + member SELECT + admin ALL)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_indicator_types"
  ON public.indicator_types FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admins_manage_indicator_types"
  ON public.indicator_types FOR ALL TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageIndicatorTypes')
  )
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.check_admin_permission('canManageIndicatorTypes')
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 9. INVITATIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_invitations"
  ON public.invitations FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "invitations_select"
  ON public.invitations FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT IN ('admin', 'super_admin')
  );

CREATE POLICY "invitations_insert"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT = 'super_admin'
  );

CREATE POLICY "invitations_revoke"
  ON public.invitations FOR UPDATE TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND public.caller_org_role()::TEXT = 'super_admin'
    AND accepted_at IS NULL
  )
  WITH CHECK (revoked_at IS NOT NULL);


-- ══════════════════════════════════════════════════════════════════════════════
-- 10. ROLE CHANGE LOG (immutable — no UPDATE/DELETE policies)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "audit_insert"
  ON public.role_change_log FOR INSERT TO authenticated
  WITH CHECK (
    public.caller_org_role() = 'super_admin'
    OR public.is_gridmaster()
  );

CREATE POLICY "audit_select"
  ON public.role_change_log FOR SELECT TO authenticated
  USING (
    public.is_gridmaster()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = target_user_id AND org_id = public.caller_org_id()
    )
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 11. JWT REFRESH LOCKS (own locks only — hook bypasses RLS as postgres)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "own_locks_only"
  ON public.jwt_refresh_locks FOR ALL TO authenticated
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- 12. IMPERSONATION SESSIONS (gridmaster only)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "gridmaster_all_impersonation"
  ON public.impersonation_sessions FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

COMMENT ON POLICY "gridmaster_all_impersonation" ON public.impersonation_sessions
  IS 'Only gridmasters can view and manage impersonation sessions';


-- ══════════════════════════════════════════════════════════════════════════════
-- 13. USER SESSIONS (own sessions only)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "own_sessions_only"
  ON public.user_sessions
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════════════
-- 14. COVERAGE REQUIREMENTS
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.coverage_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gridmaster_all_coverage_requirements"
  ON public.coverage_requirements FOR ALL TO authenticated
  USING (public.is_gridmaster()) WITH CHECK (public.is_gridmaster());

CREATE POLICY "members_select_coverage_requirements"
  ON public.coverage_requirements FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id());

CREATE POLICY "admin_insert_coverage_requirements"
  ON public.coverage_requirements FOR INSERT TO authenticated
  WITH CHECK (org_id = public.caller_org_id() AND public.check_admin_permission('canManageCoverageRequirements'));

CREATE POLICY "admin_update_coverage_requirements"
  ON public.coverage_requirements FOR UPDATE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageCoverageRequirements'))
  WITH CHECK (org_id = public.caller_org_id());

CREATE POLICY "admin_delete_coverage_requirements"
  ON public.coverage_requirements FOR DELETE TO authenticated
  USING (org_id = public.caller_org_id() AND public.check_admin_permission('canManageCoverageRequirements'));


-- ══════════════════════════════════════════════════════════════════════════════
-- 15. SHIFT REQUESTS (org members can read; all mutations via SECURITY DEFINER RPCs)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_requests_select"
  ON public.shift_requests FOR SELECT TO authenticated
  USING (org_id = public.caller_org_id() OR public.is_gridmaster());

-- INSERT/UPDATE blocked for direct client access. All mutations go through
-- SECURITY DEFINER functions (create_shift_request, respond_to_shift_request,
-- resolve_shift_request, cancel_shift_request) which bypass RLS.
CREATE POLICY "shift_requests_insert"
  ON public.shift_requests FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "shift_requests_update"
  ON public.shift_requests FOR UPDATE TO authenticated
  USING (FALSE);


-- ══════════════════════════════════════════════════════════════════════════════
-- 16. NOTIFICATIONS (own notifications only; system-generated via SECURITY DEFINER)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "own_notifications_select"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update (mark read) their own notifications
CREATE POLICY "own_notifications_update"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Gridmaster can read all notifications (for support/debugging)
CREATE POLICY "gridmaster_all_notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());

-- No direct INSERT policy — notifications are system-generated via SECURITY DEFINER functions


