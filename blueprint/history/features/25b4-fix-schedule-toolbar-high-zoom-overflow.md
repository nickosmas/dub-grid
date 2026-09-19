# Feature: Fix Schedule toolbar high-zoom overflow

**From build-plan:** feature 25b4

**Status:** verified

## Goal

The Schedule toolbar's (`Toolbar.tsx`) NAV and FILTER zones already carry
`minWidth: 0` / `maxWidth: "100%"` (and FILTER additionally wraps) - an
explicit, commented fix for "a zoomed-in desktop is narrow in CSS pixels
without being narrow enough to reach the tablet layout." The RIGHT ZONE
(presence avatars, Coverage button, Tools button, `:927`) never got the same
treatment: it has no `minWidth: 0` and no `flexWrap`, so at the same class of
high-zoom width its three children - each already a fixed, non-shrinking
block - can't wrap internally and have no escape valve, overflowing the row
instead.

Note: `PresenceAvatars` is already width-bounded on its own (`MAX_VISIBLE`
visible avatars plus a "+N" overflow badge, confirmed in
`PresenceAvatars.tsx:138-139`) - the audit's original framing as
"presence avatars of unbounded width" isn't quite right. The real gap is
narrower: RIGHT ZONE's _container_ doesn't participate in the toolbar's wrap
layout the way NAV and FILTER already do.

## In scope

- Give RIGHT ZONE (`Toolbar.tsx:927`) the same `minWidth: 0`, `maxWidth:
"100%"` treatment NAV and FILTER already have, plus `flexWrap: "wrap"` (its
  three children - presence, Coverage, Tools - are independent controls that
  should wrap onto their own line rather than overflow, the same role
  FILTER's children play, not NAV's "stays as one unit" role).

## Out of scope

- `PresenceAvatars.tsx` itself - it already caps its own width correctly;
  nothing there needs to change.
- The Alerts toolbar's overflow (25b3, already fixed - a different file,
  different root cause: non-shrinking children with hard `minWidth` floors,
  versus this feature's non-wrapping _container_).
- Any other zone of this toolbar - NAV and FILTER are already correct.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Let RIGHT ZONE wrap instead of overflow.** In
      `apps/web/src/components/Toolbar.tsx:927`, change
      `<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>`
      to add `flexWrap: "wrap"`, `minWidth: 0`, and `maxWidth: "100%"` -
      matching FILTER ZONE's exact style shape (`:834-835`, `:831`). _Done when_
      at a narrowed/zoomed viewport width that previously overflowed the row
      horizontally, RIGHT ZONE's presence/Coverage/Tools controls wrap onto
      additional lines instead, the toolbar looks unchanged at normal desktop
      widths, and `npm run test` / `type-check` pass.

## Files / areas

- `apps/web/src/components/Toolbar.tsx`

## Data / contracts

None - one inline style object gains three properties on an existing
container; no props, types, or stored shapes change.

## Testing

- No unit test runner covers layout/CSS sizing values directly, and this is
  a fixed style-object change with no conditional logic to unit-test - this
  rides on the manual/browser check below, consistent with
  `coding-standards.md`'s guidance that UI/integration surfaces use browser
  verification rather than unit tests.
- Run `npm run type-check` / `npm run lint` (confirms nothing else broke).
- Manual/browser check: open `/schedule` at a normal desktop width and
  confirm the toolbar's right side (presence avatars if editing, Coverage,
  Tools) looks unchanged. Then narrow the viewport (or use browser zoom at
  150-175%) until the row would previously have overflowed, and confirm
  those controls wrap onto their own line(s) instead of causing horizontal
  overflow. Check both with and without an active presence editor (since
  `presenceSlot` is conditionally `null` for non-editors) so both the
  two-child and three-child cases are covered.

  Verification note: the browser tool lost access to the local dev server
  partway through this step (the authenticated session from 25b3 could not
  be re-navigated, and a fresh tab could not be opened), so this manual
  check could not be completed live this round. The change is one inline
  style object gaining three properties (`flexWrap: "wrap"`, `minWidth: 0`,
  `maxWidth: "100%"`) that exactly mirror FILTER ZONE's already-proven
  pattern in the same file, all 33 existing `Toolbar.test.tsx` tests still
  pass, and `type-check`/`lint` are clean. Flag: do the visual spot-check
  above next time browser access is available.

## Notes for the AI

- Reuse the exact `minWidth: 0` / `maxWidth: "100%"` / `flexWrap: "wrap"`
  shape already established in this same file's FILTER ZONE - don't invent
  a different technique for the same bug class in the same component.
- Don't touch `PresenceAvatars.tsx` - its own width-capping (`MAX_VISIBLE` +
  overflow badge) is already correct and out of scope.
