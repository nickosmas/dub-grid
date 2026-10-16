# Stacked logo animations

> **Status (2026-10-15):** shipped for the symmetric three-card stack. The
> owner first approved these for the two-card mark (2026-10-14, rejecting
> Trace and choosing Climb for sync and long waits), then moved to three
> cards and approved the same three animations, re-timed for it, from the
> prototype `logo-symmetric-motion.html`. Frames are pure functions in
> `packages/design-tokens/src/brand-motion.ts`.

## Rules

Unchanged from the 2026-10-11 decision:

- **Static wherever the logo identifies the product:** the navbar, sign-in,
  onboarding and goodbye screens, emails, and app icons.
- **Animated only on full-screen waits with nothing else on screen:** Breathe,
  Shuffle and Climb.
- **Everything else uses conventional progress patterns:** route changes use
  the top progress bar (except a navigation into the schedule, which Shuffles
  with the load it starts), buttons their spinner, pull-to-refresh the native
  control.
- **Reduced motion:** every animation falls back to the static mark.
- **Units:** distances are in the shipped mark's 100-unit box, scaled to this
  symbol's ink, so each move takes the same share of the symbol as before.

## The mark they move

Three cards slanted 32°, 0.95 of a card tall, every corner curving over the
same 14 units of a full card's edge. The center card is full size and the
strongest color (`#2563EB` on light, `#3B82F6` on dark, white on brand
blue); the back and front cards are 75% of its size in a receding color
(`#8FB0F8`, `#1E40AF`, `#9DBBF7`). Each card sits 36% along the slant and 42%
of a card's height up from the one behind it, measured at the pair's average
width, so the outline is symmetric under a half turn about the center card. A
surface-colored gap is cut around every card in front. A card's size and
color follow its place in the stack, so a moving card takes on the look of
where it lands.

| Animation | Where                                              | Motion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breathe   | Launch and full-screen auth waits (see below)      | 2.4 s sine loop: the center card grows 4.5% while the back and front cards ease 4 units away from it along the stack. Starts on the static frame so the native launch image hands off without a jump                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Shuffle   | Schedule loading, including the navigation into it | Per 1.8 s cycle: a 1.0 s move (quartic ease-in-out), then 0.8 s rest. The back and center cards step forward one place while the front card arcs over the top of the stack to the back, lifted 60 units across it at the middle of the move. Colors cross between 30% and 70% of the move (smoothstep), and the gaps close while the front card passes over: they narrow from 38%, are shut from 46% to 54%, and are back by 62%. When loading ends, the cards finish the current move and come to rest                                                                                                                                                                                                                           |
| Climb     | Long waits and organization or sandbox switches    | Per 1.6 s cycle: a 1.0 s step, then 0.6 s rest. The step ripples from the front card back: the front card steps forward 35% of a step and shrinks into its top-right corner (0% to 75%, smoothstep); the center card rises into the front place (8% to 83%) and the back card into the center (16% to 91%, both quartic ease-in-out), each taking on the look of its new place; a new back card grows out of its bottom-left corner from 35% of a step behind (25% to 100%, smoothstep). The leaving and arriving cards mirror each other under a half turn and time reversal. Each fades only below 30% of a side card's size, so no frame shows a speck or a see-through card. When syncing ends it finishes the step and rests |

## What changed from the outline-mark versions

- **No outline to solid switch.** Both cards are solid now, so Shuffle crosses
  their colors instead, and closes the gap mid-move so the swap of which card
  is cut never shows.
- **Moves follow the stack.** Breathe and Shuffle move along and across the
  diagonal between the cards, not horizontally.
- **Climb replaces Trace.** A band around the front card's edge was
  rejected. Climb uses the stack itself: the cards step up the slant, which
  reads as work moving forward and stays distinct from Shuffle and Breathe.

## Where each plays

Every place is a full-screen wait with nothing else to act on (2026-10-16):

- **Breathe (web):** the sign-in handoff, restoring a session behind the app's
  route guard, the landing page's sign-in redirect, the onboarding page's
  first check, and the loading states of the sign-in, recovery, verification
  and invitation routes.
- **Breathe (mobile):** the launch splash, which starts on the native launch
  image's frame, and the app lock's device check, which shows the splash.
- **Shuffle (web):** the schedule's data load and the route fallback for a
  navigation into the schedule, so the two read as one wait.
- **Climb (web):** the sign-in handoff once slow or retrying, and entering,
  resetting or leaving the Test Sandbox until the page reloads.
- **Climb (mobile):** the full-screen overlay while switching organizations.

Waits that show a reveal delay (web `BrandLoadingScreen`, 400 ms by default)
stay blank for a quick wait so the mark never flashes; waits the person
started on purpose show it at once.

## Implementation

The frame functions live in `packages/design-tokens/src/brand-motion.ts`
(pure functions of time, unit-tested). Web draws them in
`AnimatedDubGridLogo` with SVG masks. Mobile has no SVG, so its
`AnimatedDubGridLogo` places one white card image per card, tinted and
scaled, and paints each gap as a halo image (the card grown by the gap) in
the surface's color before every card that has cards behind it
(`apps/mobile/src/shared/lib/brand-frame-layout.ts`). The images come from
`npm run icons`; the halos are exact at rest, so the splash's first frame
equals the launch image.
