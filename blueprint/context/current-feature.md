# Fix: The Schedule grid's first render does less repeated work

**Type:** Fix
**Status:** in progress

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

- [x] **1. Baseline.** Profile and time cold loads of a production build of
      `dev` on the realistic local data, as in the problem list.
      _Done when_ the baseline figures are written below.
- [x] **2. Cached date formatters (fix 1),** with unit tests in
      `gridHelpers.test.ts` that compare against `toLocaleString` across
      time zones, cover the invalid date and the publisher variants, and show
      the formatter is reused.
      _Done when_ the tests pass and the two functions drop out of the
      profile's top costs.
- [x] **3. Batched sticky measurement (fix 2).**
      _Done when_ the profile shows fewer forced layouts and a browser check
      shows the sticky header pinning, matching widths, releasing and
      toggling `data-stuck` as before.
- [x] **4. `ScrollableTabs` once per frame (fix 3).**
      _Done when_ the toolbar tabs still show their fades and chevrons
      correctly in the browser and the profile no longer shows them.
- [x] **5. After.** Repeat step 1 on this branch.
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

**Baseline** (`dev` at `199fa3c5`, production build with source maps, 39 staff
and 7,162 cells locally; self time in the first-paint CPU profile of 3 cold
loads as a scheduler, ms):

| Cost                                     | Run 1 | Run 2 | Run 3 |
| ---------------------------------------- | ----- | ----- | ----- |
| Main thread busy                         | 4,242 | 2,719 | 5,217 |
| `ShiftDetailHoverCard`                   | 537   | 306   | 604   |
| `formatPublishedMetadata`                | 423   | 313   | 456   |
| `getBoundingClientRect` (forced layout)  | 356   | 185   | 412   |
| `getPropertyValue` (style recalculation) | 168   | 73    | 176   |
| `ScrollableTabs`                         | 238   | 76    | 193   |

Cold-load medians of 5 to the grid: scheduler 3,782 ms, staff 5,418 ms
(samples 3.2 to 5.9 s on a shared machine, so the profile figures are the
steadier measure).

**After** (this branch, same data and method):

| First-paint self time, scheduler (ms)    | Baseline       | After          |
| ---------------------------------------- | -------------- | -------------- |
| Main thread busy                         | 2,719 to 5,217 | 1,494 to 4,386 |
| `ShiftDetailHoverCard`                   | 306 to 604     | 2 to 3         |
| `formatPublishedMetadata`                | 313 to 456     | 7 to 14        |
| `getBoundingClientRect` (forced layout)  | 185 to 412     | 43 to 151      |
| `getPropertyValue` (style recalculation) | 73 to 176      | 100 to 372     |
| `ScrollableTabs`                         | 76 to 238      | 0              |

`getPropertyValue` rises because the page's first style recalculation, which
used to run inside the first layout read, now runs inside the stuck check;
the trace below counts the browser's total. The first run of each set is the slow one on this machine (busy 4,242 before,
4,386 after); the other runs fell from 2,719 and 5,217 to 2,174 and 1,494.

| First-paint self time, staff (ms) | Baseline       | After          |
| --------------------------------- | -------------- | -------------- |
| Main thread busy                  | 3,970 to 4,715 | 1,987 to 3,116 |
| `ShiftDetailHoverCard`            | 367 to 652     | 2 to 17        |
| `getBoundingClientRect`           | 338 to 548     | 57 to 66       |
| `ScrollableTabs`                  | 82 to 245      | 0              |

Staff never build the "Published ... by" label, so it costs nothing on either
build.

**Browser rendering work** (Chrome trace: every Layout and style
recalculation until the grid is visible, median of 5 loads per round, five
rounds interleaved): baseline round medians 333, 503, 333, 618 and 364 ms
(median 364), after 348, 252, 276, 251 and 412 ms (median 276). Step 3 alone,
against step 2 in two rounds: 399 and 388 ms down to 307 and 244 ms, almost
all of it style recalculation; layout itself is about 50 ms.

**Cold load to the grid** (10 loads per role per build, interleaved):
scheduler median 4,366 ms before and 3,380 ms after (samples 3.2 to 7.0 s
and 2.5 to 6.5 s); staff 3,326 ms and 3,384 ms (3.0 to 5.4 s and 2.6 to
6.0 s), the same within this shared machine's noise even though the staff
render's main-thread work fell, as above.

**Behaviour, compared with the build before each change:** the sticky probe
(CSS variables, header and body widths, group position and `data-stuck` at 12
scroll positions across 4 sections, and after a resize) is identical after
steps 3 and 4; the tabs probe (overflow, fades, chevrons and their tab order
at four widths, scrolled to the end and back) is identical after step 4; and
four hover cards read the same on `dev` and this branch, including "Published
Oct 17, 2026, 9:33 PM PDT by Nic Kosmas.". A banner opening above the grid was
not exercised; that path is unchanged apart from running first.
