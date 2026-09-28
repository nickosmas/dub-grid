# Feature: Access, billing, and integrations references

**From build-plan:** feature 40c3
**Status:** verified
**Branch:** `feature/40c3-access-billing-integrations`

## Goal

Verify the roles, Admin permissions, and billing references, publish
integrations and exports, and permanently redirect the three replaced pages,
completing 40c.

## Context

`roles`, `admin-permissions`, `billing`, `subscription`, `api-overview`, and
`calendar-export` are scaffold pages; `integrations-exports` is planned. There
is no customer API: `api-overview` documents internal endpoints, so it is
withdrawn, not rewritten. `subscription` merges into `billing`; `api-overview`
and `calendar-export` redirect to `integrations-and-exports`. The public-page
rules in the 40b1 archive apply; prices are not in source and are not stated.

## Build steps

- [x] **1. Roles and Admin permissions.**
  - Rewrite both pages from the role model and the permissions editor.
  - _Done when:_ `docs:check` passes with both verified.
- [x] **2. Billing, integrations and exports, and the three redirects.**
  - Rewrite `billing.mdx` with the subscription content; publish
    `integrations-and-exports.mdx`; delete the three replaced pages with
    permanent redirects; update links to them.
  - _Done when:_ `docs:check` and `docs:verify` pass, no 40c page is planned,
    and every 40c page is verified.

## Verify

- the docs tests, `npm run docs:check`, `npm run docs:verify`

## Result

- Roles and Permissions, Admin Permissions, Billing and Subscription, and Integrations and Exports verified from source. `subscription` merged into `billing`; `api-overview` and `calendar-export` withdrawn into `integrations-and-exports`; all three permanently redirected, and links to them updated.
- The documentation contract is closed for public pages: 31 published, 31 verified, 0 planned or pending (the five retired scaffold pages are replaced and redirected). 40e's `--require-closed` gate still needs runtime evidence.
- Corrected from the scaffold: a four-tier role list naming the internal platform role, "Settings > Users > Edit permissions" (it is **Edit admin access** on People), code keys shown to customers, 26 permissions (there are 25, shown as ten View/Edit areas), seats as "number of members", seats updating each cycle (fixed at checkout), past due restricting access (it does not), "Upgrade/Subscribe" (it is **Start subscription**), a customer API (none exists; the page described internal endpoints), and a manual `.ics` download (the product offers a live calendar subscription).
- For 40d: the overview and plan still say 26 Admin permissions.
