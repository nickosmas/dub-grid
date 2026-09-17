# Request sheet exits with friction or not at all

**Type:** Fix

**Status:** verified

## The problem

Closing the shift request sheet (drop, pick up, swap) on mobile is unreliable
and heavier than it should be. Four separate defects in
`apps/mobile/src/features/schedule/screens/ShiftDetailScreen.tsx` and the
shared `BottomSheetModal` combine into the reported "tapping X does nothing":

1. **One tap arms the discard question.** `hasUnsavedRequestInput` counts a
   single radio choice (`coverageRequestType`, an absence type, a segment, a
   targeted employee) as unsaved work, so the first tap inside the sheet turns
   X into "Discard this request?". Every one of those choices is one tap to
   redo.
2. **Discard tears both modals down in one commit.** The unsaved-changes guard
   is configured with `onDiscard: () => resetRequestMode(null)`, which also
   closes the sheet. `confirm()` runs `setPendingExit(null)` and `onDiscard()`
   together, so the confirmation `Modal` and the sheet `Modal` dismiss in the
   same React commit. `useModalHandoff` documents exactly this race: UIKit
   drops the second dismissal and the sheet stays on screen with a live
   backdrop.
3. **Failures are invisible.** `createRequestMutation.onError` pushes a toast,
   which renders in the root window behind the sheet's `Modal`. While the
   request is pending `dismissDisabled` also unmounts the close button and
   blocks the drag, so a slow or failed request leaves the user in a sheet
   with no feedback and, until it settles, no exit.
4. **A slidy tap on X becomes a drag.** The close button lives inside the
   sheet's pan `GestureDetector`, whose `activeOffsetY` is 8pt. A thumb tap
   that travels more than 8pt vertically activates the pan, which cancels the
   button press; the sheet wobbles and stays open.

## The fix

- Split discard from close: `onDiscard` resets the selections only and
  `onClose` sets `requestMode` to null, so the guard's handoff sequences the
  two modal transitions.
- Dirty means work the user cannot redo in one tap: a chosen swap target
  (`selectedTargetShift != null`). Nothing else arms the discard question.
- Show `createRequestMutation.error` as an `InlineError` inside the sheet
  footer; drop the error toast for that mutation. The success toast stays,
  since it fires after the sheet closes.
- `BottomSheetModal` keeps the close button mounted while a task sheet is
  `dismissDisabled`, at reduced opacity and `accessibilityState.disabled`; a
  `presentationKind="gate"` still hides it.
- Render the close button as a sibling of the pan `GestureDetector` (inside
  the translated sheet view, after the detector) so the pan can never claim
  its touch. Raise `DRAG_ACTIVATION_DISTANCE` to 12 and add
  `failOffsetX([-12, 12])` so horizontal slop on the header does not start a
  drag either.

Must not change: the drag-to-dismiss behaviour on the body and grabber, the
keyboard lift, the one-task-sheet rule, or any gate sheet (consent, terms,
app lock).

## Build steps

- [x] **1. Separate discard from close and tighten the dirty rule**
  - `resetRequestSelections()` resets every selection but not `requestMode`;
    `resetRequestMode(next)` calls it and then sets the mode.
  - `useUnsavedChangesGuard({ onDiscard: resetRequestSelections, onClose: () =>
setRequestMode(null), ... })`.
  - `hasUnsavedRequestInput = requestMode != null && selectedTargetShift != null`.
  - Tests in `ShiftDetailScreen.test.tsx`: choosing Drop shift → Call off →
    an absence type and tapping Dismiss closes without a confirmation; the
    existing swap-target discard test waits for the handoff before asserting
    the sheet is gone (fake timers).
  - Done when those tests pass and the existing sheet tests stay green.

- [x] **2. Show request failures inside the sheet**
  - Remove the `onError` toast from `createRequestMutation`; render
    `<InlineError message={getClientFriendlyErrorMessage(error, ...)}>` above
    the footer's `SheetActions` whenever `createRequestMutation.error` is set.
    Clear it when the mode changes (`reset()` in `resetRequestMode`).
  - Test: `useMutation` mocked with an `error` renders the message inside the
    sheet and no toast is pushed.
  - Done when the test passes.

- [x] **3. Keep the close button reachable and out of the drag gesture**
  - `BottomSheetModal`: close button rendered as a sibling after the
    `GestureDetector`, absolutely positioned as today; when `dismissDisabled`
    and `presentationKind !== "gate"` it stays mounted with
    `accessibilityState={{ disabled: true }}` and 40% opacity, and its press is
    a no-op; a gate hides it.
  - `useSheetDragToDismiss`: `DRAG_ACTIVATION_DISTANCE = 12`, add
    `.failOffsetX([-12, 12])`.
  - Tests: `BottomSheetModal.dismiss.test.tsx` covers the disabled-but-present
    close on a pending task sheet and the hidden close on a gate;
    `useSheetDragToDismiss.test.ts` asserts the pan's `activeOffsetY` and
    `failOffsetX` config.
  - Done when both suites pass and `type-check` is clean.

## Verify

- `npx vitest run src/features/schedule/screens/ShiftDetailScreen.test.tsx
src/shared/components/BottomSheetModal.dismiss.test.tsx
src/shared/hooks/useSheetDragToDismiss.test.ts --root apps/mobile`.
- On device: open any shift, tap Drop shift, pick Call off and an absence type,
  tap X: the sheet closes at once. Open Swap, pick a teammate's shift, tap X:
  the discard question appears; Discard closes the confirmation and then the
  sheet. Turn on airplane mode and submit: the error appears inside the sheet
  and X is still visible.
- Wrong looks like: a confirmation after a single tap, a sheet left open with
  a dimmed backdrop after Discard, or a spinner that stops with no message.

## Outcome

- Checkpoint `1cba1bd3` on `dev` (2026-09-17): `ShiftDetailScreen.tsx`,
  `BottomSheetModal.tsx`, `useSheetDragToDismiss.ts`, their tests, and the
  sheet rules in `apps/mobile/AGENTS.md`.
- Evidence: `ShiftDetailScreen.test.tsx` 33/33 (three new: single-tap close,
  choices forgotten on close, inline failure), `BottomSheetModal.dismiss` 3/3,
  `useSheetDragToDismiss` 17/17, full mobile suite 1127/1127, mobile
  `type-check` clean, repo-wide type-check and tests green in the pre-push hook.
- Device check (spec Verify section) pending an authenticated simulator
  session; do it on the next mobile pass together with the skeleton fix.
