# Fix: Animate the two-card logo on web

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-12

### The problem

The two-card logo shipped static (`blueprint/history/fixes/static-two-card-logo.md`).
Its approved animations are held in `blueprint/reference/logo-animations.md`,
with a playable preview in `logo-animations.html`; until they land, the
loading screens draw the static mark.

Owner decisions:

- **2026-10-11, industry standard:**
  - The logo stays static wherever it identifies the product: the navbar,
    sign-in, onboarding and goodbye pages, and emails.
  - It animates only on full-screen waits with nothing else on screen.
  - Route changes keep the top progress bar, and publishing keeps the button
    spinner.
  - This replaces the 2026-10-10 plan for Reveal, Deal, Press, Exit, Conveyor
    and route-level Shuffle, so those are dropped.
- **2026-10-10:** the dark-mode logo uses the same vibrant blue as primary
  buttons (`#2075FF`), not the washed-out `#4A9BFF` it shipped with.
- **2026-10-10:** web now, mobile next.

### The fix

**Motion** is exactly the approved motion in `blueprint/reference/logo-animations.md`:
refined Shuffle, original Breathe and Trace.

**Model.** Each animation is a pure function of time that returns the cards to
draw (center, width, corner, scale, opacity, an outline-to-solid weight, an
optional traced segment). It lives in `@dubgrid/design-tokens`, so mobile can
reuse it and tests can pin key frames.

**Rendering.** `AnimatedDubGridLogo` draws the frames as SVG with the same mask
cut as the static mark, so the gap stays transparent on any surface. Under
`prefers-reduced-motion: reduce` it shows the static mark.

**Surfaces:**

| Animation | Where                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Breathe   | `AuthTransitionScreen` while the session restores                                                                      |
| Trace     | `AuthTransitionScreen` once its slow notice appears or a retry runs, taking over from Breathe                          |
| Shuffle   | `ScheduleLoadingScreen`, the full-screen state while the schedule loads (its `loading.tsx` keeps the top progress bar) |

**Must not break:**

- The static mark, its geometry, and every surface's spacing and optical
  centering rules.
- Route-level `loading.tsx` progress bars, inline progress bars and loading
  button spinners.

### Build steps

1. [x] **Motion model in `@dubgrid/design-tokens`** (`brand-motion.ts`):
       Breathe, Shuffle and Trace.
   - Done when the package builds and unit tests pin key frames:
     - Breathe starts and loops on the static mark
     - Shuffle rests on the static mark between swaps
     - Shuffle switches outline and solid only between 30% and 70% of its move,
       with 8 units of lift
     - Trace's segment is a third of the outline over a 28% track
2. [x] **Dark-mode logo color.** `BRAND_MARK_COLORS.dark` becomes `#2075FF`,
       and `--dg-color-brand-mark` follows `--dg-color-primary` in both themes, so
       the mark always matches the buttons. Regenerate `logo.svg` and the mobile
       dark splash image (`npm run icons`); the native splash needs a new build.
   - Done when the logo and a primary button share one blue in dark mode on
     web, and the dark splash image carries `#2075FF`.
3. [x] **Web animated mark.** `AnimatedDubGridLogo` takes an `animation` and
       loops it with `requestAnimationFrame`.
   - Done when each animation plays in the browser on light and dark and shows
     the static mark under reduced motion.
4. [x] **Wire the loading screens.** Breathe, then Trace, in
       `AuthTransitionScreen`; Shuffle in `ScheduleLoadingScreen`.
   - Done when both screens animate in the running app and existing tests
     pass.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test` and `npm run build`
  pass.
- **Browser, light and dark, at normal and reduced motion:** the sign-in
  handoff (Breathe, then Trace after the slow notice) and schedule loading
  (Shuffle).
- **Static everywhere else:** navbar, sign-in, onboarding and goodbye show the
  static mark.
- **Mobile follow-up:** update `blueprint/reference/logo-animations.md` to the
  standard mapping and list what mobile still needs (Breathe on the splash;
  Shuffle and Trace on full-screen waits).

### Verification evidence

- `npm run test` passes in every workspace (web 5,375, mobile 1,404,
  design-tokens 77 including 6 motion tests), after the date-dependent
  `ShiftEditPanel` failure was fixed on `dev` (42fc36a1).
- `npm run type-check`, `npm run lint` (2 pre-existing `<img>` warnings) and
  `npm run build` (Turbopack, hardlinked `node_modules`, 11/11 tasks) pass.
- **Browser, light and dark:**
  - Breathe, Shuffle and Trace play.
  - Reduced motion shows the static mark.
  - In dark mode the logo and the Continue button both compute to
    `rgb(32, 117, 255)`.
- **Running app,** signed in as `qa-super-admin`: the sign-in handoff screen
  animated (68 distinct frames sampled) and the schedule loading screen
  animated (31).
- **Parity:** the frame functions match the approved preview's code within
  0.0045 units.
- **Not run:** `npm run test:e2e`.

### Follow-ups

- **Mobile:** Breathe on `AppSplashScreen`; Shuffle and Trace on full-screen
  waits (see `blueprint/reference/logo-animations.md`).
- **Native splash:** the `#2075FF` dark splash needs a new native build.
