# Feature: Billing safety fixes

**From build-plan:** feature 44a
**Status:** verified

## Goal

Stop the billing paths that can lock out or strand a customer. Today a
Gridmaster's "Sync Stripe" can cancel and lock an organization that is still on
trial, a canceled customer cannot subscribe again, and several writes can quietly
put the wrong billing state on an organization. After 44a, every path that
changes billing state either does the right thing or says why it can't.

## In scope

| #   | Defect                                                                                                                                                                                                                       | Where                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | A canceled organization sees **Manage billing**, which opens a portal that can't restart a canceled subscription, so it can never subscribe again                                                                            | `features/billing/server.ts` (`hasStripeSubscription` is true for any stored id) |
| 2   | The customer billing summary never reads suspension, so a suspended organization's own billing page doesn't say it is suspended                                                                                              | `features/billing/server.ts` select and `evaluateOrganizationBillingAccess` call |
| 3   | **Sync Stripe** on an organization with a payment customer but no subscription (an abandoned checkout) writes `canceled` and clears the trial end, locking a trialing organization                                           | `lib/stripe.ts` `syncSubscriptionToDb` no-subscription branch                    |
| 4   | A trialing Stripe subscription with no `trial_end` gets a made-up "now + 14 days" end written over the organization's real trial clock                                                                                       | `lib/stripe.ts` `resolveStripeTrialEnd` and `upsertStripeSubscriptionToDb`       |
| 5   | Webhooks trust each event's payload snapshot, so an event delivered late can roll the status back; an older, ended subscription's event can overwrite a newer live one                                                       | `api/stripe/webhook/route.ts`, `upsertStripeSubscriptionToDb`                    |
| 6   | Checkout starts a second subscription for an organization that already has a live one                                                                                                                                        | `api/stripe/create-checkout/route.ts`                                            |
| 7   | The Gridmaster subscription route ignores database write errors on cancel, scheduled cancel, seat true-up, and status override, then reports success and audits; seat true-up never refreshes the cached organization access | `api/gridmaster/subscription/route.ts`                                           |

## Out of scope

- **Additive "Extend trial"** from the 44a plan line: already delivered
  differently in 00654378, which replaced it with **Change trial** (set days
  left), **End trial now**, and **Expire trial**.
- Two checkouts opened in two tabs _before_ either completes: the guard in item 6
  refuses a new checkout once a subscription is live, but two sessions already
  open can both complete. Cancelling the duplicate automatically belongs with the
  webhook work in 44f.
- Status-override side effects, disabled-action reasons, and the per-org billing
  endpoint (44b); customer feed audience and wording (44c); any migration
  (44d to 44g).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - One "live subscription" rule, and a summary that uses it** -
      add `isLiveSubscriptionStatus(status)` to `packages/domain/src/billing.ts`
      (live = not `canceled` and not `incomplete_expired`). The customer billing
      summary sets `hasStripeSubscription` only for a live subscription, selects
      `suspended_at`, and passes it to `evaluateOrganizationBillingAccess`.
      _Done when:_ a canceled organization's billing page offers **Start
      subscription**, a suspended one's badge reads **Suspended**, and unit tests
      cover both plus the status rule.
- [x] **Step 2 - Sync never invents billing state** - in `syncSubscriptionToDb`,
      when Stripe has no subscription for the customer, mark the organization
      canceled only if a stored subscription id says one existed; otherwise
      change nothing and leave the trial untouched. In
      `upsertStripeSubscriptionToDb`, a trialing subscription with no `trial_end`
      leaves `organizations.trial_ends_at` as it is instead of writing
      now + 14 days. _Done when:_ tests show an abandoned-checkout organization
      keeps its trial through a sync, a deleted subscription still reads
      canceled, and a trialing subscription without `trial_end` keeps the stored
      end.
- [x] **Step 3 - Webhooks act on Stripe's current state** - for subscription
      events, the webhook re-reads the subscription from Stripe before writing.
      `upsertStripeSubscriptionToDb` ignores an ended subscription whose id
      differs from the organization's stored live subscription. _Done when:_
      tests show a stale event writes the retrieved current status, and an old
      subscription's deletion leaves the newer live one in place.
- [x] **Step 4 - Checkout refuses a second subscription** - before creating a
      session, the checkout route refuses (409, with a message pointing to
      **Manage billing**) when the organization's stored subscription is live or
      Stripe lists a live subscription for its customer. _Done when:_ route tests
      cover both refusals and the normal path, and the customer page shows the
      message as a toast.
- [x] **Step 5 - Gridmaster billing writes report real failures** - every write
      in the subscription route checks `{ error }` and fails before auditing;
      seat true-up refreshes cached access through one shared invalidation
      helper exported from `lib/stripe.ts` (replacing the route's copy). _Done
      when:_ route tests show a failed write returns 500 with no audit row for
      each action, and true-up invalidates the organization cache.

## Files / areas

- `packages/domain/src/billing.ts` and its test
- `apps/web/src/features/billing/server.ts` and its test
- `apps/web/src/lib/stripe.ts` and `stripe.test.ts`
- `apps/web/src/app/api/stripe/webhook/route.ts` and its test
- `apps/web/src/app/api/stripe/create-checkout/route.ts` and its test
- `apps/web/src/app/api/gridmaster/subscription/route.ts` and its test
- `docs/reference/billing.mdx` only if the customer-visible behaviour it
  describes changes (resubscribing after cancellation); refresh its fingerprint

## Data / contracts

- No migration and no new column.
- `OrganizationBillingSummary.hasStripeSubscription` keeps its name but now
  means "has a **live** subscription". Its only consumer is the customer
  Billing page, which picks **Manage billing** vs **Start subscription** from it.
- `isLiveSubscriptionStatus` becomes the shared definition of "live";
  load-bearing for 44b and 44f.
- Checkout refusal: `409 { error: "Your organization already has a subscription. Use Manage billing to change it." }`.

## Testing

- Vitest is configured, so every step ships unit or route tests with its logic:
  the domain status rule, the summary mapping, sync and upsert branches, the
  webhook re-read and stale guard, the checkout refusals, and each route write
  failure.
- Mock Stripe and Supabase with `vi.mock`; supabase-js resolves `{ error }`
  rather than throwing, so failure mocks resolve, never reject.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`, and
  `npm run docs:check`.
- Browser: on local Calm Haven (a seeded trial), sign in as
  `qa-super-admin@dubgrid.test` and confirm the billing page still offers
  **Start subscription** and shows the trial correctly. Stripe is not configured
  locally, so the Stripe paths are proven by tests, not the browser.

## Notes for the AI

- All of this is server code (`lib/stripe.ts`, route handlers, `features/billing/server.ts`)
  except the customer page's existing toast; no new UI.
- Use the service client only where the code already does; scope every query by
  the organization id the route resolved, never a client-supplied one.
- Never call `signIn`/`setSession` on the service client.
- Stripe is the source of truth for subscription state; DubGrid's database is a
  cache of it, so re-reading from Stripe is preferred over trusting a payload.
- The trial clock is DubGrid's, not Stripe's (checkout creates no Stripe trial),
  so nothing in this feature may move `trial_ends_at` except a real Stripe
  `trial_end`.
- Work in a worktree on `feature/44a-billing-safety`, per `AGENTS.md`.
