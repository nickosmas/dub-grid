# Fix: bar actions as symbols in the iPhone Duo's side column

**Type:** Fix
**Status:** verified

## The problem

On the iPhone Duo the navigation bar's trailing items stand in a narrow side
column. The person page's and Profile's **Edit** were words, so on the closed
screen they sat as a pill outside the column and, open, Profile's Edit was a
word too (and hidden in the split). The canvas shows a pencil in the column.

## The fix

- `hasSideColumn` (screen-layout) and `useHasSideColumn`, which reads the
  window's insets through `WindowInsetsContext` that `SplitView` provides,
  since a list pane's own insets don't touch the column.
- With a side column, `HeaderBarAction` always shows its symbol,
  `HeaderTextBarAction` shows an action's `symbol` (Edit is the pencil,
  `EDIT_SYMBOL`), and an editor's Send is its paper plane. Elsewhere the words
  stay, as before.
- Profile's Edit shows in the split again and picks Profile details.

## Verify

- iPhone Duo simulator: the person page and Profile closed (pencil under
  Back in the column), Profile open (pencil in the column), the person editor
  (X in the column, checkmark at the top). `hasSideColumn` has unit tests.
