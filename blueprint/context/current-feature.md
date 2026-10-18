# Fix: The Schedule page paints quickly on a cold load

**Type:** Fix
**Status:** in progress

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
   see their neighbours. Then the grid paints. Right after the paint, the
   loaded window widens to the usual ±90 days through the existing
   `refetchScheduleData` path, with the same in-flight guard the window-sync
   effect uses, so the two never overlap. The snapshot is written for
   whichever window is loaded, as today.
2. **Publish history off the critical path.** Start
   `fetchRecentPublishHistory` as soon as last-viewed resolves, alongside
   the cells request, and stop awaiting it before the paint. It applies the
   chips and toast when it lands. `updateScheduleLastViewed` still fires only
   after the history read, so the baseline it reads is never moved first.
3. **No redundant draft refetch.** Start the initial load once both `org` and
   permissions are known. Permissions load in parallel with the bootstrap, so
   this should add no wait, and it should be measured. Remove the
   draft-visibility `fetchShifts` and keep `draftCheckComplete` meaning "the
   initial load settled", so the window-sync effect is gated as before.

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
  rule is unchanged.

**Out of scope (follow-up):** the server page's wasted session lookup
(`page.tsx` verifies a token and discards the result), or using it to
prefetch the bootstrap and first window on the server. Folding the six
schedule requests into one is also out.

### Build steps

1. **Baseline.** On a local Supabase stack with seed data, record cold-load
   timings for `/schedule` as a scheduler and as staff: time to the grid,
   number of requests before it, and rows fetched.
   _Done when_ the baseline numbers are written below.
2. **Paint from the first window and widen after (fix 1), and stop awaiting
   publish history (fix 2).** Extract the first-window bounds into a pure
   helper in `_lib/operations.ts` with unit tests (2-week, 1-week, month,
   deep-link date, pay-period alignment).
   _Done when_ the helper tests pass, the grid paints before the ±90-day
   fetch completes, and the loaded window reaches ±90 days afterwards.
3. **Wait for permissions and remove the draft refetch (fix 3).**
   _Done when_ a scheduler's cold load issues exactly one cells request
   before the background widen, and the next return visit paints from the
   snapshot.
4. **After.** Repeat the step 1 measurements.
   _Done when_ before and after are recorded side by side below.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, and the schedule
  Playwright specs.
- Manually: refresh `/schedule` as a scheduler and as staff. The grid appears
  quickly, drafts show for the scheduler, and paging months away and back
  still fills the grid. Publish from a 2-week view and check the confirm
  count matches the banner.

### Measurements

_Recorded during step 1 and step 4._
