-- 079: Seat and revenue history (44g).
--
-- Until now the only trace of a seat change was an audit row, and no invoice
-- amount was stored. These two tables record every seat change and every paid
-- or failed invoice from here on. They are append-only: no API role may change
-- or remove a row, so the history can be trusted. Only service-role code reads
-- or writes them (the Gridmaster report and the billing writers).

CREATE TABLE IF NOT EXISTS public.subscription_seat_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL CHECK (seats >= 0),
  -- Known when DubGrid counted them (a seat true-up); null otherwise.
  billable_app_users INTEGER CHECK (billable_app_users IS NULL OR billable_app_users >= 0),
  source TEXT NOT NULL CHECK (source IN ('stripe', 'checkout', 'gridmaster', 'backfill')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_seat_history_org_recorded
  ON public.subscription_seat_history (org_id, recorded_at);

CREATE TABLE IF NOT EXISTS public.billing_invoice_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('paid', 'failed')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A redelivered webhook adds nothing; an invoice can fail and later be paid.
  CONSTRAINT billing_invoice_events_invoice_kind UNIQUE (stripe_invoice_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_billing_invoice_events_occurred
  ON public.billing_invoice_events (occurred_at);

-- RLS stays on with no policies, so a later grant still needs one. Default
-- privileges grant new tables to every API role; take back all of it from the
-- browser roles and everything but reading and adding from the service role.
ALTER TABLE public.subscription_seat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_seat_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_invoice_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.subscription_seat_history FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.billing_invoice_events FROM service_role;

-- The history starts with each organization's current seat count, once.
INSERT INTO public.subscription_seat_history (org_id, seats, source)
SELECT o.id, o.subscription_seats, 'backfill'
  FROM public.organizations o
 WHERE o.subscription_seats IS NOT NULL
   AND o.workspace_kind = 'real'
   AND NOT EXISTS (
     SELECT 1 FROM public.subscription_seat_history h WHERE h.org_id = o.id
   );
