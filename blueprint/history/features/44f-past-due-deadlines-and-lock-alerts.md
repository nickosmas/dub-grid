# Feature: Past-due deadlines and lock alerts

**From build-plan:** feature 44f
**Status:** verified

## Goal

A subscription whose payment fails no longer stays open forever. DubGrid starts
a payment grace period when an organization first needs payment attention and
locks it when that grace runs out, using the organization's payment grace from
44d. Super Admins get an alert when their organization locks, whether its trial
grace or its payment grace ran out. The webhook also handles the two Stripe
events it used to ignore.

## In scope

| #   | Item                                                                                               |
| --- | -------------------------------------------------------------------------------------------------- |
| 1   | Payment grace in the domain: a deadline from a recorded start, never a lock without one            |
| 2   | Migration 078: when payment grace started, and the `billing_access_locked` alert type              |
| 3   | The webhook records the start, clears it when payment recovers, and handles the two ignored events |
| 4   | Every access path reads the start; customers see the date to pay by and why they are locked        |
| 5   | The cron alerts Super Admins on the day an organization locks, for trial grace and payment grace   |

## Out of scope

- Seat and revenue history (44g).
- Mirroring Stripe's retry schedule: Stripe keeps retrying, DubGrid decides
  when access stops.
- An alert when a Gridmaster expires a trial with no grace (the Gridmaster
  acts, and the organization's admins see the locked screen at once).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Domain model** - `evaluateOrganizationBillingAccess` takes
      `paymentGraceStartedAt` and `paymentGraceDays`: a payment-attention
      status stays open until the start plus the grace, then locks with reason
      `payment_grace_expired`; without a start it never locks. The result
      carries `paymentGraceEndsAt`. A billing hold still keeps it open.
      _Done when:_ domain tests cover before, at, and after the deadline, a
      missing start, a paused organization, and the policy value applied.
- [x] **Step 2 - Migration 078** - `organizations.payment_grace_started_at`
      (readable by `authenticated` for the proxy; no backfill, since a missing
      start never locks) and `billing_access_locked` added to the
      notification type check. Idempotent, checksum locked, applied locally.
      _Done when:_ `db:migrations:check` passes, the local apply succeeds
      twice, and SQL checks show the new type accepted and a member reading
      the column.
- [x] **Step 3 - Webhook** - a subscription update into a payment-attention
      status records the start once (only while none is recorded, so a
      redelivered event or a long-past-due organization's next event never
      moves it); any other status clears it; a Gridmaster status override
      clears it too. `customer.subscription.trial_will_end` syncs the
      subscription like an update, and `checkout.session.completed` syncs the
      checkout. _Done when:_ tests cover the start, a redelivery, the clear,
      the override, and both events.
- [x] **Step 4 - Access paths and customer copy** - `BILLING_ACCESS_SELECT`
      and the mapped organizations carry the start; the billing notice gives
      the date to update payment by, a payment lock says a payment is
      overdue, and the Gridmaster Access row shows when it locks. _Done when:_
      tests show a past-due organization open before its deadline and locked
      after it in the proxy and the summary, and the copy for both.
- [x] **Step 5 - Lock alerts** - `billing_access_locked` for Super Admins,
      with copy for a trial and a payment lock, deduped on the lock time; the
      cron sends it for organizations whose trial grace or payment grace ended
      in the last three days (so a missed run still alerts, and an
      organization locked long ago is not alerted now), skipping paused,
      suspended, and archived organizations. Registered for web, push, and
      alert destinations. _Done when:_ cron and event tests cover both
      passes, the window, and the dedupe.
- [x] **Step 6 - Docs** - the public billing page says a payment that stays
      overdue locks the organization after its payment grace, and that Super
      Admins are alerted when it locks. _Done when:_ `docs:check` passes with
      the page re-reviewed.

## Files / areas

- `packages/domain/src/billing.ts`, `billing-policy.ts`, `organization.ts`, tests
- `supabase/migrations/078_payment_grace.sql`, `checksums.sha256`
- `apps/web/src/lib/stripe.ts`, `api/stripe/webhook/route.ts`,
  `api/gridmaster/subscription/route.ts`
- `lib/billing-policy.ts`, `lib/db/mappers.ts`, `packages/mobile-api-core`,
  `packages/data-access/src/mobile.ts`
- `features/notifications/server/events.ts`, `sender.ts`, `types/index.ts`,
  `packages/domain/src/alert-destination.ts`, `packages/mobile-api-core/src/push.ts`,
  `packages/contracts/src/mobile.ts`, `api/cron/trial-expiry`
- `features/billing/trial-status.ts`, `BillingTab.tsx`, `docs/reference/billing.mdx`

## Data / contracts

- `organizations.payment_grace_started_at timestamptz` (null = no deadline).
- `notifications.type` gains `billing_access_locked`; metadata `reason`
  (`trial` or `payment`) and `lockedAt`.
- `BillingAccessReason` gains `payment_grace_expired`;
  `BillingAccessResult.paymentGraceEndsAt`.

## Testing

- Vitest for the domain model, the webhook sync, the access paths, the
  notification event, and the cron; SQL checks for the migration.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- A missing start never locks: pre-migration rows, manual overrides, and
  webhook gaps all stay open.
- The cron runs daily, so "the moment it locks" means the first run after.
- Apply the migration to the local database only.
- Work in the billing worktree on `feature/44f-payment-grace`.
- No backfill (owner's fail-safe rule): the webhook records a start whenever a
  subscription needs payment and none is recorded, so a long-past-due
  organization's grace starts at its next Stripe event rather than locking at
  deploy.
- Browser check (2026-10-13, local, QA Super Admin): Calm Haven set past due 5
  days into its payment grace showed "Update your payment details by Oct 22,
  2026"; moved 20 days in, every page sent the Super Admin to the locked
  billing page with "A payment is overdue, so your organization is on hold."
  Calm Haven was restored afterwards.
