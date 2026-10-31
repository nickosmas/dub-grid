# Current Feature

## The landing page fills a desktop screen with the product

**Type:** Fix
**Status:** verified
**Branch:** `fix/landing-desktop-fullness`

## The problem

On a desktop the landing page feels empty: the hero is a headline, one button
and a schedule picture, and each section below is a small window in a lot of
plain background (content tops out near 1,000px, illustrations near 880px).

## The fix

Owner decisions (2026-10-31, approved full-page prototype v3):

- Fill the space with the product itself, never with template filler: no
  eyebrow pill, checkmark rows, grid or glow panels, floating-card stacks or
  three-column outcome points.
- Hero: the simulated schedule widens to about 1,200px, and a real-proportion
  iPhone overlaps its bottom-right corner (desktop only). The owner later asked
  for it to show the app's Home in its Team view: the week header, My schedule
  | Team, Coverage by focus area with open gaps, Pending approvals and Overtime
  watch, with fictional numbers.
- Sections: centered headings, illustrations at the full content width
  (about 1,100px) with larger type, plain backgrounds separated by hairlines,
  and short, tight shadows.
- The swap and the schedule alert become one section with three phones in a
  row that tell the story in order, with consistent dates: Jordan accepts
  Sam's swap (Sat, Nov 8 for Thu, Nov 6), the manager approves it, then Jordan
  sees "Swap approved" and Sam's lock screen shows "Your swap request was
  approved".
- The closing panel is plain brand navy, without the grid or glow.
- Every animation stays as it is today.

Must hold: no horizontal scroll at 390px, light and dark both read, sections
keep a constant height while they animate, reduced motion still rests each
illustration, and the typography and theme contracts pass.

## Build steps

- [x] **1. Hero.** Wider schedule frame and the overlapping phone, hidden below
      desktop width.
      **Done when:** it renders at 1440px and 390px in light and dark.
- [x] **2. Sections.** Wider centered sections without alternating tints, larger
      illustrations, the merged phones section, and a plain closing panel; update
      `e2e/landing.spec.ts`.
      **Done when:** type-check, lint, the landing unit tests and the landing e2e
      pass, and section heights stay constant through a loop.

## Verify

- `npm run type-check` (web), ESLint and Prettier on changed files, the landing
  unit tests, `PORT=3007 npx playwright test e2e/landing.spec.ts
e2e/theme-cookie.spec.ts --project=chromium`.
- Browser at 1440px and 390px, light and dark.

## Evidence

- `npm run type-check` (web) clean; ESLint and Prettier clean on the changed
  files; 43 landing, typography, theme and content-visibility unit tests pass.
- `PORT=3007 npx playwright test e2e/landing.spec.ts e2e/theme-cookie.spec.ts
--project=chromium`: 5 passed.
- Browser at 1440px light and dark: the hero phone shows the Team view; the
  swap story steps through accept, approve and both alerts. At 375px, no
  horizontal scroll. Each section kept one height through 12 seconds of
  animation.
