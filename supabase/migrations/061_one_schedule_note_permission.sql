-- 061: One permission for schedule notes.
--
-- canEditScheduleIndicators was added beside canEditNotes when note kinds
-- became configurable, and writing a note has needed both ever since. It
-- retires into canEditNotes: a stored set that turned it off turns
-- canEditNotes off, so nobody gains note access, and the key is removed. A set
-- that never stored it resolves both to the admin default, which is unchanged.
--
-- The rewrite is nobody's permission change, so the trigger that records one
-- is off for it. departments.permissions holds the same shape.

ALTER TABLE public.organization_memberships DISABLE TRIGGER trg_log_permission_change;

UPDATE public.organization_memberships
SET admin_permissions = CASE
    WHEN admin_permissions -> 'canEditScheduleIndicators' = 'false'::jsonb
      THEN (admin_permissions - 'canEditScheduleIndicators') || '{"canEditNotes": false}'::jsonb
    ELSE admin_permissions - 'canEditScheduleIndicators'
  END
WHERE jsonb_typeof(admin_permissions) = 'object'
  AND admin_permissions ? 'canEditScheduleIndicators';

ALTER TABLE public.organization_memberships ENABLE TRIGGER trg_log_permission_change;

UPDATE public.departments
SET permissions = CASE
    WHEN permissions -> 'canEditScheduleIndicators' = 'false'::jsonb
      THEN (permissions - 'canEditScheduleIndicators') || '{"canEditNotes": false}'::jsonb
    ELSE permissions - 'canEditScheduleIndicators'
  END
WHERE jsonb_typeof(permissions) = 'object'
  AND permissions ? 'canEditScheduleIndicators';
