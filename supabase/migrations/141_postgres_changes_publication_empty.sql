-- 141: Nothing is published to Postgres Changes any more (F-199, F-179).
--
-- Since 140 the apps learn of a change from a private Broadcast topic, so the
-- supabase_realtime publication only let any signed-in user subscribe to a
-- table and receive the ids of rows deleted in other organizations, which
-- row-level security cannot hide. The publication stays, empty, since
-- Realtime expects it to exist.
--
-- REPLICA IDENTITY FULL wrote each updated or deleted row's old values to the
-- WAL for Postgres Changes; nothing reads them now, so every table goes back
-- to its primary key.

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', v_table);
  END LOOP;

  FOR v_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relreplident = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY DEFAULT', v_table);
  END LOOP;
END;
$$;
