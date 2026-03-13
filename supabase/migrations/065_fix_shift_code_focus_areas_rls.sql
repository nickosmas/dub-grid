-- ============================================================
-- Migration 065: Fix RLS on shift_code_focus_areas
--
-- Migration 056 created the policies using legacy column names
-- that may have been renamed since:
--   p.org_id   → p.company_id  (migration 048)
--   p.org_role → p.company_role (migration 053)
--
-- Drop and recreate both policies with current column names.
-- Fully idempotent — skips if the table was already dropped.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shift_code_focus_areas') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "shift_code_focus_areas_select" ON public.shift_code_focus_areas;
    DROP POLICY IF EXISTS "shift_code_focus_areas_write"  ON public.shift_code_focus_areas;

    -- Read: any authenticated user whose company owns the shift code
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

    -- Write: admins and above
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
END
$$;
