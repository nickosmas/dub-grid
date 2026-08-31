-- ==========================================
-- ARDEN WOOD SEED SCRIPT
-- ==========================================
-- Clones Calm Haven's configuration, then applies the Arden Wood
-- roster and schedule extracted from the April 19 - May 2 schedule PDF.

DO $$
DECLARE
  source_org uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
  target_org uuid := '964c29d1-dc1e-4cd6-861c-8b8ab00d20c0';
BEGIN
  INSERT INTO public.organizations (
    id,
    name,
    slug,
    address,
    address_line_1,
    address_line_2,
    address_city,
    address_state,
    address_postal_code,
    address_country,
    phone,
    timezone,
    focus_area_label,
    certification_label,
    role_label,
    employee_count
  )
  VALUES (
    target_org,
    'Arden Wood',
    'ardenwood',
    '445 Wawona Street, San Francisco, CA 94116, United States',
    '445 Wawona Street',
    '',
    'San Francisco',
    'CA',
    '94116',
    'United States',
    '(415) 425-3334',
    'America/Los_Angeles',
    'Wings',
    'Certifications',
    'Roles',
    50
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        address = EXCLUDED.address,
        address_line_1 = EXCLUDED.address_line_1,
        address_line_2 = EXCLUDED.address_line_2,
        address_city = EXCLUDED.address_city,
        address_state = EXCLUDED.address_state,
        address_postal_code = EXCLUDED.address_postal_code,
        address_country = EXCLUDED.address_country,
        phone = EXCLUDED.phone,
        timezone = EXCLUDED.timezone,
        focus_area_label = EXCLUDED.focus_area_label,
        certification_label = EXCLUDED.certification_label,
        role_label = EXCLUDED.role_label,
        employee_count = EXCLUDED.employee_count;

  DELETE FROM public.schedule_cells WHERE org_id = target_org;
  DELETE FROM public.employees WHERE org_id = target_org;
  DELETE FROM public.jobs WHERE org_id = target_org;
  DELETE FROM public.shift_categories WHERE org_id = target_org;
  DELETE FROM public.absence_types WHERE org_id = target_org;
  DELETE FROM public.organization_roles WHERE org_id = target_org;
  DELETE FROM public.certifications WHERE org_id = target_org;
  DELETE FROM public.focus_areas WHERE org_id = target_org;
  DELETE FROM public.departments WHERE org_id = target_org;

  INSERT INTO public.departments (org_id, name, type, sort_order, permissions)
  SELECT target_org, name, type, sort_order, permissions
  FROM public.departments
  WHERE org_id = source_org
  ORDER BY sort_order;

  INSERT INTO public.focus_areas (org_id, department_id, name, color, sort_order)
  SELECT
    target_org,
    target_dept.id,
    source_fa.name,
    source_fa.color,
    source_fa.sort_order
  FROM public.focus_areas source_fa
  LEFT JOIN public.departments source_dept ON source_dept.id = source_fa.department_id
  LEFT JOIN public.departments target_dept
    ON target_dept.org_id = target_org
   AND target_dept.name = source_dept.name
  WHERE source_fa.org_id = source_org
  ORDER BY source_fa.sort_order;

  INSERT INTO public.shift_categories (
    org_id,
    focus_area_id,
    name,
    abbr,
    start_time,
    end_time,
    color,
    sort_order
  )
  SELECT
    target_org,
    target_fa.id,
    source_cat.name,
    source_cat.abbr,
    source_cat.start_time,
    source_cat.end_time,
    source_cat.color,
    source_cat.sort_order
  FROM public.shift_categories source_cat
  JOIN public.focus_areas source_fa ON source_fa.id = source_cat.focus_area_id
  JOIN public.focus_areas target_fa
    ON target_fa.org_id = target_org
   AND target_fa.name = source_fa.name
  WHERE source_cat.org_id = source_org
  ORDER BY source_cat.sort_order;

  INSERT INTO public.absence_types (
    org_id,
    label,
    name,
    color,
    border_color,
    text_color,
    sort_order
  )
  SELECT
    target_org,
    label,
    name,
    color,
    border_color,
    text_color,
    sort_order
  FROM public.absence_types
  WHERE org_id = source_org
  ORDER BY sort_order;

  INSERT INTO public.certifications (org_id, department_ids, name, abbr, sort_order)
  SELECT
    target_org,
    COALESCE(
      (
        SELECT array_agg(target_dept.id ORDER BY target_dept.id)
        FROM unnest(source_cert.department_ids) AS source_dept_id
        JOIN public.departments source_dept ON source_dept.id = source_dept_id
        JOIN public.departments target_dept
          ON target_dept.org_id = target_org
         AND target_dept.name = source_dept.name
      ),
      ARRAY[]::bigint[]
    ),
    source_cert.name,
    source_cert.abbr,
    source_cert.sort_order
  FROM public.certifications source_cert
  WHERE source_cert.org_id = source_org
  ORDER BY source_cert.sort_order;

  INSERT INTO public.organization_roles (
    org_id, department_ids, name, abbr, sort_order, required_certification_ids
  )
  SELECT
    target_org,
    COALESCE(
      (
        SELECT array_agg(target_dept.id ORDER BY target_dept.id)
        FROM unnest(source_role.department_ids) AS source_dept_id
        JOIN public.departments source_dept ON source_dept.id = source_dept_id
        JOIN public.departments target_dept
          ON target_dept.org_id = target_org
         AND target_dept.name = source_dept.name
      ),
      ARRAY[]::bigint[]
    ),
    source_role.name,
    source_role.abbr,
    source_role.sort_order,
    -- Requirements point at certification ids, so they need remapping by name
    -- the same way department_ids do; copying them verbatim would reference the
    -- source org's rows and leave every gated role unassignable here.
    COALESCE(
      (
        SELECT array_agg(target_cert.id ORDER BY target_cert.id)
        FROM unnest(source_role.required_certification_ids) AS source_cert_id
        JOIN public.certifications source_cert ON source_cert.id = source_cert_id
        JOIN public.certifications target_cert
          ON target_cert.org_id = target_org
         AND target_cert.name = source_cert.name
      ),
      ARRAY[]::bigint[]
    )
  FROM public.organization_roles source_role
  WHERE source_role.org_id = source_org
  ORDER BY source_role.sort_order;

  RAISE NOTICE 'Arden Wood configuration cloned from Calm Haven.';
END $$;

DO $$
DECLARE
  target_org uuid := '964c29d1-dc1e-4cd6-861c-8b8ab00d20c0';
  dept_nursing bigint;
  dept_visiting bigint;
  fa_snw bigint;
  fa_sc bigint;
  fa_ns bigint;
  fa_vcsn bigint;
  shift_snw_d bigint;
  shift_snw_e bigint;
  shift_sc_d bigint;
  shift_sc_e bigint;
  shift_ns_n bigint;
  shift_vcsn_vn bigint;
  cert_jlcsn bigint;
  cert_staff bigint;
  cert_csn4 bigint;
  cert_csn3 bigint;
  role_supv bigint;
  role_mentor bigint;
  role_cn bigint;
BEGIN
  SELECT id INTO dept_nursing FROM public.departments WHERE org_id = target_org AND name = 'Nursing';
  SELECT id INTO dept_visiting FROM public.departments WHERE org_id = target_org AND name = 'Visiting';
  SELECT id INTO fa_snw FROM public.focus_areas WHERE org_id = target_org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc FROM public.focus_areas WHERE org_id = target_org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns FROM public.focus_areas WHERE org_id = target_org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = target_org AND name = 'Visiting CSNS';
  SELECT id INTO shift_snw_d FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_snw AND name = 'Day Shift';
  SELECT id INTO shift_snw_e FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_snw AND name = 'Evening Shift';
  SELECT id INTO shift_sc_d FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_sc AND name = 'Day Shift';
  SELECT id INTO shift_sc_e FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_sc AND name = 'Evening Shift';
  SELECT id INTO shift_ns_n FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_ns AND name = 'Night Shift';
  SELECT id INTO shift_vcsn_vn FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_vcsn AND name = 'Visiting Nursing';
  SELECT id INTO cert_jlcsn FROM public.certifications WHERE org_id = target_org AND name = 'Journal Listed Christian Science Nurse';
  SELECT id INTO cert_staff FROM public.certifications WHERE org_id = target_org AND name = 'Staff';
  SELECT id INTO cert_csn4 FROM public.certifications WHERE org_id = target_org AND name = 'Christian Science Nurse IV';
  SELECT id INTO cert_csn3 FROM public.certifications WHERE org_id = target_org AND name = 'Christian Science Nurse III';
  SELECT id INTO role_supv FROM public.organization_roles WHERE org_id = target_org AND abbr = 'Supv';
  SELECT id INTO role_mentor FROM public.organization_roles WHERE org_id = target_org AND abbr = 'Mentor';
  SELECT id INTO role_cn FROM public.organization_roles WHERE org_id = target_org AND abbr = 'Nurse';

  DELETE FROM public.jobs WHERE org_id = target_org;

  INSERT INTO public.jobs (
    org_id,
    name,
    abbr,
    show_on_grid,
    assignment_mode,
    eligibility_mode,
    focus_area_ids,
    department_ids,
    applicable_shift_ids,
    eligible_role_ids,
    required_certification_ids,
    color,
    border_color,
    text_color,
    default_start_time,
    default_end_time,
    default_duration_hours,
    default_duration_minutes,
    sort_order,
    system_key
  )
  VALUES
    (
      target_org, 'Office', 'Ofc', true, 'shiftless', 'and',
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      NULL, NULL, 8, 0, 0, NULL
    ),
    (
      target_org, 'Partial', '0.3', true, 'shiftless', 'and',
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '#FDE68A', 'transparent', '#92400E',
      NULL, NULL, 3, 0, 1, NULL
    ),
    (
      target_org, 'Default shift job', 'SHIFT', false, 'with_shift', 'and',
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      NULL, NULL, NULL, NULL, -1000, 'default_shift_job'
    ),
    (
      target_org, 'Supervisor', 'S', true, 'with_shift', 'and',
      ARRAY[fa_snw, fa_ns],
      ARRAY[dept_nursing],
      ARRAY[shift_snw_d, shift_snw_e, shift_ns_n],
      ARRAY[role_supv],
      ARRAY[cert_jlcsn, cert_staff, cert_csn4],
      '#E2E8F0', 'transparent', '#1E293B',
      NULL, NULL, NULL, NULL, 4, NULL
    ),
    (
      target_org, 'Mentor', 'M', true, 'with_shift', 'and',
      ARRAY[fa_snw, fa_sc],
      ARRAY[dept_nursing],
      ARRAY[shift_snw_d, shift_sc_d],
      ARRAY[role_mentor],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      NULL, NULL, NULL, NULL, 5, NULL
    );

  WITH employee_seed (first_name, last_name, cert_abbr, role_abbrs, seniority, focus_area_names) AS (
    VALUES
    ('Connie', 'Wahl', 'JLCSN', ARRAY['DCSN']::text[], 1, ARRAY['Skilled Nursing']::text[]),
    ('Deborah', 'Lee', 'JLCSN', ARRAY['SC Mgr']::text[], 2, ARRAY['Sheltered Care']::text[]),
    ('Robert', 'Miruka', 'JLCSN', ARRAY['Mentor']::text[], 3, ARRAY['Skilled Nursing', 'Visiting CSNS']::text[]),
    ('Rose', 'Keyaer', 'JLCSN', ARRAY['Supv']::text[], 4, ARRAY['Skilled Nursing']::text[]),
    ('Shirley', 'Bihag', 'JLCSN', ARRAY['Supv']::text[], 5, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Queen', 'Nwosu', 'JLCSN', ARRAY['Supv']::text[], 6, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Ben', 'Egwuenu', 'JLCSN', ARRAY['Supv']::text[], 7, ARRAY['Skilled Nursing']::text[]),
    ('Linda', 'Luciani', 'JLCSN', ARRAY['Supv', 'Nurse']::text[], 8, ARRAY['Skilled Nursing', 'Visiting CSNS']::text[]),
    ('Paul', 'Otieno', 'JLCSN', ARRAY['Supv']::text[], 9, ARRAY['Skilled Nursing']::text[]),
    ('Julius', 'Miruka', 'JLCSN', ARRAY['Supv']::text[], 10, ARRAY['Night Shift']::text[]),
    ('Jared', 'Onsabwa', 'Nurse', ARRAY[]::text[], 11, ARRAY['Skilled Nursing']::text[]),
    ('Emmanuel', 'Odenyi', 'Nurse', ARRAY[]::text[], 12, ARRAY['Sheltered Care']::text[]),
    ('Nicodamus', 'Kosmas', 'Nurse', ARRAY[]::text[], 13, ARRAY['Sheltered Care']::text[]),
    ('Josiah "Joey"', 'Onyechi', 'Nurse', ARRAY[]::text[], 14, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Alice', 'Mburu', 'Nurse', ARRAY[]::text[], 15, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Chris Michael', 'Mawere', 'CSN III', ARRAY[]::text[], 16, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Daniel', 'Ogbonna', 'CSN III', ARRAY[]::text[], 17, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Alphince Junior', 'Baraza', 'CSN III', ARRAY[]::text[], 18, ARRAY['Sheltered Care']::text[]),
    ('Arphaxard Mou "Harry"', 'Ouma', 'CSN II', ARRAY[]::text[], 19, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Mercy', 'Kigera', 'CSN II', ARRAY[]::text[], 20, ARRAY['Skilled Nursing', 'Sheltered Care', 'Visiting CSNS']::text[]),
    ('Vicky', 'Kiende', 'CSN II', ARRAY[]::text[], 21, ARRAY['Skilled Nursing', 'Sheltered Care', 'Night Shift']::text[]),
    ('Grace', 'Kamiti', 'JLCSN', ARRAY['Supv']::text[], 22, ARRAY['Night Shift']::text[]),
    ('Stephen', 'Onsabwa', 'JLCSN', ARRAY['Supv']::text[], 23, ARRAY['Night Shift']::text[]),
    ('Aicha', 'Langel', 'JLCSN', ARRAY['DVCSN']::text[], 24, ARRAY['Visiting CSNS']::text[]),
    ('Sherry', 'Otieno', NULL, ARRAY['Act Cor']::text[], 25, ARRAY['Sheltered Care']::text[]),
    ('Deborah', 'Gray', NULL, ARRAY['SC/Act. Cor']::text[], 26, ARRAY['Sheltered Care']::text[])
  )
  INSERT INTO public.employees (
    org_id,
    first_name,
    last_name,
    certification_id,
    role_ids,
    seniority,
    focus_area_ids,
    status
  )
  SELECT
    target_org,
    employee_seed.first_name,
    employee_seed.last_name,
    cert.id,
    ARRAY(
      SELECT role.id
      FROM public.organization_roles role
      WHERE role.org_id = target_org
        AND role.abbr = ANY(employee_seed.role_abbrs)
      ORDER BY role.sort_order
    ),
    employee_seed.seniority,
    ARRAY(
      SELECT focus_area.id
      FROM public.focus_areas focus_area
      WHERE focus_area.org_id = target_org
        AND focus_area.name = ANY(employee_seed.focus_area_names)
      ORDER BY focus_area.sort_order
    ),
    'active'
  FROM employee_seed
  -- LEFT so support staff, who hold no certification, are still inserted.
  LEFT JOIN public.certifications cert
    ON cert.org_id = target_org
   AND cert.abbr = employee_seed.cert_abbr
  ON CONFLICT (org_id, first_name, last_name) WHERE archived_at IS NULL DO UPDATE
    SET certification_id = EXCLUDED.certification_id,
        role_ids = EXCLUDED.role_ids,
        seniority = EXCLUDED.seniority,
        focus_area_ids = EXCLUDED.focus_area_ids,
        status = EXCLUDED.status,
        updated_at = NOW();

  UPDATE public.employees
  SET department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = target_org AND name = 'Administration')],
      dept_admin_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = target_org AND name = 'Administration')]
  WHERE org_id = target_org
    AND first_name = 'Connie'
    AND last_name = 'Wahl';

  UPDATE public.employees
  SET department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = target_org AND name = 'Administration')]
  WHERE org_id = target_org
    AND first_name = 'Deborah'
    AND last_name = 'Lee';

  UPDATE public.employees
  SET department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = target_org AND name = 'Human Resources')],
      dept_admin_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = target_org AND name = 'Human Resources')]
  WHERE org_id = target_org
    AND first_name = 'Aicha'
    AND last_name = 'Langel';

  RAISE NOTICE 'Arden Wood employees seeded.';
END $$;

DO $$
DECLARE
  target_org uuid := '964c29d1-dc1e-4cd6-861c-8b8ab00d20c0';
  schedule_source_start date := DATE '2026-04-19';
  -- Land the roster on the current week so "this week" is never empty. Must be
  -- computed, not a literal: every shift below is written as
  -- schedule_start + (shift_date - schedule_source_start), so this is the one
  -- absolute anchor in the file and a hardcoded date silently rots (it also used
  -- to get double-shifted by the seed's date rewriter, pushing Arden Wood's
  -- whole schedule a month into the future). DOW is 0 for Sunday.
  schedule_start date := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int;
  fa_snw bigint;
  fa_sc bigint;
  fa_ns bigint;
  fa_vcsn bigint;
  shift_snw_d bigint;
  shift_snw_e bigint;
  shift_sc_d bigint;
  shift_sc_e bigint;
  shift_ns_n bigint;
  shift_vcsn_vn bigint;
  job_office bigint;
  job_partial bigint;
  job_default_shift bigint;
  job_supervisor bigint;
  job_mentor bigint;
  role_mentor bigint;
  work_row RECORD;
  absence_row RECORD;
BEGIN
  SELECT id INTO fa_snw FROM public.focus_areas WHERE org_id = target_org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc FROM public.focus_areas WHERE org_id = target_org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns FROM public.focus_areas WHERE org_id = target_org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = target_org AND name = 'Visiting CSNS';
  SELECT id INTO shift_snw_d FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_snw AND name = 'Day Shift';
  SELECT id INTO shift_snw_e FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_snw AND name = 'Evening Shift';
  SELECT id INTO shift_sc_d FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_sc AND name = 'Day Shift';
  SELECT id INTO shift_sc_e FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_sc AND name = 'Evening Shift';
  SELECT id INTO shift_ns_n FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_ns AND name = 'Night Shift';
  SELECT id INTO shift_vcsn_vn FROM public.shift_categories WHERE org_id = target_org AND focus_area_id = fa_vcsn AND name = 'Visiting Nursing';
  SELECT id INTO job_office FROM public.jobs WHERE org_id = target_org AND name = 'Office';
  SELECT id INTO job_partial FROM public.jobs WHERE org_id = target_org AND name = 'Partial';
  SELECT id INTO job_default_shift FROM public.jobs WHERE org_id = target_org AND system_key = 'default_shift_job';
  SELECT id INTO job_supervisor FROM public.jobs WHERE org_id = target_org AND name = 'Supervisor';
  SELECT id INTO job_mentor FROM public.jobs WHERE org_id = target_org AND name = 'Mentor';
  SELECT id INTO role_mentor FROM public.organization_roles WHERE org_id = target_org AND abbr = 'Mentor';

  FOR work_row IN
    SELECT
      employee.id AS emp_id,
      schedule_start + (work_seed.shift_date::date - schedule_source_start) AS shift_date,
      ARRAY(
        SELECT CASE selected.code_label
          WHEN 'Ofc' THEN NULL::bigint
          WHEN '0.3' THEN NULL::bigint
          WHEN 'Ds' THEN shift_snw_d
          WHEN 'Es' THEN shift_snw_e
          WHEN 'Dcn' THEN shift_sc_d
          WHEN 'Ecn' THEN shift_sc_e
          WHEN 'Ns' THEN shift_ns_n
          WHEN 'VN' THEN shift_vcsn_vn
          WHEN 'N' THEN shift_ns_n
          WHEN '(D)' THEN CASE WHEN focus_area.id = fa_sc THEN shift_sc_d ELSE shift_snw_d END
          WHEN 'D' THEN CASE WHEN focus_area.id = fa_sc THEN shift_sc_d ELSE shift_snw_d END
          WHEN 'E' THEN CASE WHEN focus_area.id = fa_sc THEN shift_sc_e ELSE shift_snw_e END
          ELSE NULL::bigint
        END
        FROM unnest(work_seed.code_labels) WITH ORDINALITY AS selected(code_label, ord)
        ORDER BY selected.ord
      ) AS shift_ids,
      ARRAY(
        SELECT CASE selected.code_label
          WHEN 'Ofc' THEN job_office
          WHEN '0.3' THEN job_partial
          WHEN 'Ds' THEN job_supervisor
          WHEN 'Es' THEN job_supervisor
          WHEN 'Ns' THEN job_supervisor
          WHEN '(D)' THEN CASE
            WHEN employee.role_ids && ARRAY[role_mentor] THEN job_mentor
            ELSE job_default_shift
          END
          WHEN 'Dcn' THEN job_default_shift
          WHEN 'Ecn' THEN job_default_shift
          ELSE job_default_shift
        END
        FROM unnest(work_seed.code_labels) WITH ORDINALITY AS selected(code_label, ord)
        ORDER BY selected.ord
      ) AS job_ids,
      ARRAY(
        SELECT selected.code_label = '(D)' AND NOT (employee.role_ids && ARRAY[role_mentor])
        FROM unnest(work_seed.code_labels) WITH ORDINALITY AS selected(code_label, ord)
        ORDER BY selected.ord
      ) AS is_mentored_flags,
      focus_area.id AS focus_area_id,
      work_seed.custom_start::text AS custom_start_time,
      work_seed.custom_end::text AS custom_end_time
    FROM (
    VALUES
    ('Connie Wahl', '2026-04-20', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-21', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-22', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-23', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-24', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-27', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-28', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-29', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-04-30', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Connie Wahl', '2026-05-01', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-19', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-20', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-21', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-22', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-23', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-26', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-27', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-28', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-29', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Deborah Lee', '2026-04-30', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-19', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-20', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-21', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-24', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-25', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-26', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-27', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Robert Miruka', '2026-04-28', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Robert Miruka', '2026-05-01', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Robert Miruka', '2026-05-02', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Rose Keyaer', '2026-04-19', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Rose Keyaer', '2026-04-25', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Rose Keyaer', '2026-04-26', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Rose Keyaer', '2026-05-01', 'Skilled Nursing', ARRAY['E']::text[], '18:00', '00:00'),
    ('Rose Keyaer', '2026-05-02', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-21', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-22', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-23', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-24', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-25', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-28', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-29', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-04-30', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-05-01', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Shirley Bihag', '2026-05-02', 'Sheltered Care', ARRAY['Dcn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-21', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-22', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-23', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-24', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-25', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-28', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-29', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-04-30', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-05-01', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Queen Nwosu', '2026-05-02', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-20', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-21', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-22', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-23', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-24', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-27', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-28', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-29', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-04-30', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Ben Egwuenu', '2026-05-01', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-19', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-22', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-23', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-24', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-25', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-26', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-29', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Linda Luciani', '2026-04-30', 'Skilled Nursing', ARRAY['Ds']::text[], NULL, NULL),
    ('Linda Luciani', '2026-05-01', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Linda Luciani', '2026-05-02', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-19', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-20', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-21', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-22', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-23', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-24', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-26', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-27', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-28', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-29', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-04-30', 'Skilled Nursing', ARRAY['Es']::text[], NULL, NULL),
    ('Paul Otieno', '2026-05-01', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-19', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-23', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-24', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-25', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-26', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Julius Miruka', '2026-04-30', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Julius Miruka', '2026-05-01', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Julius Miruka', '2026-05-02', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Jared Onsabwa', '2026-04-21', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Jared Onsabwa', '2026-04-22', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Jared Onsabwa', '2026-04-28', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Jared Onsabwa', '2026-04-29', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-19', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-20', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-21', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-23', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-24', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-25', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-26', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-27', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-28', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-30', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Emmanuel Odenyi', '2026-05-01', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-21', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-22', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-23', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-24', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-25', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-28', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-29', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-30', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-05-01', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-05-02', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-19', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-20', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-21', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-22', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-25', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-26', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-27', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-28', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-04-29', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Alice Mburu', '2026-05-02', 'Sheltered Care', ARRAY['Ecn']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-21', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-22', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-23', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-28', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-29', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Chris Michael Mawere', '2026-04-30', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-19', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-20', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-21', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-24', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-25', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-26', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-27', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-04-28', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-05-01', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Daniel Ogbonna', '2026-05-02', 'Sheltered Care', ARRAY['E']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-19', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-22', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-23', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-24', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-25', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-26', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-29', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-30', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-05-01', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Arphaxard Mou "Harry" Ouma', '2026-05-02', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-19', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-20', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-21', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-22', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-25', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-26', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-27', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-28', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-04-29', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Mercy Kigera', '2026-05-02', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-19', 'Skilled Nursing', ARRAY['(D)']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-20', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-21', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-22', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-25', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-26', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-27', 'Skilled Nursing', ARRAY['D']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-28', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-04-29', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Vicky Kiende', '2026-05-02', 'Skilled Nursing', ARRAY['E']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-20', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-21', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-22', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-23', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-24', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-27', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-28', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-29', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-04-30', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Grace Kamiti', '2026-05-01', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-19', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-20', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-21', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-22', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-25', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-26', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-27', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-28', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-04-29', 'Night Shift', ARRAY['N']::text[], NULL, NULL),
    ('Stephen Onsabwa', '2026-05-02', 'Night Shift', ARRAY['Ns']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-19', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-20', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-21', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-22', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-23', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-26', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-27', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-28', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Aicha Langel', '2026-04-30', 'Visiting CSNS', ARRAY['VN']::text[], NULL, NULL),
    ('Sherry Otieno', '2026-04-21', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Sherry Otieno', '2026-04-24', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Sherry Otieno', '2026-04-28', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Sherry Otieno', '2026-05-01', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-19', NULL, ARRAY['0.3']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-20', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-21', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-22', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-23', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-24', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-26', NULL, ARRAY['0.3']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-27', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-28', NULL, ARRAY['Ofc']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-29', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-04-30', 'Sheltered Care', ARRAY['D']::text[], NULL, NULL),
    ('Deborah Gray', '2026-05-01', NULL, ARRAY['Ofc']::text[], NULL, NULL)
    ) AS work_seed (employee_name, shift_date, focus_area_name, code_labels, custom_start, custom_end)
    JOIN public.employees employee
      ON employee.org_id = target_org
     AND concat_ws(' ', employee.first_name, employee.last_name) = work_seed.employee_name
    LEFT JOIN public.focus_areas focus_area
      ON focus_area.org_id = target_org
     AND focus_area.name = work_seed.focus_area_name
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      target_org,
      work_row.emp_id,
      work_row.shift_date,
      'published',
      'worked',
      work_row.shift_ids,
      work_row.job_ids,
      NULL,
      work_row.custom_start_time,
      work_row.custom_end_time,
      NULL,
      FALSE,
      work_row.focus_area_id,
      NULL,
      NULL,
      work_row.is_mentored_flags
    );
  END LOOP;

  FOR absence_row IN
    SELECT
      employee.id AS emp_id,
      schedule_start + (absence_seed.shift_date::date - schedule_source_start) AS shift_date,
      absence_type.id AS absence_type_id
    FROM (
    VALUES
    ('Connie Wahl', '2026-04-19', 'X'),
    ('Connie Wahl', '2026-04-25', 'X'),
    ('Connie Wahl', '2026-04-26', 'X'),
    ('Connie Wahl', '2026-05-02', 'X'),
    ('Deborah Lee', '2026-04-24', 'X'),
    ('Deborah Lee', '2026-04-25', 'X'),
    ('Deborah Lee', '2026-05-01', 'X'),
    ('Deborah Lee', '2026-05-02', 'X'),
    ('Robert Miruka', '2026-04-22', 'X'),
    ('Robert Miruka', '2026-04-23', 'X'),
    ('Robert Miruka', '2026-04-29', 'X'),
    ('Robert Miruka', '2026-04-30', 'X'),
    ('Shirley Bihag', '2026-04-19', 'X'),
    ('Shirley Bihag', '2026-04-20', 'X'),
    ('Shirley Bihag', '2026-04-26', 'X'),
    ('Shirley Bihag', '2026-04-27', 'X'),
    ('Queen Nwosu', '2026-04-19', 'X'),
    ('Queen Nwosu', '2026-04-20', 'X'),
    ('Queen Nwosu', '2026-04-26', 'X'),
    ('Queen Nwosu', '2026-04-27', 'X'),
    ('Ben Egwuenu', '2026-04-19', 'X'),
    ('Ben Egwuenu', '2026-04-25', 'X'),
    ('Ben Egwuenu', '2026-04-26', 'X'),
    ('Ben Egwuenu', '2026-05-02', 'X'),
    ('Linda Luciani', '2026-04-20', 'X'),
    ('Linda Luciani', '2026-04-21', 'X'),
    ('Linda Luciani', '2026-04-27', 'X'),
    ('Linda Luciani', '2026-04-28', 'X'),
    ('Paul Otieno', '2026-04-25', 'X'),
    ('Paul Otieno', '2026-05-02', 'X'),
    ('Julius Miruka', '2026-04-20', 'X'),
    ('Julius Miruka', '2026-04-21', 'X'),
    ('Julius Miruka', '2026-04-22', 'X'),
    ('Julius Miruka', '2026-04-27', 'X'),
    ('Julius Miruka', '2026-04-28', 'X'),
    ('Julius Miruka', '2026-04-29', 'X'),
    ('Jared Onsabwa', '2026-04-19', 'X'),
    ('Jared Onsabwa', '2026-04-20', 'X'),
    ('Jared Onsabwa', '2026-04-23', 'X'),
    ('Jared Onsabwa', '2026-04-24', 'X'),
    ('Jared Onsabwa', '2026-04-25', 'X'),
    ('Jared Onsabwa', '2026-04-26', 'X'),
    ('Jared Onsabwa', '2026-04-27', 'X'),
    ('Jared Onsabwa', '2026-04-30', 'X'),
    ('Jared Onsabwa', '2026-05-01', 'X'),
    ('Jared Onsabwa', '2026-05-02', 'X'),
    ('Emmanuel Odenyi', '2026-04-22', 'X'),
    ('Emmanuel Odenyi', '2026-04-29', 'X'),
    ('Emmanuel Odenyi', '2026-05-02', 'X'),
    ('Nicodamus Kosmas', '2026-04-19', 'V'),
    ('Nicodamus Kosmas', '2026-04-20', 'V'),
    ('Nicodamus Kosmas', '2026-04-21', 'X'),
    ('Nicodamus Kosmas', '2026-04-22', 'X'),
    ('Nicodamus Kosmas', '2026-04-23', 'V'),
    ('Nicodamus Kosmas', '2026-04-24', 'V'),
    ('Nicodamus Kosmas', '2026-04-25', 'V'),
    ('Nicodamus Kosmas', '2026-04-26', 'V'),
    ('Nicodamus Kosmas', '2026-04-27', 'V'),
    ('Nicodamus Kosmas', '2026-04-28', 'X'),
    ('Nicodamus Kosmas', '2026-04-29', 'X'),
    ('Nicodamus Kosmas', '2026-04-30', 'V'),
    ('Nicodamus Kosmas', '2026-05-01', 'V'),
    ('Nicodamus Kosmas', '2026-05-02', 'V'),
    ('Josiah "Joey" Onyechi', '2026-04-19', 'X'),
    ('Josiah "Joey" Onyechi', '2026-04-20', 'X'),
    ('Josiah "Joey" Onyechi', '2026-04-26', 'X'),
    ('Josiah "Joey" Onyechi', '2026-04-27', 'X'),
    ('Alice Mburu', '2026-04-23', 'X'),
    ('Alice Mburu', '2026-04-24', 'X'),
    ('Alice Mburu', '2026-04-30', 'X'),
    ('Alice Mburu', '2026-05-01', 'X'),
    ('Chris Michael Mawere', '2026-04-19', 'X'),
    ('Chris Michael Mawere', '2026-04-20', 'X'),
    ('Chris Michael Mawere', '2026-04-24', 'X'),
    ('Chris Michael Mawere', '2026-04-25', 'X'),
    ('Chris Michael Mawere', '2026-04-26', 'X'),
    ('Chris Michael Mawere', '2026-04-27', 'X'),
    ('Chris Michael Mawere', '2026-05-01', 'X'),
    ('Chris Michael Mawere', '2026-05-02', 'X'),
    ('Daniel Ogbonna', '2026-04-22', 'X'),
    ('Daniel Ogbonna', '2026-04-23', 'X'),
    ('Daniel Ogbonna', '2026-04-29', 'X'),
    ('Daniel Ogbonna', '2026-04-30', 'X'),
    ('Alphince Junior Baraza', '2026-04-19', 'V'),
    ('Alphince Junior Baraza', '2026-04-20', 'V'),
    ('Alphince Junior Baraza', '2026-04-21', 'X'),
    ('Alphince Junior Baraza', '2026-04-22', 'X'),
    ('Alphince Junior Baraza', '2026-04-23', 'V'),
    ('Alphince Junior Baraza', '2026-04-24', 'V'),
    ('Alphince Junior Baraza', '2026-04-25', 'V'),
    ('Alphince Junior Baraza', '2026-04-26', 'V'),
    ('Alphince Junior Baraza', '2026-04-27', 'V'),
    ('Alphince Junior Baraza', '2026-04-28', 'X'),
    ('Alphince Junior Baraza', '2026-04-29', 'X'),
    ('Alphince Junior Baraza', '2026-04-30', 'V'),
    ('Alphince Junior Baraza', '2026-05-01', 'V'),
    ('Alphince Junior Baraza', '2026-05-02', 'V'),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-20', 'X'),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-21', 'X'),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-27', 'X'),
    ('Arphaxard Mou "Harry" Ouma', '2026-04-28', 'X'),
    ('Mercy Kigera', '2026-04-23', 'X'),
    ('Mercy Kigera', '2026-04-24', 'X'),
    ('Mercy Kigera', '2026-04-30', 'X'),
    ('Mercy Kigera', '2026-05-01', 'X'),
    ('Vicky Kiende', '2026-04-23', 'X'),
    ('Vicky Kiende', '2026-04-24', 'X'),
    ('Vicky Kiende', '2026-04-30', 'X'),
    ('Vicky Kiende', '2026-05-01', 'X'),
    ('Grace Kamiti', '2026-04-19', 'X'),
    ('Grace Kamiti', '2026-04-25', 'X'),
    ('Grace Kamiti', '2026-04-26', 'X'),
    ('Grace Kamiti', '2026-05-02', 'X'),
    ('Stephen Onsabwa', '2026-04-23', 'X'),
    ('Stephen Onsabwa', '2026-04-24', 'X'),
    ('Stephen Onsabwa', '2026-04-30', 'X'),
    ('Stephen Onsabwa', '2026-05-01', 'X'),
    ('Aicha Langel', '2026-04-24', 'X'),
    ('Aicha Langel', '2026-04-25', 'X'),
    ('Aicha Langel', '2026-04-29', 'CME'),
    ('Aicha Langel', '2026-05-01', 'X'),
    ('Aicha Langel', '2026-05-02', 'X'),
    ('Sherry Otieno', '2026-04-19', 'X'),
    ('Sherry Otieno', '2026-04-20', 'X'),
    ('Sherry Otieno', '2026-04-22', 'X'),
    ('Sherry Otieno', '2026-04-23', 'X'),
    ('Sherry Otieno', '2026-04-25', 'X'),
    ('Sherry Otieno', '2026-04-26', 'X'),
    ('Sherry Otieno', '2026-04-27', 'X'),
    ('Sherry Otieno', '2026-04-29', 'X'),
    ('Sherry Otieno', '2026-04-30', 'X'),
    ('Sherry Otieno', '2026-05-02', 'X'),
    ('Deborah Gray', '2026-04-25', 'X'),
    ('Deborah Gray', '2026-05-02', 'X')
    ) AS absence_seed (employee_name, shift_date, absence_label)
    JOIN public.employees employee
      ON employee.org_id = target_org
     AND concat_ws(' ', employee.first_name, employee.last_name) = absence_seed.employee_name
    JOIN public.absence_types absence_type
      ON absence_type.org_id = target_org
     AND absence_type.label = absence_seed.absence_label
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      target_org,
      absence_row.emp_id,
      absence_row.shift_date,
      'published',
      'absence',
      '{}'::BIGINT[],
      '{}'::BIGINT[],
      absence_row.absence_type_id,
      NULL,
      NULL,
      NULL,
      FALSE,
      NULL,
      NULL,
      NULL
    );
  END LOOP;

  RAISE NOTICE 'Arden Wood shifts and absences seeded (% work shifts, % absences).', 221, 134;
END $$;
