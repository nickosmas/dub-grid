# Fix: The Schedule loading screen is shorter and can never wait forever

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-18

### The problem

After signing in, opening Schedule can keep the loading animation up for 30
seconds (reported 2026-10-18 on a Windows PC). Locally, on a production build
of `dev` (39 staff, 7,162 cells, 4 focus-area sections, about 940 grid cells
and 8,300 DOM nodes on screen), sign-in then Schedule reached the grid in 2.5
to 7.7 s at full speed and 20 to 27 s with the CPU slowed 4x and 250 ms of
latency. Every request had answered by about 6 s; the rest was the main
thread. A CPU profile and Chrome traces put it here:

- **The whole grid rendered twice before the first paint.** `ScheduleGrid`
  starts with a container width of 0, renders every section at fallback column
  widths, then its layout effect measures 1,406 px and re-renders all of them
  synchronously (`--dg-grid-col-min-current` 80 to 84 px, `fitToContainer`
  false to true). The second pass also re-ran every section's sticky effect.
- **Each section forced its own style and layout pass.** The sticky
  `useLayoutEffect` read `getComputedStyle` and `getBoundingClientRect` during
  the commit, once per section, after the section before it had written its
  CSS variables. With 4 sections that was a full restyle of about 9,000
  elements, then 4,131, 3,433, 788 and 623 more, all twice (once per render).
  At 4x CPU, `getPropertyValue` alone took 4.1 s and `getBoundingClientRect`
  1.2 s.
- **Inherited custom properties on large ancestors.** `--dg-grid-sticky-height`
  and `--dg-grid-release-inset` were written on each section, so every write
  restyled every cell below it, though only the section's padding, the card's
  margin and a row's `scroll-margin-top` read them. The header scroll sync
  (`header.scrollLeft = body.scrollLeft` on mount) forced one more full
  restyle after the page set `--dg-schedule-chrome-height`.

The loading animation itself is not the cause: React never time-slices this
render, so the animation cannot interrupt it, and it costs about 50 ms per
second of waiting.

### The fix

1. **Render once at the real width.** `containerWidth` is `null` until
   measured. That first commit renders a placeholder of roughly the grid's
   height (120 px per section plus 52 px per row) instead of the sections, so a
   page that will scroll already shows its scrollbar when the width is read
   (Windows' classic scrollbar changes it). The layout effect then sets the
   width and the sections render once, before the first paint. A 0 width (a
   hidden container, or jsdom) still renders the sections, as before.
2. **One shared observer measures every section together.**
   `createStickyLayoutObserver` (`lib/schedule-grid-sticky.ts`) is a single
   ResizeObserver for all sections. Each delivery runs every affected
   section's steps in lockstep through `runLayoutSteps`: all reads, then all
   writes, then all reads, then all writes. ResizeObserver delivers after the
   browser has laid the frame out and before it paints, so the first reads
   cost nothing, the writes land before the paint, and observing a new element
   delivers its first size the same way. Nothing is measured inside the commit
   any more, and the chrome height the stuck check reads is already set.
3. **No section-wide custom properties.** The release inset is written
   straight onto the section's `padding-bottom` and the card's
   `margin-bottom`. The searched-to row gets its `scroll-margin-top`
   (header + chrome + its section's sticky group height) when it is scrolled
   to, which is the only time it applies.
4. **Header scroll sync in a frame callback,** so mounting does not force a
   layout; the scroll listener is unchanged.

### Part 2: a wait that never ends

Later the same day the loading animation stayed up for over two minutes after
signing in, on a period with no shifts, and again on a published period after
navigating away and back. None of this reproduced locally: an emptied period,
about twenty return visits with the CPU slowed 4 to 10 times, 400 ms of
latency and frame callbacks every 7 ms (a 144 Hz display) all loaded in 1 to
20 s. What the code does show:

- **No request in the initial load had a deadline.** It awaits six reads in one
  `Promise.all` with plain `fetch`, so one that never answered held the
  loading screen up until the server gave up, which can be minutes. The
  account org-context and permissions requests had none either.
- **A failed load showed an empty grid.** The catch reported to Sentry and
  cleared the loading flag, so a period with shifts read as having none.
- **The animation re-rendered React every frame.** `AnimatedDubGridLogo` set
  state from `requestAnimationFrame`. Nothing waits on the animation, and the
  render that reveals a Suspense fallback's content is a retry lane, which
  this React build never expires (`computeExpirationTime` returns -1), while
  each frame's update outranks it. Starving that render was not reproduced,
  but nothing needs the per-frame update.

The fix:

5. **A deadline on the initial load.** The six reads race
   `SCHEDULE_LOAD_TIMEOUT_MS` (25 s) through `settleWithRequestTimeout`, unless
   a snapshot is already painted: then no loading screen is up, and the
   refresh of the whole default window can rightly take longer for a large
   organization. The org-context and permissions requests use the account
   client's 15 s deadline; both already fall back when they fail.
6. **One quiet retry, then a way out.** A failed initial load runs once more by
   itself. If that fails too, the grid area says "We couldn't load the
   schedule" with **Try again**, instead of showing an empty grid; over a
   painted snapshot it keeps the grid and says the refresh failed. The window
   sync and full-window widen wait while the load has failed, and **Try
   again** resets the widen, so a recovered load still widens.
7. **A loading screen that says when it is slow.** `ScheduleLoadingScreen`
   times the whole wait, across the route fallback and the page's own screen.
   At 15 s it says "This is taking longer than usual." with **Reload**; at
   30 s it reports once to Sentry with what is outstanding (org, staff,
   permissions and schedule flags, and each pending request by name and
   attempt).
8. **The logo draws outside React.** React renders the resting mark once (and
   on the server); each frame's SVG is written into that element directly.
   The markup matched the old React rendering element for element across
   1,286 frames of every animation at two sizes.

**Must not break:**

- **Sticky header:** pins under the app header and toolbar, matches the body's
  column widths, releases early at the last rows, and toggles `data-stuck` at
  the same scroll positions, including after a resize and when a banner opens
  above the grid.
- **Search:** a searched-to row lands at the same place, clear of the sticky
  header.
- **Column widths:** the same widths at every container width, on every
  platform, including Windows' classic scrollbars.
- **Toolbar tabs and hover cards:** unchanged.

**Out of scope, found while measuring (see Measurements):** rendering about
940 heavy cells at once (no row virtualisation), dnd-kit registering each
droppable cell in O(n) (`DroppableContainersMap` is copied per registration,
so mounting n cells costs n^2), and the background widen re-rendering every
visible cell.

### Build steps

- [x] **1. Baseline and diagnosis.** Throttled sign-in timeline, CPU profile,
      Chrome traces of style recalculation with stack traces.
      _Done when_ the causes above are each tied to a measured cost.
- [x] **2. Render once (fix 1).**
      _Done when_ a load commits the grid sections once and the column widths
      match `dev`.
- [x] **3. Batched sticky measurement (fixes 2 to 4),** with unit tests for
      `runLayoutSteps` and `createStickyLayoutObserver`, and the search test
      asserting the row's scroll margin.
      _Done when_ the sticky, tabs, hover and search probes read the same as on
      `dev` and the trace shows no per-section restyles.
- [x] **4. After.** Repeat the measurements on this branch.
      _Done when_ before and after are recorded below.
- [x] **5. Deadlines, retry and the failed state (fixes 5 and 6).**
      _Done when_ a shifts request that never answers ends in the failed state
      after one retry, and **Try again** loads the grid and widens.
- [x] **6. The slow message and report (fix 7),** with unit tests for the
      message, the single report, and one wait across two screens.
- [x] **7. The logo outside React (fix 8),** with unit tests that frames draw
      without a re-render and reduced motion rests, and a frame-by-frame
      comparison with the old rendering.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, and the schedule
  Playwright specs.
- Manually: sign in, open Schedule, and watch for the grid; scroll it and check
  the date row pins and releases; search for someone in the last section and
  check the row lands clear of the header; resize the window narrower and back.

### Measurements

Production builds of `dev` (`9bebb1e4`) and this branch, local stack, 39 staff
and 7,162 cells, Playwright Chromium at 1440x900.

**Style and layout until the grid shows** (Chrome trace, cold load of
`/schedule`): `dev` 745 ms of style recalculation in 9 passes (full restyles
of 9,055, 9,056 and 8,980 elements plus the per-section ones) and 140 ms of
layout; this branch 120 to 403 ms in 2 passes and 72 to 130 ms of layout.

**Grid renders before the first paint:** `dev` 2 (every section measured
twice); this branch 1 (every section measured once, in one batch).

**Sign-in, click Schedule, first grid frame** (6 runs each, interleaved;
timed in the page so the harness adds no work while the page is busy):

| Conditions                | `dev` (s)    | This branch (s) | Median       |
| ------------------------- | ------------ | --------------- | ------------ |
| Full speed                | 2.5 to 7.7   | 1.1 to 5.1      | 4.4 to 3.3   |
| 4x CPU and 250 ms latency | 20.4 to 27.0 | 9.7 to 34.6     | 25.6 to 17.4 |

This shared machine is noisy (one round of the branch at 4x came out slow
throughout); the trace figures above are the steadier measure.

**Behaviour, compared with `dev`:** identical output from the sticky probe
(header width variable, section padding, card margin, section height, group
position and `data-stuck` at 12 scroll positions across 4 sections, and after
a resize), the tabs probe, four hover cards, and a search probe (scroll
position, row position and scroll margin for rows in three sections).
Headless Chromium has no scrollbar width, so the Windows scrollbar case is
reasoned, not measured, and a banner opening above the grid was not
exercised.

**A request that never answers** (Playwright holding every `fetchShifts`
on a production build): the slow message at 15.6 to 16.2 s, the automatic
retry at 25.5 s, the failed state at 50.8 s, and **Try again** loaded all 935
shift pills and then widened to 2026-07-20 to 2027-01-16. The logo drew 11
different frames in 2 s with one SVG on the page, and return visits still
took 0.55 to 0.73 s.

**What remains, at 4x CPU on this branch:** the grid's React render (about
6 s), the browser's style, layout and paint of 8,300 nodes (about 5 s),
dnd-kit's droppable registration (1.3 to 4.6 s, varying run to run), and a
full re-render when the background widen lands.
