# Feature: Invitation and organization entry coverage

**From build-plan:** feature 19b1
**Status:** verified

## Goal

Make invitation acceptance and organization entry dependable across the web and
mobile journeys. Live invitations must take an invitee to the correct
organization without leaking dead-token metadata; a signed-out person must be
able to select and sign in to a valid organization, while invalid, unavailable,
or interrupted entry states remain recoverable.

## In scope

- Audit and add regression coverage for the web invitation lookup, account
  registration, and authenticated invitation-acceptance contracts.
- Exercise web organization entry from the domain selector through the seeded
  organization login form, including reserved, invalid, unavailable, and
  request-failure states.
- Exercise mobile organization lookup and sign-in entry, including remembered
  organization data, unavailable organizations, and an existing authenticated
  session.
- Repair only confirmed correctness or recovery defects exposed by those tests.

## Out of scope

- Password recovery/reset, MFA, session expiry/revocation, onboarding and
  trial/setup admission decisions. Those belong to 19b2 through 19b5; 19a
  remains the authoritative admission-state repair.
- A native invitation-acceptance screen. Invitations are currently accepted on
  web; mobile validates organization entry and sign-in only.
- Authentication performance or security hardening beyond the contracts needed
  to make the named journeys correct. Those belong to 19c and 19d.

## Build steps

- [x] **Step 1 - Lock invitation API outcomes** - add coverage around lookup,
      registration, and acceptance so live invitations, dead tokens, email
      mismatch, existing accounts, authenticated acceptance, and recoverable
      failures have deliberate outcomes. _Done when:_ inactive invitations are
      indistinguishable at lookup, account creation never alters a confirmed
      existing account, and acceptance returns only the authenticated member's
      resulting organization context.
- [x] **Step 2 - Prove web invitation and organization entry** - cover the
      invite page and domain-selector to organization-login handoff, then repair
      any confirmed failure, cancellation, or stale-state defect. _Done when:_
      valid entry reaches the intended organization form; invalid/reserved or
      unreachable lookup states retain a clear retry path; invitation success
      lands in the accepted organization without an intermediate broken state.
- [x] **Step 3 - Prove mobile organization entry parity** - cover mobile
      organization lookup and sign-in states, including remembered org data and
      an already-authenticated launch; repair confirmed divergence without
      creating a mobile invitation flow. _Done when:_ mobile accepts only a
      resolvable organization for sign-in, retains actionable errors, and an
      active session is never displaced by entry UI.
- [x] **Step 4 - Verify the journey slice** - run focused tests plus the
      applicable web/mobile suites, type-check, and build. _Done when:_ all
      new and affected regression paths pass with no change to the authenticated
      server-side organization scoping contract.

## Files / areas

- `apps/web/src/app/api/invitations/{lookup,register,accept}/` and associated
  route tests.
- `apps/web/src/app/(app)/accept-invite/` and `login/{DomainSelector,OrgLogin}`.
- `apps/mobile/src/features/mobile/server/routes/auth-organization.ts`,
  `apps/mobile/src/features/auth/screens/LoginScreen.tsx`, and associated tests.

## Data / contracts

- A live invitation has a matching token, unexpired `expires_at`, and null
  `accepted_at` and `revoked_at`; lookup returns the same not-found result for
  every dead-token reason.
- Invitation acceptance remains an authenticated, CSRF-protected RPC. Its
  organization context comes from the RPC result, never from client-supplied
  organization state.
- Mobile has no invitation-acceptance route. Its organization-entry API only
  resolves a sign-in target; credential and session handling remain separate.
- The remembered mobile organization is presentation convenience only and may
  not grant access or override the authenticated session.

## Testing

- Added focused route, page, and mobile-screen regression coverage for the
  invitation and organization-entry branches.
- `npm run test:web` passed.
- `npm run test:mobile` passed: 124 files and 994 tests.
- `npm run type-check` and `npm run build` passed.
- Manual authenticated invitation acceptance remains part of 19e when a safe
  live invitation is available.

## Notes for the AI

- Treat invitation tokens and credentials as secrets: do not log or expose
  them in tests, client errors, or analytics.
- Keep all Route Handler mutations authenticated and CSRF-protected; do not
  loosen the server's effective-organization scope to make a test convenient.
- Preserve existing user-facing copy and page-level recovery behavior unless a
  test demonstrates a correctness problem.
