# Feature: Preferences in the shift picker

**From build-plan:** feature 58
**Status:** verified
**Branch:** `feature/58-preferences-in-picker` (cut from `origin/dev` at ed7034d55)

## Goal

A scheduler filling a cell by hand sees the same shift and job preferences
Auto-build follows, where they choose the shift, and is warned (never
blocked) when a choice goes outside an Only preference.

## Decisions (owner, 2026-11-15)

- **Only in the shift editor.** Not the grid, its hover card, the open-shift
  staffing picker or the Staffing check.
- **Info banner** first in the picker, above the focus area tabs, one line
  per preference the person has: "Shift preference: **Prefers Day Shift**",
  "Job preference: **Only CNA**". Bold only on the preference. No close
  button. No banner for someone with neither.
- **Group tag** on the heading of each shift group the shift preference
  names: "Preferred" for Prefers, "Only" for Only. Quiet neutral tag, never
  blue. Tiles keep their order and look; nothing is dimmed or disabled.
- **Warning, never a block,** when a pick breaks an Only preference, in one
  warning banner under the shift in the day view (the picker closes on a
  pick), however many items it holds. Each item names what was picked, then
  the preference on its own line (owner, mid-build): "Day Shift is outside
  Aisha's preference." / "Shift preference: **Only Evening Shift**", and for
  a job "Med Aide is outside Aisha's preference." / "Job preference:
  **Only CNA**". A Prefers preference never warns. Absences and shiftless
  work (Orientation, Training) never warn.
- **Anyone who can edit shifts sees them**, as well as those who can view
  recurring shifts today.
- Design: "Shift preferences in the picker" canvas
  (https://claude.ai/artifact/Fs8N9bZehCrdCrQ5zYeH1z).

## Design reference

The canvas above has three artboards: Prefers a shift, Only one shift with
another chosen, and a shift plus a job preference. It reuses the "Choose a
shift" artboard of the "Shift panel" canvas, so only the banner, the tag and
the warning are new.

**Settled in Step 1:** the first canvas drew the warning under the group in
the picker, but the real picker closes as soon as a shift is picked
(`selectPickerSegments` calls `setShowPicker(false)`), so a warning there
would vanish with the click. The canvas's second row puts it in the day view
instead, under the shift it applies to, where it also covers a cell opened
with an out-of-preference shift already in it.

## In scope

- Read access to both preference lists for anyone with Edit shifts.
- One shared rule for "outside an Only preference", used by the picker and
  by the Auto-build adapter, so the two can't disagree.
- Loading the organization's preferences on the Schedule page for anyone who
  can edit shifts (once per kind, shared with Auto-build), and passing the
  person's own to the shift editor.
- The banner and group tags in the picker, and the warning in the day view.
- The Recurring Shifts and Schedule grid guides.

## Out of scope

- Grid marks, the hover card, the open-shift staffing picker and the
  Staffing check (owner, 2026-11-15).
- Mobile: schedule authoring is web only.
- Editing a preference from the Schedule page; it stays on People >
  Recurring Shifts.
- Any change to how Auto-build ranks or refuses people.
- Test Sandbox clones, which carry no preferences (49e), so they show no
  banner.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Prototype the warning in the day view** - add an artboard to
      the canvas: the day view after Day was picked for someone who works
      Only Evening Shift, the warning under the Day shift card in field-text
      style (tone icon, neutral text), plus a second shift and a job case.
      _Done when:_ the owner approves where the warning sits, or picks
      another place.
- [x] **Step 2 - Edit shifts can read preferences** - in
      `app/api/schedule/recurring/route.ts`, `fetchShiftPreferences` and
      `fetchJobPreferences` accept a caller who can edit shifts as well as
      one who can view or manage recurring shifts; saving still needs
      manage. _Done when:_ route tests show an Edit-shifts-only Admin reads
      both lists, an Admin with neither permission gets 403, and saving
      without manage is still refused.
- [x] **Step 3 - One rule for "outside an Only preference"** - a pure
      function in `@dubgrid/schedule-core` taking a shift id, a job id and
      the person's two preferences, returning which Only preference the
      choice breaks (shift, job, both or none), with the engine's current
      answers (no shift breaks Only shifts; no job breaks Only jobs). The
      web Auto-build adapter (`schedule/_lib/coverage-suggestions.ts`) calls
      it in place of its inline checks. _Done when:_ schedule-core tests
      cover Prefers, Only shift, Only job, both, no shift and no job, and the
      existing coverage-suggestions tests pass unchanged.
- [x] **Step 4 - Load preferences with the schedule** - the Schedule page
      reads both lists through TanStack Query (the existing
      `recurringShifts.preferences` and `jobPreferences` keys) whenever the
      viewer can edit shifts, instead of the `useState` fetch that runs only
      while the Auto-build panel is open; Auto-build reads the same data.
      `ShiftEditPanel` and `ShiftPicker` take the person's two preferences
      as one optional prop. _Done when:_ an editor's page load makes one
      request per kind, opening Auto-build makes none, a viewer who can't
      edit shifts makes none, a failed read leaves the editor working with
      no banner (as Auto-build builds without preferences today), and
      Auto-build tests pass.
- [x] **Step 5 - Banner and group tags in the picker** - the shared `Banner`
      (info tone) above the focus area tabs, and the "Preferred" or "Only"
      tag beside each group heading the shift preference names, names from
      the organization's shift categories and jobs. _Done when:_ Calm Haven
      screenshots, light and dark, show Prefers, Only and a shift plus job
      preference; someone with no preference shows neither; a shift or job
      the organization archived is left out of the line rather than shown
      as a blank.
- [x] **Step 6 - The warning** - wherever Step 1 settled, one line per broken
      Only preference, using Step 3's rule; absences and shiftless work
      skip the check. _Done when:_ picking Day for an Only Evening Shift
      person shows "Outside <first name>'s shift preference: Only Evening
      Shift" and the shift saves as a draft as before; picking Evening
      shows nothing; Med Aide under Only CNA shows the job line; Orientation
      and Vacation show nothing; reopening the cell shows the warning again.
- [x] **Step 7 - Docs** - `docs/features/schedule-grid.mdx` (the shift
      editor shows preferences and warns), and
      `docs/features/recurring-shifts.mdx#preferences` (who sees them: also
      anyone who can edit shifts); `npm run docs:fingerprint` records both
      pages. _Done when:_ `npm run docs:check` and `npm run docs:verify`
      pass.

## Files / areas

- `apps/web/src/app/api/schedule/recurring/route.ts` and `route.test.ts`
- `packages/schedule-core/src/` - the new rule and its test, exported from
  the package index
- `apps/web/src/app/(app)/schedule/_lib/coverage-suggestions.ts`
- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` (around the
  preference `useEffect` near line 7523, and the `ShiftEditPanel` mount
  near line 9991)
- `apps/web/src/components/ShiftEditPanel.tsx`,
  `apps/web/src/components/ShiftPicker.tsx`
- `apps/web/src/components/staff/PreferencesModal.tsx` - reuse
  `describePreference` for the wording
- `docs/features/schedule-grid.mdx`, `docs/features/recurring-shifts.mdx`

## Data / contracts

- No migration. Reads `employee_shift_preferences` (089) and
  `employee_job_preferences` (091) through the existing route; the
  response shape is unchanged.
- New prop on `ShiftEditPanel` and `ShiftPicker` (load-bearing for any later
  surface that shows preferences):
  `preferences?: { shift?: CoverageShiftPreference; job?: CoverageJobPreference }`.
- The Step 3 rule's return shape (load-bearing, shared with Auto-build):
  `{ shift: boolean; job: boolean }`, true where the choice breaks that
  Only preference.

## Testing

- **Unit (gate on):** the Step 3 rule in schedule-core; the route's read
  permission in `route.test.ts`; Auto-build adapter tests unchanged.
- **Browser (Calm Haven, as an Admin with Edit shifts):** set a preference on
  Recurring Shifts, open that person's cell, and check the banner, tags and
  warning per Steps 5 and 6, light and dark; then remove the preference.
  Repeat as an Admin with Edit shifts but not View recurring shifts to
  prove Step 2.
- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile` (schedule-core), and the docs checks.

## Notes for the AI

- Client components; the route keeps `requireOrgPermissions` with the
  effective (sandbox-aware) organization id. Never trust a client org id.
- The banner is `components/ui/Banner` (info tone), not a hand-built box.
  Tags and warning text use semantic tokens, no local hex or gray utilities.
- Shift preference ids are shift category ids and match
  `AssignableShiftOption.shiftId`; job ids match `jobId`. Group headings are
  grouped by shift name, so read the group's shift id from its first option.
- The warning names the person by first name, falling back to the display
  name.
- Copy: no em dashes; organization terms (focus areas, certifications) come
  from terminology, never hardcoded.
- Prototype first: Step 1 needs the owner's approval before Steps 5 and 6.

## Outcome (2026-11-15)

- **What changed from the spec:** the warning moved from the picker to the
  day view under the shift, since the picker closes on a pick (Step 1). Mid
  build the owner set its wording ("Day Shift is outside Aisha's
  preference." then "Shift preference: Only Evening Shift") and put it in
  one warning banner for however many items it holds. The picked shift is
  named plainly; the preference keeps the focus area where shift names are
  shared ("Only Evening Shift · Skilled Nursing").
- **Evidence:** route tests 10 of 10 (Edit shifts reads both lists, saving
  still needs manage); schedule-core `onlyPreferenceBreaks` 5 tests and the
  package's 330; Auto-build adapter 287 tests unchanged; the picker and
  editor suites 132; `shift-preference-notes` 6 tests; full `npm run
test:web` 8,089 (the typography contract caught the tag's raw 11px,
  now the badge size token) and `npm run test:mobile` 1,785; `npm run
type-check` and `npm run lint` clean (2 existing `<img>` warnings);
  `docs:check` and `docs:verify` pass after re-recording 11 pages'
  fingerprints. Browser, Calm Haven on a worktree server as the QA
  account, with a temporary Only Evening Shift and Only Supervisor (then
  Only Mentor) preference on Richard Bennett, removed afterwards: the
  picker showed the info banner and the "Only" tag in dark and light; his
  Tuesday Day shift showed the shift warning, then both warnings in one
  banner once the job preference was Mentor; Diane Patterson, with no
  preference, showed neither; no console errors.
- **Audit (when-sensitive, read access widened):** the read stays scoped
  to the caller's effective organization through `resolveEffectiveOrgId`
  and `requireOrgPermissions`; saving still needs Manage recurring shifts.
  No findings.
