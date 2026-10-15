# Logo animations

> **Superseded (2026-10-15)** by `stack-logo-animations.md`, which moves the
> stacked two-card mark: Breathe, Shuffle and Climb, Climb replacing Trace.
> Kept as the record of the outline mark's animations, which shipped in
> `blueprint/history/fixes/web-logo-animations.md`. `logo-animations.html`
> beside this file plays the full set the owner reviewed on 2026-10-09.

## Rules

The owner chose the industry-standard approach on 2026-10-11:

- **Static wherever the logo identifies the product:** the navbar, sign-in,
  onboarding and goodbye screens, emails, and app icons.
- **Animated only on full-screen waits with nothing else on screen:** Breathe,
  Shuffle and Trace.
- **Everything else uses conventional progress patterns:** route changes use
  the top progress bar, buttons their spinner, pull-to-refresh the native
  control.
- **Dropped:** Reveal, Deal, Press, Exit, Conveyor and Pull.
- **Reduced motion:** every animation falls back to the static mark.
- **The front card stays plain in every frame:** no shift bar or other detail
  inside it.
- **Units:** distances are in the symbol's 100-unit box.

| Animation | Where                                                            | Motion                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breathe   | Mobile splash and web auth transition while the session restores | 2.4 s sine loop: the front card grows 4.5% while the back card eases 4 units left. Starts on the static frame so the native launch image hands off without a jump                                                                                                                                                                                                                                                                   |
| Shuffle   | Schedule loading and route-level loading                         | Per 1.8 s cycle: the cards trade places along one arc over 1.0 s (front card over the top to the back, back card underneath to the front, 8 units of lift, quartic ease-in-out), then rest 0.8 s. Each card switches between outline and solid only between 30% and 70% of the move's time (smoothstep), so neither reads as see-through. When loading ends, the cards finish the current swap and come to rest instead of snapping |
| Trace     | Sync or in-progress states                                       | The back outline shows as a 28% track while a segment a third of its length runs around it at a constant speed, 1.4 s per lap                                                                                                                                                                                                                                                                                                       |

The motion model is `packages/design-tokens/src/brand-motion.ts` (pure frame
functions, unit-tested); web draws it in `AnimatedDubGridLogo`.

## Mobile (to do)

The mobile mark is a tinted image today, so it needs a renderer that draws
the two cards as views. Use Reanimated for the motion, reuse the shared frame
functions, and keep the gap transparent.

- **Breathe in `AppSplashScreen`:** must start on the static frame so the
  native launch image hands off without a jump.
- **Shuffle and Trace:** wherever the app shows a full-screen wait; Trace
  once a wait runs long.
- **Done when:** each plays on the iOS simulator and falls back to static
  under Reduce Motion.
