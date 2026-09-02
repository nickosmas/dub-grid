# Regular-user repairs and profile consolidation

**Type:** Fix
**Status:** verified

## The problem

Regular users can encounter draft schedule data in their profile, their own row and privileged filters in People, misaligned two-week schedule periods, misleading unpublished loading states, incorrect session classification, and repeated onboarding. Profile navigation also duplicates schedule history that belongs in the main schedule and request surfaces, while its calendar link cannot be polled by external calendar apps.

## The fix

Consolidate self and staff schedule summaries into Profile Overview, flatten the primary profile navigation while preserving footer sections, and remove profile-level shift/request history. Add a revocable published-only calendar feed, enforce regular-user People boundaries on web and mobile, repair two-week alignment and loading semantics, classify sessions per device, and make onboarding completion authoritative. Preserve administrator capabilities, tenant isolation, existing dedicated schedule/request surfaces, and unrelated dirty work.

## Build steps

- [x] **1. Consolidate profile overview and navigation**
  - Remove the separate Schedule section from My Profile and staff profiles, move recurring schedules and the self-only calendar card into Overview, and map legacy schedule-section links safely.
  - Flatten primary profile navigation while retaining Data & privacy and Activity/History footer sections.
  - Make self-profile schedule aggregates published-only and remove now-unused profile shift/request history payloads.
  - Done when focused profile/navigation tests prove the new structure, permissions, legacy-link behavior, and absence of draft-derived self metrics.

- [x] **2. Add a secure external calendar subscription**
  - Add a tenant- and employee-scoped hashed token store with create/rotate/revoke APIs and a cookie-free published-only ICS feed.
  - Present one-time private-link issuance and clear replacement/disable states in My Profile Overview while retaining the authenticated export route for compatibility.
  - Done when route and migration tests prove token secrecy, revocation, tenant isolation, linked-employee validation, and published-only output.

- [x] **3. Enforce the regular-user People boundary**
  - Exclude self before search, summaries, filters, and pagination on web and mobile.
  - Limit regular-user matching and filters to visible roster fields and remove employment-only summaries or indicators without changing administrator behavior.
  - Done when focused web/mobile tests prove self exclusion, visible-field-only behavior, and unchanged administrator capabilities.

- [x] **4. Repair two-week alignment and publication loading**
  - Re-align open two-week web grids when the organization anchor loads or changes, keeping one-week, month, and mobile-week behavior unchanged.
  - Model publication ranges as loading, loaded, or error so unpublished copy appears only after a successful empty result.
  - Done when focused schedule/dashboard tests cover anchor changes, navigation, cached data, errors, retries, and truly unpublished periods.

- [x] **5. Repair session classification and onboarding persistence**
  - Classify every recent session independently, force the authenticated session active, and preserve multiple active sessions on one platform.
  - Verify onboarding completion persisted for the effective organization, update bootstrap state immediately, and broadcast it across tabs.
  - Done when server, route, component, refresh, and cross-tab tests cover current/stale sessions and durable onboarding completion.

- [x] **6. Audit and verify the regular-user surface**
  - Audit regular-user routes and payloads across web/mobile for draft, admin, other-user, direct-URL, and transient-state defects; repair additional boundary regressions and record unrelated lower-severity findings.
  - [x] Repair F-28 - block mobile self-profile direct-link bypasses.
  - [x] Repair F-29 - make calendar ranges and ICS events organization-timezone safe.
  - [x] Repair F-30 - bound profile Overview schedule queries to the recent metrics window.
  - [x] Repair F-31 - stop regular-user pages from issuing privileged invitation requests.
  - Run focused tests, type-check, lint, unit/integration, mobile, build, E2E, and authenticated browser checks when a usable session exists.
  - Done when required checks pass, unavailable runtime evidence is reported honestly, and no in-scope P0/P1 finding remains open or fixed.

## Verify

- Confirm My Profile and staff profiles have flat primary navigation, footer separation, Overview schedule cards, no Schedule page, and safe legacy links.
- Create, copy, poll, rotate, and revoke a private calendar feed; confirm it returns only published shifts for the linked employee and organization.
- Confirm regular users cannot find themselves or filter/search People by hidden fields on web or mobile.
- Change the pay-period anchor and verify open two-week web views realign without affecting other spans.
- Load, fail, retry, and open an unpublished schedule window without misleading interim copy.
- Exercise multiple current/stale sessions and refresh onboarding after completion.
- Run `npm run type-check`, `npm run lint`, `npm run test`, `npm run test:mobile`, `npm run build`, and `npm run test:e2e`.

## Findings

### regular-user-repairs-and-profile-consolidation/F-14 [P2] closed - Web bulk security-session sign-outs bypass confirmation

**File:** apps/web/src/components/account/SecurityPanel.tsx:142-156, 294-315
**Found:** 2026-08-29 by /audit (scope: full; lenses: security, tests)
**Why it matters:** The Security panel immediately signs out other devices or every device after one
click. This contradicts the panel's current-device confirmation and the mobile session flow, which
requires a confirmation for each destructive session scope. There is no focused SecurityPanel test
to protect the expected confirmation contract.
**Suggested fix:** Route both bulk actions through ConfirmDialog with scope-specific copy, then add
focused coverage that verifies no sign-out request occurs until confirmation.
**Resolution:** 2026-08-29 by /implement. The web Security panel now opens
scope-specific confirmation dialogs before either bulk sign-out action. On both web and mobile,
the other-devices action is disabled when no other active device exists. Focused coverage proves
neither web action runs until the corresponding dialog is confirmed.
Re-reviewed 2026-09-01 by /audit: the scope-specific dialogs and focused tests remain in place,
and the current-session classification repair does not bypass either confirmation path.

### regular-user-repairs-and-profile-consolidation/F-28 [P2] closed - Mobile direct links can render the current user as a teammate

**File:** apps/mobile/src/features/people/screens/PersonDetailScreen.tsx:206-240; apps/web/src/features/mobile/server/routes/person.ts:138-171
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, security, tests)
**Why it matters:** The regular-user People list excludes the signed-in employee, but a direct
`/person/[id]` link still fetches that employee. The API removes `userId` before returning the
payload, so the client can no longer recognize self and redirects only when the unsanitized account
link happens to survive. The user then sees their own record through the teammate-profile UI,
recreating the confusing duplicate self-service surface the repair is meant to remove.
**Suggested fix:** Detect the linked employee ID from bootstrap before enabling the mobile detail
query, redirect self to the Profile tab, and make the regular-user person endpoint reject its own
employee row so a direct API call cannot bypass the boundary.
**Resolution:** 2026-09-01 by /implement. The mobile detail screen now resolves the linked employee
from bootstrap before enabling its query, redirects direct self links to the Profile tab without a
not-found flash, and the regular-user person endpoint returns 404 for its own linked employee.
Focused route and screen tests cover both the API boundary and client redirect.
Re-reviewed 2026-09-01 by /audit: the query remains disabled for the linked employee, the client
redirects to Profile, and the regular-user endpoint independently rejects the same self row.

### regular-user-repairs-and-profile-consolidation/F-29 [P1] closed - Calendar feeds shift dates and times through the server timezone

**File:** apps/web/src/features/account/server/calendar-feed.ts:11-80; apps/web/src/lib/ical.ts:12-48
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** The new private feed converts schedule-local date/time strings into JavaScript
`Date` values in the server timezone and then serializes them as UTC. Its range calculation also
mixes local calendar dates with `toISOString()`. On a server ahead of UTC, the Sunday range can
start on Saturday; for any organization whose timezone differs from the server, subscribed shifts
can appear at the wrong hour or on the wrong day.
**Suggested fix:** Carry the organization IANA timezone with the calendar employee scope, derive
the query window from the organization's calendar date, and emit timed events with that timezone
(and absences as `VALUE=DATE`) without routing schedule-local values through the server timezone.
Add tests that run against a non-UTC organization and an ahead-of-UTC process timezone.
**Resolution:** 2026-09-01 by /implement. Calendar employees now carry their organization's IANA
timezone, feed query windows use organization-local date keys and UTC-safe date arithmetic, timed
events emit explicit `TZID` values, and absences emit all-day `VALUE=DATE` ranges. Focused tests
cover an ahead-of-UTC process boundary, a non-UTC organization, overnight shifts, all-day absences,
authenticated exports, and cookie-free feed polling.
Re-reviewed 2026-09-01 by /audit: token resolution still binds the active user, organization, and
employee; organization-local range calculation and timezone-bearing/all-day ICS output remain
covered without passing schedule-local values through the server timezone.

### regular-user-repairs-and-profile-consolidation/F-30 [P2] closed - Consolidated profile Overview still loads unbounded schedule history

**File:** apps/web/src/features/account/server/profile.ts:276-325; apps/web/src/components/staff-detail/StaffDetailPage.tsx:180-185
**Found:** 2026-09-01 by /audit (scope: current; lenses: performance, quality, tests)
**Why it matters:** Shift history was removed from profiles, but both self and administrator profile
loads still fetch every schedule cell ever recorded for that employee. The remaining Overview calls
the data "recent" and computes 12-week hour metrics, yet assignment distribution consumes the whole
unbounded result. Long-tenured staff therefore pay steadily growing query/mapping cost and can see a
top assignment based on years of history rather than the stated recent window.
**Suggested fix:** Define one shared Overview date window covering the current week plus the prior
11 weeks, pass it to both self and staff profile queries, and test that out-of-window rows are neither
fetched nor included in distribution metrics.
**Resolution:** 2026-09-01 by /implement. Self and staff profile Overview loads now share one
organization-timezone-aware window covering the current week plus the prior eleven weeks. The
self-service database query and staff client request both apply the range, weekly metrics use the
same boundary, and assignment distribution independently excludes out-of-window rows. Focused
tests cover date calculation, both query paths, and metric exclusion.
Re-reviewed 2026-09-01 by /audit: both profile query paths remain bounded to the shared 12-week
organization-local window, and the Overview computations independently enforce that same range.

### regular-user-repairs-and-profile-consolidation/F-31 [P2] closed - Regular-user pages issue privileged invitation requests

**File:** apps/web/src/components/staff/MembersSection.tsx:532-552; apps/web/src/components/staff-detail/StaffDetailPage.tsx:108-117; apps/web/src/components/dashboard/DashboardView.tsx:347-350
**Found:** 2026-09-01 by /audit (scope: current; lenses: security, performance, tests)
**Why it matters:** Opening People or Dashboard as a regular user, or directly navigating to a staff
profile before its redirect completes, fires invitation endpoints the role cannot use. The backend
rejects them, so this is not a data disclosure, but normal navigation creates avoidable 403 traffic,
error telemetry, and permission-dependent transient work.
**Suggested fix:** Gate invitation effects and queries before they execute: regular directory and
user-dashboard modes should never request invitation data, and staff-profile invitation loading
should wait for the employee-detail permission check.
**Resolution:** 2026-09-01 by /implement. Regular-user People mode now skips and suppresses local
invitation state, unauthorized direct staff-profile routes keep their employee invitation query
disabled until permission is established, and user dashboards use a gated invitation hook that
returns no cached administrator data while disabled. Administrator People and dashboard queries
remain active. Focused component and hook tests cover each boundary and the cached-data case.
Re-reviewed 2026-09-01 by /audit: People, staff detail, and dashboard all gate invitation work before
execution and suppress cached privileged data while disabled, while administrator queries remain
enabled.
