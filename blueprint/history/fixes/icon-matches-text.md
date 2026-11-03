# Fix: One colour for icon and text, on a tint with no border

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

Owner decisions, 2026-11-03: one shared colour, no borders at all, so every
card carries a tint.

- **One colour.** A banner's icon and text share one colour, a step lighter
  than before in light mode and as light as text allows on the tint (amber
  800, red 700, blue 700, green 800, each at least 5.3:1). A status card's
  icon and status share one too; its amber is amber 700 (4.8:1 on its tint),
  through `--dg-color-status-warning-text`. Dark mode keeps its colours. A
  full-width bar's icon takes the bar's text colour. The separate banner icon
  colours are removed.
- **No borders.** Banners, full-width bars, the Schedule's bars, the
  recurring schedule's editing notice and the landing page's draft banner
  lose their border.
- **A tint on every card.** The Active, First day, Planned and invitation
  cards were white with a border (dashed for plans); each now takes its
  tone's tint, with its status in the tone's colour. Change status options
  keep their outline, which marks the selected one.

Toasts are unchanged. Web only; mobile keeps its own colours.

## Build steps

- [x] **1.** `Banner` and `StatusSymbol` take the text colour; the banner
      icon tokens go.
- [x] **2.** Lighter shared colours, no borders, a tint on every status card.

## Verify

Theme architecture, UI, staff and staff page tests (184), web type-check and
lint; light and dark rendered with the real tokens.
