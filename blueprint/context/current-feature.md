# Fix: Move to a new email on mobile

**Type:** Fix
**Status:** in progress
**Branch:** `fix/mobile-move-email`

## The problem

A staff member's email is their sign-in. Only the person or a Gridmaster
changes it directly; a manager whose staff member lost their mailbox uses
**Move to a new email**, which ends the old sign-in's access to this
organization and invites the new address at the same access role
(`POST /api/employees/move-email`, #349). The web offers it under a joined
person's locked email in Edit details (`MoveEmailDialog`). The app offers
nothing: the locked email only says to change it on their own profile, so a
manager on the phone has no way to move them (owner: "mobile should allow
moving email").

A person changing their own email already works on mobile (Profile > Work,
with step-up and the two-link confirmation), so this fix covers the manager's
move only.

## The fix

- **Server.** Move the web route's body into one shared function
  (`features/employees/server/move-email.ts`) that both the web route and a new
  mobile route call, so the rules can't drift:
  - fresh proof (`requireSensitiveActionAuth` on web,
    `requireMobileSensitiveActionAuth` on mobile);
  - the caller manages staff in the session's organization (mobile:
    `auth.permissions.canManageEmployees`, the organization from the token);
  - the same refusals: not joined yet, yourself, offboarded, changed
    elsewhere, the same email, a Gridmaster, an Admin moving an Admin or
    Super Admin, the only Super Admin, an email in use, invitations off;
  - the same rate limits, audit rows, moved-sign-in notice and invite.
- **Mobile route.** `POST /api/mobile/v1/people/[id]/move-email` with
  `{ email, expectedVersion }`, answering `{ person, invited }` with the
  person reloaded with their access (the pending invitation shows at once).
  Classified in `MOBILE_DELEGATES`.
- **Shared rule.** `canOfferMoveToNewEmail` moves to `@dubgrid/domain` so web
  and mobile decide who is offered the move the same way.
- **App.** Under the locked email in Edit, "Lost access to this email?" and a
  **Move them to a new one** link, when the rule allows. It opens a sheet with
  web's wording: title "Move {name} to a new email?", the same warning, a New
  email field, the three summary points and **Move and invite**. It runs
  through `useMobileStepUpAction` (unchanged). On success the cached person
  and the draft take the new email, and a toast says "Invite sent to
  {email}." or, if the invite didn't send, "They were moved, but the invite
  didn't send. Send it from their page."
- The note under someone else's sign-in email reads "They sign in with this
  email, so they'll need to change it from their profile." (PR #501's
  wording).

## Out of scope

- Changing the web flow, the step-up hook (another session owns it), or the
  self-service email change.

## Steps

- [ ] 1. Shared move function, web route on it, mobile route and contract, route tests and the boundary classification.
- [ ] 2. Shared `canOfferMoveToNewEmail` in `@dubgrid/domain`, with tests.
- [ ] 3. Mobile API client, the move sheet and the link in Edit, with screen tests.
- [ ] 4. Check on the iOS Simulator as `qa-super-admin@dubgrid.test`.

## Done when

- A manager who can change someone's email can move them on mobile with web's
  rules and wording, and is refused where web refuses.
- Route tests cover the mobile path (fresh proof, permission, refusals, the
  move itself); screen tests cover the link and the sheet.
- Seen working on the iOS Simulator with the QA Super Admin account.
