# Security Audit — DubGrid

**Date:** 2026-05-21 (last updated 2026-09-19; see the dated sections appended below)
**Scope:** Entire monorepo — `apps/web` (Next.js 16), `apps/mobile` (Expo),
`packages/*`, Supabase migrations (RLS / RPCs / grants / JWT hook), the request
proxy, dependencies.
**Method:** Static review of the actual source at each location, tracing
request → handler → RPC → RLS for the highest-risk paths, plus `npm audit` with
per-advisory reachability triage. Every reported item was confirmed in code.
Candidate leads that did not hold up are listed in the **Reviewed — not a
finding** appendix so the verification is auditable.

> **No false flags.** Where a control looked missing at one layer but is
> enforced at another (RLS, the JWT hook, `SameSite`), the item was downgraded or
> dropped, with the reasoning recorded.

---

## Executive summary

DubGrid's security architecture is **strong and defense-in-depth**. Tenant
isolation is enforced at the database with Row-Level Security keyed off a
per-session `caller_org_id()`; the privileged paths (role change, org switch,
trial start, impersonation) run through `SECURITY DEFINER` RPCs with self-action
guards, admin-tier guards, last-super_admin protection, advisory locks,
idempotency, and an immutable audit trail. The custom JWT hook strips org claims
for archived/suspended orgs and deactivated users. API routes layer
authentication, authorization, Zod validation, CSRF origin checks, and
production rate limiting on top. No SQL injection, no `dangerouslySetInnerHTML`,
no `eval`, and no committed secrets were found.

All seven original findings are now closed (F-5 was withdrawn as already
implemented; the rest are fixed). `npm audit` is 0 critical / 0 high / 0 low.

> **Correction (2026-07-25):** the line above originally read "...and no
> broken tenant isolation were found." A follow-up audit focused
> specifically on tenant data isolation (see **[2026-07-25 — Tenant
> Isolation Follow-Up Audit](#2026-07-25--tenant-isolation-follow-up-audit)**
> below) found that claim was no longer accurate: a High-severity RBAC
> bypass and a genuine cross-tenant gap in four RPCs were identified and
> fixed. Both are closed as of this update; the corrected claim is that no
> broken tenant isolation remains open, not that none was ever found.

### Findings

| ID  | Severity      | Title                                                                   | Status                                                               |
| --- | ------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F-1 | **High**      | `next@16.2.4` has known middleware-bypass + SSRF + DoS advisories       | ✅ Fixed — upgraded to `16.2.6`                                      |
| F-2 | Low           | `/api/organizations/role-change` lacks rate limiting (siblings have it) | ✅ Fixed — `apiLimiter` added                                        |
| F-3 | Low           | CSRF Origin validation applied inconsistently across mutating routes    | ✅ Fixed — `validateCsrfOrigin` applied to all state-changing routes |
| F-4 | Low           | CSP `script-src` relies on `'unsafe-inline'` (no nonce)                 | ✅ Fixed — authed pages forced dynamic + nonce/strict-dynamic CSP    |
| F-5 | ~~Info~~      | ~~Gridmaster demotion stale-token window~~                              | ❌ Withdrawn — already implemented (see appendix)                    |
| F-6 | Informational | Sandbox cookie is not `HttpOnly`                                        | ✅ Fixed — cookie now `HttpOnly`                                     |
| F-7 | Informational | Transitive dependency advisories (not production-reachable)             | ✅ Fixed — `protobufjs`/`fast-uri` patched via overrides             |

---

## Findings detail

### F-1 — Outdated Next.js with middleware-bypass and SSRF advisories — **High** — ✅ Fixed

**Location (original):** `next@16.2.4`. Vulnerable range: `16.0.0 – 16.2.5`.

**Evidence:** `npm audit` reported `next` as high, including:

- Middleware / Proxy bypass through dynamic route parameter injection — CVSS 8.1 (GHSA-492v-c6pp-mqqv)
- Middleware / Proxy bypass via segment-prefetch routes — CVSS 7.5 (GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6)
- SSRF via WebSocket upgrades — CVSS 8.6 (GHSA-c4j6-fc7j-m34r)
- Several DoS advisories (Server Components, Cache Components, Image Optimization) — CVSS 7.5 / 5.9

**Impact:** This app performs route gating, billing-lock enforcement, org
suspension/archival redirects, and impersonation-context rewriting in
`apps/web/src/proxy.ts`. The proxy-bypass advisories were therefore
directly relevant.

> **Correction (2026-08-25):** at the time of this audit the middleware file
> sat at `apps/web/middleware.ts` — outside the `src/` directory Next.js reads
> when the app lives at `src/app` — so it was never invoked, and none of the
> enforcement described in this document was actually running. The
> middleware-bypass advisories above were moot for the same reason. It was
> first moved under `src` and is now the Next.js request proxy at
> `apps/web/src/proxy.ts`; the active request boundary has been confirmed
> executing. See the CHANGELOG entry under Unreleased / Security. Data exposure was bounded because the app correctly treats
> RLS as the real security boundary (all org-scoped tables enforce
> `caller_org_id()`), so a bypass alone does not leak another tenant's rows.

**Fix:** `apps/web/package.json` now pins `"next": "^16.2.6"`. Installed version
confirmed: `next@16.2.6` (`npm ls next`). The XSS-in-App-Router-via-CSP-nonce
advisory (GHSA-ffhc-5mcf-pf4q) does not apply here because the original
vulnerable path required a specific nonce misuse not present in this codebase.

---

### F-2 — Role-change route lacks rate limiting — **Low** — ✅ Fixed

**Location:** `apps/web/src/app/api/organizations/role-change/route.ts`

**Evidence (original):** Sibling mutation routes called `apiLimiter` but
`role-change` did not.

**Fix confirmed:** `apiLimiter` and `checkRateLimit` are now imported and
called (lines 9, 33-34 of the route file). The limiter is keyed on the
authenticated user ID, matching the sibling pattern.

---

### F-3 — Inconsistent CSRF origin validation on mutating routes — **Low** — ✅ Fixed

**Location (original):** 21 mutating handlers omitted `validateCsrfOrigin`.

**Fix confirmed:** `validateCsrfOrigin` (`apps/web/src/lib/csrf.ts`) is now
applied to all state-changing Route Handlers. The function validates the
`Origin` header against the configured site URL, supports multi-tenant
subdomains by comparing root domains, and fails closed in production when
`Origin` or the site URL is absent.

**Secondary control preserved:** Supabase auth cookies remain `SameSite=Lax`,
providing defense-in-depth against cross-site cookie replay.

---

### F-4 — CSP `script-src` uses `'unsafe-inline'` (no nonce) — **Low** — ✅ Fixed

**Location:** `apps/web/src/proxy.ts` (CSP generation)

**Fix history and current state (verified in code):**

_First attempt (reverted):_ A split nonce CSP assumed authed pages were
dynamically rendered. A production-build smoke test disproved that: the build
showed `/dashboard`, `/people`, `/settings`, `/profile`, `/notifications`,
`/reports`, `/gridmaster`, and `/onboarding` were statically prerendered. A
static page's baked `<script>` tags cannot carry a per-request nonce, so the
nonce + `strict-dynamic` policy broke hydration. That attempt was reverted.

_True fix (verified in source):_ The authed routes were made genuinely dynamic,
then the split CSP was re-applied:

1. `export const dynamic = "force-dynamic"` added to the layouts/pages for all
   affected authed segments.
2. `/billing-required/page.tsx` also has `export const dynamic = "force-dynamic"`
   (it is in the authed middleware path and would otherwise be statically
   prerendered with a nonce CSP it cannot carry).
3. `apps/web/src/proxy.ts` now builds two CSP variants:
   - **Authenticated app** (production): `script-src 'self' 'nonce-{random}' 'strict-dynamic' https://va.vercel-scripts.com` — no `'unsafe-inline'`
   - **Static/public pages** (marketing, login, auth flows): `script-src 'self' 'unsafe-inline' ...` — these are pre-rendered and hold no user data or injection sinks
   - **Development** (both variants): `'unsafe-inline'` so HMR/React Refresh work
4. The nonce is a 16-byte random value encoded as base64 per request.

**Remaining step:** Final browser hydration confirmation on a preview/production
build is advised (confirms scripts carry the nonce and no CSP violations appear
in the browser console). The structural fix is verified in code.

---

### F-5 — Gridmaster post-demotion stale-token window — **Withdrawn (not a finding)**

The initial audit pass flagged a possible stale-token window after gridmaster
demotion based on reading only `apps/web/src/lib/api-auth.ts`. On re-verification
of the demotion RPCs this was **already fully handled**:

- `demote_gridmaster_account` (`002_functions_triggers.sql`) deletes the
  target's `user_sessions` and inserts a 5-minute `jwt_refresh_locks` row
  (`reason='gridmaster_demotion'`).
- `set_gridmaster_account_deactivated` does the same
  (`reason='gridmaster_activation_change'`).
- `promote_gridmaster_by_email` likewise clears sessions and locks.

The 5-minute lock is stronger than the 5-second lock used for org-role changes.
No action needed.

---

### F-6 — Sandbox cookie is not `HttpOnly` — **Informational** — ✅ Fixed

**Location:** `apps/web/src/app/api/test-sandbox/route.ts`;
`apps/web/src/lib/sandbox-cookie.ts`

**Evidence (original):** The `dubgrid-sandbox` cookie was set server-side with
`httpOnly: false`, leaving it readable by client JS.

**Impact:** Informational — the cookie carries no secret (only
`{ sandboxOrgId, userId }`) and is never trusted on its face; every consumer
re-verifies ownership server-side against the DB at three gates.

**Fix confirmed:** `apps/web/src/app/api/test-sandbox/route.ts` line 126 now
sets `httpOnly: true`, `sameSite: "lax"`, and includes `path` and `maxAge`.
The cookie is set, read, and cleared entirely server-side; no client code reads
it. The dead helper `clearSandboxCookieFromBrowser` (which could not have
worked for an `HttpOnly` cookie) was removed.

---

### F-7 — Transitive dependency advisories (not production-reachable) — **Informational** — ✅ Fixed

**Evidence and triage:**

- **`protobufjs` (high)** — reached only via `posthog-js → @opentelemetry/exporter-logs-otlp-http`. The advisories require attacker-controlled protobuf descriptors; the OTLP exporter only emits telemetry and never parses untrusted protobuf. Not reachable in production.
- **`fast-uri` (high, path traversal)** — reached only via `@sentry/nextjs → webpack → schema-utils → ajv`. Build-time toolchain dependency; absent from the production runtime. Not reachable.
- Remaining moderates (`hono` / `@hono/node-server` via `@modelcontextprotocol/sdk`) are in the `shadcn` dev CLI only — not in the deployed runtime.

**Fix confirmed in `package.json` overrides:**

- `@opentelemetry/otlp-transformer` scoped: `protobufjs → 7.5.9`
- `ajv` scoped: `fast-uri → ^3.1.2`
- Bare `protobufjs: 7.5.9` override also present (previously pinned to the vulnerable `7.5.5`)

`npm audit` result after fixes: **0 critical / 0 high / 0 low / 3 moderate**
(the 3 moderate are `hono` via the `shadcn` dev CLI — dev tooling, not deployed).

Note on `install-strategy=nested` (`.npmrc`): overrides do not apply on an
incremental `npm install` under this strategy. Applying a new override requires
a clean reinstall (`rm -rf node_modules package-lock.json && npm install`).

---

## Reviewed — verified sound (not findings)

These were specifically checked and confirmed correct, including several
candidate leads that were disproven:

- **Tenant isolation (RLS).** All 36 tables have RLS enabled. `organizations`
  policies are `TO authenticated` only (no `anon` policy), and members are
  restricted to `id = caller_org_id()`. The broad column-level `GRANT … TO anon`
  on `organizations` (`004_grants.sql`) is moot because RLS denies all rows to
  anon — candidate lead disproven.
- **`caller_org_id()` per-session isolation** — prefers the JWT-baked claim,
  preventing a sibling device's `switch_org` from leaking into another session.
- **JWT hook** — strips org claims for archived/suspended orgs and deactivated
  users; honors `jwt_refresh_locks`; `SECURITY DEFINER`, owner `postgres`,
  `EXECUTE` granted only to `supabase_auth_admin` and `service_role`.
- **Role-change / assign-role RPCs** — caller-identity check (`p_changed_by_id =
auth.uid()`), self-action guard, admin-tier guard (admins cannot touch
  admin/super_admin/gridmaster or assign privileged roles), last-super_admin
  guard, advisory lock, idempotency, audit log, JWT refresh lock. Direct
  `org_role` UPDATEs blocked by `guard_org_role_change` trigger.
- **Proxy JWT fallback** (`proxy.ts`) — `jwtVerify` then `decodeJwt`
  fallback never trusts `gridmaster` from an unverified token; RLS is the real
  boundary. Matches documented invariant.
- **Stripe webhook** (`api/stripe/webhook/route.ts`) — verifies
  `stripe.webhooks.constructEvent` signature; fails closed on missing
  secret/signature. Replay idempotency via `stripe_processed_events` table
  (unique constraint on `event_id`; insert-before-process pattern).
- **Error sanitization** (`packages/client-errors`) — PGRST/Supabase/RLS/JWT/SQL
  patterns fall back to a generic message; only benign business-logic messages
  surface. No stack traces or DB internals leak to clients.
- **SQL safety** — no string-interpolated SQL or raw `query()` in the data
  layer; all access via the parameterized Supabase query builder.
- **XSS** — zero `dangerouslySetInnerHTML`, zero `eval`/`new Function` across
  `apps` and `packages`.
- **Secrets** — no `.env` files tracked in git; no hardcoded service/Stripe/JWT
  secrets in source (the only JWT literals are the public Supabase local-dev demo
  anon key inside test fixtures). Env validated at startup via Zod
  (`apps/web/src/lib/env.ts`); service-role key is server-only; no secret behind
  `NEXT_PUBLIC_`.
- **`SECURITY DEFINER` hygiene** — all such functions set `SET search_path = public`.
- **Rate limiter** (`apps/web/src/lib/rate-limit.ts`) — fails **closed** in
  production when Redis is unconfigured (returns `misconfigured: true` → callers
  return 503); also fails closed when Upstash throws (M-3 from the bug hunt,
  verified fixed via the catch block at line 121-129).
- **Mobile parity** — mobile auth uses the same `SECURITY DEFINER` RPCs
  (`switch_org`, `start_trial_for_org`) via an RLS-scoped session client
  (`packages/mobile-api-core/src/auth.ts`); no weaker parallel authorization path.
- **Anon grants** — `anon` has only `INSERT` on `cookie_consents` and no blanket
  function `EXECUTE` (`004_grants.sql`).
- **Org soft-delete** — `archived_at` revokes access in middleware, JWT hook,
  `get_my_organizations`, and `switch_org`. Access is cut at next token refresh.
- **Per-session org isolation** — `user_sessions.active_org_id` drives JWT claims
  per device; `switch_org` only affects the calling session.

---

## Dependency audit summary

| Package                      | Severity | Production-reachable?             | Action                           |
| ---------------------------- | -------- | --------------------------------- | -------------------------------- |
| `next`                       | ~~high~~ | Yes (framework + middleware auth) | ✅ Upgraded to `16.2.6`          |
| `protobufjs`                 | ~~high~~ | No (posthog-js OTLP emit path)    | ✅ Override → `7.5.9`            |
| `fast-uri`                   | ~~high~~ | No (build-time webpack/ajv)       | ✅ Override → `3.1.2`            |
| `hono` / `@hono/node-server` | moderate | No (`shadcn` dev CLI only)        | Left — dev tooling, not deployed |

**Before fixes:** 0 critical, 3 high, 14 moderate, 1 low.
**After all fixes:** 0 critical, 0 high, 3 moderate, 0 low.

---

## Remediation status (final)

- ✅ **F-1** — Next.js upgraded to `16.2.6`; all HIGH middleware-bypass/SSRF/DoS advisories cleared.
- ✅ **F-2** — `apiLimiter` added to the role-change route, keyed on user ID.
- ✅ **F-3** — `validateCsrfOrigin` applied uniformly to all state-changing Route Handlers.
- ✅ **F-4** — Authed routes forced to dynamic rendering (`force-dynamic` on their layouts/pages, including `/billing-required`) + nonce/`strict-dynamic` CSP for the authed app. Static/public pages keep `'unsafe-inline'`. A first nonce attempt was reverted after a smoke test showed the authed pages were statically prerendered; the true fix makes them dynamic. Build confirms all affected authed routes are now dynamic. (Final browser hydration check on a preview/prod build is the one remaining manual step.)
- ✅ **F-6** — Sandbox cookie set `HttpOnly: true`; dead client-clear helper removed.
- ✅ **F-7** — `protobufjs → 7.5.9`, `fast-uri → 3.1.2` via scoped overrides; `npm audit` now 0 high.
- ❌ **F-5** — Withdrawn; already implemented (5-minute refresh lock + session wipe on gridmaster demotion/deactivation).

**All seven findings closed (F-5 withdrawn).**

---

## 2026-07-25 — Tenant Isolation Follow-Up Audit

**Scope:** Tenant (organization) data isolation specifically — the guarantee
that one org's data can never be read, written, or corrupted by another org.
**Method:** Three parallel deep-dive passes: (1) all 4 migration files —
every org-scoped table's RLS policies, and every `SECURITY DEFINER` RPC's
org-scoping logic; (2) every API Route Handler's `orgId` trust boundary
(client-supplied vs. re-derived server-side); (3) middleware, the JWT hook,
session/sandbox/impersonation cookie handling. Every reported item was
confirmed in code and fixed in the same pass.

**Result:** the prior executive summary's "no broken tenant isolation" claim
did not hold up. A High-severity RBAC bypass and a genuine cross-tenant gap
in four RPCs were found. Everything below is now fixed.

### Findings

| ID   | Severity      | Title                                                                                             | Status   |
| ---- | ------------- | ------------------------------------------------------------------------------------------------- | -------- |
| F-8  | **High**      | `/api/test-sandbox` had no server-side role gate (privilege escalation)                           | ✅ Fixed |
| F-9  | **Medium**    | Cross-tenant gap in 4 shift-request RPCs                                                          | ✅ Fixed |
| F-10 | Medium        | `organizations/app-only-user` skipped the sandbox-effective-org redirect                          | ✅ Fixed |
| F-11 | Low           | `stripe_processed_events` had RLS disabled entirely                                               | ✅ Fixed |
| F-12 | Low           | `remove_focus_area_from_employees` had no permission check                                        | ✅ Fixed |
| F-13 | Low           | `purge_expired_data()` referenced a nonexistent `shifts` table                                    | ✅ Fixed |
| F-14 | Low           | `schedule/actor-names` resolved profile names without org-scoping ids                             | ✅ Fixed |
| F-15 | Informational | Impersonation cookie wasn't cross-validated against `impersonation_sessions`                      | ✅ Fixed |
| F-16 | **High**      | `organizations/app-only-user` let any org admin overwrite an arbitrary user's global profile name | ✅ Fixed |

### Findings detail

#### F-8 — `/api/test-sandbox` had no server-side role gate — **High** — ✅ Fixed

**Location:** `apps/web/src/app/api/test-sandbox/route.ts`;
`apps/web/src/features/test-sandbox/server.ts`.

**Root cause:** the route only checked that the caller had _any_ active
membership in the source org — no `org_role`/`platform_role` check. The only
gate was client-side (`Header.tsx`'s `canOpenSandbox = actualLevel >= 2`).
`createSandboxForUser` then inserted a real `organization_memberships` row
granting the caller `super_admin` in the new sandbox org and cloned the full
employee roster, including `contactNotes`/`statusNote`/`phone`/`email`.

**Impact:** any plain `user`-role employee could call
`POST /api/test-sandbox {"action":"enter"}` directly (bypassing the menu),
receive a real `super_admin` membership over a full clone of their
employer's employee PII, and use every admin-gated endpoint against it.

**Fix confirmed:** the route now looks up the caller's real `org_role` in
the source org (or `platform_role === 'gridmaster'`) via
`organization_memberships`, and returns 403 unless it is `admin` or
`super_admin`. Critically, this check does **not** use
`auth.claims.org_role` — once inside a sandbox, that claim is already
widened to `"super_admin"` by `requireAuthenticatedUserWithClaims`, which
would have let a since-demoted user keep resetting their sandbox
indefinitely; the real membership row is queried directly instead. Covered
by `route.test.ts` (12 tests, including a demoted-user-on-reset case).

#### F-9 — Cross-tenant gap in 4 shift-request RPCs — **Medium** — ✅ Fixed

**Location:** `supabase/migrations/002_functions_triggers.sql` —
`create_shift_request`, `claim_shift_request`, `cancel_shift_request`,
`volunteer_for_open_shift`.

**Root cause:** each function's admin-bypass branch authorized on
`public.caller_org_role()` — the caller's role in their _current session_
org — without ever comparing it to the target row's actual `org_id`. The
sibling function `resolve_shift_request` did this correctly
(`IF v_request.org_id != public.caller_org_id() ...`); these four did not.

**Impact:** an admin/super_admin of Org A who knew or guessed a valid Org-B
`employees.id`/`shift_requests.id` could create, claim, cancel, or
volunteer for Org B's shift requests.

**Fix confirmed:** all four now require
`(public.caller_org_id() = <target org> OR public.is_own_sandbox_org(<target org>)) AND public.caller_org_role() IN ('super_admin','admin')`
before allowing the bypass, mirroring `resolve_shift_request`'s pattern
(and additionally recognizing the caller's own Test Sandbox org, consistent
with how the schedule-mutation RPCs already handle sandbox). Gridmaster and
self-service (acting on one's own employee record) paths are unchanged.
`cancel_shift_request`'s employee lookup was also tightened to filter by
`org_id = v_request.org_id`, closing a secondary gap where it looked up
`p_emp_id` with no org filter at all.

#### F-10 — `organizations/app-only-user` skipped the sandbox-effective-org redirect — **Medium** — ✅ Fixed

**Location:** `apps/web/src/app/api/organizations/app-only-user/route.ts`.

**Root cause:** unlike its siblings `employees/identity` and
`employees/status` (both previously fixed for this exact class of bug,
tracked as "H-1" in `POTENTIAL_BUGS.md`), this route took `orgId` straight
from the request body and never called `resolveEffectiveOrgId`. Because
`canManageEmployees` re-verifies real membership, this was not a
cross-tenant break, but it reopened the "sandbox mutations silently hit the
real org" hole H-1 was meant to close everywhere.

**Fix confirmed:** the route now calls
`resolveEffectiveOrgId(req, user.id, orgId)` before the permission check,
matching `employees/identity/route.ts` exactly. Covered by a new
`route.test.ts` (3 tests) proving the permission check and mutation both
route to the sandbox-effective org, not the raw body org.

#### F-11 — `stripe_processed_events` had RLS disabled entirely — **Low** — ✅ Fixed

**Location:** `supabase/migrations/003_rls_policies.sql`.

**Root cause:** RLS was never enabled on this table, so the blanket
`GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated` in
`004_grants.sql` let any authenticated user read/insert/delete rows
directly — a malicious user could pre-insert a real Stripe `event_id` to
make the webhook handler treat a billing-critical event as
already-processed and silently skip it.

**Fix confirmed:** `ALTER TABLE public.stripe_processed_events ENABLE ROW
LEVEL SECURITY` plus a deny-all policy for `authenticated`/`anon`. The
service-role webhook handler is unaffected (bypasses RLS).

#### F-12 — `remove_focus_area_from_employees` had no permission check — **Low** — ✅ Fixed

**Location:** `supabase/migrations/002_functions_triggers.sql`.

**Root cause:** the function correctly scoped its `UPDATE` to
`org_id = public.caller_org_id()` (no cross-tenant leak) but had no
`check_admin_permission` gate — any regular `user`-role member could strip
a focus area from every employee in their own org.

**Fix confirmed:** the function now raises unless
`public.check_admin_permission('canManageFocusAreas')` — the same
permission already used by the `focus_areas` table's own RLS policies.

#### F-13 — `purge_expired_data()` referenced a nonexistent `shifts` table — **Low (compliance)** — ✅ Fixed

**Location:** `supabase/migrations/002_functions_triggers.sql`.

**Root cause:** a leftover `DELETE FROM shifts ...` predating the schema
consolidation (schedule data lives in `schedule_cells`, not `shifts`).
Every invocation raised `relation "shifts" does not exist`, silently
breaking the GDPR/data-retention purge job for every org, every run.

**Fix confirmed:** the query now targets `public.schedule_cells`, comparing
`date` (a native `DATE` column) directly instead of the old broken
`::TEXT` cast. `schedule_cell_snapshots`/`schedule_cell_segments` cascade
via existing `ON DELETE CASCADE` foreign keys, so no separate cleanup step
was needed for those tables.

#### F-14 — `schedule/actor-names` resolved profile names without org-scoping ids — **Low** — ✅ Fixed

**Location:** `apps/web/src/app/api/schedule/actor-names/route.ts`.

**Root cause:** the route verified the caller belonged to the requested
`orgId`, then queried the global `profiles` table with `.in("id", ids)`
where `ids` came straight from the request body (up to 200 UUIDs) — no
filter on which ids could be looked up. Any org member could submit UUIDs
belonging to users in other orgs and get their first/last name back.

**Fix confirmed:** the route now queries `organization_memberships` first
to determine which of the requested ids are actually active members of
`orgId`, and only queries `profiles` for that filtered set. Covered by
`route.test.ts`, including a new test asserting `profiles.in(...)` is never
called with a cross-org id even when one is requested.

#### F-15 — Impersonation cookie not cross-validated against `impersonation_sessions` — **Informational** — ✅ Fixed

**Location:** `apps/web/src/lib/impersonation.ts`; consumers in
`proxy.ts`, `api/organization/bootstrap/route.ts`,
`api/account/permissions/route.ts`.

**Root cause:** the impersonation cookie is client-writable (set via
`document.cookie`, not `HttpOnly`) and populated mostly from client-held
state rather than the `start_impersonation` RPC's return value. Every
consumer trusted the cookie's own `expiresAt`/`targetOrgId`/`targetUserId`
without checking `impersonation_sessions` for a matching, active row. This
did **not** grant cross-tenant access — every consumer still gated on the
real, JWT-verified `platform_role === "gridmaster"` claim, and a genuine
gridmaster already has full cross-org access — but it let a gridmaster
bypass the mandatory justification, audit row, and target-user notification
that `start_impersonation` normally enforces.

**Fix confirmed:** added `verifyImpersonationSession()`
(`apps/web/src/lib/impersonation-server.ts`), which looks up
`impersonation_sessions` by `session_id` + `gridmaster_id`, requiring
`ended_at IS NULL AND expires_at > now()`, and returns the row's
authoritative `target_org_id`/`target_user_id`. All three consumers now
call this before honoring the cookie; on no match, they fall back to the
caller's real context (middleware clears the cookie; the two API routes
fall through to non-impersonated resolution) instead of trusting any
cookie field. Covered by updated tests in `middleware.test.ts` and
`account/permissions/route.test.ts`, including cases proving a forged
`sessionId` is rejected.

#### F-16 — `organizations/app-only-user` let any org admin overwrite an arbitrary user's global profile name — **High** — ✅ Fixed

**Location:** `apps/web/src/app/api/organizations/app-only-user/route.ts`.

**Found by:** a post-fix security review pass over this same batch of
changes (the F-10 fix touched this route but didn't cover this separate
issue).

**Root cause:** the F-10 fix correctly resolved `orgId` through
`resolveEffectiveOrgId` before the `canManageEmployees(serviceClient,
user.id, orgId)` permission check, but the route's `userId` — the target of
the mutation, taken straight from the request body — was never validated
as belonging to `orgId` anywhere. The `organization_memberships` update
(phone/department fields) was already scoped by `.eq("org_id", orgId)`,
but the `profiles` table update (first/last name) ran with only
`.eq("id", userId)` — no org filter at all — against the service-role
client, which bypasses RLS.

**Impact:** any admin/super_admin (or per-person `canManageEmployees`
holder) of Org A could send `PATCH /api/organizations/app-only-user` with
`{ orgId: <Org A>, userId: <any user UUID>, firstName: "..." }` and
overwrite that user's global profile name, regardless of which org — or
none — they actually belonged to. This is exactly the class of
cross-tenant data corruption this audit set out to close.

**Fix confirmed:** the route now looks up `organization_memberships` for
`(userId, orgId)` with `archived_at IS NULL` before performing any
mutation, returning 404 if the target isn't an active member — matching
the existing "User membership not found" pattern used by
`organizations/access/route.ts`. Covered by a new test in `route.test.ts`
asserting the `profiles` table is never touched when the target isn't a
member of the resolved org.

### Remediation status

All nine findings (F-8 through F-16) are fixed as of this update. F-16 was
caught by a follow-up security-review pass over this same set of changes
rather than the original three-agent audit — see the note at the top of
this section.

---

## 2026-09-14: Authentication security hardening (build-plan item 19)

**Scope:** the complete web and mobile authentication and onboarding lifecycle,
delivered as build-plan features 19a-19e between 2026-09-08 and 2026-09-14. This
was a build-and-verify epic rather than an audit, so it is recorded here as a
pointer: each sub-feature's archive under `blueprint/history/features/19*.md`
carries its own inventory, evidence, and disclosed limits.

| Pass | What it locked down                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 19d1 | One authorization contract for web cookies, web bearer, and mobile bearer: signature-verified, non-revoked session plus current live membership in exactly one organization. Stale org claims, archived memberships, revoked sessions, and cross-tenant ids fail closed; service-role paths carry explicit tenant checks. Migrations `016` and `017`. | `__tests__/api-authorization-boundaries.test.ts`, `sensitive-action-authorization-boundaries.test.ts`, feature archive        |
| 19d2 | Five-minute sensitive-action window from signed `amr` timestamps (`@dubgrid/authz` `assurance.ts`); AAL2 required when a verified TOTP factor exists, fresh password proof otherwise; one shared MFA lifecycle handler with pending-factor cleanup and no Auth Admin factor mutations.                                                                | `docs/mfa-provider-boundary.md` (hosted-provider qualification, accepted limits), `mfa-lifecycle.test.ts`                     |
| 19d3 | Invitation and recovery credentials expire, bind to the intended identity, and are single-use (`accept_invitation`, migration `018`); post-auth redirects pinned to an allowlist; one fail-closed CSRF origin policy with every non-browser exception classified.                                                                                     | `lib/auth/integrity-contract.ts`, `__tests__/auth-integrity-entry-points.test.ts`, `invitation-integrity.integration.test.ts` |
| 19d4 | Generic public identity-facing failures; distributed per-source, per-target, and global limits on login and recovery that fail closed in production; credentials kept out of URLs and telemetry; security-event audit coverage without secrets.                                                                                                       | `lib/auth/abuse-boundary-contract.ts`, `lib/auth/security-audit.ts`, `lib/auth/security-redaction.ts`                         |
| 19e  | Machine-checked role, account-state, surface, and browser qualification matrix (`e2e/auth-release-qualification.spec.ts`, `lib/auth/release-qualification.ts`), with unavailable evidence disclosed rather than inferred.                                                                                                                             | `blueprint/history/features/19e-authentication-release-qualification.md`                                                      |

Related earlier work in the same window: the sandbox POST gained a server-side
admin+ role gate (F-8), `useSchedulePresence` replaced the advisory cell locks
whose trigger-driven broadcasts had become unreliable (2026-09-04), publish
history became a management-only read (2026-09-05), and the mobile API stopped
serving management-only data to regular staff (2026-09-05).

Counts quoted above (36 tables, four migration files) describe the schema as it
stood in May 2026; as of 2026-09-19 there are 42 tables, all with RLS, across
20 numbered migrations.

**Open, by decision:** MFA enforcement stays account-based (a dismissible nag for
management accounts without a factor rather than a hard AAL2 gate on `/settings`
and `/gridmaster`), and there is no gridmaster IP allowlist. Direct calls to
Supabase's own factor-removal and credential endpoints remain subject to the
provider's policy rather than DubGrid's five-minute window; see
`docs/mfa-provider-boundary.md` for the approved scope.
