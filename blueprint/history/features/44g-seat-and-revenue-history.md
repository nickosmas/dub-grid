# Feature: Seat and revenue history

**From build-plan:** feature 44g
**Status:** verified

## Goal

Gridmasters can see how seats and revenue change over time. Today the only
trace of a seat change is an audit row, and no invoice amount is stored. Two
append-only tables record every seat change and every paid or failed invoice
from now on, and a Gridmaster report shows monthly revenue and billed seats,
stating the date its history starts instead of implying history it doesn't
have.

## In scope

| #   | Item                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Migration 079: seat history and invoice events, append-only, service-role only, current seats backfilled             |
| 2   | Writers: a Stripe seat change, a seat true-up, and paid or failed invoices each add a row once                       |
| 3   | A report model: revenue and failed invoices by month and currency, billed seats at each month end                    |
| 4   | `GET /api/gridmaster/billing-history`, Gridmaster only                                                               |
| 5   | A **Revenue and seats** card on the Gridmaster billing page and a seat history list on an organization's Billing tab |

## Out of scope

- Customer-facing invoice lists (customers see invoices in the payment
  provider's billing page).
- Backfilling invoice history from Stripe.
- Forecasts, churn, or cohort analytics.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Migration 079** - `subscription_seat_history` (organization,
      seats, billable app users when known, source, recorded time) and
      `billing_invoice_events` (organization, invoice id, kind `paid` or
      `failed`, amount in cents, currency, billing period, occurred time;
      unique per invoice and kind). RLS on with no policies and the browser
      roles revoked, like `platform_billing_settings`; update, delete, and
      truncate revoked from every API role so rows can only be added. The
      current seat count of each organization that has one is backfilled
      with source `backfill`. _Done when:_ `db:migrations:check` passes, the
      local apply succeeds twice, SQL checks show an update and a browser read
      refused, and the RLS inventory lists both tables.
- [x] **Step 2 - Writers** - a subscription sync adds a seat row when the
      billed seats change (source `stripe`, `checkout`, or `gridmaster`);
      True up seats adds one with the billable app users; the paid and failed
      invoice webhooks add an invoice event, ignoring a redelivered one.
      _Done when:_ tests cover each writer, an unchanged seat count adding
      nothing, and a redelivery adding nothing.
- [x] **Step 3 - Report model** - `summarizeBillingHistory(invoices, seats,
{ now, months })`: for each of the last months, paid amounts and failed
      invoice counts by currency, and the billed seats at month end (each
      organization's latest row by then), plus `since`, the earliest recorded
      row. _Done when:_ tests cover month boundaries, two currencies, seats
      carried across months, and empty history.
- [x] **Step 4 - API** - `GET /api/gridmaster/billing-history` returns the
      platform report, or one organization's seat rows with `orgId`.
      Gridmaster only, read only. _Done when:_ route tests cover a
      non-Gridmaster 403, both shapes, and a bad `orgId`.
- [x] **Step 5 - UI** - the billing page's **Revenue and seats** card shows
      the months with revenue, failed invoices, and seats, headed "Since
      <date>" or "No history recorded yet"; an organization's Billing tab
      lists its recent seat changes with their source. _Done when:_
      component tests cover the card, the empty state, and the list, and the
      browser shows both.

## Files / areas

- `supabase/migrations/079_billing_history.sql`, `checksums.sha256`,
  `org-isolation.integration.test.ts` inventory
- `apps/web/src/lib/stripe.ts`, `api/stripe/webhook/route.ts`,
  `api/gridmaster/subscription/route.ts`
- `apps/web/src/features/gridmaster/billing-history.ts` (new) and test
- `api/gridmaster/billing-history/route.ts` (new) and test, Gridmaster client
- `GridmasterBillingView.tsx`, `organization-detail/BillingTab.tsx`

## Data / contracts

- `subscription_seat_history(id, org_id, seats, billable_app_users, source, recorded_at)`;
  source is `stripe`, `checkout`, `gridmaster`, or `backfill`.
- `billing_invoice_events(id, org_id, stripe_invoice_id, kind, amount_cents, currency, period_start, period_end, occurred_at)`,
  unique `(stripe_invoice_id, kind)`.

## Testing

- Vitest for the writers, the report model, the route, and the UI; SQL checks
  for the migration.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- Gridmaster tooling stays internal: no public documentation changes.
- The report never implies history before its first recorded row.
- Apply the migration to the local database only.
- Work in the billing worktree on `feature/44g-billing-history`.
- Rows are added only with insert-or-nothing upserts, since the service role
  may add history but never change it; a history write that fails is reported
  and never fails the billing change it records.
- Browser check (2026-10-13, local): sample rows for Calm Haven showed "Since
  Aug 14, 2026" with each month's revenue, failed invoices, and seats, and its
  Billing tab listed the three seat changes by source. The sample rows were
  deleted afterwards.
