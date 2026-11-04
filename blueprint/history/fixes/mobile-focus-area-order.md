# Fix: The app lists focus areas in the order Settings shows

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-focus-area-order`

## The problem

In Arden Wood, Settings lists Nursing (Skilled Nursing, Night Nursing,
Sheltered Care) and then Visiting Nursing, but the app's Schedule tab put
Visiting Nursing first (owner, 2026-11-04).

The mobile API ordered focus areas by their own sort order alone. That number
only counts within a department: Nursing's first wing and Visiting Nursing's
only area are both 0, so they tied and Visiting Nursing came out first. The
web already orders by the department first (`orderFocusAreasByDepartment`).

## The fix

- `orderFocusAreasByDepartment` moves from the web app to `@dubgrid/domain`,
  unchanged, so web and the mobile API share one rule.
- `fetchMobileFocusAreaRows` (bootstrap's focus areas, which the Schedule
  tab's area tabs follow) loads the departments alongside and orders by them
  first.

## Evidence

- A data-access test lists Nursing's three wings before Visiting Nursing from
  rows whose sort orders tie; the moved domain tests pass.
- Web type-checks against the new domain build; lint and the docs contract
  pass.
- Not checked against Arden Wood's own data: production was not read. The
  order follows from its Settings screen.
