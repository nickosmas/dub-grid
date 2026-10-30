# Fix: Staff page refinements

**Type:** Fix
**Status:** verified
**Branch:** fix/staff-tabs-v2
**Completed:** 2026-10-29

Owner feedback on the three-tab staff page and profile, the same day.

### What changed

- The weekly pattern is called **Recurring schedule** again, never "usual week".
- **Schedule** has a month **Calendar**: each day's shifts and absences in the
  schedule's colors, drafts outlined. On the staff page it loads any month; on
  the profile it stays inside the last 12 weeks.
- **Requests** is its own tab again, with a filter dropdown and the waiting
  count. **Activity** is the change log only, with its own kind dropdown. No
  segmented filters: Schedule's filter is a dropdown too.
- Overview's strip shows **This week**, or **This pay period** when Pay period
  is the period, instead of the next seven days.
- **What they work** names each shift's focus area once the shifts come from
  more than one, since focus areas share shift names.
- Empty states on these pages use the dashed `EmptyState`; a sweep converted
  the rest of the app (`fix(ui): empty states use the dashed EmptyState
everywhere`).

### Evidence

- Type check, the staff page, profile, activity, calendar and requests tests,
  and `npm run docs:check` passed in the worktree.
- Browser, local stack, QA Super Admin: four tabs, the calendar loading a
  whole month, Activity with only its dropdown.
