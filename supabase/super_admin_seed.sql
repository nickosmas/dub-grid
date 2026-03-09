-- ==========================================
-- DUBGRID SUPER ADMIN SETUP SCRIPT
-- ==========================================
-- 1. Ensure schema.sql has been run first so `super_admins` table exists.
-- 2. Run this block in the Supabase SQL Editor. 
-- 3. It will automatically find the user with this email and mark them as a super admin.

DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Find the user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'nicokosmas.dev@gmail.com';

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found! Please create an account with nicokosmas.dev@gmail.com on the login page first.';
  END IF;

  -- Auto-confirm the user's email so they can log in without verification
  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE id = target_user_id
    AND email_confirmed_at IS NULL;

  -- Insert into super_admins table
  INSERT INTO public.super_admins (user_id, email, first_name, last_name)
  VALUES (target_user_id, 'nicokosmas.dev@gmail.com', 'Nicodamus', 'Kosmas')
  ON CONFLICT (user_id) DO UPDATE 
  SET email = EXCLUDED.email, 
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name;

  RAISE NOTICE 'Successfully added nicokosmas.dev@gmail.com as a confirmed Super Admin.';
END $$;
