# Runtime resilience: webhook retries, mobile deep links, schedule paging, realtime catch-up

**Type:** Fix

**Status:** verified

**Fixes:** F-11, F-12, F-13, F-14, F-21, F-22

## The problem

Four P1 findings from the 2026-09-21 audit are self-contained runtime
defects that need no product decision, plus two follow-ups the 2026-09-22
re-review recorded against migration 033.

- **F-14, Stripe webhook retries.** `apps/web/src/app/api/stripe/webhook/route.ts`
  inserts the event id into `stripe_processed_events` before doing the
  work, then returns 500 on a failure. Stripe retries, the insert hits the
  unique key, and the retry is acknowledged as a duplicate without ever
  applying the update.
- **F-13, signed-out notification links.** The tab layout guards its
  screens with `useTabsGate`, which redirects a signed-out user to login.
  The routes mounted outside the tabs in `apps/mobile/app/_layout.tsx`
  (`alerts/index`, `alerts/[id]`, `shift/[employeeId]/[date]`,
  `person/[id]`) have no gate, so a notification deep link opened without a
  session sits on a loading state forever. Reproduced on Android.
- **F-11, mobile schedule truncation.** `fetchScheduleCellQueryRows` in
  `packages/data-access/src/mobile.ts` issues one unpaged query while
  `supabase/config.toml` caps responses at 1,000 rows. A large organization
  or a long range silently loses cells, and every consumer (schedule,
  coverage, staffing, dashboard) computes on the truncated set. The people
  query in the same file already pages with `.range`.
- **F-12, mobile realtime catch-up.** `packages/realtime-core/src/postgres-changes.ts`
  fires `onReconnectAfterError` only after a `CHANNEL_ERROR`, never after
  `TIMED_OUT`, and the mobile hook in
  `apps/mobile/src/shared/hooks/useMobileRealtimeInvalidation.ts` answers a
  recovery by invalidating bootstrap alone. Events missed during the gap
  leave schedule, requests and dashboard data stale until something else
  refetches.
- **F-21.** Migration 033 regranted `terms_accepted_at` and `terms_version`
  to members although only the service role writes them, so an admin can
  forge a colleague's consent record through the data API.
- **F-22.** The F-06 live test proves a member cannot delete a session row
  by throwing an error whose text matches the expected pattern.

## The fix

- **F-14:** keep the claim-first insert (it is what makes concurrent
  deliveries safe) but release it when the work fails: the `catch` deletes
  the `stripe_processed_events` row for that event id before returning 500,
  so Stripe's redelivery is processed. A route test drives a failing
  handler, then the same event again, and asserts the second delivery does
  the work.
- **F-13:** a small `ProtectedRoute` wrapper in
  `apps/mobile/src/features/auth/components/` that runs the same session
  and organization checks as `useTabsGate` and, when signed out, redirects
  to `/(auth)/login?next=<current path>`; the login screen honours `next`
  after a successful sign-in and falls back to the tabs. The four
  out-of-tab routes render through it. Tests: the wrapper redirects with
  the encoded destination, renders children with a session, and the login
  screen navigates to `next` once.
- **F-11:** `fetchScheduleCellQueryRows` pages with `.range` in
  deterministic order (`date`, `emp_id`, `id`) until a short page, reusing
  the shape of the people pager; page size 500 to stay under the cap with
  the nested snapshot rows. A unit test feeds three fake pages and asserts
  the concatenation and the ranges requested.
- **F-12:** `realtime-core` remembers an interruption from either
  `CHANNEL_ERROR` or `TIMED_OUT` and fires `onReconnectAfterError` on the
  next `SUBSCRIBED`; the mobile hook's recovery handler invalidates every
  data family in `ORG_FILTER_TABLES` through the existing
  `invalidateMobileRealtimeQueries`, then bootstrap. Tests: a
  `TIMED_OUT` then `SUBSCRIBED` sequence triggers the hook once; the mobile
  hook invalidates each family on recovery.
- **F-21:** migration `034_terms_columns_server_owned.sql` regrants
  `UPDATE (first_name, last_name, updated_at, version)` on `profiles` after
  revoking the table privilege again, so the terms columns leave the
  member-writable set; the F-05 live test gains the refusal.
- **F-22:** the delete branch asserts `rowCount === 0` and a superuser
  re-read finds the row, without `expectRaise`.

Must not break: normal webhook processing and duplicate acknowledgement,
signed-in deep links, the people pager, web realtime (which shares
`realtime-core`), terms acceptance through the account route, and the seed.

## Build steps

- [x] **1. Webhook claim released on failure (F-14)** - the `catch` hunk and
      a route test for failure then redelivery. Done when the test shows the
      second delivery applying the update and the duplicate test still
      passes.
- [x] **2. Gated deep links (F-13)** - `ProtectedRoute`, the four routes
      wrapped, `next` honoured by the login screen, tests for the wrapper and
      the login redirect. Done when the mobile suite passes and a signed-out
      `dubgridmobile://alerts/<id>` on the simulator lands on login and then
      on that alert.
- [x] **3. Paged mobile schedule (F-11)** - the pager in
      `fetchScheduleCellQueryRows` and its unit test. Done when the test
      passes and `packages/data-access` type-checks.
- [x] **4. Realtime catch-up (F-12)** - the `TIMED_OUT` tracking in
      `realtime-core`, the mobile recovery handler, tests for both. Done when
      `packages/realtime-core` and the mobile suite pass and the web
      org-freshness hook tests are unchanged and green.
- [x] **5. Terms columns and the delete assertion (F-21, F-22)** - migration
      034 with checksum, the extended F-05 live case, the rewritten F-06
      delete assertion. Done when `db:migrations:check`, a clean local reset
      and the live test pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, `npm run test:mobile`
  and the live integration tests from a worktree; a clean `supabase db reset`.
- Simulator: signed out, open `dubgridmobile://alerts/<seeded id>`, sign in,
  land on that alert; signed in, open the same link directly.
- Browser or API: replay a Stripe test event against the local webhook with
  a forced handler failure, then redeliver it and confirm the subscription
  row updates.
- `/audit` afterwards to move the six findings from `fixed` to `closed`.

## Out of scope: the four P1s that need a decision first

| Finding                       | Decision needed                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-07 MFA on ordinary reads    | Should an MFA-enrolled account be refused at AAL1 on every web read and database policy, or only on sensitive actions as today? Enforcing at the policy layer needs an `aal` claim check in `caller_org_id`.                |
| F-08 employee contact columns | Every client employee query moves behind a view or RPC that drops `phone`, `email`, `contact_notes` and `status_note` for viewers without the permission. Which surfaces may keep contact fields for regular staff, if any? |
| F-09 draft visibility         | Draft snapshots become editor-only at the policy layer, and the schedule broadcast needs a published-only projection for viewers. Confirm regular staff should never see unpublished cells, including their own.            |
| F-10 schedule broadcasts      | Broadcasting committed server echoes with version checks and reconciliation after failed writes is a rework of the collaboration layer in `SchedulePageClient.tsx`; it deserves its own feature-sized spec.                 |

## Findings

### runtime-resilience-webhook-deeplinks-paging-realtime/F-01 [P0] closed - Sandbox-scoped requests can operate on a different organization

**File:** apps/web/src/lib/audit/authorize.ts:28; apps/web/src/app/api/import/employees/route.ts:96; apps/web/src/app/api/shifts/publish/route.ts:68; apps/web/src/app/api/shifts/discard/route.ts:63
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Several service-role routes authorize the effective Test Sandbox organization but then use the request's original organization ID for reads or writes. This breaks the sandbox tenant boundary for imports, schedule changes, reports, exports, audit records, and publish history.
**Suggested fix:** Propagate only the effective organization ID returned by authorization through every downstream service call. Add cross-tenant regression coverage for each service-role route.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 1). Every `requireOrgPermissions` caller now binds the organization from the result: import, publish, discard, both reports routes, recent publish history, bootstrap, billing and the three Stripe routes; `authorizeAuditLogRead` returns the effective id and both audit-log routes filter by it. `effective-organization-boundaries.test.ts` scans every route and fails on any later use of the requested id; sandbox-redirect tests cover import, publish, discard and the full audit log. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): every `requireOrgPermissions` caller in `apps/web/src/app/api` and the audit-log reader was re-read; each binds reads, writes and audit rows to the returned `orgId`, the only remaining uses of the requested id are on logging lines, and `effective-organization-boundaries.test.ts` was shown to fail when one repair is reverted. `stripe/checkout-complete` now hands the effective id to `syncCheckoutSessionToDb`, whose metadata check refuses a sandbox caller (fail closed); see F-20 for the consistency follow-up.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-02 [P0] closed - Schedule child records can reference a cell in another organization

**File:** supabase/migrations/001_schema.sql:1170; supabase/migrations/003_rls_policies.sql:605; supabase/migrations/002_functions_triggers.sql:8230
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The authenticated schedule-child policy verifies the child's organization but not that its parent cell belongs to that organization. A mismatched child can affect another organization's canonical schedule read.
**Suggested fix:** Enforce organization consistency at the database relationship and write-policy layers, then defend reads against mismatched child rows. Test direct PostgREST writes with mismatched parent and child tenants.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 2). Migration 032 refuses to run over existing mismatched rows, adds `(id, org_id)` keys on cells and snapshots with composite foreign keys from snapshot to cell and segment to snapshot, makes both `admin_write_*` policies require the parent to share the organization, and restates `get_schedule_cell_snapshot_payload` and `schedule_cell_has_effective_content` with organization guards on their joins (text-equivalence test). A live-database test shows an authenticated admin and the service role both refused, and a same-organization write still accepted. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): migration 032 replaces the single-column keys with composite `(cell_id, org_id)` and `(snapshot_id, org_id)` keys (a second key beside the old one broke every PostgREST embed and was caught in the browser during `/implement`), both write policies check the parent, both readers differ from 002 by exactly the guard lines, lookup indexes are unchanged, and the Test Sandbox clone copies no schedule rows so it is unaffected. Live tests refuse the cross-organization write for an authenticated admin and the service role.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-03 [P0] closed - Discard can delete a cell that has just been published

**File:** apps/web/src/lib/server/schedule-draft-safety.ts:280; apps/web/src/app/api/shifts/discard/route.ts:89
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security, performance)
**Why it matters:** Draft discard selects draft-only cells and later deletes their parent rows without rechecking state. A concurrent publish can promote a selected cell between those operations, causing the discard to remove published schedule data.
**Suggested fix:** Move discard to a transactional, version-checked database operation that locks or rechecks affected cells before deletion. Cover publish-versus-discard and partial-failure interleavings.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 3). `discard_schedule_drafts` in migration 032 locks each candidate cell `FOR UPDATE`, decides draft-only versus published under the lock, and handles snapshots, cells and notes in one transaction; service role only. `discardScheduleDraftsDirect` now calls it. A live test holds an uncommitted publish on a second connection and shows the discard blocking, then keeping the promoted cell; a browser discard with a cell published out from under the open dialog kept that cell and removed the other. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): `discard_schedule_drafts` locks candidates `FOR UPDATE` in id order, rechecks for a published snapshot under the lock, and the foreign key share lock a publish needs on the same rows makes it wait; the live interleaving test and a browser discard with a cell published out from under the dialog both kept the promoted cell. The route and helper reproduce the old scope and note behaviour. See F-19 for the lock-order note.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-04 [P1] closed - Direct invitation creation can assign Super Admin access

**File:** supabase/migrations/003_rls_policies.sql:762; supabase/migrations/018_harden_invitation_acceptance.sql:120
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The invitation policy permits a manager-level administrator to insert an invitation with an unrestricted target role, and acceptance trusts the stored role. This bypasses the application's role-assignment guard.
**Suggested fix:** Enforce the inviter's assignable-role ceiling in RLS or a guarded RPC and validate it again during acceptance. Test direct database access as well as the application route.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 1). Migration 033 makes `invitations_insert` refuse a `super_admin` role from anyone below that tier, and restates `accept_invitation` from 018 with one guard: a super-admin invitation is honoured only while its inviter still holds the tier (or is a gridmaster). Live tests cover the refused direct insert, the accepted super-admin insert, a stale invitation from a demoted inviter, and a valid one; a text test pins the restatement to the single hunk. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): the insert policy carries the ceiling, the revoke policy cannot be used to escalate (its WITH CHECK forces `revoked_at`, so any edited row is dead), `send_invitation` already refuses non-super-admin callers, and `accept_invitation` differs from 018 by exactly the inviter guard. Live and text tests confirm.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-05 [P1] closed - Organization admins can alter global account lifecycle fields

**File:** supabase/migrations/003_rls_policies.sql:73; supabase/migrations/004_grants.sql:59; supabase/migrations/002_functions_triggers.sql:7334
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** An administrator can directly update account deactivation, deletion, and termination fields on a profile that may have memberships in other organizations. These are platform-wide account controls rather than organization-scoped fields.
**Suggested fix:** Revoke direct updates for lifecycle fields and route them through narrow, role-checked server or database entry points. Test profiles with memberships in multiple organizations.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 2). Migration 033 revokes the table-level `UPDATE` on `profiles` from `authenticated` (a column revoke cannot narrow 004's table grant) and grants back only `first_name`, `last_name`, `updated_at`, `version`, `terms_accepted_at` and `terms_version`. The service role keeps full update and the auth hook writes as a definer, so gridmaster deactivate, terminate, reinstate, the hook and the cron jobs are unchanged. Live tests show an admin renaming a colleague but refused on `deactivated_at`, `terminated_at`, `scheduled_deletion_at` and `platform_role`, and the service role still writing them. The QA member used in the test holds memberships in every seeded organization. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): `authenticated` holds UPDATE on six profile columns only; every writer of the lifecycle columns (gridmaster routes, `updateSelfMfaStatus`, the auth hook, cron) uses the service role or a definer function, verified by reading each call site. The grant list is wider than its writers need on two columns; see F-21.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-06 [P1] closed - Revoked sessions can recreate their authorization row

**File:** supabase/migrations/003_rls_policies.sql:865; supabase/migrations/004_grants.sql:59; supabase/migrations/016_harden_authorization_boundaries.sql:24
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Deleting a session row is intended to revoke direct data access, but an unexpired client session can recreate its own row and recover access.
**Suggested fix:** Make session-row creation server or auth-hook only, and ensure revocation has durable state that client-side database access cannot restore.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 3). Migration 033 replaces `own_sessions_only` (FOR ALL) with `own_sessions_select`, so a member reads their own rows and nothing else; every writer was already the service role or a definer function, and the unused browser helper `lib/db/sessions.ts` is deleted. A live test shows a member listing their sessions, refused on re-inserting one and unable to delete one; the Settings device list, sign-out-other-devices (4 rows to 1) and the gridmaster deactivate/reinstate path all ran against the worktree server. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): `user_sessions` carries one SELECT policy and no write policy for members; the JWT hook and `switch_org` write as definers, the routes through the service role, and mobile realtime only reads. The deleted helper had no importer.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-07 [P1] accepted - MFA assurance is not enforced for web and database reads

**File:** apps/web/src/lib/api-auth.ts:1; supabase/migrations/002_functions_triggers.sql:37
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Mobile authentication evaluates the live MFA factor and AAL2, while the common web and RLS paths accept a password-only session for an MFA-enabled account. This bypasses the advertised MFA access boundary.
**Suggested fix:** Centralize assurance enforcement for all protected access paths and ensure database policies can enforce the required claim or durable factor state.
**Resolution:** Accepted 2026-09-22 by the user: not fixed in this pass. Tracked as its own follow-up fix, to be enforced at the session boundary (web proxy and mobile bootstrap refuse an MFA-enrolled account at AAL1 and send it to the challenge) rather than inside `caller_org_id`, so token refresh, session restore and realtime reconnects cannot lock a user out. AAL2 step-up for sensitive actions stays as today.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-08 [P1] accepted - Direct employee reads bypass contact-detail permission

**File:** supabase/migrations/003_rls_policies.sql:214
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** A regular user without employee-detail permission can read colleagues' contact fields through the authenticated data API.
**Suggested fix:** Restrict sensitive employee columns through a safe view or column-specific RPC and update client queries to use that contract. Add direct API tests for each permission tier.
**Resolution:** Accepted 2026-09-22 by the user: not fixed in this pass. Tracked as its own follow-up fix: column-level SELECT revoke on `phone`, `email`, `contact_notes` and `status_note` with a view or definer RPC that returns them only to viewers holding the permission; regular staff keep no contact fields (swaps go through the request flow).

### runtime-resilience-webhook-deeplinks-paging-realtime/F-09 [P1] accepted - Unpublished schedule state is visible to regular users

**File:** supabase/migrations/003_rls_policies.sql:605; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1970
**Found:** 2026-09-21 by /audit (scope: full; lens: security, quality)
**Why it matters:** Regular users can directly read draft snapshots and the schedule broadcast handler applies editor draft data to all same-organization viewers. Staff can see schedule changes before publication.
**Suggested fix:** Limit draft snapshot access to editors and use a published-only projection or separate editor event stream for viewer updates. Test staff visibility before and after publish.
**Resolution:** Accepted 2026-09-22 by the user: not fixed in this pass. Tracked as the next follow-up fix: regular users read only published snapshots at the policy layer (editors keep drafts) and the schedule broadcast gets a published-only projection; staff never see unpublished cells, including their own.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-10 [P1] accepted - Schedule broadcasts can leave peers on an uncommitted or stale state

**File:** apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1974; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:3888; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:4067
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, performance)
**Why it matters:** The client broadcasts schedule changes before the server confirms them, receivers accept older versions, and failed writes do not reconcile peers. This can show incorrect schedule state until a later refresh.
**Suggested fix:** Broadcast committed server echoes, reject obsolete versions, and reconcile all participants after failed or conflicting writes. Cover delayed, duplicate, rejected, and partial batch updates.
**Resolution:** Accepted 2026-09-22 by the user: not fixed in this pass. Feature-sized rework of the collaboration layer in `SchedulePageClient.tsx` (committed server echoes with version checks and reconciliation after failed writes); to be scoped through `/feature` as a build-plan item with its own audit.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-11 [P1] closed - Mobile schedule data silently truncates beyond 1,000 rows

**File:** packages/data-access/src/mobile.ts:994; supabase/config.toml:18
**Found:** 2026-09-21 by /audit (scope: full; lens: performance, quality)
**Why it matters:** The mobile schedule query has no pagination while PostgREST caps responses at 1,000 rows. Larger organizations can receive incomplete schedules, coverage, staffing, and dashboard calculations.
**Suggested fix:** Implement deterministic pagination for schedule datasets and move large discard/count operations into database-side transactions where appropriate. Test just above the configured response cap.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 3). `fetchScheduleCellQueryRows` in `packages/data-access/src/mobile.ts` now pages with `.range` in a total order (`date`, `emp_id`, `id`), 500 per page, building a fresh builder per page like the people pager; every consumer (published, comparison and effective schedule rows) goes through it. Unit tests feed three fake pages and assert the concatenation, the ranges and the order columns; a live run against Calm Haven (525 cells over two months) returned the same set at page size 7 and at the default, with no duplicates and embeds intact. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): the pager builds a fresh query per page, filters before ordering, and orders by `date`, `emp_id`, `id` (a total order on the table), so pages cannot overlap or skip while the set is stable; a row inserted mid-pagination can still shift an offset, the same property the people pager accepts, and the realtime invalidation refetches afterwards. All three consumers route through it; live run and unit tests confirm.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-12 [P1] closed - Mobile realtime recovery misses schedule and dashboard catch-up

**File:** apps/mobile/src/shared/hooks/useMobileRealtimeInvalidation.ts:72; packages/realtime-core/src/postgres-changes.ts:77
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, performance)
**Why it matters:** Recovered mobile channels invalidate only bootstrap, and timeout-to-subscribed transitions do not trigger catch-up. Missed events can leave schedule and dashboard data stale after a socket interruption.
**Suggested fix:** Track interrupted subscriptions and invalidate every data family owned by the restored channel. Test websocket-only interruption and recovery without a focus or network-state change.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 4). `subscribeToPostgresChanges` in `packages/realtime-core` remembers an interruption from either `CHANNEL_ERROR` or `TIMED_OUT` and fires `onReconnectAfterError` on the next `SUBSCRIBED` (the error count still feeds `onError` for `CHANNEL_ERROR` only). The mobile org-freshness hook's recovery now calls `invalidateMobileRealtimeQueriesForTables` over `organizations` plus every `ORG_FILTER_TABLES` entry, which invalidates each query family once (bootstrap, schedule, requests, dashboard, people, profile, change-request queues). Tests: `postgres-changes.test.ts` (TIMED_OUT then SUBSCRIBED fires once, no onError), `useMobileRealtimeInvalidation.test.ts` (dedup and the recovery handler through a mocked subscription); the three web realtime hook suites are unchanged and green. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): `interrupted` is set on `TIMED_OUT` and `CHANNEL_ERROR` and cleared on the `SUBSCRIBED` that fires the hook, `onError` still counts only channel errors, and the mobile recovery unions every family the watched tables feed and invalidates each once. A join that times out before its first `SUBSCRIBED` also fires the hook, costing one extra invalidation at startup; harmless. Web consumers gain the `TIMED_OUT` trigger with their existing handlers; their suites are unchanged and green.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-13 [P1] closed - Signed-out mobile notification links never reach authentication

**File:** apps/mobile/app/_layout.tsx:139; apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:78
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A notification deep link outside the tab gate keeps loading without a session instead of redirecting the user through login. This was reproduced on Android using the pinned source bundle.
**Suggested fix:** Apply the shared authentication and organization gate to protected native routes while preserving the intended destination through login.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 2). `ProtectedRoute` wraps the four out-of-tab routes with the tab gate's session and organization checks and, signed out, replaces to `/(auth)/login` with `next` captured on mount (the live pathname already reads `/login` while the redirect animates). `resolvePostLoginDestination` accepts only an in-app path that is not an auth screen, and the login screen honours it for both the already-signed-in redirect and a fresh sign-in. The launch route no longer picks a destination while it is not the focused screen, which was sending a sign-in from the redirected login screen to Home. Simulator: signed out, `dubgridmobile://alerts/<id>` landed on login, sign-in marked the alert read and forwarded to its subject; signed in, the same link forwarded directly. Tests: `ProtectedRoute.test.tsx`, `post-login-destination.test.ts`, `LoginScreen.test.tsx`, `index-route.test.tsx`. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): the destination is captured with `useState` on mount and the redirect fires once through a ref, so the in-flight pathname change cannot rewrite `next`; the resolver refuses non-paths, protocol-relative and absolute URLs, and every auth screen by its public pathname; the launch route checks `navigation.isFocused()` before picking a destination. Sign-out sets the session and replaces to login in one task, so a protected screen is removed in the same commit and does not re-redirect with a stale `next`. Simulator evidence on both signed-out and signed-in links; four test files cover the pieces.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-14 [P1] closed - Failed Stripe webhook processing prevents a valid retry from applying

**File:** apps/web/src/app/api/stripe/webhook/route.ts:55
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security)
**Why it matters:** The webhook records an event as processed before its database work completes. A transient failure returns a retryable error, but the later retry is treated as a duplicate and skips the required update.
**Suggested fix:** Use a transactional processing status with retry-safe claim semantics, or clear an incomplete claim on failure. Cover failure followed by redelivery.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 1). The webhook keeps its claim-first insert but releases the `stripe_processed_events` row in the `catch` before answering 500, so Stripe's redelivery is processed; a failed release is logged as the reason a redelivery would be skipped. Route tests cover the release on failure and a failure followed by a redelivery that applies the update, with the duplicate case unchanged. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): `claimed` is set only after a successful insert, the catch deletes that row before the 500 and logs a failed release, and the duplicate short-circuit is untouched. A concurrent duplicate that hit the unique key while the first delivery was failing is acknowledged, but the 500 makes Stripe redeliver, and the handlers are idempotent upserts. The redelivery test uses a real in-memory ledger.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-21 [P2] closed - Members can still write terms-acceptance columns the server owns

**File:** supabase/migrations/033_row_level_trust_boundaries.sql (GRANT UPDATE on profiles); supabase/migrations/003_rls_policies.sql:73
**Found:** 2026-09-22 by /audit (scope: current; lens: security)
**Why it matters:** The regrant keeps `terms_accepted_at` and `terms_version` updatable by `authenticated`, but the only writer (`features/account/server/terms.ts`) uses the service role. Combined with `admin_profiles_update`, an organization admin can mark a colleague's terms as accepted through the data API, forging a consent record. Not introduced by 033 (the old table grant allowed it too) but 033 chose the list, so the narrowing belongs with it.
**Suggested fix:** Drop the two terms columns from the grant in a forward migration and extend the F-05 live test to assert the refusal.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 5). Migration `034_terms_columns_server_owned.sql` revokes the table update again and grants back only `first_name`, `last_name`, `updated_at` and `version`; the local catalog after a clean reset lists exactly those four for `authenticated`. The F-05 live test now shows an admin and the member themselves refused on `terms_accepted_at`/`terms_version`, and the service role (the terms route's client) still recording acceptance; the 034 text test pins the grant. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): migration 034 revokes and regrants exactly four columns, the catalog after a clean reset agrees, the terms route writes through the service role, and the live test refuses an admin and the member themselves while the service role still records acceptance.

### runtime-resilience-webhook-deeplinks-paging-realtime/F-22 [P3] closed - The session-delete assertion passes by matching its own error text

**File:** apps/web/src/**tests**/row-level-trust-boundaries.integration.test.ts (F-06 case, delete branch)
**Found:** 2026-09-22 by /audit (scope: current; lens: tests)
**Why it matters:** A member's DELETE under RLS matches zero rows without raising, so the case throws a hand-written error whose message contains "row-level security" to satisfy the same `expectRaise` pattern as the insert. It proves the row survived, but a reader cannot tell that from the assertion, and a future change to the message breaks it for the wrong reason.
**Suggested fix:** Run the DELETE, then assert `rowCount === 0` on it and that a superuser read still finds the row, without `expectRaise`.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 5). The delete branch of the F-06 live test runs the member's `DELETE` outside `expectRaise`, asserts `rowCount === 0`, and re-reads the row as superuser to assert it survived. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 2285175c): the delete now runs outside `expectRaise`, asserts `rowCount` 0 and re-reads the row as superuser; the test fails if a delete policy ever appears.
