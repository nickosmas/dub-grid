# Feature: Corrected everywhere

**From build-plan:** feature 53c (item 53, Past-day corrections)
**Status:** verified

## Goal

A corrected past day says so wherever a manager looks: the grid marks the
cell and names why on hover, and the organization's activity log reads
"Corrected a past day" with the day before and after and the reason. Hours
and reports already follow a correction, because it rewrites the published
day and clears its draft.

## Decisions made (owner, 2026-10-28)

- **The reason is typed and optional.** It replaces 53a's five fixed reasons
  and the note for Other. Migration 112 makes `reason` an optional text of
  up to 500 characters, drops `note` (a 110 row keeps its label with its
  note after it), and `correct_schedule_cell` takes `p_reason` alone. The
  panel shows one optional "Reason" box, and Save correction no longer waits
  for it.

## Decisions made here

- **The mark is a small pencil** at the top-right of a corrected past cell,
  after the peer-editing lock like the corner's other marks, and the cell's
  title and description read "Corrected: <reason>" or just "Corrected". A
  day from today on is never marked.
- **The page loads corrections for its loaded window** through a
  `fetchCorrections` manage action (editors only, the latest correction per
  day) and adds its own correction at once on save. Someone else's
  correction shows on the next load.
- **Hours need no change:** a correction clears the day's draft, so the web
  dashboard's draft-over-published hours, mobile hours and reports all read
  the corrected published day.

## What was built

1. Migration 112 (typed, optional reason), with the 110 and 111 tests run
   on 110 to 112 and taking their locks up front (`beginWithLocks`), since
   110 and 112 replace the same functions and a parallel run deadlocked.
2. `fetchCorrections` (route and client), the page's correction map, and the
   grid's `corrections` map through the model.
3. The Corrected mark and hint in `ScheduleGrid`.
4. The activity log adds the reason beside Before and After for
   `shift.corrected`; `correctionReasonLabel` reads 110-era keys in words.
5. The panel's optional Reason box; the route, client and page take a
   typed reason.
6. Docs: the grid page (typed reason, the pencil mark) and the activity page
   (corrections read "Corrected a past day").
7. The Modal focus test waits up to five seconds for focus, after it timed
   out at one second in a loaded pre-push run.

## Completion evidence

- Live: `migration-110` (15) and `migration-111` (4) pass together three
  times in a row with 112 applied locally.
- Unit: the grid's corrected-day test, the route tests for a typed, empty
  and too-long reason, the activity-log reason and Before and After, and the
  domain label.
- Browser, local stack (Calm Haven, QA Super Admin): the two corrected days
  load with "Corrected: Called off"; Margaret Sullivan's Tue, Oct 27 was
  corrected from Office to Personal with "Took the day for a family
  emergency", the mark appeared at once, and the audit row and correction
  row carry the reason.
- `type-check`, `lint`, `docs:verify` (14 pages re-fingerprinted, the
  inventory refreshed), `db:migrations:check` and the full `test:web`.
- Not in production: migrations 110 to 112 wait on the owner's kit.
