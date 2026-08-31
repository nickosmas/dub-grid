-- A notification write and the unread count returned to mobile must describe
-- the same committed state. Keeping the count inside each function avoids a
-- successful mark-read request being reported as a failure when a subsequent
-- refresh query has a transient error.

CREATE OR REPLACE FUNCTION public.mark_notification_read_with_unread_count(
  p_notification_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  RETURN unread_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read_with_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  RETURN unread_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mutate_notifications_with_unread_count(
  p_notification_ids UUID[],
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
  unread_count INTEGER;
BEGIN
  IF p_action NOT IN ('read', 'unread', 'archive', 'unarchive') THEN
    RAISE EXCEPTION 'Unsupported notification action';
  END IF;

  UPDATE public.notifications
  SET
    read_at = CASE
      WHEN p_action = 'read' THEN COALESCE(read_at, now())
      WHEN p_action = 'unread' THEN NULL
      ELSE read_at
    END,
    archived_at = CASE
      WHEN p_action = 'archive' THEN COALESCE(archived_at, now())
      WHEN p_action = 'unarchive' THEN NULL
      ELSE archived_at
    END
  WHERE id = ANY(p_notification_ids)
    AND user_id = auth.uid()
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.notifications
  WHERE user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND channel = 'in_app'
    AND (org_id = public.caller_org_id() OR org_id IS NULL);

  RETURN jsonb_build_object(
    'unreadCount', unread_count,
    'updatedCount', updated_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read_with_unread_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read_with_unread_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mutate_notifications_with_unread_count(UUID[], TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_notification_read_with_unread_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read_with_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_notifications_with_unread_count(UUID[], TEXT) TO authenticated;
