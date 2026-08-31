CREATE OR REPLACE FUNCTION public.get_filtered_audit_log(
  p_org_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_action_prefix TEXT DEFAULT NULL,
  p_action_prefixes TEXT[] DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_target TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_high_risk_only BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF public.audit_log
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT audit.*
  FROM public.audit_log AS audit
  LEFT JOIN public.employees AS employee
    ON audit.resource_type = 'employee'
    AND employee.id::text = audit.resource_id
  LEFT JOIN public.invitations AS invitation
    ON audit.resource_type = 'invitation'
    AND invitation.id::text = audit.resource_id
  LEFT JOIN public.profiles AS profile
    ON audit.resource_type IN ('user', 'organization_membership')
    AND profile.id::text = audit.resource_id
  LEFT JOIN public.profiles AS actor_profile
    ON actor_profile.id = audit.actor_id
  WHERE (p_org_id IS NULL OR audit.org_id = p_org_id)
    AND (p_action IS NULL OR audit.action = p_action)
    AND (p_action_prefix IS NULL OR audit.action LIKE p_action_prefix || '%')
    AND (
      p_action_prefixes IS NULL
      OR cardinality(p_action_prefixes) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_action_prefixes) AS prefix
        WHERE audit.action LIKE prefix || '%'
      )
    )
    AND (p_resource_type IS NULL OR audit.resource_type = p_resource_type)
    AND (p_actor_id IS NULL OR audit.actor_id = p_actor_id)
    AND (p_start_date IS NULL OR audit.created_at >= p_start_date)
    AND (p_end_date IS NULL OR audit.created_at <= p_end_date)
    AND (
      NOT p_high_risk_only
      OR audit.action IN (
        'account.deleted', 'audit.exported', 'feature_flags.updated', 'org.archived',
        'org.suspended', 'user.deactivated', 'user.force_logout', 'user.password_reset_sent'
      )
      OR audit.action LIKE ANY (ARRAY['billing.%', 'gdpr.%', 'gridmaster_account.%', 'impersonation.%'])
    )
    AND (
      p_target IS NULL
      OR concat_ws(
        ' ',
        audit.actor_email,
        audit.action,
        audit.resource_type,
        audit.resource_id,
        audit.details::text,
        actor_profile.first_name,
        actor_profile.last_name,
        employee.first_name,
        employee.last_name,
        employee.email,
        invitation.first_name,
        invitation.last_name,
        invitation.email,
        profile.first_name,
        profile.last_name
      ) ILIKE '%' || p_target || '%'
    )
  ORDER BY audit.created_at DESC, audit.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 5000)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.get_filtered_audit_log(
  UUID, TEXT, TEXT, TEXT[], TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_filtered_audit_log(
  UUID, TEXT, TEXT, TEXT[], TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, INTEGER, INTEGER
) TO service_role;
