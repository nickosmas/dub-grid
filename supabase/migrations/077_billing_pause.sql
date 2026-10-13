-- 077: Billing pause (44e).
--
-- A Gridmaster can hold an organization's billing: access stays open, the
-- trial clock stops, and any Stripe subscription stops collecting. These
-- columns record who paused it, when, and why; all three are null when billing
-- is not paused.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS billing_paused_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  -- A pause always says why, and a reason never outlives its pause.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_billing_pause_reason') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_billing_pause_reason
      CHECK (
        (billing_paused_at IS NULL AND billing_paused_reason IS NULL)
        OR (
          billing_paused_at IS NOT NULL
          AND billing_paused_reason IS NOT NULL
          AND char_length(btrim(billing_paused_reason)) BETWEEN 1 AND 500
        )
      );
  END IF;
END;
$$;

-- The request proxy evaluates access as the signed-in member, so it reads when
-- billing was paused. The reason and the Gridmaster who paused it stay with
-- service-role code.
GRANT SELECT (billing_paused_at) ON TABLE public.organizations TO authenticated;
