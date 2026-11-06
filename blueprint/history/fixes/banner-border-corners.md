# Fix: Banners get a soft border, 6px corners and an X to dismiss

**Type:** Fix
**Status:** verified
**Branch:** `fix/banner-border-corners`

## The problem

Banners lost their border and read softer than the controls around them, their
10px corners didn't match the 6px of the toolbar beside them, and the Schedule
bars spelled out Close where the rest of the app uses an X (owner, 2026-11-05).

## The fix

Owner decisions, 2026-11-05, from the "Banners with a border" canvas board.

- **Soft border.** Boxed banners, the Schedule bars, the recurring notice and
  the landing page's draft banner take a 1px border a step deeper than their
  fill. Full-width solid bars stay as they are.
- **Matching corners.** Those banners take the toolbar's radius from the same
  token, `--dg-btn-radius` (6px), so the two stay matched. The toolbar is
  unchanged.
- **X to dismiss.** The Schedule bars and the draft banner dismiss with the
  shared `CloseButton`, labelled Dismiss, in place of Close.
- **Alignment.** A button in a boxed banner sits on the first line's centerline
  beside the 20px icon, and the Schedule bars center their actions.
- **Filled icons stay.** Regular icons were tried and dropped, so banners keep
  matching status cards and toasts.

## Verify

- Every banner rendered from the real components in light and dark on a local
  page, then removed.
- Boxed banner: border, 6px radius and icon, text and button alignment measured.
