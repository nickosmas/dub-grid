# Feature: Web dashboards and records

**From build-plan:** feature 46c (parent 46, Clear shift-change descriptions)
**Status:** verified

## Goal

The dashboards and the Gridmaster person record describe a published change
with the shared model from 46a, compared with the original, the same way the
schedule page does since 46b.

## Design reference

- The "Shift change display" canvas:
  https://claude.ai/artifact/6AEf3RfYuGAGFvCDsLhEvA ("Web - dashboards",
  "Activity log and Gridmaster record").
- The owner's rules are condensed in the 46a archive.

## In scope

- The dashboards' recent changes merge each cell's in-window publishes
  through `mergeCellPublishChanges`, as the schedule page does.
- Staff dashboard: Your week rows and removed-shift rows show the "Was"
  card, once per day; the hero shows the same reading as text. This fixes
  the production path that dropped time and focus area: the old summary
  read `change.from`, which `toPublishChanges` never sets.
- Admin and Super Admin "My schedule": the change tooltip reads "Was ..."
  from the model.
- Gridmaster person record: each publish change is a Before and After card.

## Out of scope

- The organization activity log. Its rows store only the new state, so
  Before and After needs the previous state recorded at save time: one more
  database read per save, or a migration. That is an owner decision, so it
  moves to its own part.
- Mobile (46d), alerts (46e), the staff setting (46f), 24-hour displays
  (46g).

## Build steps

- [x] **Step 1 - Dashboard baseline** - `dashboardRecentChangesQueryOptions`
      merges per cell. _Done when:_ type-check passes and the dashboard tests
      pass.
- [x] **Step 2 - Staff dashboard** - Was card on week rows and removed rows,
      told once per day; hero text; older rows without states keep their
      summary. _Done when:_ a new test shows a removed shift's card from its
      stored state, once, and the existing tests pass.
- [x] **Step 3 - My schedule tooltip** - the publish tooltip reads the
      model's "Was" text; the row takes the focus areas to name them. _Done
      when:_ type-check and dashboard tests pass.
- [x] **Step 4 - Gridmaster person record** - the server attaches the model
      to each publish change (`fetchShiftChangeResolvers`), and the record shows
      it as a card. _Done when:_ the loader test asserts the change for a
      removed and an added absence.

## Data / contracts

- `GridmasterPublishChange` gains `change: ShiftChange | null` (null for a
  schedule note or a row either side cannot read).
- New `fetchShiftChangeResolvers(serviceClient, orgId)` in
  `apps/web/src/app/api/shared/schedule.ts`.

## Testing

- Dashboard suites, the theme contract (no faded token backgrounds), the
  person-record loader and section tests.

## Notes for the AI

- The card's Before side uses the page background, not a faded token: the
  theme contract forbids `bg-*-secondary/NN`, and the gray marks need
  contrast against it.

## Evidence

- Unit: the related web suites (187 files, 1,834 tests), lint and type-check.
- Browser (local, Calm Haven): as `qa-regular`, Saturday's Day Shift shows
  "Edited" with a Was card reading Evening Shift, Sat 3:30 PM - Sun 12:00 AM
  (8.5 hrs), Skilled Nursing, the changed parts marked; as `qa-admin`, the
  My schedule tooltip reads "Was Day Shift · 7:00 AM - 3:30 PM (8.5 hrs) ·
  Skilled Nursing".
- Gridmaster person record: covered by the loader and section tests; not
  opened in the browser (no local Gridmaster account in Calm Haven).
- Moved out: the organization activity log, to 46h.
