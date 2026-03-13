-- Migration 068: Convert skill_levels and roles from TEXT[] to JSONB
-- Each element becomes a {name, abbr} object.
-- Existing TEXT[] values are migrated so both name and abbr equal the old string.

-- 1. Add temporary JSONB columns
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS skill_levels_jsonb JSONB;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS roles_jsonb JSONB;

-- 2. Migrate data: convert each text[] element to {"name": val, "abbr": val}
UPDATE public.companies
SET skill_levels_jsonb = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', elem, 'abbr', elem)), '[]'::jsonb)
  FROM unnest(skill_levels) AS elem
)
WHERE skill_levels IS NOT NULL;

UPDATE public.companies
SET roles_jsonb = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', elem, 'abbr', elem)), '[]'::jsonb)
  FROM unnest(roles) AS elem
)
WHERE roles IS NOT NULL;

-- 3. Drop old columns and rename new ones
ALTER TABLE public.companies DROP COLUMN skill_levels;
ALTER TABLE public.companies DROP COLUMN roles;

ALTER TABLE public.companies RENAME COLUMN skill_levels_jsonb TO skill_levels;
ALTER TABLE public.companies RENAME COLUMN roles_jsonb TO roles;

-- 4. Set NOT NULL with defaults
ALTER TABLE public.companies
  ALTER COLUMN skill_levels SET NOT NULL,
  ALTER COLUMN skill_levels SET DEFAULT '[]'::jsonb;

ALTER TABLE public.companies
  ALTER COLUMN roles SET NOT NULL,
  ALTER COLUMN roles SET DEFAULT '[]'::jsonb;
