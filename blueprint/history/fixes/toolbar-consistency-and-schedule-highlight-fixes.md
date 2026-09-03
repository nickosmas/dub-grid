# Current Feature

**Title:** Button outline ghosting, People-page tab sizing, schedule highlight suppression

**Type:** Fix

**Status:** verified

**Note:** After the original 4 steps below were built, manual browser
verification of step 1 (via Playwright against the local dev server, using
`qa-super-admin@dubgrid.test`) surfaced that the initial People-page tab fix
had real regressions, which led to a live, user-directed iteration pass that
significantly expanded step 1 and added three new toolbar/UI-consistency
fixes not in the original spec (steps 5-7 below). All of it is built,
tested, and verified — this note exists so the archived record matches what
actually shipped.

## The problem

Three independent production bugs, each with a confirmed root cause from prior
investigation (full detail in `/Users/nickosmas/.claude/plans/create-a-plan-cheeky-eclipse.md`):

1. **Segmented control too narrow.** The People page's People / Active /
   Inactive tabs (and the management department tabs) render narrower than
   the available space and force their own internal horizontal scroll.
   `apps/web/src/components/staff/MembersSection.tsx` lines 1163 and 1229 give
   the shared `ScrollableTabs` component `flex: "0 1 auto"` on desktop — zero
   grow, combined with `minWidth: 0` removing the shrink floor — inside a row
   that also holds a search input with `flex: "1 1 300px"` that happily grows
   and starves the tabs. Every other `ScrollableTabs` consumer (`Toolbar.tsx`,
   `RepeatForm.tsx`, `ShiftRequestBoard.tsx`, `ShiftPicker.tsx`) gives it room
   to grow and doesn't have this problem.

2. **Button focus-outline "ghosting" on click, app-wide.** Save/Discard in
   shifts settings, Coverage settings, and CoveragePanel all show a lingering
   outline glitch right after click. `apps/web/src/app/globals.css`'s
   `.dg-btn` transition list (line 634) covers background/border/color/
   transform/opacity/filter but not `outline`/`outline-offset`; `.dg-btn:disabled`
   (line 672) doesn't clear outline. `Button.tsx` (via `useAsyncAction.ts`)
   sets the native `disabled` attribute synchronously on click, which forces
   the browser to blur the still-focused button — the outline disappears in
   one frame while the rest of the button is still 150ms into its transition,
   reading as a ghost. Shared root cause across every reported instance since
   they all use `Button` + `.dg-btn` + `useAsyncAction`.

3. **Schedule "recently changed" highlight sometimes doesn't show.** Two
   independent, compounding causes:
   - 3a: `apps/web/src/components/ScheduleGrid.tsx` line 1993-1994 nulls the
     publish-diff badge for _any_ cell with a concurrent draft
     (`!draftKind && showsPublishDiff`), even when that draft produces no
     visible badge of its own (e.g. a plain `"new"` draft kind). The correct
     "draft wins, publish is the fallback" logic already exists a few lines
     below (`draftBadge ?? publishBadge`) but never gets a chance to run
     because `publishBadge` is nulled upstream first.
   - 3b: `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` lines
     1402-1409 has a `useEffect` that force-disables the "Highlight Changes"
     toggle (`showPublishDiff`) whenever the visible date range has zero
     in-window publish history, and never re-enables it when the user pages
     back into range. This is redundant: `publishChangesMap` and the banner's
     own render gate already suppress out-of-window rendering correctly on
     their own, so this effect only adds the bug (toggle stuck off) without
     doing anything useful.

## The fix

Four small, independent changes. None should regress existing behavior;
3a/3b rely on logic that's already present and correct elsewhere in the same
files, so both are subtractive (remove an incorrect guard / remove a redundant
effect), not additive.

Must not break: cell border rendering for drafts (`effectiveBorder`, unaffected
by 3a), the diff cell background tint (`showDiffCellTint`, unaffected by 3a),
the two intentional, explicit toggle-clears in `handlePublish` and the
banner's dismiss button (unaffected by removing 3b's effect), and the fixed
widths of `CustomSelect` and the search input in the People toolbar row
(unaffected by widening the tabs' flex-grow).

## Build steps

- [x] Segmented control sizing. In `apps/web/src/components/staff/MembersSection.tsx`,
      change the desktop branch of the `flex` style at line 1163 (People/Active/
      Inactive tabs) and line 1229 (management department tabs) from
      `"0 1 auto"` to `"1 1 auto"`.
      Done when both tab bars expand to use available row width at common
      desktop widths (1280/1440/1920) without showing the internal scroll-chevron
      affordance, and the `CustomSelect`/search input/buttons in the same row
      keep their existing sizing.

- [x] Button outline transition. In `apps/web/src/app/globals.css`, add
      `outline-color 150ms ease` to `.dg-btn`'s transition list (line ~651), and
      add `outline: none;` to `.dg-btn:disabled` (line ~672).
      Done when clicking Save/Discard on `ShiftCategories`, `Coverage` settings,
      and `CoveragePanel` shows no lingering/snapping outline, in both light and
      dark mode. If Coverage settings still glitches after this change (from its
      Discard button unmounting instead of disabling), align it with
      `ShiftCategories.tsx`'s always-mounted, `disabled`-toggled pattern as a
      follow-up within this same step.

- [x] Schedule publish-diff badge guard. In `apps/web/src/components/ScheduleGrid.tsx`
      line 1993-1994, change:

  ```js
  const isPubDiff = !draftKind && showsPublishDiff ? publishDiff : null;
  ```

  to:

  ```js
  const isPubDiff = showsPublishDiff ? publishDiff : null;
  ```

  Add a test in `apps/web/src/__tests__/ScheduleGrid.test.tsx` using the
  existing `renderGrid` harness and `data-publish-badge`/`data-draft-badge`
  hooks: (a) `draftKindForKey: () => "new"` + `publishDiffForKey` returning a
  `"modified"` change with `showPublishDiffOverlay: true` asserts
  `[data-publish-badge="modified"]` renders; (b) `draftKindForKey: () =>
 "modified"` (a kind with its own badge) asserts the draft badge wins and no
  publish badge renders in that slot.
  Done when both new tests pass and the existing suite is unaffected.

- [x] Schedule highlight toggle effect removal. In
      `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx`, delete the
      `useEffect` at lines 1402-1409 (comment block plus the effect body) that
      force-clears `showPublishDiff` when `inWindowPublishHistory.length === 0`.
      No replacement logic. If a reasonable way to isolate and test the
      toggle-persistence behavior exists, add it (asserting `showPublishDiff`
      stays `true` across `inWindowPublishHistory.length` transitioning
      `>0 → 0 → >0`); otherwise verify manually.
      Done when paging the schedule grid's visible date range out of and back
      into a published window leaves the "Highlight Changes" toggle on and
      highlights reappear without re-clicking, and `handlePublish`'s own
      `setShowPublishDiff(false)` plus the banner dismiss button's clear still
      work as before.

- [x] Segmented control sizing, corrected via live verification. The first
      pass (step 1 above, `flex: "1 1 auto"`) rendered correctly in isolation
      but collided with a concurrent session's own fix to the same lines
      (`flex: "0 0 auto"` plus an unconditional `flexWrap: "wrap"` on
      `people-toolbar-controls`), producing a visible regression (search box
      wrapping to its own line / crushed to near-zero width) caught by the user
      in the running app. Reconciled by measuring real computed layout via a
      throwaway Playwright script against the local dev server
      (`qa-super-admin@dubgrid.test`) instead of reasoning about flexbox blind:
  - Both tab branches (People/Active/Inactive and management departments)
    in `MembersSection.tsx` use `flex: "0 0 auto"` on desktop (never grow
    past content, never shrink below it — the actual fix for "never
    internal-scroll").
  - `people-toolbar-controls` gets `flex: "1 1 auto"` so the outer flex
    layout gives it a deterministic width (matching real available page
    space) instead of an ambiguous nested-auto-size, and keeps
    `flexWrap: "wrap"` so the row degrades gracefully instead of
    overflowing when genuinely tight.
  - The search input (`people-search`) gets `minWidth: 280` (desktop; wide
    enough for its longest placeholder, "Search by name, email, or
    phone...", measured via canvas text metrics) and `maxWidth: 380`.
    Done when the toolbar stays on one line whenever there's room, wraps only
    under genuine width pressure, never overflows horizontally, and the
    search box never shrinks below a legible width — confirmed via a
    Playwright width sweep (700-1920px) asserting no horizontal overflow at
    any width.

- [x] Toolbar height consistency (user-requested, live). People-page toolbar
      controls used a shorter `dg-btn-sm` (34px) for Filter/Reorder/Import/
      Export/Add plus a hardcoded 32px search input, inconsistent with the
      Schedule page's toolbar (`--dg-toolbar-h`, 38px throughout). Changed all
      `dg-btn-sm` occurrences in `MembersSection.tsx`'s toolbar to plain
      `dg-btn` and removed the search input's inline `height: 32` override (it
      now inherits `.dg-input`'s natural 38px). Also fixed the Reports page's
      two filter-row buttons (`datePickerButtonStyle`, `targetDropdownButtonStyle`
      in `ReportsPageContent.tsx`), which hardcoded `minHeight: 40` instead of
      the shared token; both now use `minHeight: "var(--dg-toolbar-h)"`.
      Updated `ReportsPageContent.test.tsx`'s matching assertion.
      Done when all three pages' toolbar controls render at a consistent 38px.

- [x] Schedule page search bar width (user-requested, live). In
      `apps/web/src/components/Toolbar.tsx`, the desktop staff-search input was
      hardcoded to `width: 160` with its wrapper's `flex` left `undefined` (no
      grow), and the containing "FILTER ZONE" block had no flex-grow of its own
      relative to its siblings (same ambiguous-nested-flex issue as the People
      page). Fixed: FILTER ZONE gets `flex: "1 1 auto"` on desktop; the search
      wrapper gets `flex: "1 1 220px", minWidth: 200, maxWidth: 320`; the input
      itself now always uses `width: "100%"`.
      Giving FILTER ZONE deterministic width surfaced a second, previously
      latent bug: the adjacent focus-area `ScrollableTabs` already had
      `flex: 1` (pre-existing, unchanged by this fix), which had never had real
      leftover space to grow into before — now that it does, the tab pills
      stretched apart with large gaps, caught by the user in the running app.
      Fixed by making both the tabs' wrapper div and the `ScrollableTabs` itself
      non-growing on desktop (`flex: "0 0 auto"`, matching content width) while
      keeping their existing internal-scroll-on-overflow behavior intentional
      for this variable-length list (unlike People's fixed 4-tab set, which
      must never scroll).
      Done when the search bar grows/shrinks responsively and never overflows
      the viewport, confirmed via a Playwright width sweep (900-1920px).

- [x] Neutral category status-pill contrast (user-requested, live). The
      "Not invited" account-status pill (and any other `variant="category"
 tone="neutral"` `StatusPill`, e.g. Activity Log category badges) computed
      its background as `color-mix(in srgb, var(--dg-color-surface) 96%,
 var(--dg-color-text-label))` — roughly `#f9f9f9` in light mode, visibly
      washed out against a white row since gray-mixed-with-white barely
      changes hue (unlike the colored tones, where this same formula works
      fine). Changed `status-pill.tsx` so `variant="category" tone="neutral"`
      uses `var(--dg-color-bg-secondary)` directly (`#eeeeee` light /
      `#1c1c1f` dark) — the same real, already-vetted token the plain
      (non-category) neutral tone already uses elsewhere. Updated
      `status-pill.test.tsx`'s matching assertion.
      Done when the neutral category pill has a clearly visible, distinct
      background in both themes.

- [x] Web sign-out confirmation (user-requested, live, not a bug fix from the
      original investigation). `Header.tsx`'s `handleSignOut` previously only
      showed a confirmation dialog when exiting a sandbox (which discards it);
      a plain sign-out fired `signOut()` immediately with no confirmation at
      all. Both the desktop account-menu and the mobile nav sheet route through
      this same handler (`MobileNavSheet` receives it via `onSignOut`), so one
      fix covers both surfaces. Changed `handleSignOut` to always open the
      existing `logoutConfirmOpen` dialog state; `logoutConfirmDialog` now
      branches on `isInSandbox` to render either the existing sandbox-exit
      `ConfirmDialog` (unchanged) or a new plain one (title "Sign out",
      message "Are you sure you want to sign out?", `variant="info"`) whose
      confirm calls `signOut()` directly. Updated 2 existing `Header.test.tsx`
      cases that asserted immediate sign-out with no prompt (now confirm
      through the dialog first, scoped via `within(dialog)` since the trigger
      and confirm button share the "Sign out" label) and added one new case
      asserting the dialog appears and blocks sign-out until confirmed.
      Done when clicking "Sign out" (desktop or mobile) always shows a
      confirmation dialog, canceling leaves the session intact, and confirming
      completes the real sign-out flow — verified live via Playwright against
      the local dev server.

## Verify

- `npm run test:web` (includes the two new `ScheduleGrid.test.tsx` cases)
- `npm run type-check`
- `npm run build`
- Manual/Playwright as a super_admin:
  - People page tab sizing at 1280/1440/1920 widths, both tab bars.
  - Save/Discard click on ShiftCategories, Coverage settings, CoveragePanel,
    light + dark mode — no lingering outline.
  - Schedule grid: a cell with both a draft and a publish-history change now
    shows the change badge.
  - Schedule grid: toggle "Highlight Changes", page the date range out of and
    back into a published window, confirm the toggle stays on and highlights
    reappear without re-clicking.

## Out of scope

The Gridmaster/org "Activity Log" 500 error does not reproduce on `dev` and is
not part of this fix — it needs direct verification against the production
Supabase project (does `get_filtered_audit_log` from
`supabase/migrations/007_filtered_audit_log.sql` exist there, and is
`EXECUTE` still granted to `service_role`?) before it can be spec'd as a fix.

Note: `SchedulePageClient.tsx` shared the working tree with another
concurrent session's unrelated presence/`untrack()` work for most of this
fix's build. Step 4's toggle-effect removal stayed isolated to its own git
hunk throughout, confirmed unchanged right up to when that other session
committed its own work (`093b035f`, "fix(schedule): stop stranding presence
and harden collaboration") — since both edits sat in the same uncommitted
file, that commit incidentally includes step 4's removal too. Verified by
diffing `093b035f` directly: the `Defensive bookkeeping` effect is present
in the deletions. No separate commit was needed for that one file.
