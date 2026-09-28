# Fix: Person page follow-ups from the item 43 audit

**Type:** Fix
**Status:** verified
**Fixes:** F-91, F-92, F-93, F-94, F-95, F-97, F-98, F-99

## The problem

The item 43 audit and its re-review of the person page fix (f6192d2b) left
eight small findings. One of them turned out worse than recorded.

| ID   | Problem                                                                                                                                                                                                                                  | Where                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| F-99 | Deleting the step-up rethrow in `StaffDetailPage` or the wrapper in `PeoplePageContent` passes every test                                                                                                                                | `components/staff-detail/StaffDetailPage.tsx`, `app/(app)/people/PeoplePageContent.tsx`                 |
| F-98 | The bulk deactivate or remove confirmation stays open under the step-up prompt, and a cancelled prompt is counted as updated                                                                                                             | `components/staff/MembersSection.tsx`, `PeoplePageContent.tsx`, `hooks/useEmployees.ts`                 |
| F-97 | A published schedule note change is stored as `{"type": "note", ...}` with no `kind`, and `scheduleStateLabel` throws `state.segments is not iterable` on it, so the schedule section answers 500 for anyone with one                    | `features/gridmaster/server/person-activity.ts`                                                         |
| F-91 | `refresh()` invalidates only the record key, so History, Notifications and Schedule keep old data after an action                                                                                                                        | `components/gridmaster/person/GridmasterPersonView.tsx:88`                                              |
| F-94 | A permission conflict toasts twice; staff search puts a name, email or phone in the URL; `withKnownJoinedDate` turns an unknown joined date into "Not joined"                                                                            | `PersonMembershipActions.tsx:215`, `features/gridmaster/client/api.ts:363`, `lib/staff-directory.ts:81` |
| F-93 | The schedule and history loaders read Test Sandbox staff, which the record refuses; the deactivate audit row takes an unchecked client `orgId`                                                                                           | `person-activity.ts`, `person-history.ts`, `app/api/gridmaster/users/route.ts:237`                      |
| F-92 | Every shift and profile change request is fetched and filtered in code; the history's `details->>targetUserId` branch has no index (a local plan with sequential scans off still scans `audit_log`); actor emails are one Auth call each | `person-activity.ts:80`, `person-history.ts:90`, `person-record.ts:124`                                 |
| F-95 | Six person page actions are never exercised in the view, no suite renders a real step-up dialog, and two routes lack a CSRF refusal test                                                                                                 | `__tests__/GridmasterPersonView.test.tsx`, the two-factor reset and security route tests                |

F-97 was `unverified` P3. A probe confirmed it (a note state throws) and the
local database holds two such rows, so it is recorded as `open` P2.

## The fix

- **F-99:** a `StaffDetailPage` test where the status call refuses with
  `STEP_UP_REQUIRED`, the prompt appears and the retry carries the assured
  token, and a `PeoplePageContent` test that deactivating reaches the prompt.
- **F-98:**
  - `handleRemoveEmployee` and `handleDeactivateEmployee` (and the staff
    profile's handlers) resolve `true` on success and `false` on a failure they
    already reported. The People page's wrapper resolves `false` on a cancelled
    prompt, so a bulk count only counts real updates.
  - `PeoplePageContent` tells `StaffView` when the status prompt is open, and
    `MembersSection` hides its bulk confirmation meanwhile, as every other
    step-up screen does (`&& !stepUp.dialog`).
- **F-97:** the person page labels a note publish change as its schedule
  note ("Schedule note: Readings") and any other state it cannot read as
  unknown, so one odd row never fails the section.
- **F-91:** `refresh()` invalidates `personAll`, which covers the record,
  history, notifications and schedule keys.
- **F-94:**
  - The permission save returns `false` after the conflict toast instead of
    rethrowing into a second toast.
  - Staff search moves to `POST /api/gridmaster/staff` with the query in the
    body (CSRF-checked, listed in the entry-point inventory); GET is removed.
  - `withKnownJoinedDate` keeps an unknown previous date unknown.
- **F-93:**
  - The schedule loader and the history's staff target refuse Test Sandbox
    staff (`workspace_kind = 'real'`); a user's history ignores their sandbox
    clones.
  - The deactivate audit row keeps `orgId` only when the person is a member of
    that organization, and is written with no organization otherwise.
- **F-92:**
  - Shift and profile change requests are bounded in the query (open, or
    created in the last 90 days), not in code.
  - Migration `066` (065 is F-100's, landing first) adds an expression index on `audit_log
((details->>'targetUserId'))` and a service-role-only function returning
    the emails of a list of user ids; `resolveActors` makes one call.
  - Checksum locked, `npm run db:migrations:check`. Production applies it
    through the usual scratch rehearsal before the next release PR merges.
- **F-95:** view tests for terminate with its reason, reinstate, password
  reset, forget device, turn off push and revoke feed; one test with a real
  step-up dialog showing that the action's confirmation hides; CSRF refusal
  tests on the two-factor reset and security routes.

Must not break:

- An organization admin's People page flow, single and bulk.
- The person record's refusal of Gridmaster targets and secrets.
- The history's one-entry-per-event rule and its cap.
- The shared `useStepUpAction` contract.

## Build steps

- [x] **1. Test the People page's step-up wiring (F-99).**
  - _Done when:_ the new tests fail with the `StaffDetailPage` rethrow removed
    or the `PeoplePageContent` wrapper bypassed, and pass as the code stands.
- [x] **2. Bulk status changes under step-up (F-98).**
  - _Done when:_ a `MembersSection` test shows the bulk confirmation hidden
    while the prompt is open; a test shows a cancelled prompt counted as not
    updated; admins' single and bulk tests pass unchanged.
- [x] **3. Schedule notes in the person page's schedule (F-97).**
  - _Done when:_ a loader test with a note publish change and an unreadable
    state returns labels instead of throwing.
- [x] **4. Refresh, conflict toast, search and joined date (F-91, F-94).**
  - _Done when:_ tests show `refresh()` refetches history after an action, a
    conflict toasts once, search sends no query string and the route refuses
    a cross-origin POST, and an unknown joined date stays unknown.
- [x] **5. Sandbox staff and the deactivate row (F-93).**
  - _Done when:_ loader tests refuse a sandbox staff record; a route test
    writes a deactivation with no organization when the person is not a member.
- [x] **6. Bounded reads and migration 066 (F-92).**
  - _Done when:_ `npm run db:migrations:check` passes; applied locally, the
    history query plans with the new index (sequential scans off); the actor
    lookup is one call in its test; request queries carry the bound.
  - `db:migrations:check` passes after rebasing onto F-100's `065` (bd41a900).
- [x] **7. Person page action tests (F-95).**
  - _Done when:_ the six actions, the real step-up dialog and both CSRF
    refusals are covered and pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run db:migrations:check`.
- **Gridmaster portal:**
  1. Open a person with a published schedule note change. Their Schedule
     section loads and lists it.
  2. Terminate them, then open History without reloading. The termination is
     listed.
  3. Search staff by email. The request URL carries no query.
- **People page, impersonating as a Gridmaster with a stale session:**
  1. Bulk deactivate two people. The confirmation hides while you confirm your
     identity, and both are updated.
  2. Repeat and cancel the prompt. Nobody is reported updated.

Release: migration 066 applied to production 2026-09-28 by the owner, ahead of
the release that carries it, after a scratch rehearsal from 065 whose
inspector report matched production's line for line (applied from
`19e2e61a`). Before: 65 ledger entries, only 066 missing; latest backup
2026-09-27 13:36:38 UTC. After: 66 ledger entries, none missing, every
invariant passing, health 200. On the rehearsal the partial index was present,
`gridmaster_user_emails` was SECURITY DEFINER and executable by `service_role`
only, and 065's staff-record revoke was unchanged.

## Findings

### person-page-follow-ups/F-82 [P3] closed - Month view misses a note filed under a person's secondary focus area

**File:** `apps/web/src/components/MonthView.tsx` (row building)
**Found:** 2026-09-26 by review of 42a
**Why it matters:** A general shift code is listed only under the person's primary focus area, so an indicator stored against another of their focus areas for that day never appears in the day popover. Rare: indicators are normally stored against the focus area the shift is in.
**Suggested fix:** Merge the person's marks from their other home focus areas into that row, deduplicated.
**Resolution:** Fixed: after building a day's rows, each person's first row also takes the notes filed under every focus area they have no row in that day, and those with no focus area, each note once (`MonthView.tsx`). A test lists a general-code person under their primary area with a note filed under their second area and a note filed under both; it fails against the previous code. Re-review (2026-09-28, `/audit` at 1924880c): closed. `MonthView.tsx:442-477` gives each person's first row, in focus-area order, the notes filed under every area they have no row in and those with no area, deduplicated; after 063 the note map still keys by employee, date and area, and a note on both shifts of a double shift collapses to one mark (`schedule-window.ts`), so nothing shows twice. Follow-ups are F-106.

### person-page-follow-ups/F-83 [P3] closed - Gridmaster realtime invalidation is not coalesced

**File:** `apps/web/src/hooks/useGridmasterRealtimeInvalidation.ts`
**Found:** 2026-09-26 by review of the findings batch
**Why it matters:** The platform-wide subscription invalidates on every row event with no debounce, so a bulk import or invitation batch in any organization restarts an open person page's (and the platform summaries') fetch once per row. Gridmaster-only, and the summaries already behaved this way.
**Suggested fix:** Coalesce invalidations per query key over a short window before refetching.
**Resolution:** Fixed in `fix/gridmaster-realtime-coalesce`: the Gridmaster subscription batches its invalidations by query key through the shared `createDebouncedTableFlusher` (150 ms, as the org hook), so each distinct key refetches and broadcasts once per burst, and a pending batch is dropped on teardown. Tests cover the burst, cross-table dedupe, the live subscription and teardown. Re-review (2026-09-28, `/audit` at 1924880c): closed. Every Gridmaster query key is strings and numbers (`orgHealth` and `orgAudit` map null to strings), so the JSON round trip is lossless; prefix invalidation, the reconnect path and the channel are unchanged; teardown disposes then unsubscribes, as the org hook does. Follow-ups are F-107.

### person-page-follow-ups/F-84 [P3] closed - No index serves an organization's schedule notes by date

**File:** `supabase/migrations/001_schema.sql` (`schedule_notes` indexes)
**Found:** 2026-09-27 by review of 42b
**Why it matters:** The web schedule and, since 42b, every mobile team schedule read notes by `org_id` and a date range, ordered by date; with only `(org_id)`, `(emp_id)`, `(emp_id, date)` and `(indicator_type_id)` indexes, that scans the organization's whole note history. Fine at today's sizes.
**Suggested fix:** A forward migration adding an index on `(org_id, date)`.
**Resolution:** Fixed: migration `062_schedule_notes_org_date_index.sql` adds `idx_schedule_notes_org_date` on `(org_id, date)` and drops the single-column `idx_schedule_notes_org` it covers; checksum locked and `db:migrations:check` passes. Applied locally, where a week's read for an organization now plans as an index scan on the new index. Applied to production 2026-09-27 by the owner after a scratch rehearsal from 061 and on the local stack. Before: 61 ledger entries, only 062 missing. After: 62 ledger entries, none missing, every invariant passing, health 200, and a final dry run up to date. Shipped in release #120. Re-review (2026-09-28, `/audit` at 1924880c): closed. `idx_schedule_notes_org_date` still leads with `org_id`, so the organization cascade stays indexed; 063 and 064 leave it alone; every range read (`lib/db/schedule.ts`, `data-access/src/mobile.ts`, `schedule-draft-safety.ts`, reports, settings config) filters `org_id` and a date range. Follow-up is F-108.

### person-page-follow-ups/F-85 [P2] closed - The Gridmaster history returns IP, email and session hashes, and the export writes them out

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:162`
**Found:** 2026-09-27 by `/audit` (scope: item 43, 54f5c12d..43327601; all lenses)
**Why it matters:** `withoutNetworkDetails` strips only the `ip_address` and `user_agent` columns. The person's own `security.auth.*` rows keep `sourceHash` (a hashed client IP), `targetHash` and `sessionHash` in `details`, which the history GET and both export routes return raw. The person record's rule is never to carry IP hashes.
**Suggested fix:** drop those three keys from `details` in `loadPersonHistory` (or allowlist details keys), with a merge test row that carries them.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: `withoutNetworkDetails` drops `sourceHash`, `targetHash` and `sessionHash` from every merged row's `details` (object-only guard), and both exports read the same rows; the merge test carries all three and gets none back.

### person-page-follow-ups/F-86 [P2] closed - Person notifications return the IP address and session id stored on new-device alerts

**File:** `apps/web/src/features/gridmaster/server/person-notifications.ts:37`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `security_new_device` writes an email-channel row whose `metadata` holds `ipAddress` (`events.ts:1080`) and `dedupe_key: "security_new_device:<session id>"` (`sender.ts:289`). The loader returns `metadata` verbatim to the Gridmaster page.
**Suggested fix:** allowlist the metadata keys the card needs (or drop `ipAddress` and `dedupe_key`), with a test using a new-device row.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: `safeMetadata` keeps an allowlist of seven display keys and returns null otherwise, so `ipAddress`, `dedupe_key` and any future key are dropped. The person page's card reads no metadata at all, so nothing it shows was lost.

### person-page-follow-ups/F-87 [P2] closed - Every impersonation appears twice in a person's history

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:116`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the account source drops `impersonation.started`/`.ended` about the person, but the staff source (`fetchEmployeeAuditRows` with every action) still matches them through `details->>targetUserId` in the target organization. Their numeric ids never collide with the string `impersonation-<id>` row, so both show, against the one-entry-per-event rule. The merge test gives the staff query no impersonation rows.
**Suggested fix:** apply the same drop (action in the pair and actor is not the person) to the merged rows in `loadPersonHistory`, with a merge test.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: the merge loop drops `impersonation.started`/`.ended` rows whose actor is not the person, from every source; the synthetic session row uses `impersonation.session` and is unaffected. The account source's own filter (line 117) is now redundant but harmless.

### person-page-follow-ups/F-88 [P2] closed - History, export, notifications and force logout do not refuse a Gridmaster target

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:186`; `person-notifications.ts:14`; `apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts:61`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the person record (`person-record.ts:323`) and every write through `loadPersonTarget` refuse a Gridmaster account, but these read another Gridmaster's whole audit history, export it, or read their inbox by id; force logout (older, but on the same page) acts on one too.
**Suggested fix:** return null for `platform_role = 'gridmaster'` in `loadPersonHistory`, use `loadPersonTarget` in the notifications and force-logout routes, and add a refusal test per route.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: `loadPersonHistory` returns null for a Gridmaster, for a user target and for a staff record linked to one, so history and both exports answer 404; the notifications route goes through `loadPersonTarget`. Force logout stays reachable for another Gridmaster on purpose (the Gridmaster accounts screen uses it); it is gated by fresh proof.

### person-page-follow-ups/F-89 [P2] closed - Deactivating or terminating an account leaves its refresh tokens alive for reactivation

**File:** `apps/web/src/app/api/gridmaster/users/route.ts:228`; `apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts:73`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** both call `revokeAllUserSessions` (a watermark plus the `user_sessions` rows) but not `endUserSessions`, so Supabase refresh tokens survive. The hook refuses them while the account is blocked, but after reactivation or reinstatement a device that was the reason for the block (a lost phone) can mint tokens again. Force logout already fixed this gap for itself.
**Suggested fix:** call `endUserSessions(userId)` on deactivate and terminate, with route tests.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: deactivate and terminate call `endUserSessions`, which revokes the tracked sessions and then deletes the provider sessions and refresh tokens through `end_user_auth_sessions`; route tests and the sensitive-action inventory pin it.

### person-page-follow-ups/F-90 [P2] closed - A two-factor reset that fails part way is neither recorded nor announced

**File:** `apps/web/src/features/gridmaster/server/two-factor-reset.ts:23`; `apps/web/src/app/api/gridmaster/users/[userId]/two-factor-reset/route.ts:55`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** if a later `deleteFactor`, the profile update or `endUserSessions` fails after some factors are gone, the route answers 500 before the `user.mfa_reset` row and the email; nothing records that factors were removed until someone retries, and a retry then records `factorsRemoved: 0`.
**Suggested fix:** return the running count from the helper and, in the route, record the reset (with `partial: true`) and send the notice whenever any factor was removed.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b: the helper counts removals and throws `PartialTwoFactorResetError` only after at least one factor is gone; the route then records `user.mfa_reset` with `partial: true` and schedules the notice before answering 500 with the original cause. A failure before any removal records nothing, as it should.

### person-page-follow-ups/F-91 [P3] closed - The person page's refresh misses its history, notifications and schedule sections

**File:** `apps/web/src/components/gridmaster/person/GridmasterPersonView.tsx:88`; `apps/web/src/lib/query-keys.ts:136`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `refresh()` invalidates `["gm","person",kind,id]`, which is not a prefix of the `history`, `notifications` or `activity` keys, so after an action (terminate, two-factor reset) an open History card keeps the old list for up to 30 seconds; the key comment claims otherwise. Realtime events do reach them through `personAll`.
**Suggested fix:** invalidate the three keys in `refresh()` (or nest them under the person key) and correct the comment.
**Resolution:** Fixed in fix/person-page-follow-ups (step 4): `refresh()` invalidates `personAll`, the prefix of the record, history, notifications and schedule keys. A view test shows force logout refetches the notifications; with the old record-only key it fails. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): `refresh()` invalidates `personAll`, the prefix of the record, history, notifications and schedule keys; inactive other-person caches are only marked stale. The view test refetches notifications after force logout.

### person-page-follow-ups/F-92 [P3] closed - Unbounded reads behind the person page

**File:** `apps/web/src/features/gridmaster/server/person-activity.ts:80`; `person-history.ts:90`; `person-record.ts:124`
**Found:** 2026-09-27 by `/audit` (scope: item 43; lens: performance)
**Why it matters:** every shift request and profile change request the person ever made is fetched and filtered to 90 days in code; the account history's `details->>targetUserId` branch has no index, so the `.or()` likely scans all of `audit_log` (unverified: no query plan taken); actor emails are one `auth.admin.getUserById` call each, twice per page.
**Suggested fix:** bound the request query in SQL (`status in (open, pending_approval)` or `created_at >= cutoff`); take a plan and add an expression index on `(details->>'targetUserId')` if it scans; resolve actors in one query.
**Resolution:** Fixed in fix/person-page-follow-ups (step 6): shift requests are bounded in the query (each side `and`-ed with open-or-last-90-days) and profile change requests likewise (`pending` or last 90 days), checked against local PostgREST; migration `066_person_history_target_index.sql` adds a partial expression index on `audit_log ((details->>'targetUserId'))`, with which a rolled-back local plan (sequential scans off) turns the history query into a bitmap OR over three indexes instead of a sequential scan, and a service-role-only `gridmaster_user_emails(uuid[])` (signed-in and anonymous callers refused) that `resolveActors` calls once, logging and returning no names if it is unavailable. `db:migrations:check` passes only once F-100's 065 is on dev; the branch rebases onto it before completing. Production applies 066 through the usual rehearsal before the next release PR merges. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): both request reads carry the bound in the query (checked against local PostgREST; the ids interpolated are the ones the unbounded query already used), `066`'s partial index turns the history OR into a bitmap OR over three indexes in a rolled-back plan, and `resolveActors` makes one service-role RPC and degrades to no names on error. Follow-ups: F-110 (the profile list's window is unlabelled), F-111 (no live test for 066), F-112 (index build lock).

### person-page-follow-ups/F-93 [P3] closed - Small inconsistencies on the person page's server side

**File:** `apps/web/src/features/gridmaster/server/person-activity.ts:223`; `person-history.ts:196`; `apps/web/src/app/api/gridmaster/users/route.ts:20`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** the staff schedule and history read Test Sandbox staff, which the staff record refuses (`person-record.ts:427`); the deactivate audit row writes a client-supplied, unchecked `orgId`, so it can land in an unrelated organization's activity.
**Suggested fix:** the same `workspace_kind = 'real'` check in both loaders; record deactivation with `org_id` null or check `orgId` against the target's memberships.
**Resolution:** Fixed in fix/person-page-follow-ups (step 5): `loadPersonSchedule` and `loadPersonHistory` read the staff record's `workspace_kind` and refuse a Test Sandbox record, and an account's history reads only its real staff records; the deactivate route looks up the membership and files the audit row under the sent organization only when the person belongs to it, otherwise under none. Loader and route tests cover each, and fail against the previous code. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): both loaders read the record's `workspace_kind` through the same `organizations!inner` embed `person-record.ts` uses and refuse or skip sandbox clones; the deactivate row keeps the sent organization only when a membership row exists.

### person-page-follow-ups/F-94 [P3] closed - Small client issues on the person page

**File:** `apps/web/src/components/gridmaster/person/PersonMembershipActions.tsx:215`; `apps/web/src/features/gridmaster/client/api.ts:363`; `apps/web/src/lib/staff-directory.ts:81`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** a permission conflict toasts twice (the action toasts and rethrows, `PermissionsEditor` toasts again); staff search sends a name, email or phone in the URL query, where request logs keep it; `withKnownJoinedDate` turns an unknown previous joined date into `null` ("Not joined") instead of leaving it unknown.
**Suggested fix:** return `false` after the conflict toast; send the search as a POST body; keep `undefined` when the previous date is unknown.
**Resolution:** Fixed in fix/person-page-follow-ups (step 4): a permission conflict toasts, reloads and resolves `false` instead of rethrowing into the editor's second toast; staff search is `POST /api/gridmaster/staff` with the query in a JSON body, CSRF-checked first and listed in the entry-point inventory, and GET is gone; `withKnownJoinedDate` keeps an unknown previous date `undefined`. Each change has a test that fails against the old code (conflict once, the route's five tests, the client transport, the unknown date). Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): the conflict path toasts, reloads and resolves `false`, which `PermissionsEditor` treats as a quiet stop; staff search is a CSRF-checked POST with a typed body and no GET remains; `withKnownJoinedDate` keeps `undefined`.

### person-page-follow-ups/F-95 [P3] closed - Test gaps on the person page's actions

**File:** `apps/web/src/__tests__/GridmasterPersonView.test.tsx`; the two-factor reset and security route tests
**Found:** 2026-09-27 by `/audit` (scope: item 43; lens: tests)
**Why it matters:** terminate with its reason, reinstate, password reset, forget device, turn off push and revoke feed are mocked but never exercised in the view; every suite mocks the step-up `dialog` as null, so "a confirmation hides while step-up shows" is untested; the two-factor reset and security routes have no CSRF refusal test.
**Suggested fix:** view tests for those actions, one with a non-null step-up dialog, and CSRF tests on the two routes.
**Resolution:** Fixed in fix/person-page-follow-ups (step 7): the view exercises terminate (a blank reason is refused, the trimmed reason is sent), reinstate, password reset, and forget device, turn off push and revoke feed through step-up; one test renders a step-up dialog and shows the force-logout confirmation hidden while it is open and back after (removing the hide fails it); the two-factor reset and security routes refuse a cross-origin request before authentication or any side effect (removing either CSRF check fails its test). Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): the six actions, a rendered step-up dialog hiding the force-logout confirmation, and both routes' CSRF refusals are tested, and each fails against the unguarded code.

### person-page-follow-ups/F-96 [P3] closed - Owner decisions left by item 43

**File:** `apps/web/src/components/gridmaster/person/PersonAccountCard.tsx:136`; `PersonMembershipActions.tsx:94`; `PersonStaffActions.tsx:87`; `blueprint/history/features/43e-combined-history.md`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** user agents are shown on terms and consent rows, as 43b chose, but 43e's archive says the record never carries them; removing someone from an organization and staff deactivate or remove need no fresh proof (as on the People page and in `organizations/access` DELETE) while role and permission changes on the same card do.
**Suggested fix:** decide whether user agents stay (then correct 43e's wording) or go; decide whether access removal needs fresh proof, server and client together.
**Resolution:** Closed 2026-09-28 by `/audit` of f6192d2b. (1) Terms and consent rows show `describeUserAgent` with the raw string in a `MaybeHint`; 43e's archive is corrected. (2) `DELETE /api/organizations/access` and the deactivate and remove actions of `POST /api/employees/status` call `requireSensitiveActionAuth` for a Gridmaster before any read or write of the target, and every other Gridmaster write route already did; admins take no new path. Screens: the person page and Users tab preflight the password; the People page and staff profile prompt on refusal through `useSharedStepUp`. Follow-ups are F-98 and F-99.

### person-page-follow-ups/F-97 [P2] closed - A published schedule note change fails the whole schedule section

**File:** `apps/web/src/lib/db/mappers.ts:479` (`normalizeScheduleCellState`), called by `person-activity.ts:53`
**Found:** 2026-09-27 by `/audit` (scope: item 43; all lenses)
**Why it matters:** `[...state.segments]` has no guard, so a `worked` state without `segments` (for example a publish change from before the snapshot model) would throw and answer 500 for the whole section.
**Suggested fix:** confirm with a count of `schedule_publish_changes` rows whose `from_state`/`to_state` lack `kind`, or are `worked` without `segments`; if any exist, label them defensively.
**Resolution:** Confirmed 2026-09-28 while speccing the follow-ups: publish changes for schedule notes store `{"type": "note", ...}` with no `kind`, and `scheduleStateLabel` on one throws `state.segments is not iterable` (probe run against `lib/db/mappers.ts`). The local database holds two such rows, so the section answers 500 for anyone with a published note change in the last 90 days. Raised to P2; repaired in fix/person-page-follow-ups. Fixed in step 3: `stateLabel` in `person-activity.ts` labels a note state as "Schedule note: <name>" and any state `scheduleStateLabel` cannot read as "Unknown", so one row never fails the section. A loader test with a note change and a malformed worked state passes, and fails against the previous code with the same error. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): `stateLabel` labels note states and falls back to "Unknown" for anything `scheduleStateLabel` throws on; the loader test with a note row fails against the old code.

### person-page-follow-ups/F-98 [P3] closed - A bulk status change leaves its confirmation open under the step-up prompt, and counts a cancel as success

**File:** `apps/web/src/components/staff/MembersSection.tsx:2698`; `apps/web/src/app/(app)/people/PeoplePageContent.tsx`
**Found:** 2026-09-28 by `/audit` (scope: f6192d2b; all lenses)
**Why it matters:** every other step-up screen hides its confirmation while the prompt shows (`&& !stepUp.dialog`), but the bulk deactivate or remove `ConfirmDialog` stays open (loading) while `PeoplePageContent` renders the step-up dialog, so two modal dialogs stack for an impersonating Gridmaster; unverified in a browser whether focus reaches the prompt. A cancelled prompt resolves each row quietly, so the bulk toast reports them updated (the handlers already swallow their own failures, so the count was loose before).
**Suggested fix:** hide the bulk confirmation while a status step-up is pending (expose `statusStepUp.dialog` state to `StaffView`, or close the confirm before awaiting), and have the handlers report success so the bulk count is real.
**Resolution:** Fixed in fix/person-page-follow-ups (step 2): the `useEmployees` and staff profile remove and deactivate handlers resolve `true` or `false`, the People page wrapper resolves `false` for a cancelled prompt or an unexpected failure, and the bulk count counts only `true` results. `PeoplePageContent` passes `statusStepUpOpen` through `StaffView`, and `MembersSection` hides the bulk confirmation while it is set. Tests cover the hide, a partial bulk count, and the wrapper's three outcomes; removing the hide or the count check fails its test. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): handlers resolve true or false, the wrapper resolves false for a cancel or unexpected error, the bulk count counts only true, and the bulk confirmation unmounts while `statusStepUpOpen` is set and returns afterwards with its note intact. The three sends per refused row are tracked separately as F-103.

### person-page-follow-ups/F-99 [P3] closed - The People page's step-up wiring has no test

**File:** `apps/web/src/components/staff-detail/StaffDetailPage.tsx:486`; `apps/web/src/app/(app)/people/PeoplePageContent.tsx`
**Found:** 2026-09-28 by `/audit` (scope: f6192d2b; lens: tests)
**Why it matters:** `useSharedStepUp` and the `useEmployees` rethrow are tested, but deleting the step-up rethrow from `StaffDetailPage`'s deactivate or remove handler, or dropping the wrapper in `PeoplePageContent`, would pass every test: the refusal would be toasted and the Gridmaster never prompted.
**Suggested fix:** a `StaffDetailPage` test where the status call refuses with `STEP_UP_REQUIRED`, the prompt appears, and the retry carries the assured token; one `PeoplePageContent` test that `onDeactivate` reaches the prompt.
**Resolution:** Fixed in fix/person-page-follow-ups (step 1): `StaffDetailPage.test.tsx` runs deactivate and remove against a refusing status call and expects one prompt and a retry carrying the assured token, and `PeoplePageContent.test.tsx` does the same for the list's handlers plus an admin's single unprompted call. Removing the page's rethrow fails 2 tests; handing `StaffView` the raw handler fails 1. Closed 2026-09-28 by `/audit` of fix/person-page-follow-ups (e859ba94 on bd41a900): `StaffDetailPage` and `PeoplePageContent` tests drive a refusal through a stand-in prompt and assert the retry token; removing the rethrow or the wrapper fails them.
