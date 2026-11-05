# Fix: A manager can move someone who lost their mailbox to a new email

**Type:** Fix
**Status:** verified
**Branch:** `fix/move-to-new-email`

## The problem

fix/login-email-owner-only stopped managers changing a joined person's sign-in email,
which left no way to help someone who had lost that mailbox except support.

## The fix

The owner's decision on 2026-11-05: an organization can't change a sign-in, but it can
move its own staff record to a new address.

- **Move to a new email**, under the locked Email field in Edit details (web), asks for
  the new address and confirms the manager's identity.
- The record leaves the old sign-in and takes the new address. The old sign-in loses
  this organization only: its sessions pinned here end and its membership is archived,
  with no everywhere sign-out, because someone without their mailbox may not be able to
  reset a password to get back into their other organizations.
- An invite to the new address carries the same role, permissions and teams. Its email
  tells anyone already using DubGrid elsewhere to contact us to keep one sign-in. The
  old address gets a notice that never prints the new one.
- Only a Super Admin moves an Admin or Super Admin, since the invite gives that access
  to whoever opens the mailbox. The only Super Admin, the person themselves, Gridmaster
  accounts, someone Offboarded and someone not yet joined are refused.

## Limits

- Web only: the app keeps its note, and managers use the web page.
- There is no database transaction across the steps, to avoid a migration. A failed
  membership update puts the record back. A failed invite leaves the move in place and
  says so, with Send invite on their page.
- The moved person keeps a second sign-in until their other organizations move too, or
  support changes the original. A sign-in with no organization left stays unused.
