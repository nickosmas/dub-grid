-- 134: Whether staff see what kind of absence a colleague has.
--
-- An organization can show staff a colleague's absence as "Time off" instead
-- of its name, such as Sick or Bereavement. On by default. The app routes
-- apply it for every viewer who does not edit or publish the schedule,
-- approve requests or manage staff; a viewer's own absences and the day off
-- absence keep their names. The browser roles must not read around it:
--
-- * `schedule_cell_snapshots.absence_type_id` names every absence in the
--   schedule. Only service-role routes read it, so members lose the column
--   (Realtime leaves out columns the role cannot select).
-- * `shift_requests` carries the call-off's absence and both people's cells,
--   absences included, in `absence_type_id`, `requester_state` and
--   `target_state`. Only service-role routes read them.
--
-- No policy, function that runs as the caller, client query or Realtime
-- handler reads these columns as a member. Each table's other columns are
-- granted back, so a column added later is not granted by default.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS staff_see_absence_names BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.staff_see_absence_names IS
  'Staff see what kind of absence a colleague has. Off: Time off, except their own and the day off.';

DO $$
DECLARE
  v_table TEXT;
  v_hidden TEXT[];
  v_columns TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['schedule_cell_snapshots', 'shift_requests'] LOOP
    v_hidden := CASE v_table
      WHEN 'schedule_cell_snapshots' THEN ARRAY['absence_type_id']
      ELSE ARRAY['absence_type_id', 'requester_state', 'target_state']
    END;

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = v_table
       AND column_name <> ALL (v_hidden);

    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', v_table);
    EXECUTE format(
      'REVOKE SELECT (%s) ON public.%I FROM anon, authenticated',
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(v_hidden) AS c),
      v_table
    );
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', v_columns, v_table);
  END LOOP;
END
$$;
