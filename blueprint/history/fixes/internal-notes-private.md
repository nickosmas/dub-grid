# Fix: Internal notes stay with the people who manage staff

**Type:** Fix
**Status:** verified
**Branch:** `fix/internal-notes-private`

## The problem

Internal notes are written about someone, for the people who manage them, but the web
and app self-profile responses sent a person's own notes back to them. The staff page
refresh hid them on screen; the response still carried them.

## The fix

- The web self-profile and phone-update responses, and the app's profile response, leave
  the notes out unless the person can manage staff.
- A manager keeps theirs: their editor saves the whole record, so a blank in the response
  would erase the notes on the next save.

Direct reads were already closed: migration 036 revoked SELECT on `employees` from
`authenticated`, and `contact_notes` has no column grant, so no migration was needed.
That was checked with `has_column_privilege` against the local database.

## Not in this fix

- The app's profile screen is unchanged. It only offers notes to people who manage staff.
