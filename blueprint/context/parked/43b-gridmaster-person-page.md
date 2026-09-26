# Feature: Gridmaster person page: account and organizations

**From build-plan:** feature 43b
**Status:** in progress (built alongside the web sign-in fix, which holds
`current-feature.md` in another session)

## Goal

A Gridmaster supporting someone opens one page that holds everything about
that person and every action they need, in place of today's All Users
slide-over. The header says who they are and what state their account is in;
Account holds the sign-in record, profile, consent and the account-level
actions; one card per organization holds the full membership, the full staff
record and the complete invitation history with that organization's actions.
Staff who never got an account are found by a search across organizations.
Secrets are never shown: refresh, push, calendar and invitation tokens and IP
hashes appear, at most, as the fact that they exist and their dates.

## Decisions (made 2026-09-26)

- **Surface:** a portal view, like Organization detail, not a new route. The
  portal keeps its views in state; a person view opened from All Users (or
  from search) returns there with Back.
- **Gridmaster accounts** stay on the Gridmaster Accounts view: the person
  route refuses a Gridmaster target, as the All Users list excludes them.
- **Deliberately not shown:** IP addresses and IP hashes on terms and consent
  records (sessions and devices, where IPs live, are 43c); user agents are
  shown.
- **Login lock:** read-only in the header from the login limiter's remaining
  count; clearing it is 43c. Absent when Redis is not configured.
- **Account writes** (name, sign-in email) go through one new Gridmaster
  route that requires fresh proof and writes an audit row. Deactivate,
  terminate, reinstate, force logout and password reset keep their routes.
- **Organization actions** reuse the routes the People page and the
  organization Users and Invitations tabs already use (they take `orgId` and
  accept a Gridmaster), including their step-up.
- **Staff record edits** cover name, phone, employee number and contact notes
  (and email for an unlinked record); a linked record's email is the sign-in
  email and changes from Account.

## In scope

- `GET /api/gridmaster/users/[userId]` and `GET /api/gridmaster/staff/[employeeId]`
  (an unlinked record) return one `GridmasterPersonRecord`.
- The person view: header (identity, platform role, badges for deactivated,
  terminated, scheduled deletion, login lock and live impersonation, quick
  actions), Account, and one card per organization.
- Account actions: edit name, change sign-in email, deactivate or reactivate,
  terminate, reinstate; quick actions impersonate, force logout, password
  reset.
- Organization actions: change role, edit permissions, remove membership,
  staff status (active, inactive, removed), staff record edits, invitation
  resend and revoke, and a link to that organization's Employees tab.
- `GET /api/gridmaster/staff?q=` and a "Staff without an account" search on
  All Users.

## Out of scope

- Two-factor, factors, sessions, devices, push devices, calendar feeds, login
  lock clearing and the two-factor reset (43c).
- Schedules, requests and notifications (43d); the combined history (43e).
- Mobile (the Gridmaster portal is web-only).
- Deactivate's route still asks for no fresh proof; unchanged here and
  recorded as a finding.

## Build loop

Each step is implemented, verified and self-reviewed on `dev` from a
throwaway worktree, then committed as a local checkpoint and pushed.

## Build steps

- [x] **Step 1 - the person record** - `features/gridmaster/server/person-record.ts`
      builds `GridmasterPersonRecord` for a user (auth user, profile, terms
      acceptances, cookie consents, live impersonation, login lock, every
      membership including archived ones, every linked staff row, every
      invitation to the person's email or staff rows) or for an unlinked
      staff record, with the ids of actors resolved to emails. Two GET routes
      serve it to Gridmasters. _Done when:_ route tests show a non-Gridmaster
      is refused, a Gridmaster target is 404, secrets and IPs are absent from
      the response, archived memberships and accepted, revoked and expired
      invitations are present, and an unlinked record returns no account.
- [x] **Step 2 - the person view** - `components/gridmaster/person/` renders
      the header and Account; All Users opens it in place of the slide-over,
      which is removed with the memberships route it alone used; Back returns
      to All Users with its filters. Every account action moves with its
      step-up: impersonate, force logout and password reset in the header,
      deactivate or reactivate, terminate and reinstate on Account. _Done
      when:_ a view test shows each badge and Account field for a fixture
      record and the actions run through step-up; the separation test reads
      the new file.
- [x] **Step 3 - organization cards** - one card per organization: membership
      (role, permissions, management departments, joined, onboarding, tours,
      schedule last viewed, archived and by whom), staff record (every field,
      created and updated by), invitation history (sent, expires, accepted,
      revoked, by whom, derived state), and a link to that organization's
      Employees tab. _Done when:_ a view test shows each field for a linked
      person in two organizations and for an unlinked record.
- [x] **Step 4 - account actions** - `PATCH /api/gridmaster/users/[userId]`
      with `editName` and `changeEmail` (fresh proof, audit rows; the email
      change reuses `syncLinkedLoginEmail` and its follow-up); Account runs
      them through step-up. _Done when:_ route tests cover a stale session, a
      conflicting email, a Gridmaster target and each audit row; a view test
      shows a cancelled step-up changes nothing.
- [x] **Step 5 - membership actions** - change role and edit permissions
      (the guarded access helpers and `PermissionsEditor`), remove membership.
      _Done when:_ view tests show each action calls its helper with the
      card's organization and refreshes the record, and a cancel changes
      nothing.
- [x] **Step 6 - staff and invitation actions** - staff status, record edits
      (with the record's version), invitation resend and revoke (guarded).
      _Done when:_ view tests cover each action, a version conflict shows the
      conflict message, and resend on an expired invitation passes its id.
- [x] **Step 7 - staff without an account** - `GET /api/gridmaster/staff?q=`
      searches unlinked staff across organizations by name, email or phone
      (two characters or more, 25 results); All Users gains the search and a
      result opens the person view. _Done when:_ route tests cover the
      minimum length, the unlinked filter and a non-Gridmaster; a view test
      opens a result.

## Files / areas

- `apps/web/src/app/api/gridmaster/users/[userId]/route.ts` (new GET, PATCH),
  `app/api/gridmaster/staff/route.ts` and `staff/[employeeId]/route.ts` (new).
- `apps/web/src/features/gridmaster/server/person-record.ts` (new),
  `features/gridmaster/client/api.ts`, `lib/query-keys.ts`.
- `apps/web/src/components/gridmaster/person/*` (new),
  `components/gridmaster/AllUsersView.tsx`, `GridmasterPortal.tsx`.
- `apps/web/src/__tests__/GridmasterAllUsersSeparation.test.ts` and the
  sensitive-action inventory.

## Data / contracts

Load-bearing for 43c to 43e, which add sections to the same record and view:

```ts
interface GridmasterPersonRecord {
  account: null | {
    userId: string;
    email: string;
    createdAt: string;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
  };
  profile: null | {
    firstName: string | null;
    lastName: string | null;
    platformRole: string;
    mfaEnabled: boolean;
    termsVersion: string | null;
    termsAcceptedAt: string | null;
    scheduledDeletionAt: string | null;
    deactivationWarnedAt: string | null;
    deactivatedAt: string | null;
    deactivatedBy: string | null;
    terminatedAt: string | null;
    terminatedBy: string | null;
    terminatedReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  termsAcceptances: { version: string; acceptedAt: string; userAgent: string | null }[];
  cookieConsents: {
    version: string | null;
    consent: Record<string, boolean>;
    createdAt: string;
    userAgent: string | null;
  }[];
  liveImpersonation: null | {
    gridmasterId: string; // resolved through actors
    orgId: string;
    startedAt: string;
    expiresAt: string;
  };
  loginLock: null | { locked: boolean; resetsAt: string | null };
  organizations: {
    org: { id: string; name: string; slug: string | null };
    terminology: OrganizationTerminology; // the organization's own labels
    names: { departments; focusAreas; roles; certifications }; // id to name
    membership: GridmasterMembership | null; // every column, archived included
    employees: Employee[]; // every linked staff row there
    invitations: GridmasterInvitation[]; // every column except the token
  }[];
  actors: Record<string, string>; // user id to email
}
```

Actor columns carry ids; the view resolves them through `actors`.

## Testing

- Route tests for Steps 1, 4 and 7; view tests for Steps 2 to 7 in the
  pattern of `GridmasterAccountsView.test.tsx`.
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- Every Gridmaster route validates auth itself; writes need
  `requireSensitiveActionAuth`, and the inventory must classify new routes.
- Never select a token column: list columns explicitly.
- Organization terminology comes from each organization's settings.
- Confirmations are dialogs; operational dates use `dg-tabular-nums`.
- No em dashes.
