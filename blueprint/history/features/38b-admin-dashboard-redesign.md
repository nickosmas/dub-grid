# 38b. Admin dashboard redesign

**Type:** Feature

**Status:** verified

**Build plan:** 38b, second sub-feature of 38. Depends on 38a (landed in
`5d9427d8`).

## Goal

Make the admin Home tab read as one designed surface: a clear headline, one
hero with a dominant metric, section cards whose rows can be tapped, "See all"
where the eye expects it, and motion that says what changed. Every number
comes from the 38a contract.

Decisions (2026-09-17): greeting at `display`; card titles at `title`; open
shifts drill into the Requests tab's Available list; pending approvals into
its Approval list. Activity rows have no target (the feed carries only a
description) and stay static.

## Scope

In:

- `DashboardHeader`: greeting at `display`, org and period on one `meta` line.
  Clocks already hide when device and org time zones match.
- `DashboardHeroCard`: one surface. Coverage as the dominant figure
  (`display` size, tabular) over a full-width 6pt meter; the status pill
  fill-only; gaps and approvals as two tappable fill-only chips beneath that
  route to the Open shifts and Pending approvals screens. No bordered tiles,
  no icon frames.
- `Card` (shared): optional `onSeeAll` renders a header-right "See all"
  link (`Button tone="link" size="sm"` with a trailing chevron) in the
  accessory slot; `headerAccessory` still renders beside it.
- `DashboardRowList` replaces `ExpandableList`: rows separated by hairline
  dividers, an optional `limit` (cards pass 3), no built-in sheet and no
  bottom link. The five expanded screens use it unlimited so card and screen
  rows never drift.
- Rows: `ActionQueueRow`, `OpenShiftRow`, `CoverageSectionRow`,
  `StaffHoursRow` render as `PressableRow` with a trailing chevron and own
  their navigation: approval → `/(tabs)/requests?tab=approval&requestId=`,
  open shift → `/(tabs)/requests?tab=available`, coverage section →
  `/(tabs)/team?focusAreaId=`, staff hours → `/person/[id]`. `ScheduleScreen`
  reads `focusAreaId` (team scope) and seeds its focus-area tab from it.
- Motion: cards enter through `AnimatedListItem` on first paint; while the
  period query refetches the card column sits at 60% opacity instead of the
  toggle disabling itself; both via `useMotionPreference`.
- `DashboardSkeleton`: hero silhouette (figure, meter, two chips) and three
  rows per card at the row metrics.

Out: activity drill-ins (no target exists), the `MyScheduleCard` day strip
(already its own design), per-request highlighting on the Requests tab (the
tab param is what that screen supports), and the ring metric (a meter reads
as well and needs no drawing library).

## Build steps

- [x] **1. Header, hero, and Card "See all"**
  - `DashboardHeader` greeting at `display`; `DashboardHeroCard` rebuilt as
    above; `Card` gains `onSeeAll`.
  - Tests: Card renders the "See all" control and calls back; hero routes its
    two chips; hero shows "Not configured" when coverage is null.
  - Done when those tests pass.

- [x] **2. Row list, pressable rows, and drill-ins**
  - `DashboardRowList` with `limit`; the four rows as `PressableRow` with
    navigation; cards pass `limit={3}` and `onSeeAll`; expanded screens use
    the list unlimited; `ScheduleScreen` seeds the team focus-area tab from
    `focusAreaId`.
  - Tests: each row pushes its route with the right params; the list caps at
    `limit`; ScheduleScreen selects the tab named by the param.
  - Done when those tests and the existing dashboard and schedule suites pass.

- [x] **3. Motion and skeleton**
  - Stagger, refetch dimming, toggle no longer disabled; skeleton reshaped.
  - Tests: skeleton renders three rows per card; the toggle stays enabled
    while fetching.
  - Done when the full mobile suite, `type-check` and lint pass with no new
    `no-raw-mobile-metrics` warnings in the dashboard folder.

## Verify

- `npm run test:mobile`, `npm --workspace @dubgrid/mobile run type-check`,
  `npx eslint apps/mobile/src/features/dashboard apps/mobile/app/\(tabs\)/home`.
- Simulator as an admin: Home shows the greeting largest, one hero with the
  coverage figure and meter, cards with "See all ›" top-right and three rows
  each; tapping a pending approval lands on Requests › Approval, an open shift
  on Requests › Available, a coverage row on Schedule with that focus area
  selected, an overtime row on that person. Switching Day/Week/2 Weeks dims
  the cards briefly rather than locking the toggle.

## Outcome

- Checkpoint `f692b844` on `dev` (2026-09-17), 31 files: `DashboardHeader`,
  `DashboardHeroCard` (rebuilt), `Card` in `Screen.tsx` (`onSeeAll`),
  `DashboardRowList` (replaces `ExpandableList`), the four pressable rows and
  `ActivityFeedCard`, `AdminHomeScreen` (stagger, refetch dim, keyed sections),
  `PeriodToggle` (never disabled), `DashboardSkeleton`, `lib/coverage.ts`, the
  five `home/*` expanded screens, `ScheduleScreen` (`focusAreaId` param), and
  the entry, hero, row-list, drill-in, toggle, Screen and schedule tests.
- Evidence: full mobile suite 139 files / 1133 tests, mobile `type-check`
  clean, lint 0 errors (dashboard-area `no-raw-mobile-metrics` warnings down
  from 33 to 15, the rest are 38d's), repo-wide type-check and tests green in
  the pre-push hook.
- Device check pending an authenticated simulator session: the slow-motion
  capture of the stagger and the period crossfade is the one piece of
  evidence tests cannot give.
