# Fix: First day on the person form only when one is set

**Type:** Fix
**Status:** verified

## The problem

Owner report, 2026-10-28, with a screenshot of Shirley Bihag (Away until
Nov 30): the web person form showed a "First day: Not set" field for
everyone, including long-time staff, because 51g4 made it editable on every
record.

## The fix

Owner's pick from an inline prototype (option A): `EditEmployeePanel` shows
First day only when the person has one stored, so it can still be moved or
cleared; Add Staff Members keeps asking for it. Mobile already showed it only
when set and had no edit field. The roster page now says a first day is set
when adding someone and changed on the record once set, and drops the advice
to restore an Offboarded person now and give them a first day, which this
removes; Restore on a date covers that case. The detail page lists "first
day if one is set" under Work details.

## Checks

- `EditEmployeePanel` tests: a person without a first day has no field, one
  with a first day keeps it; with the staff detail, view and panel suites,
  120 of 120.
- Web type-check.
- Browser, local Calm Haven as the QA Super Admin: Diane Patterson (Away, no
  first day) shows Employment alone in its row. Nobody locally has a first
  day, so the set case rests on its test.
