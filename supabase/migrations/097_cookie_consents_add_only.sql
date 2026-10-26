-- 097: Cookie consent records are add-only, and only the consent route adds them.
--
-- POST /api/consent writes every row through the service role, after its own
-- rate limit. The data API could skip that route: anon and authenticated held
-- INSERT (anon's kept on purpose in 040, when the banner still wrote with the
-- anon key), and gridmaster_all_cookie_consents let a Gridmaster's token edit
-- or delete any row. A consent record is evidence of what someone agreed to,
-- so nobody edits one: an update is refused for every role, the service role
-- included. Rows still go with their account, through account deletion's
-- service-role DELETE. After this, anon holds no table privilege at all.
SET lock_timeout = '5s';

-- TRUNCATE too: it skips row-level security, and Supabase's default grants
-- gave it to authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cookie_consents FROM anon, authenticated;

DROP POLICY IF EXISTS anon_insert_cookie_consent ON public.cookie_consents;
DROP POLICY IF EXISTS authenticated_insert_cookie_consent ON public.cookie_consents;
DROP POLICY IF EXISTS gridmaster_all_cookie_consents ON public.cookie_consents;

CREATE POLICY gridmaster_read_cookie_consents
  ON public.cookie_consents FOR SELECT TO authenticated
  USING (public.is_gridmaster());

CREATE FUNCTION public.refuse_cookie_consent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'cookie consent records cannot be changed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_cookie_consent_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER cookie_consents_add_only
  BEFORE UPDATE ON public.cookie_consents
  FOR EACH ROW EXECUTE FUNCTION public.refuse_cookie_consent_update();

RESET lock_timeout;
