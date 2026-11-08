# Fix: return to the same page after an inactivity sign-out

**Status:** complete

## Problem

After the 30-minute inactivity sign-out, signing back in always opened the
dashboard, so someone who stepped away from the schedule or a staff page had
to find their way back.

## Fix

- When the idle deadline signs someone out, the tab remembers the page, who
  was signed in and when (sessionStorage, `dg-return-after-sign-in`, kept out
  of the `dg_` sweep on /goodbye). **Sign out now** remembers nothing.
- Signing in on that tab returns the same person there, through the terms
  page when it is due, on the password, cookie and two-factor paths of both
  the organization and Gridmaster sign-in. Anyone else gets the usual home,
  and the entry is used once and forgotten after 12 hours.
- Only internal pages count: never a sign-in page, another site, the portal
  for staff or an organization page for a Gridmaster.

## Evidence

- `return-after-sign-in.test.ts` (9 tests) and two OrgLogin tests: the same
  person returns, someone else gets the dashboard.
- Login, idle timer and helper suites pass; type-check and lint pass.
- Not run in a browser.

## Not in this fix

- A server-side idle limit for web sessions (F-204).
