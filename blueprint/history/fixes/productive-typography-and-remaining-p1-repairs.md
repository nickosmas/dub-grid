# Productive typography and remaining P1 repairs

**Type:** Fix

**Status:** verified

**Fixes:** F-25, F-26, F-27, F-28, F-29, F-32, F-33

## Problem

The web app had a useful font-size token scale, but shared primitives and feature
surfaces bypassed it with duplicated inline sizes, arbitrary Tailwind sizes,
heavy weights, and widespread 9px to 11px text. Field titles and table headings
commonly used bold uppercase styling, while sidebar, navbar, and toolbar items
did not consistently share a readable size or light-mode foreground color.

The mobile app also had two P1 request-flow defects: mutating controls could
submit twice before pending state rendered, and the Requests History tab only
loaded the active 14-day schedule window. The first history repair then exposed
a P1 availability regression where a history-only failure blocked healthy
active requests.

## Resolution

- Centralized a productive typography hierarchy: 28px desktop and 24px mobile
  page titles, 20px/18px section titles, 16px component headings, 14px body and
  controls, 13px field titles and table headings, and 12px metadata and badges.
- Made ordinary field titles and table headings medium-weight sentence case,
  while preserving reviewed uppercase codes, statuses, abbreviations, charts,
  previews, and print exceptions.
- Aligned sidebar, navbar, toolbar, buttons, inputs, selects, menus, tabs,
  badges, and table primitives with the semantic roles. Available navigation
  items and icons use the primary foreground in light mode; section titles and
  supporting context remain secondary.
- Strengthened DM Sans navigation from regular to medium weight and separated
  sidebar section titles into a 14px semibold secondary-gray role, while body
  copy and metadata retain quieter weights.
- Migrated productive web surfaces and added static plus authenticated-browser
  regression coverage for sizing, casing, hierarchy, overflow, themes,
  responsive widths, and browser zoom.
- Returned Promises through mobile mutation callbacks so the shared async-action
  latch blocks same-tick duplicate submissions across create, cancellation,
  access-management, and destructive confirmation flows.
- Added a tenant-safe, employee-scoped, deterministic cursor-paginated mobile
  request-history API and consumed it through an independent infinite query.
- Kept history loading, failure, retry, empty, and pagination states inside the
  History tab so active request cards and actions remain available.
- Declared the new history route's Next.js dynamic segment setting locally so
  the route is statically analyzable during production builds.

## Build steps

- [x] Establish the semantic productive type contract.
- [x] Migrate shared navigation and control primitives.
- [x] Normalize field titles and table column headings.
- [x] Migrate productive application surfaces.
- [x] Enforce and verify the typography contract.
- [x] Repair residual ordinary micro text.
- [x] Normalize residual ordinary uppercase headings.
- [x] Strengthen regression coverage.
- [x] Prevent same-tick duplicate mobile mutations.
- [x] Add tenant-safe cursor-paginated mobile request history.
- [x] Consume complete history in the mobile Requests screen.
- [x] Isolate history availability from active requests.
- [x] Strengthen navigation weight and sidebar section hierarchy.

## Verification

- `npm run type-check` - passed (24 workspace tasks plus root TypeScript check).
- `npm run lint` - passed with 0 errors and 147 existing warnings.
- `npm run test` - passed (22 workspace tasks; web 332 files / 2,695 tests;
  mobile 113 files / 880 tests; all shared-package suites passed).
- Focused history route test - 5 tests passed after the route-entry correction.
- `npm run build` - passed; the new history API route is included as a dynamic
  production route.
- `npm run test:e2e` - 27 tests passed across Chromium, Firefox, and WebKit,
  including the productive typography route/theme/width/zoom matrix.

## Findings

### productive-typography-and-remaining-p1-repairs/F-25 [P2] closed - Productive UI text remains below a readable minimum

Semantic aliases now map ordinary metadata to 12px, and remaining smaller text
is restricted to reviewed code, chart, calendar, preview, and print exceptions.

### productive-typography-and-remaining-p1-repairs/F-26 [P2] closed - Shared controls bypass the typography scale

Shared controls and navigation now consume centralized semantic typography and
foreground roles instead of feature-local sizes and weights.

### productive-typography-and-remaining-p1-repairs/F-27 [P2] closed - Uppercase micro-labels dominate operational hierarchy

Ordinary field, filter, detail, and table headings now use the sentence-case
field or table role; uppercase is bounded to meaningful exceptions.

### productive-typography-and-remaining-p1-repairs/F-28 [P1] closed - Mobile mutation controls can submit twice before pending state renders

Promise-returning callback chains now engage the shared same-tick action latch,
with create, cancel, and destructive-confirmation regression tests.

### productive-typography-and-remaining-p1-repairs/F-29 [P1] closed - Mobile request history only loads requests dated today through the next 13 days

The separate history endpoint uses authenticated organization and employee
visibility boundaries plus deterministic cursor pagination without filtering
out older shift dates.

### productive-typography-and-remaining-p1-repairs/F-32 [P2] closed - Typography regression coverage misses the defects it is meant to prevent

Static enforcement covers expression-based micro sizes and bounded uppercase
exceptions, while browser coverage exercises the principal authenticated routes.

### productive-typography-and-remaining-p1-repairs/F-33 [P1] closed - History failure blocks otherwise healthy active requests

Global content state depends only on bootstrap, active requests, and
availability. History-only loading and errors are rendered inside its own tab.
