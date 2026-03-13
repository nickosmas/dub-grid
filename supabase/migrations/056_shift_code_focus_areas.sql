-- ============================================================
-- Migration 056: shift_code_focus_areas junction table
--
-- Replaces the single focus_area_name string on shift_codes
-- with a proper many-to-many relationship. A shift code can
-- now be associated with multiple focus areas and will inherit
-- that focus area's color when rendered in the schedule grid.
-- Global codes (no focus area associations) keep their own
-- manually-set colors.
--
-- Steps:
--   1. Create shift_code_focus_areas junction table
--   2. Migrate existing focus_area_name data
--   3. Enable RLS with appropriate policies
--
-- The focus_area_name column on shift_codes is kept but is
-- no longer the source of truth — the junction table is.
-- ============================================================


-- ── 1. Create junction table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.shift_code_focus_areas (
  shift_code_id integer NOT NULL REFERENCES public.shift_codes(id) ON DELETE CASCADE,
  focus_area_id integer NOT NULL REFERENCES public.focus_areas(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_code_id, focus_area_id)
);


-- ── 2. Migrate existing focus_area_name → junction rows ───────────────────────

INSERT INTO public.shift_code_focus_areas (shift_code_id, focus_area_id)
SELECT sc.id, fa.id
FROM public.shift_codes sc
JOIN public.focus_areas fa
  ON fa.company_id = sc.company_id
 AND fa.name = sc.focus_area_name
WHERE sc.focus_area_name IS NOT NULL
ON CONFLICT DO NOTHING;


-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.shift_code_focus_areas ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user whose org owns the shift code
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shift_code_focus_areas'
      AND policyname = 'shift_code_focus_areas_select'
  ) THEN
    CREATE POLICY "shift_code_focus_areas_select"
      ON public.shift_code_focus_areas FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.shift_codes sc
          JOIN public.profiles p ON p.company_id = sc.company_id
          WHERE sc.id = shift_code_id AND p.id = auth.uid()
        )
      );
  END IF;
END $$;

-- Write: admins and above
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shift_code_focus_areas'
      AND policyname = 'shift_code_focus_areas_write'
  ) THEN
    CREATE POLICY "shift_code_focus_areas_write"
      ON public.shift_code_focus_areas FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.shift_codes sc
          JOIN public.profiles p ON p.company_id = sc.company_id
          WHERE sc.id = shift_code_id
            AND p.id = auth.uid()
            AND (p.platform_role = 'gridmaster' OR p.company_role IN ('super_admin', 'admin'))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.shift_codes sc
          JOIN public.profiles p ON p.company_id = sc.company_id
          WHERE sc.id = shift_code_id
            AND p.id = auth.uid()
            AND (p.platform_role = 'gridmaster' OR p.company_role IN ('super_admin', 'admin'))
        )
      );
  END IF;
END $$;
