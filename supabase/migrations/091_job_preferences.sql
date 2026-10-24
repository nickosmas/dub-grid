-- 091: Job preferences.
--
-- Beside a shift preference (089), a person can prefer some jobs, or work
-- only those jobs, such as only supervising. Auto-build and its suggestions
-- read both: "only" means they are never given another job; "prefers" puts
-- them first for the jobs they chose. One row per person, or none for no
-- preference. Only service-role code reads or writes the table, through the
-- recurring schedule route, which checks the caller's recurring-shift
-- permissions and the person's organization.

CREATE TABLE IF NOT EXISTS public.employee_job_preferences (
  employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('prefers', 'only')),
  -- Job ids; an array because a person chooses a handful at most.
  job_ids BIGINT[] NOT NULL CHECK (cardinality(job_ids) BETWEEN 1 AND 50),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_job_preferences_org
  ON public.employee_job_preferences (org_id);

-- RLS stays on with no policies, so a later grant still needs one. Default
-- privileges grant new tables to every API role; take it back from the
-- browser roles.
ALTER TABLE public.employee_job_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_job_preferences FROM PUBLIC, anon, authenticated;
