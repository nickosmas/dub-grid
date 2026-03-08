-- Migration: 034_profiles_name_columns.sql
-- Purpose: Add first_name and last_name to profiles, backfill from auth.users
--          raw_user_meta_data, and update the new-user trigger to populate them.

-- ── 1. ADD COLUMNS ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- ── 2. BACKFILL FROM auth.users.raw_user_meta_data ───────────────────────────
-- Handles three common shapes written by Supabase Auth providers:
--   a) separate "first_name" / "last_name" keys (custom signup forms)
--   b) "full_name" or "name"  → split on first space
--   c) nothing — leaves columns NULL

UPDATE public.profiles p
SET
  first_name = COALESCE(
    u.raw_user_meta_data->>'first_name',
    CASE
      WHEN (u.raw_user_meta_data->>'full_name') IS NOT NULL
        THEN split_part(u.raw_user_meta_data->>'full_name', ' ', 1)
      WHEN (u.raw_user_meta_data->>'name') IS NOT NULL
        THEN split_part(u.raw_user_meta_data->>'name', ' ', 1)
      ELSE NULL
    END
  ),
  last_name = COALESCE(
    u.raw_user_meta_data->>'last_name',
    CASE
      WHEN (u.raw_user_meta_data->>'full_name') IS NOT NULL
        AND position(' ' IN u.raw_user_meta_data->>'full_name') > 0
        THEN substring(u.raw_user_meta_data->>'full_name' FROM position(' ' IN u.raw_user_meta_data->>'full_name') + 1)
      WHEN (u.raw_user_meta_data->>'name') IS NOT NULL
        AND position(' ' IN u.raw_user_meta_data->>'name') > 0
        THEN substring(u.raw_user_meta_data->>'name' FROM position(' ' IN u.raw_user_meta_data->>'name') + 1)
      ELSE NULL
    END
  )
FROM auth.users u
WHERE u.id = p.id;

-- ── 3. UPDATE NEW-USER TRIGGER ────────────────────────────────────────────────
-- Populates first_name / last_name from metadata at signup time.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER AS $$
DECLARE
  v_full_name TEXT;
  v_first     TEXT;
  v_last      TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name'
  );

  IF NEW.raw_user_meta_data->>'first_name' IS NOT NULL THEN
    v_first := NEW.raw_user_meta_data->>'first_name';
    v_last  := NEW.raw_user_meta_data->>'last_name';
  ELSIF v_full_name IS NOT NULL THEN
    v_first := split_part(v_full_name, ' ', 1);
    v_last  := CASE
      WHEN position(' ' IN v_full_name) > 0
        THEN substring(v_full_name FROM position(' ' IN v_full_name) + 1)
      ELSE NULL
    END;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, v_first, v_last)
  ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name;

  RETURN NEW;
END;
$$;

-- ── 4. RLS — users can update their own name ──────────────────────────────────

DROP POLICY IF EXISTS "users_update_own_name" ON public.profiles;
CREATE POLICY "users_update_own_name"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
