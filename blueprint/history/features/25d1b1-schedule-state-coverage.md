# Feature: Schedule state coverage

**From build-plan:** feature 25d1b1
**Status:** verified

## Goal

`/schedule`'s manifest entry lists `loading`, `error`, `not found`, and
`dialogs` as `sourceReviewedStates`. Tracing the actual route code
(`apps/web/src/app/(app)/schedule/{page,error,not-found}.tsx` and
`SchedulePageClient.tsx`) shows two of these are real and testable, and two
appear to be unreachable boilerplate rather than genuine gaps:

- **loading** - real. `page.tsx` is an async Server Component that awaits a
  Supabase session/JWT check before rendering `SchedulePageClient`.
  `loading.tsx` (Next's route-level Suspense fallback) shows while that's in
  flight - reachable during a **client-side** navigation to `/schedule`
  (Link click or `router.push`), since Next's client router requests the new
  segment's RSC payload over a real HTTP request the browser makes, which
  Playwright can delay with `page.route` regardless of what the server does
  internally. A hard `page.goto("/schedule")` wouldn't show it (no client
  router involved yet), so this has to be a click-based navigation.
- **dialogs** - real. The page renders several (Tools menu items, an open-shift
  claim/volunteer confirmation, etc.) - one is enough to demonstrate the
  class works.
- **error** - looks unreachable. Every failure path in `SchedulePageClient.tsx`
  is a caught `toast.error(...)` (10+ call sites checked), never an uncaught
  throw. `error.tsx`'s React error boundary only fires on an uncaught render
  error, which this route's code doesn't appear to produce under any normal
  failure.
- **not found** - looks unreachable. No `notFound()` call exists anywhere
  under `apps/web/src/app/(app)/schedule/`. `not-found.tsx` exists (likely
  copied from another route's convention for consistency) but nothing in
  this route calls it.

This feature converts the two real states to live evidence and corrects the
manifest's claim about the two that aren't - the same kind of correction
made for 25b5, 25c, and 25d1a's error state during this epic.

## In scope

- Add Playwright coverage for `/schedule`'s `loading` state (client-side
  navigation, delayed RSC request) and one representative `dialogs` case.
- Update the manifest: move `loading` and `dialogs` to `browserStates`;
  remove `error` and `not found` from `sourceReviewedStates` with a comment
  explaining why (unreachable given the current route implementation, not a
  browser-evidence gap).
- If Step 1's investigation finds a real trigger for `error` or `not found`
  that this spec missed, stop and flag it rather than silently declaring it
  unreachable - the two states above are the current best understanding, not
  a foregone conclusion.

## Out of scope

- `/people` and `/people/[id]`'s state coverage - that's 25d1b2, a separate
  sub-feature with a concrete, deterministic `not-found` trigger (a
  malformed UUID in the URL) that `/schedule` doesn't have.
- Every dialog the schedule page can open - one representative case is
  enough to demonstrate the class; an exhaustive dialog inventory is
  disproportionate to this audit's purpose.
- Fixing `error.tsx`/`not-found.tsx` themselves, or removing them as dead
  files - correcting the _manifest's claim_ about them is this feature's
  job; whether the files themselves should be deleted as unreachable
  boilerplate is a separate, unrelated cleanup decision for the user, not
  bundled into this audit-evidence feature.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Confirm (or correct) the error/not-found claims; update the
      manifest.** Before writing any test, do one more targeted check: search
      `SchedulePageClient.tsx` and anything it imports for a path that could
      still throw uncaught or call `notFound()` under some condition this scan
      missed (a nested dynamic import, a child component not yet checked, etc.).
      If none is found, remove `"error"` and `"not found"` from `/schedule`'s
      `sourceReviewedStates` in `typography-route-manifest.ts`, with a comment
      explaining why (mirrors this file's Goal section). If a real trigger _is_
      found, stop and flag it - the plan changes to testing it, not removing it.
      _Done when_ the manifest reflects whichever outcome is true, and the
      manifest's coverage-shape test still passes (a route needs at least one
      evidenced state, which `/schedule` already has from its existing
      `browserStates`).
- [x] **Step 2 - Cover the loading state via client-side navigation.** Add a
      Playwright test (in `e2e/typography.spec.ts` or a new
      `e2e/schedule-states.spec.ts`) that logs in, lands on an already-hydrated
      authenticated page, delays the browser's request for `/schedule`'s RSC
      payload via `page.route`, clicks the "Schedule" nav link, and asserts
      `loading.tsx`'s `<ProgressBar loading />` (same `data-progress-bar`
      marker 25d1a added) is visible during the delay and gone once the grid
      renders. _Done when_ the test passes and the manifest moves `"loading"`
      to `browserStates`.
- [x] **Step 3 - Cover one representative dialog.** Add a test that opens
      one schedule dialog (pick whichever is simplest to reach deterministically
      from a clean login - the Tools menu's Print dialog is a reasonable
      candidate, but confirm during the step) and asserts it renders and closes.
      _Done when_ the test passes and the manifest moves `"dialogs"` to
      `browserStates`, leaving `/schedule`'s `sourceReviewedStates` empty (per
      Step 1's outcome).

## Files / areas

- `e2e/typography.spec.ts` or new `e2e/schedule-states.spec.ts`
- `e2e/typography-route-manifest.ts`
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` (read-only,
  re-checked in Step 1)

## Data / contracts

None - this adds test coverage and corrects a documentation claim in the
manifest; no product code, type, or stored shape changes are expected. If
Step 1 finds a real error/not-found trigger this spec didn't anticipate,
that could change scope - flag it rather than improvising a fix.

## Testing

- This feature's product _is_ test coverage, same as 25d1a. Each step's
  "done when" is a passing Playwright test (run via
  `npx playwright test <file> --project=chromium`) or a verified manifest
  correction.
- Run the manifest's coverage-shape test after each manifest edit.
- Run each new test 2-3 times consecutively to check for flakiness before
  calling a step done, same practice as 25d1a (the loading-state delay
  technique is timing-sensitive).

## Notes for the AI

- Don't force a synthetic error or not-found trigger just to have something
  to test - if Step 1 confirms they're genuinely unreachable, correcting
  the manifest's claim _is_ the fix. Manufacturing a fake trigger (e.g.
  wrapping something in a try/catch that rethrows just for the test) would
  add real product code whose only purpose is making a test pass, which is
  worse than an honest "not currently reachable" note.
- For Step 2's delayed-navigation technique: match the RSC-specific request
  Next's client router makes (look for a `RSC: 1` request header or the
  `_rsc` query param in the network tab while manually reproducing) rather
  than delaying every request to `/schedule` indiscriminately, which could
  also catch the initial hard-navigation document request in an unrelated
  test and slow it for no reason.
- Reuse 25d1a's patterns where they fit (the `data-progress-bar` marker,
  running new tests 2-3x for stability, `loginAsQaSuperAdmin` for the base
  session) - don't reinvent conventions this epic already established.
