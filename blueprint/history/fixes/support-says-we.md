# Fix: The app says "we", not "DubGrid Support"

**Type:** Fix
**Status:** verified
**Completed:** 2026-11-02

### The problem

Customer copy named DubGrid as a third party acting on the customer's
organization: "DubGrid Support paused billing", "DubGrid support signed you
out", "suspended by DubGrid staff", "the DubGrid platform team". The owner
asked for "we", or the industry-standard approach (2026-11-02).

### The fix

The common pattern (Stripe, Slack, Linear): in a sentence the company is
"we" or "us"; where a name stands alone, as the actor in Billing history and
the activity log (`DUBGRID_SUPPORT_ACTOR_LABEL`), it is "DubGrid". The
product's own name stays where it names the product: page titles, the
wordmark, "Welcome to DubGrid", email subjects such as "Your DubGrid
account", legal pages, and the support address.

Changed: the billing overview (pause, suspended, seat gap), the seat history
caption, Settings > Billing's no-online-billing notice, Danger Zone, the
suspended-organization sign-in and gate messages, the two-factor reset gate
(web and mobile) and email, the "signed you out" alert, the terminated-account
error and the mobile suspended-organization message.

Left on purpose:

- The impersonation emails and their in-app notices. The notices are written
  by `start_impersonation` and `end_impersonation` in the database, and a test
  keeps them worded as the emails (F-38), so both move together in a migration
  once 113 has landed.
- The public docs, which describe DubGrid in the third person as
  `docs/AGENTS.md` asks.

### Build steps

- [x] **1. Rewrite the copy and the tests that pin it.**
      **Done when:** type-check, lint and the affected tests pass, and no
      customer string outside the two exceptions names DubGrid Support, staff
      or the platform team as the actor.

### Verify

- `npm run type-check`, `npm run lint`, the changed test files,
  `npm run docs:check`.
