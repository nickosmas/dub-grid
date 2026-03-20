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
  INSERT INTO organizations (id, name, slug, address, phone, timezone, focus_area_label, certification_label, role_label, employee_count)
  VALUES (org, 'Calm Haven', 'calmhaven', '320 Eucalyptus Dr. Santa Cruz, CA 95060', '(831) 555-0700', 'America/Los_Angeles', 'Wings', 'Certifications', 'Roles', 50)
  ON CONFLICT (id) DO UPDATE SET name = 'Calm Haven', slug = 'calmhaven', address = '320 Eucalyptus Dr. Santa Cruz, CA 95060';

  RAISE NOTICE 'Calm Haven organization created.';
END $$;


-- =============================================================================
-- Calm Haven: Focus Areas, Shift Categories, and Shift Codes
-- =============================================================================

DO $$
DECLARE
  org           uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
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

  -- ── Focus Areas ─────────────────────────────────────────────────────────────

  INSERT INTO public.focus_areas (org_id, name, color_bg, color_text, sort_order)
  VALUES
    (org, 'Skilled Nursing', '#FED7AA', '#9A3412', 0),
    (org, 'Sheltered Care',       '#E9D5FF', '#6B21A8', 1),
    (org, 'Night Shift',          '#FECDD3', '#9F1239', 2),
    (org, 'Visiting CSNS',        '#FDE68A', '#92400E', 3)
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO UPDATE
    SET color_bg   = EXCLUDED.color_bg,
        color_text = EXCLUDED.color_text,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO fa_snw  FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';


  -- ── Shift Categories (wipe existing, then insert fresh) ───────────────────────
  DELETE FROM public.shift_categories WHERE org_id = org;

  -- Skilled Nursing
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_snw, 'Day Shift',     '#93C5FD', '07:00', '15:30', 0)
  RETURNING id INTO cat_snw_d;

  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_snw, 'Evening Shift', '#FDE68A', '15:30', '00:00', 1)
  RETURNING id INTO cat_snw_e;

  -- Sheltered Care
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_sc, 'Day Shift',     '#6EE7B7', '07:00', '15:30', 0)
  RETURNING id INTO cat_sc_d;

  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_sc, 'Evening Shift', '#FDE68A', '15:30', '00:00', 1)
  RETURNING id INTO cat_sc_e;

  -- Night Shift
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_ns, 'Night Shift', '#C4B5FD', '00:00', '08:00', 0)
  RETURNING id INTO cat_ns_n;

  -- Visiting CSNS
  INSERT INTO public.shift_categories (org_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (org, fa_vcsn, 'Visiting Nursing', '#67E8F9', '07:00', '15:30', 0)
  RETURNING id INTO cat_vcsn_vn;


  -- ── Shift Codes ───────────────────────────────────────────────────────────────

  -- Global / Off-Day codes
  INSERT INTO public.shift_codes
    (org_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, category_id)
  VALUES
    (org, 'X',   'Off',     '#E2E8F0', 'transparent', '#1E293B', true,  false, NULL, 0, '{}', NULL),
    (org, 'Ofc', 'Office',  '#E2E8F0', 'transparent', '#1E293B', false, true,  NULL, 1, '{}', NULL),
    (org, '0.3', 'Partial', '#E2E8F0', 'transparent', '#1E293B', false, true,  NULL, 2, '{}', NULL)
  ON CONFLICT DO NOTHING;

  -- Skilled Nursing codes
  INSERT INTO public.shift_codes
    (org_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (org, 'D',   'Day',              '#FECACA', 'transparent', '#991B1B', false, false, fa_snw,  0, '{}', '07:00', '15:30', cat_snw_d),
    (org, 'Ds',  'Day (Supervisor)', '#FED7AA', 'transparent', '#9A3412', false, false, fa_snw,  1, '{}', '07:00', '15:30', cat_snw_d),
    (org, '(D)', 'Day Mentoring',    '#E2E8F0', 'transparent', '#1E293B', false, true,  fa_snw,  3, '{}', '07:00', '15:30', cat_snw_d),
    (org, 'E',   'Evening',              '#FECACA', 'transparent', '#991B1B', false, false, fa_snw, 10, '{}', '15:30', '00:00', cat_snw_e),
    (org, 'Es',  'Evening (Supervisor)', '#E9D5FF', 'transparent', '#6B21A8', false, false, fa_snw, 11, '{}', '15:30', '00:00', cat_snw_e)
  ON CONFLICT DO NOTHING;

  -- Sheltered Care codes
  INSERT INTO public.shift_codes
    (org_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (org, 'D',   'Day',          '#FED7AA', 'transparent', '#9A3412', false, false, fa_sc, 0, '{}', '07:00', '15:30', cat_sc_d),
    (org, 'Dcn', 'Day (CN)',     '#BFDBFE', 'transparent', '#1E40AF', false, false, fa_sc, 1, '{}', '07:00', '15:30', cat_sc_d),
    (org, 'E',   'Evening',      '#FED7AA', 'transparent', '#9A3412', false, false, fa_sc, 2, '{}', '15:30', '00:00', cat_sc_e),
    (org, 'Ecn', 'Evening (CN)', '#FBCFE8', 'transparent', '#9D174D', false, false, fa_sc, 3, '{}', '15:30', '00:00', cat_sc_e)
  ON CONFLICT DO NOTHING;

  -- Night Shift codes
  INSERT INTO public.shift_codes
    (org_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (org, 'N',  'Night',              '#FECACA', 'transparent', '#991B1B', false, false, fa_ns, 0, '{}', '00:00', '08:00', cat_ns_n),
    (org, 'Ns', 'Night (Supervisor)', '#BFDBFE', 'transparent', '#1E40AF', false, false, fa_ns, 1, '{}', '00:00', '08:00', cat_ns_n)
  ON CONFLICT DO NOTHING;

  -- Visiting CSNS codes
  INSERT INTO public.shift_codes
    (org_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (org, 'VN', 'Visiting Nursing', '#FECACA', 'transparent', '#991B1B', false, false, fa_vcsn, 0, '{}', '07:00', '15:30', cat_vcsn_vn)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Calm Haven focus areas, shift categories, and shift codes seeded.';
END $$;

-- =============================================================================
-- Seed: certifications, organization_roles, and employees
-- Organization: Calm Haven (b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90)
-- =============================================================================

DO $$
DECLARE
  org uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
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
BEGIN

  -- ── Certifications ──────────────────────────────────────────────────────────
  INSERT INTO public.certifications (org_id, name, abbr, sort_order)
  VALUES
    (org, 'Journal Listed Christian Science Nurse', 'JLCSN',  0),
    (org, 'Staff Nurse',                          'STAFF',  1),
    (org, 'Christian Science Nurse IV',            'CSN IV', 2),
    (org, 'Christian Science Nurse III',           'CSN III',3),
    (org, 'Christian Science Nurse II',            'CSN II', 4),
    (org, 'Christian Science Nurse I',             'CSN I',  5),
    (org, 'Other',                                 'Other',  6)
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO cert_jlcsn FROM public.certifications WHERE org_id = org AND name = 'Journal Listed Christian Science Nurse';
  SELECT id INTO cert_csn4  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse IV';
  SELECT id INTO cert_csn3  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse III';
  SELECT id INTO cert_csn2  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse II';
  SELECT id INTO cert_staff FROM public.certifications WHERE org_id = org AND name = 'Staff Nurse';
  SELECT id INTO cert_other FROM public.certifications WHERE org_id = org AND name = 'Other';

  -- ── Organization Roles ────────────────────────────────────────────────────────
  INSERT INTO public.organization_roles (org_id, name, abbr, sort_order)
  VALUES
    (org, 'Director of Christian Science Nursing',           'DCSN',       0),
    (org, 'Director of Visiting Christian Science Nursing', 'DVCSN',      1),
    (org, 'Director of Christian Science Nursing Training', 'DCSNT',      2),
    (org, 'Assistant Director of Christian Science Nursing','ADCSN',      3),
    (org, 'Supervisor',                                     'Supv',       4),
    (org, 'Mentor',                                         'Mentor',     5),
    (org, 'Christian Science Nurse',                        'CN',         6),
    (org, 'Sheltered Care Manager',                         'SC Mgr',     7),
    (org, 'Activity Coordinator',                           'Act Cor',    8),
    (org, 'SC/Asst/Act/Cor',                                'SC/Act. Cor',9)
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO role_dcsn   FROM public.organization_roles WHERE org_id = org AND abbr = 'DCSN';
  SELECT id INTO role_dvcsn  FROM public.organization_roles WHERE org_id = org AND abbr = 'DVCSN';
  SELECT id INTO role_supv   FROM public.organization_roles WHERE org_id = org AND abbr = 'Supv';
  SELECT id INTO role_mentor FROM public.organization_roles WHERE org_id = org AND abbr = 'Mentor';
  SELECT id INTO role_cn     FROM public.organization_roles WHERE org_id = org AND abbr = 'CN';
  SELECT id INTO role_scmgr  FROM public.organization_roles WHERE org_id = org AND abbr = 'SC Mgr';
  SELECT id INTO role_actcor FROM public.organization_roles WHERE org_id = org AND abbr = 'Act Cor';
  SELECT id INTO role_scasst FROM public.organization_roles WHERE org_id = org AND abbr = 'SC/Act. Cor';

  -- ── Focus Area IDs ──────────────────────────────────────────────────────────
  SELECT id INTO fa_snw  FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';

  -- ── Employees ───────────────────────────────────────────────────────────────
  DELETE FROM public.shifts WHERE org_id = org;
  DELETE FROM public.employees WHERE org_id = org;

  INSERT INTO public.employees
    (org_id, first_name, last_name, certification_id, role_ids, seniority, focus_area_ids)
  VALUES
    -- Skilled Nursing ────────────────────────────────────────────────────
    (org, 'Margaret',       'Sullivan',   cert_jlcsn, ARRAY[role_dcsn],                      1, ARRAY[fa_snw]),
    (org, 'Thomas',         'Crawford',   cert_jlcsn, ARRAY[role_mentor],                    2, ARRAY[fa_snw, fa_sc]),
    (org, 'Carol',          'Henderson',  cert_jlcsn, ARRAY[role_supv],                      3, ARRAY[fa_snw, fa_sc]),
    (org, 'Diane',          'Patterson',  cert_jlcsn, ARRAY[role_supv],                      4, ARRAY[fa_snw, fa_sc]),
    (org, 'Laura',          'Marshall',   cert_jlcsn, ARRAY[role_mentor, role_supv],          5, ARRAY[fa_snw, fa_sc]),
    (org, 'Richard',        'Bennett',    cert_jlcsn, ARRAY[role_supv],                      6, ARRAY[fa_snw, fa_sc]),
    (org, 'Susan',          'Fletcher',   cert_jlcsn, ARRAY[role_supv, role_cn],              7, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (org, 'William',        'Harper',     cert_jlcsn, ARRAY[role_supv],                      8, ARRAY[fa_snw]),
    (org, 'Kenneth',        'Crawford',   cert_jlcsn, ARRAY[role_supv],                      9, ARRAY[fa_snw, fa_ns]),
    (org, 'Nancy',          'Thornton',   cert_jlcsn, ARRAY[]::bigint[],                    10, ARRAY[fa_snw]),
    (org, 'Kevin',          'Donovan',    cert_staff, ARRAY[]::bigint[],                    11, ARRAY[fa_snw]),
    (org, 'Brian',          'Shepherd',   cert_staff, ARRAY[]::bigint[],                    12, ARRAY[fa_snw, fa_sc]),
    (org, 'Timothy',        'Walsh',      cert_staff, ARRAY[]::bigint[],                    13, ARRAY[fa_snw, fa_sc]),
    (org, 'Nathan "Nate"',  'Callahan',   cert_staff, ARRAY[]::bigint[],                    14, ARRAY[fa_snw, fa_sc]),
    (org, 'Janet',          'Morrison',   cert_staff, ARRAY[]::bigint[],                    15, ARRAY[fa_snw, fa_sc]),
    (org, 'Barbara',        'Trent',      cert_staff, ARRAY[]::bigint[],                    16, ARRAY[fa_snw]),
    (org, 'David Michael',  'Spencer',    cert_csn3,  ARRAY[]::bigint[],                    17, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (org, 'Robert',         'Garrison',   cert_csn3,  ARRAY[]::bigint[],                    18, ARRAY[fa_snw, fa_sc]),
    (org, 'Steven',         'Whitfield',  cert_csn3,  ARRAY[]::bigint[],                    19, ARRAY[fa_snw, fa_sc]),
    (org, 'Raymond',        'Caldwell',   cert_csn2,  ARRAY[]::bigint[],                    20, ARRAY[fa_snw, fa_sc]),
    (org, 'Patricia',       'Langford',   cert_csn2,  ARRAY[]::bigint[],                    21, ARRAY[fa_snw, fa_sc]),
    (org, 'Christine',      'Prescott',   cert_csn2,  ARRAY[]::bigint[],                    22, ARRAY[fa_snw, fa_sc]),
    (org, 'Evelyn',         'Hartwell',   cert_jlcsn, ARRAY[role_scmgr],                    23, ARRAY[fa_snw, fa_sc]),
    (org, 'Gloria',         'Jennings',   cert_other, ARRAY[role_actcor],                   24, ARRAY[fa_snw, fa_sc]),
    (org, 'Donna',          'Fowler',     cert_other, ARRAY[role_scasst],                   25, ARRAY[fa_snw, fa_sc]),
    -- Night Shift ─────────────────────────────────────────────────────────────
    (org, 'Hannah',         'Stratton',   cert_jlcsn, ARRAY[role_supv],                     26, ARRAY[fa_ns]),
    (org, 'Vincent',        'Gallagher',  cert_jlcsn, ARRAY[role_supv],                     27, ARRAY[fa_ns]),
    -- Visiting CSNS ───────────────────────────────────────────────────────────
    (org, 'Marilyn',        'Davenport',  cert_jlcsn, ARRAY[role_dvcsn],                    28, ARRAY[fa_vcsn])
  ON CONFLICT (org_id, first_name, last_name) WHERE archived_at IS NULL DO NOTHING;

  -- ── Update required certifications for shift codes ─────────────────────────
  -- Ds, Es (Skilled Nursing): require JLCSN, STAFF, CSN IV
  UPDATE public.shift_codes SET required_certification_ids = ARRAY[cert_jlcsn, cert_staff, cert_csn4]
  WHERE org_id = org AND label = 'Ds' AND focus_area_id = fa_snw;

  UPDATE public.shift_codes SET required_certification_ids = ARRAY[cert_jlcsn, cert_staff, cert_csn4]
  WHERE org_id = org AND label = 'Es' AND focus_area_id = fa_snw;

  -- Dcn, Ecn (Sheltered Care): require JLCSN, STAFF, CSN IV, CSN III
  UPDATE public.shift_codes SET required_certification_ids = ARRAY[cert_jlcsn, cert_staff, cert_csn4, cert_csn3]
  WHERE org_id = org AND label = 'Dcn' AND focus_area_id = fa_sc;

  UPDATE public.shift_codes SET required_certification_ids = ARRAY[cert_jlcsn, cert_staff, cert_csn4, cert_csn3]
  WHERE org_id = org AND label = 'Ecn' AND focus_area_id = fa_sc;

END $$;

-- =============================================================================
-- Seed: shifts  (March 22 – April 4, 2026)
-- Organization: Calm Haven (b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90)
-- =============================================================================

DO $$
DECLARE
  org  uuid := 'b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90';
  -- Focus area IDs
  snw  bigint;
  sc   bigint;
  ns   bigint;
  vc   bigint;
  -- Shift code IDs (global)
  c_x    bigint;  -- Off
  c_ofc  bigint;  -- Office
  c_03   bigint;  -- Partial (0.3)
  -- SNW codes
  c_d_snw    bigint;
  c_ds_snw   bigint;
  c_fd_snw   bigint;  -- (D) mentoring
  c_e_snw    bigint;
  c_es_snw   bigint;
  -- SC codes
  c_d_sc     bigint;
  c_dcn_sc   bigint;
  c_e_sc     bigint;
  c_ecn_sc   bigint;
  -- Night codes
  c_n        bigint;
  c_ns       bigint;
  -- Visiting codes
  c_vn       bigint;
BEGIN
  -- Focus areas
  SELECT id INTO snw FROM public.focus_areas WHERE org_id = org AND name = 'Skilled Nursing';
  SELECT id INTO sc  FROM public.focus_areas WHERE org_id = org AND name = 'Sheltered Care';
  SELECT id INTO ns  FROM public.focus_areas WHERE org_id = org AND name = 'Night Shift';
  SELECT id INTO vc  FROM public.focus_areas WHERE org_id = org AND name = 'Visiting CSNS';

  -- Global codes
  SELECT id INTO c_x   FROM public.shift_codes WHERE org_id = org AND label = 'X'   AND focus_area_id IS NULL;
  SELECT id INTO c_ofc FROM public.shift_codes WHERE org_id = org AND label = 'Ofc' AND focus_area_id IS NULL;
  SELECT id INTO c_03  FROM public.shift_codes WHERE org_id = org AND label = '0.3' AND focus_area_id IS NULL;

  -- SNW codes
  SELECT id INTO c_d_snw   FROM public.shift_codes WHERE org_id = org AND label = 'D'   AND focus_area_id = snw;
  SELECT id INTO c_ds_snw  FROM public.shift_codes WHERE org_id = org AND label = 'Ds'  AND focus_area_id = snw;
  SELECT id INTO c_fd_snw  FROM public.shift_codes WHERE org_id = org AND label = '(D)' AND focus_area_id = snw;
  SELECT id INTO c_e_snw   FROM public.shift_codes WHERE org_id = org AND label = 'E'   AND focus_area_id = snw;
  SELECT id INTO c_es_snw  FROM public.shift_codes WHERE org_id = org AND label = 'Es'  AND focus_area_id = snw;

  -- SC codes
  SELECT id INTO c_d_sc   FROM public.shift_codes WHERE org_id = org AND label = 'D'   AND focus_area_id = sc;
  SELECT id INTO c_dcn_sc FROM public.shift_codes WHERE org_id = org AND label = 'Dcn' AND focus_area_id = sc;
  SELECT id INTO c_e_sc   FROM public.shift_codes WHERE org_id = org AND label = 'E'   AND focus_area_id = sc;
  SELECT id INTO c_ecn_sc FROM public.shift_codes WHERE org_id = org AND label = 'Ecn' AND focus_area_id = sc;

  -- Night codes
  SELECT id INTO c_n  FROM public.shift_codes WHERE org_id = org AND label = 'N'  AND focus_area_id = ns;
  SELECT id INTO c_ns FROM public.shift_codes WHERE org_id = org AND label = 'Ns' AND focus_area_id = ns;

  -- Visiting codes
  SELECT id INTO c_vn FROM public.shift_codes WHERE org_id = org AND label = 'VN' AND focus_area_id = vc;

  -- ── Insert shifts ──────────────────────────────────────────────────────────
  INSERT INTO public.shifts (emp_id, date, published_shift_code_ids, org_id, focus_area_id, custom_start_time, custom_end_time)
  SELECT e.id, v.dt::date, v.codes, org, v.fa_id, v.cstart::time, v.cend::time
  FROM (VALUES

    -- Margaret Sullivan ─────────────────────────────────────────────────────────────
    ('Margaret Sullivan'::text, '2026-03-22'::date, ARRAY[c_x],   NULL::bigint, NULL::text, NULL::text),
    ('Margaret Sullivan',       '2026-03-23', ARRAY[c_x],   NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-24', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-25', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-26', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-27', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-28', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-29', ARRAY[c_x],   NULL, NULL, NULL),
    ('Margaret Sullivan',       '2026-03-30', ARRAY[c_x],   NULL, NULL, NULL),
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
    ('Evelyn Hartwell', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-03-29', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-30', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-03-31', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Evelyn Hartwell', '2026-04-01', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Evelyn Hartwell', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Thomas Crawford ───────────────────────────────────────────────────────────
    ('Thomas Crawford', '2026-03-22', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-23', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-27', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-29', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Thomas Crawford', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Thomas Crawford', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Thomas Crawford', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Thomas Crawford', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Carol Henderson ─────────────────────────────────────────────────────────
    ('Carol Henderson', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-28', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Carol Henderson', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Carol Henderson', '2026-04-02', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Carol Henderson', '2026-04-03', ARRAY[c_e_snw],  snw,  '18:00', '00:00'),
    ('Carol Henderson', '2026-04-04', ARRAY[c_ds_snw], snw,  NULL, NULL),

    -- Diane Patterson ───────────────────────────────────────────────────────
    ('Diane Patterson', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Diane Patterson', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Diane Patterson', '2026-03-24', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Diane Patterson', '2026-03-25', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-26', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-27', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-28', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Diane Patterson', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Diane Patterson', '2026-03-31', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Diane Patterson', '2026-04-01', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-02', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-03', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Diane Patterson', '2026-04-04', ARRAY[c_dcn_sc], sc,   NULL, NULL),

    -- Laura Marshall ─────────────────────────────────────────────────────────
    ('Laura Marshall', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Laura Marshall', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Laura Marshall', '2026-03-24', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-25', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-03-26', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-03-27', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-28', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Laura Marshall', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Laura Marshall', '2026-03-31', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-04-01', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-04-02', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Laura Marshall', '2026-04-03', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Laura Marshall', '2026-04-04', ARRAY[c_es_snw], snw,  NULL, NULL),

    -- Richard Bennett ─────────────────────────────────────────────────────────
    ('Richard Bennett', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Richard Bennett', '2026-03-23', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-24', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-26', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-27', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('Richard Bennett', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Richard Bennett', '2026-03-30', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-03-31', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-01', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-02', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-03', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Richard Bennett', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Susan Fletcher ───────────────────────────────────────────────────────
    ('Susan Fletcher', '2026-03-22', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Susan Fletcher', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Susan Fletcher', '2026-03-25', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-26', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-27', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Susan Fletcher', '2026-03-28', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Susan Fletcher', '2026-03-29', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Susan Fletcher', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Susan Fletcher', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
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
    ('William Harper', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('William Harper', '2026-03-29', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-30', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('William Harper', '2026-04-01', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-04-02', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('William Harper', '2026-04-03', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('William Harper', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Kenneth Crawford (Night + Evening combos) ─────────────────────────────────
    ('Kenneth Crawford', '2026-03-22', ARRAY[c_n],          ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-23', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-03-24', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-03-25', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-03-26', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Kenneth Crawford', '2026-03-27', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-28', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-29', ARRAY[c_n],          ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-03-30', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-03-31', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-04-01', ARRAY[c_x],          NULL, NULL, NULL),
    ('Kenneth Crawford', '2026-04-02', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Kenneth Crawford', '2026-04-03', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Kenneth Crawford', '2026-04-04', ARRAY[c_n],          ns,   NULL, NULL),

    -- Nancy Thornton ────────────────────────────────────────────────────────
    ('Nancy Thornton', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Nancy Thornton', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-25', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nancy Thornton', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),

    -- Kevin Donovan ───────────────────────────────────────────────────────────
    ('Kevin Donovan', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-24', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-03-26', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-27', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-03-31', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-04-01', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Kevin Donovan', '2026-04-02', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-04-03', ARRAY[c_x],     NULL, NULL, NULL),
    ('Kevin Donovan', '2026-04-04', ARRAY[c_x],     NULL, NULL, NULL),

    -- Brian Shepherd (all SC Evening) ────────────────────────────────────────
    ('Brian Shepherd', '2026-03-22', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-23', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-24', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-25', ARRAY[c_x],    NULL, NULL, NULL),
    ('Brian Shepherd', '2026-03-26', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-27', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-28', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-29', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-30', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-03-31', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-04-01', ARRAY[c_x],    NULL, NULL, NULL),
    ('Brian Shepherd', '2026-04-02', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-04-03', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Brian Shepherd', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Timothy Walsh ────────────────────────────────────────────────────────
    ('Timothy Walsh', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Timothy Walsh', '2026-03-23', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Timothy Walsh', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Timothy Walsh', '2026-03-26', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Timothy Walsh', '2026-03-27', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-28', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Timothy Walsh', '2026-03-30', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Timothy Walsh', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Timothy Walsh', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Timothy Walsh', '2026-04-03', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Timothy Walsh', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Nathan "Nate" Callahan ───────────────────────────────────────────────────
    ('Nathan "Nate" Callahan', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('Nathan "Nate" Callahan', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
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
    ('Janet Morrison', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Janet Morrison', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Janet Morrison', '2026-03-28', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Janet Morrison', '2026-03-29', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-03-30', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Janet Morrison', '2026-03-31', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Janet Morrison', '2026-04-01', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Janet Morrison', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Janet Morrison', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Janet Morrison', '2026-04-04', ARRAY[c_ecn_sc], sc,   NULL, NULL),

    -- Barbara Trent ─────────────────────────────────────────────────────────
    ('Barbara Trent', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-24', ARRAY[c_x],     NULL, NULL, NULL),
    ('Barbara Trent', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Barbara Trent', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-28', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-03-31', ARRAY[c_x],     NULL, NULL, NULL),
    ('Barbara Trent', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Barbara Trent', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Barbara Trent', '2026-04-04', ARRAY[c_e_snw], snw,  NULL, NULL),

    -- David Michael Spencer ────────────────────────────────────────────────────
    ('David Michael Spencer', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-24', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-25', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-26', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-03-27', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-03-31', ARRAY[c_vn],    vc,   NULL, NULL),
    ('David Michael Spencer', '2026-04-01', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('David Michael Spencer', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('David Michael Spencer', '2026-04-03', ARRAY[c_x],     NULL, NULL, NULL),
    ('David Michael Spencer', '2026-04-04', ARRAY[c_x],     NULL, NULL, NULL),

    -- Robert Garrison ──────────────────────────────────────────────────────
    ('Robert Garrison', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-23', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-24', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Robert Garrison', '2026-03-26', ARRAY[c_x],     NULL, NULL, NULL),
    ('Robert Garrison', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-28', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-03-31', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Robert Garrison', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Robert Garrison', '2026-04-02', ARRAY[c_x],     NULL, NULL, NULL),
    ('Robert Garrison', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Robert Garrison', '2026-04-04', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Steven Whitfield ─────────────────────────────────────────────────────────
    ('Steven Whitfield', '2026-03-22', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-23', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-24', ARRAY[c_x],     NULL, NULL, NULL),
    ('Steven Whitfield', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Steven Whitfield', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-29', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-30', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-03-31', ARRAY[c_x],     NULL, NULL, NULL),
    ('Steven Whitfield', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Steven Whitfield', '2026-04-02', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-04-03', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Steven Whitfield', '2026-04-04', ARRAY[c_e_sc],  sc,   NULL, NULL),

    -- Raymond Caldwell ──────────────────────────────────────────────────────
    ('Raymond Caldwell', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Raymond Caldwell', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Raymond Caldwell', '2026-03-25', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-26', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-27', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Raymond Caldwell', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Raymond Caldwell', '2026-04-01', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Raymond Caldwell', '2026-04-02', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Raymond Caldwell', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Patricia Langford ────────────────────────────────────────────────────────
    ('Patricia Langford', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-23', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-24', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-25', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Patricia Langford', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Patricia Langford', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-29', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-03-30', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Patricia Langford', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Patricia Langford', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Patricia Langford', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Patricia Langford', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Christine Prescott ────────────────────────────────────────────────────────
    ('Christine Prescott', '2026-03-22', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Christine Prescott', '2026-03-23', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Christine Prescott', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Christine Prescott', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-29', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Christine Prescott', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Christine Prescott', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Christine Prescott', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Christine Prescott', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Christine Prescott', '2026-04-04', ARRAY[c_d_sc],   sc,   NULL, NULL),

    -- Gloria Jennings (Activity Coordinator — all SC) ──────────────────────
    ('Gloria Jennings', '2026-03-22', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-23', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-24', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-03-25', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-26', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-27', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-03-28', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-29', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-30', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-03-31', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-04-01', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-04-02', ARRAY[c_x],    NULL, NULL, NULL),
    ('Gloria Jennings', '2026-04-03', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Gloria Jennings', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Donna Fowler (SC/Asst/Act/Cor — D shifts are SC) ───────────────────
    ('Donna Fowler', '2026-03-22', ARRAY[c_03],   NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-23', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-24', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-25', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-26', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-27', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-28', ARRAY[c_x],    NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-29', ARRAY[c_03],   NULL, NULL, NULL),
    ('Donna Fowler', '2026-03-30', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-03-31', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-04-01', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-04-02', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Donna Fowler', '2026-04-03', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Donna Fowler', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Hannah Stratton ────────────────────────────────────────────────────────
    ('Hannah Stratton', '2026-03-22', ARRAY[c_x],  NULL, NULL, NULL),
    ('Hannah Stratton', '2026-03-23', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-24', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-25', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-26', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-27', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-28', ARRAY[c_x],  NULL, NULL, NULL),
    ('Hannah Stratton', '2026-03-29', ARRAY[c_x],  NULL, NULL, NULL),
    ('Hannah Stratton', '2026-03-30', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-03-31', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-01', ARRAY[c_ns], ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-02', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-03', ARRAY[c_n],  ns,   NULL, NULL),
    ('Hannah Stratton', '2026-04-04', ARRAY[c_x],  NULL, NULL, NULL),

    -- Vincent Gallagher ─────────────────────────────────────────────────────────
    ('Vincent Gallagher', '2026-03-22', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-23', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-24', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-25', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-26', ARRAY[c_x],  NULL, NULL, NULL),
    ('Vincent Gallagher', '2026-03-27', ARRAY[c_x],  NULL, NULL, NULL),
    ('Vincent Gallagher', '2026-03-28', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-29', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-30', ARRAY[c_ns], ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-03-31', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-04-01', ARRAY[c_n],  ns,   NULL, NULL),
    ('Vincent Gallagher', '2026-04-02', ARRAY[c_x],  NULL, NULL, NULL),
    ('Vincent Gallagher', '2026-04-03', ARRAY[c_x],  NULL, NULL, NULL),
    ('Vincent Gallagher', '2026-04-04', ARRAY[c_ns], ns,   NULL, NULL),

    -- Marilyn Davenport ────────────────────────────────────────────────────────
    ('Marilyn Davenport', '2026-03-22', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-23', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-24', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-25', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-26', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-27', ARRAY[c_x],  NULL, NULL, NULL),
    ('Marilyn Davenport', '2026-03-28', ARRAY[c_x],  NULL, NULL, NULL),
    ('Marilyn Davenport', '2026-03-29', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-30', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-03-31', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-04-01', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-04-02', ARRAY[c_vn], vc,   NULL, NULL),
    ('Marilyn Davenport', '2026-04-03', ARRAY[c_x],  NULL, NULL, NULL),
    ('Marilyn Davenport', '2026-04-04', ARRAY[c_x],  NULL, NULL, NULL)

  ) AS v(emp_name, dt, codes, fa_id, cstart, cend)
  JOIN public.employees e ON (e.first_name || ' ' || e.last_name) = v.emp_name AND e.org_id = org
  ON CONFLICT (emp_id, date) DO UPDATE SET
    published_shift_code_ids = EXCLUDED.published_shift_code_ids,
    focus_area_id = EXCLUDED.focus_area_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time;

END $$;
