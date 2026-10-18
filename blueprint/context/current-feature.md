# Fix: The Schedule page paints quickly on a cold load

**Type:** Fix
**Status:** verified

### The problem

A cold load of `/schedule` (refresh, new tab, or first visit after sign-in)
holds the Shuffle logo for a long time. A return visit is fast only because
the org bootstrap, the roster and a grid snapshot (`_lib/schedule-cache.ts`)
are still in the React Query cache, and a refresh clears them all.

On a cold load `SchedulePageClient.tsx` paints only after this chain:

1. The org bootstrap returns. The initial load waits for `org`.
2. Six `/api/schedule/manage` and published-ranges requests run in parallel.
   The slowest is `fetchShifts` over **±90 days (181 days)**, read 500 rows a
   page, one page after another, with nested snapshots and segments. The
   grid shows 1 week, 2 weeks or a month of that.
3. Only then does `fetchRecentPublishHistory` start (`loadSchedule`, after the
   `Promise.all`). It feeds the change chips and the "changed since your last
   visit" toast, neither of which the first paint needs.

After the first paint, a scheduler whose permissions resolved after the load
started gets a second full 181-day `fetchShifts` (the draft-visibility effect).
It is redundant: `/api/schedule/manage` already decides draft visibility from
the session (`isScheduler = auth.permissions.canEditShifts`) and ignores the
flag the client sends. The same late permission also tags the grid snapshot
as a viewer's, so the scheduler's next return visit cannot paint from it.

### The fix

1. **First window, then the rest.** The initial load fetches cells, notes,
   call-off open shifts and published ranges for the visible publish window
   plus a 7-day buffer on each side, so adjacent-day staffing checks still
   see their neighbours. The window reaches back to where the pay-period
   alignment moves the week start a render later (up to 13 days earlier).
   Then the grid paints. Right after the paint, the loaded window widens to
   the usual ±90 days through the existing `refetchScheduleData` path, with
   the same in-flight guard the window-sync effect uses, so the two never
   overlap. The snapshot is written for whichever window is loaded, as today,
   and is painted only if it covers the first window.
   **Fetches that overlap the widen.** A fetch reads the live loaded window
   when it starts, and when it lands it replaces cells only for the dates it
   fetched (`replaceWithinWindow`), joining its window to the live one
   (`mergeLoadedWindows`). This applies to `refetchScheduleData` (except a
   recenter), the conflict reload, and repeating-series create and delete.
   Replacing the whole grid emptied weeks still marked as loaded, and the
   before-and-after diffs those callers broadcast read every such cell as
   deleted.
2. **Publish history off the critical path.** Start
   `fetchRecentPublishHistory` as soon as last-viewed resolves, alongside
   the cells request, and stop awaiting it before the paint. It applies the
   chips and toast when it lands. `updateScheduleLastViewed` still fires only
   after the history read, so the baseline it reads is never moved first.
3. **No redundant draft refetch.** Start the initial load once both `org` and
   permissions are known, waiting at most `PERMISSIONS_WAIT_MS` (3 s) after
   org data so a stalled permissions request cannot hold the grid; past that
   it loads as it does today. Permissions load in parallel with the
   bootstrap, so this should add no wait, and it should be measured. With
   permissions known, the load also fetches recurring shifts and publisher
   history, which it skipped when they were unresolved. Remove the
   draft-visibility `fetchShifts` and keep `draftCheckComplete` meaning "the
   initial load settled and permissions are known", so the window-sync
   effect is gated as before. No snapshot is written while permissions are
   unresolved, and the initial load tags its snapshot with the live edit
   permission.

**Must not break:**

- **Publishing:** the publish window is always inside the first window, so
  the draft banner, confirm dialog and publish RPC still agree on one set.
- **Out-of-window draft notice:** may appear once the widen lands rather than
  at first paint. That is acceptable. It must not be lost.
- **Local edits during the widen:** an edit made on the first window must
  survive the background fetch (`reconcileFetchedWindow` with the local-write
  ledger, as the snapshot path already relies on).
- **Snapshot safety:** `readScheduleWindow` still returns a snapshot only for
  the same org and edit permission.
- **Deep links** (`?date=`, `?requests=`), Month view, mobile Day view, and
  far navigation (recenter past 300 days) behave as today.
- **Viewer redaction:** staff still never receive draft cells. The server
  rule is unchanged, and no scheduler grid is stored under a viewer tag.
- **Org switch:** a fetch that lands after the org changed is discarded. An
  org switch is a full page load today, so this is defensive.

**Out of scope (follow-up):** the server page's wasted session lookup
(`page.tsx` verifies a token and discards the result), or using it to
prefetch the bootstrap and first window on the server. Folding the six
schedule requests into one is also out.

### Build steps

- [x] **1. Baseline.** On a local Supabase stack with seed data, record cold-load
      timings for `/schedule` as a scheduler and as staff: time to the grid,
      number of requests before it, and rows fetched.
      _Done when_ the baseline numbers are written below.
- [x] **2. Paint from the first window and widen after (fix 1), and stop awaiting
      publish history (fix 2).** Extract the first-window bounds into a pure
      helper in `_lib/operations.ts` with unit tests (2-week, 1-week, month,
      deep-link date, pay-period alignment).
      _Done when_ the helper tests pass, the grid paints before the ±90-day
      fetch completes, and the loaded window reaches ±90 days afterwards.
- [x] **3. Wait for permissions and remove the draft refetch (fix 3).**
      _Done when_ a scheduler's cold load issues exactly one cells request
      before the background widen, and the next return visit paints from the
      snapshot.
- [x] **4. After.** Repeat the step 1 measurements.
      _Done when_ before and after are recorded side by side below.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, and the schedule
  Playwright specs.
- Manually: refresh `/schedule` as a scheduler and as staff. The grid appears
  quickly, drafts show for the scheduler, and paging months away and back
  still fills the grid. Publish from a 2-week view and check the confirm
  count matches the banner.

### Measurements

Measured 2026-10-18 in the cloud session: production builds (`next start`)
of the base commit (`199fa3c5`) and of this branch, against a local Supabase
stack seeded as CI does, with a local Upstash-compatible proxy for the rate
limiter. Each figure is the median of 5 cold loads (a full page load, so the
React Query cache is empty) by Playwright Chromium, timed from navigation to
the grid being visible. "150 ms" adds that round trip to every browser
request through Chromium's network emulation; the server's own trips to
Supabase stay local.

**Realistic history** (Calm Haven's seeded fortnight repeated across +/-90
days locally: 39 staff, 7,162 cells):

| Role      | Latency | Before   | After    | Saved          |
| --------- | ------- | -------- | -------- | -------------- |
| Scheduler | 0 ms    | 3,756 ms | 2,399 ms | 1,357 ms (36%) |
| Staff     | 0 ms    | 3,543 ms | 2,649 ms | 894 ms (25%)   |
| Scheduler | 150 ms  | 3,940 ms | 2,534 ms | 1,406 ms (36%) |
| Staff     | 150 ms  | 3,800 ms | 2,734 ms | 1,066 ms (28%) |

Before, the grid waited on one cells request of 6,788 cells; after, on one of
1,050 (2026-10-04 to 2026-10-31), with the +/-90-day widen landing after the
paint.

**Seed data as shipped** (525 cells, all inside the current fortnight, so both
fetches return the same cells): no difference beyond noise (before 1.7 to 2.6 s,
after 1.4 to 2.3 s, single samples up to 5.8 s on the shared machine).

**Return visits** paint from the snapshot in both builds; medians 1.3 to 2.0 s
before and 1.6 to 1.8 s after, with samples from 0.9 to 3.3 s in both, so
unchanged within noise.

**Runtime done-whens:** a scheduler's cold load makes exactly one cells
request before the widen, which covers the default band (2026-07-20 to
2027-01-16) and lands after the paint; published ranges are fetched once (a
duplicate this fix introduced was found here and fixed in `6356984a`); a
local draft shows on the first painted grid for a scheduler and never for
staff; the publish dialog count matches the banner; paging twelve weeks back
and forward fills the grid; a return visit paints before its refresh lands.

**Still costly:** once the data lands, the main thread is busy rendering for
1 to 2 s on this machine (one long task of about 2 s at first paint after,
about 3.7 s of long tasks before). That is the larger share of what remains
and is outside this fix.

**Checks:** `npm run type-check` and `npm run lint` pass (2 existing warnings
in untouched files). `npm run test:web` with the live stack running: 5,602
pass; the 2 failures are `recovery-assurance.integration.test.ts`, whose
recovery emails had no SMTP server because the local mail service was left
out of the stack. The schedule Playwright specs (`schedule.spec.ts`,
`schedule-states.spec.ts`) pass on Chromium. The first run after a re-seed
failed once when a success toast covered the Schedule nav link (it showed on
the first sign-in, most likely a one-time first-login notice); the spec
passed on three reruns of this branch and once on the base commit.
