# Security Audit — DubGrid

**Date:** 2026-05-21 (last updated 2026-05-25)
**Scope:** Entire monorepo — `apps/web` (Next.js 16), `apps/mobile` (Expo),
`packages/*`, Supabase migrations (RLS / RPCs / grants / JWT hook), edge
middleware, dependencies.
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
no `eval`, no committed secrets, and no broken tenant isolation were found.

All seven original findings are now closed (F-5 was withdrawn as already
implemented; the rest are fixed). `npm audit` is 0 critical / 0 high / 0 low.

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
`apps/web/middleware.ts`. The middleware-bypass advisories were therefore
directly relevant. Data exposure was bounded because the app correctly treats
RLS as the real security boundary (all org-scoped tables enforce
`caller_org_id()`), so a bypass alone does not leak another tenant's rows.

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

**Location:** `apps/web/middleware.ts` (CSP generation, lines ~87-180)

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
3. `apps/web/middleware.ts` now builds two CSP variants:
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
- **Middleware JWT fallback** (`middleware.ts`) — `jwtVerify` then `decodeJwt`
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
