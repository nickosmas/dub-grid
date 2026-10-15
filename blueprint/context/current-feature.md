# Current Feature

## Fix: Replace the logo with the stacked two-card identity and its motion

**Type:** Fix
**Status:** not started

### The problem

The shipped symbol (an outlined 4:3 back card behind a solid front card,
`blueprint/history/fixes/static-two-card-logo.md`) reads long beside the
wordmark, and the owner wanted the back card to show more. On 2026-10-14 the
owner explored and approved a new direction, all prototyped under
`blueprint/reference/`:

- **Symbol** (`logo-stack.html`, candidate B; `logo-lockup.html`): two equal,
  solid, slanted cards that step up and to the right. Brand blue behind,
  light blue in front, with a surface-colored gap cut around the front card.
- **Lockup** (`logo-lockup.html`): refined to the wordmark's measured DM Sans
  Bold metrics.
- **Surfaces** (`logo-surfaces.html`): how it reads on every surface that shows
  the logo.
- **Motion** (`stack-logo-animations.html` and `.md`): Breathe, Shuffle and
  Climb. Climb replaces Trace, which the owner rejected.
- **Refinement** (`logo-spec-refine.html`, 2026-10-15): the owner saved the
  mark with the front card 36% along the slant ("Spec Design" in the studio)
  and kept three optical refinements: even corners, a wider gap at small
  sizes and a deeper light-mode front card. Balancing the back card's arms
  was left off, to keep the footprint.

### The fix

**Geometry** (cards 100 units wide, in one shared module):

| Part         | Value                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Card         | Parallelogram 100 wide, vertical sides 95 tall, top and bottom edges slanted 32° |
| Corners      | Exact circular arcs that each curve over 14 units of edge: radius 7.76 on the two acute (58°) corners, 25.26 on the two obtuse (122°) ones, so all four look equally soft |
| Front card   | The same size as the back card, offset 36 units along the slant and 42% of its height up |
| Gap          | 3.5 units, cut out of the back card around the front card, so it takes the surface's color. A small-size version draws it at 7 units at 32 px and below (favicons and small icons), so the cards stay apart |
| Symmetry     | The outline is symmetric under a half turn, so the ink box center is the optical center             |

**Colors:**

| Use        | Back card | Front card |
| ---------- | --------- | ---------- |
| Light      | `#2563EB` | `#8FB0F8`  |
| Dark       | `#3B82F6` | `#BCD2FF`  |
| On brand   | `#7199F2` | `#FFFFFF`  |
| One color  | the given color for both, with the gap widened to 5 units (7 at the small size) |

**Lockup:**

- **Horizontal:** the symbol's ink is the word's full height, 0.957 em (the
  ascenders of "d" and "b" to the descender of "g"). It centers on the word's
  optical center, 0.256 em above the baseline, and sits 0.22 em from the word
  ink to ink (two of the word's letter gaps).
- **Stacked:** the symbol's ink is twice the word's height (1.914 em), 0.42 em
  of clear space above the ascenders, centered horizontally on the word's
  optical center.

**Motion** (spec in `blueprint/reference/stack-logo-animations.md`):

- **Breathe:** mobile splash and the web sign-in handoff.
- **Shuffle:** schedule and route-level loading.
- **Climb:** sync and long waits; replaces Trace, including the web sign-in
  handoff's slow and retry state.

The rules carry over: static wherever the logo identifies the product,
animated only on full-screen waits, and the static mark under reduced motion.
Shuffle and Climb finish the current move when the wait ends.

**Must not break:**

- **The wordmark:** lowercase `dubgrid` in DM Sans Bold, with the font
  embedded wherever it is rendered to an image.
- **The splash handoff:** the native launch image equals the first JS frame.
  `imageWidth` in `app.json`, `SPLASH_MARK_SIZE` in the generator and
  `BRAND_ANIMATED_LOGO_SIZE` stay equal, and Breathe starts on the static
  frame.
- `MIN_SPLASH_MS`.
- **Emails:** they keep using the PNG lockup, since mail clients block web
  fonts.
- **No hard-coded colors:** the theme architecture test's ban on literal
  colors in components holds. Web colors come from CSS tokens.

**Out of scope:**

- **Mobile motion:** it needs a Reanimated renderer that draws each card as a
  view, plus simulator checks. Mobile keeps the static mark, as it does today.
- **Trademark and Google Lens clearance:** the owner runs these before launch.
- **Pushing regenerated templates and native builds:** the regenerated
  `supabase/templates/` go to production Auth, and the native icons and
  splash need a new build. Both happen at release.

### Build steps

1. [ ] **Shared geometry in `@dubgrid/design-tokens`.** Rewrite
       `brand-mark.ts` for the stacked mark: card paths with per-corner radii,
       colors per use, the gap and its small-size value (with the 32 px
       threshold), ink box, optical center, square box, and the horizontal and
       stacked lockup layouts.
   - Done when the package builds and `brand-mark.test.ts` pins the card
     boxes, the equal 14-unit curve length at every corner, both gaps, the
     half-turn symmetry, and the lockup and stacked spacing.
2. [ ] **Shared motion.** Rewrite `brand-motion.ts` as pure frame functions
       for Breathe, Shuffle and Climb, plus the finish-the-move helper, and
       retire Trace.
   - Done when `brand-motion.test.ts` pins that:
     - every animation starts on the rest frame;
     - Shuffle and Climb end each cycle on it;
     - Shuffle crosses colors between 30% and 70% of the move;
     - Climb's arriving card mirrors its leaving card;
     - no frame shows a card below the fade threshold at full opacity.
3. [ ] **Web marks.** Make these changes:
   - Add `--dg-color-brand-mark-back` and `--dg-color-brand-mark-front` to
     `globals.css`, light and dark.
   - In `Logo.tsx`, draw the two-tone symbol (with a one-color option, and
     the small-size gap at 32 px and below), `DubGridLockup` and
     `DubGridStackedLockup` from the new layouts.
   - In `AnimatedDubGridLogo`, draw the three animations.
   - In `AuthTransitionScreen`, change `trace` to `climb`.
   - Give the landing footer the one-color mark.
   - Done when no outline mark renders anywhere in the web app, in light or
     dark.
4. [ ] **Web generated images.**
   - Re-render everything `scripts/generate-wordmark-lockup.mts` produces:
     the email lockup and wordmark, `lockup.png`, `logo.png`,
     `logo-white.png`, `logo.svg`, `app/icon.png`, `app/apple-icon.png` and
     `docs/favicon.png`. Favicons at 32 px and below use the small-size gap.
   - Update `logo-grid.tsx` (social images) and the report PDF mark
     (`pdf-brand-mark.ts`).
   - Regenerate the auth email templates.
   - Done when each image shows the new mark, and the email, report and PDF
     tests pass.
5. [ ] **Mobile static mark and icons.**
   - Have `generate-app-icons.mjs` render the two card layers (white, gap cut
     into the back card), the app, adaptive and monochrome icons, and the
     light and dark splash images.
   - Have `BrandSymbol` tint the two layers separately, and keep
     `AnimatedDubGridLogo` static at the same size.
   - Done when the mobile type-check and tests pass and the generator's
     launcher preview shows the new icon under circle and squircle masks.
6. [ ] **Reference and docs.**
   - Mark `blueprint/reference/logo-animations.md` as superseded by
     `stack-logo-animations.md`.
   - Refresh the documentation fingerprints that the changed images affect.
   - Done when `npm run docs:check` passes.

### Verify

- `npm run type-check`, `npm run lint`, `npm run lint:rules` and
  `npm run test` pass.
- `npm run build` succeeds.
- **Browser check, light and dark, with screenshots:** in-app header, landing
  nav and footer, sign-in, auth handoff (Breathe, then Climb when slow),
  schedule loading (Shuffle), goodbye page, favicons, and `/opengraph-image`.
  Reduced motion shows the static mark.
- **Generated images:** inspect each one, including the print view and
  report PDF header.
- **Not possible in this cloud session:** iOS simulator and Android emulator
  checks of the home-screen icons and the splash handoff. They stay open for
  a local session before release.
