-- Finding F-01 (2026-09-23 audit), runtime half.
--
-- 038 mapped an absent `mfa_enrolled` claim to "not enrolled", which was the
-- right call during the 037 rollout: tokens minted before that migration
-- carry no claim, and failing closed would have stranded every live session.
-- That window is gone. Production reached ledger 040 on 2026-09-23, holds no
-- verified factor, and no pre-037 token survived the apply.
--
-- What remains is the shape of the default. The hook has been redefined in
-- 002, 021 and 037, and a fourth redefinition that dropped the claim would
-- have disabled enforcement in silence, because "absent" and "not enrolled"
-- were the same answer. They are now different answers: only the hook saying
-- FALSE counts as not enrolled, and an answered challenge (aal2) always
-- passes, so the enrolled caller who has proved themselves never depends on
-- the claim at all.
--
-- Deliberately cast-free. `(auth.jwt() ->> 'mfa_enrolled')::BOOLEAN` raises on
-- a malformed value, and an exception inside a policy helper is a failure mode
-- of its own; comparing the value keeps a garbage claim on the closed path.
--
-- The comparison is jsonb, not text. `->>` renders the JSON string "false" and
-- the JSON boolean false identically, so a text compare would accept a claim
-- of the wrong type; `-> 'mfa_enrolled' = 'false'::jsonb` accepts only the
-- boolean the hook actually mints, which is also what the application helper
-- (`evaluateMfaClaimState`) checks.
--
-- The callers are untouched: caller_org_id and is_gridmaster (038) invoke this
-- by name, so they inherit the new default without being restated.

CREATE OR REPLACE FUNCTION public.caller_mfa_challenge_pending()
RETURNS BOOLEAN
LANGUAGE SQL STABLE
SET search_path = 'public'
AS $$
  SELECT CASE
           WHEN auth.jwt() -> 'mfa_enrolled' = 'false'::jsonb THEN FALSE
           WHEN COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' THEN FALSE
           ELSE TRUE
         END;
$$;

REVOKE ALL ON FUNCTION public.caller_mfa_challenge_pending() FROM PUBLIC, anon;
