# Feature: Client scheduling documentation completeness

**From build-plan:** feature 40e1
**Status:** verified

## Goal

Give every client-facing scheduling capability one accurate, discoverable
Mintlify explanation, including its role, web or mobile availability, lifecycle
state, and adjacent configuration. Add a source-evidenced coverage gate so a
schedule capability cannot silently lose its documentation.

## In scope

- A scheduling-capability coverage record for schedule reading, authoring,
  drafts and publishing, recurring patterns and series, coverage and open
  shifts, notes, requests, real-time collaboration, history and outputs,
  scheduling configuration, and mobile schedule actions.
- Client guides that cover every supported scheduling task and its deliberate
  web/mobile boundary, including normal, unpublished, empty, unavailable,
  conflict, loading, error, offline, and retry behavior where the product
  exposes it.
- Clear roles for Staff, Admins, and Super Admins, without exposing internal
  platform roles or operations.
- Client-safe terminology enforcement for all published MDX and Mintlify
  navigation.
- Updated navigation, links, manifest evidence, and fingerprints for every
  changed or added guide.

## Out of scope

- Product behavior, permissions, APIs, database schemas, or mobile feature
  parity changes.
- Runtime qualification in Chromium, Firefox, WebKit, iOS, or Android. Those
  are features 40e2 and 40e3.
- Database rehearsal, hooks, CI enforcement, deployment, or publication.
  Those are feature 40e4 or separately authorized release work.
- Non-scheduling client-guide rewrites, except for a necessary inbound or
  outbound link.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - Define the scheduling coverage contract** - Add an
      internal, source-evidenced scheduling-capability manifest and validate its
      IDs, source/test references, roles, platforms, states, target page, and
      heading anchor in the existing documentation checker. _Done when:_ every
      current scheduling capability has one unique record; a missing, duplicate,
      stale, unmapped, or unlinked record fails a focused contract test and
      `npm run docs:check`.
- [x] **Step 2 - Document reading, navigating, and editing the web schedule**
  - Make the Schedule Grid and a focused tools guide cover every web view,
    date and pay-period navigation, filtering, search, sort, published-state
    boundary, shift/off-day editing, custom time, undo, copy/paste, drag/move,
    drag/copy, eligibility feedback, import-previous, bulk delete, print, CSV,
    authors, and history action. _Done when:_ each capability in the contract
    maps to an exact client-facing section with role and web-only conditions.
- [x] **Step 3 - Document the draft, recurring, and collaboration lifecycle**
  - Expand the draft/publish, recurring-shifts, and collaboration guides for
    draft kinds, period boundaries, cross-editor changes, publish/discard
    choices and warnings, change highlighting, recurring weekly patterns, Auto
    Fill, individual repeat series, series removal, editor presence, stale
    edits, and same-account sessions. _Done when:_ client guides distinguish
    what is immediately visible from what remains a draft, and every lifecycle
    state has its source-backed explanation.
- [x] **Step 4 - Document staffing, requests, notes, and configuration** -
      Add or expand guides for coverage rows and gaps, qualified open-shift
      filling, staff pickup offers, schedule notes, pickups, swaps, call-offs,
      approval and settlement, request-board states, alerts, and every scheduling
      setting that controls eligibility, display, conflict prevention, pay period,
      coverage, and staff visibility. _Done when:_ the guide tells both staff and
      managers what they can do, what needs approval, and what setting controls
      the result.
- [x] **Step 5 - Document the mobile schedule and shift-detail boundary** -
      Publish a focused mobile schedule guide covering calendar/week navigation,
      focus-area selection, team and personal schedule states, shift details,
      pickup, swap, call-off, request feedback, and recovery states; state that
      schedule authoring and publishing remain web-only. _Done when:_ mobile
      clients can complete every supported schedule action without being directed
      to a nonexistent mobile control.
- [x] **Step 6 - Make the client information architecture and language safe**
  - Update Mintlify navigation, cross-links, redirects where a moved URL needs
    preservation, and the client landing paths; remove the repository-primary
    navigation affordance in favor of a client support destination when one is
    configured. Extend the public-content check to reject the prohibited
    platform-role term and other internal scheduling references. _Done when:_
    every scheduling guide is reachable from task-oriented navigation, all links
    resolve, and the rejection tests prove internal terminology cannot publish.
- [x] **Step 7 - Reconcile evidence and verify the complete documentation
      surface** - Refresh the accuracy manifest and fingerprints for the changed
      pages, review the coverage matrix against the web, mobile, shared-domain,
      and Settings source, then run the documentation and focused contract suites.
      _Done when:_ the coverage matrix has no unreviewed client scheduling entry,
      `npm run docs:verify` passes, and the strict closed-manifest check passes;
      remaining runtime evidence is explicitly handed to 40e2 and 40e3.

## Files / areas

- `internal/documentation/scheduling-capability-coverage.json` (new) and
  `internal/documentation/accuracy-manifest.json`
- `scripts/documentation/contract.ts`, `scripts/documentation/check.ts`, and
  their focused fixtures/tests under `apps/web/src/__tests__/`
- `docs/docs.json`, `docs/index.mdx`, and the existing scheduling, request,
  configuration, alert, dashboard, report, integration, and mobile guides
- New focused client guides under `docs/features/` only when splitting a broad
  page makes a complete task easier to find

## Data / contracts

- The scheduling-capability record is load-bearing documentation metadata. It
  includes a stable ID, capability group, client roles, platform availability,
  meaningful states, source files, test files, and a public documentation
  target (`file` plus heading anchor).
- The checker must verify that every record is unique, evidence paths exist,
  the target file and anchor exist, and the target is a published Mintlify page.
- No application data or API contract changes are permitted.

## Testing

- Add focused contract tests for valid coverage and each rejected condition:
  duplicate or missing ID, missing source/test evidence, unknown role/platform
  or state, missing file/heading, unregistered page, and prohibited client
  terminology.
- Run the relevant web documentation tests, `npm run docs:check`,
  `npm run docs:validate`, `npm run docs:links`, and `npm run docs:check --
--require-closed` before handoff. Run `npm run docs:verify` as the final
  documentation gate.
- Manually preview each changed guide in Mintlify and check the Staff, Admin,
  Super Admin, web, and mobile paths named in its coverage record. Do not claim
  cross-browser or physical-device runtime qualification here.

## Notes for the AI

- Customer documentation stays in `docs/`; engineering and operational detail
  stays under `internal/` and is never published.
- Use Organization, never `org` or workspace. Treat configurable labels as
  configurable, not fixed. Use active, second-person, concise client copy.
- Keep platform-only names, operations, internal endpoints, test environments,
  feature controls, migrations, and environment details out of published copy.
- Preserve existing valid URLs or add permanent redirects for moved pages.
- The shared checkout has unrelated untracked architecture notes. Do not stage,
  modify, or delete them.

## Findings

### 40e1/F-102 [P3] closed - Two-factor reset follow-ups

**File:** `apps/web/src/emails/TwoFactorResetEmail.tsx:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.ts:24`; `apps/web/src/features/gridmaster/server/two-factor-reset.test.ts:14`; comments at `terminate/route.ts:71` and `gridmaster/users/route.ts:225`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-90
**Why it matters:** a partial reset still emails "signed you out everywhere" although `endUserSessions` never ran; the re-enrollment flag is set before any factor is removed, so a failure in `listFactors` leaves the person gated to re-enroll with no record or email; no test makes the profile update or `endUserSessions` fail after every factor is gone; two comments still describe watermark-only revocation.
**Suggested fix:** a `partial` prop with softer wording; set the flag after the first removal, or record the attempt; the two failure tests; refresh the comments.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 3): `TwoFactorResetEmail` takes `partial`, and a partial reset's notice says some devices may still be signed in and asks the person to sign out of any they don't recognize, never "everywhere"; the route passes `partial` to the notice. `resetPersonTwoFactor` lists factors before setting the re-enroll flag, so a failed list changes nothing, while the flag still precedes every removal. Tests cover the failed list, a failed two-factor switch-off and a failed session ending after both factors are gone (each a partial error counting 2), and both email wordings; the old helper and email fail them. The stale comment in `gridmaster/users/route.ts` now describes `endUserSessions`; the terminate route's was replaced under F-101 by its own session. Closed 2026-09-28 by `/audit` of 2a02d54c: the reset lists factors before the flag and flags before any removal; the partial notice's wording never says "everywhere" and the route passes `partial` only on `PartialTwoFactorResetError`; the three failure paths and both wordings are tested.

### 40e1/F-103 [P3] closed - Each step-up-refused status change is sent three times, and a bulk can partly apply

**File:** `apps/web/src/components/staff/useSharedStepUp.tsx:21`; `apps/web/src/hooks/useStepUpAction.tsx:43`; `apps/web/src/app/api/employees/status/route.ts:61`; `apps/web/src/app/api/employees/status/route.test.ts:163`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** the refused first send, then `stepUp.run`'s own attempt with the current token before it prompts, then the retry: three requests per row against `apiLimiter` (10 per 10 s), which the route checks before the gate. A Gridmaster's bulk of five or more confirmed quickly can hit 429 on the last retries and apply only part of the batch, which F-98's quiet-cancel counting then reports as done (unverified in a browser). The status route test covers only `deactivate`, not `remove`, `activate` staying ungated, or a Gridmaster with fresh proof going on to write.
**Suggested fix:** a "prompt now" entry on `useStepUpAction` that skips the first attempt, bounded bulk concurrency, `toHaveBeenCalledTimes` in `useSharedStepUp.test.tsx`, and the three route cases.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 4, on c6dfdb51): `useStepUpAction` gains `prompt(action, method)`, which opens the dialog at once; `useSharedStepUp` uses it after a refusal, so a refused row is sent twice (the refusal, then the assured retry) and never three times. The bulk runs its status changes through `mapInBatches` three at a time. Tests: call counts in `useSharedStepUp.test.tsx`, `prompt` asking before any send, a five-person bulk never exceeding three in flight, and in the status route a Gridmaster's removal gated, reactivation ungated, and a fresh Gridmaster going on to the record. Reverting the hook or the bulk fails them. Closed 2026-09-28 by `/audit` of 2a02d54c: `prompt` shares `run`'s guard and cleanup through `waitForProof`, so existing callers are unchanged; `useSharedStepUp` prompts at once after the refusal (two sends per refused row, asserted); the bulk runs through `mapInBatches` three at a time and still reports each result, so F-98's counting holds; the route's remove, activate and fresh-proof cases are tested.

### 40e1/F-104 [P3] closed - Consent-row device labels over-claim the DubGrid app

**File:** `apps/web/src/lib/user-agent-label.ts:13`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-96
**Why it matters:** any CFNetwork and Darwin client (a Mac app, an iPad, any iOS app) reads "DubGrid app on iPhone", and any `okhttp/` client "DubGrid app on Android", on rows kept as consent evidence from a client-set header; the card says "Mac" and "Windows" where the sessions list says "Macintosh" and "Windows PC".
**Suggested fix:** require the app's own `DubGrid/` token before naming the app, fall back to a neutral label, and share one vocabulary with the sessions list.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 1): the app is named only for an agent starting with the iOS app's own `DubGrid/` bundle token; any other CFNetwork agent reads "iPhone or iPad app" and `okhttp/` reads "Android app". Decision (owner delegated, 2026-09-28): keep the owner's F-96 wording "Safari on Mac" rather than the sessions list's "Macintosh"; the two lists keep their own vocabularies. Tests cover all three native agents; the old helper fails them. Closed 2026-09-28 by `/audit` of 2a02d54c: the app is named only for a `DubGrid/` agent and other native agents read neutrally. Keeping "Mac" over the sessions list's "Macintosh" is recorded as the owner-delegated decision.

### 40e1/F-105 [P3] closed - The person history's detail stripping is a narrow denylist, and two edge cases drop events

**File:** `apps/web/src/features/gridmaster/server/person-history.ts:163`, `:237`, `:100`
**Found:** 2026-09-28 by `/audit` (scope: fixed-finding re-review at 1924880c; all lenses), reviewing F-85 and F-87
**Why it matters:** no leak today (every current writer puts IP and user agent in columns and only the three hash keys in `details`), but only three top-level keys are removed, so a later writer adding `ipHash`, `userAgent` or a nested hash would reach the history and its export; the F-87 filter compares `actor_id` to a `userId` the route accepts in any case, so an uppercase id would drop the person's own impersonation actions (unverified, clients send lowercase); an impersonation older than the newest 500 sessions is now missing rather than duplicated (`truncated` is set).
**Suggested fix:** strip keys matching a hash, IP or user-agent pattern at any depth (or an allowlist per action), lowercase the id at the route, and say in the card when the session list was capped.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 2): `withoutNetworkDetails` now drops, at any depth of `details` (objects and arrays), every key whose name ends in `hash`, is `ip`, starts with `ipaddr` or contains `useragent` once case, `_` and `-` are ignored; `loadPersonHistory` lowercases a user target's id before querying and before the F-87 comparison. The cap needed no change: the card already warns the history is partial whenever any source, the impersonation sessions included, returned its full read. Tests with nested and renamed keys and an uppercase id fail against the old code. Closed 2026-09-28 by `/audit` of 2a02d54c: network keys are dropped at any depth and the account id is lowercased before the F-87 comparison. Every current writer (`employees/identity`, `employees/manage`, `employees/status`, `organizations/access`) stores the IP in the `ip_address` column, which is dropped too; a future camelCase key such as `clientIp` would not match, which no writer uses today.

### 40e1/F-110 [P3] closed - The person page's request lists do not say they stop at 90 days

**File:** `apps/web/src/components/gridmaster/person/PersonScheduleSection.tsx:167`, `:195`; `apps/web/src/features/gridmaster/server/person-activity.ts:117`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; all lenses)
**Why it matters:** "Shift requests" has always shown open requests plus the last 90 days, and since F-92 "Profile change requests" does too (before, it listed every one ever made), but neither title says so, unlike "Publish changes, last 90 days". A Gridmaster looking for an older resolved request reads an empty list as "none".
**Suggested fix:** Title both groups "..., open and last 90 days", or keep profile change requests unbounded (they are few) and label only shift requests.
**Resolution:** Fixed in fix/person-page-audit-follow-ups (step 1): both groups are titled "…, open and last 90 days", matching "Publish changes, last 90 days". Closed 2026-09-28 by `/audit` of 2a02d54c: both request groups read "…, open and last 90 days", and the section test finds them by those titles.

### 40e1/F-111 [P3] closed - Migration 066 has no live test

**File:** `supabase/migrations/066_person_history_target_index.sql`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: tests)
**Why it matters:** `gridmaster_user_emails` returns any account's email and is safe only because of its grants. The refusal for `anon` and `authenticated` and the index plan were proven by hand in a rolled-back transaction, but nothing re-checks them, unlike 063 and 064, which run from their files in live tests. A later broad grant would expose every email silently.
**Suggested fix:** A live test that runs 066 from its file in a rolled-back transaction and asserts `has_function_privilege` is false for `anon` and `authenticated` and true for `service_role`, and that the function returns a seeded user's email.
**Resolution:** Fixed in fix/migration-066-live-test: `migration-066-person-history.integration.test.ts` runs 066 from its file inside a rolled-back transaction (taking `audit_log`'s share lock first) and asserts that only `service_role` may execute `gridmaster_user_emails`, that an `authenticated` call is refused, that it returns a seeded account's email and nothing for an unknown id, and that the history's OR plans through `idx_audit_log_details_target_user` with sequential scans off. A copy of 066 granting `authenticated` fails two cases; one without the index fails the plan case. Passes alone and in the full `test:web` (5,209). Closed 2026-09-28 by `/audit` of 19e2e61a (in the ledger at 2a02d54c): the live test runs 066 from its file under a share lock, asserts the three grants, the refused signed-in call, the lookup and the index plan, and failed against a copy granting `authenticated` and one without the index.

### 40e1/F-112 [P3] invalid - Migration 066 locks `audit_log` writes while its index builds

**File:** `supabase/migrations/066_person_history_target_index.sql:15`
**Found:** 2026-09-28 by `/audit` (scope: fix/person-page-follow-ups; lens: performance)
**Why it matters:** `CREATE INDEX` without `CONCURRENTLY` blocks inserts into `audit_log` for the length of the build, and every audited action writes there. Harmless at today's sizes, but production's row count was not measured.
**Suggested fix:** Read production's `audit_log` row count (read-only) during the release rehearsal and time the build on the scratch stack; if it is more than a few seconds, build the index `CONCURRENTLY` outside the migration transaction.
**Resolution:** 066 applied to production 2026-09-28 in one statement with no measured stall: production's `audit_log` held about 230 rows (248 kB), a read-only count taken by the person-page session, so the build locked writes for a negligible time and no `CONCURRENTLY` split was needed. Left `unverified` for `/audit` to settle; a later large-table index would need the concurrent build. Re-examined 2026-09-28 by `/audit`: production's `audit_log` held about 230 rows (248 kB) when 066 was applied, so the build's write lock was negligible; the risk does not hold at this size, and a future large-table index would need its own `CONCURRENTLY` plan.
