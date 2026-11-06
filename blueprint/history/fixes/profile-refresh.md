# Fix: My profile opens on Account, with Delete account last

**Type:** Fix
**Status:** verified
**Branch:** `feature/profile-refresh`

## The problem

My profile opened on Overview, repeated the page header inside Account, kept Save in a
card of its own, and put Delete account in the middle of the page, above Sign-in and
security.

## The fix

The owner's decisions on 2026-11-05, from the approved "Staff page and profile refresh"
canvas:

- Tabs are Account and Schedule, opening on Account. Someone not on the schedule has
  Account alone. Old overview links open Schedule.
- Account runs Your details, Work, Access, the record, Sign-in and security, Alerts, Data
  and privacy, and Delete account last. Each section is one card with its title in the
  header bar.
- Schedule opens with the last 12 weeks' numbers and This week.
- The repeated header and Edit details are gone, and Save became the Unsaved changes bar,
  which stays in view over the whole tab.
- Staff ask for a name change from a button and a dialog, instead of a form on the page.
- The status card shows only when there's something to say: not for someone Active with
  nothing planned.

Decisions made in the build:

- Someone who can't edit their own record sees Work as text, without Internal notes,
  which are written for the people who manage them. The API still returns the notes to
  that person; hiding them there is a separate change.
- Deletion moved to its own cards, `RequestDeletionCard` and `DeleteAccountCard`, so the
  page can place them last.

## Not in this fix

- The app is unchanged.
- Super Admins deleting someone else's account follows in its own change.
