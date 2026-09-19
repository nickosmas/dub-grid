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
- e2e `role-variance-impersonation.spec.ts`: 3/3 on Chromium against the
  worktree server. Firefox on that webpack server was unreliable in warm-up
  (NS_BINDING_ABORTED on the post-login goto, unrelated to this change);
  the End Session landing was strict-asserted and passed in every Firefox run
  that got that far.
