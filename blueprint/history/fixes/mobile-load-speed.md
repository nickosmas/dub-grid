# Fix: The app loads Home first and opens other screens without waiting

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-load-speed`

## The problem

The owner asked for every page and flow, from sign-in to sign-out, to load
fast (2026-11-04). A survey of what each screen waits on found:

- Native tabs render every tab at launch, so about 18 requests started at
  once and the Schedule, Requests, People and Profile screens rendered
  before Home could paint.
- Admin Home waited on the team's week, which was neither prefetched nor
  kept between launches, so the 24-hour cache never helped admins.
- One realtime event invalidated the same queries once per table (a cell
  save touches three), cancelling and restarting fetches (F-150, in part).
- The Schedule screen refetched everything on every return to the app,
  ignoring the 30-second freshness window the rest of the app keeps.
- Switching organization started Home's requests only after the new
  bootstrap rendered, and sign-out ran its two server calls one after the
  other.

## The fix

- `DeferredTab` mounts a tab when first focused, or 2.5 seconds after launch
  has settled, so its data is ready by the first tap without competing with
  Home. Home is never deferred.
- Admin Home's team week is prefetched with the rest of Home and persisted
  with it.
- A realtime flush invalidates each query family once and keeps a fetch in
  flight (`invalidateMobileRealtimeQueriesForTables`).
- The Schedule screen's own foreground refetch is gone; the app-wide one
  refreshes anything older than 30 seconds.
- Switching organization fetches the new bootstrap and Home's queries as it
  navigates; sign-out runs push cleanup and session revoke together.

Still open from the survey: duplicate keys across Home, Requests and the
calendar dots (F-152), the publish-change scan (F-151), extra server waves
on `/me/schedule` and `/shift-requests`, and seeding person and shift pages
from list data.

## Checks

- All mobile tests (1576), type-check, lint and Prettier. New tests:
  `DeferredTab` (focused, warm-up, stays mounted), the team week prefetch and
  persistence, and an organization switch that still completes when the
  warm-up fails.
- Not measured on a device.
