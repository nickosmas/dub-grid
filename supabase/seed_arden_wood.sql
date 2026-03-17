-- ==========================================
-- ARDEN WOOD ADMIN SETUP SCRIPT
-- ==========================================
-- 1. Ensure schema.sql has been run first so `organizations`, `profiles` etc exist.
-- 2. Run this block in the Supabase SQL Editor.
-- 3. It will automatically find or create the user and assign them as admin to Arden Wood.

DO $$
DECLARE
  org uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  admin_user_id uuid;
BEGIN
  -- Organization
  INSERT INTO organizations (id, name, slug, address, phone, timezone, focus_area_label, certification_label, role_label, employee_count)
  VALUES (org, 'Arden Wood', 'ardenwood', '445 Wawona St. San Francisco, CA 94116', '(415) 681-5500', 'America/Los_Angeles', 'Wings', 'Certifications', 'Roles', 50)
  ON CONFLICT (id) DO UPDATE SET name = 'Arden Wood', slug = 'ardenwood', address = '445 Wawona St. San Francisco, CA 94116';

  -- Find or create the target user
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'nicokosmas@outlook.com';

  IF admin_user_id IS NULL THEN
    admin_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone, phone_change,
      phone_change_token, reauthentication_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000', admin_user_id, 'authenticated', 'authenticated',
      'nicokosmas@outlook.com', crypt('password123', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), admin_user_id, admin_user_id::text,
      format('{"sub":"%s","email":"%s"}', admin_user_id::text, 'nicokosmas@outlook.com')::jsonb,
      'email', now(), now(), now()
    );
  ELSE
    -- Re-set the password to password123 just in case, and assure confirmed email
    UPDATE auth.users
    SET encrypted_password = crypt('password123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = admin_user_id;
  END IF;

  -- Assign profile (active organization pointer + platform role)
  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (admin_user_id, org, 'none', 'Nic', 'Kosmas')
  ON CONFLICT (id) DO UPDATE
    SET org_id     = EXCLUDED.org_id,
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = NOW();

  -- Add organization membership
  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (admin_user_id, org, 'super_admin')
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role;

  RAISE NOTICE 'Successfully added nicokosmas@outlook.com as a super_admin to Arden Wood.';
END $$;


-- =============================================================================
-- Arden Wood: Focus Areas, Shift Categories, and Shift Codes
-- =============================================================================
-- Run after migrations 054 and 055 have been applied.
-- Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE.
-- =============================================================================

DO $$
DECLARE
  org           uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
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
  -- focus_area_id = NULL means global (off-days, floats, office).
  -- Each focus-area-specific code stores the FK directly on the row.

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
    (org, 'Dcn', 'Day (CN)',         '#C7D2FE', 'transparent', '#3730A3', false, false, fa_snw,  2, '{}', '07:00', '15:30', cat_snw_d),
    (org, '(D)', 'Day (Float)',      '#E2E8F0', 'transparent', '#1E293B', false, true,  fa_snw,  3, '{}', '07:00', '15:30', cat_snw_d),
    (org, 'E',   'Evening',              '#FECACA', 'transparent', '#991B1B', false, false, fa_snw, 10, '{}', '15:30', '00:00', cat_snw_e),
    (org, 'Es',  'Evening (Supervisor)', '#E9D5FF', 'transparent', '#6B21A8', false, false, fa_snw, 11, '{}', '15:30', '00:00', cat_snw_e),
    (org, 'Ecn', 'Evening (CN)',         '#DDD6FE', 'transparent', '#5B21B6', false, false, fa_snw, 12, '{}', '15:30', '00:00', cat_snw_e)
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

  RAISE NOTICE 'Arden Wood focus areas, shift categories, and shift codes seeded.';
END $$;
-- ==========================================
-- SEED: Regular user for Arden Wood
-- ==========================================
-- Run in the Supabase SQL Editor.
-- Safe to re-run — uses ON CONFLICT / IF checks.

DO $$
DECLARE
  org uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  new_user_id uuid;
BEGIN
  -- Find or create the target user
  SELECT id INTO new_user_id
  FROM auth.users
  WHERE email = 'nicodamusalois@gmail.com';

  IF new_user_id IS NULL THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone, phone_change,
      phone_change_token, reauthentication_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
      'nicodamusalois@gmail.com', crypt('password123', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), new_user_id, new_user_id::text,
      format('{"sub":"%s","email":"%s"}', new_user_id::text, 'nicodamusalois@gmail.com')::jsonb,
      'email', now(), now(), now()
    );
  ELSE
    -- Re-set password and ensure email is confirmed
    UPDATE auth.users
    SET encrypted_password = crypt('password123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = new_user_id;
  END IF;

  -- Assign profile (active organization pointer + platform role)
  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (new_user_id, org, 'none', 'Nick', 'Kosmas')
  ON CONFLICT (id) DO UPDATE
    SET org_id     = EXCLUDED.org_id,
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = NOW();

  -- Add organization membership
  INSERT INTO public.organization_memberships (user_id, org_id, org_role)
  VALUES (new_user_id, org, 'user')
  ON CONFLICT (user_id, org_id) DO UPDATE
    SET org_role = EXCLUDED.org_role;

  RAISE NOTICE 'Successfully added nicodamusalois@gmail.com as a regular user to Arden Wood.';
END $$;
-- =============================================================================
-- Seed: certifications, organization_roles, and employees
-- Organization: Arden Wood (dae224d9-4125-4dba-be4d-b8b27149f846)
--
-- Run after arden_admin_seed.sql (which creates the organization + focus areas).
-- Safe to re-run — uses ON CONFLICT DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  org uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  -- Certification IDs
  cert_jlcsn  bigint;
  cert_staff  bigint;
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
  fa_snw  integer;
  fa_sc   integer;
  fa_ns   integer;
  fa_vcsn integer;
BEGIN

  -- ── Certifications ──────────────────────────────────────────────────────────
  INSERT INTO public.certifications (org_id, name, abbr, sort_order)
  VALUES
    (org, 'Journal Listed Christian Science Nurse',   'JLCSN',   0),
    (org, 'Christian Science Nurse IV',  'CSN IV', 1),
    (org, 'Christian Science Nurse III',  'CSN III', 1),
    (org, 'Christian Science Nurse II',   'CSN II',  2),
    (org, 'Christian Science Nurse I',   'CSN I',  2),
    (org, 'Staff Nurse',    'STAFF',   3),
    (org, 'Other',          'Other',   4)
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO NOTHING;

  SELECT id INTO cert_jlcsn FROM public.certifications WHERE org_id = org AND name = 'Journal Listed Christian Science Nurse';
  SELECT id INTO cert_csn3  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse III';
  SELECT id INTO cert_csn2  FROM public.certifications WHERE org_id = org AND name = 'Christian Science Nurse II';
  SELECT id INTO cert_staff FROM public.certifications WHERE org_id = org AND name = 'Staff Nurse';
  SELECT id INTO cert_other FROM public.certifications WHERE org_id = org AND name = 'Other';

  -- ── Organization Roles ────────────────────────────────────────────────────────
  INSERT INTO public.organization_roles (org_id, name, abbr, sort_order)
  VALUES
    (org, 'Director of Christian Science Nursing',                  'DCSN',    0),
    (org, 'Assistant Director of Christian Science Nursing',                  'ADCSN',    0),
    (org, 'Assistant Director of Christian Science Nursing Training',                  'ADCSNT',    0),
    (org, 'Director of Visiting Christian Science Nursing',                 'DVCSN',   1),
    (org, 'Supervisor',                   'Supv',    2),
    (org, 'Mentor',                'Mentor',  3),
    (org, 'Christian Science Nurse',                    'CN',      4),
    (org, 'Sheltered Care Manager',             'SC Mgr',  5),
    (org, 'Activity Coordinator',  'Act Cor', 6),
    (org, 'SC/Asst/Act/Cor',       'SC/Act. Cor', 7)
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
    (org_id, name, certification_id, role_ids, seniority, focus_area_ids)
  VALUES
    -- Skilled Nursing ────────────────────────────────────────────────────
    (org, 'Connie Wahl',           cert_jlcsn, ARRAY[role_dcsn],                      1, ARRAY[fa_snw]),
    (org, 'Robert Miruka',         cert_jlcsn, ARRAY[role_mentor],                    2, ARRAY[fa_snw, fa_sc]),
    (org, 'Rose Keyaer',           cert_jlcsn, ARRAY[role_supv],                      3, ARRAY[fa_snw, fa_sc]),
    (org, 'Shirley Bihag',         cert_jlcsn, ARRAY[role_supv],                      4, ARRAY[fa_snw, fa_sc]),
    (org, 'Queen Nwosu',           cert_jlcsn, ARRAY[role_mentor, role_supv],          5, ARRAY[fa_snw, fa_sc]),
    (org, 'Ben Egwuenu',           cert_jlcsn, ARRAY[role_supv],                      6, ARRAY[fa_snw, fa_sc]),
    (org, 'Linda Luciani',         cert_jlcsn, ARRAY[role_supv, role_cn],              7, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (org, 'Paul Otieno',           cert_jlcsn, ARRAY[role_supv],                      8, ARRAY[fa_snw]),
    (org, 'Julius Miruka',         cert_jlcsn, ARRAY[role_supv],                      9, ARRAY[fa_snw, fa_ns]),
    (org, 'Becky Hoskyn',          cert_jlcsn, ARRAY[]::bigint[],                    10, ARRAY[fa_snw]),
    (org, 'Jared Onsabwa',         cert_staff, ARRAY[]::bigint[],                    11, ARRAY[fa_snw]),
    (org, 'Emmanuel Odenyi',       cert_staff, ARRAY[]::bigint[],                    12, ARRAY[fa_snw, fa_sc]),
    (org, 'Nicodamus Kosmas',      cert_staff, ARRAY[]::bigint[],                    13, ARRAY[fa_snw, fa_sc]),
    (org, 'Josiah "Joey" Onyechi', cert_staff, ARRAY[]::bigint[],                    14, ARRAY[fa_snw, fa_sc]),
    (org, 'Alice Mburu',           cert_staff, ARRAY[]::bigint[],                    15, ARRAY[fa_snw, fa_sc]),
    (org, 'Alayne Reed',           cert_staff, ARRAY[]::bigint[],                    16, ARRAY[fa_snw]),
    (org, 'Chris Michael Mawere',  cert_csn3,  ARRAY[]::bigint[],                    17, ARRAY[fa_snw, fa_vcsn, fa_sc]),
    (org, 'Daniel Ogbonna',        cert_csn3,  ARRAY[]::bigint[],                    18, ARRAY[fa_snw, fa_sc]),
    (org, 'Alphince Baraza',       cert_csn3,  ARRAY[]::bigint[],                    19, ARRAY[fa_snw, fa_sc]),
    (org, 'Arphaxard Ouma',        cert_csn2,  ARRAY[]::bigint[],                    20, ARRAY[fa_snw, fa_sc]),
    (org, 'Mercy Kigera',          cert_csn2,  ARRAY[]::bigint[],                    21, ARRAY[fa_snw, fa_sc]),
    (org, 'Vicky Kiende',          cert_csn2,  ARRAY[]::bigint[],                    22, ARRAY[fa_snw, fa_sc]),
    (org, 'Deborah Lee',           cert_jlcsn, ARRAY[role_scmgr],                    23, ARRAY[fa_snw, fa_sc]),
    (org, 'Sherry Otieno',         cert_other, ARRAY[role_actcor],                   24, ARRAY[fa_snw, fa_sc]),
    (org, 'Deborah Gray',          cert_other, ARRAY[role_scasst],                   25, ARRAY[fa_snw, fa_sc]),
    -- Night Shift ─────────────────────────────────────────────────────────────
    (org, 'Grace Kamiti',          cert_jlcsn, ARRAY[role_supv],                     26, ARRAY[fa_ns]),
    (org, 'Stephen Onsabwa',       cert_jlcsn, ARRAY[role_supv],                     27, ARRAY[fa_ns]),
    -- Visiting CSNS ───────────────────────────────────────────────────────────
    (org, 'Aicha Langel',          cert_jlcsn, ARRAY[role_dvcsn],                    28, ARRAY[fa_vcsn])
  ON CONFLICT (org_id, name) WHERE archived_at IS NULL DO NOTHING;

END $$;
-- =============================================================================
-- Seed: shifts  (March 22 – April 4, 2026)
-- Organization: Arden Wood (dae224d9-4125-4dba-be4d-b8b27149f846)
--
-- Run AFTER seed_employees.sql (which creates certifications, roles, employees).
-- Looks up emp_id by name and shift_code by label + focus_area_id.
-- Safe to re-run — ON CONFLICT updates published_shift_code_ids + focus_area_id.
-- =============================================================================

DO $$
DECLARE
  org  uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  -- Focus area IDs
  snw  integer;
  sc   integer;
  ns   integer;
  vc   integer;
  -- Shift code IDs (global)
  c_x    integer;  -- Off
  c_ofc  integer;  -- Office
  c_03   integer;  -- Partial (0.3)
  -- SNW codes
  c_d_snw    integer;
  c_ds_snw   integer;
  c_dcn_snw  integer;
  c_fd_snw   integer;  -- (D) float
  c_e_snw    integer;
  c_es_snw   integer;
  c_ecn_snw  integer;
  -- SC codes
  c_d_sc     integer;
  c_dcn_sc   integer;
  c_e_sc     integer;
  c_ecn_sc   integer;
  -- Night codes
  c_n        integer;
  c_ns       integer;
  -- Visiting codes
  c_vn       integer;
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
  SELECT id INTO c_dcn_snw FROM public.shift_codes WHERE org_id = org AND label = 'Dcn' AND focus_area_id = snw;
  SELECT id INTO c_fd_snw  FROM public.shift_codes WHERE org_id = org AND label = '(D)' AND focus_area_id = snw;
  SELECT id INTO c_e_snw   FROM public.shift_codes WHERE org_id = org AND label = 'E'   AND focus_area_id = snw;
  SELECT id INTO c_es_snw  FROM public.shift_codes WHERE org_id = org AND label = 'Es'  AND focus_area_id = snw;
  SELECT id INTO c_ecn_snw FROM public.shift_codes WHERE org_id = org AND label = 'Ecn' AND focus_area_id = snw;

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
  -- v: (emp_name, date, code_ids int[], focus_area_id, custom_start, custom_end)
  INSERT INTO public.shifts (emp_id, date, published_shift_code_ids, org_id, focus_area_id, custom_start_time, custom_end_time)
  SELECT e.id, v.dt::date, v.codes, org, v.fa_id, v.cstart::time, v.cend::time
  FROM (VALUES

    -- Connie Wahl ─────────────────────────────────────────────────────────────
    ('Connie Wahl'::text, '2026-03-22'::date, ARRAY[c_x],   NULL::integer, NULL::text, NULL::text),
    ('Connie Wahl',       '2026-03-23', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-24', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-25', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-26', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-27', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-28', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-29', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-30', ARRAY[c_x],   NULL, NULL, NULL),
    ('Connie Wahl',       '2026-03-31', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-04-01', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-04-02', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-04-03', ARRAY[c_ofc], NULL, NULL, NULL),
    ('Connie Wahl',       '2026-04-04', ARRAY[c_ofc], NULL, NULL, NULL),

    -- Deborah Lee (SC. Mgr.) ─────────────────────────────────────────────────
    ('Deborah Lee', '2026-03-22', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-23', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-24', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-25', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-26', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-03-29', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-30', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-03-31', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Deborah Lee', '2026-04-01', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Deborah Lee', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Deborah Lee', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Robert Miruka ───────────────────────────────────────────────────────────
    ('Robert Miruka', '2026-03-22', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-23', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-27', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-29', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Robert Miruka', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Robert Miruka', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Robert Miruka', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Rose Keyaer ─────────────────────────────────────────────────────────────
    ('Rose Keyaer', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-28', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Rose Keyaer', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Rose Keyaer', '2026-04-02', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Rose Keyaer', '2026-04-03', ARRAY[c_e_snw],  snw,  '18:00', '00:00'),
    ('Rose Keyaer', '2026-04-04', ARRAY[c_ds_snw], snw,  NULL, NULL),

    -- Shirley Bihag ───────────────────────────────────────────────────────────
    ('Shirley Bihag', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-24', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Shirley Bihag', '2026-03-25', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-26', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-27', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-28', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Shirley Bihag', '2026-03-31', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Shirley Bihag', '2026-04-01', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-04-02', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-04-03', ARRAY[c_dcn_sc], sc,   NULL, NULL),
    ('Shirley Bihag', '2026-04-04', ARRAY[c_dcn_sc], sc,   NULL, NULL),

    -- Queen Nwosu ─────────────────────────────────────────────────────────────
    ('Queen Nwosu', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-24', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-25', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-26', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-03-27', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-28', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Queen Nwosu', '2026-03-31', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-04-01', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-04-02', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Queen Nwosu', '2026-04-03', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Queen Nwosu', '2026-04-04', ARRAY[c_es_snw], snw,  NULL, NULL),

    -- Ben Egwuenu ─────────────────────────────────────────────────────────────
    ('Ben Egwuenu', '2026-03-22', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-23', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-24', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-26', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-27', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-29', ARRAY[c_x],      NULL, NULL, NULL),
    ('Ben Egwuenu', '2026-03-30', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-03-31', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-04-01', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-04-02', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-04-03', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Ben Egwuenu', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Linda Luciani ───────────────────────────────────────────────────────────
    ('Linda Luciani', '2026-03-22', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-25', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-26', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-27', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-03-28', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-03-29', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Linda Luciani', '2026-04-01', ARRAY[c_ds_snw], snw,  NULL, NULL),
    ('Linda Luciani', '2026-04-02', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Linda Luciani', '2026-04-03', ARRAY[c_vn],     vc,   NULL, NULL),
    ('Linda Luciani', '2026-04-04', ARRAY[c_vn],     vc,   NULL, NULL),

    -- Paul Otieno ─────────────────────────────────────────────────────────────
    ('Paul Otieno', '2026-03-22', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-23', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-24', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-25', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-26', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-27', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-28', ARRAY[c_x],      NULL, NULL, NULL),
    ('Paul Otieno', '2026-03-29', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-30', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-04-01', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-04-02', ARRAY[c_es_snw], snw,  NULL, NULL),
    ('Paul Otieno', '2026-04-03', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Paul Otieno', '2026-04-04', ARRAY[c_x],      NULL, NULL, NULL),

    -- Julius Miruka (Night + Evening combos) ─────────────────────────────────
    ('Julius Miruka', '2026-03-22', ARRAY[c_n],          ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-23', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-24', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-25', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-26', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Julius Miruka', '2026-03-27', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-28', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-29', ARRAY[c_n],          ns,   NULL, NULL),
    ('Julius Miruka', '2026-03-30', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-03-31', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-04-01', ARRAY[c_x],          NULL, NULL, NULL),
    ('Julius Miruka', '2026-04-02', ARRAY[c_e_snw, c_ns], ns,  NULL, NULL),
    ('Julius Miruka', '2026-04-03', ARRAY[c_ns],         ns,   NULL, NULL),
    ('Julius Miruka', '2026-04-04', ARRAY[c_n],          ns,   NULL, NULL),

    -- Becky Hoskyn ────────────────────────────────────────────────────────────
    ('Becky Hoskyn', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Becky Hoskyn', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-25', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Becky Hoskyn', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),

    -- Jared Onsabwa ───────────────────────────────────────────────────────────
    ('Jared Onsabwa', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-24', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-03-26', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-27', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-03-31', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-04-01', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Jared Onsabwa', '2026-04-02', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-04-03', ARRAY[c_x],     NULL, NULL, NULL),
    ('Jared Onsabwa', '2026-04-04', ARRAY[c_x],     NULL, NULL, NULL),

    -- Emmanuel Odenyi (all SC Evening) ────────────────────────────────────────
    ('Emmanuel Odenyi', '2026-03-22', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-23', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-24', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-25', ARRAY[c_x],    NULL, NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-26', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-27', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-28', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-29', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-30', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-03-31', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-01', ARRAY[c_x],    NULL, NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-02', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-03', ARRAY[c_e_sc], sc,   NULL, NULL),
    ('Emmanuel Odenyi', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Nicodamus Kosmas ────────────────────────────────────────────────────────
    ('Nicodamus Kosmas', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-23', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-25', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-26', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-27', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-28', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-30', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-04-01', ARRAY[c_x],      NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-04-02', ARRAY[c_ofc],    NULL, NULL, NULL),
    ('Nicodamus Kosmas', '2026-04-03', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Nicodamus Kosmas', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Josiah "Joey" Onyechi ───────────────────────────────────────────────────
    ('Josiah "Joey" Onyechi', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-24', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-25', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-03-31', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-01', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-02', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-03', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Josiah "Joey" Onyechi', '2026-04-04', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Alice Mburu ─────────────────────────────────────────────────────────────
    ('Alice Mburu', '2026-03-22', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-23', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-24', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-25', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-03-28', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-29', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-03-30', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Alice Mburu', '2026-03-31', ARRAY[c_ecn_sc], sc,   NULL, NULL),
    ('Alice Mburu', '2026-04-01', ARRAY[c_e_sc],   sc,   NULL, NULL),
    ('Alice Mburu', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Alice Mburu', '2026-04-04', ARRAY[c_ecn_sc], sc,   NULL, NULL),

    -- Alayne Reed ─────────────────────────────────────────────────────────────
    ('Alayne Reed', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-23', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-24', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-03-26', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-28', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-03-31', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alayne Reed', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Alayne Reed', '2026-04-04', ARRAY[c_e_snw], snw,  NULL, NULL),

    -- Chris Michael Mawere ────────────────────────────────────────────────────
    ('Chris Michael Mawere', '2026-03-22', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-23', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-24', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-25', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-26', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-03-27', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-28', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-29', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-30', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-03-31', ARRAY[c_vn],    vc,   NULL, NULL),
    ('Chris Michael Mawere', '2026-04-01', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Chris Michael Mawere', '2026-04-02', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Chris Michael Mawere', '2026-04-03', ARRAY[c_x],     NULL, NULL, NULL),
    ('Chris Michael Mawere', '2026-04-04', ARRAY[c_x],     NULL, NULL, NULL),

    -- Daniel Ogbonna ──────────────────────────────────────────────────────────
    ('Daniel Ogbonna', '2026-03-22', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-23', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-24', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-26', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-03-27', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-28', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-03-29', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-30', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-03-31', ARRAY[c_d_sc],  sc,   NULL, NULL),
    ('Daniel Ogbonna', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-04-02', ARRAY[c_x],     NULL, NULL, NULL),
    ('Daniel Ogbonna', '2026-04-03', ARRAY[c_d_snw], snw,  NULL, NULL),
    ('Daniel Ogbonna', '2026-04-04', ARRAY[c_d_snw], snw,  NULL, NULL),

    -- Alphince Baraza ─────────────────────────────────────────────────────────
    ('Alphince Baraza', '2026-03-22', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-23', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-24', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-25', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-03-26', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-27', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-28', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-29', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-30', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-03-31', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-04-01', ARRAY[c_x],     NULL, NULL, NULL),
    ('Alphince Baraza', '2026-04-02', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-04-03', ARRAY[c_e_snw], snw,  NULL, NULL),
    ('Alphince Baraza', '2026-04-04', ARRAY[c_e_sc],  sc,   NULL, NULL),

    -- Arphaxard Ouma ──────────────────────────────────────────────────────────
    ('Arphaxard Ouma', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-23', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-24', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-25', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-26', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-27', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-03-28', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-29', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-03-30', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-03-31', ARRAY[c_x],      NULL, NULL, NULL),
    ('Arphaxard Ouma', '2026-04-01', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Arphaxard Ouma', '2026-04-02', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-04-03', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Arphaxard Ouma', '2026-04-04', ARRAY[c_e_snw],  snw,  NULL, NULL),

    -- Mercy Kigera ────────────────────────────────────────────────────────────
    ('Mercy Kigera', '2026-03-22', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-23', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-24', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-25', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-29', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-03-30', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Mercy Kigera', '2026-03-31', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Mercy Kigera', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Mercy Kigera', '2026-04-04', ARRAY[c_fd_snw], snw,  NULL, NULL),

    -- Vicky Kiende ────────────────────────────────────────────────────────────
    ('Vicky Kiende', '2026-03-22', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Vicky Kiende', '2026-03-23', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-24', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-25', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-26', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-27', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-03-28', ARRAY[c_d_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-29', ARRAY[c_d_sc],   sc,   NULL, NULL),
    ('Vicky Kiende', '2026-03-30', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-03-31', ARRAY[c_fd_snw], snw,  NULL, NULL),
    ('Vicky Kiende', '2026-04-01', ARRAY[c_e_snw],  snw,  NULL, NULL),
    ('Vicky Kiende', '2026-04-02', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-04-03', ARRAY[c_x],      NULL, NULL, NULL),
    ('Vicky Kiende', '2026-04-04', ARRAY[c_d_sc],   sc,   NULL, NULL),

    -- Sherry Otieno (Activity Coordinator — all SC) ──────────────────────────
    ('Sherry Otieno', '2026-03-22', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-23', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-24', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-25', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-26', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-27', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-03-28', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-29', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-30', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-03-31', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-04-01', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-04-02', ARRAY[c_x],    NULL, NULL, NULL),
    ('Sherry Otieno', '2026-04-03', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Sherry Otieno', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Deborah Gray (SC/Asst/Act/Cor — D shifts are SC) ───────────────────────
    ('Deborah Gray', '2026-03-22', ARRAY[c_03],   NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-23', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-24', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-25', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-26', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-27', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-28', ARRAY[c_x],    NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-29', ARRAY[c_03],   NULL, NULL, NULL),
    ('Deborah Gray', '2026-03-30', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-03-31', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-04-01', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-04-02', ARRAY[c_d_sc], sc,   NULL, NULL),
    ('Deborah Gray', '2026-04-03', ARRAY[c_ofc],  NULL, NULL, NULL),
    ('Deborah Gray', '2026-04-04', ARRAY[c_x],    NULL, NULL, NULL),

    -- Grace Kamiti ────────────────────────────────────────────────────────────
    ('Grace Kamiti', '2026-03-22', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-23', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-24', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-25', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-26', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-27', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-28', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-29', ARRAY[c_x],  NULL, NULL, NULL),
    ('Grace Kamiti', '2026-03-30', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-03-31', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-04-01', ARRAY[c_ns], ns,   NULL, NULL),
    ('Grace Kamiti', '2026-04-02', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-04-03', ARRAY[c_n],  ns,   NULL, NULL),
    ('Grace Kamiti', '2026-04-04', ARRAY[c_x],  NULL, NULL, NULL),

    -- Stephen Onsabwa ─────────────────────────────────────────────────────────
    ('Stephen Onsabwa', '2026-03-22', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-23', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-24', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-25', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-26', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-27', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-03-28', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-29', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-30', ARRAY[c_ns], ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-03-31', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-04-01', ARRAY[c_n],  ns,   NULL, NULL),
    ('Stephen Onsabwa', '2026-04-02', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-04-03', ARRAY[c_x],  NULL, NULL, NULL),
    ('Stephen Onsabwa', '2026-04-04', ARRAY[c_ns], ns,   NULL, NULL),

    -- Aicha Langel ────────────────────────────────────────────────────────────
    ('Aicha Langel', '2026-03-22', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-23', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-24', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-25', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-26', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-27', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-03-28', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-03-29', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-30', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-03-31', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-04-01', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-04-02', ARRAY[c_vn], vc,   NULL, NULL),
    ('Aicha Langel', '2026-04-03', ARRAY[c_x],  NULL, NULL, NULL),
    ('Aicha Langel', '2026-04-04', ARRAY[c_x],  NULL, NULL, NULL)

  ) AS v(emp_name, dt, codes, fa_id, cstart, cend)
  JOIN public.employees e ON e.name = v.emp_name AND e.org_id = org
  ON CONFLICT (emp_id, date) DO UPDATE SET
    published_shift_code_ids = EXCLUDED.published_shift_code_ids,
    focus_area_id = EXCLUDED.focus_area_id,
    custom_start_time = EXCLUDED.custom_start_time,
    custom_end_time = EXCLUDED.custom_end_time;

END $$;
