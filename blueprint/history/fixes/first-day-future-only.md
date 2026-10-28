# Fix: A first day is only ever set ahead

**Type:** Fix
**Status:** verified

## The problem

After option A (`first-day-only-when-set`), the owner asked what a first day
is for once it has passed (2026-10-28). It blocks scheduling and shows
"Starts Nov 10" only while it's ahead; a past one does nothing. Web still
let a manager set any past day, and the person form kept the field for
anyone who had one, so long-time staff kept seeing it.

## Decisions (owner, 2026-10-28)

- A new or moved first day is from today up to a year ahead, on web as on
  mobile. A stored past one stays as it is, and can still be cleared.
- The person form (slideover and full profile) offers the field only while
  the first day is still ahead, the same rule as the Starts card. After it,
  the date shows only in the full profile's Record.
- It isn't derived from a first shift: that would be wrong for anyone who
  started before the organization used DubGrid, and couldn't block days
  ahead. When a first shift falls after the first day, the first day still
  stands; the days between are ordinary schedulable days.

## The fix

- `@dubgrid/domain` `isValidFirstDay` refuses a day before today; the
  message reads "Choose a first day from today up to a year ahead." The web
  and mobile routes share it, and an unchanged stored date is never
  re-checked.
- `FirstDayField` sets the picker's earliest day to today.
- `EditEmployeePanel` shows First day only while `upcomingFirstDay` is set.
- The roster and detail pages and the overview's 51g4 line say so.

## Checks

- Domain tests, 89 of 89 (today accepted, past refused); employees route
  tests refuse a new past day, take today, and save a stored past day left
  as it was; panel tests show the field only while it's ahead. Web suites
  170 of 170, mobile people suites 164 of 164.
- Type-check of web and mobile.
- Browser, local Calm Haven: Add Staff Members' First day calendar greys out
  every day before Oct 28 and offers today on. Nothing was saved. The edit
  field's ahead and passed cases rest on their tests (nobody local has a
  first day, and setting one on a seeded person would close their seeded
  requests).
