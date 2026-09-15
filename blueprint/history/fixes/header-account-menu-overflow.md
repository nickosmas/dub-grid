# Fix header account-menu text overflow on narrow/high-zoom desktop widths

**Type:** Fix
**Status:** verified

## The problem

Two Playwright specs from PR #90's CI run still failed after the first round
of CI fixes, both passing locally on macOS Chromium but failing on CI's Linux
runner: `settings-layout.spec.ts` ("display page overflow at 800px") and
`typography.spec.ts`'s "productive typography..." test (a real 8px page
overflow at 1.25x zoom on `/dashboard`, reported element text
`"QSQA SuperAdminSuper Admin"` — the header's avatar+name+role account menu
cluster).

In `Header.tsx`'s account menu button, the display-name line had proper
truncation (`maxWidth: 120, overflow: hidden, textOverflow: ellipsis,
whiteSpace: nowrap`) but the role-label line directly below it (e.g. "Super
Admin") had none, and their shared container had no width ceiling either — so
the container sized itself to whichever line was wider, silently defeating the
name's own truncation whenever the role text (or the name, under different
font metrics) ran long enough. Header renders on every authenticated page, so
this could overflow any page's whole layout, matching both failing specs
(settings at 800px, dashboard at high zoom) with one shared cause. Font-metric
differences between macOS and Linux Chromium are the likely reason it never
tipped over on a local run.

## The fix

Gave the shared name/role container an explicit `maxWidth: 120` ceiling and
added the same truncation treatment to the role label that the name already
had. The whole account-menu text block can no longer exceed 120px regardless
of which line's text is longest or how a given platform renders it.

## Build steps

- [x] **Step 1 - Truncate the account menu's role label and cap its
      container's width.** Done when `Header.test.tsx` still passes and the two
      originally-failing specs pass in CI.

## Verification

- `Header.test.tsx` — 32/32 pass.
- Full web unit suite (433 files / 3699 tests) and `tsc --noEmit` pass.
- `settings-layout.spec.ts` and `typography.spec.ts` pass locally (they never
  failed there); real verification is the next CI run on PR #90, since the
  failure is Linux-Chromium-specific.
