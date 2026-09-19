# 38c. Request flows without friction

**Type:** Feature

**Status:** verified

**Build plan:** 38c, fourth sub-feature of 38 to build. Depends on the A2
hotfix (request-sheet exit) and 38a.

## Goal

Make drop, pickup and swap feel like two taps, and give the swap browser the
room it needs. Decisions (2026-09-17): the swap target picker opens as a
**full-page sheet** (the iOS card-style modal that slides up and dismisses
with a downward swipe), not a pushed route; the confirmation popup stays for
call-off only; the Requests tab shares the dashboard's request-type badge.

## Scope

In:

- `FullPageSheet`, a shared primitive on React Native's `Modal` with
  `presentationStyle="pageSheet"` (iOS card sheet with native swipe-down;
  full-screen slide on Android), a header with the title and a Close button,
  a scrolling body and a pinned footer. Registers as a task `sheet` with the
  presentation tracker so the one-task-sheet rule still holds.
- `ShiftDetailScreen`: `requestMode === "swap"` renders inside
  `FullPageSheet`; `coverage` (drop and pickup) stays in `BottomSheetModal`.
  The same unsaved-changes guard covers both (a chosen swap target still asks
  before discarding).
- Confirmation only for call-off: the swap footer's Submit sends the request
  directly, as does a targeted pickup's; `confirmCoverageRequest("calloff")`
  keeps its popup. The `pendingConfirmation` descriptor shrinks to that case.
- Request-type badges: `REQUEST_TYPE_LABEL`/`REQUEST_TYPE_TONE` move to
  `features/shift-requests/lib/request-type.ts`; the dashboard imports them
  from there and the Requests tab's card header shows a `CountBadge` with the
  same label and tone in place of its "Swap request" meta text.

Out: extracting the swap browser's queries into their own screen (the sheet
keeps the shift detail's data), per-item highlighting on Requests.

## Build steps

- [x] **1. `FullPageSheet` primitive**
  - `src/shared/components/FullPageSheet.tsx` plus a test covering Close,
    Android back (`onRequestClose`) and the presentation registration.
  - Done when the test passes.

- [x] **2. Swap in the full-page sheet, call-off-only confirmation**
  - `ShiftDetailScreen` renders swap mode in `FullPageSheet`; swap and pickup
    submit directly; call-off keeps its confirmation.
  - Tests: the existing swap/pickup confirmation tests become direct-submit
    tests; the call-off confirmation test stays; the discard-guard tests
    still pass against the new surface.
  - Done when `ShiftDetailScreen.test.tsx` passes.

- [x] **3. Shared request-type badge**
  - `lib/request-type.ts`; dashboard imports; Requests card header badge.
  - Tests: RequestsScreen shows the badge label for each type.
  - Done when the Requests and dashboard suites, `type-check` and lint pass.

## Verify

- `npm run test:mobile`, mobile `type-check`, `npm run lint`.
- Simulator: open one of your shifts, tap Swap: a card sheet slides up with
  the week strip and eligible teammates; swipe it down to dismiss; pick a
  teammate and tap Submit: the request sends with no second popup. Tap Drop
  shift, Pick up, a teammate, Submit: sends at once. Tap Drop shift, Call off,
  an absence type, Submit: the confirmation appears. Requests tab: each card
  shows a Pickup/Swap/Time off badge matching Home.

## Outcome

- Checkpoint `0b5412f8` on `dev` (2026-09-17), 10 files: `FullPageSheet`
  - test, `ShiftDetailScreen` + test, `shift-requests/lib/request-type.ts`,
    `ActionQueueCard`, `RequestsScreen` + styles + test, `apps/mobile/AGENTS.md`.
- Evidence: `FullPageSheet` 3/3, `ShiftDetailScreen` 33/33 (swap and pickup
  now assert direct submission, call-off still asserts its confirmation, the
  three discard-guard tests exit through the full-page sheet's Close),
  `RequestsScreen` 22/22 (badge assertion), full mobile suite 140 files /
  1136 tests, mobile `type-check` and lint clean, repo-wide type-check and
  tests green in the pre-push hook.
- Deliberately kept: the swap browser's queries and derived state stay in
  `ShiftDetailScreen`; only its presentation moved. Extracting them into a
  screen of their own is a later refactor if the sheet ever needs to open
  from somewhere other than a shift.
- Device check pending: the iOS card-sheet swipe-down, and the re-present
  after a vetoed swipe, are native behaviours the test stub cannot exercise.
