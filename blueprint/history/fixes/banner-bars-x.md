# Fix: Leftover bars match the banners, and the X matches other buttons

**Type:** Fix
**Status:** verified
**Branch:** `fix/banner-bars-x`

## The problem

Hand-built bars and notes missed the banner redesign: the People selection and
reorder bars, the unsaved changes bar and five gray notes. The banner X also
highlighted smaller than the buttons beside it (owner, 2026-11-06).

## The fix

Owner decisions, 2026-11-06, from the "Bars the redesign missed" canvas board.

- **Bars.** The selection, reorder and unsaved changes bars take the toolbar's
  radius through `--dg-btn-radius`. They stay neutral, since they aren't statuses.
- **Clear selection.** It stays spelled out, as a secondary button of its own.
- **X.** `BannerDismissButton` is a small ghost icon button, the height and
  radius of the buttons beside it, with the standard ghost hover.
- **Gray notes.** Put on the schedule, Already working and Select at least one
  shift are info banners, and No schedule-eligible roles is a warning. The
  administrative team invite shows an info banner; inviting someone already on
  the schedule, or a teammate during onboarding, shows none (owner).
- **Wording.** Administrative teams can include view-only users, so the invite
  note and Put on the schedule no longer promise management access.

## Verify

- Selection bar and Schedule X in the running app in light and dark: X 34 by 34
  beside a 34px button, on the same centerline, both 6px radius.
