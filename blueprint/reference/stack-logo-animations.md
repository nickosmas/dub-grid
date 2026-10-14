# Stacked logo animations

> **Status (2026-10-14):** proposed for the refined two-card stacked mark
> (`logo-lockup.html`). `stack-logo-animations.html` beside this file plays
> all three. They replace the outline-mark animations in
> `logo-animations.md` once the new mark ships.

## Rules

Unchanged from the 2026-10-11 decision:

- **Static wherever the logo identifies the product:** the navbar, sign-in,
  onboarding and goodbye screens, emails, and app icons.
- **Animated only on full-screen waits with nothing else on screen:** Breathe,
  Shuffle and Trace.
- **Everything else uses conventional progress patterns:** route changes use
  the top progress bar, buttons their spinner, pull-to-refresh the native
  control.
- **Reduced motion:** every animation falls back to the static mark.
- **Units:** distances are in the shipped mark's 100-unit box, scaled to this
  symbol's ink, so each move takes the same share of the symbol as before.

## The mark they move

Two equal cards, slanted 32°, 0.95 of a card tall. The front card sits 40% of
a card along the slant and 42% of its height up from the back card. Back
`#2563EB` and front `#A8C4FC` on light, `#3B82F6` and `#BCD2FF` on dark. A
surface-colored gap is cut around the front card.

| Animation | Where                                                            | Motion                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Breathe   | Mobile splash and web auth transition while the session restores | 2.4 s sine loop: the front card grows 4.5% while the back card eases 4 units away from it along the stack. Starts on the static frame so the native launch image hands off without a jump                                                                                                                                                                                                             |
| Shuffle   | Schedule loading and route-level loading                         | Per 1.8 s cycle: the cards trade places along one arc over 1.0 s (front card over the top to the back, back card underneath to the front, 8 units of lift perpendicular to the stack, quartic ease-in-out), then rest 0.8 s. Their colors cross between 30% and 70% of the move (smoothstep), and the gap closes while they pass: it narrows from 30%, is shut from 42% to 58%, and is back by 70%. When loading ends, the cards finish the current swap and come to rest |
| Trace     | Sync or in-progress states                                       | A band in the back card's blue, half the wordmark's stem thick, runs around the inside edge of the front card at a constant speed, a third of the edge long, 1.4 s per lap. The front card carries it because the back card's edge is mostly hidden                                                                                                                                                     |

## What changed from the outline-mark versions

- **No outline to solid switch.** Both cards are solid now, so Shuffle crosses
  their colors instead, and closes the gap mid-move so the swap of which card
  is cut never shows.
- **Moves follow the stack.** Breathe and Shuffle move along and across the
  diagonal between the cards, not horizontally.
- **Trace moved to the front card.** The back card's edge is mostly behind
  the front card, so a band on it would vanish for half of each lap.

## Implementation

Port the frame functions into `packages/design-tokens/src/brand-motion.ts`
(pure functions of time, unit-tested), replacing the outline-mark frames.
Web draws them in `AnimatedDubGridLogo`; mobile still needs its Reanimated
renderer, per `logo-animations.md`.
