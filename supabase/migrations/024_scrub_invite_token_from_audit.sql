-- The org.created audit row used to carry the super admin's whole pending
-- invitation, raw token included (finding F-85). The route no longer writes
-- it; this removes the copies that already exist. The invitation itself is
-- untouched, so a link that has not yet been used still works.

UPDATE public.audit_log
SET details = details #- '{super_admin,pendingInvite}'
WHERE action = 'org.created'
  AND details #> '{super_admin,pendingInvite}' IS NOT NULL;
