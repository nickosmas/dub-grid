# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P0] closed - Sandbox-scoped requests can operate on a different organization

**File:** apps/web/src/lib/audit/authorize.ts:28; apps/web/src/app/api/import/employees/route.ts:96; apps/web/src/app/api/shifts/publish/route.ts:68; apps/web/src/app/api/shifts/discard/route.ts:63
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Several service-role routes authorize the effective Test Sandbox organization but then use the request's original organization ID for reads or writes. This breaks the sandbox tenant boundary for imports, schedule changes, reports, exports, audit records, and publish history.
**Suggested fix:** Propagate only the effective organization ID returned by authorization through every downstream service call. Add cross-tenant regression coverage for each service-role route.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 1). Every `requireOrgPermissions` caller now binds the organization from the result: import, publish, discard, both reports routes, recent publish history, bootstrap, billing and the three Stripe routes; `authorizeAuditLogRead` returns the effective id and both audit-log routes filter by it. `effective-organization-boundaries.test.ts` scans every route and fails on any later use of the requested id; sandbox-redirect tests cover import, publish, discard and the full audit log. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): every `requireOrgPermissions` caller in `apps/web/src/app/api` and the audit-log reader was re-read; each binds reads, writes and audit rows to the returned `orgId`, the only remaining uses of the requested id are on logging lines, and `effective-organization-boundaries.test.ts` was shown to fail when one repair is reverted. `stripe/checkout-complete` now hands the effective id to `syncCheckoutSessionToDb`, whose metadata check refuses a sandbox caller (fail closed); see F-20 for the consistency follow-up.

### F-02 [P0] closed - Schedule child records can reference a cell in another organization

**File:** supabase/migrations/001_schema.sql:1170; supabase/migrations/003_rls_policies.sql:605; supabase/migrations/002_functions_triggers.sql:8230
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The authenticated schedule-child policy verifies the child's organization but not that its parent cell belongs to that organization. A mismatched child can affect another organization's canonical schedule read.
**Suggested fix:** Enforce organization consistency at the database relationship and write-policy layers, then defend reads against mismatched child rows. Test direct PostgREST writes with mismatched parent and child tenants.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 2). Migration 032 refuses to run over existing mismatched rows, adds `(id, org_id)` keys on cells and snapshots with composite foreign keys from snapshot to cell and segment to snapshot, makes both `admin_write_*` policies require the parent to share the organization, and restates `get_schedule_cell_snapshot_payload` and `schedule_cell_has_effective_content` with organization guards on their joins (text-equivalence test). A live-database test shows an authenticated admin and the service role both refused, and a same-organization write still accepted. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): migration 032 replaces the single-column keys with composite `(cell_id, org_id)` and `(snapshot_id, org_id)` keys (a second key beside the old one broke every PostgREST embed and was caught in the browser during `/implement`), both write policies check the parent, both readers differ from 002 by exactly the guard lines, lookup indexes are unchanged, and the Test Sandbox clone copies no schedule rows so it is unaffected. Live tests refuse the cross-organization write for an authenticated admin and the service role.

### F-03 [P0] closed - Discard can delete a cell that has just been published

**File:** apps/web/src/lib/server/schedule-draft-safety.ts:280; apps/web/src/app/api/shifts/discard/route.ts:89
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security, performance)
**Why it matters:** Draft discard selects draft-only cells and later deletes their parent rows without rechecking state. A concurrent publish can promote a selected cell between those operations, causing the discard to remove published schedule data.
**Suggested fix:** Move discard to a transactional, version-checked database operation that locks or rechecks affected cells before deletion. Cover publish-versus-discard and partial-failure interleavings.
**Resolution:** Fixed 2026-09-22 (fix: tenant boundary and discard safety, step 3). `discard_schedule_drafts` in migration 032 locks each candidate cell `FOR UPDATE`, decides draft-only versus published under the lock, and handles snapshots, cells and notes in one transaction; service role only. `discardScheduleDraftsDirect` now calls it. A live test holds an uncommitted publish on a second connection and shows the discard blocking, then keeping the promoted cell; a browser discard with a cell published out from under the open dialog kept that cell and removed the other. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 77752384): `discard_schedule_drafts` locks candidates `FOR UPDATE` in id order, rechecks for a published snapshot under the lock, and the foreign key share lock a publish needs on the same rows makes it wait; the live interleaving test and a browser discard with a cell published out from under the dialog both kept the promoted cell. The route and helper reproduce the old scope and note behaviour. See F-19 for the lock-order note.

### F-04 [P1] closed - Direct invitation creation can assign Super Admin access

**File:** supabase/migrations/003_rls_policies.sql:762; supabase/migrations/018_harden_invitation_acceptance.sql:120
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The invitation policy permits a manager-level administrator to insert an invitation with an unrestricted target role, and acceptance trusts the stored role. This bypasses the application's role-assignment guard.
**Suggested fix:** Enforce the inviter's assignable-role ceiling in RLS or a guarded RPC and validate it again during acceptance. Test direct database access as well as the application route.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 1). Migration 033 makes `invitations_insert` refuse a `super_admin` role from anyone below that tier, and restates `accept_invitation` from 018 with one guard: a super-admin invitation is honoured only while its inviter still holds the tier (or is a gridmaster). Live tests cover the refused direct insert, the accepted super-admin insert, a stale invitation from a demoted inviter, and a valid one; a text test pins the restatement to the single hunk. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): the insert policy carries the ceiling, the revoke policy cannot be used to escalate (its WITH CHECK forces `revoked_at`, so any edited row is dead), `send_invitation` already refuses non-super-admin callers, and `accept_invitation` differs from 018 by exactly the inviter guard. Live and text tests confirm.

### F-05 [P1] closed - Organization admins can alter global account lifecycle fields

**File:** supabase/migrations/003_rls_policies.sql:73; supabase/migrations/004_grants.sql:59; supabase/migrations/002_functions_triggers.sql:7334
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** An administrator can directly update account deactivation, deletion, and termination fields on a profile that may have memberships in other organizations. These are platform-wide account controls rather than organization-scoped fields.
**Suggested fix:** Revoke direct updates for lifecycle fields and route them through narrow, role-checked server or database entry points. Test profiles with memberships in multiple organizations.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 2). Migration 033 revokes the table-level `UPDATE` on `profiles` from `authenticated` (a column revoke cannot narrow 004's table grant) and grants back only `first_name`, `last_name`, `updated_at`, `version`, `terms_accepted_at` and `terms_version`. The service role keeps full update and the auth hook writes as a definer, so gridmaster deactivate, terminate, reinstate, the hook and the cron jobs are unchanged. Live tests show an admin renaming a colleague but refused on `deactivated_at`, `terminated_at`, `scheduled_deletion_at` and `platform_role`, and the service role still writing them. The QA member used in the test holds memberships in every seeded organization. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): `authenticated` holds UPDATE on six profile columns only; every writer of the lifecycle columns (gridmaster routes, `updateSelfMfaStatus`, the auth hook, cron) uses the service role or a definer function, verified by reading each call site. The grant list is wider than its writers need on two columns; see F-21.

### F-06 [P1] closed - Revoked sessions can recreate their authorization row

**File:** supabase/migrations/003_rls_policies.sql:865; supabase/migrations/004_grants.sql:59; supabase/migrations/016_harden_authorization_boundaries.sql:24
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Deleting a session row is intended to revoke direct data access, but an unexpired client session can recreate its own row and recover access.
**Suggested fix:** Make session-row creation server or auth-hook only, and ensure revocation has durable state that client-side database access cannot restore.
**Resolution:** Fixed 2026-09-22 (fix: row-level trust boundaries, step 3). Migration 033 replaces `own_sessions_only` (FOR ALL) with `own_sessions_select`, so a member reads their own rows and nothing else; every writer was already the service role or a definer function, and the unused browser helper `lib/db/sessions.ts` is deleted. A live test shows a member listing their sessions, refused on re-inserting one and unable to delete one; the Settings device list, sign-out-other-devices (4 rows to 1) and the gridmaster deactivate/reinstate path all ran against the worktree server. Requires `/audit` re-review before closing. Closed 2026-09-22 by `/audit` re-review (scope: current; commit 04bbb768): `user_sessions` carries one SELECT policy and no write policy for members; the JWT hook and `switch_org` write as definers, the routes through the service role, and mobile realtime only reads. The deleted helper had no importer.

### F-07 [P1] open - MFA assurance is not enforced for web and database reads

**File:** apps/web/src/lib/api-auth.ts:1; supabase/migrations/002_functions_triggers.sql:37
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Mobile authentication evaluates the live MFA factor and AAL2, while the common web and RLS paths accept a password-only session for an MFA-enabled account. This bypasses the advertised MFA access boundary.
**Suggested fix:** Centralize assurance enforcement for all protected access paths and ensure database policies can enforce the required claim or durable factor state.
**Resolution:**

### F-08 [P1] open - Direct employee reads bypass contact-detail permission

**File:** supabase/migrations/003_rls_policies.sql:214
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** A regular user without employee-detail permission can read colleagues' contact fields through the authenticated data API.
**Suggested fix:** Restrict sensitive employee columns through a safe view or column-specific RPC and update client queries to use that contract. Add direct API tests for each permission tier.
**Resolution:**

### F-09 [P1] open - Unpublished schedule state is visible to regular users

**File:** supabase/migrations/003_rls_policies.sql:605; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1970
**Found:** 2026-09-21 by /audit (scope: full; lens: security, quality)
**Why it matters:** Regular users can directly read draft snapshots and the schedule broadcast handler applies editor draft data to all same-organization viewers. Staff can see schedule changes before publication.
**Suggested fix:** Limit draft snapshot access to editors and use a published-only projection or separate editor event stream for viewer updates. Test staff visibility before and after publish.
**Resolution:**

### F-10 [P1] open - Schedule broadcasts can leave peers on an uncommitted or stale state

**File:** apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:1974; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:3888; apps/web/src/app/(app)/schedule/SchedulePageClient.tsx:4067
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, performance)
**Why it matters:** The client broadcasts schedule changes before the server confirms them, receivers accept older versions, and failed writes do not reconcile peers. This can show incorrect schedule state until a later refresh.
**Suggested fix:** Broadcast committed server echoes, reject obsolete versions, and reconcile all participants after failed or conflicting writes. Cover delayed, duplicate, rejected, and partial batch updates.
**Resolution:**

### F-11 [P1] fixed - Mobile schedule data silently truncates beyond 1,000 rows

**File:** packages/data-access/src/mobile.ts:994; supabase/config.toml:18
**Found:** 2026-09-21 by /audit (scope: full; lens: performance, quality)
**Why it matters:** The mobile schedule query has no pagination while PostgREST caps responses at 1,000 rows. Larger organizations can receive incomplete schedules, coverage, staffing, and dashboard calculations.
**Suggested fix:** Implement deterministic pagination for schedule datasets and move large discard/count operations into database-side transactions where appropriate. Test just above the configured response cap.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 3). `fetchScheduleCellQueryRows` in `packages/data-access/src/mobile.ts` now pages with `.range` in a total order (`date`, `emp_id`, `id`), 500 per page, building a fresh builder per page like the people pager; every consumer (published, comparison and effective schedule rows) goes through it. Unit tests feed three fake pages and assert the concatenation, the ranges and the order columns; a live run against Calm Haven (525 cells over two months) returned the same set at page size 7 and at the default, with no duplicates and embeds intact. Requires `/audit` re-review before closing.

### F-12 [P1] fixed - Mobile realtime recovery misses schedule and dashboard catch-up

**File:** apps/mobile/src/shared/hooks/useMobileRealtimeInvalidation.ts:72; packages/realtime-core/src/postgres-changes.ts:77
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, performance)
**Why it matters:** Recovered mobile channels invalidate only bootstrap, and timeout-to-subscribed transitions do not trigger catch-up. Missed events can leave schedule and dashboard data stale after a socket interruption.
**Suggested fix:** Track interrupted subscriptions and invalidate every data family owned by the restored channel. Test websocket-only interruption and recovery without a focus or network-state change.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 4). `subscribeToPostgresChanges` in `packages/realtime-core` remembers an interruption from either `CHANNEL_ERROR` or `TIMED_OUT` and fires `onReconnectAfterError` on the next `SUBSCRIBED` (the error count still feeds `onError` for `CHANNEL_ERROR` only). The mobile org-freshness hook's recovery now calls `invalidateMobileRealtimeQueriesForTables` over `organizations` plus every `ORG_FILTER_TABLES` entry, which invalidates each query family once (bootstrap, schedule, requests, dashboard, people, profile, change-request queues). Tests: `postgres-changes.test.ts` (TIMED_OUT then SUBSCRIBED fires once, no onError), `useMobileRealtimeInvalidation.test.ts` (dedup and the recovery handler through a mocked subscription); the three web realtime hook suites are unchanged and green. Requires `/audit` re-review before closing.

### F-13 [P1] fixed - Signed-out mobile notification links never reach authentication

**File:** apps/mobile/app/_layout.tsx:139; apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:78
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A notification deep link outside the tab gate keeps loading without a session instead of redirecting the user through login. This was reproduced on Android using the pinned source bundle.
**Suggested fix:** Apply the shared authentication and organization gate to protected native routes while preserving the intended destination through login.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 2). `ProtectedRoute` wraps the four out-of-tab routes with the tab gate's session and organization checks and, signed out, replaces to `/(auth)/login` with `next` captured on mount (the live pathname already reads `/login` while the redirect animates). `resolvePostLoginDestination` accepts only an in-app path that is not an auth screen, and the login screen honours it for both the already-signed-in redirect and a fresh sign-in. The launch route no longer picks a destination while it is not the focused screen, which was sending a sign-in from the redirected login screen to Home. Simulator: signed out, `dubgridmobile://alerts/<id>` landed on login, sign-in marked the alert read and forwarded to its subject; signed in, the same link forwarded directly. Tests: `ProtectedRoute.test.tsx`, `post-login-destination.test.ts`, `LoginScreen.test.tsx`, `index-route.test.tsx`. Requires `/audit` re-review before closing.

### F-14 [P1] fixed - Failed Stripe webhook processing prevents a valid retry from applying

**File:** apps/web/src/app/api/stripe/webhook/route.ts:55
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security)
**Why it matters:** The webhook records an event as processed before its database work completes. A transient failure returns a retryable error, but the later retry is treated as a duplicate and skips the required update.
**Suggested fix:** Use a transactional processing status with retry-safe claim semantics, or clear an incomplete claim on failure. Cover failure followed by redelivery.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 1). The webhook keeps its claim-first insert but releases the `stripe_processed_events` row in the `catch` before answering 500, so Stripe's redelivery is processed; a failed release is logged as the reason a redelivery would be skipped. Route tests cover the release on failure and a failure followed by a redelivery that applies the update, with the duplicate case unchanged. Requires `/audit` re-review before closing.

### F-15 [P2] open - Older mobile notification links are reported unavailable

**File:** apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:55; packages/data-access/src/mobile.ts:1985
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A cold notification-detail screen searches only the latest page of results and ignores the next-page cursor, so an otherwise valid older notification cannot be opened from a link.
**Suggested fix:** Add an authorized notification-by-ID endpoint or page through the list until the requested item is found.
**Resolution:**

### F-16 [P2] open - Notification response listeners can survive sign-out

**File:** apps/mobile/src/features/notifications/hooks/usePushResponseHandler.ts:126
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** If initialization is still awaiting the initial notification response when the hook unmounts, cleanup is not yet registered. A later response can navigate a signed-out or different-user session.
**Suggested fix:** Register cleanup synchronously, suppress callbacks after cancellation, and handle initialization failures.
**Resolution:**

### F-17 [P2] open - Existing load tests do not qualify authenticated scheduling capacity

**File:** load-tests/schedule-load.js:12; load-tests/auth-flow.js:14
**Found:** 2026-09-21 by /audit (scope: full; lens: performance)
**Why it matters:** Current load scenarios exercise health, public page, and sampled login requests only. They do not measure authenticated schedule reads, writes, publishing, or realtime propagation against the stated launch thresholds.
**Suggested fix:** Add staging-account workflows for realistic schedule reads, versioned writes, concurrent editors, publishing, and websocket propagation with separate read and write thresholds.
**Resolution:**

### F-18 [P2] unverified - Native push delivery and signed release qualification lack evidence

**File:** apps/mobile/app.json:1; apps/mobile/src/features/notifications/lib/push-permission.ts:1
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** The tracked mobile configuration lacks an explicit EAS project identity, and no signed release artifact or provider configuration was available for inspection. Development configuration reports that a project identity is required, but deployed configuration could supply it externally.
**Suggested fix:** Verify the production build profile, signed iOS and Android artifacts, project identity, push-token registration, notification delivery, and opt-out behavior with dedicated release accounts.
**Resolution:**

### F-19 [P3] unverified - Concurrent publish and discard can deadlock rather than lose data

**File:** supabase/migrations/032_schedule_children_org_consistency.sql (discard_schedule_drafts); supabase/migrations/020_publish_repairs.sql:284
**Found:** 2026-09-22 by /audit (scope: current; lens: performance)
**Why it matters:** The discard locks cells in id order; `publish_schedule` iterates its cells in unspecified order and locks each through `write_schedule_cell_snapshot_internal`. Two overlapping ranges running at once can therefore acquire the same rows in opposite orders. Postgres aborts one side with a deadlock error, so no schedule data is lost, but that caller sees a 500 instead of a retry.
**Suggested fix:** Have `publish_schedule` iterate `ORDER BY c.id` so both writers take locks in the same order, or wrap the discard route's call in a single retry on SQLSTATE 40P01. Confirm with a two-connection test before treating it as a defect.
**Resolution:**

### F-20 [P3] open - Checkout completion does not refuse a sandbox cookie like its siblings

**File:** apps/web/src/app/api/stripe/checkout-complete/route.ts:18
**Found:** 2026-09-22 by /audit (scope: current; lens: quality)
**Why it matters:** `create-checkout` and `billing-portal` call `forbidIfSandboxCookie` and answer a sandboxed caller with a clear refusal. `checkout-complete` relies on `syncCheckoutSessionToDb` rejecting the organization mismatch instead, so the same caller gets a generic "Checkout session organization mismatch" error. Safe, but inconsistent and harder to support.
**Suggested fix:** Add the same `forbidIfSandboxCookie` guard at the top of the handler and a route test for it.
**Resolution:**

### F-21 [P2] fixed - Members can still write terms-acceptance columns the server owns

**File:** supabase/migrations/033_row_level_trust_boundaries.sql (GRANT UPDATE on profiles); supabase/migrations/003_rls_policies.sql:73
**Found:** 2026-09-22 by /audit (scope: current; lens: security)
**Why it matters:** The regrant keeps `terms_accepted_at` and `terms_version` updatable by `authenticated`, but the only writer (`features/account/server/terms.ts`) uses the service role. Combined with `admin_profiles_update`, an organization admin can mark a colleague's terms as accepted through the data API, forging a consent record. Not introduced by 033 (the old table grant allowed it too) but 033 chose the list, so the narrowing belongs with it.
**Suggested fix:** Drop the two terms columns from the grant in a forward migration and extend the F-05 live test to assert the refusal.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 5). Migration `034_terms_columns_server_owned.sql` revokes the table update again and grants back only `first_name`, `last_name`, `updated_at` and `version`; the local catalog after a clean reset lists exactly those four for `authenticated`. The F-05 live test now shows an admin and the member themselves refused on `terms_accepted_at`/`terms_version`, and the service role (the terms route's client) still recording acceptance; the 034 text test pins the grant. Requires `/audit` re-review before closing.

### F-22 [P3] fixed - The session-delete assertion passes by matching its own error text

**File:** apps/web/src/**tests**/row-level-trust-boundaries.integration.test.ts (F-06 case, delete branch)
**Found:** 2026-09-22 by /audit (scope: current; lens: tests)
**Why it matters:** A member's DELETE under RLS matches zero rows without raising, so the case throws a hand-written error whose message contains "row-level security" to satisfy the same `expectRaise` pattern as the insert. It proves the row survived, but a reader cannot tell that from the assertion, and a future change to the message breaks it for the wrong reason.
**Suggested fix:** Run the DELETE, then assert `rowCount === 0` on it and that a superuser read still finds the row, without `expectRaise`.
**Resolution:** Fixed 2026-09-22 (fix: runtime resilience, step 5). The delete branch of the F-06 live test runs the member's `DELETE` outside `expectRaise`, asserts `rowCount === 0`, and re-reads the row as superuser to assert it survived. Requires `/audit` re-review before closing.
