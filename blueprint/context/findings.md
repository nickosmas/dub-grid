# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

_No findings recorded. `/audit` appends findings here when it finds them._

### F-01 [P2] closed - Realtime marketing copy promises a guarantee the product can disable

**File:** apps/web/src/app/page.tsx:65-67
**Found:** 2026-08-27 by /audit (scope: apps/web/src/app/page.tsx; lens: quality)
**Why it matters:** The landing page promises that publishing reaches every screen instantly and leaves no stale versions. `useOrganizationData` disables realtime when an organization's `disable_realtime` override is true, and offline or printed schedules cannot receive live updates.
**Suggested fix:** Describe publishing and live updates as available capabilities, without promising instant delivery to every screen or eliminating stale printouts.
**Resolution:** Closed 2026-08-27 after re-review. The organization-level pause control was removed, web and mobile realtime subscriptions now ignore the legacy `disable_realtime` value, and the claim now accurately describes updates to connected web and mobile apps.

### F-02 [P3] accepted - Infrastructure protection statement has no repository-level proof

**File:** apps/web/src/app/page.tsx:121-124
**Found:** 2026-08-27 by /audit (scope: apps/web/src/app/page.tsx; lens: security)
**Why it matters:** The landing page states that data is encrypted in transit and at rest. The privacy page makes the same policy statement, but the repository cannot prove the deployed infrastructure and database configuration that make it true.
**Suggested fix:** Confirm the deployed controls with the infrastructure owner before treating this wording as a verified product claim.
**Resolution:** The user explicitly chose not to verify or change this claim on 2026-08-27.

### F-03 [P2] open - Organization-user lookup fans out one Auth request per membership

**File:** apps/web/src/app/api/organizations/users/route.ts:29-32
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** The access-management endpoint loads each member's Auth user through a separate `auth.admin.getUserById` call in one unbounded `Promise.all`. Larger organizations therefore create an equally large burst of upstream Auth requests, increasing endpoint latency and risking rate or connection pressure.
**Suggested fix:** Fetch the needed Auth-user fields in bounded batches or persist the required display fields with the membership/profile data, then return one bounded, paginated response.
**Resolution:**

### F-04 [P2] open - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Both management and staff rosters map every filtered row into the screen's `ScrollView`. The app has no `FlatList`, `SectionList`, or equivalent virtualized list, so render, layout, animation, and memory cost grow with the complete organization roster rather than the visible rows.
**Suggested fix:** Replace the roster body with a virtualized list while preserving filters, search, refresh, row animation, and empty states.
**Resolution:**

### F-05 [P2] open - Landing page hydrates all mobile mockups and reveal sections on first load

**File:** apps/web/src/app/page.tsx:1-16, 383-547
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** The public page is a single client component that statically imports the 1,848-line `MobileAppMockup` and renders several mockups and reveal observers, including below-the-fold content. Every landing visitor downloads, hydrates, and lays out that work before it can be deferred by visibility.
**Suggested fix:** Keep the above-the-fold hero minimal and load below-the-fold mockups and reveal behavior on demand, with reduced-motion-safe static markup where interaction is unnecessary.
**Resolution:**

### F-06 [P1] closed - Archived memberships do not revoke already-issued access tokens

**File:** apps/web/src/app/api/organizations/access/route.ts:440-480
**Found:** 2026-08-28 by /audit (scope: full; lens: security)
**Why it matters:** Removing a user archives their membership but does not call `revokeAllUserSessions`. The SQL trigger only blocks a later token refresh. Until their current JWT expires, a removed user can call Supabase directly and read the former organization's rows through policies such as `members_select_employees`, which authorize `org_id = caller_org_id()` from that still-valid JWT claim.
**Suggested fix:** After the archive succeeds, revoke all sessions for the removed user and add a regression test that proves their pre-removal token cannot read the former org through the authenticated REST API.
**Resolution:** 2026-08-28 - Re-reviewed after repair. `DELETE /api/organizations/access` awaits user-wide session revocation after the membership archive. Migration `005_live_membership_guard.sql` and the live-database patch make `caller_org_id()` require a current, unarchived membership, so direct Supabase RLS reads reject a stale JWT org claim immediately. Focused route, static SQL, live RLS, per-session isolation, and type checks passed; no regression was found in the reviewed boundary.
