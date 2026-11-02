# Fix: Alerts and audit rows finish after the response

**Type:** Fix
**Status:** verified
**Branch:** `fix/alerts-finish-after-response`
**Findings:** F-145 (P1), F-177 (P2)

## The problem

On Vercel a function may be frozen once its response is sent. Eighteen alert
dispatches were started with `void dispatchNotificationEvent(...)` and never
awaited, so the alert, its push and its email could stop halfway with no error:
status and profile changes, role and permission changes (web and the app),
invitations created, resent and revoked, removing someone from the
organization, revoking a session, a new staff member, a failed Stripe payment,
and schedule note changes. The schedule
and recurring routes wrote their activity-log rows the same way
(`logScheduleAudit`), so Before and After rows could be lost too. Publish,
sign-in and the security notices already used `after()`.

## The fix

- Each of those dispatches is handed to `after()` from `next/server`, which
  keeps the function alive until it settles. Nothing waits on it, so responses
  are as fast as before.
- `logScheduleAudit` in `schedule/manage` and `schedule/recurring` writes inside
  `after()`, still logging (never throwing) on a failed write.
- Deleting an organization clears its subdomain cache entry in `after()` too.
- A lint rule, `design/no-floating-server-work`, fails a `void <call>` or a
  floating `call().then/catch/finally(...)` in `app/api` and
  `features/**/server`, so new code can't drop work this way. A handler on a
  promise held in a variable (awaited elsewhere) is allowed.
- The web test setup runs `after()` tasks in place, since a route test has no
  request scope; files that need to hold a task back keep their own mock.

## Done when

- [x] No `void dispatchNotificationEvent(` or floating audit write remains in
      server code, and the lint rule fails one (`npm run lint:rules`, 11 cases).
- [x] `npm run type-check`, `npm run lint` and the touched routes' tests pass.

Not verified in production: whether alerts were actually being dropped before.
F-145 suggested comparing sent-alert rows with audit rows; this makes the
question moot for new alerts.
