# Large title fails to collapse on scroll when a screen has a sticky footer

**Type:** Fix
**Status:** verified

## The problem

On some iOS screens with a native large title, the title stayed permanently
expanded instead of collapsing to the compact bar as the user scrolled, so it
overlapped the content scrolling underneath it (reported on Profile details /
`ProfileWorkScreen`, screenshot showing "Profile details" overlapping the
"Scheduled Departments" and "Management Departments" rows).

The three screens known to reproduce this all combined `headerLargeTitle: true`
with a `Screen` `footer` prop: `ProfileWorkScreen` ("Profile details"),
`ProfilePasswordScreen` ("Change password"), and `AddPersonScreen` ("Add
Person"). Every other large-title screen in the app had no footer and
collapsed correctly.

## The fix

Confirmed on an iOS simulator: `Screen`'s footer branch nested the scroll view
one level deeper inside an extra wrapping `View` (needed only to stack
`stickyHeader`/`renderOverlay`/`footer` in a flex column). iOS's native
large-title collapse only tracks a scroll view that is a shallow child of the
screen, and that extra wrapper silently broke it. When only a footer is
present (no sticky header, no overlay), `Screen` now returns the scroll view
and the footer as shallow siblings via a Fragment instead of wrapping them,
since the screen's own native container already stacks them in a flex column.

## Build steps

- [x] **Step 1 - Restore large-title collapse on footer screens.** Reproduced
      the non-collapsing title on an iOS simulator for `ProfileWorkScreen`,
      confirmed the cause, then added a `shouldRenderFooterAsSibling` branch to
      `Screen` that renders `<>{scrollView}{footerBar}</>` instead of wrapping
      them in a `View`. Updated the one existing test that had encoded the old
      (buggy) nesting as intended behavior.

## Verification

- Live repro and fix confirmed on iPhone 17 simulator: before the fix,
  "Profile details" stayed pinned full-size through a long scroll, overlapping
  content; after the fix it collapses to the compact bar on scroll and
  re-expands at the top.
- Regression-checked a non-footer large-title screen (Security & sessions) —
  still collapses correctly.
- `Screen.test.tsx` + `screen-layout.test.ts`: 25/25 pass.
- `npm run test:mobile` (full suite): 138 files, 1117 tests pass.
- `npx tsc --noEmit` (apps/mobile): clean.
- Change Password and Add Person share the identical `Screen` code path
  (footer + large title, no sticky header/overlay) as the confirmed fix, but
  were not individually driven on the simulator this session.
