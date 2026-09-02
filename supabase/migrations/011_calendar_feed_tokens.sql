CREATE TABLE public.calendar_feed_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT calendar_feed_tokens_scope_unique UNIQUE (user_id, org_id, employee_id),
  CONSTRAINT calendar_feed_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT calendar_feed_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_calendar_feed_tokens_active_hash
  ON public.calendar_feed_tokens(token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.calendar_feed_tokens IS
  'Service-only hashed capability tokens for cookie-free published schedule feeds.';
COMMENT ON COLUMN public.calendar_feed_tokens.token_hash IS
  'SHA-256 hash of the private feed token. The raw token is disclosed only when issued.';

REVOKE ALL ON TABLE public.calendar_feed_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.calendar_feed_tokens TO service_role;
