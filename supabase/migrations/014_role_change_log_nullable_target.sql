-- role_change_log.target_user_id was declared NOT NULL while its foreign key
-- is ON DELETE SET NULL, so deleting any auth user who had ever received a
-- role or permission change failed on the ledger row with a not-null
-- violation. The ledger is meant to keep the row and drop the identity, as
-- changed_by_id already does, so the column becomes nullable to match.
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.

ALTER TABLE public.role_change_log
  ALTER COLUMN target_user_id DROP NOT NULL;

COMMENT ON COLUMN public.role_change_log.target_user_id IS
  'User the change applied to. NULL once that auth user is deleted; the row stays as history.';
