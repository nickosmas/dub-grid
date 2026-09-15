# Feature: Fix Alerts toolbar high-zoom overflow

**From build-plan:** feature 25b3
**Status:** verified

## Goal

The Alerts inbox toolbar (`AlertsInboxPage.tsx`'s `Toolbar` function) already
wraps (`flexWrap: "wrap"`), but three of its children carry fixed `minWidth`
floors that don't shrink even once wrapped: the search box (`minWidth: 220`),
the category filter (`minWidth: 160`), and the priority filter (`minWidth:
140`) - roughly 520px of hard floor. At ordinary desktop widths this never
shows, but at high browser zoom (150-200%, which behaves like a much narrower
viewport in CSS pixels) the effective width can be just wide enough to sit
above the mobile/tablet breakpoint yet too narrow for that combined floor,
overflowing the row horizontally.

`Toolbar.tsx` (the Schedule toolbar) already solved this exact bug class in
its NAV and FILTER zones: instead of a hard `minWidth` floor, each shrinkable
child gets `flex: "<grow> <shrink> <basis>px"` plus `minWidth: 0`, so it has a
_preferred_ size but can still shrink below it when the row is genuinely too
narrow, rather than refusing to shrink and overflowing instead. This feature
applies that same established pattern to the Alerts toolbar's three
offending children.

## In scope

- Replace the search box's, category filter's, and priority filter's fixed
  `minWidth` floors with `flex-basis`-driven sizing (`flex: "<grow> <shrink>
<basis>px"` + `minWidth: 0`), matching `Toolbar.tsx`'s NAV/FILTER zone
  pattern, so each can shrink instead of forcing the row wider than its
  container.

## Out of scope

- The Schedule toolbar's own high-zoom overflow (its right zone lacking the
  same treatment) - that's 25b4, a different file (`Toolbar.tsx`) with its
  own root cause (missing `minWidth: 0` on a zone that doesn't currently wrap
  at all, versus this feature's zone which already wraps but has non-shrinking
  children).
- `BulkActions`'s button group and the "Sort" button - these are already
  content-bound (icon + a short, non-wrapping label per
  `coding-standards.md`'s "Button labels never wrap" rule) with no artificial
  floor wider than their content; they were not named in the audit and aren't
  part of the overflow.
- Any visual redesign of `CustomSelect` or the search input - this only
  changes the sizing hints their wrapping containers pass down, not the
  components themselves.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Let the toolbar's three floored controls shrink.** In
      `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`'s `Toolbar` function:
      the search box wrapper (`:1063-1068`, currently `flex: 1, minWidth: 220`)
      becomes `flex: "1 1 220px", minWidth: 0` (keeps its grow behavior and
      preferred width, but can now shrink); the category `CustomSelect`
      (`:1105`, currently `style={{ minWidth: 160 }}`) becomes `style={{ flex:
"0 1 160px", minWidth: 0 }}`; the priority `CustomSelect` (`:1117`,
      currently `style={{ minWidth: 140 }}`) becomes the same shape with `140px`.
      `CustomSelect`'s own selected-value label already truncates with an
      ellipsis when its wrapper is narrower than the label text (confirmed in
      `CustomSelect.tsx:125`), so a narrowed select stays legible rather than
      breaking. _Done when_ the toolbar no longer overflows horizontally at a
      narrowed/zoomed viewport width that previously triggered it, the three
      controls still render at their normal (220/160/140px-ish) width whenever
      there's room, and `npm run test` / `type-check` pass.

## Files / areas

- `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`

## Data / contracts

None - this changes only inline layout styles on existing elements, no
props, types, or stored shapes.

## Testing

- No unit test runner covers layout/CSS sizing values directly, and this
  feature's `Toolbar` function has no conditional logic to unit-test (it's a
  fixed style-object change) - this rides on the manual/browser check below,
  consistent with `coding-standards.md`'s guidance that UI/integration
  surfaces use browser verification rather than unit tests.
- Run `npm run type-check` / `npm run lint` (no logic changed, but confirms
  nothing else broke).
- Manual/browser check: open `/alerts` at a normal desktop width and confirm
  the toolbar looks unchanged. Then narrow the viewport (or use browser zoom
  at 150-175%) until the row would previously have overflowed, and confirm
  the search box and both filters shrink and/or wrap onto additional rows
  instead of causing horizontal overflow, with the select labels still
  legible (ellipsized, not cut off or illegible).

## Notes for the AI

- Reuse the exact `flex: "<grow> <shrink> <basis>px"` + `minWidth: 0` shape
  already established in `Toolbar.tsx`'s NAV/FILTER zones - don't invent a
  different sizing technique for the same bug class in a sibling file.
- Preserve each control's current _preferred_ width (220/160/140) as the
  flex-basis; only the "hard floor that never shrinks" behavior is what's
  being removed. At any width where there was previously enough room, the
  rendered layout should look identical to before this fix.
