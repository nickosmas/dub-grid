# Fix: App-wide slide-over panel inconsistency (no visible slide, backdrop not darkened, no scroll lock)

**Type:** Fix
**Status:** verified

## The problem

The user reported the People page detail slide-over appearing instantly
instead of sliding in. Investigation found the real cause went well beyond
one panel: at least 10 files implemented slide-over panels with four
different, inconsistent patterns:

1. `StaffDetailPanel` used the Base UI `Sheet` primitive
   (`ui/sheet.tsx`) with only a 40px `translate-x-[2.5rem]` transform - too
   small to read as a slide.
2. `ShiftEditPanel`, `ShiftRequestBoard`, `PublishHistoryPanel`,
   `CoveragePanel` used the `.dg-panel`/`.dg-panel-overlay` CSS classes,
   whose `panel-in` keyframe already did a correct full
   `translateX(100%) -> 0` slide, but none of them ever applied a
   `.closing` class before calling `onClose`, so there was no exit
   animation and the panel just vanished.
3. `StaffReadOnlyDetailPanel`, `AllUsersView`, `ManagementStaffPanel` each
   independently hand-rolled an identical `closing` state +
   `setTimeout(200)` pattern against a triplicated
   `.staff-detail-pane`/`.staff-detail-overlay` class pair (a subtler 24px
   - scale entrance, not a full slide).
4. `GridmasterSecurityView`'s `SessionDetailPanel` used the
   `.staff-detail-pane` classes with no closing-state logic at all (and no
   Escape-key handling).

Follow-up feedback added three more requirements: the backdrop should
darken the _entire_ background (not just partially, and not with a blue
tint or blur), the page behind an open panel should not be scrollable, and
every slide-over in the app should behave identically.

## The fix

- Added `apps/web/src/hooks/useSlideoverClose.ts`: a single shared hook
  that returns `{ closing, close }`. `close()` sets `closing` immediately
  (so the caller can apply a `.closing` class) and defers the real
  `onClose()` by `SLIDEOVER_CLOSE_MS` (200ms, matching the CSS exit
  animation). The hook also locks `document.body` scroll for as long as
  the panel is mounted, using a module-level reference count so stacked or
  rapidly remounted panels don't have one panel's unmount re-enable
  scrolling while another is still open.
- Migrated every slide-over panel onto this hook and the shared
  `.dg-panel`/`.dg-panel-overlay` classes: `StaffDetailPanel` (off the
  Base UI `Sheet`), `StaffReadOnlyDetailPanel`, `AllUsersView`,
  `ManagementStaffPanel`, `GridmasterSecurityView`'s `SessionDetailPanel`
  (off the triplicated `.staff-detail-pane` classes), and
  `ShiftEditPanel`, `ShiftRequestBoard`, `CoveragePanel`,
  `PublishHistoryPanel` (wiring the previously-dead `.closing` exit state).
  Every migrated panel now has `role="dialog"`, `aria-modal="true"`, an
  `aria-label`, and closes via `close()` on backdrop click, Escape, and
  every close/back button.
- Changed `--dg-overlay` from a blue-tinted `rgba(10, 20, 40, 0.45)` to a
  neutral `rgba(0, 0, 0, 0.6)` (no blur), applied through the one shared
  token so every overlay in the app (modals included) darkens the same
  way.
- Added `.dg-panel--wide` (560px) and `.dg-panel--x-wide` (640px) width
  modifiers so panels that need more room than the default 480px still
  share the same base panel/overlay/animation.
- Removed the now-dead `.staff-detail-pane`/`.staff-detail-overlay`/
  `staff-detail-in`/`staff-detail-out` CSS after confirming no remaining
  consumers.
- Every panel now renders through `createPortal(..., document.body)`. The
  Base UI `Sheet` used to portal, and the migration off it left
  `StaffDetailPanel` rendering inline inside the People page's `<main>`
  (`SidebarInset`); there, the overlay lost to the sticky app header
  (`z-index: 9999`) and the fixed sidebar (`z-index: 10`) despite its own
  `z-index: 10000`, so the nav and sidebar stayed bright. Moving the node
  under `<body>` was verified live to be the exact variable that fixes it,
  and portaling every panel keeps them immune to whatever ancestor they are
  mounted under.
- The scroll lock compensates for the scrollbar's width with body
  `padding-right` and applies in `useLayoutEffect`, so pages with a
  layout-affecting scrollbar (the Schedule grid) don't reflow sideways as
  the panel opens.
- `ShiftEditPanel` is lazy-loaded on the Schedule page. Its `loading`
  fallback was `LazyOverlayFallback`, a separate `.dg-modal-overlay`, so the
  very first (uncached) open faded in one backdrop, swapped it out, then
  faded in the real `.dg-panel-overlay`: the reported backdrop jitter.
  Replaced `next/dynamic` for it with `components/schedule/ShiftEditPanelLazy.tsx`,
  which starts the chunk download as soon as the schedule bundle evaluates
  and, once the module is in hand, renders the panel synchronously in the
  same commit as the click. `next/dynamic` always suspends once per page
  load even with the chunk cached (a fallback commit plus a deferred retry
  render), which was ~300ms of the first-open delay on its own; the
  fallback while a cold chunk downloads is the same top progress bar the
  Coverage and Requests panels use, not a second overlay.
- "The schedule picker slideover comes in delayed": measured click-to-panel
  at 769-1087ms in dev, of which the click handler was 2ms. React Profiler
  attribution put ~540ms of every state change in the `ScheduleGrid`
  subtree, and a per-prop memo tracer showed why: the `ScheduleGrid`
  wrapper passed `departments={Array.from(model.departmentsById.values())}`
  (a fresh array every render), which cascaded through
  `departmentSections -> sections -> exclusiveCodeIdsPerSection` and, with
  per-section `employees`/`openShifts` also derived inline, gave every
  memoized `SectionBlock` new props on every render. Then `activeCellId`
  went to every section, so the section holding the clicked cell (the
  largest) re-rendered all ~200 of its cells just to mark one. Fixes:
  - `ScheduleGridModel.departmentList` passes the page's memoized array
    through unchanged, and the wrapper uses it.
  - `LegacyScheduleGrid` derives each section's `exclusiveCodeIds`,
    `employees`, and `openShifts` once in a `useMemo` keyed on the real
    inputs (with a shared `EMPTY_ID_SET` instead of `new Set()` per render).
  - The active cell no longer flows through `SectionBlock`/`LegacyScheduleGrid`
    props. The wrapper provides it via `ActiveCellContext`; a small
    `ActiveCellOutline` inside each section reads it, measures the outline,
    and sets `data-active` on the cell imperatively (React never renders
    that attribute now, so nothing conflicts). It reads the grid ref inside
    the animation-frame callback because, sitting inside the grid element,
    its layout effect runs before the ancestor's ref is attached on a mount
    that already has an active cell. Opening a panel re-renders the
    outline, not the rows.
    Result in dev with StrictMode: first open 117ms click-to-panel, second
    open 83ms, close 88ms of work (from ~700-1500ms). A "Today" click still
    re-renders the grid because `weekDates`, `resolvePublisherName`, and
    `bulkSelectableCellKeys` change identity; that is the same class of fix
    but outside this item's scope.
- Escape is now handled once, in the hook (`useSlideoverEscape`), from a
  document-level listener. Before, five panels listened on `document` and
  five used `onKeyDown` on the panel `<div>`, which only fires when focus is
  inside the panel, so Escape did nothing on a freshly opened Schedule,
  Coverage, Publish History, or Requests panel. Only the top-most mounted
  panel responds, and a modal stacked above it (`.dg-modal-overlay`) owns
  the key, so Escape closes the ConfirmDialog rather than yanking the panel
  out from under it. `StaffDetailPanel` and `ManagementStaffPanel` keep
  their unsaved-changes guard by passing `{ escape: false }` and routing
  Escape through `useSlideoverEscape(handleRequestClose)`. `close()` is
  idempotent so Escape plus a click can't schedule `onClose` twice.
- `AllUsersView` called the hook at the view level (always mounted), which
  with the hook now owning scroll lock and Escape would have locked the
  Gridmaster users page permanently and left `closing` stuck after the
  first close. Its panel now mounts through a small `UserDetailSlideover`
  render-prop wrapper that exists only while a user is selected.
- Found while reviewing the People page at narrow widths: the directory
  table already scrolls horizontally (`min-w-[1280px]` in an
  `overflow-x-auto` wrapper), but its pill columns (Wings, Account) were
  still squeezed to ~100px with values breaking mid-word, because
  `.dg-pill-display`'s `overflow-wrap: anywhere` lets auto table layout
  treat a pill as one character wide. Inside a horizontal scroller a pill
  now keeps its full width (`white-space: nowrap`), so the column's minimum
  grows and the table scrolls instead of crushing content.

## Build steps

- [x] Add `useSlideoverClose` hook (close-delay + body scroll lock).
      _Done when_ the hook compiles clean and locks/unlocks
      `document.body.style.overflow` correctly under concurrent mounts.
- [x] Migrate `StaffDetailPanel.tsx` off the Base UI `Sheet` onto
      `.dg-panel`. _Done when_ it slides in/out from the right and the
      backdrop darkens/fades using the shared classes.
- [x] Migrate `StaffReadOnlyDetailPanel.tsx`, `AllUsersView.tsx`,
      `ManagementStaffPanel.tsx` off the triplicated `.staff-detail-pane`
      classes onto `.dg-panel`/`useSlideoverClose`. _Done when_ all three
      render identical slide/darken behavior instead of the old 24px nudge.
- [x] Migrate `GridmasterSecurityView.tsx`'s `SessionDetailPanel` onto
      `.dg-panel`/`useSlideoverClose`, adding Escape-key handling it
      previously lacked. _Done when_ it closes the same way as every other
      panel.
- [x] Wire `useSlideoverClose` into `ShiftEditPanel.tsx` (both return
      blocks), `ShiftRequestBoard.tsx`, `CoveragePanel.tsx`,
      `PublishHistoryPanel.tsx`, replacing direct `onClose()` calls with
      `close()` and interpolating the `.closing` class. _Done when_ each one
      has a real exit animation instead of vanishing instantly.
- [x] Change `--dg-overlay` to `rgba(0, 0, 0, 0.6)`, no blur. _Done when_
      every panel and modal backdrop darkens the same neutral shade.
- [x] Remove dead `.staff-detail-pane`/`.staff-detail-overlay` CSS. _Done
      when_ a repo-wide grep finds zero remaining source references.
- [x] Portal every panel to `document.body` and fix the Schedule first-open
      backdrop jitter (progress-bar fallback + chunk warm-up) and the
      scrollbar-width reflow. _Done when_ the People panel's overlay is the
      topmost element at header and sidebar pixels, and the first Schedule
      cell click mounts the panel with no intermediate overlay.
- [x] Make the shift editor open fast: stabilize `SectionBlock` props
      (`departmentList`, per-section `useMemo`), move the active-cell
      highlight to `ActiveCellContext`/`ActiveCellOutline`, and replace the
      editor's `next/dynamic` boundary with `ShiftEditPanelLazy`. _Done when_
      a cell click mounts the panel in one commit (~100ms in dev) and only the
      outline, not the section rows, re-renders on open and close.

## Verify

- `npx tsc --noEmit -p apps/web/tsconfig.json` - clean, project-wide.
- `npx eslint` on every touched file - clean; `npx prettier --check` -
  clean.
- `npx vitest run` (apps/web) - 435 files / 3718 tests pass, including
  `MembersSection.test.tsx`, `StaffView.test.tsx`, `ScheduleGrid.test.tsx`,
  and `ShiftEditPanel.test.tsx`, which render the migrated panels and the
  grid. `ShiftEditPanel.test.tsx` was updated for the new contract: its
  Diff-badge assertions query `document.body` instead of `container` (the
  panel portals), and the two close tests `waitFor` the deferred `onClose`.
  `ScheduleGrid.test.tsx`'s active-cell test now `waitFor`s the mark, which
  the outline's layout effect applies on the next animation frame.
- `npx next build` (apps/web) - completes with every route compiled.
- Live browser check as `qa-super-admin@dubgrid.test` against local dev
  (`calmhaven.localhost:3000`):
  - `/people` Directory tab: opened `StaffDetailPanel` via a roster row.
    Confirmed via `getComputedStyle`/`elementFromPoint` that
    `.dg-panel-overlay` covers the full viewport (including the left nav
    sidebar) at `rgba(0, 0, 0, 0.6)`, and that `document.body`'s
    `overflow` is `hidden` while open and reverts to `visible` after
    closing.
  - `/schedule`: opened `ShiftEditPanel` from a shift cell. Confirmed the
    same full-viewport darkening and body scroll lock, and that closing
    via backdrop click restores the grid with no residual panel/overlay
    in the DOM.
  - After the portal/Escape pass: on `/people` the overlay is the topmost
    element (`elementsFromPoint`) at header, sidebar, and content pixels
    and both panels mount under `<body>`; Escape with focus on `<body>`
    closes the Schedule and People panels and restores `overflow` and
    `padding-right`; with the Deactivate ConfirmDialog open above the
    People panel, Escape closes the dialog and the panel stays mounted.
  - Shift editor timing on `/schedule` (dev, StrictMode), measured with a
    `MutationObserver` on `.dg-panel` and a `longtask` observer: first
    cell click 105-117ms click-to-panel with one ~110ms task (before:
    769-1087ms with 487ms + 92ms tasks); second open 83ms; Escape close
    88ms of work and the panel gone at 291ms (200ms exit animation). The
    clicked cell carries `data-active="true"` with the outline sized to it
    while open, and both clear on close.
  - `/people` directory at a 1000px viewport: pills render single-line
    (23px tall) and the table grows to 1476px inside its 918px scroller
    instead of squeezing the Wings column to 108px.
