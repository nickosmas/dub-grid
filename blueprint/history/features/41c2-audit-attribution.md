# Feature: Audit attribution

**From build-plan:** feature 41c2
**Status:** verified

## Goal

The security log should say what actually happened to a sign-in, and against
the organization it actually happened in. Today a web sign-in refused after the
password was accepted (the Gridmaster portal rule, a closed, missing or
suspended organization, no membership in the host organization) leaves no
record and leaves the new Auth session alive; an unconfirmed email is recorded
as a successful sign-in; the second-factor completion can be recorded any
number of times for one session; an invitation acceptance's sign-in is never
recorded; and an impersonation's start and end take their organization from
the request, so the end can be written for any organization, repeatedly, even
when nothing ended.

## In scope

- **Web sign-in denials are recorded and end their session.** Every refusal
  after the password is accepted writes `security.auth.login` `rejected` with
  a specific reason and the person, and ends the Auth session the password
  just created. It names an organization only once membership is proven (a
  failed refresh after a successful switch); a lookup outage or a failed
  refresh is `failed` with `service_unavailable`.
- **Only a completed sign-in is a success.** An unconfirmed email is recorded
  as `challenged` (`email_unconfirmed`). A challenge names the session's
  organization only when it is the host's; otherwise the person may not be a
  member, and no organization's log carries it.
- **A completed sign-in is recorded once per session.** `/login/complete`
  records its success at most once per Auth session.
- **An invitation acceptance's sign-in is recorded.** After the accept page
  signs the invitee in, the same completion endpoint records it once, as a
  password sign-in.
- **Impersonation start and end name the session's organization.** Both read
  it from the `impersonation_sessions` row, never the request. An end that
  ended nothing records nothing.

## Out of scope

- Mobile sign-in denials (already recorded; their live session is 41d).
- Sign-ins that never report to `track-session` (41c open finding).
- Impersonation notices and email copy (41c3).
- Recording the proxy's escape end (`/gridmaster` while impersonating): it
  would put a service-role audit write in the middleware. Recorded as a
  finding.

## Build loop

Continuous Mode: each step is implemented, verified and self-reviewed, then
committed as a local checkpoint.

## Build steps

- [x] **Step 1 - denial reasons and headlines** - add
      `organization_unavailable`, `organization_access_denied`,
      `gridmaster_portal_required` and `email_unconfirmed` to the reasons,
      with Activity headlines. _Done when:_ registry tests cover each.
- [x] **Step 2 - web denials recorded and their session ended** - the login
      route records each refusal and ends the new session; unconfirmed email
      is `challenged`. _Done when:_
      route tests prove each denial branch records its reason and ends the
      session, and a success still records once.
- [x] **Step 3 - completion recorded once per session** - `/login/complete`
      keys its record on the Auth session and skips a repeat; it also accepts
      a fresh password sign-in so the accept page can record its sign-in.
      _Done when:_ route tests prove a repeat call writes nothing and a stale
      session writes nothing.
- [x] **Step 4 - invitation acceptance recorded** - the accept page calls the
      completion endpoint after it signs in (and after a second factor).
      _Done when:_ page tests prove the call after a successful sign-in and
      none after a failed one.
- [x] **Step 5 - impersonation names its session's organization** - start
      and end read the row; an end with no live row returns 404 and records
      nothing. _Done when:_ route tests prove a body organization is ignored
      and an ended or foreign session writes nothing.
- [x] **Step 6 - audit repairs** - F-23 (an outage is a failure), F-24
      (mobile and reauthenticated sessions carry their hash), F-27 (a failed
      read never fails a start), F-30 (no organization for a possible
      non-member) and F-31 (reason lookup on own keys). _Done when:_ each has
      a test that fails without it.

## Files / areas

- `apps/web/src/lib/auth/security-audit.ts`, `lib/audit/registry.ts`.
- `app/api/auth/login/route.ts`, `app/api/auth/login/complete/route.ts`,
  `lib/auth/sign-in-completion.ts`.
- `app/(app)/accept-invite/page.tsx`.
- `app/api/gridmaster/impersonation/route.ts`.

## Data / contracts

- No migration. New `SecurityEventReason` values; the audit row shape is
  unchanged.

## Testing

- Route, page and registry tests per step.

## Notes for the AI

- Organization context comes from verified claims, the host lookup or the
  impersonation row, never a request body.
- Ending a denied session uses `endUserSession` (provider first, then marker).
- No em dashes.

## Verification notes

- Full `npm run test` (mobile 1324/1324, web 4564/4564) and `npm run build`
  passed on the final commit.
- The proxy's escape end stays unaudited (F-33), and the audit table's
  open insert policy (F-32) remains the owner's decision.

## Findings

### 41c2/F-23 [P3] closed - An organization lookup outage was recorded as a closed organization

**File:** `apps/web/src/app/api/auth/login/route.ts:127`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Every non-`found` lookup became `rejected` / `organization_unavailable`, so a Redis or database outage read as "organization closed or suspended".
**Suggested fix:** Record `error` and `unconfigured` as `failed` / `service_unavailable`, and word the headline for a missing organization too.
**Resolution:** Outages record `failed` / `service_unavailable`; the headline reads "organization unavailable". A route test throws from the lookup. Re-review (596d149b): closed.

### 41c2/F-24 [P3] closed - The completion endpoint could record a sign-in already recorded elsewhere

**File:** `apps/web/src/app/api/auth/login/complete/route.ts:46`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** A mobile password success and a reauthentication's replacement session carried no session hash, so a completion call for either wrote a second "Signed in" row.
**Suggested fix:** Mark both with the session hash and match any `security.auth.login` or `security.auth.mfa` success.
**Resolution:** Mobile password successes and `reauthenticated` events carry `sessionHash`; `hasRecordedSignIn` checks both actions. Tests cover the hash helper, the reauthentication record and the widened query. Re-review (596d149b): closed.

### 41c2/F-27 [P3] closed - A failed row read after an impersonation start returned 500

**File:** `apps/web/src/app/api/gridmaster/impersonation/route.ts:176`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The session had already started, so the client held no cookie and every retry got 409 until it expired.
**Suggested fix:** Catch the read and record the start with no organization.
**Resolution:** The read is caught and logged; a route test proves the start still succeeds and records `org_id: null`. Re-review (596d149b): closed.

### 41c2/F-30 [P2] closed - Refusal and challenge rows named an organization the person may not belong to

**File:** `apps/web/src/app/api/auth/login/route.ts:303`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** The host organization's super admin can read `audit_log` rows for their organization through PostgREST, so a non-member's user id and email hash would reach another tenant.
**Suggested fix:** Leave `org_id` null unless membership is established.
**Resolution:** Access-denied and suspended refusals record no organization; a challenge names the session's organization only when it is the host's (or there is no host). Route tests cover both. Re-review (596d149b): closed.

### 41c2/F-31 [P3] closed - A forged audit reason could reach the object prototype in the security headline

**File:** `apps/web/src/lib/audit/registry.ts:347`
**Found:** 2026-09-25 by `/audit` (scope: current, bdbbd4cc..8246596c; all lenses)
**Why it matters:** Audit rows can be inserted by any signed-in user, and a reason such as `constructor` would render function source.
**Suggested fix:** Look reasons up with `Object.hasOwn`.
**Resolution:** Done; a registry test renders a `constructor` reason as a plain rejection. Re-review (596d149b): closed.
