# Fix: The Schedule grid mounts the first screen first and skips redraws that change nothing

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

### The problem

The follow-ups left by the loader fixes (`blueprint/history/fixes/schedule-loader-stalls.md`):

- **Every cell mounts before the grid shows.** About 940 cells and 8,300 DOM
  nodes for Calm Haven (39 staff, 4 focus areas, two weeks), all in one
  synchronous render and commit, though the screen shows about a third of
  them. On a slow machine (this container under load, CPU slowed 4x) that one
  task ran 45 to 53 s, with the loader frozen: no frame, no timer, so not even
  the "taking longer than usual" message could show.
- **The background widen re-renders every visible cell.** It refetches the
  visible dates too, so every accessor the grid reads changes identity and
  every section renders again, though no visible cell changed: 440 to 620 ms
  of render and 130 to 180 ms of commit, close to the first render itself.
- **The server page looks the session up for nothing.** `page.tsx` reads
  the session cookie and verifies the token, and `SchedulePageClient` throws
  the result away (`void initialState`).
- **dnd-kit's droppable registration is O(n^2)**
  (`DroppableContainersMap` is copied per registration): measured at about
  20 ms of the first render, so it stays as it is.

### The fix

1. **The first screen first.** The grid's first render mounts the sections
   that fill one and a half screen heights, and only the first rows of the
   section that height ends in, holding the rest's estimated space. After the
   first paint the rest mounts one step at a time (the partly mounted section
   in full, then one section a step), each when the main thread is next idle
   and within 300 ms regardless. Not transitions: the updates still landing
   then would restart one over and over and redo its work. Nothing mounted is ever unmounted, so print, find in page and the
   tallies all see the whole grid once it settles. A staff search mounts
   everything at once, so the scroll to its match always finds it.
2. **Sections skip renders that change nothing.** `SectionBlock`'s memo
   compares its per-cell accessors by what each of its own cells reads from
   them (a section only reads them for its own staff and dates), including
   the publisher-name lookup and the bulk-removal selection sets, and the
   arrays the grid rebuilds with the same contents (`employees`,
   `exclusiveCodeIds`, `openShifts`) by contents. Every other prop still
   compares by identity. The grid's click, menu, claim and bulk-toggle
   callbacks read the latest handlers through a ref, so a new handlers object
   no longer re-renders every section either. A widen that changes no visible
   cell renders no section, and an edit renders only its own section.
3. **The server page renders the client page and nothing else.** The group
   layout is already `force-dynamic`, so dropping the cookie read changes
   nothing about how the route renders.

**Must not break:** a cell that changed always shows its new value; the
sticky header, search, hover cards, drag and drop and copy and paste; every
row present once the grid settles.

### Build steps

- [x] **1. Diagnose.** Long-task, CPU and memory probes on a production build
      of `dev`.
- [x] **2. Server page (fix 3).**
- [x] **3. Section memo (fix 2),** with unit tests for `isDeepEqual` and grid
      tests that a section skips when its cells read the same, renders when
      one changed, and renders when another prop changed.
- [x] **4. First screen first (fix 1),** with unit tests for the mount steps
      and a grid test that the first screen held space and every row ended
      mounted.
- [x] **5. Measure** the branch against `dev` on production builds.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`, the schedule
  Playwright specs, `npm run docs:check:closed`.

### Measurements

Production builds of `dev` (`0b2c4315`) and this branch, local stack, Calm
Haven (39 staff, 7,162 cells, 4 focus areas, about 940 cells on screen),
Playwright Chromium at 1440x900, Dashboard then Schedule by its link. This
container was heavily loaded throughout (the same build took 1 to 11
minutes), so wall-clock figures swing widely; main-thread CPU time
(`ThreadTime`) is the steadier measure. Medians of 10 runs each, the builds
alternated two runs at a time:

| Measure                          | `dev`  | This branch |
| -------------------------------- | ------ | ----------- |
| Click to first grid frame        | 4.0 s  | 1.8 s       |
| Main-thread CPU to the grid      | 5.6 s  | 1.4 s       |
| Main-thread CPU after it (widen) | 5.2 s  | 4.1 s       |
| Total main-thread CPU            | 10.7 s | 6.0 s       |
| Longest task before the grid     | 2.0 s  | 0.36 s      |
| Longest task after it            | 1.75 s | 0.52 s      |

**Section renders, whole load:** 6 on this branch: the first screen (part of
one section), that section in full, the 3 others, and one more of the first
section when a cell in it really changed. The widen itself renders none.
Before the handler and set fixes, new `handleCellClick`, `resolvePublisherName`
and `bulkSelectableCellKeys` identities re-rendered every section 9 to 17 more
times per load.

**Behaviour, compared with `dev`:** identical output from the sticky probe
(12 scroll positions across 4 sections, and after a resize), the tabs probe,
four hover cards and the search probe (rows in three sections, their scroll
position and margin). A shift dragged over a cell of each section mounted
after the first screen lights it as the drop target.

**dnd-kit:** both builds build 938 droppable maps and copy 440,391 entries
per load, all after the first paint. Registering does not re-render the cells
(dnd-kit's internal context does not change), so it costs the reducer's
copies alone, tens of milliseconds here. It stays as it is.

**Earlier, on `dev`, at 4x CPU:** one task of 45 to 53 s with the loader up,
mostly the grid's render and commit and 6 s of garbage collection; no leak:
the heap returned to about 22 MB after each of six visits.
