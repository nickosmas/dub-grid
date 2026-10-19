# Mobile API server cost on every request and every sign-in

**Type:** Fix
**Status:** verified

## The problem

The 2026-10-18 speed audit found the mobile API paying for round trips one
after another, on every request and every sign-in. Each was confirmed in the
code.

1. **Every mobile request waits on ten reads in a row.**
   `resolveMobileAuthContext` (`packages/mobile-api-core/src/auth.ts`) ran the
   revocation check, Supabase Auth `getUser`, the platform role, memberships,
   the organization, the billing policy, the setup check and the employee
   status strictly in sequence, although every one needs only the verified
   token's user, session and `org_id` claim.
2. **The setup check reads seven tables on every request.**
   `isMobileOrgSetupComplete` re-confirms, forever, an answer that becomes true
   during onboarding and stays true. The web memoizes it; mobile did not.
3. **Mobile sign-in waits on reads it could overlap.** `loginMobileUser`
   waited for the profile check before reading memberships, and loaded the
   billing policy only after both.
4. **Mobile sign-in waits on its own audit write.** The success or challenge
   record was written before the response, though it never changes the answer.

## The fix

1. Once the token verifies, every read starts at once, and each is awaited in
   the order the checks always ran, with the same statuses and messages. Every
   started read carries a no-op rejection handler, so a later read failing
   cannot surface before (or after) an earlier refusal; awaiting it in its
   turn still throws. Organization-scoped reads start only when the token
   carries an org claim. Reads are keyed on the verified token's subject, and
   `getUser` must name that same user, or the request is refused as an invalid
   session. The no-org-claim refusal stays where it was: moving it ahead would
   change the answer for a revoked, two-factor or Gridmaster token without a
   claim.
2. `isMobileOrgSetupComplete` memoizes `true` per organization in-process for
   60 seconds and never memoizes `false`, the web's policy
   (`resetOrgSetupCompleteMemo`, `CacheKey.orgSetupComplete`, whose Redis entry
   holds `true` for 300 seconds). `resetMobileOrgSetupCompleteMemo` is the test
   seam.
3. Sign-in starts the platform billing policy load first, and runs the profile
   check and the membership read together after the password is accepted,
   awaiting them in their original order.
4. The mobile login route writes its success or challenge audit event in
   `after()`. The refusal path (`discardRefusedSession` then the audit write)
   and the 504 deadline path are unchanged and still write before answering.

Must not break: revocation, MFA aal2 enforcement through the per-request
`getUser` (the only source of enrolled factors, kept), DB-answered
authorization, the claim-only organization with no fallback to another
membership, the F-78 deadline cleanup, the refused-sign-in session discard.

## Build steps

- [x] **1. Request reads overlap.** Done when every refusal keeps its status,
      message and precedence, the independent reads start before the
      revocation answer, and an earlier refusal beats a later failed read.
- [x] **2. Setup answer memoized.** Done when a complete organization is
      answered from memory for a minute, an incomplete one is re-read every
      time, and organizations are memoized separately.
- [x] **3. Sign-in reads overlap.** Done when the membership read starts
      before the profile check answers, the policy load starts before sign-in,
      and refusals keep their order.
- [x] **4. Sign-in audit after the response.** Done when a success or
      challenge is written from `after()` and the 504 path still writes first.

## Verify

- `npx tsc --noEmit -p packages/mobile-api-core/tsconfig.json`,
  `npx tsc --noEmit -p apps/web/tsconfig.json`, ESLint and Prettier on the
  changed files, the package suite, and the web mobile auth suites.

## Evidence

- Package and web type-checks, ESLint and Prettier on every changed file:
  clean.
- `@dubgrid/mobile-api-core` suite: 98 passing, including the new
  `auth-context.test.ts` (25: each refusal, precedence with several causes at
  once, reads starting before revocation answers, an earlier refusal beating a
  failed read, a subject mismatch) and `setup.test.ts` (3), and four new
  sign-in order tests in `auth.test.ts`.
- Web: `features/mobile/server/auth.test.ts`, `routes/auth-login.test.ts`,
  `routes/org-status.test.ts`, `mfa-lifecycle`, and the mobile and
  sensitive-action authorization-boundary suites, all passing. Three web
  assertions that a refused request never read memberships or the organization
  now assert the refusal's message instead: those reads now start alongside
  the earlier checks and their results are discarded.
- Not exercised against a running app or measured for latency.
