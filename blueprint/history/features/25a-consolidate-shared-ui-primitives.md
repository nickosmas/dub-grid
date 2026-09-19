# Feature: Consolidate shared UI primitives

**From build-plan:** feature 25a
**Status:** verified

## Goal

Every equivalent element in the web app should share one visual and
interaction contract. An audit of the live codebase found real duplication in
two of the six areas the parent item names (semantic statuses, switches),
partial duplication in a third (numeric counts), and a small copy
inconsistency in a fourth (auth action labels). Consolidating these onto the
shared primitives that already exist removes the drift and gives 25b (layout
repairs) and 25d (qualification matrix) a stable surface to check against.

## In scope

- **Semantic statuses** - replace four independent status-color maps with the
  existing token-driven `StatusPill` (`apps/web/src/components/ui/status-pill.tsx`).
- **Switches** - replace `PermissionsEditor`'s hand-rolled toggle with the
  shared `Switch` (`apps/web/src/components/ui/switch.tsx`), matching its
  44×24 track everywhere else.
- **Numeric counts** - sweep the count renderers the earlier "responsive
  numeric badges" fix (`92d2d516`) didn't reach onto the shared `NumericBadge`
  (`apps/web/src/components/ui/numeric-badge.tsx`).
- **Auth action copy** - fix the "Sign In" / "Sign in" casing split between
  the login/reset-password pages and the magic-link email, and introduce one
  small canonical action-copy source so this class of drift doesn't recur.

## Out of scope

- **Empty states** - already consolidated (`EmptyState` is used in ~35
  files); the only exceptions found are two inline text spans in a detail
  tab, not worth a dedicated step. Leave them.
- Plain (non-switch) checkboxes - flagged during the audit as worth a look,
  but they're a different control with different semantics; confirming none
  of them should actually be switches is 25b/25d's job, not this feature's.
- Any visual redesign of `StatusPill`, `Switch`, or `NumericBadge`
  themselves - this feature standardizes _usage_, not the primitives' own
  look.
- Dashboard-card count _presentation_ decisions (whether a given card should
  show a badge at all) - flagged in the audit but deferred; this feature only
  touches renderers that are already pill-shaped and just don't use the
  shared component.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Consolidate semantic status maps onto `StatusPill`.** Replace
      the independent color/label maps in `ProfileChangeRequestQueue.tsx`
      (`STATUS_STYLES`), `GridmasterSecurityView.tsx` (`SESSION_STATUS_STYLES`),
      `ShiftRequestBoard.tsx` (`SHIFT_REQUEST_STATUS_COLORS` from `lib/colors.ts`),
      and `MembersSection.tsx`'s ad hoc `statusColors` with `StatusPill`, adding
      any tone `StatusPill` doesn't already have.

  Scope correction made during implementation: `CoverageBySectionCard.tsx`
  and `ExpandedCoverage.tsx`'s `STATUS_COLORS` were dropped from this step.
  On inspection they color fixed-size 28px heatmap grid cells (day-by-day
  staffing), not a status pill/badge — `StatusPill`'s auto-sizing
  `inline-flex` pill shape doesn't fit a square grid cell, and forcing it in
  would break the heatmap's alignment. The other four are genuine duplicates:
  all render an `inline-block`/`inline-flex`, padded, bordered, rounded span
  with a background/text/border color pulled from a local map — the same
  shape `StatusPill` already produces.

  _Done when:_ the four confirmed call sites render through `StatusPill`,
  each surface's visible colors/labels are unchanged (same tone mapping, just
  through the shared component), and `npm run test` / `type-check` pass.

- [x] **Step 2 - Replace `PermissionsEditor`'s hand-rolled switch.** Swap the
      custom `role="switch"` button (hardcoded `h-6 w-11`) in
      `PermissionsEditor.tsx:339-360` for the shared `Switch`. _Done when_ the
      permissions screen's toggles are visibly the same size as every other
      switch in the app (44×24 track) and existing tests plus a manual check of
      the Permissions editor pass.
- [x] **Step 3 - Sweep remaining numeric-count renderers onto `NumericBadge`.**
      At minimum, `ShiftRequestBoard.tsx:745`'s plain-text tab counts
      (`" (${tab.count})"`). Spot-check `OpenShiftsCard.tsx`,
      `CoverageBySectionCard.tsx`, and `ActionQueueCard.tsx` for other pill-shaped
      or circle-shaped counts not using `NumericBadge`; convert any found, and
      note (don't convert) any inline number that isn't actually styled as a
      badge today. _Done when_ every pill/circle-shaped count in the audited
      files renders through `NumericBadge`.

  Spot-check results: `OpenShiftsCard.tsx`'s "N more gaps" is plain inline
  text, not a badge shape - left alone. `CoverageBySectionCard.tsx`'s
  filled/required counts render inside the same fixed 28px heatmap grid
  cells excluded in Step 1 - not a pill/circle, left alone.
  `ActionQueueCard.tsx` has only a small urgency dot and a success-checkmark
  circle, neither a numeric badge - nothing to convert. Only
  `ShiftRequestBoard.tsx:745` needed the swap.

- [x] **Step 4 - Fix "Sign In" casing and add a canonical action-copy
      source.** Add `apps/web/src/lib/action-copy.ts` exporting the handful of
      canonical action labels this audit surfaced (`Sign in`, `Save`, `Cancel`,
      `Discard`, `Delete`) as named constants. Update `OrgLogin.tsx` and
      `reset-password/page.tsx` (currently "Sign In") and `MagicLinkEmail.tsx`
      (currently "Sign in") to import the same constant, settling on sentence
      case since that's what the copy tone guide specifies for buttons. _Done
      when_ all three sign-in surfaces render identical copy from the shared
      constant, and `dg-grid-rebrand`-style copy tests (if any reference this
      text) still pass.

  No copy tests reference this text (`Button.test.tsx` and
  `error-handling.test.ts` use unrelated self-contained "Sign in" fixtures,
  untouched by this change). `page.tsx` (landing) and
  `accept-invite/page.tsx` also contain Title Case "Sign In" variants but
  were not in the spec's audited file list, so left as-is - out of scope for
  this step.

## Files / areas

- `apps/web/src/components/dashboard/CoverageBySectionCard.tsx`
- `apps/web/src/components/dashboard/expanded/ExpandedCoverage.tsx`
- `apps/web/src/components/staff/ProfileChangeRequestQueue.tsx`
- `apps/web/src/components/gridmaster/GridmasterSecurityView.tsx`
- `apps/web/src/components/ShiftRequestBoard.tsx`
- `apps/web/src/components/staff/MembersSection.tsx`
- `apps/web/src/lib/colors.ts` (`SHIFT_REQUEST_STATUS_COLORS`, likely removable
  once Step 1 lands)
- `apps/web/src/components/PermissionsEditor.tsx`
- `apps/web/src/components/dashboard/OpenShiftsCard.tsx`,
  `ActionQueueCard.tsx` (Step 3 spot-check)
- `apps/web/src/app/(app)/login/OrgLogin.tsx`
- `apps/web/src/app/(app)/reset-password/page.tsx`
- `apps/web/src/emails/auth/MagicLinkEmail.tsx`
- New: `apps/web/src/lib/action-copy.ts`

## Data / contracts

None - this feature only changes which component/constant a call site
imports, not any stored shape, API response, or schema.

## Testing

- Test runner is configured (Vitest); this feature is presentational
  consolidation, not new logic, so no new unit tests are expected beyond
  keeping existing ones green.
- Run `npm run test`, `npm run type-check`, `npm run lint` after each step.
- Manual/browser check per step: Step 1 - visually compare each of the six
  surfaces' status colors before/after (should be pixel-identical or
  intentionally corrected); Step 2 - Permissions editor toggle size next to
  a Settings toggle; Step 3 - the affected count displays; Step 4 - the three
  sign-in surfaces' copy.

## Notes for the AI

- This is a mechanical consolidation feature: preserve each surface's current
  visible tone/color/label unless the audit explicitly found the _values_
  disagree (not just the _mechanism_) - flag any such case for a decision
  rather than silently picking one.
- `StatusPill` is token-driven (`coding-standards.md`'s neutral-ramp/semantic
  token rules apply) - don't reintroduce raw hex colors while migrating a
  call site onto it.
- Read `blueprint/context/coding-standards.md`'s copy-tone section before
  finalizing Step 4's casing decision.
- Small, mechanical diffs - each step should be easy to review by direct
  before/after comparison, not a rewrite of the surrounding component.
