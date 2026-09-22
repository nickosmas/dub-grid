# Ledger clean-up: deep links, push listeners, lock order, sandbox guard, anon grants

**Type:** Fix

**Fixes:** F-15, F-16, F-19, F-20, F-23

**Status:** verified

## The problem

Five self-contained findings, none of which needs a product decision.

- **F-20.** `apps/web/src/app/api/stripe/checkout-complete/route.ts` is the
  only Stripe route without `forbidIfSandboxCookie`, so a sandboxed caller
  gets "Checkout session organization mismatch" from deep inside
  `syncCheckoutSessionToDb` instead of the clear refusal its siblings give.
- **F-16.** `usePushResponseHandler`
  (`apps/mobile/src/features/notifications/hooks/usePushResponseHandler.ts:126`)
  registers its response listener inside an async effect and returns the
  cleanup only after that await resolves, so a hook unmounted mid-await
  leaves the listener attached: a later notification tap can navigate a
  signed-out or different-user session.
- **F-15.** `NotificationDetailScreen` resolves a deep-linked alert by
  searching the first page of the inbox, so an older notification cannot be
  opened from a link even though the viewer may read it.
- **F-19 (unverified).** `discard_schedule_drafts` locks candidate cells in
  id order while `publish_schedule` iterates its cells in unspecified order,
  so two overlapping ranges could take the same rows in opposite orders and
  one side would die with a deadlock rather than retry. To be confirmed with
  two connections before it is treated as a defect.
- **F-23.** `anon` holds SELECT, INSERT, UPDATE and DELETE on every public
  table. Only two policies name it: the cookie-consent insert, and a
  deny-all. Nothing is exposed today, because row-level security refuses
  `anon` every row, but the grants are one missing `TO authenticated` away
  from mattering.

## The fix

- **F-20:** the same `forbidIfSandboxCookie(req)` line its siblings use, at
  the top of the handler, with a route test.
- **F-16:** the effect registers the response subscription synchronously and
  tracks cancellation, so an unmount before the awaited work finishes
  removes the listener and suppresses a late callback.
- **F-15:** the mobile detail screen resolves an alert through a by-id read
  rather than the first inbox page, so any alert the viewer may see opens
  from a link.
- **F-19:** reproduce with two connections. If it deadlocks, order
  `publish_schedule`'s iteration by cell id in a forward migration so both
  writers take the same path; if it does not, record the evidence and mark
  the finding invalid.
- **F-23:** a forward migration revokes every table privilege from `anon`
  and grants back only the cookie-consent insert the banner needs, with a
  live test that signs in with the anon key alone and is refused everywhere
  else.

Must not break: checkout completion for a real organization, mobile push
navigation, the alerts inbox, publishing and discarding, the cookie banner
before sign-in, and the seed.

## Build steps

- [x] **1. Sandbox guard on checkout completion (F-20)** - the guard and a
      route test. Done when a request carrying the sandbox cookie is refused
      with the shared message and a normal request still completes.
- [x] **2. Push response listener cleanup (F-16)** - synchronous
      registration with cancellation, plus tests for unmount mid-await and a
      late response. Done when the mobile suite passes and a test fails if
      the cleanup is removed.
- [x] **3. Deep-linked alerts resolve by id (F-15)** - the by-id read and
      its tests. Done when an alert outside the first inbox page opens from
      a link and the role gate still refuses one the viewer may not see.
- [x] **4. Publish and discard lock order (F-19)** - the two-connection
      reproduction, then either the ordering migration with its text and
      live tests or recorded evidence that the finding is invalid.
- [x] **5. Anon holds nothing (F-23)** - the migration, checksum, text test
      and a live test. Done when `db:migrations:check`, a clean reset and
      the suites pass, and the cookie banner still records consent.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, the live integration tests, a clean
  `supabase db reset`.
- Browser: the cookie banner still saves a decision while signed out.
- `/audit` afterwards.

## Findings

### ledger-cleanup-deep-links-locks-grants/F-15 [P2] closed - Older mobile notification links are reported unavailable

**File:** apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:55; packages/data-access/src/mobile.ts:1985
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A cold notification-detail screen searches only the latest page of results and ignores the next-page cursor, so an otherwise valid older notification cannot be opened from a link.
**Suggested fix:** Add an authorized notification-by-ID endpoint or page through the list until the requested item is found.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 3be3fa95). The detail screen asks for the alert by id (`id` on the notifications query contract, the payload loader and `fetchMobileNotificationsPage`), so a link to an alert older than the loaded pages resolves. The role gate in the screen is unchanged and RLS still scopes the row to the viewer. Tests cover the query filter, its absence on an ordinary page, and the screen's query options. See F-24 for the filter interaction the re-review found.

### ledger-cleanup-deep-links-locks-grants/F-16 [P2] closed - Notification response listeners can survive sign-out

**File:** apps/mobile/src/features/notifications/hooks/usePushResponseHandler.ts:126
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** If initialization is still awaiting the initial notification response when the hook unmounts, cleanup is not yet registered. A later response can navigate a signed-out or different-user session.
**Suggested fix:** Register cleanup synchronously, suppress callbacks after cancellation, and handle initialization failures.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 3be3fa95). `usePushResponseHandler` assigns its cleanup immediately after subscribing, runs it at once if the effect was torn down during the await, and `handleResponse` returns early when cancelled. Re-read in place: both listeners are created before the first await that can be interrupted. A regression test unmounts mid-lookup and fails without the hoist (verified by reverting it).

### ledger-cleanup-deep-links-locks-grants/F-19 [P3] closed - Concurrent publish and discard can deadlock rather than lose data

**File:** supabase/migrations/032_schedule_children_org_consistency.sql (discard_schedule_drafts); supabase/migrations/020_publish_repairs.sql:284
**Found:** 2026-09-22 by /audit (scope: current; lens: performance)
**Why it matters:** The discard locks cells in id order; `publish_schedule` iterates its cells in unspecified order and locks each through `write_schedule_cell_snapshot_internal`. Two overlapping ranges running at once can therefore acquire the same rows in opposite orders. Postgres aborts one side with a deadlock error, so no schedule data is lost, but that caller sees a 500 instead of a retry.
**Suggested fix:** Have `publish_schedule` iterate `ORDER BY c.id` so both writers take locks in the same order, or wrap the discard route's call in a single retry on SQLSTATE 40P01. Confirm with a two-connection test before treating it as a defect.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 3be3fa95). Confirmed first: two connections taking the same two cells in date order and id order deadlocked with SQLSTATE 40P01. Migration 039 restates `publish_schedule` from 020 with one hunk, `ORDER BY c.id`, matching `discard_schedule_drafts`; the same reproduction then showed the second writer waiting and continuing. A text test pins the restatement to that hunk.

### ledger-cleanup-deep-links-locks-grants/F-20 [P3] closed - Checkout completion does not refuse a sandbox cookie like its siblings

**File:** apps/web/src/app/api/stripe/checkout-complete/route.ts:18
**Found:** 2026-09-22 by /audit (scope: current; lens: quality)
**Why it matters:** `create-checkout` and `billing-portal` call `forbidIfSandboxCookie` and answer a sandboxed caller with a clear refusal. `checkout-complete` relies on `syncCheckoutSessionToDb` rejecting the organization mismatch instead, so the same caller gets a generic "Checkout session organization mismatch" error. Safe, but inconsistent and harder to support.
**Suggested fix:** Add the same `forbidIfSandboxCookie` guard at the top of the handler and a route test for it.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 3be3fa95). `checkout-complete` calls `forbidIfSandboxCookie` before anything else, as its two siblings do, and a route test shows the shared refusal with no permission lookup and no Stripe sync.

### ledger-cleanup-deep-links-locks-grants/F-23 [P3] closed - The anon role holds blanket table grants with no policy behind them

**File:** supabase/migrations/004_grants.sql
**Found:** 2026-09-22 by /audit (scope: current; lens: security)
**Why it matters:** `anon` holds SELECT, INSERT, UPDATE and DELETE on all 41 public tables, including every employee contact column that migration 036 has just taken away from members. No policy on those tables targets `anon`, so row-level security refuses it every row today and nothing is exposed; the grants are one missing `TO authenticated` away from mattering.
**Suggested fix:** Revoke the blanket grants from `anon` for tables no signed-out caller reads, or confirm the roles that must stay and document why. Verify against the live catalog rather than the migration text, since 004 and later migrations both grant.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 3be3fa95). Migration 040 revokes every table and sequence privilege from `anon` plus the default privileges behind them, and grants back only `INSERT ON cookie_consents`, which `anon_insert_cookie_consent` gates to rows with a null user. The live catalog after a clean reset lists exactly that one grant, `anon` is refused a read of employees, and `authenticated` still holds SELECT on more than thirty tables.

### ledger-cleanup-deep-links-locks-grants/F-24 [P3] closed - A by-id alert lookup still applies the inbox filters

**File:** packages/data-access/src/mobile.ts:2031
**Found:** 2026-09-22 by /audit (scope: current; lens: correctness)
**Why it matters:** `fetchMobileNotificationsPage` adds `.eq("id", ...)` but then still applies `archived`, `read`, `category`, `type`, `priority`, `search` and the cursor. The mobile detail screen passes `archived: "any"`, so the deep link works today, but any other caller asking for one alert by id with the default `archived: "inbox"` silently misses an archived one, and the comment above the filter claims it short-circuits them.
**Suggested fix:** When `id` is present, skip the list filters and the cursor entirely; row-level security still scopes the row to the viewer. Add a test that finds an archived alert by id with no `archived` argument.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit 844d77a0). `fetchMobileNotificationsPage` gives the id its own branch: the archived, read, category, type, priority, search filters and the cursor now apply only to a page. A test asks for an archived alert by id with no `archived` argument and asserts none of the filter builders were called. The mobile detail screen is unchanged and still passes `archived: "any"`, which is now redundant rather than load-bearing.
