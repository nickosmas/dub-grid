# Fix: The printed schedule has rounded, contained shift pills

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

### The problem

The printed schedule (Schedule > Tools > Print > Preview & Print) does not
match the grid or its own preview:

- **Square pills.** Pill and table corners use `var(--dg-radius-*)`, but the
  print window (`handlePrint` in `components/PrintScheduleView.tsx`) is a blank
  document with none of the app's CSS, so the radius resolves to nothing.
- **Text overlaps.** A shift worked in another focus area shows that area's
  initials in an absolutely positioned wing over a fixed left padding. The
  print window has no Inter font faces either, so the wider fallback font runs
  the label under the wing ("SMC" over "N").
- **Text escapes its container.** Name mode cuts labels by character count and
  breaks words mid-letter ("Eveni/ng"), tallies wrap into each other with `|`
  separators, fixed row heights clip three-line cells, and month cells at
  Large overflow entirely.
- **The preview is not the printout.** The on-screen paper is as wide as the
  window, so it wraps and shortens text in different places than the page.
- **Full shift names do not fit two weeks or a month** on one landscape page.

A harness that rendered the print view into Chromium and checked geometry
counted, for example, 30 label overlaps and 9 escaping labels in one week of
name mode at Large, and 235 escapes in a month at Large.

### The fix

Give the printout its own pill and its own document, sized for paper:

- `PrintShiftPill` draws each printed shift. The focus-area initials are a flex
  item beside the label, or above it where the pill is too narrow to share a
  row, so they cannot overlap it. Corners are literal and tight for paper
  (`0.35em` single, `0.3em` double; table `6px`). Labels shorten with an
  ellipsis and never break mid-word.
- `print-document.ts` builds the print window's document: it copies the app's
  `@font-face` rules so Inter loads, and waits for images and fonts before
  printing.
- Rows grow to fit instead of clipping; a month stacks a double shift's pills;
  tallies print one count per line; the name cell clamps to two lines.
- The preview paper is a landscape Letter page (`11in` with `0.5in` padding),
  so it lays out at the printed width.
- With full shift names, Print offers only the 1-week view and says why,
  and the printout has no Shift Key, since the names need none.

Must not break: absences print in their own colors as one pill, schedule-note
dots and the note legend, the colors already used for cross-focus-area shifts
(white body, shift-colored wing), and every value staying literal, because the
print window has no CSS variables.

**Already built:** commit `587fdafc` on `fix/print-layout`, in the worktree
`.claude/worktrees/print-layout`, implements every step below. `/implement`
verifies each step against that branch and checks it off rather than
rebuilding it.

**Parked spec:** the not-started mobile release-pipeline fix was moved to
`blueprint/context/parked/mobile-release-pipeline.md` to free this slot. Put
it back here once this fix is completed.

### Build steps

- [x] **1. The print document loads Inter and waits for it.**
      `components/print-document.ts` exports `collectFontFaceCss`,
      `buildPrintDocument` and `whenPrintReady`; `handlePrint` uses them, and
      the preview paper is `11in` wide.
      **Done when:** a test shows font faces collected from readable sheets
      only (a cross-origin sheet is skipped) and the title escaped, and in the
      running app the collected rules load Inter in a blank document.
- [x] **2. Shift pills are rounded, and the wing never covers the label.**
      `components/PrintShiftPill.tsx` replaces the inline single and multi pill
      markup; `resolveCellPills` keeps the absence and cross-focus color rules.
      **Done when:** tests show every pill's radius is a literal with no
      `var(--`, and the wing is a flex item (not absolutely positioned) beside
      the label.
- [x] **3. Every printed text stays inside its box.** Ellipsis without
      mid-word breaks, rows that grow, month stacking, one tally per line, and
      a two-line name cell.
      **Done when:** the Chromium containment check across 1 week, 2 weeks and
      a month, in code and name mode at Small, Medium and Large, finds no
      overlap, escape or clipped text.
- [x] **4. Full shift names print one week at a time.**
      `PrintOptionsModal` takes `shiftDisplayMode` and, in name mode, offers
      only 1 Week with the note "Full shift names print one week at a time."
      The schedule tools, schedule grid and integrations pages say so.
      **Done when:** a modal test shows 2 Weeks and Month disabled and the
      print config is one week, and `npm run docs:check` passes.

- [x] **5. Full shift names print no Shift Key.** The names already say what
      each pill is, so `PrintScheduleView` drops the Shift Key in name mode
      and keeps the schedule-notes key. The schedule grid and schedule tools
      pages say the shift legend is for codes.
      **Done when:** a test shows the Shift Key for codes, none for full names,
      and the schedule-notes key still printed; `npm run docs:check` passes.

### Verify

- `npx vitest run src/__tests__/PrintScheduleView.test.tsx
src/__tests__/PrintOptionsModal.test.tsx` and the typography and theme
  contract tests pass in `apps/web`.
- `npm run type-check`, `npm run lint`, `npm run test:web`, `npm run build`
  and `npm run docs:check` pass from the worktree.
- Manually: Schedule > Tools > Print, pick each view and size, then **Preview
  & Print**. Pills have small rounded corners, the focus-area initials sit
  beside or above the label, nothing overlaps or runs out of its cell, and the
  printed page matches the preview. With full shift names, only 1 Week can be
  chosen.
