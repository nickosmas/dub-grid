-- ==========================================
-- SEED: Regular user for Arden Wood
-- ==========================================
-- Run in the Supabase SQL Editor.
-- Safe to re-run — uses ON CONFLICT / IF checks.

DO $$
DECLARE
  company uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
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

  -- Assign profile (active company pointer + platform role)
  INSERT INTO public.profiles (id, company_id, platform_role)
  VALUES (new_user_id, company, 'none')
  ON CONFLICT (id) DO UPDATE
    SET company_id  = EXCLUDED.company_id,
        updated_at  = NOW();

  -- Add company membership
  INSERT INTO public.company_memberships (user_id, company_id, company_role)
  VALUES (new_user_id, company, 'user')
  ON CONFLICT (user_id, company_id) DO UPDATE
    SET company_role = EXCLUDED.company_role;

  RAISE NOTICE 'Successfully added nicodamusalois@gmail.com as a regular user to Arden Wood.';
END $$;
