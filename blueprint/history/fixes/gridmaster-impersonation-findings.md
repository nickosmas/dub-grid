# Gridmaster impersonation findings F-69 to F-74

**Type:** Fix (findings F-69, F-70, F-71, F-72, F-73, F-74)

**Status:** verified

## The fixes

- F-69: end reason validated against the DB constraint (400, not 500).
- F-70: known `start_impersonation` refusals answer 409/400 with their message.
- F-71: banner says "Viewing <org> as <role> (<email>)"; greeting and unlinked
  dashboard card stop naming the wrong person during impersonation.
- F-72: the /gridmaster escape ends the session row with reason `navigation`.
- F-73: end/start teardown marks the auth transition and no longer clears the
  query cache before the document navigation.
- F-74: unreachable `gridmaster/not-found.tsx` removed.
- Also: `mapNotificationRow` moved out of `api/notifications/route.ts` into
  `features/notifications/server/map-row.ts`; a route file may only export
  handlers and the generated route types failed type-check under the webpack
  dev server.

## Evidence

- Unit: impersonation route (8), impersonation-server (7), middleware,
  dashboard suites, notifications routes all pass; web type-check and lint
  clean.
- e2e `role-variance-impersonation.spec.ts`: 3/3 on Chromium, Firefox and
  WebKit against the main checkout's Turbopack server after the
  fast-forward, plus 6 Firefox repeats of the End Session case with the
  strict `/dashboard` landing: 0 bounces (was about 1 in 7).
