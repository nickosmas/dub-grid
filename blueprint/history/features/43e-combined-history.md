# Feature: Combined history

**From build-plan:** feature 43e
**Status:** verified

## Goal

The last section of the Gridmaster person page: one filterable timeline of
everything done by or to the person, across every organization and the
platform, with export. A support or security question ("who changed her role?",
"did anyone impersonate him last week?", "when did she last reset her
password?") is answered in one place instead of by searching the platform
audit log.

## In scope

- **Sources, merged newest first:**
  - **Each staff record's organization activity**, exactly as the People page's
    Activity tab builds it (`buildEmployeeActivityRows`): the organization's
    audit rows about the record, its role-change ledger, and its invitation
    lifecycle.
  - **Everything the person did**: audit rows where they are the actor, in any
    organization or none. This covers sign-ins, refusals, password and email
    changes, two-factor changes and their own edits.
  - **Everything done to their account at platform level**: audit rows whose
    target is their account, with or without an organization (terminate,
    reinstate, two-factor reset, forced sign-out, name and email changes).
  - **Impersonations of them**, from `impersonation_sessions`: the Gridmaster,
    the organization, the justification, start, end, duration and how it ended.
    The session row carries everything the matching `impersonation.started`
    and `impersonation.ended` audit rows say, so those two rows are dropped
    for this person to avoid double entries.
  - **Schedule editor sessions of theirs that another editor ended**.
- **Filters:** the period navigator, category and organization.
- **Export:** a Gridmaster downloads the full merged history as JSON. The
  export needs fresh proof through step-up, like the platform audit export,
  and is itself audited.
- **Same audit UI:** the People Activity tab's table, details dialog, category
  options and period navigator, not a new renderer.
- **Staff record without an account:** its organization activity only, with
  the account-level sources empty.

## Out of scope

- IP addresses and user agents in the timeline: the timeline and its export
  carry neither. The person record never carries IP addresses (43b's rule).
  It does carry user agents on the account card's terms and consent rows,
  which the person-page findings fix (2026-09-28, F-96) shows as "Safari on
  Mac" with the raw string as the hint. This archive said until then that
  the record never carried them.
- Sign-in refusals recorded before any session exists: they are stored by a
  hash of the address, not by account, so the timeline cannot attribute
  them. The platform audit log still lists them.
- Editing or deleting history.
- Realtime updates: the history loads when opened and on refresh.
- Rows older than each source's cap (500 per source). The response says when
  a cap was hit, so the Gridmaster knows the view is partial and can use the
  platform audit log for older rows.

## Build loop

Each step is implemented, verified and self-reviewed on the work branch
`feature/43e-combined-history`, then committed as a local checkpoint.

## Build steps

- [x] **Step 1 - share the organization activity queries** - move
      `fetchEmployeeAuditRows` and `fetchEmployeeRoleChanges` out of
      `app/api/employees/manage/route.ts` into `lib/audit/employee-activity.ts`,
      so the manage route and the person history use one copy. The audit query
      gains an `actions` option: the People page keeps its organization-facing
      action list (the default), and the Gridmaster history passes `null` for
      every action. _Done when:_ the manage route's activity tests pass
      unchanged, the route no longer defines them, and a new test shows the
      default keeps the action filter and `null` drops it.
- [x] **Step 2 - account-level sources** - `loadAccountHistoryRows` returns, for a user id, audit-row-shaped rows from: audit rows with the person
      as actor or account target (any organization, `impersonation.started`
      and `.ended` about them removed), impersonation sessions of them, and
      editor sessions ended on them. Each source is capped at 500 and reports
      whether it hit the cap. _Done when:_ tests cover each source's query
      (actor or target, no organization filter), the impersonation duration
      and end reason, the dropped duplicate impersonation rows, no IP address
      or user agent in any row, and the cap flag.
- [x] **Step 3 - person history loader and routes** - `loadPersonHistory`
      merges Step 2 with every staff record's organization activity, removes
      duplicates by id, sorts newest first and enriches the rows with
      `enrichAuditRows`. It is served (GET) by
      `/api/gridmaster/users/[userId]/history` and
      `/api/gridmaster/staff/[employeeId]/history` behind
      `requireGridmasterSession`. _Done when:_ route tests show a Gridmaster
      gets the merged, deduplicated timeline in order, a staff record without
      an account gets its organization activity only, a non-Gridmaster is
      refused, an unknown id gets 404, and `truncated` is set when a source
      hit its cap.
- [x] **Step 4 - History card** - a collapsed "History" card, last on the
      person page, loads the route when opened and renders it with the
      Activity tab's table, details dialog, period navigator and category
      filter, plus an organization filter. It shows the organization column,
      a notice when the history is truncated, and loading, empty and error
      states. _Done when:_ view tests show nothing fetched until opened, the
      entries grouped by day, the category and organization filters narrowing
      them, the truncation notice, and a retry after an error.
- [x] **Step 5 - export with fresh proof** - `POST .../history/export` for both
      targets requires `requireSensitiveActionAuth`, returns the same merged
      entries and writes an `audit.exported` row naming the subject and row
      count. The card's Export button runs through step-up with the credential
      preflight and downloads the JSON. _Done when:_ route tests show a stale
      session exports nothing and writes nothing, a fresh one gets the entries
      and one audit row; view tests show the step-up path and a cancel that
      downloads nothing; the sensitive-action inventory classifies both
      routes. _Built:_ both are also listed as browser mutations in the
      authentication entry-point inventory.

## Files / areas

- `apps/web/src/lib/audit/employee-activity.ts` and its test;
  `apps/web/src/app/api/employees/manage/route.ts` (Step 1 move only).
- `apps/web/src/features/gridmaster/server/person-history.ts` (new) and its
  test; `apps/web/src/features/gridmaster/person-record.ts` (types).
- `apps/web/src/app/api/gridmaster/users/[userId]/history/` and
  `apps/web/src/app/api/gridmaster/staff/[employeeId]/history/` (route and
  export, with tests); `apps/web/src/features/gridmaster/client/api.ts`.
- `apps/web/src/components/gridmaster/person/PersonHistoryCard.tsx` (new) and
  its test; `GridmasterPersonView.tsx`.
- `apps/web/src/__tests__/sensitive-action-authorization-boundaries.test.ts`
  (classification).

## Data / contracts

- The timeline entries are the existing `EnrichedAuditEntry<string>` shape the
  Activity tab already renders, so no new entry type. Impersonation sessions
  and editor terminations are converted to that shape with actions
  `impersonation.session` and `schedule.editor_session_ended`, registered in
  `lib/audit/registry.ts` with labels and the person-activity categories.
- `GET .../history` answers `{ entries: EnrichedAuditEntry<string>[];
truncated: boolean }`; the export answers the same plus `exportedAt`.
- No schema change.

## Testing

- Loader tests with fake service clients (Steps 2, 3), route tests (Steps 3,
  5), view tests (Steps 4, 5), and the audit registry test for the two new
  actions.
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- The rows are read with the service client, so every organization-scoped
  query keeps its `org_id` filter; the account-level queries filter by the
  person's user id instead.
- `enrichAuditRows` resolves actors and targets; do not add a second resolver.
- Customer-facing wording says "Schedule notes", never "indicators"; this page
  is Gridmaster-only but keeps the same terms.
- Confirmations are dialogs; the export's confirm hides while step-up shows.
- No em dashes.
