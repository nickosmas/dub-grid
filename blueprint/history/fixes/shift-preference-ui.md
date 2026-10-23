# Fix: Shift preference column and a clearer dialog

**Type:** Fix
**Status:** verified
**Branch:** fix/shift-preference-ui

## Problem

Setting a shift preference on People > Recurring Shifts was confusing: a small icon beside the name opened a dropdown for the mode, same-named shifts from different focus areas showed as identical buttons ("Day Shift" twice), and Save was disabled without saying why.

## Change

- A **Shift preference** column on the recurring shifts grid shows each person's preference ("Any shift", "Only Evening Shift", "Prefers Day Shift") and opens the dialog. The icon beside the name is gone.
- The dialog offers three described choices: Any shift, Prefers some shifts, Only some shifts.
- Shifts are checkboxes with their times, grouped by focus area. Each focus area has its own shifts, so only the person's focus areas' shifts (and those for every focus area) are listed. The column names a focus area only when two shifts share a name.
- Save explains itself: "Choose at least one shift." With Only, a focus area left without a chosen shift is named ("They won't be given shifts in Sheltered Care.").
- Guide `docs/features/recurring-shifts.mdx` describes the column and dialog.

## Checks

- `ShiftPreferenceModal.test.tsx`: label, description, grouping, Save gating, the left-out focus area note and clearing; staff and CSS cascade tests pass (74).
- `npm run type-check`, `npm run lint` (2 existing warnings), `docs:check:closed`.
- Headless Playwright screenshots of the column and dialog on Calm Haven as `qa-super-admin`.
- The web suite's org-isolation inventory test fails on `reschedule_shift_series`, a function another session's branch (fix/edit-repeating-series) applied to the shared local database; not this change.
