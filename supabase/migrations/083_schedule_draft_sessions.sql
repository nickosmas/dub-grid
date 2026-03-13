-- Migration 083: schedule_draft_sessions
--
-- Tracks intentionally saved draft sessions so the app can distinguish
-- between "user saved a draft to resume later" vs "abandoned/orphaned drafts".
-- One active session per company at a time (UNIQUE on company_id).

CREATE TABLE public.schedule_draft_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  saved_by   UUID NOT NULL REFERENCES auth.users(id),
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.schedule_draft_sessions ENABLE ROW LEVEL SECURITY;

-- All company members can see if a draft session exists
CREATE POLICY "members_select_draft_sessions"
  ON public.schedule_draft_sessions FOR SELECT TO authenticated
  USING (company_id = public.caller_company_id());

-- Admins can manage draft sessions
CREATE POLICY "admin_insert_draft_sessions"
  ON public.schedule_draft_sessions FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "admin_update_draft_sessions"
  ON public.schedule_draft_sessions FOR UPDATE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (company_id = public.caller_company_id());

CREATE POLICY "admin_delete_draft_sessions"
  ON public.schedule_draft_sessions FOR DELETE TO authenticated
  USING (
    company_id = public.caller_company_id()
    AND public.caller_company_role() IN ('admin', 'super_admin')
  );

-- Gridmaster bypass
CREATE POLICY "gridmaster_all_draft_sessions"
  ON public.schedule_draft_sessions FOR ALL TO authenticated
  USING (public.is_gridmaster())
  WITH CHECK (public.is_gridmaster());
