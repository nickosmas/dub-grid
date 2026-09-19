# Gridmaster lifecycle findings F-87, F-89, F-90, F-91, F-93, F-95

**Type:** Fix (findings F-87, F-89, F-90, F-91, F-93, F-95)

**Status:** verified

## The fixes

- F-87: suspended and deleted organizations get a lockout card on the sign-in
  page (seed, proxy flags, and new `ORG_SUSPENDED` / `ORG_DELETED` login codes).
- F-89: oversight reads page past PostgREST's 1000-row cap and share one facts
  load across the portal's five views for 10 s.
- F-90: the gridmaster invitations list no longer ships tokens.
- F-91: archive cancels Stripe server-side, records it in the audit row, and
  the dialog says so.
- F-93: `send-invite-email` only mails a live invitation to its own address,
  for a caller allowed to act for that organization, with the name from the row.
- F-95: archive, restore, suspend and unsuspend drop the access and slug caches.

## Evidence

- Unit: gridmaster routes, `_lib/oversight`, `auth/login`, `send-invite-email`,
  login page, middleware and validate-domain suites: 255 pass. Web type-check
  and ESLint clean.
- Not exercised in a browser: the suspended/deleted lockout card rendering
  live (component tests cover the three entry paths).
