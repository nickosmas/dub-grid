-- 048: Remember the devices a person has signed in from.
--
-- A new-sign-in alert went out for every new session, and every sign-in
-- creates one, so people were told about their own laptop each morning. The
-- app now gives each browser and app install a random device id (a cookie on
-- the web, secure storage on mobile) and alerts only for a device this user
-- has not signed in from before.
--
-- Only a SHA-256 of the id is stored. Devices are never forgotten by age; a
-- password change forgets them all, so a device used after a password reset
-- alerts again. Service role only: the sign-in routes authenticate the caller
-- before they read or write.

CREATE TABLE IF NOT EXISTS public.user_known_devices (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash   TEXT NOT NULL CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  platform      TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_hash)
);

ALTER TABLE public.user_known_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_known_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_known_devices TO service_role;

CREATE OR REPLACE FUNCTION public.forget_known_devices_on_password_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.user_known_devices WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.forget_known_devices_on_password_change() FROM PUBLIC;

CREATE OR REPLACE TRIGGER on_auth_user_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.forget_known_devices_on_password_change();
