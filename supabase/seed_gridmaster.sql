-- ==========================================
-- SEED: Gridmaster (platform admin)
-- ==========================================
-- Run in the Supabase SQL Editor.
-- Safe to re-run — uses ON CONFLICT / IF checks.

DO $$
DECLARE
  gm_user_id uuid;
BEGIN
  -- Find or create the target user
  SELECT id INTO gm_user_id
  FROM auth.users
  WHERE email = 'nicokosmas.dev@gmail.com';

  IF gm_user_id IS NULL THEN
    gm_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, phone, phone_change,
      phone_change_token, reauthentication_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000', gm_user_id, 'authenticated', 'authenticated',
      'nicokosmas.dev@gmail.com', crypt('password123', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', false,
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), gm_user_id, gm_user_id::text,
      format('{"sub":"%s","email":"%s"}', gm_user_id::text, 'nicokosmas.dev@gmail.com')::jsonb,
      'email', now(), now(), now()
    );
  ELSE
    -- Re-set password and ensure email is confirmed
    UPDATE auth.users
    SET encrypted_password = crypt('password123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = gm_user_id;
  END IF;

  -- Assign as gridmaster — no organization affiliation, no org_role (dropped in migration 088)
  INSERT INTO public.profiles (id, org_id, platform_role, first_name, last_name)
  VALUES (gm_user_id, NULL, 'gridmaster', 'Nicodamus', 'Kosmas')
  ON CONFLICT (id) DO UPDATE
    SET platform_role = 'gridmaster',
        org_id       = NULL,
        first_name   = 'Nicodamus',
        last_name    = 'Kosmas',
        updated_at   = NOW();

  RAISE NOTICE 'Successfully added nicokosmas.dev@gmail.com as gridmaster.';
END $$;
