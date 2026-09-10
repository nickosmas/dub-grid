# Feature: Live tenant, membership, and session authorization

**From build-plan:** feature 19d1
**Status:** verified

## Goal

Prove and harden the web and mobile authorization boundary so every
authenticated tenant request uses a signature-verified, non-revoked session and
the user's current live access to exactly one organization. Removed or archived
membership, stale organization claims, revoked sessions, and cross-tenant IDs
must fail closed before protected data is returned or a side effect occurs.

Preserve the performance work from feature 19c: user-scoped database access may
rely on the existing live-membership RLS boundary, while any service-role path
that bypasses RLS must perform explicit live tenant and permission checks.

## In scope

- Define and enforce one authorization contract for web cookies, web bearer
  tokens, and mobile bearer tokens: verified user and session identity,
  revocation state, claimed/effective organization, current membership, live
  organization, and the role or permission required by the operation.
- Inventory authenticated web pages, Server Actions, Route Handlers, mobile API
  entry points, direct Supabase access, and privileged database access, then add
  maintainable guards that detect newly unclassified protected surfaces or
  service-role bypasses.
- Verify stale-claim behavior after membership removal or archival, session-wide
  and session-specific revocation, explicit cookie-versus-bearer precedence, and
  denial of cross-organization identifiers.
- Verify that Gridmaster sandbox and impersonation state can change the effective
  tenant only after server-side ownership and capability checks, never from an
  untrusted organization ID alone.
- Verify the current `caller_org_id()` live-membership function, tenant RLS
  policies, privileged SQL functions, grants, and `SECURITY DEFINER` boundaries;
  repair confirmed gaps with reviewed forward-only SQL.
- Add focused unit, structural, SQL, and local integration coverage for the
  authorization invariants on both platforms.

## Out of scope

- MFA assurance and fresh reauthentication for sensitive actions; feature 19d2.
- Invite, recovery, redirect, and CSRF integrity; feature 19d3.
- Enumeration resistance, rate limiting, token secrecy, and security-event
  audit completeness; feature 19d4.
- The durable role/state/browser matrix and broad native-device release pass;
  feature 19e.
- Authentication or onboarding redesign, new login methods, new roles, billing
  policy changes, or changes to the meaning of an inactive schedule employee.
  An inactive employee and a revoked organization membership remain distinct.
- Production database inspection, migration application, deployment, or any
  other production mutation; feature 23 remains the final release gate.
- Replacing the existing RLS live-membership check with an unconditional
  application-level membership query on every user-scoped request.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the request-authorization contract** - encode table-driven
      tests around the canonical web token and revocation helpers for signature,
      issuer, audience, expiry, user ID, session ID, explicit bearer-versus-cookie
      precedence, revoked sessions, and unverified client claims. Document which
      layer authoritatively checks identity, live membership, tenant state, and
      permissions. _Done when:_ the tests fail for forged, expired, revoked, or
      transport-confused identities and the contract identifies exactly where
      each live authorization decision is enforced without adding a request-wide
      database lookup.
- [x] **Step 2 - Close user-scoped web entry bypasses** - inventory authenticated
      pages, Server Actions, Route Handlers, and browser/server Supabase access;
      route each protected surface through the canonical app authorization
      boundary or the documented live-membership RLS boundary. Add a structural
      coverage test or explicit allowlist for genuinely public and system-only
      exceptions. _Done when:_ a newly unclassified protected web surface fails
      the guard, and focused tests deny removed or archived membership, stale
      organization claims, and cross-tenant IDs without trusting cached bootstrap
      state.
- [x] **Step 3 - Close privileged-client bypasses** - inventory server-side
      service-role Supabase usage and require explicit current organization,
      membership, role, and granular-permission authorization before scoped data
      or mutations. Keep narrowly justified webhook or internal-job exceptions
      explicit and independently authenticated. _Done when:_ a new privileged
      tenant access path fails the structural guard until classified, and focused
      route/action tests prove that service-role access cannot bypass removed
      membership, insufficient permission, or tenant ownership.
- [x] **Step 4 - Enforce mobile API parity** - verify every mobile API route uses
      the shared mobile authorization context and remove any direct trust in raw
      claims or client-supplied tenant IDs. Preserve distinct outcomes for absent
      membership, unavailable organization, inactive employee, and unsupported
      Gridmaster access. _Done when:_ focused tests deny missing or malformed
      organization claims, revoked sessions, removed or archived membership,
      archived organizations, and cross-tenant resource IDs across representative
      read and write routes.
- [x] **Step 5 - Verify RLS and privileged SQL boundaries** - expand static and
      local-Supabase integration coverage for `caller_org_id()`, tenant policy
      completeness, any direct JWT session-revocation boundary, role grants,
      fixed `search_path`, and every relevant `SECURITY DEFINER` function. If and
      only if a gap is confirmed, add a forward migration. Preserve the historical
      isolation patch unchanged; the repository's current migration rules make the
      ordered migration ledger authoritative. _Done when:_ current membership
      is required at query time, the documented revocation contract holds for
      direct database access, cross-tenant reads and writes fail under
      authenticated roles, and no privileged function or grant bypasses the
      intended tenant boundary.
- [x] **Step 6 - Harden sandbox and impersonation tenant selection** - trace the
      Gridmaster sandbox and impersonation lifecycle and enforce that effective
      organization context comes only from verified server-side state owned by
      the current session and permitted platform role. _Done when:_ focused tests
      reject stolen, malformed, stale, or unauthorized sandbox/impersonation
      state and prove that switching effective organizations cannot retain or
      disclose data from the prior tenant.
- [x] **Step 7 - Qualify the complete authorization boundary** - run the focused
      web, mobile, SQL, and local integration tests followed by the full unit
      suite, type-check, lint, and build. Manually exercise Calm Haven as the
      primary organization and a signed-in second local organization only for
      negative cross-org checks, covering web cookie auth, bearer auth, mobile
      API auth, membership removal, session revocation, and organization switch.
      _Done when:_ every automated check passes, protected requests fail closed
      immediately after access or session revocation, no tenant data survives an
      organization switch, and any unavailable browser/native evidence is
      recorded explicitly for feature 19e rather than inferred.

## Files / areas

- `apps/web/src/lib/api-auth.ts`, `apps/web/src/lib/auth/verify-token.ts`, and
  `apps/web/src/lib/auth/revocation.ts`
- Authenticated pages and Server Actions under `apps/web/src/app/`, Route
  Handlers under `apps/web/src/app/api/`, and shared Supabase clients, especially
  paths using service-role credentials
- `packages/mobile-api-core/src/auth.ts` and mobile API handlers/tests under
  `apps/web/src/app/api/mobile/`
- Gridmaster sandbox and impersonation helpers, cookies, proxy boundaries, and
  notification/session ownership checks under `apps/web/src/`
- `supabase/migrations/002_functions_triggers.sql`,
  `supabase/migrations/003_rls_policies.sql`, `supabase/migrations/004_grants.sql`,
  `supabase/migrations/005_live_membership_guard.sql`, the numbered forward
  migrations, and the historical `supabase/patches/2026-08-org-isolation.sql`
- Existing isolation and per-session coverage in `apps/web/src/__tests__/`, plus
  adjacent auth and route tests
- A concise authorization-boundary document or machine-readable route inventory
  under the existing security/operations documentation structure, if needed by
  the coverage guard

## Data / contracts

- The verified JWT `sub`, `session_id`, `org_id`, issuer, audience, and expiry
  claims; decoded or client-supplied values are never authority by themselves.
- Session revocation records and any user-wide revocation watermark.
- Current organization membership, organization lifecycle state, role, and
  granular permissions. Employee schedule status is not membership authority.
- The effective Gridmaster sandbox or impersonation organization, tied to the
  current verified session and platform capability.
- `caller_org_id()`, tenant RLS policies, authenticated/service-role grants, and
  privileged SQL-function contracts.
- No destructive schema rewrite. Any confirmed SQL repair is a new forward-only
  migration; applied baseline migrations and historical patches stay unchanged.

## Testing

- Unit and Route Handler tests cover token verification, transport precedence,
  revocation, live membership/permission decisions on privileged routes, mobile
  context resolution, and sandbox/impersonation ownership.
- Structural tests inventory protected handlers and privileged client usage so a
  new bypass cannot silently enter the codebase.
- SQL-focused static tests verify policy/function/grant definitions; local
  Supabase integration tests exercise authenticated same-tenant success and
  removed-membership or cross-tenant denial at query time.
- Run focused tests after each logic-bearing step. Before review, run
  `npm run test`, `npm run type-check`, `npm run lint`, and `npm run build` from
  an isolated candidate/worktree as required by `AGENTS.md`; run relevant E2E or
  authenticated browser checks when the local environment supports them.
- Use Calm Haven for normal manual testing. Use the already available second-org
  sign-in only to prove denial and clean tenant switching; do not copy or mutate
  production data.

## Notes for the AI

- Verify the current implementation before changing it. The repository already
  has local JWT verification, revocation checks, a shared mobile auth context,
  and a live-membership RLS guard; retain correct behavior and add repairs only
  for evidenced gaps.
- Keep user-scoped RLS and explicit service-role authorization as complementary
  layers. A service-role client bypasses RLS and therefore requires its own live
  tenant, membership, and permission checks before every scoped operation.
- Treat removed membership, archived membership, archived or suspended
  organization, inactive employee, revoked session, and insufficient permission
  as separate states even when the user-facing response is intentionally terse.
- Never use an unverified JWT decode, URL organization ID, request body field,
  subdomain, cookie, or cached bootstrap object as the sole authorization source.
- Preserve generic external error responses where detail could disclose tenant
  or account existence, while keeping safe structured diagnostics in tests and
  internal logs.
- Do not touch production, rewrite applied migrations, weaken RLS, or broaden a
  service-role grant to make a test pass.

## Step 7 qualification evidence

- The exact Step 6 product snapshot passed the full unit suite, type-check, lint,
  and production build before Step 7. Lint completed with zero errors and five
  pre-existing warnings.
- Focused web-cookie, bearer/mobile, privileged-route, SQL, sandbox,
  impersonation, revoked-session, removed-membership, and per-session
  organization-switch coverage passed against the local Supabase stack.
- Authenticated browser checks used Calm Haven for the normal dashboard flow.
  Arden Wood was used only for negative cross-organization checks. Each
  organization rendered distinct tenant data, and a known employee identifier
  from either organization returned `Employee not found` under the other
  organization without console warnings or errors.
- A physical/native mobile-device pass was not available in this step. Feature
  19e must retain the native role/state/browser matrix and release-device pass;
  no native result is inferred from the mobile API and component coverage here.
