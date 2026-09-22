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
