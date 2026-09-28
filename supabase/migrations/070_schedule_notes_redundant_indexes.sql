-- 070: Drop two schedule_notes indexes the unique key already serves.
--
-- Audit finding F-108 (2026-09-28): 063's schedule_notes_segment_unique leads
-- with (emp_id, date), so reads by person, or by person and date, plan as an
-- index scan on it. idx_schedule_notes_emp and idx_schedule_notes_emp_date
-- (001) only cost every note write two more index updates.
DROP INDEX IF EXISTS public.idx_schedule_notes_emp;
DROP INDEX IF EXISTS public.idx_schedule_notes_emp_date;
