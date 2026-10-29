# Feature: One staff page - previous and next person

**From build-plan:** feature 55b
**Status:** verified

## Goal

From a person's page, step to the next or previous person in the People
list exactly as it was last filtered and sorted, without going back to the
list. The header shows where they are ("7 of 37") and names who's next.

## Design reference

The inline prototype approved on 2026-10-29 (the header with arrows):
"7 of 37" in 12px subtle tabular text, then two icon-only `dg-btn-secondary`
square buttons (chevron left, chevron right) with an `aria-label` and a hover
hint naming the person, right-aligned in the header beside the page's other
actions. Icon-only controls keep their icon; text buttons stay text-only.

## In scope

- The People directory list (`MembersSection`) saves the order of its full
  filtered and sorted list (every page, not only the visible one) as employee
  ids, scoped to the organization, in `sessionStorage`.
- The person page reads it, finds the person, and shows the position and the
  two arrows. Previous is disabled on the first person and Next on the last.
  Each arrow's hint and label name that person ("Next: Ben Egwuenu"), read
  from the directory the page already loads.
- Moving keeps the open tab (`?tab=`).
- Your own record is skipped, since it opens your profile instead, so the
  position counts the people you can step through.
- Opened without a list (a typed URL, an alert, a dashboard link, or a list
  from another organization), or for someone not in the saved list, the
  arrows and position don't show.

## Out of scope

- Keyboard shortcuts, the Gridmaster person page, the staff slideover, the
  mobile app, and lists other than the People directory.

## Build steps

- [x] **Step 1 - The saved order** - `lib/people-order.ts`:
      `savePeopleOrder(orgId, ids)` and `readPeopleOrder(orgId)`
      (`sessionStorage` key `dg-people-order`, try/catch, a pure
      `parsePeopleOrder` that rejects anything malformed or from another
      organization), and `findNeighbors(ids, currentId, skipIds)` returning
      `{ position, total, previousId, nextId }` or null. _Done when:_ tests
      cover the first, middle and last person, a skipped id (own record), a
      person not in the list, malformed storage, another organization's list.
- [x] **Step 2 - The list saves it** - `MembersSection` saves `sorted`'s ids
      whenever they change. _Done when:_ a component test shows the stored
      ids follow a sort change.
- [x] **Step 3 - The arrows** - a `PersonPager` in the person page header:
      position text and the two arrows with hints, hidden without a list.
      _Done when:_ `StaffDetailPage` tests cover the position, both arrows'
      targets keeping the tab, the disabled ends, the skip of your own
      record, and no arrows without a saved list.
- [x] **Step 4 - Docs and qualification** - one sentence in
      `docs/staff/detail-page.mdx`, fingerprint re-recorded, then a browser
      check from the People list. _Done when:_ `docs:check`, lint and tests
      pass and a screenshot shows "n of N" and the arrows stepping.

## Data / contracts

- `sessionStorage["dg-people-order"] = { orgId: string; ids: string[] }`,
  a per-tab convenience only. It holds ids, never names.

## Notes for the AI

- Read `orgId` the way each page already does (the effective, sandbox-aware
  id); a list saved for another organization is ignored.
- Wrap every storage access in try/catch; the page works without it.
