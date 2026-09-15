# Feature: App-wide pill overflow resilience

**From build-plan:** feature 23
**Status:** verified

## Goal

Keep all pill-shaped labels inside their visual bounds across web and mobile,
including long organization-defined names, narrow containers, browser zoom, and
larger text settings. Preserve the existing rule that button labels never wrap.

## In scope

- Shared web safeguards for pills, chips, tags, badges, and segmented choices.
- Shared mobile primitives and recurring local pill patterns.
- Display-only labels that wrap and grow without clipping.
- Interactive pill controls that remain one line, shrink correctly, and truncate
  rather than escaping their bounds.
- Full-value accessibility through the existing accessible name, with the shared
  accessible hint where visible web text is intentionally truncated.
- Regression coverage for long labels, narrow parents, icons, counts, and large
  font or zoom conditions.

## Out of scope

- Changing button labels, information architecture, or organization terminology.
- Redesigning schedule shift pills or changing print abbreviations.
- Replacing intentionally compact numeric notification badges.
- Production migration execution; feature 24 remains the final release gate.

## Build steps

- [x] **Step 1 - Define the shared overflow contract** - add explicit reusable
      web and mobile styles for wrapping display pills and single-line interactive
      pills. _Done when:_ tests prove both policies keep long content bounded and
      preserve accessible full values.
- [x] **Step 2 - Apply the contract across web** - update shared primitives and
      recurring app styles, including Settings role and certification pills.
      _Done when:_ long text remains inside the pill at narrow widths and zoom,
      while interactive chips keep one-line labels and usable controls.
- [x] **Step 3 - Apply the contract across mobile** - update shared chip,
      segmented-control, tab, status, assignment, and profile pill patterns.
      _Done when:_ long text remains bounded under narrow screens and enlarged
      text without breaking adjacent content or button-label rules.
- [x] **Step 4 - Verify representative app-wide surfaces** - run focused web and
      mobile regressions, inspect representative Settings and mobile surfaces,
      then run all project gates. _Done when:_ tests, type-check, lint, formatting,
      and production build pass with no unexplained regression.

## Files / areas

- `apps/web/src/app/globals.css` and `apps/web/src/components/ui/` - shared web
  policies and primitives.
- `apps/web/src/components/settings/` and related people/schedule surfaces -
  long organization-defined labels.
- `apps/mobile/src/shared/components/` and recurring feature styles - native
  pill layout behavior.
- Web and mobile component/contract tests for long and narrow content.

## Design reference

- User screenshot `Screenshot 2026-09-14 at 11.04.17.png` showing a long
  certification label escaping a rounded pill.

## Notes for the AI

- Display-only pills may wrap and grow vertically; do not clip meaningful text.
- Buttons and other interactive pill controls stay on one line and truncate only
  after flex shrink and available-width constraints are applied.
- Add `min-width: 0` or native `flexShrink` at both the pill and text boundary;
  text overflow fixes on only one side are incomplete.
- Avoid a brittle selector that treats structural wrappers or schedule cells as
  semantic pills solely because their class name contains `pill`.
- Keep the full label as the accessible name. Use the shared accessible hint when
  web visible text can truncate; do not use native `title` tooltips.
