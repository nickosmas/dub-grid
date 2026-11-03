# Fix: One colour for icon and text; banners lose their border

**Type:** Fix
**Status:** verified
**Branch:** `fix/icon-matches-text`

## The problem

Banners and status cards drew their icon in a brighter shade of the same hue
as their text: the Planned card's calendar in bright amber beside a darker
amber title, and every tinted banner the same way. Two near-matching shades
read as a mistake. Matching the icon to the old text colour then looked too
dark (owner, 2026-11-03).

## The fix

Owner decisions, 2026-11-03: one shared colour and no borders for banners;
status cards stay white with their borders.

- **One colour.** A banner's icon and text share one colour, a step lighter
  than before in light mode and as light as text allows on the tint (amber
  800, red 700, blue 700, green 800, each at least 5.3:1). Dark mode keeps
  its colours. A full-width bar's icon takes the bar's text colour. The
  separate banner icon colours are removed.
- **No banner borders.** Banners, full-width bars, the Schedule's bars, the
  recurring schedule's editing notice and the landing page's draft banner
  lose their border.
- **Status cards stay white**, as in production, with their borders. A
  status written in its tone's colour (Away, Suspended, Planned, First day)
  draws its icon in that same colour; amber is a step lighter than warning
  text (amber 700, 5:1 on white). A plan keeps its original dashed border,
  a tad darker: the pale amber border a quarter of the way to its icon's
  amber. Matching it to the icon, and drawn longer muted dashes, were tried
  and dropped. Beside a neutral title (Active, the
  invitation card, Change status options) the icon keeps the tone's bright
  colour, as toasts do. Banner tints for status cards and pale cards with an
  outlined icon in a circle were tried and dropped (owner, 2026-11-03).

Toasts are unchanged. Web only; mobile keeps its own colours.

## Build steps

- [x] **1.** `Banner` and `StatusSymbol` take the text colour; the banner
      icon tokens go.
- [x] **2.** Lighter shared colours and no banner borders.
- [x] **3.** White status cards; a tinted status shares its icon's colour.

## Verify

Theme architecture, UI, staff and staff page tests, web type-check and
lint; light and dark rendered with the real tokens.
