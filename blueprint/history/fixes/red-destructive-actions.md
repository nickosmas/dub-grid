# Fix: Red for every destructive action

**Type:** Fix
**Status:** verified
**Completed:** 2026-11-07

### The problem

The owner asked why Bulk Delete Entries in the Schedule Tools menu was red, given a
rule against red negative actions. They didn't remember that rule and wanted red for
every destructive item. The 2026-09-20 request-card rule had made Decline, Reject and
Cancel neutral, and some destructive controls had become neutral alongside them.

### The rule

- An action that deletes, removes, revokes, suspends, offboards, archives, ends a
  session or clears scheduled work is red: the control the person taps and its
  confirmation, on web and mobile.
- Not destructive, so not red: answering a request (Decline, Reject, Cancel), a
  form's Discard of unsaved edits (its confirmation is already red), clearing a
  filter or selection, archiving an alert, an Auto-build preview's Discard, and
  signing yourself out.
- One red per group (owner, 2026-11-07): when two destructive actions sit together,
  only the stronger is red and the other is secondary, as in the owner's reference
  Sessions card.
- Fill is emphasis, color is meaning, placement is context (owner, 2026-11-07). A
  destructive action outside a confirmation is a red outline (`dg-btn-danger`, which
  was a tinted fill); solid red is only the confirming action of a destructive
  decision. Written into `coding-standards.md`.

### What changed

Web:

- Discard on the draft banner, Revoke on pending invitations (People banner, staff
  page card, management panel, Gridmaster person), Sign out other devices, Offboard
  and Suspend in the People bulk bar.
- Suspend's confirmation, single and bulk, and the Archive confirmations in Settings
  (focus areas, shift categories, jobs, absence types, schedule note types, lists).
- Clear shifts when someone loses a focus area, and Approve on an account deletion
  request.
- Gridmaster: Remove from organization, Deactivate, Force logout, and End session,
  Forget device, Turn off push and Revoke calendar feed with their confirmations.

Mobile:

- Sign out other devices, Disable subscription (now an action row, not a navigation
  row), Suspend in the status sheet, Clear shifts, Save access when it removes all
  access, and Approve on an account deletion request.

Second round:

- Sessions on the Account tab is one row per action with a line saying what it does;
  Sign out other devices is secondary (also on mobile), Sign out everywhere red.
- The People bulk bar reds Offboard, or Suspend when Offboard isn't offered. On the
  Gridmaster person page Deactivate is secondary beside Terminate account; in the
  accounts table only Deactivate is red. Select all in Bulk Delete mode is secondary.
- The sign-out wording no longer repeats (owner, 2026-11-07): the rows read Other
  devices and All devices, each with a Sign out button, and the dialogs ask once
  ("Sign out all devices?") and confirm with Sign out. The mobile sheet's options
  read the same.
- Delete organization, Bulk Delete's Delete button and Approve on an account deletion
  request moved from solid red to the red outline.

### Verification

- Web type-check, lint and the 552 tests related to the changed files pass; mobile
  type-check and its 181 related tests pass.
- The second round's 165 related web tests, lint and both type-checks pass.
- Screenshots on a local dev server: the People bulk bar with Offboard as the only red
  outline, and the Sessions rows with only Sign out everywhere red. Mobile was not run
  on a device.
