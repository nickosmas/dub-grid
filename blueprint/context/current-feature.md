# Correct public legal-policy disclosures

**Type:** Fix

**Status:** not started

**Fixes:** F-07, F-08, F-09, F-10, F-11, F-12, F-13, F-14

## Problem

The Privacy Policy, Terms of Service, and Cookie Policy contain public statements
that conflict with the verified implementation or cannot be supported by repository
or production evidence. The Terms and Privacy Policy also expose a registered-address
placeholder.

## Fix

Align the policies with verified behavior. Remove the placeholder rather than invent
an address, accurately disclose consent-gated analytics and Sentry identifiers, and
qualify or remove claims that need production, vendor-contract, historical, or
scheduled-job confirmation. Keep the documents' shared terminology and links intact.

## Build steps

1. [ ] Correct the Privacy Policy's account-deletion, analytics, Sentry, retention,
       vendor, and historical-operations statements; replace the missing-address
       placeholder with the verified support contact.

   Done when: the Privacy Policy makes no claim contradicted by the reviewed
   implementation and does not state unverified production or historical facts as
   established.

2. [ ] Correct the Terms contact section and Cookie Policy's consent, Sentry, and
       Vercel Analytics descriptions.

   Done when: neither document contains a placeholder, and each statement agrees
   with the implemented consent flows and vendor behavior.

3. [ ] Add focused regression coverage for the corrected public-copy invariants and
       run the relevant web tests and type check.

   Done when: the tests protect the corrected disclosures and the selected checks
   pass.

## Verify

- Read all three rendered documents at `/privacy`, `/terms`, and `/cookie-policy`.
- Confirm analytics can be enabled through both Accept all and Customize.
- Confirm policy text matches account deletion, PostHog, Sentry, and Vercel behavior.
- Run focused web tests and `npm --prefix apps/web run type-check`.
