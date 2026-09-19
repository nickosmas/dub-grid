# Bug and Edge-Case Hunt — DubGrid

**Date:** 2026-05-23 (last reconciled 2026-09-19)

Proactive sweep across rendering/config, middleware, API/data, auth/session/React,
and build/tooling. Findings are verified against actual code. Critical and High
items were re-checked by hand. Each entry lists location, the trigger/edge case,
and a fix.

> Theme: most of these are the same classes of issue that have been biting:
> (a) static-vs-dynamic render assumptions, (b) the sandbox effective-org redirect
> not being propagated to the mutation, (c) the `install-strategy=nested` lockfile
> behavior. Fixing the patterns, not just the instances, is what stops recurrence.

---

## CRITICAL

### C-1 — CI is broken: `npm ci` fails against the committed lockfile — ✅ Resolved (reconfirmed 2026-07-08)

- **Where:** `package-lock.json` vs `apps/web/package.json` (`pg` dependency pulls in `pg-protocol@1.14.0`); `.npmrc` (`install-strategy=nested`).
- **Verified at filing (2026-05-23):** `npm ci --dry-run` → `EUSAGE … Missing: pg-protocol@1.14.0 from lock file`.
- **Reconfirmed (2026-07-08):** Bumping the `dompurify` override (3.4.1 → 3.4.11, see SECURITY_AUDIT-adjacent npm-audit cleanup) required regenerating the lockfile, which doubled as a fresh end-to-end test of this item. A full clean reinstall (`rm -rf node_modules apps/*/node_modules packages/*/node_modules package-lock.json && npm install`) followed by `npm ci --dry-run` now exits clean (0 errors) — only normal cross-platform optional packages (`@tailwindcss/oxide-*`, `lightningcss-*`, `fsevents`, etc.) get added, no `EUSAGE`/missing-package errors. **Status: closed.**
- **New finding while reconfirming:** `install-strategy=nested` also caused the `dompurify` override itself to silently not apply to the nested copy under `apps/web/node_modules/posthog-js/node_modules/dompurify` — even a `--package-lock-only` recompute and a `node_modules`-only wipe left it pinned at the old version. It only resolved to the overridden version after wiping **both** `package-lock.json` and every `node_modules` directory and reinstalling from scratch. This is the same "override-not-applying" behavior flagged below, now reproduced concretely: overrides on nested-strategy installs are only reliably enforced by a **full** clean reinstall, not an incremental one.
- **Why it was invisible locally:** `apps/web` scripts use `NEXT_IGNORE_INCORRECT_LOCKFILE=1`, which masks drift for `next dev/build`. `npm ci` has no such flag.
- **Fix / standing recommendation:** Run a full clean reinstall (lockfile _and_ all `node_modules`, not just one or the other) whenever `package-lock.json` is regenerated or an override is changed, and gate it with `npm ci --dry-run` (must exit 0) in a pre-push/CI check. Consider dropping `install-strategy=nested` — it is the confirmed root cause of both this and the override-not-applying issue; the repo has now been shown to resolve correctly after a full clean reinstall without needing any override-specific workaround beyond that.
- **Correction (2026-08-07):** removing the `.npmrc` flag on its own does nothing. Tested by deleting the line, wiping every `node_modules`, and reinstalling with the lockfile intact: identical result — 8,532 packages, workspace `node_modules` still populated, and a byte-identical lockfile. **The lockfile is authoritative, not the flag**; it encodes the nested tree and `npm install` faithfully reproduces it. The 78%-smaller hoisted tree (1,891 packages) seen in an earlier test came from deleting the lockfile at the same time, not from the flag. So this is not a drop-in change: it requires a deliberate lockfile regeneration, which conflicts with the dependabot cooldown in `.github/dependabot.yml` (a full re-resolve pulls whatever is newest, bypassing the waiting period that lets a malicious release be caught). If done, time it right after a dependabot batch and run `npm run deps:scan -- --freshness` afterwards to review what moved. Restated: the real footgun is that overrides are baked into the lockfile tree, not the flag itself.

---

## HIGH

### H-1 — Sandbox to real-org privilege escalation (effective-org not propagated to the mutation) — ✅ Fixed

- **Where (original):** `apps/web/src/app/api/organizations/access/route.ts` (PATCH and DELETE handlers); `apps/web/src/app/api/people/change-requests/[id]/route.ts`; `apps/web/src/app/api/employees/status/route.ts`.
- **Root cause (original):** Routes threw away the sandbox-redirected effective orgId from `requireOrgPermissions` and ran mutations against the raw body orgId via the service client (RLS bypassed).
- **Fix confirmed:** All three routes now use the effective orgId:
  - `organizations/access/route.ts` — `requirePrivilegedActor` returns `{ ok: true, orgId: auth.orgId }` and the PATCH/DELETE handlers use `allowed.orgId` for all downstream operations (verified at lines 74, 207, 373).
  - `people/change-requests/route.ts` (GET) — uses `auth.orgId` (line 39).
  - `employees/status/route.ts` — calls `resolveEffectiveOrgId(req, user.id, parsed.data.orgId)` before the mutation (lines 91-94).

### H-2 — `/billing-required` gets the nonce CSP but is statically prerendered — ✅ Fixed

- **Where:** `apps/web/src/proxy.ts` (public-route classification); `apps/web/src/app/billing-required/page.tsx`.
- **Root cause:** `/billing-required` was statically prerendered but received the `dynamicCspHeaderValue` (nonce + `strict-dynamic`) in production, breaking script hydration for users in the billing-locked state.
- **Fix confirmed:** `apps/web/src/app/billing-required/page.tsx` now exports `export const dynamic = "force-dynamic"` (lines 2-4), making it server-rendered per request so it can carry the nonce.
- **Process fix still needed:** Add a build-time check that asserts every route receiving the nonce CSP is absent from `prerender-manifest.json`, so this class of issue cannot recur silently.

### H-3 — Gridmaster MFA verify has no error handling (stuck screen) — ✅ Fixed

- **Where:** `apps/web/src/app/login/page.tsx` — `handleMFAVerified` function.
- **Root cause (original):** `refreshBrowserSession().then(...)` with no `.catch` — a refresh failure left the MFA screen hanging with an unhandled rejection and no user feedback.
- **Fix confirmed:** `handleMFAVerified` is now `async` with a `try/catch` block (lines 318-333). On rejection it calls `toast.error("Your session could not be verified. Please sign in again.")`, signs out, and resets the MFA state. Mirrors the org-login path.

---

## MEDIUM

### M-1 — Sandbox read leaks (effective-org gap on read paths) — ✅ Fixed

- **Where (original):** `api/people/change-requests/route.ts` (GET passed raw `orgId`); `api/dashboard/analytics/route.ts` (raw `orgId` to analytics fetchers).
- **Fix confirmed:**
  - `change-requests/route.ts` — GET uses `auth.orgId` (line 39).
  - `dashboard/analytics/route.ts` — uses `auth.orgId` for both `fetchWeeklyShiftHours` and `fetchEmployeeUtilization` (lines 41-42).

### M-2 — `dg_user_view` (view-as-user toggle) leaks across logins in the same tab — ✅ Fixed

- **Where:** `apps/web/src/hooks/useLogout.ts`.
- **Root cause (original):** `useLogout` cleared `dg_user_name` but not `dg_user_view`, relying on a `usePermissions` effect that raced the `window.location.replace()`.
- **Fix confirmed:** `clearDubgridSessionState()` in `useLogout.ts` (lines ~30-40) iterates both `sessionStorage` and `localStorage`, removing every key that starts with `dg_`. Because `dg_user_view` matches this prefix, it is cleared explicitly before the redirect fires, with no race condition.

### M-3 — `checkRateLimit` can throw outside callers' try blocks — ✅ Fixed

- **Where:** `apps/web/src/lib/rate-limit.ts`.
- **Root cause (original):** `limiter.limit(key)` was not wrapped in try/catch; a Redis/Upstash throw escaped as a framework 500 instead of a clean handler response.
- **Fix confirmed:** `checkRateLimit` wraps `limiter.limit` in a try/catch (lines 118-129). On a Redis throw in production it returns `{ limited: true, misconfigured: true }` (fail-closed → callers return 503). In development it returns `{ limited: false }` for convenience.

### M-4 — Stripe webhook lacks event-replay idempotency for log writes — ✅ Fixed

- **Where:** `apps/web/src/app/api/stripe/webhook/route.ts`.
- **Root cause (original):** `invoice.payment_*` and other handlers wrote audit/activity rows with no dedup on `event.id`; Stripe redelivers events, producing duplicate log entries.
- **Fix confirmed:** The webhook handler now inserts into `stripe_processed_events` (unique on `event_id`) before processing any side effects (lines 63-76). A unique-violation short-circuits to an early 200 (acknowledged, already processed). The `stripe_processed_events` table is defined in `supabase/migrations/001_schema.sql` (line 1371).

### M-5 — Side effects during render in the onboarding/auth-transition path — ✅ Fixed

- **Where:** `apps/web/src/components/onboarding/OnboardingGate.tsx`; `apps/web/src/components/RouteGuards.tsx`.
- **Root cause (original):** `consumeAuthTransition()` (a `sessionStorage.removeItem`) was called in the render body; under React concurrent/strict rendering a discarded render could consume the flag before the navigation it was guarding.
- **Fix confirmed:**
  - `OnboardingGate.tsx` — `consumeAuthTransition()` is called inside a `useEffect` (line 163), gated on `reachedFinalDecision`.
  - `RouteGuards.tsx` — `consumeAuthTransition()` is called inside a `useEffect` (lines 34-35, 48-49), not during render. `isAuthTransitionPending()` (a read, not a mutation) is still called during render, which is safe.

### M-6 — Unvalidated query param cast to enum — ✅ Fixed

- **Where:** `apps/web/src/app/api/people/change-requests/route.ts`.
- **Root cause (original):** URL `status` was cast straight to `ProfileChangeRequestStatus` with no Zod validation.
- **Fix confirmed:** The route now validates `status` against an explicit `VALID_STATUSES` allowlist (`ProfileChangeRequestStatus[]`) before using it in the query (lines 25-35). Invalid values return 400.

---

## LOW

- **L-1 — `usePermissions` cross-instance setState storm:** `features/permissions/usePermissions.ts` called `setUserViewActive(false)` without an "already-false" guard, triggering synchronous re-renders across all `usePermissions` consumers. **Status: ✅ Fixed** — the view-as-user flag is now read through `useSyncExternalStore` and the setter no-ops when unchanged (confirmed in `AUTH_EDGE_CASES.md` and re-verified 2026-09-19).
- **L-2 — `departments` realtime over-invalidation:** `usePermissions.ts` re-resolved permissions on every `departments` UPDATE, but departments do not grant permissions (the column is vestigial). **Status: ✅ Fixed** — `usePermissions.ts` no longer subscribes to `departments` (the comment in the hook cites this item); org-wide `departments` invalidation lives only in the reference-counted `useOrgRealtimeInvalidation`.
- **L-3 — Gridmaster oversight queries have no `.limit()` on aggregate tables:** `apps/web/src/app/api/gridmaster/_lib/oversight.ts` — `selectRows` is a bare `.select()` with no limit for `organizations`, `organization_memberships`, `employees`, `invitations`, `shift_requests`, `user_sessions`, `mobile_device_tokens`, and several other tables (verified in code). `audit_log` and `impersonation_sessions` were fixed (`.limit(1000)` and `.limit(250)` respectively); `schedule_cells` now uses a 30-day date filter. The remaining unbounded queries are a data-growth risk (PostgREST silent max-rows truncation gives under-reported platform counts). **Status: PARTIALLY FIXED — schedule_cells and audit_log/impersonation_sessions are bounded; the aggregate-table `selectRows` calls remain unbounded (re-verified 2026-09-19: `selectRows` is still a bare `.select()`).**
- **L-4 — `useOnboardingState.ts` persisted the unclamped step index:** **Status: ✅ Fixed** — `useOnboardingState.ts` now persists `safeStepIndex` (lines 64-69), not the raw `currentStepIndex`. Comments in the file explicitly reference this fix.
- **L-5 — `ProtectedRoute` 6s fallback timer resets on auth churn:** **Status: ✅ Fixed** — `RouteGuards.tsx` uses a `bounceDeadlineRef` (`useRef<number | null>`) to store the wall-clock deadline (lines 28-47). The deadline is set once (`bounceDeadlineRef.current === null` guard) and not reset on subsequent re-renders from auth state changes.
- **L-6 — Orphan boundary files:** `apps/web/src/app/setup/` no longer exists (directory not found). **Status: ✅ Fixed**
- **L-7 — `notifications` and `reports` lack segment `loading.tsx`/`error.tsx`:** Both segments now have `loading.tsx` and `error.tsx` (confirmed in the filesystem). **Status: ✅ Fixed**
- **L-8 — `db:reset:remote` has no confirmation before `DROP SCHEMA public CASCADE`:** **Status: ✅ Fixed** — `scripts/reset-remote-db.ts` now calls `confirmDestructiveReset(ref)` which prompts the user to type the project ref to confirm, or can be bypassed by `CONFIRM_RESET=yes` for intentional automation. The misleading `.env.local` → `.env.remote` wording in the script was also corrected.
- **L-9 — Quoted `.env*` values** in `.env.local.bak`. Drop the quotes — some loaders strip them but hand-sourcing (curl, manual `source`) interprets the quotes literally. **Status: OPEN (low priority — affects only the `.bak` file)**

---

## Verified clean (checked, not bugs)

- `packages/*` platform-neutrality (no next/expo/RN/DOM/node imports); `dist/` rebuilt via web `predev`/`prebuild` hooks + turbo `^build`.
- Migration layout as it stood in May 2026 (four consolidated files); `custom_access_token_hook` tables all granted to `supabase_auth_admin`. Since 2026-09-04 the schema is an ordered stream of numbered forward migrations (`001`-`020`, checksum-locked); see `supabase/AGENTS.md`.
- All current npm `overrides` applied in the lockfile (requires clean reinstall when overrides change — the `install-strategy=nested` footgun).
- `CONSENT_VERSION` was `"1.1"` in `apps/web/src/components/CookieConsent.tsx` at the time of the sweep (now `"1.2"`, bumped when the `dg-theme` cookie was added; mirrored in the mobile consent lib). Impersonation and sandbox cookies are essential (no consent gate needed).
- Error sanitization (`packages/client-errors`) blocks raw DB/JWT leaks; `apiErrorResponse` logs server-side only.
- `error.tsx`/`not-found.tsx` delegate to shared `RouteBoundary`; no catch-all routes; no raw `<img>`; no `dangerouslySetInnerHTML`/`eval`/`<script>`.
- AppShell/header React Query keys include `orgId` (no cross-org cache bleed).

---

## Recommended order for remaining open items

1. **L-3** - Add `.limit()` caps to the unbounded `selectRows` calls in `oversight.ts` (affects platform-level data accuracy). The only item still open as of 2026-09-19.
2. **L-9** - Drop quotes from `.env.local.bak` (cosmetic; the file is local and gitignored, so it cannot be re-verified from the repo).

C-1 was closed 2026-07-08 (CI runs `npm ci --ignore-scripts` on every push), and L-1 / L-2 were closed in the permissions cache work recorded above. The later, broader passes (`SECURITY_AUDIT.md` 2026-07-25 and the 2026-09 authentication hardening epic) did not reopen anything in this file.
