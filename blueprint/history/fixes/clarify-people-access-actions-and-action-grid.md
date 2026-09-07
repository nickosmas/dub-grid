# Fix: Clarify people-access actions and align action grids

**Type:** Fix
**Status:** complete

## The problem

The People access surface uses a generic permission-oriented action label. It
does not clearly say what happens when selected, and adjacent actions across
the same staff-management surfaces can have mismatched dimensions.

## The fix

- Replace generic permission action wording with a verb-led label that names
  the resulting access change without using a bare or ambiguous "Permissions"
  button title.
- Lay adjacent People actions out in the shared two-column grid: two equal
  actions per row, with a final odd action spanning the full row. Every peer
  action has the same width and height, without changing its authority or order.
- Leave descriptive section labels and the permissions editor's content
  terminology intact; this is an action-label and paired-action-layout fix.

## Build steps

- [x] **Clarify People access actions and align action grids** - update the
      permission launcher and affected neighboring action groups. _Done when:_ no
      affected button is generically titled "Permissions", its label describes the
      action, and every visible People action group follows the two-column
      equal-dimension grid at the supported viewport sizes.

## Verify

- Focused staff-access tests: 15 tests passed.
- Full web suite: 372 test files and 3,176 tests passed.
- Changed-file ESLint and `git diff --check` passed.
- Production build passed.
