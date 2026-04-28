-- ==========================================
-- CALM HAVEN SEED SCRIPT
-- ==========================================
-- Realistic healthcare scheduling data for Calm Haven.
-- Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE.

DO $$
DECLARE
  org uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
BEGIN
  -- Organization
  INSERT INTO organizations (
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
    org,
    'Calm Haven',
    'calmhaven',
    '320 Eucalyptus Dr., Santa Cruz, CA 95060, United States',
    '320 Eucalyptus Dr.',
    '',
    'Santa Cruz',
    'CA',
    '95060',
    'United States',
    '(831) 555-0700',
    'America/Los_Angeles',
    'Wings',
    'Certifications',
    'Roles',
    50
  )
  ON CONFLICT (id) DO UPDATE
    SET name = 'Calm Haven',
        slug = 'calmhaven',
        address = '320 Eucalyptus Dr., Santa Cruz, CA 95060, United States',
        address_line_1 = '320 Eucalyptus Dr.',
        address_line_2 = '',
        address_city = 'Santa Cruz',
        address_state = 'CA',
        address_postal_code = '95060',
        address_country = 'United States';

  RAISE NOTICE 'Calm Haven organization created.';
END $$;


-- =============================================================================
-- Calm Haven: Focus Areas, Shift Categories, and Derived Schedule Labels
-- =============================================================================

DO $$
DECLARE
  org           uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
  dept_nursing  bigint;
  dept_visiting bigint;
  dept_admin    bigint;
  dept_hr       bigint;
  fa_snw    bigint;
  fa_sc     bigint;
  fa_ns     bigint;
  fa_vcsn   bigint;
  cat_snw_d   bigint;
  cat_snw_e   bigint;
  cat_sc_d    bigint;
  cat_sc_e    bigint;
  cat_ns_n    bigint;
  cat_vcsn_vn bigint;
BEGIN

  -- ── Departments (scheduled + management) ────────────────────────────────────
  DELETE FROM public.departments WHERE org_id = org;

  INSERT INTO public.departments (org_id, name, type, sort_order)
  VALUES (org, 'Nursing', 'scheduled', 0)
  RETURNING id INTO dept_nursing;

  INSERT INTO public.departments (org_id, name, type, sort_order)
  VALUES (org, 'Visiting', 'scheduled', 1)
  RETURNING id INTO dept_visiting;

  INSERT INTO public.departments (org_id, name, type, sort_order, permissions)
  VALUES (org, 'Administration', 'management', 2, '{
    "canViewSchedule": true, "canEditShifts": true, "canPublishSchedule": true,
    "canApplyRecurringSchedule": true, "canEditNotes": true, "canManageRecurringShifts": true,
    "canManageShiftSeries": true, "canViewStaff": true, "canManageEmployees": true,
    "canManageFocusAreas": true, "canManageScheduleDefinitions": true, "canManageIndicatorTypes": true,
    "canManageOrgSettings": false, "canManageOrgLabels": true,
    "canManageCoverageRequirements": true, "canApproveShiftRequests": true
  }'::jsonb)
  RETURNING id INTO dept_admin;

  INSERT INTO public.departments (org_id, name, type, sort_order, permissions)
  VALUES (org, 'Human Resources', 'management', 3, '{
    "canViewSchedule": true, "canEditShifts": false, "canPublishSchedule": false,
    "canApplyRecurringSchedule": false, "canEditNotes": false, "canManageRecurringShifts": false,
    "canManageShiftSeries": false, "canViewStaff": true, "canManageEmployees": true,
    "canManageFocusAreas": false, "canManageScheduleDefinitions": false, "canManageIndicatorTypes": false,
    "canManageOrgSettings": false, "canManageOrgLabels": false,
    "canManageCoverageRequirements": false, "canApproveShiftRequests": false
  }'::jsonb)
  RETURNING id INTO dept_hr;

  -- ── Focus Areas ─────────────────────────────────────────────────────────────

  INSERT INTO public.focus_areas (org_id, department_id, name, color, sort_order)
  VALUES
    (org, dept_nursing, 'Skilled Nursing', '#BFDBFE', 0),
    (org, dept_nursing, 'Sheltered Care',  '#C7D2FE', 1),
    (org, dept_nursing, 'Night Shift',     '#A5F3FC', 2),
    (org, dept_visiting, 'Visiting CSNS',  '#A7F3D0', 3)
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO UPDATE
    SET department_id = EXCLUDED.department_id,
        color = EXCLUDED.color,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO fa_snw  FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';


  -- ── Shift Categories (wipe existing, then insert fresh) ───────────────────────
  DELETE FROM public.shift_categories WHERE org_id = org;

  -- Skilled Nursing
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_snw, 'Day Shift', 'D', '07:00', '15:30', '#A5F3FC', 0)
  RETURNING id INTO cat_snw_d;

  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_snw, 'Evening Shift', 'E', '15:30', '00:00', '#FDE68A', 1)
  RETURNING id INTO cat_snw_e;

  -- Sheltered Care
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_sc, 'Day Shift', 'D', '07:00', '15:30', '#C7D2FE', 0)
  RETURNING id INTO cat_sc_d;

  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_sc, 'Evening Shift', 'E', '15:30', '00:00', '#DDD6FE', 1)
  RETURNING id INTO cat_sc_e;

  -- Night Shift
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_ns, 'Night Shift', 'N', '00:00', '08:00', '#FECDD3', 0)
  RETURNING id INTO cat_ns_n;

  -- Visiting CSNS
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, abbr, start_time, end_time, color, sort_order)
  VALUES (org, fa_vcsn, 'Visiting Nursing', 'VN', '07:00', '15:30', '#A7F3D0', 0)
  RETURNING id INTO cat_vcsn_vn;


  -- ── Absence Types ──────────────────────────────────────────────────────────────

  INSERT INTO public.absence_types
    (org_id, label, name, color, border_color, text_color, sort_order)
  VALUES
    (org, 'X',    'Off',                    '#E2E8F0', 'transparent', '#1E293B', 0),
    (org, 'V',    'Vacation',               '#A5F3FC', 'transparent', '#155E75', 1),
    (org, 'S',    'Sick',                   '#FECDD3', 'transparent', '#9F1239', 2),
    (org, 'PTO',  'Paid Time Off',          '#FDE68A', 'transparent', '#92400E', 3),
    (org, 'P',    'Personal',               '#DDD6FE', 'transparent', '#5B21B6', 4),
    (org, 'B',    'Bereavement',            '#BAE6FD', 'transparent', '#075985', 5),
    (org, 'J',    'Jury Duty',              '#C7D2FE', 'transparent', '#3730A3', 6),
    (org, 'H',    'Holiday',                '#BBF7D0', 'transparent', '#166534', 7),
    (org, 'CME',  'Education / Training',   '#D9F99D', 'transparent', '#3F6212', 8),
    (org, 'FMLA', 'Family / Medical Leave', '#FBCFE8', 'transparent', '#9D174D', 9),
    (org, 'UX',   'Unpaid Leave',           '#FED7AA', 'transparent', '#9A3412', 10)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Calm Haven focus areas, shift categories, and absence types seeded.';
END $$;

-- =============================================================================
-- Seed: certifications, organization_roles, and employees
-- Organization: Calm Haven (b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90)
-- =============================================================================

DO $$
DECLARE
  org uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
  -- Department IDs
  dept_nursing  bigint;
  dept_visiting bigint;
  -- Certification IDs
  cert_jlcsn  bigint;
  cert_staff  bigint;
  cert_csn4   bigint;
  cert_csn3   bigint;
  cert_csn2   bigint;
  cert_other  bigint;
  -- Role IDs
  role_dcsn   bigint;
  role_dvcsn  bigint;
  role_supv   bigint;
  role_mentor bigint;
  role_cn     bigint;
  role_scmgr  bigint;
  role_actcor bigint;
  role_scasst bigint;
  -- Focus Area IDs
  fa_snw  bigint;
  fa_sc   bigint;
  fa_ns   bigint;
  fa_vcsn bigint;
  shift_snw_d bigint;
  shift_snw_e bigint;
  shift_sc_d bigint;
  shift_sc_e bigint;
  shift_ns_n bigint;
  shift_vcsn_vn bigint;
BEGIN

  -- ── Look up department IDs ──────────────────────────────────────────────────
  SELECT id INTO dept_nursing  FROM public.departments WHERE org_id = org AND name = 'Nursing';
  SELECT id INTO dept_visiting FROM public.departments WHERE org_id = org AND name = 'Visiting';

  -- ── Certifications ──────────────────────────────────────────────────────────
  INSERT INTO public.certifications (org_id, department_id, name, abbr, sort_order)
  VALUES
    (org, dept_nursing,  'Journal Listed Christian Science Nurse', 'JLCSN',  0),
    (org, dept_nursing,  'Nurse',                                'Nurse',  1),
    (org, dept_nursing,  'Christian Science Nurse IV',            'CSN IV', 2),
    (org, dept_nursing,  'Christian Science Nurse III',           'CSN III',3),
    (org, dept_nursing,  'Christian Science Nurse II',            'CSN II', 4),
    (org, dept_nursing,  'Christian Science Nurse I',             'CSN I',  5),
    (org, NULL,          'Other',                                 'Other',  6)
  ON CONFLICT (org_id, name, COALESCE(department_id, -1)) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO cert_jlcsn FROM public.certifications WHERE org_id = org AND name = 'Journal Listed Christian Science Nurse';
  SELECT id INTO cert_csn4  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse IV';
  SELECT id INTO cert_csn3  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse III';
  SELECT id INTO cert_csn2  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse II';
  SELECT id INTO cert_staff FROM public.certifications WHERE org_id = org AND name = 'Nurse';
  SELECT id INTO cert_other FROM public.certifications WHERE org_id = org AND name = 'Other';

  -- ── Organization Roles ────────────────────────────────────────────────────────
  INSERT INTO public.organization_roles (org_id, department_id, name, abbr, sort_order)
  VALUES
    (org, dept_nursing,  'Director of Christian Science Nursing',           'DCSN',       0),
    (org, dept_visiting, 'Director of Visiting Christian Science Nursing', 'DVCSN',      1),
    (org, dept_nursing,  'Director of Christian Science Nursing Training', 'DCSNT',      2),
    (org, dept_nursing,  'Assistant Director of Christian Science Nursing','ADCSN',      3),
    (org, NULL,          'Supervisor',                                     'Supv',       4),
    (org, NULL,          'Mentor',                                         'Mentor',     5),
    (org, NULL,          'Nurse',                                          'Nurse',      6),
    (org, dept_nursing,  'Sheltered Care Manager',                         'SC Mgr',     7),
    (org, dept_nursing,  'Activity Coordinator',                           'Act Cor',    8),
    (org, dept_nursing,  'SC/Asst/Act/Cor',                                'SC/Act. Cor',9)
  ON CONFLICT (org_id, name, COALESCE(department_id, -1)) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO role_dcsn   FROM public.organization_roles WHERE org_id = org AND abbr = 'DCSN';
  SELECT id INTO role_dvcsn  FROM public.organization_roles WHERE org_id = org AND abbr = 'DVCSN';
  SELECT id INTO role_supv   FROM public.organization_roles WHERE org_id = org AND abbr = 'Supv';
  SELECT id INTO role_mentor FROM public.organization_roles WHERE org_id = org AND abbr = 'Mentor';
  SELECT id INTO role_cn     FROM public.organization_roles WHERE org_id = org AND abbr = 'Nurse';
  SELECT id INTO role_scmgr  FROM public.organization_roles WHERE org_id = org AND abbr = 'SC Mgr';
  SELECT id INTO role_actcor FROM public.organization_roles WHERE org_id = org AND abbr = 'Act Cor';
  SELECT id INTO role_scasst FROM public.organization_roles WHERE org_id = org AND abbr = 'SC/Act. Cor';

  -- ── Focus Area IDs ──────────────────────────────────────────────────────────
  SELECT id INTO fa_snw  FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';
  SELECT id INTO shift_snw_d FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_snw AND name = 'Day Shift';
  SELECT id INTO shift_snw_e FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_snw AND name = 'Evening Shift';
  SELECT id INTO shift_sc_d FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_sc AND name = 'Day Shift';
  SELECT id INTO shift_sc_e FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_sc AND name = 'Evening Shift';
  SELECT id INTO shift_ns_n FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_ns AND name = 'Night Shift';
  SELECT id INTO shift_vcsn_vn FROM public.shift_categories WHERE org_id = org AND focus_area_id = fa_vcsn AND name = 'Visiting Nursing';

  DELETE FROM public.jobs WHERE org_id = org;

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
    shift_time_overrides,
    shift_color_overrides,
    default_start_time,
    default_end_time,
    default_duration_hours,
    default_duration_minutes,
    sort_order,
    system_key
  )
  VALUES
    (
      org, 'Office', 'Ofc', true, 'shiftless', 'and',
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, 8, 0, 0, NULL
    ),
    (
      org, 'Partial', '0.3', true, 'shiftless', 'and',
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '{}'::bigint[],
      '#FDE68A', 'transparent', '#92400E',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, 3, 0, 1, NULL
    ),
    (
      org, 'Nurse', 'Nurse', true, 'with_shift', 'and',
      ARRAY[fa_snw, fa_sc, fa_ns, fa_vcsn],
      ARRAY[dept_nursing, dept_visiting],
      ARRAY[shift_snw_d, shift_snw_e, shift_sc_d, shift_sc_e, shift_ns_n, shift_vcsn_vn],
      '{}'::bigint[],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, NULL, NULL, 2, NULL
    ),
    (
      org, 'Staff', 'Staff', true, 'with_shift', 'and',
      ARRAY[fa_sc],
      ARRAY[dept_nursing],
      ARRAY[shift_sc_d, shift_sc_e],
      ARRAY[role_actcor, role_scasst],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, NULL, NULL, 3, NULL
    ),
    (
      org, 'Supervisor', 'S', true, 'with_shift', 'and',
      ARRAY[fa_snw, fa_ns],
      ARRAY[dept_nursing],
      ARRAY[shift_snw_d, shift_snw_e, shift_ns_n],
      ARRAY[role_supv],
      ARRAY[cert_jlcsn, cert_staff, cert_csn4],
      '#E2E8F0', 'transparent', '#1E293B',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, NULL, NULL, 4, NULL
    ),
    (
      org, 'Mentor', 'M', true, 'with_shift', 'and',
      ARRAY[fa_snw, fa_sc],
      ARRAY[dept_nursing],
      ARRAY[shift_snw_d, shift_sc_d],
      ARRAY[role_mentor],
      '{}'::bigint[],
      '#E2E8F0', 'transparent', '#1E293B',
      '{}'::jsonb, '{}'::jsonb,
      NULL, NULL, NULL, NULL, 5, NULL
    );

  -- ── Employees ───────────────────────────────────────────────────────────────
  DELETE FROM public.schedule_cells WHERE org_id = org;
  DELETE FROM public.employees WHERE org_id = org;

  INSERT INTO public.employees
    (org_id, first_name, last_name, certification_id, role_ids, seniority, focus_area_ids, status)
  VALUES
    -- Skilled Nursing ────────────────────────────────────────────────────
    (org, 'Margaret',       'Sullivan',   cert_jlcsn, ARRAY[role_dcsn],                      1, ARRAY[fa_snw],                  'active'),
    (org, 'Thomas',         'Crawford',   cert_jlcsn, ARRAY[role_mentor],                    2, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Carol',          'Henderson',  cert_jlcsn, ARRAY[role_supv],                      3, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Diane',          'Patterson',  cert_jlcsn, ARRAY[role_supv],                      4, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Laura',          'Marshall',   cert_jlcsn, ARRAY[role_mentor, role_supv],          5, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Richard',        'Bennett',    cert_jlcsn, ARRAY[role_supv],                      6, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Susan',          'Fletcher',   cert_jlcsn, ARRAY[role_supv, role_cn],              7, ARRAY[fa_snw, fa_vcsn, fa_sc],  'active'),
    (org, 'William',        'Harper',     cert_jlcsn, ARRAY[role_supv],                      8, ARRAY[fa_snw],                  'active'),
    (org, 'Kenneth',        'Crawford',   cert_jlcsn, ARRAY[role_supv],                      9, ARRAY[fa_snw, fa_ns],           'active'),
    (org, 'Nancy',          'Thornton',   cert_jlcsn, ARRAY[]::bigint[],                    10, ARRAY[fa_snw],                  'active'),
    (org, 'Kevin',          'Donovan',    cert_staff, ARRAY[]::bigint[],                    11, ARRAY[fa_snw],                  'active'),
    (org, 'Brian',          'Shepherd',   cert_staff, ARRAY[]::bigint[],                    12, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Timothy',        'Walsh',      cert_staff, ARRAY[]::bigint[],                    13, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Nathan "Nate"',  'Callahan',   cert_staff, ARRAY[]::bigint[],                    14, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Janet',          'Morrison',   cert_staff, ARRAY[]::bigint[],                    15, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Barbara',        'Trent',      cert_staff, ARRAY[]::bigint[],                    16, ARRAY[fa_snw],                  'active'),
    (org, 'David Michael',  'Spencer',    cert_csn3,  ARRAY[]::bigint[],                    17, ARRAY[fa_snw, fa_vcsn, fa_sc],  'active'),
    (org, 'Robert',         'Garrison',   cert_csn3,  ARRAY[]::bigint[],                    18, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Steven',         'Whitfield',  cert_csn3,  ARRAY[]::bigint[],                    19, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Raymond',        'Caldwell',   cert_csn2,  ARRAY[]::bigint[],                    20, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Patricia',       'Langford',   cert_csn2,  ARRAY[]::bigint[],                    21, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Christine',      'Prescott',   cert_csn2,  ARRAY[]::bigint[],                    22, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Evelyn',         'Hartwell',   cert_jlcsn, ARRAY[role_scmgr],                    23, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Gloria',         'Jennings',   cert_other, ARRAY[role_actcor],                   24, ARRAY[fa_snw, fa_sc],           'active'),
    (org, 'Donna',          'Fowler',     cert_other, ARRAY[role_scasst],                   25, ARRAY[fa_snw, fa_sc],           'active'),
    -- Night Shift ─────────────────────────────────────────────────────────────
    (org, 'Hannah',         'Stratton',   cert_jlcsn, ARRAY[role_supv],                     26, ARRAY[fa_ns],                   'active'),
    (org, 'Vincent',        'Gallagher',  cert_jlcsn, ARRAY[role_supv],                     27, ARRAY[fa_ns],                   'active'),
    -- Visiting CSNS ───────────────────────────────────────────────────────────
    (org, 'Marilyn',        'Davenport',  cert_jlcsn, ARRAY[role_dvcsn],                    28, ARRAY[fa_vcsn],                 'active')
  ON CONFLICT (org_id, first_name, last_name) WHERE archived_at IS NULL DO NOTHING;

  -- ── Assign some employees to management departments ─────────────────────────
  -- ~20% of employees get a management department assignment
  -- Sullivan & Crawford are admins (get dept permission template), others are users
  UPDATE public.employees SET
    department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = org AND name = 'Administration')],
    dept_admin_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = org AND name = 'Administration')]
  WHERE org_id = org AND last_name IN ('Sullivan', 'Crawford');

  UPDATE public.employees SET
    department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = org AND name = 'Administration')]
  WHERE org_id = org AND last_name IN ('Henderson', 'Patterson', 'Hartwell');

  -- Davenport is an admin in HR
  UPDATE public.employees SET
    department_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = org AND name = 'Human Resources')],
    dept_admin_ids = ARRAY[(SELECT id FROM public.departments WHERE org_id = org AND name = 'Human Resources')]
  WHERE org_id = org AND last_name IN ('Davenport');

END $$;

-- =============================================================================
-- Seed: shifts + absences  (April 19 – May 2, 2026)
-- Organization: Calm Haven (b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90)
-- =============================================================================

DO $$
DECLARE
  org  uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
  schedule_source_start date := DATE '2026-03-22';
  schedule_target_start date := DATE '2026-04-19';
  -- Focus area IDs
  snw  bigint;
  sc   bigint;
  ns   bigint;
  vc   bigint;
  shift_snw_d bigint;
  shift_snw_e bigint;
  shift_sc_d bigint;
  shift_sc_e bigint;
  shift_ns_n bigint;
  shift_vcsn_vn bigint;
  job_office bigint;
  job_partial bigint;
  job_nurse bigint;
  job_staff bigint;
  job_supervisor bigint;
  job_mentor bigint;
  role_actcor bigint;
  role_scasst bigint;
  -- Work labels
  c_ofc  text := 'Ofc';
  c_03   text := '0.3';
  -- Absence type IDs
  at_x   bigint;  -- Off (absence type)
  c_d_snw    text := 'D';
  c_ds_snw   text := 'Ds';
  c_fd_snw   text := '(D)';
  c_fd_sc    text := '(D)';
  c_e_snw    text := 'E';
  c_es_snw   text := 'Es';
  c_d_sc     text := 'D';
  c_dcn_sc   text := 'Dcn';
  c_e_sc     text := 'E';
  c_ecn_sc   text := 'Ecn';
  c_n        text := 'N';
  c_ns       text := 'Ns';
  c_vn       text := 'VN';
  work_row   RECORD;
  absence_row RECORD;
BEGIN
  -- Focus areas
  SELECT id INTO snw FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO sc  FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO ns  FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO vc  FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';
  SELECT id INTO shift_snw_d FROM public.shift_categories WHERE org_id = org AND focus_area_id = snw AND name = 'Day Shift';
  SELECT id INTO shift_snw_e FROM public.shift_categories WHERE org_id = org AND focus_area_id = snw AND name = 'Evening Shift';
  SELECT id INTO shift_sc_d FROM public.shift_categories WHERE org_id = org AND focus_area_id = sc AND name = 'Day Shift';
  SELECT id INTO shift_sc_e FROM public.shift_categories WHERE org_id = org AND focus_area_id = sc AND name = 'Evening Shift';
  SELECT id INTO shift_ns_n FROM public.shift_categories WHERE org_id = org AND focus_area_id = ns AND name = 'Night Shift';
  SELECT id INTO shift_vcsn_vn FROM public.shift_categories WHERE org_id = org AND focus_area_id = vc AND name = 'Visiting Nursing';
  SELECT id INTO job_office FROM public.jobs WHERE org_id = org AND name = 'Office';
  SELECT id INTO job_partial FROM public.jobs WHERE org_id = org AND name = 'Partial';
  SELECT id INTO job_nurse FROM public.jobs WHERE org_id = org AND name = 'Nurse';
  SELECT id INTO job_staff FROM public.jobs WHERE org_id = org AND name = 'Staff';
  SELECT id INTO job_supervisor FROM public.jobs WHERE org_id = org AND name = 'Supervisor';
  SELECT id INTO job_mentor FROM public.jobs WHERE org_id = org AND name = 'Mentor';
  SELECT id INTO role_actcor FROM public.organization_roles WHERE org_id = org AND abbr = 'Act Cor';
  SELECT id INTO role_scasst FROM public.organization_roles WHERE org_id = org AND abbr = 'SC/Act. Cor';

  -- Absence types
  SELECT id INTO at_x FROM public.absence_types WHERE org_id = org AND label = 'X';

  -- ── Insert work shifts ────────────────────────────────────────────────────
  FOR work_row IN
    SELECT
      e.id AS emp_id,
      schedule_target_start + (v.dt::date - schedule_source_start) AS shift_date,
      v.codes AS labels,
      v.fa_id AS focus_area_id,
      v.cstart::text AS custom_start_time,
      v.cend::text AS custom_end_time,
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
          WHEN '(D)' THEN CASE WHEN v.fa_id = sc THEN shift_sc_d ELSE shift_snw_d END
          WHEN 'D' THEN CASE WHEN v.fa_id = sc THEN shift_sc_d ELSE shift_snw_d END
          WHEN 'E' THEN CASE WHEN v.fa_id = sc THEN shift_sc_e ELSE shift_snw_e END
          ELSE NULL::bigint
        END
        FROM unnest(v.codes) WITH ORDINALITY AS selected(code_label, ord)
        ORDER BY selected.ord
      ) AS shift_ids,
      ARRAY(
        SELECT CASE selected.code_label
          WHEN 'Ofc' THEN job_office
          WHEN '0.3' THEN job_partial
          WHEN 'Ds' THEN job_supervisor
          WHEN 'Es' THEN job_supervisor
          WHEN 'Ns' THEN job_supervisor
          WHEN '(D)' THEN job_mentor
          WHEN 'Dcn' THEN job_nurse
          WHEN 'Ecn' THEN job_nurse
          ELSE CASE
            WHEN e.role_ids && ARRAY[role_actcor, role_scasst] THEN job_staff
            ELSE job_nurse
          END
        END
        FROM unnest(v.codes) WITH ORDINALITY AS selected(code_label, ord)
        ORDER BY selected.ord
      ) AS job_ids
    FROM (VALUES

    -- Margaret Sullivan ─────────────────────────────────────────────────────────────
    ('Margaret Sullivan'::text, '2026-03-24'::date, ARRAY[c_ofc], NULL::bigint, NULL::text, NULL::text),
    ('Margaret Sullivan',       '2026-03-25', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-26', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-27', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-28', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-31', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-04-01', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-04-02', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-04-03', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-04-04', ARRAY[c_ofc], NULL, NULL, NULL),

    -- Evelyn Hartwell (SC. Mgr.) ─────────────────────────────────────────────────
    ('Evelyn Hartwell', '2026-03-22', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-23', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-24', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-25', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-03-26', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-03-29', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-30', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-31', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-04-01', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),

    -- Thomas Crawford ───────────────────────────────────────────────────────────
    ('Thomas Crawford', '2026-03-22', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-23', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-27', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-29', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Carol Henderson ─────────────────────────────────────────────────────────
    ('Carol Henderson', '2026-03-28', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Carol Henderson', '2026-04-02', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Carol Henderson', '2026-04-03', ARRAY[c_e_snw],  snw,  '18:00', '00:00'),
    ('Carol Henderson', '2026-04-04', ARRAY[c_ds_snw], snw,  NULL, NULL),

    -- Diane Patterson ───────────────────────────────────────────────────────
    ('Diane Patterson', '2026-03-24', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Diane Patterson', '2026-03-25', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-26', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-27', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-28', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-31', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Diane Patterson', '2026-04-01', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-02', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-03', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-04', ARRAY[c_dcn_sc], sc,   NULL, NULL),

    -- Laura Marshall ─────────────────────────────────────────────────────────
    ('Laura Marshall', '2026-03-24', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-25', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-03-26', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-03-27', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-28', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-31', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-04-01', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-04-02', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-04-03', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-04-04', ARRAY[c_es_snw], snw,  NULL, NULL),

    -- Richard Bennett ─────────────────────────────────────────────────────────
    ('Richard Bennett', '2026-03-23', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-24', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-26', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-27', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-30', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-31', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-01', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-02', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-03', ARRAY[c_ds_snw], snw,  NULL, NULL),

    -- Susan Fletcher ───────────────────────────────────────────────────────
    ('Susan Fletcher', '2026-03-22', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-25', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-26', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-27', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Susan Fletcher', '2026-03-28', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Susan Fletcher', '2026-03-29', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Susan Fletcher', '2026-04-01', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Susan Fletcher', '2026-04-02', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Susan Fletcher', '2026-04-03', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Susan Fletcher', '2026-04-04', ARRAY[c_vn],     vc,   NULL, NULL),

    -- William Harper ─────────────────────────────────────────────────────────
    ('William Harper', '2026-03-22', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-23', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-24', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('William Harper', '2026-03-25', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-26', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-27', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-29', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-30', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('William Harper', '2026-04-01', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-04-02', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-04-03', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Kenneth Crawford (Night + Evening combos) ─────────────────────────────────
    ('Kenneth Crawford', '2026-03-22', ARRAY[c_n],          ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-26', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Kenneth Crawford', '2026-03-27', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-28', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-29', ARRAY[c_n],          ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-04-02', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Kenneth Crawford', '2026-04-03', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-04-04', ARRAY[c_n],          ns,   NULL, NULL),

    -- Nancy Thornton ────────────────────────────────────────────────────────
    ('Nancy Thornton', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-25', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Kevin Donovan ───────────────────────────────────────────────────────────
    ('Kevin Donovan', '2026-03-24', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-03-31', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-04-01', ARRAY[c_e_snw], snw,  NULL, NULL),

    -- Brian Shepherd (all SC Evening) ────────────────────────────────────────
    ('Brian Shepherd', '2026-03-22', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-23', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-24', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-26', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-27', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-28', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-29', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-30', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-31', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-04-02', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-04-03', ARRAY[c_e_sc], sc,   NULL, NULL),

    -- Timothy Walsh ────────────────────────────────────────────────────────
    ('Timothy Walsh', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Timothy Walsh', '2026-03-23', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-26', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Timothy Walsh', '2026-03-27', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-28', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Timothy Walsh', '2026-03-30', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Timothy Walsh', '2026-04-03', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Nathan "Nate" Callahan ───────────────────────────────────────────────────
    ('Nathan "Nate" Callahan', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-31', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-04-01', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-04-02', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-04-03', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-04-04', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Janet Morrison ─────────────────────────────────────────────────────
    ('Janet Morrison', '2026-03-22', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-03-23', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Janet Morrison', '2026-03-24', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-03-25', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Janet Morrison', '2026-03-28', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Janet Morrison', '2026-03-29', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-03-30', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Janet Morrison', '2026-03-31', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-04-01', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Janet Morrison', '2026-04-04', ARRAY[c_ecn_sc], sc,   NULL, NULL),

    -- Barbara Trent ─────────────────────────────────────────────────────────
    ('Barbara Trent', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-28', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-04-04', ARRAY[c_e_snw], snw,  NULL, NULL),

    -- David Michael Spencer ────────────────────────────────────────────────────
    ('David Michael Spencer', '2026-03-24', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-25', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-26', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-31', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-04-01', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('David Michael Spencer', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Robert Garrison ──────────────────────────────────────────────────────
    ('Robert Garrison', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-23', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-24', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-28', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-31', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-04-04', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Steven Whitfield ─────────────────────────────────────────────────────────
    ('Steven Whitfield', '2026-03-22', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-23', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-29', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-30', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-04-02', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-04-03', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-04-04', ARRAY[c_e_sc],  sc,   NULL, NULL),

    -- Raymond Caldwell ──────────────────────────────────────────────────────
    ('Raymond Caldwell', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-03-25', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-26', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-27', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-04-01', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-04-02', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Patricia Langford ────────────────────────────────────────────────────────
    ('Patricia Langford', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-23', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-24', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-25', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-29', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-30', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Patricia Langford', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Christine Prescott ────────────────────────────────────────────────────────
    ('Christine Prescott', '2026-03-22', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Christine Prescott', '2026-03-23', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-29', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Christine Prescott', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-04-04', ARRAY[c_d_sc],   sc,   NULL, NULL),

    -- Gloria Jennings (Activity Coordinator — all SC) ──────────────────────
    ('Gloria Jennings', '2026-03-24', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-03-27', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-03-31', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-04-03', ARRAY[c_d_sc], sc,   NULL, NULL),

    -- Donna Fowler (SC/Asst/Act/Cor — D shifts are SC) ───────────────────
    ('Donna Fowler', '2026-03-22', ARRAY[c_03],   NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-23', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-24', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-25', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-26', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-27', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-29', ARRAY[c_03],   NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-30', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-31', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-04-01', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-04-02', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-04-03', ARRAY[c_ofc],  NULL, NULL, NULL),

    -- Hannah Stratton ────────────────────────────────────────────────────────
    ('Hannah Stratton', '2026-03-23', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-24', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-25', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-26', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-27', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-30', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-31', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-01', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-02', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-03', ARRAY[c_n],  ns,   NULL, NULL),

    -- Vincent Gallagher ─────────────────────────────────────────────────────────
    ('Vincent Gallagher', '2026-03-22', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-23', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-24', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-25', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-28', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-29', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-30', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-31', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-04-01', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-04-04', ARRAY[c_ns], ns,   NULL, NULL),

    -- Marilyn Davenport ────────────────────────────────────────────────────────
    ('Marilyn Davenport', '2026-03-22', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-23', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-24', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-25', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-26', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-29', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-30', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-31', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-04-01', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-04-02', ARRAY[c_vn], vc,   NULL, NULL)

    ) AS v(emp_name, dt, codes, fa_id, cstart, cend)
    JOIN public.employees e ON (e.first_name || ' ' || e.last_name) = v.emp_name AND e.org_id = org
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      org,
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
      NULL
    );
  END LOOP;

  -- ── Insert absence entries ──────────────────────────────────────────────
  FOR absence_row IN
    SELECT
      e.id AS emp_id,
      schedule_target_start + (v.dt::date - schedule_source_start) AS shift_date
    FROM (VALUES
    -- Margaret Sullivan
    ('Margaret Sullivan'::text, '2026-03-22'::date),
    ('Margaret Sullivan',       '2026-03-23'),
    ('Margaret Sullivan',       '2026-03-29'),
    ('Margaret Sullivan',       '2026-03-30'),
    -- Evelyn Hartwell
    ('Evelyn Hartwell', '2026-03-27'),
    ('Evelyn Hartwell', '2026-03-28'),
    ('Evelyn Hartwell', '2026-04-03'),
    ('Evelyn Hartwell', '2026-04-04'),
    -- Thomas Crawford
    ('Thomas Crawford', '2026-03-25'),
    ('Thomas Crawford', '2026-03-26'),
    ('Thomas Crawford', '2026-04-01'),
    ('Thomas Crawford', '2026-04-02'),
    -- Carol Henderson
    ('Carol Henderson', '2026-03-22'),
    ('Carol Henderson', '2026-03-23'),
    ('Carol Henderson', '2026-03-24'),
    ('Carol Henderson', '2026-03-25'),
    ('Carol Henderson', '2026-03-26'),
    ('Carol Henderson', '2026-03-27'),
    ('Carol Henderson', '2026-03-29'),
    ('Carol Henderson', '2026-03-30'),
    ('Carol Henderson', '2026-03-31'),
    ('Carol Henderson', '2026-04-01'),
    -- Diane Patterson
    ('Diane Patterson', '2026-03-22'),
    ('Diane Patterson', '2026-03-23'),
    ('Diane Patterson', '2026-03-29'),
    ('Diane Patterson', '2026-03-30'),
    -- Laura Marshall
    ('Laura Marshall', '2026-03-22'),
    ('Laura Marshall', '2026-03-23'),
    ('Laura Marshall', '2026-03-29'),
    ('Laura Marshall', '2026-03-30'),
    -- Richard Bennett
    ('Richard Bennett', '2026-03-22'),
    ('Richard Bennett', '2026-03-28'),
    ('Richard Bennett', '2026-03-29'),
    ('Richard Bennett', '2026-04-04'),
    -- Susan Fletcher
    ('Susan Fletcher', '2026-03-23'),
    ('Susan Fletcher', '2026-03-24'),
    ('Susan Fletcher', '2026-03-30'),
    ('Susan Fletcher', '2026-03-31'),
    -- William Harper
    ('William Harper', '2026-03-28'),
    ('William Harper', '2026-04-04'),
    -- Kenneth Crawford
    ('Kenneth Crawford', '2026-03-23'),
    ('Kenneth Crawford', '2026-03-24'),
    ('Kenneth Crawford', '2026-03-25'),
    ('Kenneth Crawford', '2026-03-30'),
    ('Kenneth Crawford', '2026-03-31'),
    ('Kenneth Crawford', '2026-04-01'),
    -- Nancy Thornton
    ('Nancy Thornton', '2026-03-22'),
    ('Nancy Thornton', '2026-03-28'),
    -- Kevin Donovan
    ('Kevin Donovan', '2026-03-22'),
    ('Kevin Donovan', '2026-03-23'),
    ('Kevin Donovan', '2026-03-26'),
    ('Kevin Donovan', '2026-03-27'),
    ('Kevin Donovan', '2026-03-28'),
    ('Kevin Donovan', '2026-03-29'),
    ('Kevin Donovan', '2026-03-30'),
    ('Kevin Donovan', '2026-04-02'),
    ('Kevin Donovan', '2026-04-03'),
    ('Kevin Donovan', '2026-04-04'),
    -- Brian Shepherd
    ('Brian Shepherd', '2026-03-25'),
    ('Brian Shepherd', '2026-04-01'),
    ('Brian Shepherd', '2026-04-04'),
    -- Timothy Walsh
    ('Timothy Walsh', '2026-03-24'),
    ('Timothy Walsh', '2026-03-25'),
    ('Timothy Walsh', '2026-03-31'),
    ('Timothy Walsh', '2026-04-01'),
    -- Nathan "Nate" Callahan
    ('Nathan "Nate" Callahan', '2026-03-22'),
    ('Nathan "Nate" Callahan', '2026-03-23'),
    ('Nathan "Nate" Callahan', '2026-03-29'),
    ('Nathan "Nate" Callahan', '2026-03-30'),
    -- Janet Morrison
    ('Janet Morrison', '2026-03-26'),
    ('Janet Morrison', '2026-03-27'),
    ('Janet Morrison', '2026-04-02'),
    ('Janet Morrison', '2026-04-03'),
    -- Barbara Trent
    ('Barbara Trent', '2026-03-24'),
    ('Barbara Trent', '2026-03-25'),
    ('Barbara Trent', '2026-03-31'),
    ('Barbara Trent', '2026-04-01'),
    -- David Michael Spencer
    ('David Michael Spencer', '2026-03-22'),
    ('David Michael Spencer', '2026-03-23'),
    ('David Michael Spencer', '2026-03-27'),
    ('David Michael Spencer', '2026-03-28'),
    ('David Michael Spencer', '2026-03-29'),
    ('David Michael Spencer', '2026-03-30'),
    ('David Michael Spencer', '2026-04-03'),
    ('David Michael Spencer', '2026-04-04'),
    -- Robert Garrison
    ('Robert Garrison', '2026-03-25'),
    ('Robert Garrison', '2026-03-26'),
    ('Robert Garrison', '2026-04-01'),
    ('Robert Garrison', '2026-04-02'),
    -- Steven Whitfield
    ('Steven Whitfield', '2026-03-24'),
    ('Steven Whitfield', '2026-03-25'),
    ('Steven Whitfield', '2026-03-31'),
    ('Steven Whitfield', '2026-04-01'),
    -- Raymond Caldwell
    ('Raymond Caldwell', '2026-03-23'),
    ('Raymond Caldwell', '2026-03-24'),
    ('Raymond Caldwell', '2026-03-30'),
    ('Raymond Caldwell', '2026-03-31'),
    -- Patricia Langford
    ('Patricia Langford', '2026-03-26'),
    ('Patricia Langford', '2026-03-27'),
    ('Patricia Langford', '2026-04-02'),
    ('Patricia Langford', '2026-04-03'),
    -- Christine Prescott
    ('Christine Prescott', '2026-03-26'),
    ('Christine Prescott', '2026-03-27'),
    ('Christine Prescott', '2026-04-02'),
    ('Christine Prescott', '2026-04-03'),
    -- Gloria Jennings
    ('Gloria Jennings', '2026-03-22'),
    ('Gloria Jennings', '2026-03-23'),
    ('Gloria Jennings', '2026-03-25'),
    ('Gloria Jennings', '2026-03-26'),
    ('Gloria Jennings', '2026-03-28'),
    ('Gloria Jennings', '2026-03-29'),
    ('Gloria Jennings', '2026-03-30'),
    ('Gloria Jennings', '2026-04-01'),
    ('Gloria Jennings', '2026-04-02'),
    ('Gloria Jennings', '2026-04-04'),
    -- Donna Fowler
    ('Donna Fowler', '2026-03-28'),
    ('Donna Fowler', '2026-04-04'),
    -- Hannah Stratton
    ('Hannah Stratton', '2026-03-22'),
    ('Hannah Stratton', '2026-03-28'),
    ('Hannah Stratton', '2026-03-29'),
    ('Hannah Stratton', '2026-04-04'),
    -- Vincent Gallagher
    ('Vincent Gallagher', '2026-03-26'),
    ('Vincent Gallagher', '2026-03-27'),
    ('Vincent Gallagher', '2026-04-02'),
    ('Vincent Gallagher', '2026-04-03'),
    -- Marilyn Davenport
    ('Marilyn Davenport', '2026-03-27'),
    ('Marilyn Davenport', '2026-03-28'),
    ('Marilyn Davenport', '2026-04-03'),
    ('Marilyn Davenport', '2026-04-04')
    ) AS v(emp_name, dt)
    JOIN public.employees e ON (e.first_name || ' ' || e.last_name) = v.emp_name AND e.org_id = org
  LOOP
    PERFORM public.write_schedule_cell_snapshot_internal(
      org,
      absence_row.emp_id,
      absence_row.shift_date,
      'published',
      'absence',
      '{}'::BIGINT[],
      '{}'::BIGINT[],
      at_x,
      NULL,
      NULL,
      NULL,
      FALSE,
      NULL,
      NULL,
      NULL
    );
  END LOOP;

END $$;
