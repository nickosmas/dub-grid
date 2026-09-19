# Feature: Fix the Schedule grid's totals-row border-junction break

**From build-plan:** feature 25b6
**Status:** verified

## Goal

This is the exact bug class already documented in project memory
(`project_sticky_border_zoom_bug.md`): a real CSS `border-bottom` on a
`position: sticky` element gets clipped by Chromium at fractional browser
zoom, while a `background-image`-drawn divider on a sibling doesn't. The
grid's sticky header ("Staff" cell, `ScheduleGrid.tsx:1355-1384`) and the
totals row's day-tally cells (`:3707-3718`, via `data-bottom-divider="light"`
in `globals.css:3711-3720`) were already migrated to the background-image
technique. The totals row's own sticky label cell (`:3660-3681`) was missed -
it still draws its bottom divider with a literal `borderBottom`, so at
fractional zoom that one cell's divider disappears while its row siblings'
still render, producing exactly the visible junction break reported.

## In scope

- Convert the totals-row label cell's `borderBottom` (`:3674-3676`) to the
  same `backgroundImage` / `backgroundPosition` / `backgroundSize` technique
  already used on the header's "Staff" cell, using the same color
  (`var(--dg-color-border-light)`, matching this row's sibling cells'
  `data-bottom-divider="light"` color) so nothing changes except the
  rendering mechanism.

## Out of scope

- Any other divider in the grid - the header Staff cell and the day-tally
  cells already use the correct technique; this feature touches only the one
  cell that was missed.
- `data-bottom-divider`'s CSS-driven approach (`globals.css:3711-3720`) -
  that pattern targets a `.dg-grid-slot` / `.dg-grid-slot__chrome`
  wrapper-plus-chroma-child structure this label cell doesn't have (it's a
  single sticky `<div>`, like the header's Staff cell). This feature mirrors
  the Staff cell's inline technique, not the data-attribute one.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Draw the totals-row label cell's divider as a background
      image.** In `apps/web/src/components/ScheduleGrid.tsx:3674-3676`, replace
      this:

  ```ts
  borderBottom: isLastRow ? undefined : "1px solid var(--dg-color-border-light)",
  ```

  with the header Staff cell's technique (`:1372-1376`), scoped to
  `isLastRow`:

  ```ts
  ...(isLastRow
    ? {}
    : {
        backgroundImage:
          "linear-gradient(var(--dg-color-border-light), var(--dg-color-border-light))",
        backgroundPosition: "0 100%",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 1px",
      }),
  ```

  (the cell's existing `background: "var(--dg-color-surface)"` stays - a
  `background` shorthand and a `backgroundImage` layer independently, so the
  surface fill and the divider line coexist the same way the Staff cell's
  `background` + `backgroundImage` already do). _Done when_ the totals
  row's label cell shows an unbroken divider line at the same fractional
  zoom level (90%/110%) where it previously disappeared, the divider is
  absent on the last row exactly as before, and `npm run test` /
  `type-check` pass.

## Files / areas

- `apps/web/src/components/ScheduleGrid.tsx`

## Data / contracts

None - this changes only which CSS properties draw an existing visual
divider; no props, types, or stored shapes change.

## Testing

- No unit test runner covers rendered CSS/zoom-clipping behavior, and this
  is a fixed style-object change with no conditional logic beyond the
  existing `isLastRow` branch (already covered by the cell's current
  behavior) - this rides on the manual/browser check below, consistent with
  `coding-standards.md`'s guidance that UI/integration surfaces use browser
  verification rather than unit tests.
- Run `npm run type-check` / `npm run lint` (confirms nothing else broke).
- Manual/browser check: open `/schedule` with staffing totals enabled (so
  the totals row renders), and use the browser's zoom control to check both
  90% and 110% zoom (the exact levels the sticky-border-clipping bug class
  hits, per `project_sticky_border_zoom_bug.md`). Confirm the totals row's
  label cell now shows a continuous divider line connecting cleanly with its
  row siblings' dividers at every junction, with no visible break. Confirm
  the last row still has no divider (matches current behavior), and that
  100% zoom is unchanged from before this fix.

  Verification note: the browser tool's access to the local dev server
  remained unavailable this round (same issue noted in 25b4), so this
  manual zoom check could not be completed live. The change mirrors the
  header Staff cell's already-working technique in the same file
  line-for-line (same properties, same color variable, only the divider's
  position flipped from `0 0` to `0 100%` since this is a bottom divider
  not a top one), and the full `ScheduleGrid.test.tsx` suite (100 tests)
  still passes with `type-check`/`lint` clean. Flag: do the 90%/110% zoom
  spot-check above next time browser access is available.

## Notes for the AI

- Reuse the header Staff cell's exact technique (`:1372-1376`) - don't
  invent a new divider mechanism for the same bug class in the same file.
- Keep the color as `var(--dg-color-border-light)`, matching this row's
  existing color and its sibling day-tally cells' `data-bottom-divider`
  color - don't switch to `--dg-color-grid-divider-strong` (the header's
  divider is a different, intentionally stronger-weight line separating the
  header from the body; this is a lighter row-to-row divider).
- Preserve the `isLastRow` branch exactly: no divider at all on the last
  row, unchanged from today.
