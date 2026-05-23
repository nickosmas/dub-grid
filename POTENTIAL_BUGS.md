# Bug & Edge-Case Hunt — DubGrid

Date: 2026-05-23. Proactive sweep across rendering/config, middleware, API/data,
auth/session/React, and build/tooling. Findings are verified against actual code
(the Critical/High items were re-checked by hand, not just asserted). Each lists
location, the trigger/edge case, and a fix.

> Theme: most of these are the same *classes* of issue that have been biting —
> (a) static-vs-dynamic render assumptions, (b) the sandbox effective-org redirect
> not being propagated to the mutation, (c) the `install-strategy=nested` lockfile
> behavior. Fixing the patterns (not just instances) is what stops the recurrence.

---

## CRITICAL

### C-1 — CI is broken: `npm ci` fails against the committed lockfile
- **Where:** `package-lock.json` vs `apps/web/package.json` (`pg` → `pg-protocol@1.14.0`); `.npmrc` (`install-strategy=nested`).
- **Verified:** `npm ci --dry-run` → `EUSAGE … Missing: pg-protocol@1.14.0 from lock file`.
- **Trigger:** every fresh clone and **every GitHub Actions job** (`.github/workflows/ci.yml` lint/type-check/test/build, `e2e.yml`, `dependency-audit.yml` all start with `npm ci`). They fail before running anything.
- **Why it's invisible locally:** `apps/web` scripts use `NEXT_IGNORE_INCORRECT_LOCKFILE=1`, which masks the drift for `next dev/build`. `npm ci` has no such flag. This is the `install-strategy=nested` footgun at lockfile-generation time.
- **Fix:** full clean reinstall to regenerate a consistent lockfile (`rm -rf node_modules apps/*/node_modules packages/*/node_modules package-lock.json && npm install`), commit it, and **gate it with `npm ci --dry-run` (must exit 0)** in a pre-push/CI check. Consider dropping `install-strategy=nested` if it isn't strictly required — it's the root cause of both this and the override-not-applying issue.

---

## HIGH

### H-1 — Sandbox → real-org privilege escalation (effective-org not propagated to the mutation)
- **Where:** `apps/web/src/app/api/organizations/access/route.ts` (PATCH ~197-243 and the DELETE handler); same pattern in `apps/web/src/app/api/people/change-requests/[id]/route.ts:48-54` (can reach `deleteUserAccountWithCleanup`) and `apps/web/src/app/api/employees/status/route.ts:84-122`.
- **Root cause (verified):** `requireOrgPermissions(req, orgId, …)` reassigns `orgId = sandboxOrgId` when a sandbox cookie is present and evaluates the permission check against the **sandbox** (where the caller is always super_admin) — but these routes throw away the returned effective orgId (`requirePrivilegedActor` returns only `{ok:true}`) and run the mutation against the **raw body/query orgId** via the **service client** (RLS bypassed). `change_user_role` via the service client does not re-check `auth.uid()` authority.
- **Trigger:** a caller who is non-super_admin (even a plain `user` or `admin`) on real org X but owns a sandbox sends `PATCH/DELETE … { orgId: X, … }` with the sandbox cookie set. The gate passes against the sandbox; the membership change / account deletion lands on X.
- **Fix:** use the **effective** orgId from `requireOrgPermissions` for every downstream op (the pattern already used in `organizations/users/route.ts:100`). Make `requirePrivilegedActor` return `auth.orgId` and have callers use it for `fetchOrganizationUser`, `change_user_role`, the membership DELETE, `resolveProfileChangeRequest`, and the employee update. Add `forbidIfSandboxCookie` to genuinely destructive endpoints (`change-requests/[id]` account deletion).

### H-2 — `/billing-required` gets the nonce CSP but is statically prerendered (F-4 bug class, repeated)
- **Where:** `apps/web/middleware.ts` public-route list (~159) + `apps/web/src/app/billing-required/page.tsx`.
- **Verified:** `/billing-required` IS in `prerender-manifest.json` (static) and is NOT in the middleware public-route branch → it receives `dynamicCspHeaderValue` (nonce + `strict-dynamic`) in production. Static HTML can't carry a per-request nonce → scripts blocked → **hydration breaks**.
- **Trigger:** exactly the unhappy-path audience that must see it — a non-super-admin whose org trial is pending / billing is hard-locked (middleware ~492-499).
- **Fix:** add `pathname === "/billing-required" ||` to the public-route condition (it holds no user data, no sink), **or** add `export const dynamic = "force-dynamic"` to the page. *Process fix:* the static/dynamic split is a recurring trap — add a test or build-time check that asserts every route receiving the nonce CSP is dynamic (absent from `prerender-manifest.json`).

### H-3 — Gridmaster MFA verify has no error handling → stuck screen
- **Where:** `apps/web/src/app/login/page.tsx:317-323` — `handleMFAVerified` does `refreshBrowserSession().then(() => { markAuthTransition(); router.replace("/dashboard"); })` with **no `.catch`**.
- **Trigger:** gridmaster passes TOTP but `refreshBrowserSession()` rejects (network/refresh hiccup) → navigation never fires, no toast, MFA/splash hangs (unhandled rejection). The org-login path (`OrgLogin.handleMFAVerified` ~570-636) correctly wraps this in try/catch — the gridmaster path was missed.
- **Fix:** mirror the org path: `async` + try/catch, `toast.error` and reset state on failure.

---

## MEDIUM

### M-1 — Sandbox read leaks (same effective-org gap, read paths)
- `apps/web/src/app/api/people/change-requests/route.ts:29` (GET passes raw `orgId` to `listAdminProfileChangeRequests`) and `apps/web/src/app/api/dashboard/analytics/route.ts:40-41` (raw `orgId` to analytics fetchers). A sandbox super_admin reads **real-org PII / analytics**. Fix: use `auth.orgId`.

### M-2 — `dg_user_view` ("view as user") leaks across logins in the same tab
- **Where:** `apps/web/src/hooks/useLogout.ts:47-72` clears `dg_user_name` but not the global `dg_user_view`; clearing relies on a `usePermissions` effect that races the `window.location.replace()` in `finally`.
- **Trigger:** admin enables view-as-user → logs out → logs back in *same tab* → silently lands in read-only user view.
- **Fix:** call `setUserViewActive(false)` / remove `dg_user_view` explicitly in `signOutLocal`.

### M-3 — `checkRateLimit` can throw outside callers' try blocks
- **Where:** `apps/web/src/lib/rate-limit.ts:102` (`limiter.limit(key)` un-try/caught); callers like `employees/status/route.ts:60` invoke it before their try → an Upstash error becomes a framework 500 instead of a clean handler.
- **Fix:** wrap `limiter.limit` in try/catch inside `checkRateLimit`; in prod treat a Redis throw like `misconfigured` (deterministic fail-closed).

### M-4 — Stripe webhook lacks event-replay idempotency for log writes
- **Where:** `apps/web/src/app/api/stripe/webhook/route.ts:63-129`. Signature + `upsertSubscription` are idempotent, but `invoice.payment_*` / `customer.updated` / `payment_method.*` write audit/activity rows with no dedup on `event.id`. Stripe redelivers → duplicate log entries.
- **Fix:** a processed-events guard keyed on `event.id` (unique constraint + on-conflict-do-nothing) before side effects.

### M-5 — Side effects during render in the onboarding/auth-transition path
- **Where:** `apps/web/src/components/onboarding/OnboardingGate.tsx:156,176` calls `consumeAuthTransition()` (a `sessionStorage.removeItem`) in the render body; `RouteGuards.tsx:50-51` reads `isAuthTransitionPending()` during render. Under React concurrent/strict rendering a discarded render still mutates sessionStorage → the splash flag can be consumed before the navigation that needs it paints (flash/blank).
- **Fix:** move `consumeAuthTransition()` into a `useEffect`.

### M-6 — Unvalidated query param cast to enum
- **Where:** `apps/web/src/app/api/people/change-requests/route.ts:24-26` casts URL `status` straight to `ProfileChangeRequestStatus` (no Zod). Low data impact but unvalidated input into a query. Fix: `z.enum([...]).optional()`.

---

## LOW

- **L-1 — `usePermissions` cross-instance setState storm:** `features/permissions/usePermissions.ts:111` calls `setUserViewActive(false)` (no "already-false" guard) from an effect, synchronously re-rendering every other `usePermissions` consumer. Guard against unchanged value; prefer `useSyncExternalStore`.
- **L-2 — `departments` realtime over-invalidation:** `usePermissions.ts:215-228` re-resolves perms on every `departments` UPDATE, but departments don't grant permissions (vestigial). Drop that subscription → removes an org-wide invalidation storm.
- **L-3 — Gridmaster oversight queries have no `.limit()`:** `apps/web/src/app/api/gridmaster/_lib/oversight.ts:185-224` `.select()` with no cap (PostgREST silently truncates → under-reported platform counts); `schedule_cells` fetched in full then JS-filtered to 30 days. Push filters/limits into the query.
- **L-4 — `useOnboardingState.ts:64-67` persists the unclamped step index** (writes `currentStepIndex`, consumers use `safeStepIndex`); a reload mid-realign re-reads a stale index. Persist `safeStepIndex`.
- **L-5 — `ProtectedRoute` 6s fallback timer resets on auth churn** (`RouteGuards.tsx:38-44`); a flapping `[isLoading,user]` can exceed the intended hard cap. Track start time in a ref.
- **L-6 — Orphan boundary files:** `apps/web/src/app/setup/error.tsx` + `loading.tsx` with no `setup/page.tsx` (dead, `/setup` 404s). Delete the folder.
- **L-7 — `notifications` / `reports` lack segment `loading.tsx`/`error.tsx`** (fall back to root chrome); cosmetic, inconsistent with siblings.
- **L-8 — `db:reset:remote` has no confirmation before `DROP SCHEMA public CASCADE`** (`scripts/reset-remote-db.ts:38`); only guard is `url.includes("supabase.co")` — production passes. Add a typed project-ref confirmation; fix the `.env.local`→`.env.remote` wording.
- **L-9 — Quoted `.env*` values** (`.env.local.bak:2-4`): loaders strip them, but literal use (curl, hand-sourcing) breaks. Drop the quotes.

---

## Verified clean (checked, not bugs)
- `packages/*` platform-neutrality (no next/expo/RN/DOM/node imports); `dist/` rebuilt via web `predev`/`prebuild` hooks + turbo `^build`.
- Exactly 4 migration files; `custom_access_token_hook` tables all granted to `supabase_auth_admin`.
- All current npm `overrides` are actually applied in the lockfile (no silent unapplied fix) — *but only because of the recent clean reinstall; the next bump needs another clean reinstall*.
- `CONSENT_VERSION` correct (impersonation/sandbox cookies are essential).
- Error sanitization (`packages/client-errors`) blocks raw DB/JWT leaks; `apiErrorResponse` logs server-side only.
- `error.tsx`/`not-found.tsx` delegate to shared `RouteBoundary`; no catch-all routes; no raw `<img>`; no `dangerouslySetInnerHTML`/`eval`/`<script>`.
- AppShell/header React Query keys include `orgId` (no cross-org cache bleed).

---

## Recommended order
1. **C-1** (CI down) and **H-1** (privilege escalation / account deletion) — fix now.
2. **H-2** (billing-required hydration) + add the "nonce route must be dynamic" guard so this class can't recur.
3. **H-3, M-1, M-2, M-3** — small, user-facing/security.
4. The rest as cleanup.
