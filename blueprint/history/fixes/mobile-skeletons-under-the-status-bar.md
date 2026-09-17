# Mobile skeletons draw under the status bar

**Type:** Fix

**Status:** verified

## The problem

On mobile, the loading skeleton for the Dashboard (`AdminHomeScreen`) and the
Schedule (`ScheduleScreen`, both the Home and Team scopes) renders directly
under the status bar and Dynamic Island, then jumps down when real content
arrives.

Both screens are `headerShown: false` routes that pass a `stickyHeader` to
`<Screen>`. While loading they set `scrollEnabled={false}`, and in that branch
`Screen` pads the sticky-header shell by `mobileSpace.sm` (8pt) instead of the
top safe-area inset:

```ts
// apps/mobile/src/shared/components/Screen.tsx
const resolvedStickyHeaderTopPadding =
  stickyHeaderTopPadding ?? (scrollEnabled ? Math.max(insets.top, 8) : mobileSpace.sm);
```

The comment above that line assumes the non-scrolling shell "sits in normal
flow, already below the system bars". That is only true under a native header,
and no screen with a sticky header has one: a sticky header exists precisely
because the route hides the native header. The scrolling branch already pads by
`Math.max(insets.top, 8)`; the two branches disagree, so the placeholder and
the content it stands in for occupy different vertical positions.

Introduced in `754c36e1` (light-theme repair), which moved skeletons into the
non-scrolling branch.

## The fix

Make the non-scrolling sticky-header shell use the same top padding as the
floating one, `Math.max(insets.top, 8)`, and replace the incorrect comment with
the real invariant: a sticky header only appears on a route with the native
header hidden, so the shell always has to clear the system bars itself,
whether or not it floats.

Must not change:

- The scrolling branch, the floating shell's shadow split, or the iOS
  `contentInset` handling.
- The non-scrolling branch without a sticky header. Every current caller of
  that shape (`NotificationDetailScreen`, `AddPersonScreen`,
  `AddToScheduleScreen`, `PersonDetailScreen`, the five `home/*` expanded
  screens) sits under a native header, so it needs no inset. Document that
  assumption next to the code rather than padding it.
- `stickyHeaderTopPadding`, which still overrides both branches.

## Build steps

- [x] **1. Pad the non-scrolling sticky-header shell by the safe-area inset**
  - In `Screen.tsx`, resolve `resolvedStickyHeaderTopPadding` to
    `Math.max(insets.top, 8)` for both branches when no override is passed, and
    rewrite the comment to state the headerless-route invariant.
  - Add a note on the plain non-scrolling branch that it assumes a native
    header, so a future headerless skeleton without a sticky header knows to
    pass `stickyHeaderTopPadding` or add a sticky header.
  - In `Screen.test.tsx`, the safe-area mock returns `top: 8`, which equals the
    old fallback and cannot see the defect. Make the mocked inset overridable
    per test (a module-level variable the mock reads), then add a test that
    renders `scrollEnabled={false}` with a `stickyHeader` at `top: 59` and
    asserts the shell's `paddingTop` is 59. Keep a sibling assertion that the
    scrolling branch resolves the same value, so the two cannot drift again.
  - Done when both tests pass, the existing `Screen` suite stays green, and
    `npm --workspace @dubgrid/mobile run type-check` passes.

## Verify

- Run `npm --workspace @dubgrid/mobile run test -- Screen` and confirm the new
  inset tests pass.
- In the iOS simulator (iPhone 17 Pro, already booted with the debug build):
  - Sign in as an admin, pull to refresh or cold-start the Home tab, and
    screenshot the dashboard skeleton. The greeting placeholder starts below
    the Dynamic Island, at the same y as the real greeting once loaded.
  - Open the Schedule tab and repeat: the date-strip skeleton sits where the
    real strip lands; no vertical jump on the swap.
- Wrong looks like: any placeholder touching the status-bar clock, or content
  shifting down when the skeleton clears.

## Outcome

- Checkpoint `860289c9` on `dev` (2026-09-17): `Screen.tsx` and `Screen.test.tsx`.
- Evidence: `Screen.test.tsx` 16/16 (two new inset tests, confirmed red against
  the unfixed file), `npm --workspace @dubgrid/mobile run type-check` clean,
  repo-wide type-check and tests green in the pre-push hook.
- Device screenshot check (spec Verify section) was not run in the completing
  session: it needs a signed-in simulator session. Do it on the next
  authenticated mobile pass.
