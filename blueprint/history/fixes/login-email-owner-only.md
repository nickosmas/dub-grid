# Fix: Only the person can change the email they sign in with

**Type:** Fix
**Status:** verified
**Branch:** `fix/login-email-owner-only`

## The problem

A staff record's email is also the sign-in email, and anyone who could edit staff
could change it, on web and mobile. The change applied at once, with no confirmation
from the person, and no check of the editor's level or of other organizations. Whoever
sets that address can reset the password, so an Admin could take over a Super Admin's
sign-in, and one organization could take over a sign-in another organization relies on.
The sign-out and the notices to both addresses came after the change, with no undo, and
locked the real person out. Two-factor should stop the last step for people who use it.

## The fix

The owner's decision on 2026-11-05: the sign-in email belongs to the person.

- `/api/employees/manage` and the mobile person `PATCH` refuse a change to a linked
  person's email, whoever the editor is, with a field error. Older app builds get the
  same refusal.
- The web and mobile editors show it read-only, with "Only they can change this, on
  their own profile."
- My profile still changes it, with both addresses confirming, and every organization
  follows. Gridmaster's person page stays as the path for someone who lost their
  mailbox. Anyone without a sign-in stays editable.

This reverses the 2026-09-20 rule that a manager can change a linked person's email.
One email per person stands.

## Not in this fix

- Move to a new email, where an organization points its own record at a new address
  with a new invite, is the planned follow-up. Until it ships, a manager can't fix the
  email of someone who lost their mailbox, and it comes to support.
- `LoginEmailChangedEmail` keeps its "administrator" wording, which nothing reaches now.
  Remove it when Move settles what the notices say.
