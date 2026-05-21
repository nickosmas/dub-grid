# Security Audit — DubGrid

**Date:** 2026-05-21
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

The **one materially actionable finding** is an outdated Next.js version with
known middleware-bypass and SSRF advisories. The remainder are low-severity
defense-in-depth inconsistencies and informational notes.

### Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| F-1 | **High** | `next@16.2.4` has known middleware-bypass + SSRF + DoS advisories | ✅ Fixed — upgraded to `16.2.6` |
| F-2 | Low | `/api/organizations/role-change` lacks rate limiting (siblings have it) | ✅ Fixed — `apiLimiter` added |
| F-3 | Low | CSRF Origin validation applied inconsistently across mutating routes | ✅ Fixed — `validateCsrfOrigin` applied to 20 routes |
| F-4 | Low | CSP `script-src` relies on `'unsafe-inline'` (no nonce) | ⏸ Deferred (deliberate) — see detail |
| F-5 | ~~Info~~ | ~~Gridmaster demotion stale-token window~~ | ❌ Withdrawn — already implemented (see appendix) |
| F-6 | Informational | Sandbox cookie is not `HttpOnly` | ✅ Fixed — cookie now `HttpOnly` |
| F-7 | Informational | Transitive dependency advisories (not production-reachable) | ⏸ Bump on cadence (no churn now) — see detail |

> **Remediation applied 2026-05-21:** F-1, F-2, F-3, F-6 fixed in code. F-5 was
> found on re-verification to be already implemented and is withdrawn. F-4 and
> F-7 are deliberately deferred with rationale below (each would cost more than it
> returns right now).

---

## Findings detail

### F-1 — Outdated Next.js with middleware-bypass & SSRF advisories — **High**

**Location:** `next@16.2.4` (confirmed installed; `npm ls next`). Vulnerable
range per advisories: `16.0.0 – 16.2.5`.

**Evidence:** `npm audit` reports `next` as **high**, including:
- *Middleware / Proxy bypass through dynamic route parameter injection* — CVSS 8.1 (GHSA-492v-c6pp-mqqv)
- *Middleware / Proxy bypass via segment-prefetch routes* — CVSS 7.5 (GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6)
- *SSRF via WebSocket upgrades* — CVSS 8.6 (GHSA-c4j6-fc7j-m34r)
- Several DoS advisories (Server Components, Cache Components, Image Optimization) — CVSS 7.5 / 5.9

**Impact:** This app performs route gating, **billing-lock enforcement**,
**org suspension/archival redirects**, and impersonation-context rewriting in
`apps/web/middleware.ts`. The middleware-bypass advisories are therefore
directly relevant: an attacker could reach gated routes or bypass the
suspended/billing-locked redirects. Data exposure is **bounded** because the app
correctly treats RLS — not middleware — as the real security boundary (verified:
all org-scoped tables enforce `caller_org_id()`), so a bypass does not by itself
leak another tenant's rows. The SSRF and DoS items affect availability and
server-side request integrity.

**Remediation:** Upgrade Next.js to the latest patched 16.x (≥ 16.2.6) and
re-run `npm audit`. `fixAvailable: true`. Verify middleware-dependent gates
(billing lock, suspension redirect) still behave after upgrade.

> Note: the Next advisory *XSS in App Router using CSP nonces* (GHSA-ffhc-5mcf-pf4q)
> does **not** apply here — this app does not use CSP nonces (see F-4).

---

### F-2 — Role-change route lacks rate limiting — **Low**

**Location:** `apps/web/src/app/api/organizations/role-change/route.ts:18-70`

**Evidence:** Sibling mutation routes (`/api/organizations/access`,
`/api/organizations/settings`, `/api/employees/status`, `/api/stripe/*`) call
`apiLimiter`, but `role-change` does not. It does enforce CSRF origin
(`validateCsrfOrigin`), authentication (`requireAuthenticatedUser`), Zod
validation, and delegates to the `change_user_role` RPC.

**Impact:** Low. The RPC itself is hardened — self-action guard, admin-tier
guard, last-super_admin protection, `pg_advisory_xact_lock`, and idempotency-key
dedup (`apps/migrations/002_functions_triggers.sql:507-647`). An attacker cannot
escalate privilege regardless of request volume; the only residual is
unthrottled write attempts against the log table. This is a consistency /
defense-in-depth gap, not an exploitable flaw.

**Remediation:** Add `apiLimiter` keyed on `auth.user.id`, matching the sibling
routes.

---

### F-3 — Inconsistent CSRF origin validation on mutating routes — **Low**

**Location:** 21 mutating handlers omit `validateCsrfOrigin`, including
`api/account/profile`, `api/employees/manage`, `api/schedule/manage`,
`api/invitations/accept`, `api/gridmaster/delete-org`, `api/notifications/*`.
(44 of 65 mutating handlers do call it.)

**Evidence:** `grep` over `route.ts` files for `POST|PUT|PATCH|DELETE` vs
`validateCsrfOrigin`. The omitting routes authenticate via cookie-based
`requireAuthenticatedUser` / `requireOrgPermissions`.

**Impact:** Low. The primary CSRF control is the Supabase auth cookie's
`SameSite=Lax` attribute (the codebase sets `SameSite=Lax` everywhere it sets
cookies explicitly, and uses the `@supabase/ssr` default elsewhere), which blocks
the cookie from being sent on cross-site POST. Combined with the routes requiring
an `application/json` body (`req.json()`, which forces a CORS preflight for
cross-origin callers), practical CSRF is not achievable. This is a
defense-in-depth inconsistency.

**Remediation:** Apply `validateCsrfOrigin` uniformly to all state-changing
handlers (it's a one-line guard) so the protection doesn't depend solely on
cookie `SameSite` behavior. Optionally confirm/centralize `SameSite=Lax` on the
Supabase session cookie via `cookieOptions`.

---

### F-4 — CSP `script-src` uses `'unsafe-inline'` (no nonce) — **Low**

**Location:** `apps/web/middleware.ts:89-106`

**Evidence:** The CSP sets `script-src 'self' 'unsafe-inline' …` rather than a
nonce/`strict-dynamic` policy. The header is otherwise solid: `default-src
'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`,
`form-action 'self'`, plus `upgrade-insecure-requests` in production; HSTS,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and
`Permissions-Policy` are set in `next.config.ts`.

**Impact:** Low. `'unsafe-inline'` weakens the XSS mitigation value of CSP, but
the app has **no injection sink** (zero `dangerouslySetInnerHTML`, no `eval`/`new
Function`, React auto-escaping throughout — verified by grep across `apps` and
`packages`). CSP here is a secondary control; the absence of an exploitable sink
means the practical risk is minimal.

**Decision — deferred (deliberate), 2026-05-21:** Not implemented. A nonce-based
`script-src` + `strict-dynamic` migration in Next 16 must thread a per-request
nonce through every inline script, but several routes (landing / privacy / terms)
are **statically pre-rendered** and emit script tags with no nonce; `strict-dynamic`
would override `'self'` and block those scripts, breaking React hydration on the
public pages (the existing inline comment in `middleware.ts` documents exactly
this). Weighed against **zero exploitable injection sink** (no
`dangerouslySetInnerHTML`, `eval`, or `new Function` anywhere), shipping that
migration now is net-negative: real breakage risk for negligible security gain.
Tracked as future hardening, to be done alongside a deliberate static-vs-dynamic
rendering pass — not as a reactive fix.

---

### F-5 — Gridmaster post-demotion stale-token window — **Withdrawn (not a finding)**

The initial audit pass flagged a possible stale-token window after gridmaster
demotion based on reading only `apps/web/src/lib/api-auth.ts`. On re-verification
of the demotion RPCs this is **already fully handled** and the finding is
withdrawn:

- `demote_gridmaster_account` (`002_functions_triggers.sql:3008-3013`) **deletes
  the target's `user_sessions`** and inserts a **5-minute `jwt_refresh_locks`**
  row (`reason='gridmaster_demotion'`).
- `set_gridmaster_account_deactivated` (`:3060-3067`) does the same
  (`reason='gridmaster_activation_change'`).
- `promote_gridmaster_by_email` (`:2940-2945`) likewise clears sessions + locks.

The 5-minute lock is *stronger* than the 5-second lock used for org-role changes,
so a demoted/deactivated gridmaster's next token mint is blocked and re-resolved
immediately. No action needed. (`requireGridmasterSession` reading the
signature-verified `platform_role` claim remains correct — the claim is written
only by the SECURITY DEFINER hook and cannot be forged.)

---

### F-6 — Sandbox cookie is not `HttpOnly` — **Fixed**

**Location:** `apps/web/src/app/api/test-sandbox/route.ts` (set-site);
`apps/web/src/lib/sandbox-cookie.ts`.

**Evidence (original):** The `dubgrid-sandbox` cookie was set server-side with an
explicit `httpOnly: false`, leaving it readable by client JS.

**Impact:** Informational — the cookie carries no secret (only
`{ sandboxOrgId, userId }`) and is never trusted on its face; every consumer
re-verifies ownership server-side against the DB at three gates. So this was
hygiene, not an exploitable issue.

**Fix applied (2026-05-21):** Flipped the cookie to `httpOnly: true`. Verified
this is safe with no functional cost: the cookie is **set** server-side
(`test-sandbox` route), **read** only server-side (`api-auth.ts` +
`middleware.ts`), and **cleared** server-side (`action: "exit"` sets `maxAge: 0`).
No client code reads it. The now-incorrect dead helper
`clearSandboxCookieFromBrowser` (zero callers; JS cannot clear an `HttpOnly`
cookie) was removed to prevent a future footgun.

---

### F-7 — Transitive dependency advisories (not production-reachable) — **Informational**

**Evidence & triage (`npm why`):**
- **`protobufjs` (high)** — reached only via `posthog-js → @opentelemetry/exporter-logs-otlp-http`. The advisories require attacker-controlled protobuf descriptors; the OTLP exporter only *emits* telemetry and never parses untrusted protobuf. Not reachable.
- **`fast-uri` (high, path traversal)** — reached only via `@sentry/nextjs → webpack → schema-utils → ajv`. This is a **build-time** toolchain dependency, absent from the production runtime. Not reachable.
- Remaining moderates (`@expo/*`, `hono`, `@modelcontextprotocol/sdk`, `turbo`, `postcss`, `ws`) are dev/CLI/Expo-tooling, not in the deployed web runtime.

**Decision — bump on cadence, no churn now (2026-05-21):** A non-force
`npm audit fix` *does* clear both highs, but it rewrites the lockfile by
**+1,181 packages / ~+15,900 lines** (it pulls duplicated nested trees to satisfy
the patched ranges). For two **non-production-reachable** advisories, during active
WIP, that churn risks subtle build/runtime resolution changes far out of
proportion to the benefit — so it was attempted, inspected, and **reverted**. The
Next.js bump (F-1) re-audit confirms its HIGH advisories cleared; the two
remaining highs are these non-reachable transitives. Bump `posthog-js` and the
Sentry/webpack chain as part of a normal, isolated dependency-update PR (not
folded into a security fix), then re-audit.

---

## Reviewed — verified sound (not findings)

These were specifically checked and confirmed correct, including several
candidate leads that were **disproven**:

- **Tenant isolation (RLS).** All 36 tables have RLS enabled. `organizations`
  policies are `TO authenticated` only (no `anon` policy ⇒ unauthenticated reads
  denied), and members are restricted to `id = caller_org_id()`. The broad
  column-level `GRANT … TO anon` on `organizations` (`004_grants.sql:67-108`) is
  **moot** because RLS denies all rows to anon — *candidate lead disproven.*
  Billing columns (`stripe_*`, `subscription_seats`) are additionally revoked.
- **`caller_org_id()` per-session isolation** (`002:28-37`) — prefers the
  JWT-baked claim, preventing a sibling device's `switch_org` from leaking into
  another session.
- **JWT hook** (`002:110-245`) — strips org claims for archived/suspended orgs
  and deactivated users; honors `jwt_refresh_locks`; `SECURITY DEFINER`, owner
  `postgres`, `EXECUTE` granted only to `supabase_auth_admin`/`service_role`.
- **Role-change / assign-role RPCs** — caller-identity check (`p_changed_by_id =
  auth.uid()`), self-action guard, admin-tier guard (admins can't touch
  admin/super_admin/gridmaster or assign privileged roles), last-super_admin
  guard, advisory lock, idempotency, audit log, JWT refresh lock. Direct
  `org_role` UPDATEs blocked by `guard_org_role_change` trigger.
- **Middleware JWT fallback** (`middleware.ts:188-213`) — `jwtVerify` →
  `decodeJwt` fallback never trusts `gridmaster` from an unverified token; RLS is
  the real boundary. Matches documented invariant.
- **Stripe webhook** (`api/stripe/webhook/route.ts:41-58`) — verifies
  `stripe.webhooks.constructEvent` signature; fails closed on missing
  secret/signature.
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
- **`SECURITY DEFINER` hygiene** — all 80 such functions set
  `SET search_path = public`.
- **Rate limiter** (`apps/web/src/lib/rate-limit.ts`) — fails **closed** in
  production when Redis is unconfigured (503), disabled in dev by design.
- **Mobile parity** — mobile auth uses the same `SECURITY DEFINER` RPCs
  (`switch_org`, `start_trial_for_org`) via an RLS-scoped session client
  (`packages/mobile-api-core/src/auth.ts`); no weaker parallel authorization path.
- **Anon grants** — `anon` has only `INSERT` on `cookie_consents` and no blanket
  function `EXECUTE` (`004_grants.sql:141-146`).

---

## Dependency audit summary

Before fixes: **0 critical, 3 high, 14 moderate, 1 low.**
After the F-1 Next.js bump: **0 critical, 2 high, 17 moderate, 1 low** — the
remaining 2 highs are the non-reachable transitives below.

| Package | Severity | Production-reachable? | Action |
|---------|----------|----------------------|--------|
| `next` | ~~high~~ | **Yes** (framework + middleware auth) | ✅ Upgraded to `16.2.6` — HIGH advisories cleared |
| `protobufjs` | high | No (posthog-js OTLP emit path) | Bump on cadence |
| `fast-uri` | high | No (build-time webpack/ajv) | Bump on cadence |
| `ws`, `postcss`, `hono`, `@expo/*`, `turbo`, etc. | moderate/low | No (dev/CLI/Expo tooling) | Bump on cadence |

---

## Remediation status (final)

- ✅ **F-1** — Next.js upgraded to `16.2.6`; HIGH middleware-bypass/SSRF/DoS cleared.
- ✅ **F-2** — `apiLimiter` added to the role-change route.
- ✅ **F-3** — `validateCsrfOrigin` applied to 20 mutating routes; redundant
  inline check in `request-demo` removed.
- ✅ **F-6** — Sandbox cookie set `HttpOnly`; dead client-clear helper removed.
- ❌ **F-5** — Withdrawn; already implemented (5-minute refresh lock + session wipe
  on gridmaster demotion/deactivation).
- ⏸ **F-4** — Deferred deliberately (nonce migration risks breaking statically
  pre-rendered pages; no exploitable sink). Future hardening.
- ⏸ **F-7** — Deferred deliberately (auto-fix churns the lockfile by ~1,200
  packages for non-reachable advisories). Bump on a normal dependency PR.
