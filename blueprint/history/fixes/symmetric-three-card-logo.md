# Fix: Replace the logo with the symmetric three-card stack and its motion

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-15 (archived 2026-10-17)

### The problem

The shipped symbol (an outlined 4:3 back card behind a solid front card,
`blueprint/history/fixes/static-two-card-logo.md`) reads long beside the
wordmark, and the owner wanted the back card to show more. On 2026-10-14 the
owner explored and approved a new direction, all prototyped under
`blueprint/reference/`:

- **Symbol** (`logo-stack.html`, candidate B; `logo-lockup.html`): two equal,
  solid, slanted cards that step up and to the right, with a surface-colored
  gap cut around the front card.
- **Lockup** (`logo-lockup.html`): refined to the wordmark's measured DM Sans
  Bold metrics.
- **Surfaces** (`logo-surfaces.html`): how it reads on every surface that shows
  the logo.
- **Motion** (`stack-logo-animations.html` and `.md`): Breathe, Shuffle and
  Climb. Climb replaces Trace, which the owner rejected.
- **Refinement** (`logo-spec-refine.html`, 2026-10-15): the owner saved the
  mark with the front card 36% along the slant ("Spec Design" in the studio)
  and kept three optical refinements: even corners, a wider gap at small
  sizes and a deeper light-mode light card. Balancing the back card's arms
  was left off, to keep the footprint. After comparing both card orders in
  `logo-lockup.html` and `stack-logo-animations.html`, the owner put the
  darker card in front, keeping the gap, with a toned-down dark-mode back
  card ("Mirror") and the lockup refinements measured from DM Sans Bold.
- **Symmetric stack** (`logo-symmetric-stack.html`,
  `logo-symmetric-surfaces.html`, `logo-symmetric-motion.html`, 2026-10-15):
  in production the two-card mark looked off for lack of symmetry, so the
  owner chose three cards: a full-size center card in the strongest color,
  with back and front cards 25% smaller in a receding color, at the shipped
  step spacing and gap. The owner asked to keep the cards exactly as
  configured and move only the wordmark: it sits level with the visible part
  of the center card, with no further nudge. The three animations were
  re-timed for three cards and approved.

### The fix

**Geometry** (center card 100 units wide, in one shared module):

| Part     | Value                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card     | Parallelogram 100 wide, vertical sides 95 tall, top and bottom edges slanted 32°                                                                                             |
| Corners  | Exact circular arcs that each curve over 14 units of a full card's edge: radius 7.76 on the two acute (58°) corners, 25.26 on the two obtuse (122°) ones, scaled with a card |
| Cards    | Back, center and front. The back and front cards are 0.75 of the center card's size                                                                                          |
| Step     | Each card sits 36% along the slant and 42% of a card's height up from the one behind it, measured at the pair's average width (87.5)                                         |
| Gap      | 3.5 units, cut out of each card around every card in front of it, so it takes the surface's color. 7 units at 32 px and below (favicons and small icons)                     |
| Symmetry | The outline is symmetric under a half turn about the center card's center, which is the ink box center                                                                       |

**Colors:**

| Use      | Back and front cards | Center card |
| -------- | -------------------- | ----------- |
| Light    | `#8FB0F8`            | `#2563EB`   |
| Dark     | `#1E40AF`            | `#3B82F6`   |
| On brand | `#9DBBF7`            | `#FFFFFF`   |

The center card is the strongest: brand blue on light and dark surfaces, and
white on a brand-blue surface (app icons). One-color use draws every card in
the given color, with the gap widened to 5 units (7 at the small size).

**Lockup:**

- **Horizontal:** the symbol's ink is 0.981 em tall: the word's full height
  (the 0.725 em ascenders of "d" and "b" to the -0.232 em descender of "g")
  plus 0.012 em at each end, the overshoot DM Sans gives its round letters.
  The word's optical center, 0.256 em above the baseline, meets the visible
  middle of the center card (the part the front card leaves showing), which
  sits 2.5% of the ink height below the ink's center. The symbol sits 0.20 em
  from the word ink to ink (two of the word's straight-to-round
  gaps; the "d" starts 0.051 em right of the word's origin).
- **Stacked:** the symbol's ink is twice as tall (1.962 em), with 0.42 em of
  clear space above the ascenders measured from its bottom edge on average,
  so its lowest corner sits about 0.115 em above them. It centers
  horizontally on the word's optical center.

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

1. [x] **Shared geometry in `@dubgrid/design-tokens`.** Rewrite
       `brand-mark.ts` for the stacked mark: card paths with per-corner radii,
       colors per use, the gap and its small-size value (with the 32 px
       threshold), ink box, optical center, square box, and the horizontal and
       stacked lockup layouts.
   - Done when the package builds and `brand-mark.test.ts` pins the card
     boxes, the equal 14-unit curve length at every corner, both gaps, the
     half-turn symmetry, and the lockup and stacked spacing.
2. [x] **Shared motion.** Rewrite `brand-motion.ts` as pure frame functions
       for Breathe, Shuffle and Climb, plus the finish-the-move helper, and
       retire Trace.
   - Done when `brand-motion.test.ts` pins that:
     - every animation starts on the rest frame;
     - Shuffle and Climb end each cycle on it;
     - Shuffle crosses colors between 30% and 70% of the move;
     - Climb's arriving card mirrors its leaving card;
     - no frame shows a card below the fade threshold at full opacity.
3. [x] **Web marks.** Make these changes:
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
4. [x] **Web generated images.**
   - Re-render everything `scripts/generate-wordmark-lockup.mts` produces:
     the email lockup and wordmark, `lockup.png`, `logo.png`,
     `logo-white.png`, `logo.svg`, `app/icon.png`, `app/apple-icon.png` and
     `docs/favicon.png`. Favicons at 32 px and below use the small-size gap.
   - Update `logo-grid.tsx` (social images) and the report PDF mark
     (`pdf-brand-mark.ts`).
   - Regenerate the auth email templates.
   - Done when each image shows the new mark, and the email, report and PDF
     tests pass.
5. [x] **Mobile static mark and icons.**
   - Have `generate-app-icons.mjs` render the two card layers (white, gap cut
     into the back card), the app, adaptive and monochrome icons, and the
     light and dark splash images.
   - Have `BrandSymbol` tint the two layers separately, and keep
     `AnimatedDubGridLogo` static at the same size.
   - Done when the mobile type-check and tests pass and the generator's
     launcher preview shows the new icon under circle and squircle masks.
6. [x] **Reference and docs.**
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

### Verification evidence

Recorded on #137 (the fix, `ca77003e`) and #138 (its release to `main`):

- `npm run type-check`, `npm run lint`, `npm run docs:check`, `npm run test`
  (all workspaces) and `npm run test:mobile` passed.
- `npm run build`: the local `next build` compiled, but prerendering needed
  network access that session lacked, so the Build check was left to CI.
- CI on #138: Build, Type Check, Lint, Unit Tests, Integration Tests (live
  DB), Mobile Verify, Documentation and all 12 Playwright shards (Chromium,
  Firefox and WebKit) passed.
- Generated images and a motion contact sheet were inspected. A Vercel
  preview of #137 was built.
- Not recorded: the screenshot-by-screenshot browser check this spec lists
  (in-app header, landing, sign-in, auth handoff, schedule loading, goodbye
  page, favicons, `/opengraph-image`, reduced motion), and iOS and Android
  checks of the home-screen icons and the splash handoff.

### Follow-ups

- Run `npm run auth:templates:push` with the release so production Auth sends
  the new email lockup, and build new native apps for the icons and splash.
- Check the home-screen icons and the splash handoff on an iOS simulator and
  an Android emulator in a local session before release.
- Mobile motion, out of scope here, shipped afterwards in `04b09854`
  (`feat: play the logo animations on every full-screen wait`).
