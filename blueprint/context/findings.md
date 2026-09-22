# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-15 [P2] open - Older mobile notification links are reported unavailable

**File:** apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:55; packages/data-access/src/mobile.ts:1985
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A cold notification-detail screen searches only the latest page of results and ignores the next-page cursor, so an otherwise valid older notification cannot be opened from a link.
**Suggested fix:** Add an authorized notification-by-ID endpoint or page through the list until the requested item is found.
**Resolution:**

### F-16 [P2] open - Notification response listeners can survive sign-out

**File:** apps/mobile/src/features/notifications/hooks/usePushResponseHandler.ts:126
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** If initialization is still awaiting the initial notification response when the hook unmounts, cleanup is not yet registered. A later response can navigate a signed-out or different-user session.
**Suggested fix:** Register cleanup synchronously, suppress callbacks after cancellation, and handle initialization failures.
**Resolution:**

### F-17 [P2] open - Existing load tests do not qualify authenticated scheduling capacity

**File:** load-tests/schedule-load.js:12; load-tests/auth-flow.js:14
**Found:** 2026-09-21 by /audit (scope: full; lens: performance)
**Why it matters:** Current load scenarios exercise health, public page, and sampled login requests only. They do not measure authenticated schedule reads, writes, publishing, or realtime propagation against the stated launch thresholds.
**Suggested fix:** Add staging-account workflows for realistic schedule reads, versioned writes, concurrent editors, publishing, and websocket propagation with separate read and write thresholds.
**Resolution:**

### F-18 [P2] unverified - Native push delivery and signed release qualification lack evidence

**File:** apps/mobile/app.json:1; apps/mobile/src/features/notifications/lib/push-permission.ts:1
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** The tracked mobile configuration lacks an explicit EAS project identity, and no signed release artifact or provider configuration was available for inspection. Development configuration reports that a project identity is required, but deployed configuration could supply it externally.
**Suggested fix:** Verify the production build profile, signed iOS and Android artifacts, project identity, push-token registration, notification delivery, and opt-out behavior with dedicated release accounts.
**Resolution:**

### F-19 [P3] unverified - Concurrent publish and discard can deadlock rather than lose data

**File:** supabase/migrations/032_schedule_children_org_consistency.sql (discard_schedule_drafts); supabase/migrations/020_publish_repairs.sql:284
**Found:** 2026-09-22 by /audit (scope: current; lens: performance)
**Why it matters:** The discard locks cells in id order; `publish_schedule` iterates its cells in unspecified order and locks each through `write_schedule_cell_snapshot_internal`. Two overlapping ranges running at once can therefore acquire the same rows in opposite orders. Postgres aborts one side with a deadlock error, so no schedule data is lost, but that caller sees a 500 instead of a retry.
**Suggested fix:** Have `publish_schedule` iterate `ORDER BY c.id` so both writers take locks in the same order, or wrap the discard route's call in a single retry on SQLSTATE 40P01. Confirm with a two-connection test before treating it as a defect.
**Resolution:**

### F-20 [P3] open - Checkout completion does not refuse a sandbox cookie like its siblings

**File:** apps/web/src/app/api/stripe/checkout-complete/route.ts:18
**Found:** 2026-09-22 by /audit (scope: current; lens: quality)
**Why it matters:** `create-checkout` and `billing-portal` call `forbidIfSandboxCookie` and answer a sandboxed caller with a clear refusal. `checkout-complete` relies on `syncCheckoutSessionToDb` rejecting the organization mismatch instead, so the same caller gets a generic "Checkout session organization mismatch" error. Safe, but inconsistent and harder to support.
**Suggested fix:** Add the same `forbidIfSandboxCookie` guard at the top of the handler and a route test for it.
**Resolution:**

### F-23 [P3] open - The anon role holds blanket table grants with no policy behind them

**File:** supabase/migrations/004_grants.sql
**Found:** 2026-09-22 by /audit (scope: current; lens: security)
**Why it matters:** `anon` holds SELECT, INSERT, UPDATE and DELETE on all 41 public tables, including every employee contact column that migration 036 has just taken away from members. No policy on those tables targets `anon`, so row-level security refuses it every row today and nothing is exposed; the grants are one missing `TO authenticated` away from mattering.
**Suggested fix:** Revoke the blanket grants from `anon` for tables no signed-out caller reads, or confirm the roles that must stay and document why. Verify against the live catalog rather than the migration text, since 004 and later migrations both grant.
**Resolution:**
