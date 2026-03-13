-- Migration 047: Fix RLS policies on regular_shifts and shift_series
--
-- Migration 044 rebuilt RLS for most tables with super_admin support but
-- missed regular_shifts (037) and shift_series (038), which still only
-- allowed 'admin' and 'scheduler' — blocking super_admin users from
-- creating or modifying recurring schedule templates and shift series.

-- ── regular_shifts ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "regular_shifts_insert" ON public.regular_shifts;
CREATE POLICY "regular_shifts_insert"
  ON public.regular_shifts FOR INSERT
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_update" ON public.regular_shifts;
CREATE POLICY "regular_shifts_update"
  ON public.regular_shifts FOR UPDATE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "regular_shifts_delete" ON public.regular_shifts;
CREATE POLICY "regular_shifts_delete"
  ON public.regular_shifts FOR DELETE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

-- ── shift_series ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shift_series_insert" ON public.shift_series;
CREATE POLICY "shift_series_insert"
  ON public.shift_series FOR INSERT
  WITH CHECK (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "shift_series_update" ON public.shift_series;
CREATE POLICY "shift_series_update"
  ON public.shift_series FOR UPDATE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );

DROP POLICY IF EXISTS "shift_series_delete" ON public.shift_series;
CREATE POLICY "shift_series_delete"
  ON public.shift_series FOR DELETE
  USING (
    public.is_gridmaster()
    OR (
      org_id = public.caller_org_id()
      AND public.caller_org_role()::TEXT IN ('admin', 'super_admin', 'scheduler')
    )
  );
