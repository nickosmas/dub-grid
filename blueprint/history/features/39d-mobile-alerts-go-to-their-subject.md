# Feature: Mobile alerts go to their subject

**From build-plan:** feature 39d
**Status:** verified

## Goal

On mobile, tapping an alert marks it read and goes to what it is about,
through the same contract web uses. The detail screen stops being a
destination for organization users; a push tap or an old deep link to
`/alerts/[id]` forwards on to the subject. Rows show the whole message and
any human note, with a clear title-over-content hierarchy.

## In scope

- `openNotificationAction.ts` maps the contract's hrefs to native routes:
  `/schedule?requests=…` to the Requests tab; `/schedule` with or without
  `?date=` to the Schedule tab (`/(tabs)/team`) carrying the date;
  `/people/<uuid>` to that person; `/people` to the People tab;
  `/profile?section=security` to Profile > Security; `/profile` to Profile;
  `/requests…` to Requests; `/alerts` to the inbox; `/settings…` stays
  web-only. `isNotificationActionSupportedOnMobile` follows the same map.
- The Schedule screen honors a `date` parameter (`YYYY-MM-DD`) as its
  selected date, on arrival and when it changes while mounted.
- `NotificationsScreen.handleRowPress` keeps marking read first, then opens
  the destination; a web-only or missing destination shows a toast ("Open
  this on the web to see more") and stays.
- `NotificationDetailScreen` becomes a forwarder: it resolves the alert as it
  does today, marks it read, and replaces itself with the destination (or
  the inbox with the toast). Push taps keep landing on `/alerts/[id]`, so
  they forward too.
- `NotificationRow`: the title is `rowTitle` semibold (bold when unread), the
  message is `body` in `textSecondary` with no line cap, the time is
  `caption` in `textMuted`; an organization note renders under the message
  as "Note: …" in `caption`.

## Out of scope

- Web (39b, 39c, done).
- A native schedule detail for a single day; the tab opens on the date.
- Reworking push payloads.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Route map and the schedule date.** Rewrite
      `openNotificationAction.ts` around a parsed href (path plus query) with
      the map above, returning the native route it will push so the screen
      can decide before navigating; `ScheduleScreen` reads `date` from its
      params into `selectedDateOverride`. Tests: `openNotificationAction.test.ts`
      covers every mapping and the unsupported case. _Done when:_ the mapper
      and schedule tests pass and mobile `tsc` passes.

- [x] **Step 2 - Rows go, the detail forwards.** `handleRowPress` resolves
      the destination and opens it (toast when web-only); the detail screen
      forwards; `NotificationRow` gets the hierarchy, the full message, and
      the inline note. Tests: `NotificationsScreen.test.tsx` expects the
      Requests tab for the sample request alert and the toast for a billing
      alert; `NotificationDetailScreen.test.tsx` becomes the forwarder's
      tests (found in cache, fetched, missing, web-only). _Done when:_
      `npm run test:mobile` passes.

- [x] **Step 3 - Qualify.** `npm run type-check`, `npm run lint`; simulator
      cells `alerts-ios-light-default-admin` and `alerts-ios-dark-ax-admin`
      recaptured with the new rows, and a tap on a schedule alert landing on
      the Schedule tab. _Done when:_ all pass and the cells are committed.

## Files / areas

- `apps/mobile/src/features/notifications/lib/openNotificationAction.ts` (+ test),
  `apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx`.
- `apps/mobile/src/features/notifications/screens/NotificationsScreen.tsx` (+ test),
  `NotificationDetailScreen.tsx` (+ test),
  `apps/mobile/src/features/notifications/components/NotificationRow.tsx`.
- `blueprint/reference/mobile/*.png`, README rows.

## Data / contracts

- Consumes `resolveAlertDestination` from `@dubgrid/domain`; no new contract.
- **Load-bearing:** the Schedule tab's `date` parameter.

## Testing

- Logic: the mapper test, the list screen test, the forwarder test.
- Simulator screenshots for the rows and one navigation.

## Notes for the AI

- The mobile test harness drops `style`, so hierarchy is proven by
  screenshots; keep `fontWeight` out of styles, weight comes from
  `mobileTextWeighted`.
- Keep the one-open-row swipe registry and the swipe actions as they are.
- No em dashes in code, comments, or copy.
