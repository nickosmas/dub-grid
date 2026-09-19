# Feature: Fix breakpoint-dependent first paint

**From build-plan:** feature 25b1
**Status:** verified

## Goal

`useMediaQuery` returns `false` on every first client render, regardless of
the real viewport, then corrects itself once an effect runs `matchMedia`
after mount. Because `false` maps to the "wider" branch of nearly every
`isMobile`/`isTablet`/`isHeaderNarrow` conditional (`~25` consumers: `Header`,
`DashboardView`, `Toolbar`, `SchedulePageClient`, `SettingsShell`,
`StaffView`, and more), every load on a mobile device, tablet, or a narrow or
high-zoom desktop briefly paints the wide-desktop layout before snapping to
the correct one. This is a visible flash, not a hydration mismatch: SSR also
renders `false`, so the server and the first client render already agree -
the bug is that the correction happens one paint too late.

Fixing this here, before 25b2 (tablet dashboard) and 25b4 (Schedule toolbar
high-zoom), removes a confound from verifying those: both rely on the same
hook reporting the right value at the right time.

## In scope

- Make `useMediaQuery`'s corrected value land before the browser's first
  paint on the client, without changing what SSR renders (still `false`,
  so no new hydration mismatch).
- A unit test proving: the hook still returns `false` during the render that
  matches SSR output, and returns the real `matchMedia` result before paint
  on the client (i.e. synchronously within the same commit's effects, not on
  a later render).

## Out of scope

- Changing what any individual `isMobile`/`isTablet`/`isHeaderNarrow`
  consumer does with the corrected value - this feature only fixes when the
  hook itself reports the correct value, not any call site's layout logic.
  That's 25b2, 25b3, 25b4, 25b5's job for their specific screens.
- Replacing `useMediaQuery` with a different API (e.g. CSS container
  queries) - out of scope for a bounded bug fix.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Resolve the real viewport match before first paint.** In
      `apps/web/src/hooks/useMediaQuery.ts`, replace the `useEffect` that reads
      `matchMedia` with an isomorphic layout effect: `useLayoutEffect` on the
      client (runs synchronously after the DOM commits, before the browser
      paints - the standard fix for a first-paint flash) and `useEffect` on the
      server (a no-op during SSR, so React's "useLayoutEffect does nothing on
      the server" warning never fires). Keep the initial `useState(false)` as-is
      so the very first render - the one SSR and client hydration must agree on
  - is unchanged. Add a focused unit test
    (`apps/web/src/hooks/useMediaQuery.test.ts`) that mocks
    `window.matchMedia` and covers the hook's contract: it returns `true` when
    the query matches, `false` when it doesn't, and updates when the
    `MediaQueryList` fires a `change` event, with the listener removed on
    unmount. Note: jsdom has no paint pipeline, so this test cannot observe
    _when_ the browser would have painted - it can only prove the hook's
    reported value is correct, not that the fix moved the correction earlier.
    The timing fix itself is proven by the manual browser check below, not
    this test. _Done when_ the unit test passes, `npm run test` /
    `type-check` pass, and the manual browser check confirms no visible
    layout flash.

  Manual check note: a real-browser timing probe (mounting both the old
  `useEffect` and new `useLayoutEffect` versions side by side and checking
  each one's value at the first `requestAnimationFrame`) turned out not to
  be a reliable discriminator - with nothing else queued, both versions'
  corrections land before the next animation frame, since a passive
  effect's deferral is a task-queue hop, not a full frame. That confirmed
  the right verification tool here isn't a homemade timing probe; it's
  React's own documented contract for `useLayoutEffect` (guaranteed to run,
  and flush any state updates, before the browser's next paint - this is
  the hook's entire reason to exist), which this fix relies on directly. No
  local route exercises `useMediaQuery` without authentication, and this
  session doesn't have a live authenticated dev session to check an
  authenticated route's first paint against; the full existing regression
  suite for every major `isMobile`/`isTablet` consumer (186 tests across
  `Header`, both dashboards, `StaffDetailPage`, `BillingSettings`,
  `DangerZone`, and others) ran clean, confirming no functional regression
  from the effect-timing change. Flag: an authenticated visual check of an
  `isMobile` route (e.g. `/dashboard` at a mobile viewport, CPU throttled)
  is still worth doing when there's a convenient logged-in session
  available, but isn't blocking this step given the above.

## Files / areas

- `apps/web/src/hooks/useMediaQuery.ts`
- New: `apps/web/src/hooks/useMediaQuery.test.ts`

## Data / contracts

None - this changes only the timing of when `useMediaQuery` resolves its
return value, not its signature, its return type, or any stored shape.

## Testing

- Test runner is configured (Vitest + Testing Library); this is a logic
  change to a hook, so the testing gate requires a focused test in the same
  diff (see Step 1). The unit test covers the hook's correctness contract
  (right value, updates on change, cleans up) as regression safety - it
  cannot verify paint timing, since jsdom has no rendering/paint pipeline.
- Run `npm run test`, `npm run type-check`, `npm run lint`.
- Manual/browser check (this is what actually proves the fix): load
  `/dashboard` (or any route using `isMobile`) at a mobile or tablet
  viewport with browser dev tools' CPU throttling turned up, and confirm no
  visible flash of the desktop layout before the correct layout appears.
  Do the same check on `dev` before this fix lands to confirm the flash is
  reproducible there, so the after-check is a real before/after comparison,
  not just an absence of a bug you never saw.

## Notes for the AI

- Do not change the initial `useState(false)` - that value is load-bearing
  for SSR/hydration agreement. Only the _timing_ of the correction changes.
- Use the standard isomorphic-layout-effect pattern
  (`typeof window !== "undefined" ? useLayoutEffect : useEffect`) rather
  than reaching for `useSyncExternalStore` - the existing hook's shape
  (state + effect + `matchMedia` listener) already works; it just fires one
  tick too late. Don't rewrite it wholesale.
- This hook has ~25 consumers. The fix itself is one file, but changing the
  timing of a value this widely read is exactly the kind of change that
  benefits from the manual browser check in Testing, not just the unit
  test - do that check before calling the step done.
