# Hide organization suspension details from non-owners

**Type:** Fix

**Status:** verified

## The problem

When an organization is unavailable, regular Users and Admins can currently see
whether billing lapsed, a trial is pending or in grace, DubGrid suspended the
organization, or the organization was archived. Web and mobile screens expose
those causes in user-facing copy, and their authenticated status responses
return the same detailed state and, on mobile, the grace-period date. These
roles do not own billing or tenant lifecycle recovery, so the detail is
unnecessary and reveals internal account information.

## The fix

Give regular Users and Admins the same neutral unavailable experience on web
and mobile: explain only that the organization is currently unavailable, retain
the existing retry and sign-out actions, and do not identify billing, trial,
suspension, archival, or who initiated the restriction.

Redact cause-specific organization-access state and dates from authenticated
status responses for Users and Admins so the same information is not exposed
through network inspection. Preserve detailed state, dates, billing recovery
copy, and billing actions for Super Admins and Gridmasters, who are authorized
to diagnose or resolve the restriction. Do not change the underlying access
decision, proxy routing, retry behavior, or tenant isolation.

## Build steps

- [x] **Make organization-unavailable messaging and status responses
      role-safe.** Update the web gate, mobile locked screen, and their backing
      status endpoints/contracts so Users and Admins receive neutral copy and a
      redacted state while Super Admins and Gridmasters retain actionable recovery
      detail. Add focused route and screen tests covering User, Admin, Super Admin,
      and platform-role behavior. Done when non-owner roles cannot infer billing,
      trial, suspension, archival, grace dates, or the restricting actor from
      either visible UI or the response payload, while authorized roles can still
      recover access.
- [x] **Hide the unactionable MFA warning during billing recovery.** Suppress
      the global two-factor authentication nag while a Super Admin is confined to
      the locked organization billing-recovery view, without hiding it on ordinary
      app pages or an unlocked billing page. Done when recovery mode shows only
      actions the Super Admin can use and focused tests prove the warning returns
      outside that mode.
- [x] **Restore regular-user access promptly after billing recovery.** Make the
      unavailable screen's recheck read the current organization row, refresh the
      shared access cache, and let the proxy bypass its short in-process memo when
      the user is leaving that gate. Invalidate the access cache whenever a
      Gridmaster changes access-affecting billing state, and poll only while the
      gate is visible at a short interval. Done when an active or running-trial
      override is detected within five seconds (or immediately through Check
      again), the next navigation reaches the app without a stale bounce, and
      focused tests cover the cache and proxy behavior.

## Verify

- Run the focused web organization-gate and access-status route tests.
- Run the focused web Gridmaster subscription and proxy tests.
- Run the focused mobile organization-locked screen and org-status route tests.
- Run the affected shared-contract tests if the response schema changes.
- Manually open an unavailable organization as a User and an Admin on web and
  mobile; confirm the copy is neutral and network responses contain no
  cause-specific state or dates.
- Manually open the same state as a Super Admin; confirm actionable recovery
  information and the billing route remain available.
- Run `npm run type-check`, `npm run test:web`, and
  `npm run test:mobile`.
