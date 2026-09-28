-- 072: Save notification preferences as one merge in the database (F-20).
--
-- The save read the stored map, merged the incoming categories over it and
-- upserted the result: three steps, so a mobile save and a web save at the
-- same moment could each overwrite the other's categories. The merge now
-- happens inside the upsert, under the row lock ON CONFLICT takes. It stays a
-- shallow merge of top-level categories, as the app's was, and security is
-- never stored because those alerts are always on.
--
-- Service role only: the routes authenticate the caller and pass their id.
CREATE OR REPLACE FUNCTION public.merge_notification_preferences(
  p_user_id UUID,
  p_prefs JSONB
)
RETURNS JSONB
LANGUAGE SQL
SET search_path = 'public'
AS $$
  INSERT INTO public.notification_preferences AS stored (user_id, prefs, updated_at)
  VALUES (p_user_id, COALESCE(p_prefs, '{}'::JSONB) - 'security', now())
  ON CONFLICT (user_id) DO UPDATE
    SET prefs = (stored.prefs || EXCLUDED.prefs) - 'security',
        updated_at = EXCLUDED.updated_at
  RETURNING stored.prefs;
$$;

REVOKE ALL ON FUNCTION public.merge_notification_preferences(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_notification_preferences(UUID, JSONB) TO service_role;
