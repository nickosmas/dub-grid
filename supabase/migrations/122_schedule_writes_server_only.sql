-- 122: Schedule cells are written only by the server and its functions.
--
-- Audit finding F-197: the admin_write_* policies are FOR ALL on canEditShifts
-- for every snapshot_kind, so an Admin who may edit shifts but not publish could
-- rewrite a published snapshot through the data API, past publish, past-day
-- locks, corrections, the snapshot history and the audit log. Every write now
-- goes through a route under the service role or a SECURITY DEFINER function.
--
-- As in 049, only the privilege goes. The policies stay because they are FOR ALL
-- and also let editors read drafts, and a write policy with no privilege behind
-- it grants nothing.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.schedule_cells, public.schedule_cell_snapshots, public.schedule_cell_segments
  FROM authenticated;
