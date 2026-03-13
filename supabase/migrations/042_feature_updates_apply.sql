-- ============================================================
-- Migration 042: Feature updates (continued from 040)
-- • Migrate existing admin → super_admin
-- • Add focus_area_label, certification_label, role_label to organizations
-- • Add is_off_day to shift_types
-- Runs after 040 commits the super_admin enum value.
-- ============================================================

-- ── 1. Migrate existing admin users → super_admin ────────────────────────────
UPDATE public.profiles
SET org_role = 'super_admin'
WHERE org_role = 'admin';

-- ── 2. Add custom terminology label columns to organizations ─────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS focus_area_label   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS certification_label TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS role_label          TEXT DEFAULT NULL;

-- ── 3. Add is_off_day column to shift_types ───────────────────────────────────
ALTER TABLE public.shift_types
  ADD COLUMN IF NOT EXISTS is_off_day BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed default off-day types for orgs that have none yet.
INSERT INTO public.shift_types (org_id, label, name, color, border_color, text_color, is_off_day, sort_order)
SELECT
  o.id,
  v.label,
  v.name,
  v.color,
  v.border_color,
  v.text_color,
  TRUE,
  v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('OFF',  'Scheduled Off',  '#F1F5F9', '#CBD5E1', '#64748B', 100),
  ('SICK', 'Sick Day',       '#FEF2F2', '#FCA5A5', '#B91C1C', 101),
  ('VAC',  'Vacation',       '#F0FDF4', '#86EFAC', '#15803D', 102)
) AS v(label, name, color, border_color, text_color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shift_types st
  WHERE st.org_id = o.id AND st.label = v.label
);

-- ── 4. Update org_invitations CHECK to allow admin invitations ────────────────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_name = 'org_invitations'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%role%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.org_invitations DROP CONSTRAINT IF EXISTS %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.org_invitations
  ADD CONSTRAINT org_invitations_role_check
  CHECK (role_to_assign IN ('admin', 'scheduler', 'supervisor', 'user'));
