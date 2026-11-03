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

Owner decisions, 2026-11-03: one shared colour, no banner borders, and status
cards on the banners' stronger tints with their borders kept.

- **One colour.** A banner's icon and text share one colour, a step lighter
  than before in light mode and as light as text allows on the tint (amber
  800, red 700, blue 700, green 800, each at least 5.3:1). Dark mode keeps
  its colours. A full-width bar's icon takes the bar's text colour. The
  separate banner icon colours are removed.
- **No banner borders.** Banners, full-width bars, the Schedule's bars, the
  recurring schedule's editing notice and the landing page's draft banner
  lose their border.
- **Status cards match banners.** The status, First day, Planned and
  invitation cards take the tint, border and shared colour of a banner of
  their tone (`STATUS_CARD_COLORS`), keeping their borders (dashed for
  plans); the Active and invitation cards, white before, are tinted too.
  Change status options keep their outline and tone colours.

Toasts are unchanged. Web only; mobile keeps its own colours.

## Build steps

- [x] **1.** `Banner` and `StatusSymbol` take the text colour; the banner
      icon tokens go.
- [x] **2.** Lighter shared colours and no banner borders; status cards on
      banner tints with their borders.

## Verify

Theme architecture, UI, staff and staff page tests, web type-check and
lint; light and dark rendered with the real tokens.
