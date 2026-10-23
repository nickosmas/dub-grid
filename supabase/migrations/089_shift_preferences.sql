-- 089: Shift preferences (49e).
--
-- A person can prefer some shifts, or work only those shifts. The Schedule
-- Builder reads them: "only" means Auto-build and its suggestions never give
-- that person another shift; "prefers" puts them first for the shifts they
-- chose. One row per person, or none for no preference. Only service-role code
-- reads or writes the table, through the recurring schedule route, which
-- checks the caller's recurring-shift permissions and the person's
-- organization.

CREATE TABLE IF NOT EXISTS public.employee_shift_preferences (
  employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('prefers', 'only')),
  -- Shift category ids; an array because a person chooses a handful at most.
  shift_ids BIGINT[] NOT NULL CHECK (cardinality(shift_ids) BETWEEN 1 AND 50),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_shift_preferences_org
  ON public.employee_shift_preferences (org_id);

-- RLS stays on with no policies, so a later grant still needs one. Default
-- privileges grant new tables to every API role; take it back from the
-- browser roles.
ALTER TABLE public.employee_shift_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_shift_preferences FROM PUBLIC, anon, authenticated;
