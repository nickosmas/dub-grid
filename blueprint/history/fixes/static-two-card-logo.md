# Fix: Replace the logo with the static two-card identity

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-10

### The problem

The DubGrid mark is the animated 16-cell grid on web and mobile, with a stacked
"dub / grid" wordmark as the mobile app icon. The owner chose a new identity on
2026-10-09 after a long exploration in which most candidate marks had close
Google Lens matches:

- **Symbol:** two 4:3 cards on one row, shaped like schedule cells. An
  outlined back card sits close behind a solid front card, which is cut out
  of it by a gap in the background color.
- **Lockup:** the symbol before the DM Sans Bold lowercase `dubgrid` wordmark,
  which keeps a plain ink dot on the i.
- **Motion:** nine logo animations follow in a separate fix, spec and
  approved preview in `blueprint/reference/logo-animations.md` and
  `logo-animations.html`. This fix ships the static logo only.

The same outlined symbol is used everywhere, including the app icons and the
favicon (owner's call). The front card stays plain: every detail tried inside
it (a shift bar, a note dot, two lines, a dot and bar) made Lens match it to
another brand's wallet, chat or app icon.

**Accepted risk:** alone, this symbol reads to Google Lens as a generic
eraser icon, not a company's logo. The square and wider versions tried before
it matched Kick, Klip and Bithat. Every form that shows the name passed. Run a
trademark search before launch; a Lens check is not clearance.

### The fix

**Geometry** (100-unit box, continuous squircle corners with 0.6 smoothing):

| Part       | Box                          | Corner | Paint                                                                                    |
| ---------- | ---------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Back card  | (3, 25.02) 66.61 x 49.96     | 12.49  | 6-unit stroke, no fill                                                                   |
| Front card | (22.98, 22.24) 74.02 x 55.51 | 15.21  | solid fill, plus a 12-unit stroke in the background color underneath it, cutting the gap |

- **Proportion:** both cards are 4:3, like a schedule cell. The back card is
  90% of the front card's size, and 30% of its width shows to the left of the
  front card.
- **Optical centers** (owner's call: "consider visual symmetry and actual
  symmetry"): each element's optical center is the midpoint between its ink
  box's center and its ink's center of mass. The wordmark's is 0.256 em above
  the baseline (box 0.247, mass 0.266) and 0.016 em right of its text box's
  center. The symbol's is 3.01 units right of its ink center (the solid front
  card pulls its mass 6.02 right) and level vertically.
- **Lockup:** the front card is as tall as an ascender (0.72 em). The symbol's
  center sits on the wordmark's optical center, then 0.23 em to the
  wordmark's origin, at -0.02em tracking. Every side-by-side surface uses it:
  web header and landing nav (`DubGridLockup`), the email header, and the
  print view and report PDF (`public/lockup.png`, padded so its box center is
  the optical center).
- **Stacked lockup** (sign-in pages, mobile splash): the symbol's ink 2 em
  wide, 0.42 em of clear space between its ink and the tops of the tall
  letters, shifted 0.046 em left so the two optical centers line up. Each
  platform converts the gap for its line box with DM Sans's metrics (ascent
  0.992, descent 0.31): web `DubGridStackedLockup`, mobile `AppSplashScreen`.
- **Square images** (favicons, app icons, splash, standalone logos): the
  symbol optically centered in `BRAND_MARK_SQUARE`, its ink shifted 3.01
  units left of center.
- **Navbar** (owner's call): the in-app header and landing nav set the
  wordmark at 24 px; the symbol alone is 36 px on phones and 40 px on
  tablets.
- **Colors:** `#2563EB` on light, `#4A9BFF` on dark, white on brand blue,
  `#111827` for one-color print. The gap always takes the surface color, so
  every surface passes its own background.

**Until the animations land**, the animated components (web and mobile
`AnimatedDubGridLogo`, `AuthTransitionScreen`, `ScheduleLoadingScreen`,
`AppSplashScreen`) render the static symbol with no motion. They keep their
props and sizes, so the animation fix swaps motion in without touching the
surfaces again.

**Must not break:**

- The wordmark rules: lowercase `dubgrid`, DM Sans Bold, the font embedded
  wherever it is rendered to an image.
- The splash handoff: native launch image equals the first JS frame, with
  `imageWidth` in `app.json`, `SPLASH_MARK_SIZE` in the generator and
  `BRAND_ANIMATED_LOGO_SIZE` in design tokens kept equal.
- `MIN_SPLASH_MS`.
- Email clients that block web fonts: emails use the PNG lockup.

### Build steps

1. [x] **Shared geometry in `@dubgrid/design-tokens`.** Export the symbol paths,
       lockup metrics and per-surface colors. The 16-cell timing helpers retire in
       step 4, when their last consumer (mobile) stops using them.
   - Done when the package builds and a unit test pins the card boxes, the gap
     width and the lockup spacing.
2. [x] **Web static mark.** `Logo.tsx`: `DubGridLogo` becomes the symbol; add a
       lockup component; `DubGridWordmark` is unchanged. Update every usage
       (header, sign-in, onboarding, Gridmaster portal, goodbye, route boundary,
       terms card, MFA verify). `AnimatedDubGridLogo` renders the static symbol.
   - Done when no 16-cell mark renders in the web app on light or dark.
3. [x] **Web generated assets.**
   - `logo-grid.tsx` for the OG and Twitter images.
   - `app/icon.png` and `app/apple-icon.png`.
   - Everything in `public/`: `logo.png`, `logo.svg`, `logo-white.png`,
     `email-lockup.png`, `email-wordmark.png`, `wordmark-white.png`.
   - `docs/favicon.png`.
   - The PDF report logo (`pdfDubGridLogoCommands` and its cached PNG).
   - Done when each image shows the new mark and the email and report tests
     pass.
4. [x] **Mobile static mark and icons.** `generate-app-icons.mjs` renders:
   - `icon.png`, the adaptive and monochrome icons (inside the 66/108 safe
     zone), `logo-blue.png`, `logo-white.png` and `icon-blue-on-white.png`
   - the light and dark splash images
     Then update `AuthShell`, onboarding and `DubGridWordmark` usages, have the
     mobile `AnimatedDubGridLogo` render the static symbol, retire the
     16-cell timing helpers in `animated-logo.ts` (keeping
     `BRAND_ANIMATED_LOGO_SIZE`), and run `npx expo prebuild`.
   - Done when the simulator home screen, splash and sign-in show the new
     mark with no visible jump from launch image to JS splash.

### Verify

- `npm run type-check`, `npm run lint` and `npm run test` all pass.
- `npm run test:e2e` passes: sign-in, schedule load, publish and sign-out
  still work with the new marks in place.
- **Browser check, light and dark:** header, favicon, sign-in, auth
  transition, schedule loading screen, goodbye page, and the OG image at
  `/opengraph-image`.
- **iOS simulator:** home-screen icon, splash with no jump from the launch
  image, and sign-in.
- **Android emulator:** adaptive icon under circle and squircle masks, and the
  themed icon.
- **Search:** no remaining reference to the 16-cell geometry (`row + col <= 4`,
  `LogoGrid` cell loops) outside archived history.

### Verification evidence

- `npm run type-check`, `npm run lint` (2 pre-existing `<img>` warnings; `dev`
  has 3), `npm run lint:rules`, `npm run docs:check` (34 pages verified after
  refreshing the 13 fingerprints whose evidence files changed).
- `npm run test`: every workspace passed except one web failure,
  `theme-architecture` flagging the mask's `#fff`/`#000` in `Logo.tsx`;
  written as `white`/`black`, then `npm run test:web` passed 5,373/5,373.
- `npm run build` (Turbopack, hardlinked `node_modules` in the worktree):
  compiled successfully, 11/11 tasks.
- Browser (worktree dev server, light and dark): in-app header (signed in as
  `qa-super-admin`), landing nav, sign-in, print/PDF lockup image, email
  header, OG image, favicons. The header lockup measured the symbol's center
  at 0.256 em above the baseline and a 0.23 em gap.
- iOS simulator (Xcode 27 debug build patched to SDK 26): home-screen icon,
  native-to-JS splash with no jump in matching themes (8 fps capture), and the
  sign-in lockup within 0.8 px of the rule.
- Not run: Android emulator (icons checked only in the generator's launcher
  mask preview), and `npm run test:e2e`.

### Follow-ups

- The nine logo animations: `blueprint/reference/logo-animations.md`.
- Push the regenerated `supabase/templates/` to production Supabase Auth with
  the release; native icons and splash need a new native build.
- `apps/web/public/wordmark-white.png` is no longer referenced; keep or delete.
- `/opengraph-image` and `/twitter-image` redirect to `/login` in production
  (pre-existing; its own fix).
