-- Durable, owner-only schedule editor termination tombstones. This migration
-- is idempotent so environments that received the canonical schema first and
-- existing environments converge on the same protected table.

CREATE TABLE IF NOT EXISTS public.schedule_editor_session_terminations (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  editor_session_id            UUID NOT NULL,
  ended_by_editor_session_id   UUID NOT NULL,
  ended_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, user_id, editor_session_id),
  CONSTRAINT schedule_editor_termination_not_self
    CHECK (editor_session_id <> ended_by_editor_session_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_editor_terminations_owner
  ON public.schedule_editor_session_terminations(user_id, org_id, ended_at DESC);

ALTER TABLE public.schedule_editor_session_terminations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_schedule_editor_terminations"
  ON public.schedule_editor_session_terminations;
CREATE POLICY "users_select_own_schedule_editor_terminations"
  ON public.schedule_editor_session_terminations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND org_id = public.caller_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE organization.id = schedule_editor_session_terminations.org_id
        AND organization.archived_at IS NULL
        AND organization.suspended_at IS NULL
    )
  );

DROP POLICY IF EXISTS "schedule_editors_end_own_editor_sessions"
  ON public.schedule_editor_session_terminations;
CREATE POLICY "schedule_editors_end_own_editor_sessions"
  ON public.schedule_editor_session_terminations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND org_id = public.caller_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE organization.id = schedule_editor_session_terminations.org_id
        AND organization.archived_at IS NULL
        AND organization.suspended_at IS NULL
    )
    AND (
      public.caller_org_role() = 'super_admin'
      OR public.check_admin_permission('canEditShifts')
      OR public.check_admin_permission('canEditNotes')
    )
  );

DROP POLICY IF EXISTS "schedule_members_receive_realtime" ON realtime.messages;
CREATE POLICY "schedule_members_receive_realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'schedule:' || organization.id::TEXT
        AND organization.archived_at IS NULL
        AND organization.suspended_at IS NULL
        AND (
          organization.id = public.caller_org_id()
          OR public.is_own_sandbox_org(organization.id)
        )
    )
  );

DROP POLICY IF EXISTS "schedule_editors_send_realtime" ON realtime.messages;
CREATE POLICY "schedule_editors_send_realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'schedule:' || organization.id::TEXT
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

GRANT SELECT, INSERT ON TABLE public.schedule_editor_session_terminations TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.schedule_editor_session_terminations FROM authenticated;
GRANT ALL ON TABLE public.schedule_editor_session_terminations TO service_role;
