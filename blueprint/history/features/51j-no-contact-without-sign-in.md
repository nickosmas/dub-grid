# Feature: No contact without sign-in

**From build-plan:** feature 51j (item 51, Staff statuses)
**Status:** verified

## Goal

Push notifications and alert emails reach only people who can still sign in
to the organization they're about. Someone Suspended, Offboarded, removed from
the organization by a Gridmaster, or whose DubGrid account a Gridmaster
deactivated or terminated gets none, whatever event raised them. A Suspended
person keeps the one email that says their access is suspended (51d, 51g3).
Bringing them back (Reinstate, Restore, reactivating the account) brings
delivery back with it: nothing is stored that has to be switched on again.

Today every alert goes out by push and, under the person's email preference,
by email, without asking whether its reader can still sign in. A Suspended
person's device tokens are switched off when they're suspended (51c), but an
Offboarded person keeps theirs, and email reaches everyone.

## Design reference

No board: nothing new is drawn. The rule is the JWT hook's, which decides who
can sign in (profiles `deactivated_at` and `terminated_at`, the membership's
`archived_at`, the employee's `status = 'removed'` and `suspended_at`).

## Decisions made (owner delegated, 2026-10-28)

- **One gate, in the dispatcher:** every alert, from every sender family
  (schedule changes and publish, requests, notes, membership, people, billing,
  invitations accepted or expired, security), goes through `sendNotification`,
  so the rule is applied there once, before push and email, rather than in
  each event. Reason: the brief's "filter once in the send path"; a new event
  can't forget it.
- **A server rule, no migration:** `contactChannels` (pure) and
  `loadContactFacts` (three reads in parallel) in
  `features/notifications/server/contact-eligibility.ts`. Reason: the
  dispatcher is the only caller, the hook stays verbatim, and no database
  change is needed to read four columns.
- **Who can be reached about an organization:** an account that isn't
  deactivated or terminated and either is a Gridmaster or has an active
  membership there, whose employee row there (if any) isn't Offboarded or
  Suspended. Away keeps access (51a), so Away people are reached as before.
  Reason: it mirrors the hook's refusals for that organization.
- **In-app alerts:** still created for someone Suspended, never pushed or
  emailed, so a reinstated person finds what happened (51d's "alerts still
  accrue"). Not created for someone Offboarded, removed from the organization
  or whose account is disabled. Reason: the inbox only shows an
  organization's alerts while signed in to it, so these would sit unread and,
  on Restore, show what happened while they were gone.
- **Security alerts follow the account, not the organization:** a new
  sign-in, two-factor change or ended session is about the DubGrid sign-in,
  which no organization owns, so it reaches anyone whose account isn't
  disabled, and a disabled account gets nothing. Reason: these warn the owner
  of the login; a suspension in one organization doesn't stop the login
  existing.
- **Kept outside the gate:** invitations (sent to people who don't have
  access yet by design), the suspension notice (the one email), the sign-in
  email change notice, the Gridmaster two-factor reset and impersonation
  notices, the account-deleted notice and the trial welcome. They are sent
  directly, not as alerts, and are each about access or the account itself.
- **If the check can't be read:** the in-app alert is still written, but
  nothing is pushed or emailed, and the failure is logged. Reason: a missed
  push is recoverable from the inbox; a message to someone who shouldn't get
  one isn't.
- **"You were removed from an organization":** that alert to the removed
  person goes away; the Super Admins' "Member removed" stays. Reason: the
  person can't sign in to read it, and its email named the actor, against the
  email voice rule. A notice email for offboarding, like suspension's, is not
  added here.
- **Organization-wide lockouts are out of scope:** an archived or Gridmaster
  suspended organization, and a billing lock (Super Admins must still hear
  about it to fix it), are unchanged.
- **Push tokens are left as they are:** a Suspended person's tokens are still
  switched off at suspension and come back when the app registers again after
  sign-in (51c). Offboarded people's tokens stay, unused, so a Restore pushes
  again at once.

## Build steps

- [x] **Step 1 - The rule.** `contact-eligibility.ts` with `contactChannels`
      and `loadContactFacts`. _Done when:_ unit tests cover active, Away,
      Suspended, Offboarded, no membership, deactivated, terminated,
      Gridmaster, an account-wide alert and a failed read.
- [x] **Step 2 - The dispatcher.** `sendNotification` reads the facts once
      and skips the in-app row, push and email per the rule; security alerts
      use the account rule. The removed person's "You were removed" alert is
      dropped from `membership_removed`. _Done when:_ sender tests cover each
      status for a schedule alert, a request alert, a billing alert and a
      security alert, and that Reinstate and Restore deliver again; the
      events test reflects the removed alert.
- [x] **Step 3 - Docs.** Alerts and People pages say who gets push and
      email; fingerprints refreshed. _Done when:_ `npm run docs:check` passes.

## Out of scope

- One Archive (51k).
- Organization archive, Gridmaster organization suspension and billing locks.
- Device token clean-up for Offboarded people.

## Testing

- Unit tests for the rule and the dispatcher (mocked Supabase).
- Final gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`.

## Notes for the AI

- Don't change the JWT hook or any migration.
- Never name the actor in an email.

## Completion evidence

- Gate in the worktree: `npm run type-check`, `npm run lint` (0 errors),
  `npm run docs:check` (34 verified), `npm run docs:links`; `npm run test:web`
  716 files, 6796 tests passed; `npm run test:mobile` passed every package and
  mobile (178 files, 1565 tests).
- Rule and dispatcher: `contact-eligibility.test.ts` (14) and the 51j block of
  `sender.email.test.ts` covering a schedule, request and billing alert for
  active, Away, Suspended, Offboarded, removed, deactivated and terminated
  people, Reinstate and Restore delivering again, security alerts and a
  Gridmaster.
- Live read on the local stack (temporary test, not committed):
  `loadContactFacts` against a Calm Haven member returned every channel for
  Calm Haven, none for an organization they don't belong to, and every
  channel for an account-wide alert.
- No migration. Not seen: a real push or email to a suspended person (no
  suspended or offboarded person in the local Calm Haven data, and
  suspending one would close the seeded requests). No UI changed, so no
  screenshots.
