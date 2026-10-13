-- 076: Billing policy settings (44d).
--
-- Trial length, the grace period after a trial, the trial reminder window, and
-- the payment grace period become settings: one platform row a Gridmaster can
-- change, plus nullable per-organization overrides (null = platform default).
-- The application caches the platform row and reads the overrides with the
-- organization rows it already selects, so no request gains a database read.

-- ── Platform defaults ─────────────────────────────────────────────────────────
-- A boolean primary key that must be true allows exactly one row, so no code
-- ever decides which of several rows wins.
CREATE TABLE IF NOT EXISTS public.platform_billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true
    CONSTRAINT platform_billing_settings_singleton CHECK (id),
  default_trial_days INTEGER NOT NULL DEFAULT 14
    CONSTRAINT platform_billing_settings_trial_days CHECK (default_trial_days BETWEEN 1 AND 365),
  trial_grace_days INTEGER NOT NULL DEFAULT 3
    CONSTRAINT platform_billing_settings_trial_grace CHECK (trial_grace_days BETWEEN 0 AND 90),
  trial_reminder_days INTEGER NOT NULL DEFAULT 7
    CONSTRAINT platform_billing_settings_trial_reminder CHECK (trial_reminder_days BETWEEN 0 AND 90),
  payment_grace_days INTEGER NOT NULL DEFAULT 14
    CONSTRAINT platform_billing_settings_payment_grace CHECK (payment_grace_days BETWEEN 0 AND 90),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_billing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Only service-role code reads or writes it (the Gridmaster route and the
-- cached reader). Default privileges grant new tables to the browser roles, so
-- take them back; RLS stays on so a later grant still needs a policy.
ALTER TABLE public.platform_billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_billing_settings FROM PUBLIC, anon, authenticated;

-- ── Per-organization overrides ────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS trial_length_days_override INTEGER,
  ADD COLUMN IF NOT EXISTS trial_grace_days_override INTEGER,
  ADD COLUMN IF NOT EXISTS trial_reminder_days_override INTEGER,
  ADD COLUMN IF NOT EXISTS payment_grace_days_override INTEGER;

-- The request proxy reads an organization's billing state as the signed-in
-- member, under RLS, so it needs these columns. They hold day counts the
-- member already sees on the billing page; writes stay with service-role code.
GRANT SELECT (
  trial_length_days_override,
  trial_grace_days_override,
  trial_reminder_days_override,
  payment_grace_days_override
) ON TABLE public.organizations TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_trial_length_override_range') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_trial_length_override_range
      CHECK (trial_length_days_override IS NULL OR trial_length_days_override BETWEEN 1 AND 365);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_trial_grace_override_range') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_trial_grace_override_range
      CHECK (trial_grace_days_override IS NULL OR trial_grace_days_override BETWEEN 0 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_trial_reminder_override_range') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_trial_reminder_override_range
      CHECK (trial_reminder_days_override IS NULL OR trial_reminder_days_override BETWEEN 0 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_payment_grace_override_range') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_payment_grace_override_range
      CHECK (payment_grace_days_override IS NULL OR payment_grace_days_override BETWEEN 0 AND 90);
  END IF;
  -- The stored status was free text, so an unknown value quietly fell through to
  -- "payment attention" and never locked. NOT VALID checks every new write
  -- without failing this migration on an unexpected row already stored.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subscription_status_known') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_subscription_status_known
      CHECK (
        subscription_status IS NULL OR subscription_status IN (
          'trialing', 'active', 'past_due', 'unpaid', 'canceled',
          'incomplete', 'incomplete_expired', 'paused', 'trial_expired'
        )
      ) NOT VALID;
  END IF;
END;
$$;

-- ── Trial start uses the policy ───────────────────────────────────────────────
-- Same signature, guards, and grant as 002; only the length changes, from a
-- fixed 14 days to the organization's override, else the platform default.
CREATE OR REPLACE FUNCTION public.start_trial_for_org(p_org_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.organizations o
     SET trial_started_at = NOW(),
         trial_ends_at    = NOW() + make_interval(days => COALESCE(
           o.trial_length_days_override,
           (SELECT s.default_trial_days FROM public.platform_billing_settings s WHERE s.id),
           14
         ))
   WHERE o.id = p_org_id
     AND o.subscription_status = 'trialing'
     AND o.trial_ends_at IS NULL
     AND o.archived_at IS NULL
     AND o.suspended_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.organization_memberships m
        WHERE m.user_id = auth.uid()
          AND m.org_id = p_org_id
          AND m.org_role = 'super_admin'
          AND m.archived_at IS NULL
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_trial_for_org(UUID) TO authenticated;
