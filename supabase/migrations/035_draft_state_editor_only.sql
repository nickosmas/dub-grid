-- Audit finding F-09 (2026-09-21 full-project audit, archived with the
-- runtime resilience fix): regular staff must only ever see the published
-- schedule, including their own row. The member read policies on snapshots,
-- segments and notes gated rows on the organization alone, so any member
-- could read draft state through the data API and the Realtime CDC feed.
-- A member now sees published rows only; editors keep drafts through the
-- same permissions the write policies use. Gridmaster policies and the
-- service role are unchanged. A draft_deleted note is a published note
-- pending removal and stays visible.

DROP POLICY IF EXISTS "members_select_schedule_cell_snapshots" ON public.schedule_cell_snapshots;
CREATE POLICY "members_select_schedule_cell_snapshots"
  ON public.schedule_cell_snapshots FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      snapshot_kind = 'published'
      OR public.check_admin_permission('canEditShifts')
    )
  );

DROP POLICY IF EXISTS "members_select_schedule_cell_segments" ON public.schedule_cell_segments;
CREATE POLICY "members_select_schedule_cell_segments"
  ON public.schedule_cell_segments FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      public.check_admin_permission('canEditShifts')
      OR EXISTS (
        SELECT 1
        FROM public.schedule_cell_snapshots AS snapshot
        WHERE snapshot.id = schedule_cell_segments.snapshot_id
          AND snapshot.org_id = schedule_cell_segments.org_id
          AND snapshot.snapshot_kind = 'published'
      )
    )
  );

DROP POLICY IF EXISTS "members_select_notes" ON public.schedule_notes;
CREATE POLICY "members_select_notes"
  ON public.schedule_notes FOR SELECT TO authenticated
  USING (
    org_id = public.caller_org_id()
    AND (
      status <> 'draft'
      OR public.check_admin_permission('canEditShifts')
      OR public.check_admin_permission('canEditNotes')
    )
  );

-- Editors exchange draft diffs on their own private topic so the payload
-- never reaches a viewer's socket. The shared schedule:<org> topic and its
-- policies from 013 are untouched: presence, publish and discard signals
-- still reach every member there.
DROP POLICY IF EXISTS "schedule_editors_receive_draft_realtime" ON realtime.messages;
CREATE POLICY "schedule_editors_receive_draft_realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'schedule:' || organization.id::TEXT || ':drafts'
        AND organization.archived_at IS NULL
        AND organization.suspended_at IS NULL
        AND (
          (
            organization.id = public.caller_org_id()
            AND (
              public.caller_org_role() = 'super_admin'
              OR public.check_admin_permission('canEditShifts')
              OR public.check_admin_permission('canEditNotes')
            )
          )
          OR public.is_own_sandbox_org(organization.id)
        )
    )
  );

DROP POLICY IF EXISTS "schedule_editors_send_draft_realtime" ON realtime.messages;
CREATE POLICY "schedule_editors_send_draft_realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'schedule:' || organization.id::TEXT || ':drafts'
        AND organization.archived_at IS NULL
        AND organization.suspended_at IS NULL
        AND (
          (
            organization.id = public.caller_org_id()
            AND (
              public.caller_org_role() = 'super_admin'
              OR public.check_admin_permission('canEditShifts')
              OR public.check_admin_permission('canEditNotes')
            )
          )
          OR public.is_own_sandbox_org(organization.id)
        )
    )
  );
