CREATE OR REPLACE FUNCTION public.update_mobile_employee_with_audit(
  p_org_id UUID,
  p_employee_id UUID,
  p_expected_version INTEGER,
  p_first_name TEXT,
  p_last_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_contact_notes TEXT,
  p_certification_id BIGINT,
  p_focus_area_ids BIGINT[],
  p_role_ids BIGINT[],
  p_department_ids BIGINT[],
  p_employment_type public.employee_employment_type,
  p_actor_id UUID,
  p_actor_email TEXT,
  p_audit_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_is_gridmaster BOOLEAN := FALSE;
  v_membership public.organization_memberships%ROWTYPE;
  v_actor_employee_status public.employee_status;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing actor identity';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_id AND platform_role = 'gridmaster'
  ) INTO v_is_gridmaster;

  SELECT * INTO v_membership
  FROM public.organization_memberships
  WHERE user_id = p_actor_id AND org_id = p_org_id AND archived_at IS NULL
  LIMIT 1;

  SELECT status INTO v_actor_employee_status
  FROM public.employees
  WHERE user_id = p_actor_id AND org_id = p_org_id AND archived_at IS NULL
  LIMIT 1;

  IF NOT (
    v_is_gridmaster
    OR v_membership.org_role = 'super_admin'
    OR (
      v_membership.org_role = 'admin'
      AND COALESCE((v_membership.admin_permissions->>'canManageEmployees')::BOOLEAN, FALSE)
      AND COALESCE(v_actor_employee_status <> 'inactive'::public.employee_status, TRUE)
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: insufficient permissions to manage employees';
  END IF;

  UPDATE public.employees
  SET
    first_name = p_first_name,
    last_name = p_last_name,
    phone = p_phone,
    email = p_email,
    contact_notes = p_contact_notes,
    certification_id = p_certification_id,
    focus_area_ids = p_focus_area_ids,
    role_ids = p_role_ids,
    department_ids = p_department_ids,
    employment_type = COALESCE(p_employment_type, employment_type),
    version = p_expected_version + 1
  WHERE id = p_employee_id
    AND org_id = p_org_id
    AND version = p_expected_version
  RETURNING * INTO v_employee;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_audit_details IS NOT NULL THEN
    INSERT INTO public.audit_log (
      org_id, actor_id, actor_email, action, resource_type, resource_id,
      details, ip_address, user_agent
    ) VALUES (
      p_org_id, p_actor_id, p_actor_email, 'employee.updated', 'employee', p_employee_id::TEXT,
      p_audit_details, p_ip_address, p_user_agent
    );
  END IF;

  RETURN v_employee;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_mobile_employee_with_audit(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT[], BIGINT[], BIGINT[],
  public.employee_employment_type, UUID, TEXT, JSONB, INET, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_mobile_employee_with_audit(
  UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT[], BIGINT[], BIGINT[],
  public.employee_employment_type, UUID, TEXT, JSONB, INET, TEXT
) TO service_role;
