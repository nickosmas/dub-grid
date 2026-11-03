# Fix: An icon takes its text's colour

**Type:** Fix
**Status:** verified
**Branch:** `fix/icon-matches-text`

## The problem

Banners and status cards drew their icon in a brighter shade of the same hue
as their text: the Planned card's calendar in bright amber beside a darker
amber title, and every tinted banner the same way. Two near-matching shades
side by side read as a mistake (owner, 2026-11-03).

## The fix

The icon takes the colour of the text beside it:

- A tinted banner's icon uses its text colour, and a full-width bar's icon
  uses the bar's text colour in both themes.
- A status symbol (status card, First day and Planned cards, invitation card,
  Change status options) uses its tone's text colour, the colour the card
  writes the status in.
- The web's separate banner icon colours are removed.

Toasts are unchanged: their text is neutral, so the icon keeps its bright
tone fill. Web only; mobile banners keep their own colours.

## Build steps

- [x] **1.** `Banner` and `StatusSymbol` take the text colour; the unused
      `--dg-color-banner-*-icon` tokens go.

## Verify

Theme architecture, UI and staff page tests; before and after rendered with
the real light and dark tokens.
