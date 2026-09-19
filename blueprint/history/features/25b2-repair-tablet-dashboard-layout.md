# Feature: Repair the tablet dashboard layout

**From build-plan:** feature 25b2
**Status:** verified

## Goal

The dashboard's two card-row grids switch from a stacked 1-column layout to a
2-column layout at 768px (`isMobile ? "1fr" : "1fr 1fr"`), with no step for
the tablet range (768-1024px). At tablet widths, each card gets roughly half
the viewport - and inside `CoverageBySectionCard`'s day-by-day heatmap, the
horizontal-scroll fallback that would normally absorb an overflow is _also_
gated on the same viewport-wide `isMobile` flag instead of the card's own
rendered width, so it has no escape valve at exactly the width where it needs
one. `DashboardView.tsx` already computes `isTablet` and passes it down
through `DashboardContentProps` - `UserDashboard.tsx` already reads it
(`stackLayout = isMobile || isTablet`) - but `AdminDashboard.tsx` and
`SuperAdminDashboard.tsx` never do. This is a matter of finishing an existing
pattern the codebase already established, not inventing a new one.

## In scope

- Stack `AdminDashboard.tsx`'s and `SuperAdminDashboard.tsx`'s two
  card-row grids to a single column through the tablet range too, mirroring
  `UserDashboard.tsx`'s existing `isMobile || isTablet` condition.
- Make `CoverageBySectionCard.tsx`'s day-by-day heatmap scroll horizontally
  whenever its own content doesn't fit its rendered width, not only when the
  whole viewport is mobile-width.

## Out of scope

- Any other dashboard card's internal layout - this is scoped to the two
  grid containers plus the one heatmap identified by the audit, not a wider
  dashboard pass.
- `UserDashboard.tsx` - it already handles `isTablet` correctly; nothing to
  change there.
- Changing the `TABLET` breakpoint definition itself, or `useMediaQuery`'s
  behavior - 25b1 already fixed the timing of when it resolves.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Stack the dashboard grids through the tablet range.** In
      `AdminDashboard.tsx` (`:115` and `:147`) and `SuperAdminDashboard.tsx`
      (`:64` and `:93`), change `gridTemplateColumns: isMobile ? "1fr" : "1fr
1fr"` to `gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr"`
      (both components already receive `isTablet` via `DashboardContentProps`,
      they just don't destructure or use it yet - add it to each component's
      existing destructure). Add one test to each component's existing test file
      asserting the grid renders a single column when `isTablet: true` is passed
      (existing tests that don't pass `isTablet` are unaffected: `undefined` is
      falsy, same as the current default). _Done when_ both components stack to
      one column at tablet widths, the existing 2-column behavior at desktop
      widths is unchanged, the new tests pass, and `npm run test` /
      `type-check` pass.
- [x] **Step 2 - Let the coverage heatmap scroll on its own width, not the
      viewport's.** In `CoverageBySectionCard.tsx:232`, change
      `overflowX: isMobile ? "auto" : undefined` to always `overflowX: "auto"`.
      `overflow: auto` only shows a scrollbar when content actually exceeds the
      container, so this has no visible effect wherever the heatmap already fits
      (current desktop behavior unchanged) and gives it an escape valve wherever
      it doesn't (tablet, or a narrow/zoomed desktop), instead of silently
      overflowing the card. _Done when_ the heatmap scrolls horizontally instead
      of overflowing at a card width narrower than its content, unchanged
      elsewhere, and `npm run test` / `type-check` pass.

## Files / areas

- `apps/web/src/components/dashboard/AdminDashboard.tsx`
- `apps/web/src/components/dashboard/SuperAdminDashboard.tsx`
- `apps/web/src/components/dashboard/CoverageBySectionCard.tsx`
- `apps/web/src/components/dashboard/__tests__/AdminDashboard.test.tsx`
- `apps/web/src/components/dashboard/__tests__/SuperAdminDashboard.test.tsx`

## Data / contracts

None - `isTablet` is already part of `DashboardContentProps` (used by
`UserDashboard.tsx` today); this feature only adds two more consumers of an
existing prop and changes one inline style condition. No new prop, type, or
stored shape.

## Testing

- Test runner is configured (Vitest + Testing Library); Step 1 changes
  rendered output based on a prop, so it gets a focused assertion in each
  component's existing test file. Step 2's change (`isMobile ? "auto" :
undefined` -> always `"auto"`) is a one-line CSS value with no conditional
  logic left to test - covered by the manual/visual check below instead of a
  new unit test.
- Run `npm run test`, `npm run type-check`, `npm run lint` after each step.
- Manual/browser check: resize the dashboard (as an Admin and a Super Admin)
  through 768-1024px and confirm both card rows stack to one column instead
  of squeezing two; with coverage requirements configured, confirm the
  day-by-day heatmap either fits or scrolls horizontally at every width from
  mobile through desktop, with no card overflow or page-level horizontal
  scroll.

## Notes for the AI

- This is a small, mechanical fix that completes a pattern the codebase
  already uses correctly elsewhere (`UserDashboard.tsx`) - match that
  pattern's naming and condition shape exactly rather than inventing a new
  one.
- Don't add an `isTablet` prop to `CoverageBySectionCard.tsx` - Step 2's fix
  doesn't need to know the viewport class at all; `overflow: auto` reacting
  to the card's own rendered width is the more robust fix the audit called
  for, and adding a redundant viewport check would reintroduce the same
  class of bug this step is fixing.
