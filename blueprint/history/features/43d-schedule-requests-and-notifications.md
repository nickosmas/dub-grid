# Feature: Schedule, requests and notifications

**From build-plan:** feature 43d
**Status:** verified

## Goal

The Gridmaster person page (43b, 43c) shows everything about a person's
account and organizations, but nothing about their work or their inbox. 43d
adds, for each organization the person is on staff in, their schedule and
requests, and for the account, their notification preferences and recent
notifications. It stays read-only and well organized: a support question
("why was I dropped from Tuesday?", "I never got the alert") can be answered
from this one page.

## In scope

- **Per organization, per staff record, on demand.** A "Schedule and
  requests" section inside each staff record on an organization card, loaded
  when it is opened so the page itself stays as fast as today. It works for a
  staff record without an account too (the staff-only person page).
  - **Recurring schedule** - each recurring shift (day, what is worked or the
    absence, effective from and until), and each shift series (frequency,
    days, start, end or count).
  - **Shifts** - the last 28 days and the next 56, newest first: date, what is
    worked (the organization's own shift code and job labels) or the absence,
    custom times, and both the published and the draft state where they
    differ, marked as coming from recurring or a series.
  - **Indicators** on those days: name, draft or published.
  - **Publish changes** that affected them in the last 90 days: when, from and
    to, and who published.
  - **Shift requests** on either side (pickup, swap, call-off), all open ones
    plus the last 90 days: type, status, their side and the partner, dates,
    the admin's note and who settled it.
  - **Profile change requests** they submitted: what they asked for, status,
    the resolver and note.
- **Notifications (account only).** A Notifications card after Sessions and
  devices: every preference as it is stored, and the latest 50 notifications
  with type, category, priority, title, message, organization, and read or
  archived times. A staff record without an account shows no card.
- **Every staff record.** Inactive and removed records load like active
  ones, and archived recurring shifts and series show with their archive
  date; a Gridmaster answering support needs the history, not only the
  current roster.
- **Read only.** No new actions. The page already links each organization's
  People page for edits.

## Out of scope

- The combined history timeline and export (43e).
- Editing schedules, settling requests or changing preferences from the portal.
- Realtime refresh of these sections (F-83 is about batching the existing
  invalidation); they refresh when reopened or on the page's refresh.
- Push delivery receipts and email logs, which DubGrid does not store.

## Build loop

Each step is implemented, verified and self-reviewed on `dev`, then committed
as a local checkpoint.

## Build steps

- [x] **Step 1 - schedule loader and route** - `loadPersonSchedule` (server)
      reads one staff record's recurring shifts, series, shifts in the window
      (through `mapNormalizedScheduleCellRowToScheduleEntry` with the
      organization's `fetchAssignmentLabelMap`, so snapshots stay the source
      of truth) and indicators on those days; the route
      `/api/gridmaster/staff/[employeeId]/activity` returns it (GET) behind
      `requireGridmasterSession`. _Done when:_ route tests show a Gridmaster
      gets the schedule with labels resolved and both states where they
      differ, a shift on an archived shift code still labelled, an inactive or
      removed staff record still loaded, a non-Gridmaster refused, an unknown
      staff id 404, and every query scoped to that staff record and its
      organization.
- [x] **Step 2 - requests and changes** - the same loader adds publish changes
      (90 days), shift requests on either side (open plus 90 days, partner
      names and settler resolved), and profile change requests. _Done when:_
      loader tests cover a request where the person is the requester, one
      where they are the target, an open request older than 90 days kept, and
      a publish change row with its publisher.
- [x] **Step 3 - notifications route** -
      `/api/gridmaster/users/[userId]/notifications` (GET) returns the stored
      preferences and the latest 50 notifications (every stored column), behind `requireGridmasterSession`.
      _Done when:_ route tests show the preferences and the 50-row cap, a
      person with no preferences row, and a non-Gridmaster refused.
- [x] **Step 4 - Schedule and requests section** - each staff record on an
      organization card gets a collapsed "Schedule and requests" section that
      loads Step 1's route when opened, with loading, empty and error states,
      and groups: Recurring, Shifts, Publish changes, Shift requests, Profile
      change requests. Labels come from the organization's terminology.
      _Done when:_ view tests show nothing requested until opened, each group
      rendered from a fixture, the empty state per group, and a retry after
      an error.
- [x] **Step 5 - Notifications card** - after Sessions and devices, for a
      person with an account: preferences as a list and the recent
      notifications with read and archived state. _Done when:_ view tests
      show both, no card on the staff-only page, and the empty inbox state.

## Files / areas

- `apps/web/src/features/gridmaster/server/person-activity.ts` (new) and its
  test; `apps/web/src/features/gridmaster/person-record.ts` (types).
- `apps/web/src/app/api/gridmaster/staff/[employeeId]/activity/route.ts` and
  `apps/web/src/app/api/gridmaster/users/[userId]/notifications/route.ts`
  (new) with tests; `apps/web/src/features/gridmaster/client/api.ts`.
- `apps/web/src/components/gridmaster/person/PersonOrganizationCard.tsx`,
  `GridmasterPersonView.tsx`, new `PersonScheduleSection.tsx` and
  `PersonNotificationsCard.tsx`, with view tests.
- `apps/web/src/app/api/shared/schedule.ts` (reused, not changed).

## Data / contracts

Load-bearing for 43e, which reads the same rows into its timeline:

```ts
interface GridmasterPersonSchedule {
  window: { from: string; to: string }; // 28 days back, 56 ahead
  recurring: {
    id: string;
    dayOfWeek: number;
    label: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    archivedAt: string | null;
  }[];
  series: {
    id: string;
    label: string;
    frequency: string;
    daysOfWeek: number[];
    startDate: string;
    endDate: string | null;
    maxOccurrences: number | null;
    archivedAt: string | null;
  }[];
  shifts: {
    date: string;
    published: string | null;
    draft: string | null;
    customStart: string | null;
    customEnd: string | null;
    source: "recurring" | "series" | "manual";
    updatedAt: string;
  }[];
  indicators: { date: string; name: string; status: "published" | "draft" | "draft_deleted" }[];
  publishChanges: {
    publishedAt: string;
    date: string;
    from: string | null;
    to: string | null;
    publishedBy: string | null;
  }[];
  shiftRequests: {
    id: string;
    type: "pickup" | "swap" | "calloff";
    status: string;
    side: "requester" | "target";
    partner: string | null;
    shiftDate: string | null;
    partnerShiftDate: string | null;
    adminNote: string | null;
    settledBy: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  profileChangeRequests: {
    id: string;
    type: string;
    status: string;
    requested: Record<string, unknown>;
    note: string | null;
    resolverNote: string | null;
    resolvedBy: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  actors: Record<string, string>; // user id to email, as the record's
}
interface GridmasterPersonNotifications {
  preferences: Record<string, unknown> | null;
  notifications: {
    id: string;
    orgId: string | null;
    type: string;
    channel: string | null;
    category: string | null;
    priority: string | null;
    title: string;
    message: string;
    metadata: Record<string, unknown> | null;
    readAt: string | null;
    archivedAt: string | null;
    createdAt: string;
  }[];
}
```

`label`, `published` and `draft` are display labels built server-side from
the organization's assignments (archived ones included, so old shifts still
read correctly) and absence types; the stored state shapes never reach the
client. No schema change.

## Testing

- Loader and route tests with mocked service clients (Steps 1 to 3); view
  tests in the pattern of `GridmasterPersonView.test.tsx` (Steps 4, 5).
- Final gate: `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- The routes are read-only service-role reads for a Gridmaster: classify them
  wherever the service-role and sensitive-action inventories require it (read
  routes need no fresh proof, like the person GET).
- Every query filters by the staff record's own `org_id` as well as its id.
- The schedule snapshot is the source of truth; do not read the cell's
  top-level fields for what is worked.
- Organization labels come from the record's `terminology`, never hard-coded.
- Operational dates and times use `dg-tabular-nums`. No em dashes.
