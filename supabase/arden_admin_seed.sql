-- ==========================================
-- ARDEN WOOD ADMIN SETUP SCRIPT
-- ==========================================
-- 1. Ensure schema.sql has been run first so `organizations`, `org_members` etc exist.
-- 2. Run this block in the Supabase SQL Editor. 
-- 3. It will automatically find or create the user and assign them as admin to Arden Wood.

DO $$
DECLARE
  org uuid := 'dae224d9-4125-4dba-be4d-b8b27149f846';
  admin_user_id uuid;
BEGIN
  -- Organization
  INSERT INTO organizations (id, name, slug) VALUES (org, 'Arden Wood', 'ardenwood')
  ON CONFLICT (id) DO UPDATE SET name = 'Arden Wood', slug = 'ardenwood';

  -- Find or create the target user
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'nicokosmas@outlook.com';

  IF admin_user_id IS NULL THEN
    admin_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000', admin_user_id, 'authenticated', 'authenticated',
      'nicokosmas@outlook.com', crypt('password123', gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}', '{}', false
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), admin_user_id, 
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

  -- Assign as Admin to Organization (legacy org_members table)
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (org, admin_user_id, 'admin')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';

  -- Assign role in the new RBAC profiles table (read by the JWT hook)
  INSERT INTO public.profiles (id, org_id, org_role, platform_role)
  VALUES (admin_user_id, org, 'admin', 'none')
  ON CONFLICT (id) DO UPDATE
    SET org_id        = EXCLUDED.org_id,
        org_role      = EXCLUDED.org_role,
        updated_at    = NOW();

  RAISE NOTICE 'Successfully added nicokosmas@outlook.com as an admin to Arden Wood.';
END $$;
