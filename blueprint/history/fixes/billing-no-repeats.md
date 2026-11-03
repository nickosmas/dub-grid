# Fix: The billing page says each fact once

**Type:** Fix
**Status:** verified
**Completed:** 2026-11-03

### The problem

Settings > Subscription said the same thing in up to five places at once:
a banner, the card's title and lead, the ring, the timeline, and a row of four
stat cards. On a trial ending soon the end date appeared five times, the days
left four times and the seats in use four times (owner, 2026-11-01: "a lot of
repetitions"). Design reference: the "Billing page without repeats" canvas,
which the owner reviewed state by state.

### The fix

- **Banner:** gone for every billing state. What it added (what happens next)
  moved into the card's lead. The two banners that aren't about the state stay:
  a failed load and "Online billing isn't set up here".
- **Stat cards:** the row is gone. Each card repeated the ring, the timeline,
  the Seats section, the billing history or the title.
- **Title and lead:** no dates. The ring counts down and the timeline carries
  the dates; a test checks the words never repeat a timeline date.
- **"Billed monthly for each seat":** only while there is no subscription.
- **Footer note:** gone from the card; the billing portal is named once, under
  Billing history.
- **Seats:** side-by-side cards for seats in use, paid seats once subscribed,
  and Not billed (owner comment on the canvas), with no header summary and no
  donut. Several groups are listed with their counts and why.
- **Buttons:** no icons, per the standing rule. On a phone they're padded
  tighter so "Start subscription" and "Manage billing" fit beside Refresh, and
  a longer label truncates instead of spilling past the button.
- Admins already can't open the page (Settings menu, page and API all require
  a Super Admin or Gridmaster), so no Admin view was drawn.

### Build steps

- [x] **1. Model, page, seats and docs.** `describeBillingOverview` drops
      `banner` and `stats` and adds `pricingNote`; `BillingStatCards` is
      deleted; the public billing guide describes the new Seats section.
      **Done when:** type-check, lint, the billing tests and `docs:check`
      pass, and the trial, active and payment-needed states read as on the
      canvas at desktop and 390px.

### Verify

- `npm run type-check`, `npm run lint`, `vitest` over `components/settings`,
  `features/billing` and `app/api/billing`, `npm run docs:check`.
- Browser (local, `qa-super-admin@dubgrid.test`, Calm Haven): trial ending
  soon from real data; active and payment needed by rewriting the billing
  response in the tab; 390px for trial and payment needed.
