# Nothing stops at the thousandth row, and two smaller gates

**Type:** Fix

**Fixes:** F-01, F-02, F-03

**Status:** verified

## The problem

- **F-01.** PostgREST caps every response at 1,000 rows
  (`supabase/config.toml:18`), which the local stack confirms applies to the
  service role: a select of `schedule_cells` (3,924 rows) returned exactly
  1,000. Two helpers await a single request and hand back whatever came:
  `fetchTableRows` (`reports/server/operations.ts:2260`), behind the
  Operations report's employees, coverage requirements, shift requests,
  schedule notes and lookup lists, and `fetchNormalizedPublishedShiftRows`
  (`lib/published-shifts.ts:228`), behind that report's published schedule,
  `/api/export`, the subscribed calendar feed and the notification events.
  `/api/export` even asks for `.limit(10000)`, which the cap overrides. A
  month of schedule for a few hundred staff is several thousand cells, so a
  real organization gets a short export, a short PDF and a short .ics with
  no error anywhere.
- **F-02.** `loadActiveLinkedEmployee`
  (`account/server/calendar-subscription.ts:80`) refuses a deactivated
  profile and one scheduled for deletion, but not a terminated one, although
  termination is how a gridmaster cuts an account off (the JWT hook refuses
  it at token issue, `requireOrgPermissions` refuses the token already
  held). A terminated person's subscribed calendar keeps receiving their
  shifts.
- **F-03.** The three cron routes compare the bearer header to
  `CRON_SECRET` with `!==`, which returns on the first differing byte.

## The fix

- **F-01.** Both helpers page through the existing `fetchAllRows`, which
  already handles the short-page and exact-multiple cases. `fetchTableRows`
  takes a page builder instead of a promise, so each call site says
  `.range(from, to)` once. `fetchNormalizedPublishedShiftRows` keeps an
  explicit `args.limit` as a real ceiling (one page of that size, as callers
  that pass it intend) and pages only when there is none.
- **F-02.** `.is("terminated_at", null)` beside the two conditions already
  in the profile lookup.
- **F-03.** One `timingSafeEqualSecret` helper, used by the three routes.

Must not break: the Operations report and its filters, CSV and PDF export,
the calendar feed for a live account, notification fan-out, and the existing
report tests.

## Build steps

- [x] **1. Paged report reads (F-01)** - `fetchTableRows` takes a builder and
      delegates to `fetchAllRows`, every call site ranges. Done when the
      report tests pass and a unit test proves two pages concatenate.
- [x] **2. Paged published schedule (F-01)** - the same for
      `fetchNormalizedPublishedShiftRows`, with `limit` kept as a ceiling.
      Done when a test shows a caller without a limit reading past 1,000 rows
      and a caller with one still getting exactly that many, and the export,
      calendar and events tests pass.
- [x] **3. Terminated accounts lose the feed (F-02)** - the condition and a
      test. Done when a terminated profile gets the 404 feed and a live one
      still gets its calendar.
- [x] **4. Timing-safe cron comparison (F-03)** - the helper, the three
      routes, tests. Done when a wrong secret, a missing secret and the
      correct one all behave as before, through the helper.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`.
- Against the local stack: a published-schedule read over a range holding
  more than 1,000 cells returns every row, where it previously stopped at
  1,000.
- `/audit` afterwards.

## Findings

### read-every-row-and-two-smaller-gates/F-01 [P1] closed - Every unpaged read silently stops at the thousandth row

**File:** apps/web/src/features/reports/server/operations.ts:2260
**Found:** 2026-09-22 by /audit (scope: full; lens: correctness, performance)
**File (also):** apps/web/src/lib/published-shifts.ts:228
**Why it matters:** `supabase/config.toml` caps every PostgREST response at 1,000 rows, and two helpers await a single request and return whatever comes back. Confirmed against the local stack: a service-role select of `schedule_cells` (3,924 rows) returned exactly 1,000, so the cap applies to the service role both use. `fetchTableRows` backs the Operations report's employees (active and archived), coverage requirements, shift requests, schedule notes and the lookup lists. `fetchNormalizedPublishedShiftRows` backs the published schedule for that report, `/api/export` (whose `.limit(10000)` cannot lift the cap), the subscribed calendar feed and the notification events. A month of schedule for a few hundred staff is several thousand cells, so a real-size organization gets an export, a PDF and an .ics that are quietly short, with no error anywhere. Same defect class as the mobile schedule truncation already fixed in `packages/data-access`; `fetchAllRows` in `lib/db/shared.ts` does it correctly three files away.
**Suggested fix:** Page both helpers through `fetchAllRows`, keeping an explicit caller `limit` as a real ceiling, and add tests that feed two pages and assert the concatenation.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commits fbdafd4a and aa0522ed). `fetchTableRows` takes a page builder and delegates to `fetchAllRows`; `fetchNormalizedPublishedShiftRows` builds a fresh query per page (a Supabase builder is single-use once awaited) and keeps a caller's `limit` as a one-page ceiling. Both end their ordering with a unique column: the first live run without that returned 3,924 rows containing duplicates, because date alone is not a total order. Against the live database the published reader now returns 3,924 unique rows where it previously returned 1,000, and an explicit limit of 7 still returns 7. The re-review then found the same cut on the mobile management roster (memberships, pending invitations and the membership lookup by id) and paged those too. The lookup tables still read in one request are bounded by an organization's configuration, well below the cap.

### read-every-row-and-two-smaller-gates/F-02 [P2] closed - A terminated account keeps its calendar feed

**File:** apps/web/src/features/account/server/calendar-subscription.ts:80
**Found:** 2026-09-22 by /audit (scope: full; lens: security)
**Why it matters:** `loadActiveLinkedEmployee` refuses a deactivated profile and one scheduled for deletion, but not a terminated one, although platform termination is what the gridmaster uses to cut an account off: the JWT hook refuses it at token issue (021) and `requireOrgPermissions` refuses the token they already hold (`permissions.ts:465`). The calendar feed reads through the service role with the opaque token as its only credential, so a terminated person's subscribed calendar keeps receiving their published shifts until someone revokes the token by hand.
**Suggested fix:** Add `.is("terminated_at", null)` to the profile check, beside the two conditions already there, and cover it in the calendar-subscription tests.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit fbdafd4a). The profile lookup behind the calendar feed now requires `terminated_at` to be null beside the two conditions it already had, and a test asserts the database is asked for exactly that. Re-read in place: this is the only gate on that route, since it answers an opaque URL rather than a session.

### read-every-row-and-two-smaller-gates/F-03 [P3] closed - Cron secrets are compared with a plain string equality

**File:** apps/web/src/app/api/cron/expire-requests/route.ts:31; apps/web/src/app/api/cron/sandbox-cleanup/route.ts:30; apps/web/src/app/api/cron/trial-expiry/route.ts:31
**Found:** 2026-09-22 by /audit (scope: full; lens: security)
**Why it matters:** All three routes compare the bearer header to `CRON_SECRET` with `!==`, which returns as soon as the first byte differs. The secret is high-entropy and the measurement would have to survive network jitter, so this is not a practical attack; it is the kind of comparison a reviewer flags on sight, and one shared helper would settle it for the three of them. All three already fail closed when the secret is unset, which is the part that matters most.
**Suggested fix:** One `timingSafeEqualSecret(header, secret)` helper in `lib/`, used by the three routes, with a test for the unset, wrong and correct cases.
**Resolution:** Fixed and closed 2026-09-22 by `/audit` re-review (scope: current; commit fbdafd4a). One `bearerMatchesSecret` helper compares through `timingSafeEqual` after a length check, used by all three cron routes; tests cover the correct credential, a wrong secret, a wrong scheme, a prefix match and a missing header. The fail-closed behaviour when `CRON_SECRET` is unset is unchanged.

### read-every-row-and-two-smaller-gates/F-04 [P2] closed - The mobile management roster stopped at the same cap

**File:** packages/data-access/src/mobile.ts:546; packages/data-access/src/mobile.ts:604
**Found:** 2026-09-22 by /audit (scope: current; lens: correctness)
**Why it matters:** Found while re-reviewing the F-01 repair. `fetchMobileManagementRosterRows` read the organization's memberships and its pending invitations with one request each, and the membership lookup by user id did the same, so a large organization's mobile management roster was cut at the same 1,000-row ceiling with no error.
**Suggested fix:** Page all three through one helper that builds a fresh query per page, ordered by a unique column.
**Resolution:** Fixed and closed 2026-09-22 (commit aa0522ed). `fetchAllMobileRows` pages them beside the existing people pager; a test feeds a full page plus two rows and asserts both ranges were requested and every row survived.
