-- 125: A phone's push token can move to another organization.
--
-- Audit finding F-210: 124 refused any change to org_id on every table that
-- always has one, but a push token belongs to a device, not an organization.
-- Registration upserts on expo_push_token, so a phone that switches organization
-- or signs in to another one moves its one row. Refused, the row stayed on the
-- old organization: the person got no pushes for the new one, and turning push
-- off from the new one failed too.

DROP TRIGGER trg_refuse_org_id_change ON public.mobile_device_tokens;
