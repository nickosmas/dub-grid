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

  DELETE FROM public.shifts WHERE org_id = target_org;
  DELETE FROM public.employees WHERE org_id = target_org;
  DELETE FROM public.shift_codes WHERE org_id = target_org;
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

  INSERT INTO public.focus_areas (org_id, department_id, name, sort_order)
  SELECT
    target_org,
    target_dept.id,
    source_fa.name,
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
    color,
    start_time,
    end_time,
    sort_order
  )
  SELECT
    target_org,
    target_fa.id,
    source_cat.name,
    source_cat.color,
    source_cat.start_time,
    source_cat.end_time,
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

  INSERT INTO public.certifications (org_id, department_id, name, abbr, sort_order)
  SELECT
    target_org,
    target_dept.id,
    source_cert.name,
    source_cert.abbr,
    source_cert.sort_order
  FROM public.certifications source_cert
  LEFT JOIN public.departments source_dept ON source_dept.id = source_cert.department_id
  LEFT JOIN public.departments target_dept
    ON target_dept.org_id = target_org
   AND target_dept.name = source_dept.name
  WHERE source_cert.org_id = source_org
  ORDER BY source_cert.sort_order;

  INSERT INTO public.organization_roles (org_id, department_id, name, abbr, sort_order)
  SELECT
    target_org,
    target_dept.id,
    source_role.name,
    source_role.abbr,
    source_role.sort_order
  FROM public.organization_roles source_role
  LEFT JOIN public.departments source_dept ON source_dept.id = source_role.department_id
  LEFT JOIN public.departments target_dept
    ON target_dept.org_id = target_org
   AND target_dept.name = source_dept.name
  WHERE source_role.org_id = source_org
  ORDER BY source_role.sort_order;

  INSERT INTO public.shift_codes (
    org_id,
    label,
    name,
    color,
    border_color,
    text_color,
    is_general,
    focus_area_id,
    sort_order,
    required_certification_ids,
    category_id,
    default_duration_hours,
    default_duration_minutes,
    default_start_time,
    default_end_time
  )
  SELECT
    target_org,
    source_code.label,
    source_code.name,
    source_code.color,
    source_code.border_color,
    source_code.text_color,
    source_code.is_general,
    target_fa.id,
    source_code.sort_order,
    '{}'::bigint[],
    target_cat.id,
    source_code.default_duration_hours,
    source_code.default_duration_minutes,
    source_code.default_start_time,
    source_code.default_end_time
  FROM public.shift_codes source_code
  LEFT JOIN public.focus_areas source_fa ON source_fa.id = source_code.focus_area_id
  LEFT JOIN public.focus_areas target_fa
    ON target_fa.org_id = target_org
   AND target_fa.name = source_fa.name
  LEFT JOIN public.shift_categories source_cat ON source_cat.id = source_code.category_id
  LEFT JOIN public.focus_areas source_cat_fa ON source_cat_fa.id = source_cat.focus_area_id
  LEFT JOIN public.shift_categories target_cat
    ON target_cat.org_id = target_org
   AND target_cat.name = source_cat.name
   AND (
        (source_cat_fa.name IS NULL AND target_cat.focus_area_id IS NULL)
        OR target_cat.focus_area_id = (
          SELECT fa.id FROM public.focus_areas fa
          WHERE fa.org_id = target_org AND fa.name = source_cat_fa.name
        )
      )
  WHERE source_code.org_id = source_org
  ORDER BY source_code.sort_order;

  UPDATE public.shift_codes target_code
  SET required_certification_ids = ARRAY[
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Journal Listed Christian Science Nurse'),
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Staff Nurse'),
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Christian Science Nurse IV')
  ]
  WHERE target_code.org_id = target_org
    AND target_code.label IN ('Ds', 'Es')
    AND target_code.focus_area_id = (
      SELECT id FROM public.focus_areas WHERE org_id = target_org AND name = 'Skilled Nursing'
    );

  UPDATE public.shift_codes target_code
  SET required_certification_ids = ARRAY[
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Journal Listed Christian Science Nurse'),
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Staff Nurse'),
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Christian Science Nurse IV'),
    (SELECT id FROM public.certifications WHERE org_id = target_org AND name = 'Christian Science Nurse III')
  ]
  WHERE target_code.org_id = target_org
    AND target_code.label IN ('Dcn', 'Ecn')
    AND target_code.focus_area_id = (
      SELECT id FROM public.focus_areas WHERE org_id = target_org AND name = 'Sheltered Care'
    );

  RAISE NOTICE 'Arden Wood configuration cloned from Calm Haven.';
END $$;

DO $$
DECLARE
  target_org uuid := '964c29d1-dc1e-4cd6-861c-8b8ab00d20c0';
BEGIN
  WITH employee_seed (first_name, last_name, cert_abbr, role_abbrs, seniority, focus_area_names) AS (
    VALUES
    ('Connie', 'Wahl', 'JLCSN', ARRAY['DCSN']::text[], 1, ARRAY['Skilled Nursing']::text[]),
    ('Deborah', 'Lee', 'JLCSN', ARRAY['SC Mgr']::text[], 2, ARRAY['Sheltered Care']::text[]),
    ('Robert', 'Miruka', 'JLCSN', ARRAY['Mentor']::text[], 3, ARRAY['Skilled Nursing', 'Visiting CSNS']::text[]),
    ('Rose', 'Keyaer', 'JLCSN', ARRAY['Supv']::text[], 4, ARRAY['Skilled Nursing']::text[]),
    ('Shirley', 'Bihag', 'JLCSN', ARRAY['Supv']::text[], 5, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Queen', 'Nwosu', 'JLCSN', ARRAY['Supv']::text[], 6, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Ben', 'Egwuenu', 'JLCSN', ARRAY['Supv']::text[], 7, ARRAY['Skilled Nursing']::text[]),
    ('Linda', 'Luciani', 'JLCSN', ARRAY['Supv', 'CN']::text[], 8, ARRAY['Skilled Nursing', 'Visiting CSNS']::text[]),
    ('Paul', 'Otieno', 'JLCSN', ARRAY['Supv']::text[], 9, ARRAY['Skilled Nursing']::text[]),
    ('Julius', 'Miruka', 'JLCSN', ARRAY['Supv']::text[], 10, ARRAY['Night Shift']::text[]),
    ('Jared', 'Onsabwa', 'STAFF', ARRAY[]::text[], 11, ARRAY['Skilled Nursing']::text[]),
    ('Emmanuel', 'Odenyi', 'STAFF', ARRAY[]::text[], 12, ARRAY['Sheltered Care']::text[]),
    ('Nicodamus', 'Kosmas', 'STAFF', ARRAY[]::text[], 13, ARRAY['Sheltered Care']::text[]),
    ('Josiah "Joey"', 'Onyechi', 'STAFF', ARRAY[]::text[], 14, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Alice', 'Mburu', 'STAFF', ARRAY[]::text[], 15, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Chris Michael', 'Mawere', 'CSN III', ARRAY[]::text[], 16, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Daniel', 'Ogbonna', 'CSN III', ARRAY[]::text[], 17, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Alphince Junior', 'Baraza', 'CSN III', ARRAY[]::text[], 18, ARRAY['Sheltered Care']::text[]),
    ('Arphaxard Mou "Harry"', 'Ouma', 'CSN II', ARRAY[]::text[], 19, ARRAY['Skilled Nursing', 'Sheltered Care']::text[]),
    ('Mercy', 'Kigera', 'CSN II', ARRAY[]::text[], 20, ARRAY['Skilled Nursing', 'Sheltered Care', 'Visiting CSNS']::text[]),
    ('Vicky', 'Kiende', 'CSN II', ARRAY[]::text[], 21, ARRAY['Skilled Nursing', 'Sheltered Care', 'Night Shift']::text[]),
    ('Grace', 'Kamiti', 'JLCSN', ARRAY['Supv']::text[], 22, ARRAY['Night Shift']::text[]),
    ('Stephen', 'Onsabwa', 'JLCSN', ARRAY['Supv']::text[], 23, ARRAY['Night Shift']::text[]),
    ('Aicha', 'Langel', 'JLCSN', ARRAY['DVCSN']::text[], 24, ARRAY['Visiting CSNS']::text[]),
    ('Sherry', 'Otieno', 'Other', ARRAY['Act Cor']::text[], 25, ARRAY['Sheltered Care']::text[]),
    ('Deborah', 'Gray', 'Other', ARRAY['SC/Act. Cor']::text[], 26, ARRAY['Sheltered Care']::text[])
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
  JOIN public.certifications cert
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
  -- Seed the roster into the next Sunday-start two-week window so the
  -- imported PDF pattern always lands in the current schedule range.
  schedule_start date := CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7);
BEGIN
  INSERT INTO public.shifts (
    emp_id,
    date,
    published_shift_code_ids,
    org_id,
    focus_area_id,
    published_custom_start_time,
    published_custom_end_time
  )
  SELECT
    employee.id,
    schedule_start + (work_seed.shift_date::date - schedule_source_start),
    ARRAY(
      SELECT shift_code.id
      FROM unnest(work_seed.code_labels) AS code_label
      JOIN public.shift_codes shift_code
        ON shift_code.org_id = target_org
       AND shift_code.label = code_label
       AND (
            (work_seed.focus_area_name IS NULL AND shift_code.focus_area_id IS NULL)
            OR shift_code.focus_area_id = focus_area.id
          )
      ORDER BY shift_code.sort_order
    ),
    target_org,
    focus_area.id,
    work_seed.custom_start::time,
    work_seed.custom_end::time
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
  ON CONFLICT (emp_id, date) DO NOTHING;

  INSERT INTO public.shifts (
    emp_id,
    date,
    published_absence_type_id,
    org_id
  )
  SELECT
    employee.id,
    schedule_start + (absence_seed.shift_date::date - schedule_source_start),
    absence_type.id,
    target_org
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
  ON CONFLICT (emp_id, date) DO NOTHING;

  RAISE NOTICE 'Arden Wood shifts and absences seeded (% work shifts, % absences).', 221, 134;
END $$;
