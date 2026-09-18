# Feature: Web alerts go to their subject

**From build-plan:** feature 39b
**Status:** verified

## Goal

On web, tapping an alert takes the reader to what it is about and marks it
read on the way, in the bell popup and on `/alerts`. The detail modal goes for
organization users; gridmasters keep a Details disclosure for platform rows.
Every row reads as a title over its content.

## In scope

- `/schedule` honors `?date=YYYY-MM-DD` (open on that week) and
  `?requests=mine|approval` (open the request board on that tab), then clears
  the parameters so they do not stick to later navigation.
- The contract amendment: invitation alerts land on `/people`, where an
  invited member is a row of the directory (there is no invitations section).
- `/alerts` rows: the row itself goes to its destination and marks the alert
  read; the per-row action button goes (the row is the action); mark read /
  unread and archive stay. The detail modal is removed. A row with no
  destination (a gridmaster's platform row) toggles an inline Details
  disclosure holding the platform-audience metadata. Organization users see
  any human note inline under the message.
- `?open=<id>` resolves the alert the same way: mark read, then go to its
  destination; with none, expand the disclosure.
- Bell popup rows link to the destination (or `/alerts` when there is none),
  mark read on click, and close the popover. The gridmaster portal's bell
  keeps `onOpenItem` so a platform row opens in the portal inbox.
- Text hierarchy: page rows use `--dg-fs-body-sm` 600 (700 unread) for the
  title, `--dg-fs-label` in `text-secondary` for the message, footnote in
  `text-subtle` for the time; bell rows use `--dg-fs-label` 600 (700 unread),
  `--dg-fs-caption` in `text-secondary`, and footnote in `text-subtle`.

## Out of scope

- The single toolbar and the sidebar removal (39c).
- Mobile (39d).
- Any change to how alerts are produced.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Schedule parameters and the contract amendment.**
      `SchedulerPageClient` reads `date` and `requests` with `useSearchParams`
      and hands them to `SchedulerContent` as `initialDate` and
      `openRequests`; `weekStart` starts on that date's week and the request
      board opens on that tab (`ShiftRequestBoard` gains `initialTab`); an
      effect applies a later change of the parameters and then replaces the
      URL with `/schedule`. In `@dubgrid/domain`, the four `invitation_*`
      types resolve to `/people` ("Open people"); tests updated. _Done when:_
      domain and parity tests pass, `npm run type-check` passes, and in the
      browser `/schedule?date=2026-10-05&requests=approval` shows the week of
      Oct 5 with the board open on Approval and the URL settled on
      `/schedule`.

- [x] **Step 2 - Alerts page rows go to their subject.** `InboxView` takes a
      `navigate(href)` prop (the page wrapper passes `router.push`, the portal
      too); `handleRowClick` marks read and navigates, or toggles the
      disclosure when there is no destination; the modal, its component, and
      the per-row action button are removed; notes render inline for the org
      audience and a Details disclosure renders the platform audience for
      gridmasters; the `?open=` effect uses the same path; row text hierarchy
      applied. Tests: `AlertsInbox.open-param.test.tsx` expects `navigate`
      with the destination and `markNotificationsRead`; a new case proves a
      platform row expands instead. _Done when:_ web tests pass; in the
      browser a super admin clicking a "Schedule updated" row lands on
      `/schedule` with the alert read, and a gridmaster clicking a
      "Subscription canceled" row expands Details in place.

- [x] **Step 3 - Bell rows go to their subject.** Rows link to
      `resolveAlertDestination(n)?.href ?? "/alerts"`, mark read on click
      (fire-and-forget, then invalidate the bell's queries), and close the
      popover; the portal path is unchanged; bell row text hierarchy applied.
      `NotificationBell.test.tsx` updated; the e2e "opens the clicked alert"
      case becomes "goes to the clicked alert's subject". _Done when:_ unit
      and e2e pass; in the browser a bell click from `/dashboard` lands on
      the row's destination with the badge count reduced by one.

- [x] **Step 4 - Qualify.** `npm run type-check`, `npm run test:web`,
      `npm run lint`, `npx playwright test e2e/alerts-states.spec.ts`;
      screenshots of the bell popover and the `/alerts` list showing the
      hierarchy in light and dark, and the gridmaster disclosure. _Done when:_
      all pass and the screenshots are captured.

## Files / areas

- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`,
  `apps/web/src/components/ShiftRequestBoard.tsx`.
- `packages/domain/src/alert-destination.ts` (+ test),
  `apps/web/src/__tests__/alert-destination.parity.test.ts`.
- `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`,
  `apps/web/src/components/gridmaster/GridmasterPortal.tsx`,
  `apps/web/src/__tests__/AlertsInbox.open-param.test.tsx`.
- `apps/web/src/components/NotificationBell.tsx` (+ test),
  `e2e/alerts-states.spec.ts`.

## Data / contracts

- Consumes `resolveAlertDestination` from 39a; amends invitations to
  `/people`.
- **Load-bearing:** `/schedule?date=` and `/schedule?requests=` are real from
  Step 1 on; 39d's mobile map may rely on them.
- No schema or API change.

## Testing

- Logic: the domain resolver test and the parity test (amendment); the
  inbox open-param test (navigate path, platform disclosure); the bell test.
- Browser: the three done-whens above plus the Step 4 screenshots.

## Notes for the AI

- `InboxView` must stay free of `next/navigation`; the wrapper and the portal
  supply `navigate`, so the existing bare-render tests keep working.
- Mark read before navigating but never block navigation on it: optimistic
  patch, request in flight, invalidate the bell's keys.
- Keep `?open=` as a deep-link entry; it now ends on the destination.
- No em dashes in code, comments, or copy.
