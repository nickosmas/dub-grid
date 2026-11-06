# Fix: Lighter banners with neutral text, icon on the first line

**Type:** Fix
**Status:** verified
**Branch:** `fix/banner-lighter-first-line`

## The problem

Banner fills read too dark, and an icon centered on every line drifted away
from the start of the text in a long banner. Banner text was also medium or
semibold throughout, so nothing in it stood out (owner, 2026-11-04).

## The fix

Owner decisions, 2026-11-04: option A of the "Banner refinements" canvas, then
pattern 1 of its "In-app banner patterns" board, and bold only for what should
stand out. The real banners of Atlassian, Polaris, Carbon, Primer and Material
were compared first.

- **Lighter fills.** Every banner fill is lighter in light mode and softer in
  dark mode.
- **Neutral text, tone icon.** Banner and Schedule bar text is neutral and only
  the icon carries the tone, replacing the one shared colour of
  `icon-matches-text`. Text clears 12:1 and icons 4:1 on every fill.
- **Icon on the first line.** A boxed banner's icon is 20px and sits on the
  first line or the title. Full-width bars keep 25px and stay centered, with
  their text and icon in one colour.
- **Buttons.** A button no longer makes a one-line box taller than its icon,
  so the icon, text and button share a centerline.
- **Regular text.** Banner and Schedule bar text is regular weight. Titles and
  `strong` text stay bold, and so do the Schedule bars' own titles.
- **Legal callouts.** The privacy policy's health information notice is no
  longer an app banner. Its icon and title stay amber on a faint tint with a
  side rule, and its body is document text at full size (owner, 2026-11-04,
  option B of the canvas's Legal board).

Mobile keeps its own banners. Solid bars keep their fills.

## Verify

- Boxed banner on `/privacy`: icon center 174.5, title center 174.75.
- Schedule bars in light and dark at the new fills, with regular body text.
- Privacy policy notice in light and dark, and at phone width.
