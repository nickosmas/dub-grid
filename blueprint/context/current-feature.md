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
