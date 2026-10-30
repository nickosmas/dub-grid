# Fix: Staff page in three tabs

**Type:** Fix
**Status:** verified
**Branch:** fix/staff-page-three-tabs
**Completed:** 2026-10-29

The one staff page (item 55) had seven tabs, a narrow left column of cards and
a lot of small text competing for attention. The owner reworked it in inline
prototypes on 2026-10-29 (v5 to v11) and approved the last one: fewer tabs, a
clear type scale, pills only where something needs attention, and the
dashboard's schedule cards for the person's days.

### Goal

- Three tabs: **Overview**, **Schedule**, **Activity**. Old `?tab=` and
  `?section=` links open the tab that now holds their content.
- **Header:** back link with previous and next person, avatar, name with the
  access star and status mark, a line of roles, focus areas and employment,
  and a line with email and phone. Page actions are text buttons: Send
  invitation, Add to management, Add to schedule, Edit details.
- **Status card:** unchanged, with the pending invitation banner under it.
- **Overview:** Hours, Shifts and Average per week in one card; Next 7 days in
  the dashboard's Your schedule day strip; Needs attention (requests waiting,
  only when there are any) beside What they work; an About section with Work
  (focus areas, certification, roles, internal notes) and Access (access
  level, management departments, permissions, account; Edit opens the access
  controls in a popup); and one quiet line for the record (employee ID,
  added, joined, first day, status changed, plan).
- **Schedule:** Usual week in the same day strip with shift preferences, then
  one list of shifts and time off for the period grouped by week, filtered
  All, Shifts or Time off, with Export CSV. Only Draft, Corrected, Planned and
  Now get a pill; Published and Taken stay plain.
- **Activity:** requests and the change log in one tab, filtered All,
  Requests or Changes. A waiting request has a Waiting on you pill and a
  Review link to where it is reviewed; the tab shows a count when anything is
  waiting.
- Lists use plain text, never color dots; only the donut keeps chart colors.
- Page content up to 1200px wide.

### Out of scope

- Mobile, and `/profile` (it keeps `OverviewTab`).
- Approving requests on this page.
- Any data or API change. No migration.

### Build steps

- [x] 1. Header, status area, three tabs and legacy tab links.
- [x] 2. Overview: stats, Next 7 days (shared `MyScheduleRow`), Needs attention,
      What they work, About and the record line.
- [x] 3. Schedule: Usual week strip with preferences, and the combined shifts
      and time off list (`buildScheduleRows`, tested).
- [x] 4. Activity: requests list and the change log under one filter, and the
      tab count.
- [x] 5. Remove the replaced components, update unit and e2e tests and the
      public page, and check every status in the browser.

### Done when

- `/people/<id>` shows three tabs, and `?tab=shifts|timeoff|recurring` opens
  Schedule, `?tab=requests` opens Activity, and `?tab=access` opens Overview.
- Type check, lint, the web tests and the docs check pass.
- Screenshots of Active, Away, Suspended, Offboarded and No app access people
  show the layout above.

### Notes for the AI

- Keep the status card and `EmployeeStatusActions` as they are.
- Buttons are text-only. Spell out shifts and jobs. No em dashes.
- Reuse `MyScheduleRow` for Next 7 days rather than copying its pills.

### Evidence

- `npx tsc --noEmit -p apps/web/tsconfig.json`, ESLint and Prettier on the changed files, and `npm run docs:check` passed in the worktree.
- New `buildScheduleWeeks` tests (`apps/web/src/lib/schedule-rows.test.ts`) and the rewritten Overview, Activity and page tests passed.
- Browser, local stack, signed in as the QA Super Admin: Active with a planned away (Thomas Crawford), Away until a date (Diane Patterson), a linked Admin with management departments and the Edit access popup (QA Admin), and no email or app access (Margaret Sullivan), at 1440 wide and 390 wide with no sideways scroll.
- Not seen locally: a person with recurring shifts or waiting requests (none in the local seed), Suspended and Offboarded (none in the local seed); unit tests cover the usual week, waiting requests and the review links.
