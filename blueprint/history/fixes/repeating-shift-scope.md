# Fix: Repeating shifts ask before overwriting and change by date

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

> Requested in chat rather than through `/fix`, while
> `blueprint/context/current-feature.md` held another fix, so this record was
> written directly.

### The problem

1. **Creating a repeating shift overwrote existing days without asking.** The
   repeat form showed "N existing shifts will be overwritten" and
   `create_shift_series` (migration 042) then replaced every shift or off day
   on the series' dates.
2. **A change to a repeating shift reached one occurrence or all of them.**
   The edit panel's scope toggle offered "This shift" and "All in series", so
   there was no way to end a series from a date on, or to change only its
   earlier part.

### The fix

- **Creating:** when some of the series' days already hold a shift or off day,
  Create opens **Replace existing shifts?** with **Replace** and **Keep
  existing**. Keep existing skips those days, which stay as they were and do
  not join the series. The day being repeated is always written. A skipped day
  still counts toward "After N occurrences", so the series ends where the
  preview said. If the count cannot be fetched, the form asks anyway.
- **Changing or removing:** the scope toggle is a 2x2 grid of **This shift**,
  **All in series**, **This and earlier** and **This and later**, for edits
  and removals alike. Removing **This and later** ends the series the day
  before; a removal that leaves no occurrence archives the series. An edit
  that does not reach the series' end leaves the series template alone.
- **Migration 080** drops and recreates the three series functions with new
  parameters: `p_keep_existing` and `p_origin_date` on `create_shift_series`,
  and an inclusive `p_from_date` and `p_to_date` on `update_series_all_shifts`
  and `delete_shift_series`. Each is revoked from PUBLIC and anon and granted
  to `authenticated`. An edit no longer brings back an occurrence removed on
  its own after publishing (a draft `deleted` snapshot).
- `/api/shifts/repeat-overwrites` counts only days an editor sees a shift or
  off day on (draft, else published, not `deleted`), as the database does.
- The unused **Delete Shift Series?** dialog in `SchedulePageClient.tsx` was
  removed: nothing set `pendingSeriesDelete`.
- `docs/features/recurring-shifts.mdx` describes the choice and the four
  scopes in place of the removed dialog.

### Evidence

- `npm run test:web` on the branch rebased onto `3881b32f`: 644 files,
  5,747 tests passed.
- `npm run type-check` and `npm run lint` (0 errors, the 2 existing `<img>`
  warnings), `npm run db:migrations:check` and `npm run docs:check` passed.
- `shift-series-scope.integration.test.ts` runs the new functions against the
  local database: keep existing versus replace, the origin day, this and
  later, this and earlier, archiving an emptied series, both ranged edits and
  the template, and an edit not reviving a removed published occurrence.
- Route tests cover the new parameters and ranged note clearing;
  `ShiftEditPanel` tests cover the prompt's two choices, the unknown-count
  case and the four scopes.
- Browser, worktree dev server on Calm Haven (its local trial extended for the
  check and restored afterwards): a daily series over a day holding Vacation,
  Keep existing, left Vacation outside the series; **This and later** from
  Thursday removed Thursday and Friday and ended the series on Wednesday;
  **This and earlier** from Tuesday removed the rest and archived the series.
  Test data removed afterwards.
- Migration 080 is applied to the local database only.

### Out of scope

- Splitting a series in two when only part of it is edited.
- Recurring schedules (People > Recurring Shifts) and Auto Fill, which never
  overwrite.
- Mobile, where schedule authoring is web-only.
