# Feature: Explicit schedule-indicator removal

**From build-plan:** feature 20
**Status:** verified

## Goal

Make removing an active shift indicator obvious in the web shift slideover. An
active indicator must expose a separate, plainly named removal action instead
of requiring schedulers to infer that clicking the selected indicator removes
it.

## In scope

- Add an explicit removal affordance for active indicators in the single-shift
  indicator section.
- Apply the same interaction contract to indicators shown inline for split
  shifts, so removal remains discoverable in either slideover layout.
- Keep inactive indicator selection straightforward and preserve existing
  draft, save, publish, authorization, and audit behavior.
- Make the removal action keyboard accessible and self-descriptive to assistive
  technology.
- Add focused regressions for adding and removing indicators in both layouts.

## Out of scope

- Changing indicator storage, schedule APIs, permissions, audit records, draft
  semantics, or publish behavior.
- Redesigning indicator settings, the schedule grid dots, reports, or native
  mobile schedule details.
- Adding a confirmation dialog for this reversible draft edit.

## Build loop

Continuous Mode implements these steps serially, self-reviews each diff, runs
the complete verification gate, archives the result, and creates one local
`dev` commit. It does not push or deploy.

## Build steps

- [x] **Step 1 - Lock the explicit interaction contract** - extend the
      ShiftEditPanel test harness with indicator fixtures and callbacks, then
      assert that inactive indicators have an add action while active indicators
      expose a distinct `Remove <name> indicator` control. _Done when:_ the
      focused tests fail against the inferred toggle interaction and cover both
      single-shift and split-shift layouts.
- [x] **Step 2 - Render discoverable removal actions** - update both indicator
      renderers so active state is informational and removal uses a separate
      visible action, while inactive selection still calls the existing draft
      toggle callback. _Done when:_ mouse, keyboard, and accessible-name paths
      all call `onNoteToggle` with the correct indicator, active state, and focus
      area, with no nested interactive controls.
- [x] **Step 3 - Verify slideover behavior and regressions** - run focused panel
      tests, the complete project tests, type-check, lint, formatting, and build,
      then inspect the rendered slideover when runtime access is available.
      _Done when:_ existing schedule draft/save behavior remains green, the
      removal affordance is directly observable, and no P0 or P1 finding blocks
      completion.

## Files / areas

- `apps/web/src/components/ShiftEditPanel.tsx`
- `apps/web/src/__tests__/ShiftEditPanel.test.tsx`
- Existing `SchedulePageClient` note-draft state and schedule manage route are
  regression boundaries, not expected edit targets.

## Data / contracts

- `onNoteToggle(indicatorTypeId, active, focusAreaId)` remains the only mutation
  callback: add passes `true`, remove passes `false`.
- A published indicator removal continues to become `draft_deleted`; a newly
  drafted indicator removal continues to delete only that draft note.
- Indicator editing remains hidden without `canEditScheduleIndicators` and when
  the cell has no worked shift.
- Buttons use one-line, self-descriptive labels and the existing shared button
  primitive.

## Testing

- Focused ShiftEditPanel tests cover inactive add, active explicit removal,
  focus-area routing, and split-shift rendering.
- Existing schedule draft, manage-route, and panel suites protect persistence,
  authorization, audit, and save behavior.
- Final gates: `npm run test`, `npm run type-check`, `npm run lint`,
  `npm run format:check`, and `npm run build`.

## Notes for the AI

- Use sentence case and a visible `Remove` label; do not use an unlabeled icon
  or require users to understand selected-chip toggle behavior.
- Do not add a second mutation path or bypass the existing draft/publish flow.
- Keep the split-shift layout compact without truncating or wrapping button
  labels.

## Verification evidence

- Calm Haven runtime review showed an active indicator with a separate visible
  `Remove` action. Removing it exposed the `Add` action, and adding it back
  restored the `Remove` action. The temporary indicator and schedule note were
  removed after the check.
- Focused schedule panel and route coverage passed: 72 tests. The panel and
  typography contract coverage passed: 69 tests.
- The full project test gate passed, including 426 web test files and 3,647 web
  tests. Type-check, lint, formatting, and the production build also passed.
- The findings ledger has no open or fixed P0 or P1 finding blocking completion.
