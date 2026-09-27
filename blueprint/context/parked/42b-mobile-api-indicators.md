# Feature: Mobile API indicators

**From build-plan:** feature 42b
**Status:** in progress (parked; another session's fix holds
`current-feature.md`)

## Goal

The mobile API carries schedule indicators so 42c can show them: each mobile
schedule entry lists the indicators its viewer may see, each with its own name
and colour, and bootstrap lists the organization's active indicator types. The
draft rule is the web's, held in one shared place so the two cannot drift.

## In scope

- **One shared visibility rule.** Whoever can edit shifts or notes sees draft
  indicators, including a pending removal; everyone else sees what is
  published, with a pending removal still shown as published. Today this lives
  only in the web schedule route (`canEditShifts || canEditNotes`) and in the
  database policy; it moves to `@dubgrid/schedule-core` and the web route uses
  it unchanged.
- **Entries carry indicators.** `/me/schedule` and `/org/schedule` entries gain
  an `indicators` list: indicator type id, focus area (nullable), name, colour
  and a state of `published`, `draft_added` or `draft_removed`. Name and colour
  come from the indicator's own type, archived ones included, so a note on an
  archived type still reads correctly.
- **Bootstrap carries indicator types.** The organization's active indicator
  types (id, name, colour, sort order) for every member, as web's organization
  bootstrap already does, for 42c's legend and pickers.
- **Refresh.** An indicator change already refreshes the Schedule tab through
  the `schedule_notes` realtime event; it also refreshes the Home schedule
  card, which reads `/me/schedule` under the dashboard key.

## Out of scope

- Showing indicators on any mobile screen, and the alert destination (42c).
- Publish differences for indicators on mobile: mobile shows no publish diffs,
  and published note changes stay out of mobile publish history.
- Draft shifts on mobile: entries exist only for published shifts and
  absences, so a draft indicator on a draft-only new shift has no entry to
  ride on. It appears once the shift is published, as on mobile today.
- Indicator storage, editing permissions and the draft and publish workflow.
- Shift-request snapshots and the other secondary surfaces (42d).

## Build steps

- [x] **Step 1 - shared visibility rule** - `canSeeDraftScheduleNotes`
      (`canEditShifts || canEditNotes`) and `scheduleNotesForViewer` in `@dubgrid/schedule-core`; the web schedule route's
      `fetchScheduleNotes` uses them in place of its inline copy. _Done when:_
      schedule-core tests cover an editor (drafts and pending removals kept), a
      viewer (drafts dropped, pending removals read as published) and each
      permission alone; the web route's existing tests pass unchanged.
- [x] **Step 2 - contracts** - `mobileScheduleIndicatorSchema` and an
      `indicators` field on `mobileScheduleEntrySchema` (default `[]`), and
      `indicatorTypes` on the bootstrap response (default `[]`), in
      `@dubgrid/contracts`. _Done when:_ contract tests parse entries and
      bootstrap with and without the new fields (an older server's response
      still parses) and reject an empty colour or an unknown state
      (colours are free text in the database, so no stricter format).
- [x] **Step 3 - notes reach schedule entries** - a data-access read of the
      organization's notes for the range (and the one employee for
      `/me/schedule`), paged like the web route, joined to their indicator
      types including archived ones; `loadMobileMeSchedulePayload` and
      `loadMobileOrgSchedulePayload` take it as a dependency, apply the shared
      rule with the caller's `canEditShifts` and `canEditNotes`, and attach
      each entry's indicators by employee and date. The shared
      `fetchMobileScheduleEntries` is untouched, so the shift-request routes
      pay nothing. _Done when:_ core tests show a viewer gets published
      indicators only, an editor gets drafts with their states, an entry
      without notes gets `[]`, a note on a date with no entry is dropped, and
      an archived type keeps its name and colour; route tests for both
      endpoints pass the new dependency and the effective organization.
- [x] **Step 4 - bootstrap indicator types** - `fetchMobileIndicatorTypes`
      (active, in sort order) as a `loadMobileBootstrapPayload` dependency.
      _Done when:_ the core and bootstrap route tests show the types for a
      regular member and an empty list for an organization with none.
- [ ] **Step 5 - Home card refresh** - the mobile realtime map sends
      `schedule_notes` changes to the dashboard key as well as the schedule
      prefix; the mobile client parses entries with indicators. _Done when:_
      the invalidation test shows both keys for `schedule_notes`, and an
      `api.test` case parses an entry carrying indicators.

## Files / areas

- `packages/schedule-core` (the rule and its tests).
- `packages/contracts/src/mobile.ts` and its tests.
- `packages/data-access/src/mobile.ts` (the notes read) and its tests.
- `packages/mobile-api-core/src/read.ts` and `read.test.ts`.
- `apps/web/src/features/mobile/server/data.ts` and the `me-schedule`,
  `org-schedule` and bootstrap routes with their tests.
- `apps/web/src/app/api/schedule/manage/route.ts` (uses the shared rule).
- `apps/mobile/src/shared/lib/mobile-realtime-invalidation.ts`, `api.test.ts`.

## Data / contracts (load-bearing for 42c)

- `MobileScheduleIndicator`: the indicator type id (`indicatorTypeId`), its
  focus area (`focusAreaId`, a number or null), `name`, `color`, and `state`,
  one of `published`, `draft_added` or `draft_removed`. One entry can carry indicators for several focus areas
  (a note is keyed by employee, date, type and focus area); 42c decides how to
  show them.
- `MobileScheduleEntry.indicators: MobileScheduleIndicator[]`, default `[]`.
- `MobileBootstrap.indicatorTypes`: a list of `id`, `name`, `color` and
  `sortOrder`, default `[]`, active types only.
- No schema change, no new route.

## Testing

- Unit tests for the shared rule, the contracts, the notes read, the core
  loaders, the routes and the realtime map, following `read.test.ts`,
  `data.test.ts` and the route tests' mocking pattern.
- Contract changes run `npm --workspace @dubgrid/contracts run test`,
  `npm run test:web` and `npm run test:mobile`; rebuild packages
  (`npm run build:packages`) before testing consumers.
- Final gate: `npm run type-check`, `npm run test`, `npm run lint`.

## Notes for the AI

- Scope every read by the caller's effective (sandbox-aware) organization id
  from mobile auth, never a client-supplied one.
- The service client reads notes, so the shared rule is the only thing
  keeping drafts from viewers: test it at the loader, not only in the package.
- Keep the new fields defaulted so older app builds and older servers still
  parse each other's payloads.
- No em dashes.
