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
