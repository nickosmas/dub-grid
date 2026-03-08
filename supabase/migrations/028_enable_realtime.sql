-- Migration: 027_enable_realtime.sql
-- Purpose: Add all schedule-relevant tables to Supabase Realtime publication.
--
-- REPLICA IDENTITY FULL is required so UPDATE/DELETE events carry the full
-- row payload (not just the primary key). Without it, Realtime events for
-- UPDATEs and DELETEs will arrive with mostly empty `old` data.

ALTER TABLE public.shifts         REPLICA IDENTITY FULL;
ALTER TABLE public.schedule_notes REPLICA IDENTITY FULL;
ALTER TABLE public.employees      REPLICA IDENTITY FULL;
ALTER TABLE public.wings          REPLICA IDENTITY FULL;
ALTER TABLE public.shift_types    REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_types;
