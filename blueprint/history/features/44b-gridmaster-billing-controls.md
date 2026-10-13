# Feature: Gridmaster billing controls

**From build-plan:** feature 44b
**Status:** verified

## Goal

Make every Gridmaster billing action safe and self-explanatory. A status
override says what it will do and why it was done, every disabled action says
why it is off, the organization Billing tab loads only that organization, and
the billing table and its payment-provider links work as expected.

## Already delivered

Shipped in 00654378 before this spec, so not rebuilt here:

- The server refuses trial changes on a paying organization and an immediate
  cancel with no subscription.
- Immediate cancel, status override, and expiring a trial require fresh proof.

## Decision: no upper bound on trial days (owner, 2026-10-12)

The 44b plan line asked for an upper bound, but an earlier deliberate test
allows 5000 days for long complimentary trials. The owner chose no hard cap:
**Change trial** shows the resulting end date and warns when it would run past
one year.

## In scope

| #   | Item                                                                                             | Today                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Status override records a required reason and the previous status, and stops resetting the trial | The override has no reason; choosing **Trial active** silently resets the trial to 14 days; the audit row holds only the new status |
| 2   | Trial reminders go only to organizations still on trial                                          | The "trial ending soon" reminder has no status filter, so an organization overridden to **Active** still gets it                    |
| 3   | The override dialog states the consequence before confirming                                     | It asks only "Override billing status to X?"                                                                                        |
| 4   | Disabled actions say why; **End period** is renamed **Cancel at period end** on both views       | Disabled buttons and menu items give no reason; the tab and table name the action differently                                       |
| 5   | The organization Billing tab loads only its organization                                         | It downloads every organization's billing summary and picks one                                                                     |
| 6   | Stripe links open test-mode pages in a test environment, and the subscription id is a link       | Links always point at live mode; the subscription id is plain text                                                                  |
| 7   | Billing table rows work from the keyboard                                                        | Rows open on mouse click only                                                                                                       |
| 8   | **Change trial** warns past one year                                                             | No warning (see the decision above)                                                                                                 |

## Out of scope

- Undoing a scheduled cancellation, resetting an organization to "trial not
  started", and alerting Super Admins when support changes their trial: found on
  2026-10-12 but not in the 44b plan line; candidates for 44f or a later item.
- Customer feed audience and wording (44c); billing policy settings, pause,
  dunning, and history (44d to 44g, migrations).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - The override dialog explains itself and asks for a reason** -
      the override confirmation (shared by the table and the tab) states the
      consequence for the chosen status (open, locked, or payment attention,
      from the shared billing rule), says Stripe's next update replaces the
      override when the organization has a subscription, and has a required
      reason field; the client sends the reason (the server's schema ignores the
      extra field until Step 2 enforces it, so overrides keep working). _Done when:_ a component test
      shows the consequence line for **Active** and **Canceled**, confirm stays
      disabled until a reason is typed, and the request carries it.
- [x] **Step 2 - Status override records why and stops resetting the trial
      (server)** - `override_status` requires a `reason` (1 to 500 characters),
      writes `previous_status`, `new_status`, and `reason` to the audit row, and
      no longer touches `trial_ends_at`. The audit registry shows those three as
      detail rows. The trial-expiry cron's "ending soon" pass only selects
      organizations whose status is `trialing`. _Done when:_ route tests show a
      missing reason is refused with 400, the audit details carry all three
      fields, overriding to `trialing` leaves the trial end alone, and a cron
      test shows an `active` organization with a trial end gets no reminder.
- [x] **Step 3 - Disabled actions say why** - one pure function,
      `billingActionStates(org)`, returns each Stripe action's availability and
      reason (Sync Stripe, True up seats, Cancel at period end, Cancel). The tab
      shows the reason on its disabled buttons and the table menu on its
      disabled items; both use the label **Cancel at period end**. _Done when:_
      unit tests cover each reason, and the tab shows "No Stripe subscription"
      on its disabled **Cancel** in the browser.
- [x] **Step 4 - The Billing tab loads only its organization** -
      `GET /api/gridmaster/billing?orgId=<uuid>` returns one
      `GridmasterBillingOrgSummary` built from that organization's rows alone
      (404 for an unknown or sandbox organization); the tab queries it under its
      own key under the existing `["gm", "billing"]` prefix, so the actions'
      current invalidation already refreshes it. _Done when:_ route tests cover
      the single-organization response, a bad id, and the Gridmaster check, and
      the tab renders the same values as before in the browser.
- [x] **Step 5 - Links, keyboard rows, and the long-trial warning** - billing
      summaries carry `stripeMode` (`test` or `live`, from the server's key); a
      shared helper builds dashboard links with `/test` when needed; the
      subscription id links to its Stripe page; the organization name in each
      billing table row is a button that opens the organization; **Change
      trial** warns when the end would pass one year. _Done when:_ unit tests
      cover the link helper in both modes, a component test opens an
      organization from the keyboard, and the dialog shows the warning for 400
      days.

- [x] **Step 6 - One End trial control (owner decision, 2026-10-12)** -
      **End trial now** and **Expire trial** read alike, so they become one
      **End trial** button whose dialog asks one question: keep the usual
      3-day grace period (with the date access ends) or lock now with no
      grace (asks for a password). A choice that doesn't apply is shown
      disabled with its reason. _Done when:_ a component test ends a running
      trial both ways, an organization already in grace offers only locking,
      and both views show the single control.

## Files / areas

- `apps/web/src/app/api/gridmaster/subscription/route.ts` and its test
- `apps/web/src/app/api/cron/trial-expiry/route.ts` and its test
- `apps/web/src/app/api/gridmaster/billing/route.ts` and `_lib/oversight.ts`
- `apps/web/src/lib/audit/registry.ts`
- `apps/web/src/components/gridmaster/BillingActionDialogs.tsx`,
  `useGridmasterBillingActions.tsx`, `GridmasterBillingView.tsx`,
  `organization-detail/BillingTab.tsx`, and a new pure helper module for
  action states and Stripe links, with tests
- `apps/web/src/features/gridmaster/client/api.ts`, `apps/web/src/types/index.ts`,
  `apps/web/src/lib/query-keys.ts`

## Data / contracts

- No migration.
- `override_status` body gains a required `reason: string` (1 to 500).
  Load-bearing: 44e's grace extension and any later override reuse it.
- Audit `billing.status_overridden` details: `previous_status`, `new_status`,
  `reason`.
- `GET /api/gridmaster/billing?orgId=` returns
  `{ organization: GridmasterBillingOrgSummary; stripeMode: "test" | "live" | null }`.
- `GridmasterBillingSummary` gains `stripeMode`.

## Testing

- Vitest is configured: Steps 2 to 5 add logic and ship unit or route
  tests; Step 1's dialog behaviour is a component test.
- Browser, as `qa-gridmaster@dubgrid.test` on local Calm Haven: override with a
  reason and see it in Billing Activity; hover a disabled action for its reason;
  open the Billing tab and confirm one billing request for the organization;
  tab through the billing table to open an organization.
- Final gates: `npm run type-check`, `npm run lint`, `npm run test`,
  `npm run build` (hardlinked `node_modules` in the worktree), and
  `npm run docs:check`.

## Notes for the AI

- Gridmaster routes call `requireGridmasterSession`; the override already needs
  fresh proof, so keep the reason check after that guard.
- The per-organization endpoint uses the service client scoped to the requested
  id and refuses sandbox clones, matching the oversight loader's
  `workspace_kind = real` filter.
- Reuse `effectiveBillingStatus`, `evaluateOrganizationBillingAccess`, and
  `trialControls`; do not restate billing rules in components.
- Never put the payment provider's name in customer-facing copy; this feature
  is Gridmaster-only, where "Stripe" is fine.
- Work in a worktree on `feature/44b-gridmaster-billing-controls`; build with
  hardlinked `node_modules` (see memory).
