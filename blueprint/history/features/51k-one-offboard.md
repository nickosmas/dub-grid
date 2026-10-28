# Feature: One Offboard

**From build-plan:** feature 51k (item 51, Staff statuses; the plan's "One Archive")
**Status:** verified

## Goal

Offboarding someone ends their organization membership whoever does it, so
an Admin's Offboard, a Super Admin's, a Gridmaster's, the last-day job's and
a bulk Offboard all leave the same record: the employee row `removed`, the
membership archived, their sessions ended. Restore reopens the membership for
every actor alike, so the person can sign in again. Gridmaster's Remove from
organization leaves that same record too.

Today the membership is archived (and reopened on Restore) only when a Super
Admin or Gridmaster acts, and the job only when the planner was one; an
Admin's Offboard leaves a live membership, mobile never ends sessions, and a
Gridmaster's removal leaves the staff record Active. A claimed pickup is
expired on offboarding instead of going back up, as Suspend does.

## Design reference

No new board. The status dialogs, bulk bar and Gridmaster confirmations keep
their shape; only availability, one reason line and one confirmation's text
change.

## Decisions made (owner delegated, 2026-10-28)

- **Offboard always ends the membership:** web, mobile, bulk and the last-day
  job archive the membership and end sessions through one helper
  (`endOffboardedAccess`, no `endMembership` flag). Reason: the item's
  whole point; the JWT hook already refuses an offboarded person whatever
  their membership says, so ending it gives no actor a power they lacked.
- **Restore always reopens it:** restoring (from Offboarded only, not Mark
  active from Away) reopens their archived membership with the role it had,
  through one shared helper, on web and mobile. Reason: "Restore works the
  same after either".
- **Tier guard for Offboard and Restore (new):** offboarding (now or with
  a last day) or restoring a Super Admin takes a Super Admin or Gridmaster;
  an Admin who can manage staff reaches everyone else, Admins included.
  Server-enforced on web, mobile and bulk (`OFFBOARD_OUT_OF_REACH`, 403), and
  Change status and the bulk bar list those choices disabled with the
  reason. Reason: offboarding now ends a membership and Restore reopens one,
  so the rule follows who may give that tier (`canAssignOrgRole`: only a
  Super Admin or Gridmaster makes a Super Admin, while an Admin can invite
  Users and Admins). This reconciles the old "side door" gate: an Admin
  ends or reopens only memberships they could have granted.
- **Suspend and Away keep today's reach:** neither touches a membership, so
  the new guard doesn't apply to them. Reason: smallest change; extending it
  is a separate call.
- **Where the role is read:** the server reads the target's membership role
  whether or not it's archived. On web the client knows the role only for a
  live membership (the directory), so an Admin looking at an offboarded
  Super Admin sees Restore and gets the server's refusal. Reason: no new data path
  for one rare case.
- **The last-day job:** always ends the membership; the tier was checked when
  the last day was planned. Reason: 51g2's planner-tier condition was the
  stopgap 51k removes.
- **Gridmaster Remove from organization offboards the staff record:** after
  the membership is archived, a linked employee row that isn't Offboarded is
  offboarded through the same `applyStatusChange` (upcoming shifts come off
  in the draft, open requests close, an `employee.removed` row), and the
  confirmation says so. Reason: otherwise the person shows Active and on the
  schedule while unable to sign in, the mismatch this item removes; Restore
  then brings both back.
- **Data repair in migration 108:** memberships still live for an
  Offboarded employee (`employees.status = 'removed'`, linked user, unarchived
  membership in that organization) are archived, dated from the employee's
  `archived_at` (else `status_changed_at`), with no `archived_by`. Local
  count: 0. Reason: a migration runs once on every database, in order, and
  changes no access (the hook already refuses them). The opposite mismatch
  (membership archived, employee not Offboarded, from an earlier Gridmaster
  removal) is counted (0 locally) and left alone: offboarding them now would
  take shifts off a schedule nobody asked to change.
- **A claimed pickup goes back up on offboarding (migration 108):** the
  archive trigger reopens a pickup they claimed before expiring the rest,
  like 102 does for Suspend; Offboard's confirmation says so. Reason: 51d
  left this to 51k.
- **No offboarding notice email:** none is sent today and 51j dropped the
  removed person's alert. Reason: they can't sign in to act on it, and an
  email that names the change risks naming the actor; Suspend's notice exists
  because the person keeps their shifts and comes back.
- **Mobile ends sessions on Offboard:** the mobile route now runs the same
  helper as web (sessions revoked, membership archived, caches cleared).
  Reason: one record whoever offboards, wherever.

## Build steps

- [x] **Step 1 - Domain rule.** `canOffboardAtTier`, the out-of-reach code
      and messages, and a `canOffboard` option on `statusChoices`,
      `availableStatusChoices`, `suggestedStatusChoice`,
      `bulkStatusSkipReason` and `planBulkStatusChange`; Offboard's points
      say a claimed pickup goes back up. _Done when:_ domain tests.
- [x] **Step 2 - Web server.** `endOffboardedAccess` always ends the
      membership; `reopenRestoredAccess`; `applyStatusChange` applies the
      tier guard and uses both; the job drops its planner condition;
      `DELETE /api/organizations/access` offboards the staff record.
      _Done when:_ route, bulk, job and access tests.
- [x] **Step 3 - Mobile server.** `updateMobilePersonStatus` applies the tier
      guard, ends access on every Offboard and reopens it on every Restore;
      the mobile route wires the web helpers. _Done when:_ core and route
      tests.
- [x] **Step 4 - Migration 108.** Claimed pickups go back up on offboarding;
      the data repair. _Done when:_ applied locally, checksum locked, an
      integration test on the local stack.
- [x] **Step 5 - Surfaces.** Web staff page, panel and bulk bar pass
      `canOffboard`; mobile person sheet too; Gridmaster confirmations say
      the staff record is offboarded. _Done when:_ component tests;
      screenshots.
- [x] **Step 6 - Docs.** People pages say Offboard ends access whoever does
      it, the tier rule, and the claimed pickup; fingerprints refreshed.
      _Done when:_ `npm run docs:check` passes.

## Out of scope

- A tier rule for Suspend or Away.
- Showing an archived membership's role in the web directory.

## Testing

- Domain, route, core and component tests; a local-stack integration test
  for 108.
- Final gate: `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, `npm run docs:check`, `npm run db:migrations:check`.

## Notes for the AI

- Code keeps `removed` and `archive`; copy says Offboard.
- Never name the actor in an email.

## Completion evidence

- Gate in the worktree: `npm run type-check` passed; `npm run lint` 0 errors
  (2 existing `<img>` warnings); `npm run test:web` 717 files, 6808 tests
  passed; `npm run test:mobile` passed every package and mobile (178 files,
  1566 tests); `npm run docs:check` 34 verified; `npm run
db:migrations:check` passed with 108 locked.
- Rule and routes: domain tests for `canOffboardAtTier`, `statusChoices`
  and the bulk skip; the status route's 51k block (an Admin offboards and
  restores a User and offboards an Admin, membership archived and reopened;
  refused 403 for a Super Admin with nothing written); bulk (an Admin's
  Offboard reaches a User and an Admin, skips a Super Admin; Restore reopens;
  `offboardRemovedMember` offboards a removed member's live record only);
  the job ends the membership whoever planned it; `DELETE
/api/organizations/access` offboards after the membership; the mobile
  core and route tests; the sensitive-action boundary assertions.
- Migration 108 applied to the local stack (repair updated 0 rows; 0
  offboarded employees with a live membership and 0 of the opposite mismatch
  locally) and `migration-108-one-offboard.integration.test.ts` (3) passes,
  with 099, 100, 102, 104 and 106's integration tests still passing.
- Live, from the worktree dev server: `qa-admin` POSTing an Offboard of a
  Calm Haven Super Admin got 403 "Only a Super Admin can offboard a Super
  Admin." and the row was unchanged.
- Screenshots: an Admin's Change status for a Super Admin (Offboarded
  disabled with the reason), a Super Admin's Offboard confirmation (claimed
  pickups point), Gridmaster's Remove from organization confirmation.
- Not verified live: an Offboard and Restore that actually archive and reopen
  a membership on the local stack (no throwaway person to offboard; covered
  by route tests), and the mobile sheet on a simulator (component test only).
