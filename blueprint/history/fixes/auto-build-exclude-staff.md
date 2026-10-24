# Fix: Leave chosen staff out of an Auto-build

**Type:** Fix
**Status:** verified
**Branch:** `fix/auto-build-exclude-staff` (cut from `fix/auto-build-blank-days` at 1350af57)

## Problem

A scheduler has no way to keep someone out of Auto-build, such as a person on
leave without an absence recorded, or about to start. The owner (2026-10-23):
"when auto building, we can mark staff to be excluded from the auto build".

## Decisions (owner, 2026-10-23)

- Picked per build, in the Auto-build section before Generate schedule. The
  choice applies to that build only.
- Recurring fills only: an excluded person's recurring schedule still fills
  in, and the build adds no other shift and no day off marks for them.

## Steps

- [x] **Step 1 - Engine** - `excludedEmployeeIds` in the plan options: no
      assign, restore, move back or top-up for those people, an `excluded`
      reason ("left out of this build") for the shifts left short, and the
      preview lists them.
      _Done when:_ an engine test and a text test cover it.
- [x] **Step 2 - Picker** - "Exclude staff" in the Auto-build
      section (staff in the build's scope), cleared by Apply or another
      period; a changed choice clears the result. Days off and the top-up
      skip them; the result says "Excluded: ...".
      _Done when:_ a panel test covers the picker and the line; a headless
      browser build gives the people left out nothing.
- [x] **Step 3 - Docs** - the Auto-build guide.

## Checks

- schedule-core 287 pass (the exclusion engine test and the reason text);
  web panel, schedule and component tests 958 pass, with the picker and the
  "Excluded" line.
- Headless browser on Calm Haven, Nov 1 to 14 with two temporary
  requirements, leaving out Barbara Trent and Kevin Donovan: 30 people built
  as usual (420 changes), the two left out got no cell at all, the result read
  "Left out of this build: Barbara Trent, Kevin Donovan", and Undo emptied the
  period. The requirements were removed.
- `npm run type-check`, eslint and prettier on the changed files,
  `docs:check:closed`.
- The owner renamed the picker "Exclude staff" (2026-10-23); the result
  reads "Excluded: ..." and the reason "excluded from this build".
- The owner asked for the description under the title as short points that
  don't explain the logic (2026-10-23): three points in the section's list
  style.
- An independent review found that a choice came back on returning to the
  period, and that the result could name someone outside the focus areas
  shown. The choice now clears on another period (a headless check kept it
  across closing the panel and cleared it after next and back), and only
  people in the build's scope are left out or shown in the picker (panel
  test).
- An independent review of the branch confirmed F-129 and F-130 repaired
  without a new defect, and found that a day a move back empties got neither
  a day off nor a blank; it now counts as empty and stays blank (adapter
  test). Known days off before the period are now only days already past.

## Notes for the AI

- Never reseed or reset the shared local stack; temporary coverage
  requirements on Calm Haven are removed after the check.
