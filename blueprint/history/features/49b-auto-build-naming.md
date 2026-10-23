# Feature: Auto-build naming

**From build-plan:** feature 49b (parent 49, Schedule Builder refinements)
**Status:** verified
**Branch:** `feature/49b-auto-build-naming` (cut from `dev` at d63fb51f)

## Goal

The Schedule Builder's top part reads as an auto builder, says plainly how it
works, and the toolbar button stops looking like an alarm.

## Decisions (owner, 2026-10-23)

- Section title **Auto-build**, the scope on one line, and a short plain
  description always shown under the title (the owner first chose an info
  button, then asked for the description to stay visible and simple).
- **Generate schedule**, then **Apply** or **Discard**. "Nothing to build"
  became "Nothing to fill"; the report headline says "Applied N changes";
  the Applied line says "Auto-build: N changes".
- Toolbar button: a calendar-check icon, the normal button color, no count.

## Build steps

- [x] **Step 1 - Section** - title, description, buttons and messages.
      _Done when:_ panel tests use the new names.
- [x] **Step 2 - Toolbar** - calendar icon, no badge, no danger color; the
      unused `coverageGapCount` prop is gone.
      _Done when:_ a toolbar test checks the icon and the plain label.
- [x] **Step 3 - Docs** - the guides say Auto-build, Generate schedule,
      Apply and Discard; the recurring schedules guide links to
      `#auto-build`.
      _Done when:_ `docs:check:closed` passes.

## Outcome (2026-10-23)

- Description: "Fills open shifts with qualified staff who are free. Starts
  from recurring schedules, keeps everyone within 40 hours a week when it
  can, and shares weekends and nights fairly. Never moves anyone already
  scheduled." It is shown before generating; 49c to 49f update it as their
  rules land.
- **Evidence:** web 306 tests across the toolbar, panel, schedule and
  coverage-check suites; type-check and lint clean; `docs:check:closed` 34
  verified. Browser at 1440 wide, Calm Haven with a temporary requirement
  (removed): the button showed the calendar icon in the neutral text color
  with no count; the section read as above; Generate schedule gave Discard
  and Apply, and Discard went back to the start.
