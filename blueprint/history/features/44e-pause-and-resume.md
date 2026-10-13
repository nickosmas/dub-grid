# Feature: Pause and resume

**From build-plan:** feature 44e
**Status:** verified

## Goal

A Gridmaster can put an organization's billing on hold. While it is paused the
organization keeps full access, its trial days stop counting down, and any
Stripe subscription stops collecting payment. Resuming gives the trial back the
paused time. A Gridmaster can also add days to an organization's trial grace
period, which writes the per-organization grace override from 44d, so "how much
grace does this organization get" keeps one answer.

## In scope

| #   | Item                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | A `paused` billing state that never locks and stops the trial clock, plus the controls that say when each action applies |
| 2   | Migration 077: who paused, when, and why, on `organizations`                                                             |
| 3   | Every billing access decision sees the hold; the trial cron skips paused organizations                                   |
| 4   | Gridmaster actions: pause (reason, fresh proof), resume, extend grace (reason, fresh proof), each audited                |
| 5   | Gridmaster views show the hold and offer the actions                                                                     |
| 6   | Customers see that billing is paused, and the three changes appear in their billing activity                             |

## Out of scope

- Past-due deadlines and lock alerts (44f), history (44g).
- Pausing on a schedule or with an automatic end date.
- Stripe's own `paused` subscription status (a trial that ended without a
  payment method), which keeps its current meaning: payment attention.

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
      `billingPausedAt`: a paused organization reads as state `paused`
      (reason `billing_paused`, never locked, no admin notice) with its trial
      days frozen at the pause, after suspension and the hard-locked statuses
      (canceled, unpaid, incomplete_expired, trial_expired), which still lock.
      `billingHoldControls` says whether pause, resume, and extend grace apply
      and why not; `trialControls` refuses trial changes while paused;
      `resumedTrialEndsAt` moves a running trial's end by the paused time
      (from the later of the pause and the trial start). The mobile contract
      accepts `paused`. _Done when:_ domain tests cover a paused trial, a
      paused subscriber, a paused but canceled organization still locking,
      frozen days, each control, and the resume shift.
- [x] **Step 2 - Migration 077** - `billing_paused_at`, `billing_paused_reason`
      (1 to 500 characters), `billing_paused_by` on `organizations`, with a
      check that the time and reason are set together; `authenticated` may
      read `billing_paused_at` only, because the proxy evaluates access as the
      member. Idempotent, checksum locked, applied to the local database.
      _Done when:_ `db:migrations:check` passes, the local apply succeeds
      twice, and SQL checks show the pairing check and a member refused the
      reason column.
- [x] **Step 3 - Access paths see the hold** - one `BILLING_ACCESS_SELECT`
      (override columns plus `billing_paused_at`) replaces the override select
      wherever access is evaluated; `evaluateOrgBillingAccess`, the mapped
      organization, and `mobile-api-core` pass the hold through; both cron
      passes skip paused organizations. _Done when:_ tests show a paused
      organization whose trial ended stays open in the proxy and the customer
      summary, and the cron skips it.
- [x] **Step 4 - Gridmaster actions** - `pause_billing` (reason; fresh proof;
      Stripe `pause_collection` with invoices voided when a live subscription
      exists), `resume_billing` (clears the hold, Stripe resumes, the trial end
      moves by the paused time, also in Stripe for a Stripe trial), and
      `extend_grace` (1 to 90 days and a reason; fresh proof; the grace
      override becomes the effective grace plus the days, within 90). Audited
      as `billing.paused`, `billing.resumed`, `billing.grace_extended`.
      _Done when:_ route tests cover each guard, fresh proof, the Stripe calls,
      the trial shift, the grace bound, and the audit rows.
- [x] **Step 5 - Gridmaster UI** - the organization Billing tab shows "Paused
      since" with the reason (the audit row names who paused it), and the actions menu offers Pause billing,
      Resume billing, and Extend grace with disabled reasons; the billing table
      labels paused organizations and leaves them out of the risk list.
      _Done when:_ component tests cover the dialogs and labels, and the
      browser shows a pause and a resume.
- [x] **Step 6 - Customer view and docs** - the billing card says billing is
      paused, that access continues, and that trial days don't count down;
      the three changes appear in the customer billing activity without the
      reason; the public billing page explains a pause. _Done when:_ a
      component test shows the paused notice and the feed row, and
      `docs:check` passes with the page re-reviewed.

## Files / areas

- `packages/domain/src/billing.ts`, `billing-policy.ts`, `organization.ts`, tests;
  `packages/contracts/src/mobile.ts`
- `supabase/migrations/077_billing_pause.sql`, `checksums.sha256`
- `apps/web/src/lib/billing-policy.ts`, `lib/db/mappers.ts`, `lib/db/shared.ts`, the
  call sites using the override select, `packages/mobile-api-core`,
  `packages/data-access/src/mobile.ts`, `api/cron/trial-expiry`
- `lib/stripe.ts`, `api/gridmaster/subscription/route.ts`, `lib/audit/registry.ts`
- Gridmaster billing rules, dialogs, actions hook, `BillingTab.tsx`,
  `GridmasterBillingView.tsx`, `_lib/oversight.ts`
- `features/billing/trial-status.ts`, `features/billing/server.ts`,
  `BillingSettings.tsx`, `docs/reference/billing.mdx`

## Data / contracts

- `organizations.billing_paused_at timestamptz`, `billing_paused_reason text`,
  `billing_paused_by uuid` (null when not paused).
- `BillingAccessState` and the mobile `billingAccessState` gain `paused`;
  `BillingAccessReason` gains `billing_paused`.
- Subscription route actions `pause_billing`, `resume_billing`, `extend_grace`.

## Testing

- Vitest for the domain model, the access paths, the cron, the route, and the
  UI; SQL checks against the local database for the migration.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- A pause preserves access; it must never unlock a canceled or expired
  organization, and nothing locks because of it.
- The mobile app only parses the state; it has no paused screen, because a
  paused organization is never locked.
- Customer copy never names the payment provider or shows the pause reason.
- Apply the migration to the local database only.
- Work in the billing worktree on `feature/44e-pause-resume`.
- Migration 077's pairing check first let a pause through with no reason
  (`char_length(NULL)` makes the check NULL, which passes); it now tests the
  reason for NULL explicitly, and the SQL checks prove both directions.
- Browser check (2026-10-13, local, QA accounts): Calm Haven's trial grace had
  run out; Extend grace by 4 reopened it (override 7 days), Pause showed
  "Billing paused" to Gridmaster and customer alike with the reason kept
  internal, and Resume moved the trial end by the paused time. Calm Haven's
  trial end and grace were restored afterwards.
