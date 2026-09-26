-- 059: A Gridmaster two-factor reset, and forgetting one known device (43c).
--
-- A reset makes the person enroll again at their next sign-in:
-- mfa_reenroll_required_at holds that until they save a verified factor. The
-- server writes it; authenticated keeps no update privilege on it (034 limits
-- profile updates to the name columns and version).
--
-- Known devices were keyed only by (user_id, device_hash). A surrogate id lets
-- support forget one without the page ever holding a device hash.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_reenroll_required_at TIMESTAMPTZ;

ALTER TABLE public.user_known_devices
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS user_known_devices_id_key
  ON public.user_known_devices (id);
