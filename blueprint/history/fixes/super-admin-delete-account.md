# Fix: A Super Admin can delete someone's account

**Type:** Fix
**Status:** verified
**Branch:** `feature/super-admin-delete-account`

## The problem

A Super Admin could delete someone's account only by approving their request, so a
departed staff member's sign-in stayed unless they asked.

## The fix

The owner's decisions on 2026-11-05, after research into how HR and scheduling products
handle this:

- Delete account sits last on someone's Account tab, for a Super Admin.
- It unlocks only once they're Offboarded, the reversible step.
- It's refused for an account also used in another organization, without naming it, since
  deleting would reach past this organization.
- The Super Admin types `DELETE ACCOUNT` and confirms their identity.
- Deleting removes the sign-in only. The staff record, shifts and history stay, and an
  email tells them.
- Staff keep Request account deletion. Employer-controlled deletion matches BambooHR.

## Found along the way

The only-Super-Admin guard in `deleteUserAccountWithCleanup` read archived memberships,
so deleting an Offboarded Super Admin's account would have failed for a sole remaining
Super Admin. It now reads open memberships only, as the self-delete route already did.

## Not in this fix

- Approving someone's own request still deletes across every organization.
- The app is unchanged: this is web only.
