-- 084: What staff see after a publish (item 46f).
--
-- An organization can hide from staff what each shift changed from and who
-- published it. Both default on. The app routes apply the rule for every
-- viewer who cannot edit or publish the schedule, so the browser roles must
-- not be able to read around them:
--
-- * `publish_history` rows stay readable to members, because staff apps
--   subscribe to them to refresh after a publish, but `published_by` is no
--   longer selectable (Realtime leaves out columns the role cannot select).
-- * `schedule_publish_changes` holds every change's before state and editor.
--   Only service-role routes read it, so the browser roles lose it entirely.
-- * `get_publish_history` returns both, and only a legacy wrapper ever
--   called it, so it becomes service-role only.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS staff_see_shift_changes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS staff_see_publisher BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.staff_see_shift_changes IS
  'Staff see what each published shift changed from. Off: a plain mark only.';
COMMENT ON COLUMN public.organizations.staff_see_publisher IS
  'Staff see who published the schedule and who edited each cell.';

REVOKE SELECT ON TABLE public.publish_history FROM anon, authenticated;
GRANT SELECT (id, org_id, start_date, end_date, change_count, published_at)
  ON TABLE public.publish_history TO authenticated;

REVOKE ALL ON TABLE public.schedule_publish_changes FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_publish_history(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_publish_history(UUID, INTEGER, INTEGER) TO service_role;
