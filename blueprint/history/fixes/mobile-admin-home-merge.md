# Fix: Admins get one Home in the app

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-30
**Branch:** `fix/mobile-admin-home-merge`

## The problem

In the app, an Admin or Super Admin has two homes:

- **The dashboard** (`AdminHomeScreen`, `apps/mobile/src/features/dashboard/screens/AdminHomeScreen.tsx`),
  which is the Home tab.
- **The staff home** (`HomeScheduleScreen`, `ScheduleScreen scope="mine"`),
  reached from the dashboard's **Your schedule** card at
  `/(tabs)/home/my-schedule` (`app/(tabs)/home/my-schedule.tsx`).

Only the second one has the admin's own working day:

- the next-shift card (`MeHeroCard`), with who they work with and when it ends;
- **Needs your response** (`ShiftCoverRequestsSection`), the swaps asked of
  them, with Accept and Decline;
- **Your week** (`UpcomingShiftsSection`), every day of the week with its
  shifts and their hours.

So an admin who works shifts has to leave Home to answer a swap. Two more
gaps came up while designing the merge:

- **Super Admins see no Pending approvals card.** The server returns
  `actionQueue` only for `admin` (`packages/mobile-api-core/src/dashboard.ts:756`),
  and the client shows the card only for `role === "admin"`, though both
  roles can approve and the hero already counts both.
- **An admin can't claim an open shift from Home.** The dashboard's open
  shifts come from the coverage summary with `showAll: true` and no viewer, so
  `canVolunteer` is never worked out for the person looking.

## The fix

Owner decisions (2026-10-30), from the inline prototype
("mobile_admin_home_merged_final_every_day"):

- **One Home for Admins and Super Admins**, in this order:
  - the staff Home's header, in place of the greeting and the Week / 2 Weeks
    toggle (owner, 2026-10-30, after seeing the build): the day, its week, a
    week stepper (previous, next, back to today) and the alerts bell. The
    stepper moves the whole page, cards included, a week at a time;
  - the admin's own day, with no label over it (owner, 2026-10-30): the
    next-shift card, **Needs your response** (only when something waits),
    then **Your week**;
  - a **Your team** group: Coverage, Pending approvals, Unpublished changes,
    Open shifts, Overtime watch, Recent activity, as today.
- **Your week shows every day** of the period: a worked day spelled out
  (shift name, 12-hour times, job, focus area), an absence by its name, a day
  with nothing as **Unscheduled** (owner, 2026-10-30, as the staff Home says),
  past days dimmed, today marked, and the hours beside the title. No shift
  codes anywhere.
- **Open shifts offer Claim** (the staff Home's word for it, and the
  confirmation's) on a row the admin qualifies for and is free that day (the
  server's `canVolunteer`). It sends the same volunteer request
  staff send (`volunteer_open_shift`). An admin can approve requests, so it goes
  on the schedule at once, as an approver's claim does on the staff Home, and
  the confirmation says so (owner, 2026-10-30).
- **Super Admins get Pending approvals** like Admins.

Must hold:

- **Management-only admins** (no focus area to work in) get no You group and
  no Claim; Home is the Your team cards alone, as today.
- **Not linked to a staff profile:** no You group, no Claim.
- **The staff Home is unchanged** for Users.
- **One skeleton, one paint.** The You group's data joins the page's single
  loading gate, as `MyScheduleCard`'s does today, and the skeleton draws the
  new shape.
- **Shared code, not copies.** The You sections move out of
  `ScheduleScreen.tsx` into components both homes render; their logic is not
  duplicated in the dashboard.
- **Wording:** "Your week", "Needs your response", "Claim", "Unscheduled",
  "32h this week" (12-hour times, spelled-out shifts).

The `/(tabs)/home/my-schedule` route and `MyScheduleCard` go away. Nothing
else links to the route (alerts open shift detail or the Schedule tab).

## Build steps

- [x] **1. Share the staff Home's personal sections.** Move `MeHeroCard`,
      `ShiftCoverRequestsSection` and `UpcomingShiftsSection`, and the data and
      respond action behind them, out of `ScheduleScreen.tsx` into
      `src/features/schedule/components/` plus a hook (for example
      `useMyHomeSections(range)`) that both homes can call. The staff Home renders
      through them with no visible change. Give `UpcomingShiftsSection` a
      two-week form (a heading and hours per week).
      **Done when:** the existing ScheduleScreen tests pass unchanged, a new test
      covers the two-week form's headings and per-week hours, and
      `npm run type-check` is clean.

- [x] **2. The You group on the admin Home.** `AdminHomeScreen` renders the
      shared sections first, then the team cards under **Your team**,
      following the period toggle; management-only and unlinked admins see no You
      group. Remove `MyScheduleCard` (and its test), the `my-schedule` route and
      its stack entry, and update `DashboardSkeleton` and the realtime
      invalidation key that named the card.
      **Done when:** `AdminHomeScreen.test.tsx` covers: scheduled admin (both
      groups, in order), off today, a swap waiting, 2 Weeks, management-only
      (team only); and nothing references `my-schedule` or `MyScheduleCard`.

- [x] **3. Pending approvals for Super Admins.** Return `actionQueue` for
      `super_admin` in `dashboard.ts`, drop the client's `role === "admin"` gate
      and the skeleton's.
      **Done when:** the dashboard handler test and `AdminHomeScreen.test.tsx`
      show the queue for a Super Admin.

- [x] **4. Claim on Open shifts.** The dashboard's list keeps every gap. Whether
      the admin can take one comes from their own `/shift-requests` feed, which
      the You group already loads and whose `canVolunteer` is worked out for them by
      `buildMobileOpenShiftsFromGaps` (`apps/web/src/features/mobile/server/data.ts`),
      matched to a row by focus area and day. `OpenShiftsCard` shows **Claim** on
      such a row and runs the existing volunteer flow, whose confirmation says it
      goes on the schedule right away; the dashboard reloads after.
      **Done when:** tests cover an eligible row, a row blocked by a shift that
      day, and a management-only viewer (no button).

- [x] **5. Docs.** Update the Home rows in `docs/features/mobile-navigation.mdx:34`
      and `docs/features/dashboard.mdx:33`: one Home for Admins and Super Admins,
      their own day first (next shift, swaps to answer, every day of the week),
      then the team cards, Pending approvals for both roles, and Claim on open
      shifts they can work, which go on the schedule at once. Refresh the fingerprints (`npm run docs:fingerprint`).
      **Done when:** `npm run docs:check` passes.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:mobile`, and the
  mobile-api-core and web mobile-server tests touched by steps 3 and 4.
- On the iOS Simulator, against a local stack, as an Admin on the schedule:
  Home shows You (next shift, a swap to answer, every day of the week with
  Unscheduled days) then Your team; the header steps the page a week at a time;
  Accept on a swap works from Home; Claim on an eligible open shift puts them
  on the schedule. As a Super Admin:
  Pending approvals shows. As a management-only Admin: only the team cards.
  As a User: the staff Home is unchanged. Screenshots of each, light and dark.

## Out of scope

- The web dashboards (Super Admins' approvals card on web stays as it is).
- Changing what the team cards show or their drill-in screens.
- The staff Home's layout.

### Verification evidence

- `npm run type-check` and `npm run lint` pass (2 existing `<img>` warnings on
  web). `npm run docs:check` passes.
- `npm run test:mobile`: 1,566 of 1,567 mobile tests and every shared package
  pass. The one failure, `PersonDetailScreen > never offers today as a return
date`, predates this fix and fails alone too: the test takes "today" in UTC
  and the screen in local time, so it fails locally after 5 PM Pacific. CI runs
  in UTC.
- `@dubgrid/mobile-api-core` dashboard tests (39) pass, including the queue for
  a Super Admin.
- **iOS Simulator**, the QA Super Admin at Calm Haven against a local stack
  and this branch's web server and Metro: Home opens on today's card (an Off
  absence), then Your week with every day spelled out and 42.5h; a row opens
  shift detail with Working with; the team cards follow under Your team, with
  Pending approvals shown to a Super Admin. After seeing it the owner had the
  "You" label removed and the greeting and Week / 2 Weeks toggle replaced by
  the staff Home's header with its week stepper (`WeekNavigatorHeader`, now
  shared by both homes); the drill-in screens take the week as `weekOf`.
  The Unpublished changes card, which only counted drafts the app can't
  publish, was removed at the owner's word too.
- **Not seen on device:** Claim (Calm Haven has no staffing needs, so no gaps)
  and a swap to answer; both are covered by `MyHomeSections.test.tsx` and
  `OpenShiftsCard.test.tsx`. Not run: `npm run test:e2e`, Android.

### Follow-ups

- Fix the UTC "today" in `PersonDetailScreen.test.tsx`'s return-date tests.
