# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P0] open - Sandbox-scoped requests can operate on a different organization

**File:** apps/web/src/lib/audit/authorize.ts:28; apps/web/src/app/api/import/employees/route.ts:96; apps/web/src/app/api/shifts/publish/route.ts:68; apps/web/src/app/api/shifts/discard/route.ts:63
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Several service-role routes authorize the effective Test Sandbox organization but then use the request's original organization ID for reads or writes. This breaks the sandbox tenant boundary for imports, schedule changes, reports, exports, audit records, and publish history.
**Suggested fix:** Propagate only the effective organization ID returned by authorization through every downstream service call. Add cross-tenant regression coverage for each service-role route.
**Resolution:**

### F-02 [P0] open - Schedule child records can reference a cell in another organization

**File:** supabase/migrations/001_schema.sql:1170; supabase/migrations/003_rls_policies.sql:605; supabase/migrations/002_functions_triggers.sql:8230
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The authenticated schedule-child policy verifies the child's organization but not that its parent cell belongs to that organization. A mismatched child can affect another organization's canonical schedule read.
**Suggested fix:** Enforce organization consistency at the database relationship and write-policy layers, then defend reads against mismatched child rows. Test direct PostgREST writes with mismatched parent and child tenants.
**Resolution:**

### F-03 [P0] open - Discard can delete a cell that has just been published

**File:** apps/web/src/lib/server/schedule-draft-safety.ts:280; apps/web/src/app/api/shifts/discard/route.ts:89
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security, performance)
**Why it matters:** Draft discard selects draft-only cells and later deletes their parent rows without rechecking state. A concurrent publish can promote a selected cell between those operations, causing the discard to remove published schedule data.
**Suggested fix:** Move discard to a transactional, version-checked database operation that locks or rechecks affected cells before deletion. Cover publish-versus-discard and partial-failure interleavings.
**Resolution:**

### F-04 [P1] open - Direct invitation creation can assign Super Admin access

**File:** supabase/migrations/003_rls_policies.sql:762; supabase/migrations/018_harden_invitation_acceptance.sql:120
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** The invitation policy permits a manager-level administrator to insert an invitation with an unrestricted target role, and acceptance trusts the stored role. This bypasses the application's role-assignment guard.
**Suggested fix:** Enforce the inviter's assignable-role ceiling in RLS or a guarded RPC and validate it again during acceptance. Test direct database access as well as the application route.
**Resolution:**

### F-05 [P1] open - Organization admins can alter global account lifecycle fields

**File:** supabase/migrations/003_rls_policies.sql:73; supabase/migrations/004_grants.sql:59; supabase/migrations/002_functions_triggers.sql:7334
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** An administrator can directly update account deactivation, deletion, and termination fields on a profile that may have memberships in other organizations. These are platform-wide account controls rather than organization-scoped fields.
**Suggested fix:** Revoke direct updates for lifecycle fields and route them through narrow, role-checked server or database entry points. Test profiles with memberships in multiple organizations.
**Resolution:**

### F-06 [P1] open - Revoked sessions can recreate their authorization row

**File:** supabase/migrations/003_rls_policies.sql:865; supabase/migrations/004_grants.sql:59; supabase/migrations/016_harden_authorization_boundaries.sql:24
**Found:** 2026-09-21 by /audit (scope: full; lens: security)
**Why it matters:** Deleting a session row is intended to revoke direct data access, but an unexpired client session can recreate its own row and recover access.
**Suggested fix:** Make session-row creation server or auth-hook only, and ensure revocation has durable state that client-side database access cannot restore.
**Resolution:**

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

### F-11 [P1] open - Mobile schedule data silently truncates beyond 1,000 rows

**File:** packages/data-access/src/mobile.ts:994; supabase/config.toml:18
**Found:** 2026-09-21 by /audit (scope: full; lens: performance, quality)
**Why it matters:** The mobile schedule query has no pagination while PostgREST caps responses at 1,000 rows. Larger organizations can receive incomplete schedules, coverage, staffing, and dashboard calculations.
**Suggested fix:** Implement deterministic pagination for schedule datasets and move large discard/count operations into database-side transactions where appropriate. Test just above the configured response cap.
**Resolution:**

### F-12 [P1] open - Mobile realtime recovery misses schedule and dashboard catch-up

**File:** apps/mobile/src/shared/hooks/useMobileRealtimeInvalidation.ts:72; packages/realtime-core/src/postgres-changes.ts:77
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, performance)
**Why it matters:** Recovered mobile channels invalidate only bootstrap, and timeout-to-subscribed transitions do not trigger catch-up. Missed events can leave schedule and dashboard data stale after a socket interruption.
**Suggested fix:** Track interrupted subscriptions and invalidate every data family owned by the restored channel. Test websocket-only interruption and recovery without a focus or network-state change.
**Resolution:**

### F-13 [P1] open - Signed-out mobile notification links never reach authentication

**File:** apps/mobile/app/_layout.tsx:139; apps/mobile/src/features/notifications/screens/NotificationDetailScreen.tsx:78
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** A notification deep link outside the tab gate keeps loading without a session instead of redirecting the user through login. This was reproduced on Android using the pinned source bundle.
**Suggested fix:** Apply the shared authentication and organization gate to protected native routes while preserving the intended destination through login.
**Resolution:**

### F-14 [P1] open - Failed Stripe webhook processing prevents a valid retry from applying

**File:** apps/web/src/app/api/stripe/webhook/route.ts:55
**Found:** 2026-09-21 by /audit (scope: full; lens: quality, security)
**Why it matters:** The webhook records an event as processed before its database work completes. A transient failure returns a retryable error, but the later retry is treated as a duplicate and skips the required update.
**Suggested fix:** Use a transactional processing status with retry-safe claim semantics, or clear an incomplete claim on failure. Cover failure followed by redelivery.
**Resolution:**

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
