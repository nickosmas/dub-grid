# Logo animations (follow-up fix)

> Approved by the owner on 2026-10-09 and held back so the static two-card
> logo could ship first. Spec this with `/fix` once the static logo fix is
> complete; it builds on the shared geometry that fix adds to
> `@dubgrid/design-tokens`. `logo-animations.html` beside this file plays the
> approved set.

Nine animations of the two-card symbol replace the 16-cell pulse. Until they
land, the animated components show the static symbol.

## Rules

- Every animation respects reduced motion and falls back to the static mark.
- Confirm is deliberately left out.
- The front card stays plain in every frame: no shift bar or other detail
  inside it.
- Shuffle uses the refined motion; the owner kept the original motion for the
  other eight.
- Distances are in the symbol's 100-unit box.

| Animation | Where                                                            | Motion                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breathe   | Mobile splash and web auth transition while the session restores | 2.4 s sine loop: the front card grows 4.5% while the back card eases 4 units left. Starts on the static frame so the native launch image hands off without a jump                                                                                                                                                                                                                                                                   |
| Deal      | First launch only                                                | The back outline draws over 0.55 s (cubic out). From 0.35 s the front card is dealt from 28 units right over 0.55 s with a slight overshoot, fading in over its first third                                                                                                                                                                                                                                                         |
| Reveal    | Web sign-in and landing intro                                    | The back outline draws over 0.45 s. From 0.3 s the front card is dealt from 22 units right over 0.5 s with a slight overshoot. From 0.75 s the wordmark wipes in left to right over 0.9 s (cubic out)                                                                                                                                                                                                                               |
| Shuffle   | Schedule loading and route-level loading                         | Per 1.8 s cycle: the cards trade places along one arc over 1.0 s (front card over the top to the back, back card underneath to the front, 8 units of lift, quartic ease-in-out), then rest 0.8 s. Each card switches between outline and solid only between 30% and 70% of the move's time (smoothstep), so neither reads as see-through. When loading ends, the cards finish the current swap and come to rest instead of snapping |
| Trace     | Sync or in-progress states                                       | The back outline shows as a 28% track while a segment a third of its length runs around it at a constant speed, 1.4 s per lap                                                                                                                                                                                                                                                                                                       |
| Conveyor  | While a schedule publishes                                       | Per 1.8 s cycle (1.1 s move, cubic ease-in-out): a new card arrives from 40 units right and fades in, the front card becomes the back card, and the oldest slides 30 units left, shrinking to 90% and fading out                                                                                                                                                                                                                    |
| Pull      | Mobile pull-to-refresh (`Screen.tsx`)                            | Fans with pull distance: the back card up to 12 units left and -8 degrees, the front card 5 units right and +5 degrees. On release it snaps back over 0.6 s with a slight overshoot                                                                                                                                                                                                                                                 |
| Press     | Tapping the logo                                                 | Over 0.12 s the front card presses to 93% and nudges the back card 5 units, then springs back over 0.33 s with a slight overshoot                                                                                                                                                                                                                                                                                                   |
| Exit      | Goodbye page after sign-out                                      | The cards slide 24 units apart and fade out over 0.8 s (cubic ease-in-out)                                                                                                                                                                                                                                                                                                                                                          |

## Build steps

1. **Timings in `@dubgrid/design-tokens`.** Export each animation's timings
   and distances beside the symbol geometry.
2. **Web.** Replace `AnimatedDubGridLogo` with one animated-mark component
   that takes a variant: Breathe, Deal, Reveal, Shuffle, Trace, Conveyor,
   Press, Exit. Wire each to its surface from the table.
   - Done when each plays in the browser and shows the static mark under
     reduced motion.
3. **Mobile.** Reanimated equivalents:
   - Breathe in `AppSplashScreen`
   - Deal on first launch
   - Shuffle and Trace where the app shows loading or sync
   - Pull through `Screen.tsx` refresh
   - Press on the logo
   - Exit on sign-out
   - Done when each plays on the iOS simulator and falls back to static under
     Reduce Motion.

## Verify

- Browser, light and dark: sign-in Reveal, schedule Shuffle, publish
  Conveyor, goodbye Exit.
- iOS simulator: splash with Breathe (no jump from the launch image),
  pull-to-refresh, and sign-out.
- `npm run test:e2e`: sign-in, schedule load, publish and sign-out still work.
