# Feature: iPhone Duo split view for Alerts and Profile

**From build-plan:** feature 59e
**Status:** verified
**Branch:** `feature/59e-duo-split-alerts-profile`

## Goal

Open, partly folded or held tall, the iPhone Duo shows Alerts beside what
the picked alert points to, and Profile beside the chosen setting. It reuses
59a's frame, 59c's shift page and day overview.

## Design reference

- The "DubGrid on iPhone Duo" canvas, rows "Alerts" and "Profile"
  (https://claude.ai/artifact/8z9jaKNm81HL28DHfmhSvd).

## In scope

- Alerts: the inbox's title, search and Mark all read above the list (the
  native bar spans both panes); the first alert until one is tapped; the
  pane shows a shift's page, a person's page or a day's overview with who
  works it, and anything else as the alert with a way to open where it
  leads (or that the web has it). Folding closed with a shift alert picked
  pushes the shift; other destinations would switch tabs, so the inbox stays.
- Profile: the settings list beside the chosen setting, Profile details until
  another is picked; the setting screens embed with their own title, the
  details editor keeps Discard and Save in the pane once something changed,
  and switching settings with unsaved edits asks first. Folding closed with a
  pick pushes that setting's page, which goes back into the split on opening.

## Out of scope

- This week on a person's page (59f).
- A request's own pane for request alerts: they open in Requests, as on a phone.

## Build steps

- [x] **Step 1 - Shared pieces** - `PaneTitle` and `useReturnToSplit` in
      `apps/mobile/src/shared/layout`. _Done when:_ the setting screens use them.
- [x] **Step 2 - Profile split** - selectable setting rows, embedded setting
      screens, the unsaved-edits guard, the fold rule. _Done when:_ verified on
      the iPhone Duo simulator (open, closed with Notifications picked).
- [x] **Step 3 - Alerts split** - in-pane header and search, `AlertPane`,
      the fold rule for shift alerts. _Done when:_ open and held tall show the
      first alert's destination and a picked schedule alert's day with its
      roster (verified on the simulator as an admin, dark).

## Testing

- Existing Profile, Alerts and People tests, with the split-only panes mocked.
- iPhone Duo simulator: Profile and Alerts open, Profile folded closed with a
  pick, Alerts held tall.
