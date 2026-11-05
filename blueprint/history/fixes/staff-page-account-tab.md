# Fix: The staff page opens on Account and edits in place

**Type:** Fix
**Status:** verified
**Branch:** `feature/staff-account-tab`

## The problem

Someone's details lived behind Edit details, in a popup, while Overview held a mix of
schedule numbers and record cards. The owner asked for the staff page to open on a main
Account tab in edit mode, with Overview becoming part of Schedule.

## The fix

The owner's decisions on 2026-11-05, from the approved "Staff page and profile refresh"
canvas:

- Tabs are Account, Schedule, Requests and Activity, opening on Account.
- Account holds Details and Work as cards in edit mode, then Access and Record. An
  Unsaved changes bar appears only when there's something to save. Section titles sit in
  the card's header bar, never in a column beside it.
- Edit details and its popup are gone. Someone who can only view sees Work as text.
- Schedule now opens with the period's numbers and This week. Needs attention is gone,
  because the Requests tab already shows what's waiting, with a count.
- The month stepper shows only on tabs that cover a period.
- Old `?tab=overview` links open Schedule, and `?tab=access` opens Account.

Decisions made in the build:

- The Account tab stays mounted, so a draft survives a look at another tab.
- A persistent editor keeps its draft through a refetch of the same version, because an
  always-open form would otherwise lose typing to any background refresh.
- The Access card's Account label became Sign-in, beside the new Account tab.

## Not in this fix

- My profile follows in its own change.
- The app is unchanged.
