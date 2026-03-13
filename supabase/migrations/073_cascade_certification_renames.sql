-- Migration 073: Cascade certification renames/deletions to shift_codes.required_designations
--
-- The required_designations TEXT[] column stores certification names as strings.
-- When certifications are renamed or deleted, these strings become stale.
-- These RPC functions allow the app to cascade changes efficiently.

-- 1. Replace a single value in required_designations for all shift_codes in a company
CREATE OR REPLACE FUNCTION public.array_replace_in_shift_codes(
  p_company_id uuid,
  p_old_val    text,
  p_new_val    text
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shift_codes
  SET required_designations = array_replace(required_designations, p_old_val, p_new_val)
  WHERE company_id = p_company_id
    AND p_old_val = ANY(required_designations);
$$;

-- 2. Remove a single value from required_designations for all shift_codes in a company
CREATE OR REPLACE FUNCTION public.array_remove_from_shift_codes(
  p_company_id uuid,
  p_val        text
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shift_codes
  SET required_designations = array_remove(required_designations, p_val)
  WHERE company_id = p_company_id
    AND p_val = ANY(required_designations);
$$;

-- 3. Remove any stale entries from required_designations that aren't in the
--    provided list of valid certification names.
CREATE OR REPLACE FUNCTION public.clean_stale_designations(
  p_company_id  uuid,
  p_valid_names text[]
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shift_codes
  SET required_designations = (
    SELECT COALESCE(array_agg(elem ORDER BY ordinality), '{}')
    FROM unnest(required_designations) WITH ORDINALITY AS t(elem, ordinality)
    WHERE elem = ANY(p_valid_names)
  )
  WHERE company_id = p_company_id
    AND required_designations != '{}';
$$;
