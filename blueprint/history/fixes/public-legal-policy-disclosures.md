# Correct public legal-policy disclosures

**Type:** Fix

**Status:** verified

## Resolution

- Replaced the landing page's unverified infrastructure claim with the implemented activity-history capability.
- Corrected the Privacy Policy's analytics, Sentry, retention, vendor, deletion, and historical-practice language.
- Corrected the Terms and Cookie Policy disclosures for contact, consent, Sentry, and Vercel Analytics.
- Added focused source-copy regression coverage.

## Verification

- `npx vitest run --config vitest.config.mts src/app/legal-policy-copy.test.ts` - 3 passed.
- `npm run type-check` (from `apps/web`) - passed.
- `git diff --check` - passed.

## Findings

### public-legal-policy-disclosures/F-01 [P2] closed

The marketing claim was re-reviewed after the organization-level realtime pause was removed.

### public-legal-policy-disclosures/F-02 [P3] closed

The landing card now states implemented organization separation only.

### public-legal-policy-disclosures/F-06 [P1] closed

User-wide session revocation and a live-membership RLS guard protect former organization data.

### public-legal-policy-disclosures/F-07 [P1] closed

The policies provide the verified support email without an invented address.

### public-legal-policy-disclosures/F-08 [P1] closed

The Privacy Policy now matches the account-deletion workflow.

### public-legal-policy-disclosures/F-09 [P1] closed

Both policies disclose signed-in user IDs and email addresses sent to Sentry.

### public-legal-policy-disclosures/F-10 [P1] closed

The Privacy Policy describes consent-gated PostHog identification accurately.

### public-legal-policy-disclosures/F-11 [P2] closed

The Cookie Policy describes both consent paths.

### public-legal-policy-disclosures/F-12 [P2] closed

The Cookie Policy calls Vercel Analytics a cookie-free page-view beacon.

### public-legal-policy-disclosures/F-13 [P2] closed

The Privacy Policy no longer promises production purge processing.

### public-legal-policy-disclosures/F-14 [P2] closed

The policy no longer makes unsupported infrastructure, contractual, or historical claims.
