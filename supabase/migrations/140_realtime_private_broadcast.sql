-- 140: Realtime invalidation moves from Postgres Changes to private Broadcast
-- topics (F-199, with F-150, F-163 and F-179).
--
-- Postgres Changes cannot apply row-level security or a filter to a DELETE,
-- so every signed-in user subscribed to a published table received the ids of
-- rows deleted in other organizations. Every client only ever used an event
-- to refetch, so the database now tells them which table changed instead, on
-- private topics whose policies below decide who may listen:
--
--   org:<org id>          everyone in the organization
--   org:<org id>:drafts   people who edit its schedule: draft cells, draft
--                         snapshots and draft notes, which nobody else reads
--                         (F-150: staff phones refetched on every draft edit)
--   user:<user id>        that person: their alerts, profile, sessions,
--                         preferences, membership and staff record
--   platform              Gridmasters, for every change
--
-- One message goes per statement, topic and organization, never per row, so a
-- publish that writes a thousand snapshots sends one. A message carries the
-- table and operation and no row data. 141 takes the tables out of the
-- Postgres Changes publication once the apps listen here.
--
-- realtime.send catches its own errors, so a failed send never fails a write.

CREATE OR REPLACE FUNCTION public.broadcast_table_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table TEXT := TG_TABLE_NAME;
  v_rows TEXT;
  v_keys JSONB;
  v_key JSONB;
  v_stamps JSONB;
  v_user_only BOOLEAN := v_table IN (
    'notifications', 'notification_preferences', 'user_sessions', 'profiles'
  );
  v_also_user BOOLEAN := v_table IN ('employees', 'organization_memberships');
  v_message JSONB := jsonb_build_object('table', v_table, 'op', TG_OP);
BEGIN
  v_rows := CASE TG_OP
    WHEN 'INSERT' THEN 'SELECT to_jsonb(n) AS j FROM new_rows n'
    WHEN 'DELETE' THEN 'SELECT to_jsonb(o) AS j FROM old_rows o'
    ELSE 'SELECT to_jsonb(n) AS j FROM new_rows n UNION ALL SELECT to_jsonb(o) FROM old_rows o'
  END;

  -- One key per organization, person and draft or not, across the rows the
  -- statement touched, before and after.
  EXECUTE format(
    $q$
      SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'org', COALESCE(j->>'org_id', j->>'target_org_id', CASE WHEN %1$L = 'organizations' THEN j->>'id' END),
        'user', CASE WHEN %1$L = 'profiles' THEN j->>'id' ELSE j->>'user_id' END,
        'draft', %1$L IN ('schedule_cells', 'schedule_cell_segments')
          OR (%1$L = 'schedule_cell_snapshots' AND j->>'snapshot_kind' = 'draft')
          OR (%1$L = 'schedule_notes' AND j->>'status' IS DISTINCT FROM 'published')
      )), '[]'::jsonb)
      FROM (%2$s) rows
    $q$,
    v_table,
    v_rows
  ) INTO v_keys;

  IF jsonb_array_length(v_keys) = 0 THEN
    RETURN NULL;
  END IF;

  -- Opening Schedule stamps the viewer's membership. When that is all a
  -- statement changed, members are told who and when, so the cached directory
  -- moves its version forward without a refetch, and no permission refetches.
  IF v_table = 'organization_memberships' AND TG_OP = 'UPDATE' THEN
    EXECUTE $q$
      SELECT CASE WHEN bool_and(
          (to_jsonb(n) - 'schedule_last_viewed_at' - 'updated_at')
            = (to_jsonb(o) - 'schedule_last_viewed_at' - 'updated_at')
        )
        THEN jsonb_agg(jsonb_build_object(
          'org_id', n.org_id, 'user_id', n.user_id, 'updated_at', n.updated_at
        ))
      END
      FROM new_rows n JOIN old_rows o ON o.id = n.id
    $q$ INTO v_stamps;
  END IF;

  FOR v_key IN SELECT DISTINCT jsonb_build_object('org', k->>'org', 'draft', (k->>'draft')::BOOLEAN)
    FROM jsonb_array_elements(v_keys) k
    WHERE NOT v_user_only AND k->>'org' IS NOT NULL
  LOOP
    PERFORM realtime.send(
      v_message || jsonb_build_object(
        'scope', CASE WHEN (v_key->>'draft')::BOOLEAN THEN 'drafts' ELSE 'org' END
      ) || COALESCE(
        (SELECT jsonb_build_object('view_stamps', jsonb_agg(s - 'org_id'))
           FROM jsonb_array_elements(v_stamps) s
          WHERE s->>'org_id' = v_key->>'org'),
        '{}'::jsonb
      ),
      'change',
      'org:' || (v_key->>'org') || CASE WHEN (v_key->>'draft')::BOOLEAN THEN ':drafts' ELSE '' END,
      TRUE
    );
  END LOOP;

  IF v_user_only OR (v_also_user AND v_stamps IS NULL) THEN
    FOR v_key IN SELECT DISTINCT k->'user' FROM jsonb_array_elements(v_keys) k
      WHERE k->>'user' IS NOT NULL
    LOOP
      PERFORM realtime.send(
        v_message || jsonb_build_object('scope', 'user'),
        'change',
        'user:' || (v_key #>> '{}'),
        TRUE
      );
    END LOOP;
  END IF;

  PERFORM realtime.send(
    v_message || jsonb_build_object(
      'scope', 'platform',
      'org_ids', (SELECT COALESCE(jsonb_agg(DISTINCT k->>'org'), '[]'::jsonb)
                    FROM jsonb_array_elements(v_keys) k WHERE k->>'org' IS NOT NULL),
      'user_ids', (SELECT COALESCE(jsonb_agg(DISTINCT k->>'user'), '[]'::jsonb)
                     FROM jsonb_array_elements(v_keys) k WHERE k->>'user' IS NOT NULL)
    ),
    'change',
    'platform',
    TRUE
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_table_change() FROM PUBLIC, anon, authenticated;

-- Three statement triggers per table, since a trigger with transition tables
-- fires on one event.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'absence_types', 'audit_log', 'certifications', 'coverage_requirements',
    'departments', 'employees', 'focus_areas', 'impersonation_sessions',
    'indicator_types', 'invitations', 'job_shift_overrides', 'jobs',
    'notification_preferences', 'notifications', 'organization_memberships',
    'organization_roles', 'organizations', 'profile_change_requests', 'profiles',
    'publish_history', 'recurring_shifts', 'schedule_cell_segments',
    'schedule_cell_snapshots', 'schedule_cells', 'schedule_notes',
    'shift_categories', 'shift_requests', 'subscriptions', 'user_sessions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS broadcast_insert ON public.%I', v_table);
    EXECUTE format('DROP TRIGGER IF EXISTS broadcast_update ON public.%I', v_table);
    EXECUTE format('DROP TRIGGER IF EXISTS broadcast_delete ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER broadcast_insert AFTER INSERT ON public.%I
         REFERENCING NEW TABLE AS new_rows
         FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_table_change()',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER broadcast_update AFTER UPDATE ON public.%I
         REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
         FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_table_change()',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER broadcast_delete AFTER DELETE ON public.%I
         REFERENCING OLD TABLE AS old_rows
         FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_table_change()',
      v_table
    );
  END LOOP;
END;
$$;

-- Who may listen. No INSERT policy names these topics, so no client can send
-- on them.
DROP POLICY IF EXISTS "members_receive_org_changes" ON realtime.messages;
CREATE POLICY "members_receive_org_changes"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'org:' || organization.id::TEXT
        AND (
          organization.id = public.caller_org_id()
          OR public.is_own_sandbox_org(organization.id)
          OR public.is_gridmaster()
        )
    )
  );

DROP POLICY IF EXISTS "schedule_editors_receive_draft_changes" ON realtime.messages;
CREATE POLICY "schedule_editors_receive_draft_changes"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND EXISTS (
      SELECT 1
      FROM public.organizations AS organization
      WHERE (SELECT realtime.topic()) = 'org:' || organization.id::TEXT || ':drafts'
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
          OR public.is_gridmaster()
        )
    )
  );

DROP POLICY IF EXISTS "users_receive_own_changes" ON realtime.messages;
CREATE POLICY "users_receive_own_changes"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'user:' || (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS "gridmasters_receive_platform_changes" ON realtime.messages;
CREATE POLICY "gridmasters_receive_platform_changes"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'platform'
    AND public.is_gridmaster()
  );
