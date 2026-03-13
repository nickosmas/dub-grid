-- ==========================================
-- ARDEN WOOD ADMIN SETUP SCRIPT
-- ==========================================
-- 1. Ensure schema.sql has been run first so `companies`, `profiles` etc exist.
-- 2. Run this block in the Supabase SQL Editor. 
-- 3. It will automatically find or create the user and assign them as admin to Arden Wood.

DO $$
DECLARE
  company uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  admin_user_id uuid;
BEGIN
  -- Organization
  INSERT INTO companies (id, name, slug) VALUES (company, 'Arden Wood', 'ardenwood')
  ON CONFLICT (id) DO UPDATE SET name = 'Arden Wood', slug = 'ardenwood';

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

  -- Assign profile (active company pointer + platform role)
  INSERT INTO public.profiles (id, company_id, platform_role)
  VALUES (admin_user_id, company, 'none')
  ON CONFLICT (id) DO UPDATE
    SET company_id  = EXCLUDED.company_id,
        updated_at  = NOW();

  -- Add company membership
  INSERT INTO public.company_memberships (user_id, company_id, company_role)
  VALUES (admin_user_id, company, 'super_admin')
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET company_role = EXCLUDED.company_role;

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
  company       uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
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

  INSERT INTO public.focus_areas (company_id, name, color_bg, color_text, sort_order)
  VALUES
    (company, 'Skilled Nursing', '#BFDBFE', '#1E40AF', 0),
    (company, 'Sheltered Care',       '#A7F3D0', '#065F46', 1),
    (company, 'Night Shift',          '#DDD6FE', '#4C1D95', 2),
    (company, 'Visiting CSNS',        '#A5F3FC', '#155E75', 3)
  ON CONFLICT (company_id, name) WHERE archived_at IS NULL DO UPDATE
    SET color_bg   = EXCLUDED.color_bg,
        color_text = EXCLUDED.color_text,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO fa_snw  FROM public.focus_areas WHERE company_id = company AND name = 'Skilled Nursing';
  SELECT id INTO fa_sc   FROM public.focus_areas WHERE company_id = company AND name = 'Sheltered Care';
  SELECT id INTO fa_ns   FROM public.focus_areas WHERE company_id = company AND name = 'Night Shift';
  SELECT id INTO fa_vcsn FROM public.focus_areas WHERE company_id = company AND name = 'Visiting CSNS';


  -- ── Shift Categories (wipe existing, then insert fresh) ───────────────────────
  DELETE FROM public.shift_categories WHERE company_id = company;

  -- Skilled Nursing
  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_snw, 'Day Shift',     '#93C5FD', '07:00', '15:30', 0)
  RETURNING id INTO cat_snw_d;

  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_snw, 'Evening Shift', '#FDE68A', '15:30', '00:00', 1)
  RETURNING id INTO cat_snw_e;

  -- Sheltered Care
  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_sc, 'Day Shift',     '#6EE7B7', '07:00', '15:30', 0)
  RETURNING id INTO cat_sc_d;

  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_sc, 'Evening Shift', '#FDE68A', '15:30', '00:00', 1)
  RETURNING id INTO cat_sc_e;

  -- Night Shift
  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_ns, 'Night Shift', '#C4B5FD', '00:00', '08:00', 0)
  RETURNING id INTO cat_ns_n;

  -- Visiting CSNS
  INSERT INTO public.shift_categories (company_id, focus_area_id, name, color, start_time, end_time, sort_order)
  VALUES (company, fa_vcsn, 'Visiting Nursing', '#67E8F9', '07:00', '15:30', 0)
  RETURNING id INTO cat_vcsn_vn;


  -- ── Shift Codes ───────────────────────────────────────────────────────────────
  -- focus_area_id = NULL means global (off-days, floats, office).
  -- Each focus-area-specific code stores the FK directly on the row.

  -- Global / Off-Day codes
  INSERT INTO public.shift_codes
    (company_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, category_id)
  VALUES
    (company, 'X',   'Off',     '#E2E8F0', '#94A3B8', '#475569', true,  false, NULL, 0, '{}', NULL),
    (company, 'Ofc', 'Office',  '#059669', '#047857', '#FFFFFF', false, true,  NULL, 1, '{}', NULL),
    (company, '0.3', 'Partial', '#78716C', '#57534E', '#FFFFFF', false, true,  NULL, 2, '{}', NULL)
  ON CONFLICT DO NOTHING;

  -- Skilled Nursing codes
  INSERT INTO public.shift_codes
    (company_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (company, 'D',   'Day',              '#2563EB', '#1D4ED8', '#FFFFFF', false, false, fa_snw,  0, '{}', '07:00', '15:30', cat_snw_d),
    (company, 'Ds',  'Day (Supervisor)', '#1D4ED8', '#1E40AF', '#FFFFFF', false, false, fa_snw,  1, '{}', '07:00', '15:30', cat_snw_d),
    (company, 'Dcn', 'Day (CN)',         '#1E40AF', '#1e3a8a', '#FFFFFF', false, false, fa_snw,  2, '{}', '07:00', '15:30', cat_snw_d),
    (company, '(D)', 'Day (Float)',      '#60A5FA', '#3B82F6', '#1E3A8A', false, true,  fa_snw,  3, '{}', '07:00', '15:30', cat_snw_d),
    (company, 'E',   'Evening',              '#F59E0B', '#D97706', '#FFFFFF', false, false, fa_snw, 10, '{}', '15:30', '00:00', cat_snw_e),
    (company, 'Es',  'Evening (Supervisor)', '#D97706', '#B45309', '#FFFFFF', false, false, fa_snw, 11, '{}', '15:30', '00:00', cat_snw_e),
    (company, 'Ecn', 'Evening (CN)',         '#FCD34D', '#F59E0B', '#78350F', false, false, fa_snw, 12, '{}', '15:30', '00:00', cat_snw_e)
  ON CONFLICT DO NOTHING;

  -- Sheltered Care codes
  INSERT INTO public.shift_codes
    (company_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (company, 'D',   'Day',          '#2563EB', '#1D4ED8', '#FFFFFF', false, false, fa_sc, 0, '{}', '07:00', '15:30', cat_sc_d),
    (company, 'Dcn', 'Day (CN)',     '#1E40AF', '#1E3A8A', '#FFFFFF', false, false, fa_sc, 1, '{}', '07:00', '15:30', cat_sc_d),
    (company, 'E',   'Evening',      '#F59E0B', '#D97706', '#FFFFFF', false, false, fa_sc, 2, '{}', '15:30', '00:00', cat_sc_e),
    (company, 'Ecn', 'Evening (CN)', '#FCD34D', '#F59E0B', '#78350F', false, false, fa_sc, 3, '{}', '15:30', '00:00', cat_sc_e)
  ON CONFLICT DO NOTHING;

  -- Night Shift codes
  INSERT INTO public.shift_codes
    (company_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (company, 'N',  'Night',              '#8B5CF6', '#7C3AED', '#FFFFFF', false, false, fa_ns, 0, '{}', '00:00', '08:00', cat_ns_n),
    (company, 'Ns', 'Night (Supervisor)', '#7C3AED', '#6D28D9', '#FFFFFF', false, false, fa_ns, 1, '{}', '00:00', '08:00', cat_ns_n)
  ON CONFLICT DO NOTHING;

  -- Visiting CSNS codes
  INSERT INTO public.shift_codes
    (company_id, label, name, color, border_color, text_color, is_off_day, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, category_id)
  VALUES
    (company, 'VN', 'Visiting Nursing', '#06B6D4', '#0891B2', '#FFFFFF', false, false, fa_vcsn, 0, '{}', '07:00', '15:30', cat_vcsn_vn)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Arden Wood focus areas, shift categories, and shift codes seeded.';
END $$;
