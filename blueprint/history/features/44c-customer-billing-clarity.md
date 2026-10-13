# Feature: Customer billing clarity

**From build-plan:** feature 44c
**Status:** verified

## Goal

The customer's own billing page and the mobile locked screen say what changed
and what to do, in plain words, without DubGrid's internal upkeep or raw
payment-provider data.

## In scope

| #   | Item                                                                                                                                                                 | Today                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The billing activity feed lists only changes that affect the customer                                                                                                | It shows the 8 newest `billing.*` rows, so syncs, seat counts, and portal visits crowd out real changes                                                              |
| 2   | The feed sends only the detail fields its rows display                                                                                                               | Raw details (Stripe event ids and types, customer ids) reach the browser                                                                                             |
| 3   | Payment-provider events show their source as "Payment provider"                                                                                                      | The Source column says "Stripe"                                                                                                                                      |
| 4   | Plain seat wording: **Billable users**, **Billed seats**, and **Seat difference** phrased as "2 without a seat" or "3 unused"                                        | **App users** and a signed **Seat delta** number                                                                                                                     |
| 5   | A plain notice when online billing isn't set up                                                                                                                      | "Stripe billing is not configured for this environment."                                                                                                             |
| 6   | Mobile locked screen: no billing button for a suspension, the server's own message when the organization status can't be read, and a trial-start line true on mobile | The billing button shows for suspensions; a failed status read hides the server's message; it says the trial starts "on the web" though mobile sign-in starts it too |

Decision (owner, 2026-10-12): customers see changes that affect them (trial
changes, status changes, cancellation, payments, payment details) and never
upkeep (syncs, seat true-ups, billing portal visits).

## Out of scope

- The organization Activity Log's audiences: unchanged here.
- Policy settings, pause, dunning, history (44d to 44g).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - The feed shows customer changes only, with only the fields
      it displays** - `loadRecentBillingOperations` queries a fixed list of
      customer-facing billing actions, so upkeep never takes a slot; each
      row's details keep only the fields the billing detail rows read
      (statuses, quantities, dates, amounts, currency, payment-method type,
      trial dates); payment-provider rows read "Payment provider". _Done
      when:_ summary tests show upkeep is excluded in the query, a row's
      `stripe_event_id` and `customer_id` are gone, and the Source label.
- [x] **Step 2 - Plain seat and setup wording** - the customer billing card
      reads **Billable users**, **Billed seats**, and **Seat difference**
      ("2 without a seat", "3 unused", or "None"); the unconfigured notice
      reads "Online billing isn't set up here. Contact DubGrid Support to
      subscribe."; the public billing page uses the same words. _Done when:_
      a component test shows each seat-difference phrasing and the notice,
      and `docs:check` passes with the page re-reviewed.
- [x] **Step 3 - Mobile locked screen copy** - the billing button shows only
      for billing states, not suspension; a failed status read shows the
      server's own (role-aware) message instead of the generic line; the
      trial-pending line says the trial starts the next time a Super Admin
      signs in. _Done when:_ mobile component tests cover all three.

## Files / areas

- `apps/web/src/features/billing/server.ts` and its test
- `apps/web/src/components/settings/BillingSettings.tsx` and its test
- `docs/reference/billing.mdx` and the accuracy manifest
- `apps/mobile/src/features/auth/screens/OrganizationLockedScreen.tsx` and its test

## Data / contracts

- No migration. `OrganizationBillingSummary.recentOperations[].details` now
  carries only display fields; `CUSTOMER_BILLING_ACTIONS` is the list the
  customer sees and is load-bearing for 44f's new billing alerts.

## Testing

- Vitest covers every step (web summary and component tests, mobile
  component tests).
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`.

## Notes for the AI

- Server-side filtering keeps upkeep out of the 8-row limit.
- Customer-facing copy never names the payment provider; Gridmaster views may.
- Mobile copy follows the mobile text rules; no new primitives.
- Work in a worktree on `feature/44c-customer-billing-clarity`.
