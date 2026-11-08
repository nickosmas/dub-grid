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

### Verification

- Web type-check, lint and the 552 tests related to the changed files pass; mobile
  type-check and its 181 related tests pass.
- Screenshots on a local dev server: the People bulk bar's Offboard and the Account
  tab's Sign out other devices are red. Mobile was not run on a device.
