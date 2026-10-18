# Fix: The Schedule grid's first render does less repeated work

**Type:** Fix
**Status:** not started

### The problem

Once its data arrives, the Schedule page keeps the main thread busy for one
to two seconds before the grid shows, and again when more cells land (the
background widen on `claude/schedule-cold-load`, PR #153, or any refetch).
A CPU profile of a production build with source maps (3 cold loads as a
scheduler, 39 staff and about 7,000 cells over +/-90 days, Playwright
Chromium, 2026-10-18) put the app's own share in three places:

- **`ShiftDetailHoverCard`** (`components/ScheduleGrid.tsx`), 360 to 505 ms
  at first paint and again on a widen. Every shift cell renders one, and it
  builds `dateLabel` with `date.toLocaleDateString("en-US", {...})` before
  checking whether the card is open. The label shows only inside the open
  card.
- **`formatPublishedMetadata`** (`components/schedule-grid/gridHelpers.ts`),
  350 to 460 ms at first paint and again on a widen. Every published cell's
  label calls `publishedAt.toLocaleString(undefined, {...})`. Both calls
  construct a new `Intl.DateTimeFormat` each time, which is the expensive part.
- **Forced layouts**, 250 to 470 ms at first paint. The sticky-header
  `useLayoutEffect` in `ScheduleGrid.tsx` reads layout, writes a CSS variable,
  reads again, writes again, then calls `getComputedStyle`, so a grid of
  thousands of cells is laid out up to three times and restyled once more.
  `ScrollableTabs` (about 120 ms) forces a layout on every render of its
  parent toolbar.

React itself, script parse and compile (about 0.5 s) and garbage collection
make up most of the rest and are out of scope.

### The fix

1. **Cached date formatters.** `formatPublishedMetadata` formats with an
   `Intl.DateTimeFormat` cached per time zone (the locale stays the runtime
   default, as `toLocaleString(undefined, ...)` uses). `ShiftDetailHoverCard`
   formats with one module-level `Intl.DateTimeFormat("en-US", ...)` and only
   builds `dateLabel` when the card is open. With date and time fields given,
   `Date.prototype.toLocaleString(locale, options)` is specified to equal
   `new Intl.DateTimeFormat(locale, options).format(date)`, so the text is
   unchanged, including the invalid-date and unknown-publisher wording.
2. **Batched sticky measurement.** Read before writing: `watchStuck` (which
   reads two inherited header-height variables through `getComputedStyle`)
   runs before `measure` writes anything. In `measure`, the grid width is read
   and `--dg-grid-body-width` written first, because the sticky group's height
   can depend on that width; the group height, card bottom and release-row top
   are then read together, before `--dg-grid-sticky-height` and
   `--dg-grid-release-inset` are written. `--dg-grid-sticky-height` feeds only
   `scroll-margin-top`, which does not move anything, so reading the card
   bottom and release row before writing it measures the same values.
3. **`ScrollableTabs` once per frame.** Its overflow check runs at most once
   per animation frame (scroll, resize and child changes request a frame
   rather than reading layout immediately), and the frame is cancelled on
   unmount.

**Must not break:**

- **Hover card and labels:** the same date and "Published ... by ..." text
  for every locale and time zone, including the time-zone abbreviation.
- **Sticky header:** the date row still pins under the app header and
  schedule chrome, still matches the body's column widths, releases early at
  the last rows, and the stuck layering (`data-stuck`) toggles at the same
  scroll positions, including when a banner opens above the grid.
- **Scrollable tabs:** the fade and chevrons still appear exactly when the
  tabs overflow, after scrolling, resizing and tab changes.

**Out of scope:** React render cost in general (memoisation, virtualising
off-screen rows), bundle size, and the schedule data fetches (PR #153).

### Build steps

- [ ] **1. Baseline.** Profile and time cold loads of a production build of
      `dev` on the realistic local data, as in the problem list.
      _Done when_ the baseline figures are written below.
- [ ] **2. Cached date formatters (fix 1),** with unit tests in
      `gridHelpers.test.ts` that compare against `toLocaleString` across
      time zones, cover the invalid date and the publisher variants, and show
      the formatter is reused.
      _Done when_ the tests pass and the two functions drop out of the
      profile's top costs.
- [ ] **3. Batched sticky measurement (fix 2).**
      _Done when_ the profile shows fewer forced layouts and a browser check
      shows the sticky header pinning, matching widths, releasing and
      toggling `data-stuck` as before.
- [ ] **4. `ScrollableTabs` once per frame (fix 3).**
      _Done when_ the toolbar tabs still show their fades and chevrons
      correctly in the browser and the profile no longer shows them.
- [ ] **5. After.** Repeat step 1 on this branch.
      _Done when_ before and after are recorded side by side below.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, and the schedule
  Playwright specs.
- Manually: hover a shift and a published cell and compare the card and
  label text with `dev`; scroll the grid and confirm the date row pins and
  releases as before; narrow the window until the toolbar tabs overflow and
  check the chevrons.

### Measurements

_Recorded during step 1 and step 5._
