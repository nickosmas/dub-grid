# Feature: Inter product typography

**From build-plan:** feature 24
**Status:** verified

## Goal

Make Inter the consistent typeface for product UI and ordinary copy across the
web and mobile apps without changing DubGrid's semantic type scale. Preserve DM
Sans for the DubGrid wordmark and for actual landing or marketing titles and
headings, and make scheduling numbers scan consistently through tabular figures.

## Design reference

There is no screenshot to replicate. The locked target is the typography
contract in `blueprint/context/project-overview.md`: Inter for product UI and
ordinary copy, DM Sans for the wordmark and landing or marketing headings, the
existing semantic size hierarchy, and tabular numerals for scheduling data.

## In scope

- Load Inter Variable on web through `next/font`, expose an explicit product
  family and brand family, enable optical sizing, and make Inter the inherited
  default for controls and ordinary page copy with a system-sans fallback.
- Keep the web wordmark, landing headings, request-demo marketing headings,
  social-image brand text, and other genuine marketing headings on DM Sans.
  Product UI shown inside landing-page mockups uses Inter because it represents
  the application, not surrounding marketing copy.
- Remove product-only hardcoded DM Sans overrides from authenticated, auth,
  onboarding, legal, error, print, and generated-email surfaces. Printed
  schedule data and email copy use Inter while pre-rendered wordmark artwork
  remains DM Sans.
- Load native Inter 400, 500, 600, and 700 faces on mobile while retaining the
  DM Sans 700 asset used by `DubGridWordmark`.
- Move mobile product typography tokens, navigation headers, shared primitives,
  direct family references, and safe text inputs to the matching Inter face.
  Preserve the Android rule that named single-weight families carry weight in
  `fontFamily`, not a conflicting `fontWeight`, and preserve an interactive
  system-font fallback for inputs if bundled font loading fails.
- Add and apply reusable tabular-numeral styling to schedules, dates, times,
  durations, hour totals, staffing counts, and other scheduling metrics on web
  and mobile.
- Update typography contract tests and per-app agent guidance so later work
  cannot silently restore DM Sans as the product default.
- Verify representative web routes across supported themes, browser zoom, and
  tenant data, plus representative iOS and Android screens at supported native
  text scales when those devices are available.

## Out of scope

- Changing font sizes, line heights, weights, spacing, colors, or component
  hierarchy except where a verified Inter metric difference requires the
  smallest layout correction.
- Redesigning the wordmark, landing page, marketing hierarchy, email layout,
  print layout, or any application screen.
- Replacing deliberate monospace text used for codes, identifiers, audit data,
  or other technical content.
- Adding database, API, authentication, tenant, or production migration work.
- Treating every number as tabular. The rule applies to scheduling and
  operational numeric data, not ordinary prose or brand text.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the step before changing code.
2. Implement only that step.
3. Show the diff and explain the reason for each changed area.
4. Verify its observable done-when, then stop for review before continuing.

## Build steps

- [x] **Step 1 - Establish the web font boundary** - load Inter Variable beside
      DM Sans, make Inter the inherited product and ordinary-copy family, add an
      explicit reusable DM Sans brand-heading boundary, enable optical sizing, and
      extend the web typography contract tests. _Done when:_ computed product and
      control text resolves to Inter, the wordmark and an explicitly marked landing
      heading resolve to DM Sans, the existing semantic size and weight tokens are
      unchanged, and the focused typography tests pass.
- [x] **Step 2 - Complete the web typography migration** - audit and remove
      product-only DM Sans overrides across authenticated, auth, onboarding, legal,
      error, print, landing mockup, and email source; explicitly mark genuine
      landing and marketing headings; regenerate committed email output when its
      source changes. _Done when:_ the source audit finds no unexplained product
      DM Sans use, landing and request-demo headings plus every wordmark still use
      DM Sans, product mockups and ordinary/email/print copy use Inter, and focused
      web and email checks pass.
- [x] **Step 3 - Make web scheduling figures tabular and resilient** - add one
      reusable tabular-numeral contract and apply it to representative schedule,
      dashboard, report, date, time, duration, staffing-count, and total surfaces
      without changing their semantic scale. _Done when:_ scheduling figures use
      tabular numerals in both themes, non-operational prose does not inherit the
      rule, no label or control wraps unexpectedly from the font change, and the
      web typography contract plus affected focused tests pass.
- [x] **Step 4 - Establish the native Inter token system** - add the native
      Inter 400/500/600/700 assets, load them at startup with DM Sans 700 retained
      for the wordmark, map shared mobile product and navigation typography to the
      matching Inter families, and update token, root-layout, and font stubs/tests.
      _Done when:_ every shared product token names the intended Inter face without
      a conflicting numeric weight, the wordmark names DM Sans 700, startup waits
      for the required assets but retains its existing load-error escape, and the
      focused token/root-layout tests pass.
- [x] **Step 5 - Complete the mobile product migration** - move direct product
      family references, stack/tab headers, shared components, safe text inputs,
      and screen-specific typography onto the new token aliases while leaving only
      documented brand and monospace exceptions. _Done when:_ a source audit finds
      no unexplained product DM Sans family, all visible product text including
      editable fields uses Inter where safe, `DubGridWordmark` remains DM Sans, and
      representative mobile component and screen tests pass.
- [x] **Step 6 - Make mobile scheduling figures tabular and validate scaling** -
      add a shared mobile numeric style and apply it to schedule dates, times,
      durations, counts, totals, and dashboard metrics; inspect representative
      screens at normal and maximum supported text scaling. _Done when:_ relevant
      numeric text uses `tabular-nums`, long labels and pills remain contained,
      navigation and inputs remain interactive, and available iOS and Android
      device checks show no clipping, fallback, or layout regression.
- [x] **Step 7 - Close the cross-platform contract** - update the web and mobile
      `AGENTS.md` font rules, run source audits for stale family names and accidental
      scale changes, exercise representative web routes at 100%, 125%, 150%, and
      200% zoom in light and dark modes, and run the repository verification gate.
      _Done when:_ guidance matches the implemented contract, Calm Haven and another
      organization render the same typography behavior, available browser/device
      evidence is recorded, `npm run lint`, `npm run type-check`, `npm run test`,
      and `npm run build` pass, and any unavailable native evidence is disclosed.

## Files / areas

- `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, public and
  authenticated route styles, landing components, print schedule output,
  React Email source and generated templates.
- `apps/web/src/__tests__/typography-contract.test.ts` and focused tests for any
  surface whose explicit family or numeric styling changes.
- `apps/mobile/app/_layout.tsx`, navigation layouts/options, shared text and
  input primitives, mobile theme adapters, scheduling/dashboard screens, test
  font shims, and root/token tests.
- `packages/design-tokens/src/index.ts`, `apps/mobile/package.json`, and the
  lockfile for the native Inter package.
- `apps/web/AGENTS.md` and `apps/mobile/AGENTS.md` for the settled font contract.
- `blueprint/context/coding-standards.md` for the cross-project font rule.

## Data / contracts

- No database, network, API, or persisted-data changes.
- Web CSS contract: product sans and brand-heading families remain separate;
  Tailwind `font-sans` resolves to the product family.
- Mobile contract: `mobileTypography.fontFamily` and every `mobileText` token
  resolve to named Inter weight assets; a separate brand alias or the wordmark
  component owns DM Sans 700. Editable fields may use the system fallback only
  when the Inter asset is not confirmed loaded.
- Numeric contract: shared web and mobile styling applies tabular figures only
  to scheduling and operational numeric content.

## Testing

- Extend `apps/web/src/__tests__/typography-contract.test.ts` to assert Inter is
  the product default, DM Sans exceptions are explicit and bounded, optical
  sizing is enabled, semantic sizes remain stable, and stale product overrides
  are rejected.
- Update mobile token and root-layout tests to assert all four Inter assets load,
  tokens use the correct named family without conflicting weights, the wordmark
  retains DM Sans, the input fallback remains interactive after a font-load
  failure, and tabular numeric styling has a reusable contract.
- Run affected web/mobile focused suites after each logic-bearing contract step.
- Manually inspect representative web product, auth, landing, print, and
  email-preview surfaces at the specified zoom levels and both themes.
- Manually inspect mobile login, navigation, dashboard, schedule, shift detail,
  people, and profile on available devices at normal and maximum supported text
  scale, explicitly checking inputs and native headers on Android.
- Final gate: `npm run lint`, `npm run type-check`, `npm run test`, and
  `npm run build`.

## Notes for the AI

- Work on `dev`; do not create or switch branches and do not commit without the
  workflow's explicit approval.
- The uncommitted edits to `blueprint/project-plan.md`,
  `blueprint/build-plan.md`, and `blueprint/context/project-overview.md` are
  user-owned roadmap updates for this feature. Preserve them and do not rewrite
  unrelated plan content.
- The current web and mobile `AGENTS.md` rules still describe DM Sans as the
  product font. They are stale for feature 24 and must be updated only when the
  implementation establishes the replacement contract.
- Do not replace `DubGridWordmark`, generated wordmark images, or deliberate
  monospace content with Inter.
- Do not apply the DM Sans exception to all headings. Product page and component
  headings use Inter; only real landing or marketing headings and brand marks
  use DM Sans. Keep those exceptions in an explicit source allowlist enforced by
  the typography contract test.
- Preserve native font safety. Each named Inter weight is its own loaded family;
  use family aliases and avoid pairing them with a conflicting `fontWeight`.
- Treat browser zoom and native text scaling as layout verification, not as
  permission to alter the semantic type scale.
- Review follow-up: the oversized iOS Email placeholder was caused by calling
  `focus()` in the same tick that mounted the credential stage. Native
  `autoFocus` now owns that transition, bounded fields and the wordmark retain
  their scale ceilings, and auth screens place the full-width primary action
  before centered help/navigation links.
- Native evidence: the current source was inspected on Android at 100% and 200%
  system text and on a clean iOS simulator build at normal and maximum
  accessibility text. Organization and credential stages remained contained,
  Email and Password placeholders matched, links stayed readable on one line,
  and the fields remained interactive. The iOS native build completed with zero
  errors and zero warnings.
- Final verification: focused auth/typography tests passed (30 tests), then
  `npm run lint`, `npm run type-check`, `npm run test` (22 tasks; web 433 files /
  3,699 tests and mobile 138 files / 1,114 tests), and `npm run build` passed.
  Lint retained five pre-existing warnings and no errors.
