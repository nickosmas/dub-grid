-- 142: A deleted organization is gone for good 90 days later (F-203).
--
-- Deleting an organization only archives it, and nothing ever removed it, so
-- every staff record outlived the customer. The owner's decision (2026-11-13):
-- a Gridmaster can restore it for 90 days, and then a daily job deletes it
-- with its staff data and its activity log. DubGrid support's own records of
-- it (who deleted, restored or exported it) stay, as platform history. The
-- job then deletes each sign-in account that belongs to no other organization.
--
-- Every organization table cascades from organizations except audit_log,
-- which has no foreign key so it can outlive one; its rows are removed here.

INSERT INTO public.platform_feature_flags (key, enabled, description) VALUES
  ('cron_purge_archived_orgs', true,
   'Daily job that permanently deletes organizations deleted more than 90 days ago.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_archived_organization(p_org_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.organizations;
  v_user_ids UUID[];
BEGIN
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_org.workspace_kind <> 'real'
     OR v_org.archived_at IS NULL
     OR v_org.archived_at > now() - interval '90 days' THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_DUE' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT user_id), '{}') INTO v_user_ids
  FROM (
    SELECT user_id FROM public.organization_memberships WHERE org_id = p_org_id
    UNION
    SELECT user_id FROM public.employees WHERE org_id = p_org_id AND user_id IS NOT NULL
  ) members;

  DELETE FROM public.audit_log
  WHERE org_id = p_org_id
    AND details->>'initiated_by' IS DISTINCT FROM 'gridmaster';

  DELETE FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.audit_log (org_id, action, resource_type, resource_id, details)
  VALUES (
    p_org_id,
    'org.purged',
    'organization',
    p_org_id::TEXT,
    jsonb_build_object(
      'initiated_by', 'gridmaster',
      'trigger', 'retention',
      'name', v_org.name,
      'slug', v_org.slug,
      'archivedAt', v_org.archived_at,
      'memberCount', cardinality(v_user_ids)
    )
  );

  RETURN v_user_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_archived_organization(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_archived_organization(UUID) TO service_role;
