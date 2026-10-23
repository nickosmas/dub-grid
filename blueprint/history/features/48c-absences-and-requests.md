# Feature: Schedule Builder - absences and requests

**From build-plan:** feature 48c (parent 48, Schedule Builder)
**Status:** complete
**Branch:** `feature/48c-absences-requests` (cut from `dev` at 3a52653f)

## Goal

Nobody on an absence or with a request waiting is scheduled by a build, and
the build's preview names who was skipped for the shifts it leaves short and
why, date by date, so a manager knows exactly what stands between the draft
and full coverage.

## What already holds

Every absence type, whole-day and rest-of-day (draft or a recurring fill from
48b), and every overlapping shift already rule a person out of a fix, with a
reason in Not suggested.

## Decisions (made for the owner)

- **A waiting request blocks scheduling.** Someone who is the requester or
  the target of a pending request (pickup, swap or call-off) on a date is not
  scheduled that date by a suggestion or a build, with the reason "has a
  request waiting that day". Approving the request stays a separate,
  confirmed action.
- **The preview lists people, not cells.** Each skipped person appears once,
  with each date and reason; the list shows five people and "Show all".
  Only shifts the build leaves short, in its scope and not started, count.

## Build steps

- [x] **Step 1 - Requests block scheduling** - `CoverageAvailability` gains
      `{ kind: "request"; dateKey }`; the staffing loop rules out a person
      with a request waiting that day; `describeCoverageRuledOut` words it.
      _Done when:_ tests show the person is not suggested and is ruled out
      with that reason, and an approval suggestion for their own pickup is
      unaffected.
- [x] **Step 2 - The preview's skipped people** - `previewCoverageBuild`
      returns `skipped: CoverageRuledOut[]` from the last planning pass, for
      cells still short in scope; a reason-only formatter gives the words.
      _Done when:_ tests cover skipped people for short cells left, none for
      filled or started cells or rows out of scope, and the formatter.
- [x] **Step 3 - The Build section names them** - "Not scheduled" groups
      skipped people with each date and reason, five then Show all.
      _Done when:_ component tests cover the grouping, dates in order, the
      Show all toggle, and no list when nobody was skipped.
- [x] **Step 4 - Guides and browser check** - the guide describes it;
      Calm Haven with a temporary requirement and a temporary absence shows
      that person under Not scheduled, and the build never schedules them.
      _Done when:_ `docs:check` passes and the browser check shows it.

## Data / contracts

- **Load-bearing:** `CoverageBuildPreview.skipped: CoverageRuledOut[]`;
  `CoverageAvailability` `request` kind; `describeCoverageRuledOutReason`.
- No schema, API or migration change.

## Out of scope

- Overtime (48d), fairness (48e), the report (48f).

## Notes for the AI

- Words: "absence", never "off day"; no em dashes; dates in the shared short
  form.

## Result

- Someone with a pickup, swap or call-off request waiting on a day is never
  scheduled that day by a suggestion or a build, and Not suggested says "has
  a request waiting that day"; approving their own pickup is still offered.
- The build preview's **Not scheduled** names each qualified person left out
  of a shift the build leaves short, once, with every date and reason in
  order, five people then Show all; when nobody qualified exists at all it
  still says so.
- Browser, Calm Haven with a temporary requirement (removed): the preview
  listed 7 people, for example "Carol Henderson Fri, Oct 23: Off that day;
  Sun, Oct 25: Off that day" and Night Shift overlaps (that organization's
  Night Shift runs midnight to 8 AM, so it does overlap a 7 AM Day Shift).
