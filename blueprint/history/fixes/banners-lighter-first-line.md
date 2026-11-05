# Fix: Lighter banners, icon on the first line, regular text

**Type:** Fix
**Status:** verified
**Branch:** `fix/banner-lighter-first-line`

## The problem

Banner fills read too dark, and an icon centered on every line drifted away
from the start of the text in a long banner. Banner text was also medium or
semibold throughout, so nothing in it stood out (owner, 2026-11-04).

## The fix

Owner decisions, 2026-11-04: option A of the "Banner refinements" canvas, and
bold only for what should stand out.

- **Lighter fills.** Every banner fill is lighter in light mode and softer in
  dark mode. Text stays at least 5.3:1 in light mode and 10:1 in dark.
- **Icon on the first line.** A boxed banner keeps its 25px icon and centers
  it on the first line or the title. Full-width bars stay centered.
- **Buttons.** A button no longer makes a one-line box taller than its icon,
  so the icon, text and button share a centerline.
- **Regular text.** Banner and Schedule bar text is regular weight. Titles and
  `strong` text stay bold, and so do the Schedule bars' own titles.

Mobile keeps its own banners. Solid bars keep their fills.

## Verify

- Boxed banner on `/privacy`: icon center 174.5, title center 174.75.
- Schedule bars in light and dark at the new fills, with regular body text.
