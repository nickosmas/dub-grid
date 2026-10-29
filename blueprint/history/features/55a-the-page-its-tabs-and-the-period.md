# Feature: One staff page - the page, its tabs and the period

**From build-plan:** feature 55a
**Status:** verified

## Goal

Turn the People detail page (`/people/[id]`) from three sidebar sections
(Profile, Overview, Activity) into one page. Who the person is stays
on screen (header, Contact, Work details, Record, status). Everything else
moves into tabs, and one period control beside the tabs sets the range for
every tab that covers time. 55a moves today's content into the new layout
without losing anything. 55b to 55f then add the arrows and the new views.

## Design reference

The inline prototypes approved on 2026-10-29 in the session that planned
item 55 (not stored as files). The details that matter:

- **Header** on the page background, not in a card: "Back to People" link
  above; 64px avatar; the name as the page `h1` at
  `--dg-type-page-title-size` (28px) bold; the `lg` access star after it;
  under it "Employee ID #1007", with a neutral `StatusPill` "No app access"
  before it when they have no access. Header actions sit on the right.
- **Two columns** from 1024px up: a left column (about 320px) of `dg-card`s
  for Contact, Work details and Record, labels above values
  (`dg-type-field-title`, then 13px values), focus areas, certifications and
  roles as category pills (`StatusPill variant="category"`). Below 1024px
  the page reads status card, then these cards, then the tabs (changed
  during the build so a phone sees the status first).
- **Right column**: the status card exactly as today (`EmployeeStatusCard`
  and its actions), any invitation banner, then `SpanTabs`, with the period
  control right-aligned on the same row, then the tab content.
- **Period control**: a `CustomSelect` whose options carry their dates, for
  example "Pay period (Oct 19 - Nov 1)". Custom adds the app's
  `DateRangePicker` beside it.

## In scope

- The header, the left column cards, the right column with the unchanged
  status card and invitation banners.
- `SpanTabs` for **Overview**, **Recurring**, **Access** and **Activity**,
  each shown only to viewers who can see what it holds today.
- Today's content moved in:
  - Overview keeps the metric cards and Assignments. Its Details card
    goes away, since the left column now shows those fields.
  - Recurring gets `RecurringScheduleCard` and a read-only view of the
    person's shift preferences, with a link to edit them on the Recurring
    Shifts page.
  - Access gets the Access and Management departments cards. A person with
    no app access gets a Send invite empty state.
  - Activity gets the existing timeline.
- **Edit** on Contact and on Work details opens the existing editor
  (`EditEmployeePanel`) in a `Modal` titled "Edit details". Saving, re-invite
  on an email change, the unsaved-changes prompt and focus-area questions
  all behave as today.
- Header actions moved from the bottom of the old Profile section, with the
  same gates: Send invite, Add to management, Add to schedule.
- The **period control**:
  - The options are Current week, Pay period, This month, Last 12 weeks and
    Custom.
  - Pay period uses the organization's `payPeriodStartDate` (14 days, as in
    Reports). When it isn't set, it reads "(not set)", and picking it shows
    the same toast Reports shows.
  - Custom uses `DateRangePicker` and is capped at 366 days.
  - The default is Current week. Each viewer's browser remembers the
    choice.
- One **shared range helper** used by Reports and this page. Reports keeps
  its three options (Current week, Pay period, Custom) and behaves exactly
  as today.
- In 55a the period control appears only on the **Activity** tab, and the
  timeline follows it in place of its own month stepper. The other tabs gain
  it when they start using it (55c to 55f). A control that changes nothing
  would mislead.
- **URLs**: `?tab=overview|recurring|access|activity`. Old links redirect
  with `router.replace`:
  - `?section=overview` and `?section=schedule` open Overview.
  - `?section=activity` opens Activity.
  - `?section=profile` and no parameter open Overview.
  - A tab the viewer can't see falls back to Overview.
- The public doc `docs/staff/detail-page.mdx` is rewritten for the new
  layout and its accuracy fingerprint re-recorded.

## Out of scope

- Previous and next person (55b).
- New Overview content (period stats, This week, Waiting on you, Next time
  off, the What they work donut) (55c).
- The Shifts (55d), Time off (55e) and Requests (55f) tabs.
- The staff slideover (`StaffDetailPanel`), your own `/profile` page and
  `PersonProfileHeader` (still used by `/profile`), the Gridmaster person
  page (its timeline keeps its own stepper), and the mobile app.
- Splitting `EditEmployeePanel` into separate Contact and Work details
  editors.
- Any migration or new API route.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared range helper** - move `resolveQuickRange`,
      `resolveCurrentPayPeriodRangeLocal` and the option-label builder out
      of `ReportsPageContent.tsx` into `apps/web/src/lib/period-presets.ts`.
      Add `this-month` and `last-12-weeks` (the 12 whole weeks before the
      current one, Sunday to Saturday), plus the 366-day cap for Custom.
      Reports imports it and still offers only its three options.
      _Done when:_ `period-presets.test.ts` covers every preset, a pay
      period across its boundary and with no anchor date, a month's last
      day, and a custom range over 366 days refused. `ReportsPageContent`
      tests pass unchanged.
- [x] **Step 2 - Remembered period** - a `usePersonPeriod` hook holding
      `{ preset, range }`. It reads and writes `dg-person-period` in
      `localStorage` inside try/catch, through a pure `parseStoredPeriod`
      that falls back to Current week on anything missing, malformed or over
      the cap. _Done when:_ `parseStoredPeriod` tests cover a valid custom
      range, a malformed value, a too-long range and an unknown preset, and
      the hook returns Current week when storage throws.
- [x] **Step 3 - Page shell and header** - replace `SettingsShell` on this
      page with the two-column layout and the header: back link, avatar,
      name `h1`, star, status mark, employee ID, No app access pill. Header
      actions are Send invite, Add to management and Add to schedule, under
      today's gates. Status card and invitation banners go at the top of the
      right column. Old sections render below for now so nothing is lost.
      _Done when:_ the page shows the new header and status card for an
      Active, an Away, a no-access and an Admin person. No "Profile" title
      or section sidebar remains. Header actions open the same modals as
      before.
- [x] **Step 4 - Left column cards** - Contact (Email as a `mailto:` link,
      Phone; missing reads "Not added"), Work details (Employment, focus
      areas, certifications and roles as category pills, Internal notes;
      the schedule fields only when `showScheduleDetails`, as today), and
      `PersonRecordCard`. Labels use org terminology. _Done when:_ every
      field the old Profile section showed is in the left column for each
      viewer role, with org terms (for example "Wings") and nothing
      hardcoded.
- [x] **Step 5 - Edit opens the editor** - Edit on Contact and Work
      details (shown when `canEditDetails`) opens `EditEmployeePanel` in a
      `Modal` "Edit details". Save, Cancel, the unsaved-changes prompt,
      re-invite on an email change and the focus-area question work as on
      today's inline editor. Then remove the inline editor. _Done when:_ an
      edit saves and the cards show the new values without a reload. An
      email change still offers re-invite. Closing with unsaved changes asks
      first. Viewers without edit rights see no Edit.
- [x] **Step 6 - Tabs and URL** - `SpanTabs` with Overview, Recurring
      (only with `canViewRecurringShifts`), Access (when the old Access or
      Management departments cards would show) and Activity (only with
      `canViewActivity`), driven by `?tab=`. Legacy `?section=` values
      redirect as listed in scope. A tab the viewer can't see falls back to
      Overview. _Done when:_ `StaffDetailPage.test.tsx` covers each tab's
      gate, `?tab=` switching, every legacy `?section=` value and the
      fallback. The old section tests are rewritten, not deleted. At 390
      wide the tab row scrolls sideways in the existing
      `dg-scrollable-tabs` wrapper instead of wrapping.
- [x] **Step 7 - Overview and Recurring tabs** - Overview renders
      `OverviewTab` without its Details card and without
      `RecurringScheduleCard`. Recurring renders `RecurringScheduleCard`
      and a read-only Shift preferences card (Prefers and Only, spelled out,
      or "Any shift"). The preferences load through the existing recurring
      schedule client in `features/schedule/client/api.ts`, with an "Edit
      on Recurring Shifts" link. _Done when:_ Overview shows the metric
      cards and Assignments, Recurring shows the weekly pattern and the
      preferences, and the old Overview section below is gone (the old
      Profile pieces stay until step 8). A failed preference read says so in
      the card, and no recurring shifts shows today's empty card.
- [x] **Step 8 - Access tab** - the Access card (role `CustomSelect`,
      `MemberAccessControls`) and the Management departments card, under
      today's gates. A person without app access gets an empty state: "No
      app access", what's needed (an email, then an invite), and Send
      invite when the viewer can invite. Remove the last of the old Profile
      section. _Done when:_ role change, permissions and management
      departments work as before, including step up and the self-action
      guard, the empty state shows for a no-access person, and nothing of
      the old layout remains.
- [x] **Step 9 - Period control and Activity** - the period
      `CustomSelect` (with dates in each label) and the `DateRangePicker`
      for Custom, on the tab row, shown on Activity only.
      `PersonActivityTimeline` takes an optional `range` prop. When given,
      it filters to that range and hides its `PeriodNavigator`; the
      Gridmaster person page passes none and keeps its stepper. _Done when:_
      a test covers the timeline's range filtering and that the navigator
      hides with a range. Switching period changes the Activity rows. The
      choice survives a reload. Pay period with no anchor shows "(not set)"
      and the Reports toast.
- [x] **Step 10 - Docs and qualification** - rewrite
      `docs/staff/detail-page.mdx` for the header, left column, tabs and
      period, and re-record its fingerprint with `npm run docs:fingerprint`.
      Then verify in the browser at 1440 and 390 wide, light and dark.
      _Done when:_ `npm run docs:check` passes, `type-check`, `lint` and
      `test:web` pass in the worktree, and screenshots show the page for an
      Admin, an Away person and a no-access person on desktop and phone
      width.

## Files / areas

- `apps/web/src/components/staff-detail/StaffDetailPage.tsx` - layout,
  tabs, URL handling, header actions (the main change).
- New: `components/staff-detail/StaffPageHeader.tsx`,
  `components/staff-detail/PersonInfoCards.tsx` (Contact and Work
  details), `components/staff-detail/tabs/RecurringTab.tsx`,
  `components/staff-detail/tabs/AccessTab.tsx`,
  `components/staff-detail/PersonPeriodControl.tsx`,
  `hooks/usePersonPeriod.ts`, `lib/period-presets.ts` and its test.
- `components/staff-detail/tabs/OverviewTab.tsx` - drop the Details card.
- `components/activity/PersonActivityTimeline.tsx` - optional `range`.
- `app/(app)/reports/ReportsPageContent.tsx` - import the shared helper.
- `__tests__/StaffDetailPage.test.tsx` - tabs, gates, legacy URLs.
- `docs/staff/detail-page.mdx`, `internal/documentation/accuracy-manifest.json`.

## Data / contracts

- **Load-bearing:** these types, with ISO dates and an inclusive end. 55c
  to 55f all read the period from the page:

  ```ts
  type PersonPeriodPreset =
    "current-week" | "pay-period" | "this-month" | "last-12-weeks" | "custom";
  interface PersonPeriod {
    preset: PersonPeriodPreset;
    range: { startDate: string; endDate: string };
  }
  ```

- **Load-bearing:** the `?tab=` values (`overview`, `recurring`, `access`, `activity`, and later
  `shifts`, `timeoff`, `requests`) are the page's public URL contract.
- `dg-person-period` in `localStorage` holds `{ preset, range? }`, a
  per-viewer convenience, never relied on.
- No schema change, migration or new route. Data comes from today's queries
  (`fetchEmployeeById`, `fetchEmployeeShifts`, `fetchRecurringShifts`,
  invitations, activity) plus the existing shift-preference read.

## Testing

- **Unit (Vitest):** `period-presets` (every preset, pay-period boundary
  and missing anchor, month end, the 366-day cap), `parseStoredPeriod`,
  and `PersonActivityTimeline` range filtering.
- **Component:** `StaffDetailPage.test.tsx` for the tab gates per role,
  `?tab=` switching, every legacy `?section=` value, the fallback tab, and
  that Edit opens the modal.
- **Regression:** Reports tests unchanged; Gridmaster person page tests
  unchanged.
- **Browser:**
  - Sign in as `qa-super-admin@dubgrid.test` on a local stack and open an
    Admin, an Away person and a no-access person.
  - Check the header, the cards, every tab, Edit, and the period on Activity.
  - Do this at 1440 and 390 wide, in light and dark, and send screenshots.
- **Gate:** run inside the worktree: `npm run type-check`, `npm run lint`,
  `npm run test:web` and `npm run docs:check`.

## Notes for the AI

- Client component, as today. Every gate stays exactly as the page has it
  (`canViewEmployeeDetails`, `canManageEmployees`, `canEditDetails`,
  `canManageManagementAccess`, `canViewRecurringShifts`, `canViewActivity`,
  the self-action guard). Moving content must never widen who sees it.
- Mutations keep using the effective (sandbox-aware) `orgId` the page
  already resolves. Don't read an org id from the URL or the client.
- Read every org-customizable label through org terminology, and spell out
  shifts and jobs (no bare codes) wherever new copy names them.
- Use `SpanTabs`, `dg-card`, `StatusPill`, `CustomSelect`,
  `DateRangePicker`, `Modal` and `Button` as they are. No new tab or select
  component, no native `<select>`, and no em dashes in copy.
- The status card stays exactly as it is (owner, 2026-10-29).
- The own-profile redirect to `/profile` stays.
- `PersonProfileHeader` keeps serving `/profile`, so don't change it here.
- Wrap every `localStorage` access in try/catch. The page must render with
  storage blocked.
- Keep the page's loading, not-found and no-permission handling (the
  redirect when `canViewEmployeeDetails` is false) as it is.
- Overview's metric cards keep today's labels and 12-week window in 55a.
  The period control isn't shown there until 55c, so nothing claims to
  follow a period it doesn't.
- Work in the `.claude/worktrees/one-staff-page` worktree on
  `feature/55a-one-staff-page`. Run checks there, not in the shared
  checkout.
