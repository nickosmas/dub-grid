# Current Feature

## The landing page shows outcomes, not screenshots

**Type:** Fix
**Status:** verified
**Branch:** `fix/landing-illustrations`

## The problem

The landing page (`apps/web/src/app/page.tsx`) shows full screenshots of the
real Schedule grid, dashboard, People directory and three mobile screens. They
reveal the product's layout and design, and the seeded organization's name.
The feature grids describe screens rather than the problems DubGrid solves.

## The fix

Owner decisions (2026-10-31, approved inline prototype v20):

- No product screenshots anywhere. The hero's old schedule capture was out
  of date, so it becomes a coded simulation of the Schedule (9/20 - 10/3),
  drawn at screenshot size and scaled as one piece (owner, same day). Each
  other section shows one small animated illustration
  built from believable UI (an app window with a cursor, phones, a table), not
  a capture. Phones mirror the app's real Requests screen and use iPhone 18 Pro
  Max proportions (78 x 163.4 mm body, 440 x 956 pt screen), with iOS status
  bar icons and no camera island.
- Copy describes the problem solved, never the UI, says "shifts" rather than
  "the week", and never reveals how Auto-build or suggestions decide.
- One column: heading, one line, then the illustration. No alternating rows,
  no bento grids, no step captions, no icons in buttons. The hero gradient stays.

Sections, in order:

| Section                                                | Illustration                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero: "Scheduling, done right. Ditch the spreadsheet." | A simulated two-week Schedule, without the two phone screenshots that sat beside it                                                                        |
| Stop building schedules by hand                        | Auto-build: Generate schedule fills next week, Discard or Apply                                                                                            |
| Never get caught short-staffed                         | Tuesday's open Evening shift, pick Jordan from Available, the Draft changes banner (1 new), Publish, "Schedule published" toast                            |
| No more swap texts and sticky notes                    | Jordan's phone (Requests, Mine) accepts Sam's swap; the manager's phone (Approval) approves; Jordan gets "Swap approved"                                   |
| No more "nobody told me"                               | One lock screen: "Your schedule for Tue, Nov 4 changed" / "New: Evening 3:00 PM - 11:00 PM"                                                                |
| Catch overtime before it happens                       | Hours this week against 40h; Morgan at +4h OT, a Friday shift moves to Sam, nobody over 40                                                                 |
| The right people make the right changes                | User / Admin (you choose) / Super Admin table; the cursor turns on Admin's Edit shifts, Publish the schedule, Approve shift requests; Billing stays locked |
| Your team's information stays protected                | Carousel of icon cards: Invite only (72 hours), Two-factor sign-in, Account alerts, Signed-in devices, Activity log                                        |
| Done with the spreadsheet?                             | CTA on a brand-gradient panel with a faint grid                                                                                                            |

Must hold:

- Every illustration has an accessible name and hides its inner mock UI from
  assistive tech; animations pause off screen and rest on their final state
  under reduced motion.
- No horizontal page scroll at 390px; light and dark themes both read.
- The signed-in redirect, theme toggle, mobile menu and footer keep working.
- Typography contract: brand headings on every `h1`-`h3`, no 8 to 11px text.

## Build steps

- [x] **1. Illustration kit.** `components/landing/`: a sequence hook that
      loops steps, pauses off screen and honors reduced motion; the app window,
      cursor and phone frame (`LandingPhone.tsx`, status bar SVG); pure helpers
      for the loop and the overtime bar, with tests. Styles in
      `app/landing-demos.css`.
      **Done when:** the helper tests pass and type-check is clean.
- [x] **2. The illustrations.** One component per section from the table.
      **Done when:** each renders and loops in the browser in light and dark.
- [x] **3. The page.** Rewrite `app/page.tsx` to the new sections and copy;
      delete `LandingScreenshot.tsx`, `LandingPhoneCarousel.tsx`, every
      `public/landing/screenshots/` PNG, their CSS and the image config; update
      the typography contract count, `e2e/landing.spec.ts`,
      `e2e/theme-cookie.spec.ts` and `internal/architecture/folder-structure.md`.
      **Done when:** type-check, lint, `test:web` and the landing e2e pass.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npx playwright test e2e/landing.spec.ts e2e/theme-cookie.spec.ts`.
- In the browser at `/`: desktop and 390px, light and dark. Each illustration
  loops as in the prototype, nothing overflows, the menu opens.

## Outcome

- Checks run 2026-10-31 in the worktree: `npm run type-check` (web), ESLint
  and Prettier on the changed files, the web unit suite (742 files; the two
  landing-related failures it found were fixed and re-run), `npm run
docs:check`, and `PORT=3007 npx playwright test e2e/landing.spec.ts
e2e/theme-cookie.spec.ts --project=chromium` (5 passed).
- Browser: `/` at 1440px and 375px, light and dark. Every illustration and
  its section keep a constant height through a full loop (measured), and
  nothing scrolls sideways at 375px.
- Not run locally: Firefox and WebKit, and a production build (a worktree
  build trips on its symlinked `node_modules`); CI covers both.

## Out of scope

- The request-demo, legal and sign-in pages.
- Open Graph images.
