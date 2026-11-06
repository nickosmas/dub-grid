# Fix: Approving a deletion request stays inside the organization

**Type:** Fix
**Status:** verified
**Branch:** `fix/deletion-approval-one-org`

## The problem

One Super Admin approving a deletion request deleted the sign-in, which took the person
out of every organization, and the others weren't told.

## The fix

The same rule as the direct delete, from the owner's standing direction to make the most
logical choice: one organization can't end a sign-in another relies on.

- If no other organization uses the account, approval deletes it as before.
- If one does, the person is offboarded in the approving organization through the usual
  Offboard, with its guards and audit row, and the account stays. Someone already
  offboarded is left as they are.
- The queue's banner and the approval dialog say so, without naming anyone.

## Limits

- Offboard still signs them out on every device, as it does for anyone. They sign back
  in to their other organizations.
- Each organization approves its own part, so the account is deleted once the last one
  does.
- A Super Admin deleting their own account still leaves every organization. That's their
  own decision, and the dialog says so.
