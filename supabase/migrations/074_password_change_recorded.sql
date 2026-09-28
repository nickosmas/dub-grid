-- 074: A password change is recorded by the database, not by the client (F-05).
--
-- The only record of a password change was the global sign-out that follows
-- it, labelled from a reason the client sends, so any assured user could
-- record "Changed their password" without changing anything, and a change
-- whose sign-out failed left no record at all. Auth writes every password
-- change to auth.users, whichever path made it (settings, recovery, an
-- invitation's first password, or a direct Auth call that bypasses DubGrid),
-- so a trigger there records it, as 048's trigger forgets known devices.
--
-- The person is the actor: every path that sets a password in this app is
-- the person setting their own.
CREATE OR REPLACE FUNCTION public.record_password_change()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (org_id, actor_id, actor_email, action, resource_type, resource_id, details)
  VALUES (
    NULL,
    NEW.id,
    NULL,
    'security.auth.password',
    'user',
    NEW.id::TEXT,
    jsonb_build_object('outcome', 'succeeded', 'reason', 'password_changed')
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_password_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_password_recorded
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.record_password_change();
