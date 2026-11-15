# Fix: say why a shift can't be dropped or swapped, and give requests a way forward (mobile)

**Type:** Fix
**Status:** complete

## Problem

- On the person's own shift in the app, **Drop shift** and **Swap** vanished
  with nothing in their place when the shift was removed, was a whole-day
  absence, had started or was over, or was a general shift (Drop only).
- When the check for an existing request failed, only a toast said so, and
  there was no way to retry from the page.
- The "You already asked about this shift" card had no way forward: no link to
  the request and no way to cancel it.
- An empty **Mine** tab in Requests said nothing about where a request starts
  or where past requests went.

Intent from the stale branch `claude/fervent-ride-a9ssqm` (4780cd56d,
70b3dfd06), rebuilt on current `dev`. Its "Request specific person shows
teammates who are off as Off" part is superseded by the organization setting
from #516 and was not ported.

## Fix

- `getShiftRequestAvailability` (`apps/mobile/src/features/schedule/lib/shiftRequestAvailability.ts`)
  decides Drop and Swap with dev's rules (an absence beside a shift keeps the
  cell worked, so its shifts stay requestable; a double shift stays requestable
  while a later shift hasn't started) and returns one line saying why when an
  action is missing: removed, an absence that day, started, over (an overnight
  shift still running into today reads as started), the request check failed
  (with Try again), or a general shift (Drop only). A teammate's shift, a check
  still running and a request already under way say nothing.
- Shift detail shows that line under the actions, with **Try again** that
  refetches the request check. The failure toast is gone: the page says it once.
- The "You already asked about this shift" card has **View in Requests** (opens
  the Requests tab on Mine with the request highlighted, the same deep link the
  Home approval queue uses) and **Cancel request**, which runs the shared
  `useShiftRequestActionFlow` (now accepting `cancel`): the cancel confirmation
  from `request-action-feedback`, the API cancel, a success toast, and a refetch.
- The empty **Mine** tab (`getMineEmptyState`) is titled "No open requests",
  points to the person's shifts with **Go to Schedule** (or **Go to Home** when
  they can't see the Schedule tab), mentions History when they have past
  requests of their own, and keeps the `mine-none` scene. Someone on no schedule
  gets dev's previous body and no shortcut. The all-empty "No requests yet" card
  no longer covers the Mine tab.
- Docs: `mobile-schedule.mdx` and `shift-requests.mdx` describe the reasons, the
  card's actions and the Mine empty state; evidence fingerprints recorded for
  the four pages whose sources changed.

## Evidence

- `shiftRequestAvailability.test.ts` (13): each reason, the overnight and
  double-shift cases, an absence beside a shift keeping both actions, a whole
  day absence never named, retry only for the check failure.
- `mine-empty-state.test.ts` (4): Schedule, Home, History, and no shortcut.
- `ShiftDetailScreen.test.tsx`: removed, started, absence and general-shift
  lines; the inline check failure with no toast and Try again refetching; View
  in Requests navigating with `tab: "mine"` and the request id; Cancel request
  asking first, then cancelling.
- `RequestsScreen.test.tsx`: the empty Mine tab with Go to Schedule and History,
  and Go to Home without the Schedule tab.
- `npm run type-check`, `npm run lint`, mobile `schedule`, `shift-requests` and
  `dashboard` suites (309 tests), `npm run docs:check` pass.

## Not in this fix

- No device or simulator pass; behavior is covered by the screen tests.
