# Accessible light-gray typography and complete page audit

**Type:** Fix

**Status:** verified

## Problem

The completed typography pass did not inspect every web page and left visible
inconsistencies. Some interface text still renders too thin, sidebar section
titles do not consistently read as larger bold gray group labels, and the
secondary gray is darker than the quiet hierarchy requested. The target is the
ChatGPT-inspired light gray, tuned one step darker for DubGrid: `#858585`.

## Outcome

Every web route and its route-owned panels use one explicit, readable type
hierarchy. Primary and actionable content remains dark; navigation group titles
and large secondary headings use `#858585` in light mode, while essential small
labels use the darker neutral `#666666`. The quiet gray is restricted to
hierarchy roles whose meaning is also communicated by placement, size, and
weight, rather than being used for essential body copy or available actions. Section titles in
sidebars are 14px, semibold, sentence case, and gray. Actionable navigation and
toolbar text and icons remain primary/black in light mode. Light-mode neutral
text, borders, backgrounds, hover states, selected sidebar rows, and disabled
states use one neutral hue family instead of mixing neutral gray with blue-slate
gray. Brand, status, warning, danger, and informational colors remain semantic
colors and are not neutralized.

## Typography contract

- Page title: 28px desktop / 24px mobile, 700, primary.
- Section title: 20px desktop / 18px mobile, 600, primary unless it is a
  navigation group label.
- Component heading: 16px, 600, primary.
- Body and controls: 14px; prose may remain 400, while interactive text and
  compact UI labels use 500 so controls do not look thin.
- Sidebar/navigation group title: 14px, 600, sentence case, quiet
  gray (`#858585` in light mode).
- Field title and table column heading: 13px, 500, sentence case, accessible
  neutral gray (`#666666` in light mode).
- Metadata/supporting text: 12px, 400 or 500 according to importance, using the
  accessible neutral label gray; never lower opacity on top of that token.
- Available sidebar/navbar/toolbar items and their icons: 14px, 500, primary
  black/dark foreground in light mode. Disabled, placeholder, and nonessential
  states remain separately semantic and must not be mistaken for available
  actions.
- Preserve meaningful uppercase abbreviations, codes, statuses, charts,
  previews, and print-only exceptions; ordinary labels and headings use
  sentence case.

## Complete audit scope

Audit all 26 web route entry points, not a representative sample:

- Public/auth: `/`, `/login`, `/forgot-password`, `/reset-password`,
  `/verify-email`, `/auth/verify`, `/accept-invite`, `/accept-terms`,
  `/onboarding`, `/billing-required`, `/goodbye`, `/request-demo`, `/privacy`,
  `/terms`, and `/cookie-policy`.
- Product: `/dashboard`, `/gridmaster`, `/schedule`, `/people`, `/people/[id]`,
  `/profile`, `/reports`, `/alerts`, `/account`, `/settings`, and
  `/settings/staff-config`.
- Include every lazy settings panel, table, card, drawer, dialog, popover,
  empty/loading/error state, navbar, toolbar, sidebar variant, and responsive
  navigation surface reachable from those routes.

For each route, inspect rendered typography plus route-local CSS/Tailwind and
inline styles. Record the route in a checked audit manifest so completion cannot
be inferred from shared-token changes alone. Authentication or data state must
be supplied through existing fixtures/test setup; inaccessible production data
is not grounds to omit a route-owned state.

## Build steps

- [x] Add the `#858585` light-mode secondary-gray semantic mapping and a
      role-boundary regression test covering all standard light surfaces; preserve
      independently reviewed dark-mode tokens.
- [x] Normalize shared type primitives and navigation variants so weights,
      colors, casing, and icon treatment implement the contract without opacity or
      feature-local overrides.
- [x] Normalize the complete light-mode neutral palette, including text,
      borders, surfaces, hover/selected states, disabled states, shadows, and
      sidebar highlighting; preserve brand/status colors and the independently
      designed dark-mode zinc palette.
- [x] Repair F-32 and F-33 - keep `#858585` on quiet hierarchy roles, move
      essential small text to a contrast-safe neutral, and restore distinct dark
      secondary and muted tiers.
- [x] Consolidate component-library, alternate-row, hover, selected, and sidebar
      fills onto the same opaque light neutral ramp; remove near-white and
      translucent neutral escape hatches and add regression coverage.
- [x] Strengthen secondary Close buttons with a distinct surface and border,
      plus visible hover and pressed states from the shared neutral ramp.
- [x] Repair toolbar primary actions so typography inheritance cannot override
      inverse button colors, and use matched SVG icons for the People Add actions.
- [x] Repair F-34 - expose active sidebar state programmatically and add a
      non-color cue without changing the neutral hue direction.
- [x] Repair F-35 and F-36 - remove remaining route-local gray and thin-control
      drift and enforce the semantic contracts app-wide.
- [x] Repair F-37 - complete the 26-route audit manifest and browser coverage.
- [x] Replace route-local hardcoded or utility-class grays with the appropriate
      semantic neutral token and add enforcement against new neutral hue drift.
- [x] Audit and repair every public/auth route and record each route in the
      checked manifest.
- [x] Audit and repair every product route plus all lazy settings panels and
      record each route in the checked manifest.
- [x] Audit and repair route-owned overlays and empty/loading/error states,
      removing thin ordinary UI text and unjustified one-off gray/weight classes.
- [x] Add static enforcement for unapproved small text, uppercase ordinary
      headings, thin interactive text, opacity-dimmed supporting text, and direct
      neutral utility colors that bypass semantic roles.
- [x] Run focused typography tests and authenticated browser checks across
      light/dark themes, desktop/mobile widths, and browser zoom, with explicit
      evidence for all route families and sidebar variants.
- [x] Run the full applicable verification suite and report any unrelated
      failures separately without modifying unrelated dirty work.
- [x] Repair F-38 - restore the semantic body class to the body weight token and
      test every semantic role's weight mapping.
- [x] Repair the shared off-state switch track so it remains visibly distinct
      on neutral cards in light and dark mode.
- [x] Repair F-39 - replace broad route-family enforcement exclusions with
      narrow documented artifact exceptions.
- [x] Repair F-37 - make route-owned state evidence explicit and mechanically
      validated instead of treating a handwritten checked flag as proof.
- [x] Replace the heavy active-sidebar inset rail with a semibold selected label,
      preserving the neutral highlight and programmatic current-page state.
- [x] Lighten the shared light-mode off-state toggle track while preserving 3:1
      boundary contrast against every standard neutral surface.
- [x] Standardize unselected selectable pills on an outlined neutral treatment
      with surface fill, visible border, and dark readable text.
- [x] Restore clear hierarchy and horizontal separation between schedule-rule
      items.
- [x] Repair F-40 - give true content-section headings a stronger shared
      hierarchy than field labels, migrate every confirmed misuse, and add focused
      regression coverage for nested heading, label, and supporting-copy roles.
- [x] Unify People roster status, focus-area, overflow, and account pills with
      the Activity Log category-pill treatment, use accessible label-gray neutral
      text, keep category surfaces quietly visible, render account linkage as
      borderless rounded pills with 14px solid round icons, prevent unresolved
      theme and invitation data from flashing gray, preserve semantic tones,
      promote plain roster-column values to primary foreground, align invitation
      Close with the outlined secondary action treatment, and leave status pills
      outside the roster unchanged.
- [x] Rework Activity details into a compact hierarchy: keep the category badge
      intrinsic-width, reduce the event headline to component-heading scale,
      separate primary identity from email, quiet label weights, group metadata
      and changes with clear spacing and a divider, and keep responsive zoom and
      mobile layouts readable.
- [x] Give the Roles table balanced non-scrolling data columns with more room for
      requirements and less for departments, use the shared
      staff-settings selectable-tag design for certification requirements in edit
      mode, use compact outlined category pills in view mode, keep visible pill
      labels complete across at most two measured lines, add a tooltip-backed `+N
more` only when the remaining content no longer fits, and preserve requirement
      selection and save behavior; render schedule eligibility as Yes or No and
      keep all named certifications distinct from Anyone so uncertified staff remain
      excluded; use the same shared selectable pills for departments in edit mode,
      preserving all currently selected departments as an explicit scope distinct
      from Org-wide so future departments are included only by Org-wide.
- [x] Strengthen consequential schedule and management access summaries with
      minimal red warning copy and a distinct status/body hierarchy, while
      keeping the shared neutral container consistent with ordinary access
      summaries.
- [x] Prevent the Add Management popover from flashing missing-email guidance
      while authoritative account and invitation data is still loading; keep the
      guidance visible once loading finishes and the person truly has no email.
- [x] Open Add to management from the People detail sheet in the standard modal
      popup instead of replacing the detail sheet with an inline editor; keep the
      full-profile page's intentional in-page access editor unchanged.
- [x] Restore compact vertical rhythm in the People detail sheet by removing the
      empty embedded-editor action spacer and grouping invitation, management,
      and employment actions without oversized gaps.
- [x] Add a shared circular down-arrow overflow cue to every scrollable slideover,
      content popup, and the Schedule page's remaining staff rows; keep it fixed
      at the lower center, show it only while content remains below the viewport,
      update it when layout or content changes, and hide it at the bottom.
- [x] Render role names in the Roles table's view-only mode with the same compact
      outlined category-pill treatment used for the other displayed role values;
      keep edit-mode name inputs and non-role settings lists unchanged.
- [x] Disable externally rendered employee-editor Save actions whenever the
      embedded form has a blocking validation error, including a missing required
      Wings selection; re-enable only after the form is both changed and valid.

## Done when

- All 26 page entry points and their reachable route-owned UI states are checked
  in the audit manifest with no unexplained omission.
- Sidebar section titles are consistently 14px/600, sentence case, and quiet
  gray; field titles and table headings follow their 13px/500 sentence-case
  role.
- Interactive navigation/toolbar text and icons remain primary in light mode,
  while navigation group titles and large secondary headings use `#858585`;
  essential small labels and metadata use `#666666`, and essential body text and
  available actions never use the quiet gray.
- Light-mode neutral colors form a visibly coherent hue family across text,
  borders, surfaces, hover states, selected sidebar rows, and disabled states;
  no route-local slate/gray/zinc utility or neutral hex bypasses that family
  without a documented visual-output exception.
- Shared light-mode hover and secondary surfaces use `#eeeeee`, while selected
  navigation uses the stronger `#e5e5e5`; neither structural state falls back
  to the near-white `#f5f5f5` fill.
- No ordinary interactive label relies on a thin 400 weight, and prose remains
  comfortably readable without making the whole interface bold.
- Static checks, focused tests, browser evidence, and the full applicable
  verification suite pass.

## Findings

### accessible-light-gray-typography-and-complete-page-audit/F-32 [P1] closed - Quiet gray fails normal-text contrast on required labels and headings

**File:** apps/web/src/app/globals.css:102-103,147-163,253-271
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** `#858585` renders at only 3.54:1 to 3.69:1 on the app's standard light surfaces, but the semantic mapping applies it to 13px field titles and table headings and 12px metadata. Those labels are essential to understanding forms and tables, so font weight and placement do not replace the 4.5:1 normal-text requirement. The current regression test asserts the hex value but never checks contrast.
**Suggested fix:** Keep `#858585` for genuinely nonessential supporting text, introduce a darker neutral semantic token for essential small labels and headings, and add contrast assertions for every foreground/background role pairing.
**Resolution:** Essential 12px and 13px roles now use neutral `#666666`, which
clears 4.5:1 on every standard light and selected surface. `#858585` remains on quiet
navigation-group and large-heading roles. Regression tests calculate the role
contrast instead of only matching the token string.
Re-reviewed 2026-09-02 by `/audit current`: essential 12px/13px roles remain on
`#666666`, and the contrast regression verifies at least 4.5:1 against every
standard light surface. The quiet role is limited by the active contract to
nonessential hierarchy labels.

### accessible-light-gray-typography-and-complete-page-audit/F-33 [P2] closed - The new quiet token collapses the independently designed dark-mode hierarchy

**File:** apps/web/src/app/globals.css:102-103,392-397
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** Both secondary and muted typography roles now resolve through `--dg-color-text-quiet`. In dark mode that makes section labels, field/table headings, and metadata all `#9797a0`, bypassing the existing `#a1a1aa` muted tier and contradicting the active spec's promise to preserve the dark zinc hierarchy. Browser-computed styles confirmed both roles resolve to the same value.
**Suggested fix:** Separate the light-only quiet mapping from the secondary and muted semantic roles, or define distinct theme-aware quiet-secondary and quiet-muted tokens, then assert their dark-mode computed values remain distinct.
**Resolution:** A separate theme-aware label token restores `#a1a1aa` for dark
field, table, and metadata roles while dark quiet headings remain `#9797a0`.
Browser-computed styles confirmed the two tiers resolve independently.
Re-reviewed 2026-09-02 by `/audit current`: the repaired dark tokens remain
distinct (`#9797a0` quiet and `#a1a1aa` label), and the focused architecture and
typography tests pass.

### accessible-light-gray-typography-and-complete-page-audit/F-34 [P2] closed - Sidebar selection is only a low-contrast background change

**File:** apps/web/src/components/ui/sidebar.tsx:481-509; apps/web/src/components/settings/SettingsShell.tsx:186-202
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** `isActive` only produces a `data-active` styling hook. Link-backed items do not receive `aria-current`, button-backed views do not receive `aria-pressed`, and the neutral `#ececec` selection fill differs from white by only 1.18:1. The active location therefore has neither a programmatic state nor a strong non-color visual cue for users who cannot distinguish the subtle fill.
**Suggested fix:** Propagate `aria-current="page"` for active links and `aria-pressed` for active view buttons, and add an accessible neutral state cue that preserves the requested hue and borderless visual direction.
**Resolution:** Active link-backed items now expose `aria-current="page"`,
active view buttons expose `aria-pressed="true"`, and the shared sidebar
primitive adds a slim inset marker without adding a border or changing the
neutral selection fill. Focused semantic and sidebar regression tests pass.
Re-reviewed 2026-09-02 by `/audit current`: the shared primitive exposes
`aria-current`/`aria-pressed`, retains the inset marker, and all four sidebar
semantic tests pass without a new accessibility regression.
User revision 2026-09-02: the visually heavy inset marker was removed. Active
items now combine the neutral selection fill with semibold text, while retaining
the audited `aria-current` and `aria-pressed` semantics. The shared treatment
also applies to nested sidebar items.
Re-reviewed 2026-09-02 by `/audit current`: the user-approved borderless active
treatment remains distinguishable through neutral fill plus semibold text, link
and button semantics remain intact, and all five focused sidebar tests pass.

### accessible-light-gray-typography-and-complete-page-audit/F-35 [P2] closed - Route-local gray drift remains outside the neutral-palette regression

**File:** apps/web/src/app/global-error.css:7-11; apps/web/src/components/onboarding/steps/ScheduleStep.tsx:128-131; apps/web/src/components/settings/DisplayMode.tsx:502-505; apps/web/src/**tests**/theme-architecture.test.ts:67-88
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** The fatal error surface still uses the old blue-slate text values, and onboarding/settings controls retain old slate fallback values. The new test inspects only the light block in `globals.css`, so it passes while reachable app surfaces continue to use a different gray hue.
**Suggested fix:** Move reachable route-local UI onto semantic neutral tokens, update the self-contained fatal-error palette, document true email/print/social/user-configurable color exceptions, and make enforcement scan production UI sources rather than only `globals.css`.
**Resolution:** Replaced the fatal-error blue-slate fallback with the approved neutral family, removed slate fallbacks from onboarding and Display Mode, normalized remaining reachable slate-tinted shadows and preset neutrals, and added a production-UI scan with explicit exceptions only for fixed social, print, marketing-preview, and user-configurable color output.
Re-reviewed 2026-09-02 by `/audit current`: the production-source neutral scan
covers app, component, and feature UI, the repaired fatal-error/onboarding/settings
surfaces remain neutral, and the theme architecture suite passes.

### accessible-light-gray-typography-and-complete-page-audit/F-36 [P2] closed - Thin interactive text remains and current enforcement samples only shared primitives

**File:** apps/web/src/components/settings/ActivityLog.tsx:126-139; apps/web/src/**tests**/typography-contract.test.ts:22-52,242-264
**Found:** 2026-09-01 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** The Activity Log search control still explicitly renders at weight 400 despite the 500 control contract. The regression test checks the shared input and two navigation files, while excluding the auth and onboarding families entirely, so route-local thin controls can remain or regress without failing the suite.
**Suggested fix:** Migrate every interactive control to the semantic control/navigation weight and replace file-sample assertions with an app-source scan that distinguishes allowed 400-weight prose and metadata from interactive elements.
**Resolution:** Moved the Activity Log search control to the semantic control weight and added a TypeScript-AST regression that scans native and shared interactive JSX controls across app, component, and feature sources for explicit 400-weight or `font-normal` overrides.
Re-reviewed 2026-09-02 by `/audit current`: the AST scan covers every production
TSX source root, reports no thin interactive override, and the focused typography
suite passes.

### accessible-light-gray-typography-and-complete-page-audit/F-37 [P2] closed - Route-owned states are marked checked without being exercised

**File:** e2e/typography.spec.ts:4-10; blueprint/context/current-feature.md:50-69,83-98
**Found:** 2026-09-01 by /audit (scope: current; lens: tests)
**Why it matters:** The 26-route manifest now lists loading, error, empty, dialog,
drawer, success, timeout, and other route-owned states, but the browser matrix only
opens each route's default visit and asserts that `ownedStates` is non-empty. A
listed state can therefore remain unrendered while `auditStatus: "checked"` passes,
contradicting the active spec's explicit all-states completion criterion.
**Suggested fix:** Represent each state as an executable fixture/scenario (or
separately mark source-only review evidence), exercise every reachable state, and
derive checked status from passing scenarios rather than a handwritten literal.
**Resolution:** Added a checked 26-entry route manifest with source ownership, access behavior, and route-owned states; expanded Chromium coverage to every public, gated, authenticated, redirect, and Gridmaster entry outcome; and exercised all 15 lazy settings panels across light/dark, desktop/mobile, and effective 200% zoom widths. The broader matrix also repaired thin auth, request-demo, toolbar, filter, and profile controls plus a mobile Alerts overflow discovered by the new checks.
Re-reviewed 2026-09-02 by `/audit current`: route-entry and lazy-settings coverage
is confirmed, but the original fixture-backed state requirement remains incomplete;
the entry is returned to open until those named states have real evidence.
The manifest now removes handwritten checked flags entirely. Every route state is
classified as browser-exercised or source-reviewed; browser evidence is tied to
the actual route matrix step, source-reviewed states remain honestly distinct,
and duplicate or missing evidence fails the structural test. Settings panels are
proved by the loop that renders all 15 panels. The complete six-test Chromium
matrix passes across all 26 routes, both themes, responsive widths, effective
200% zoom, overlays, and lazy settings panels.
Re-reviewed 2026-09-02 by `/audit current`: the evidence split is explicit rather
than claiming source-reviewed states were rendered. The six-scenario Chromium
matrix passes, and the structural test rejects missing, duplicate, or handwritten
route-state evidence.

### accessible-light-gray-typography-and-complete-page-audit/F-38 [P2] closed - The shared body role renders at control weight

**File:** apps/web/src/app/globals.css:127-143,545-550
**Found:** 2026-09-02 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** `--dg-type-body-weight` correctly defines prose as 400, but
`.dg-type-body` applies `--dg-type-control-weight` (500). Any consumer of the
semantic body class therefore receives medium-weight prose, contradicting the
active hierarchy and its requirement not to make the whole interface bold.
**Suggested fix:** Apply `--dg-type-body-weight` in `.dg-type-body` and assert each
semantic class consumes its matching role weight token.
**Resolution:** `.dg-type-body` now consumes `--dg-type-body-weight`, restoring
400-weight prose, and the typography contract test now verifies every semantic
class consumes its matching role weight token. The focused 17-test typography
suite passes.
Re-reviewed 2026-09-02 by `/audit current`: the body class still consumes the
400-weight body token and the 18-test typography contract suite passes.

### accessible-light-gray-typography-and-complete-page-audit/F-39 [P2] closed - Broad directory exclusions weaken app-wide typography enforcement

**File:** apps/web/src/**tests**/typography-contract.test.ts:27-57,442-469
**Found:** 2026-09-02 by /audit (scope: current; lens: tests)
**Why it matters:** The micro-text, heavy-weight, opacity, and uppercase scans
exclude entire auth, onboarding, and landing directories. Those folders contain
ordinary form labels and controls as well as expressive presentation, so a new
9px label or uppercase ordinary heading can pass despite the spec's app-wide
enforcement requirement. The separate AST check only closes the thin-interactive
weight case.
**Suggested fix:** Scan all production UI and use narrow, line/file-level
allowlists for genuine previews, marketing display type, codes, and compact
calendar artifacts rather than exempting whole route families.
**Resolution:** Typography enforcement now scans real public, auth, onboarding,
and landing UI, excluding only named fixed mockups, previews, print/social output,
the compact calendar artifact, and non-UI API code. The scan exposed six ordinary
onboarding/outcome headings at weight 800; they now use the semantic 700 page-title
weight. Only the seven intentional marketing display headings retain an allowlisted
heavy weight. The focused 18-test typography suite and web type-check pass.
Re-reviewed 2026-09-02 by `/audit current`: production UI remains covered by the
app-wide scans with only narrow named exceptions, and the focused typography
contract suite passes.

### accessible-light-gray-typography-and-complete-page-audit/F-40 [P2] closed - Content section headings still collapse into the field-label tier

**File:** apps/web/src/components/EditEmployeePanel.tsx:372-390,436-438,661-670; apps/web/src/components/staff/StaffReadOnlyDetailPanel.tsx:328-342; apps/web/src/components/staff/ManagementStaffPanel.tsx:844-858,934-946; apps/web/src/components/settings/Jobs.tsx:421-443; apps/web/src/components/dashboard/CoverageBySectionCard.tsx:216-229; e2e/typography.spec.ts:315-390
**Found:** 2026-09-02 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** Several actual content sections such as Details, Assignments,
Contact, and Day-by-day staffing use the same 13px/500 gray role as their child
field labels. `EditEmployeePanel` even defines `sectionLabel` and `fieldLabel`
with identical typography. In the Jobs editor, the 13px gray section title sits
above 12px explanatory text whose muted token is darker, inverting the intended
title-to-supporting-copy hierarchy. The route matrix checks page titles and the
Settings sidebar but not headings inside cards, drawers, or editors, so all six
browser scenarios pass while this hierarchy regression remains visible.
**Suggested fix:** Give true content-section headings a shared semantic treatment
that is visibly stronger than field labels while preserving the quiet gray
hierarchy; keep the 13px field role only for form labels and compact group captions.
Migrate the confirmed staff, Jobs, and dashboard instances, review the remaining
field-title consumers by semantic role, and add a focused regression that compares
section-heading size/weight/color against nested labels and supporting copy.
**Resolution:** Added a shared 14px/600 accessible-gray content-group heading
role, migrated the confirmed headings across staff panels, settings editors,
dashboard cards, alerts, audit details, sessions, permissions, filters, and
shift editing, while retaining 13px/500 for true field labels and compact
captions. Static regression coverage checks both semantic tiers and every
migrated source. The browser matrix verifies their computed hierarchy across all
26 routes, both themes, responsive widths, effective 200% zoom, overlays, and
all lazy settings panels. The same matrix exposed a pre-hydration Schedule
toolbar overflow at 390px; its desktop navigation cluster now shrinks safely.
Focused tests, the 22-task workspace suite, the 11-task production build, and
the six-scenario Chromium matrix pass.
Re-reviewed 2026-09-02 by `/audit current`: the new semantic role resolves to
14px/600 in the accessible label gray while nested field titles remain 13px/500;
all confirmed section-heading consumers use the stronger role, no semantic h3
still uses the field-title class, 84 focused tests pass, and the fresh six-test
Chromium matrix passes across every route, theme, width, zoom, overlay, and lazy
settings panel. The toolbar fallback also remains bounded at the mobile viewport.

### accessible-light-gray-typography-and-complete-page-audit/F-41 [P1] closed - The paused roster work leaves the declared web type-check failing

**File:** apps/web/src/**tests**/StaffTableRow.test.tsx:213-217
**Found:** 2026-09-02 by /audit (scope: current; lenses: quality, tests)
**Why it matters:** The test passes three abbreviated focus-area objects where
`StaffTableRow` now requires full `FocusArea` values. `npx tsc --noEmit --project
apps/web/tsconfig.json` fails with TS2739 for all three fixtures, so the active
feature cannot satisfy its required verification gate or be completed safely.
**Suggested fix:** Complete each fixture with the required `orgId`,
`departmentId`, and `sortOrder` fields (or use the shared typed fixture builder),
then rerun the web type-check and focused row tests.
**Resolution:** Completed the three `FocusArea` fixtures with the required
organization, department, and sort-order fields. The focused roster tests and
the web TypeScript check now pass; `/audit` must re-review this repair before it
can close.
Re-reviewed 2026-09-02 by `/audit current`: the final fixtures retain all
required `FocusArea` fields, the web type-check passes, the focused combined
People/pill/theme suite passes 64 tests, and the exact-state full web suite
passes 335 files and 2,734 tests. No remaining type-contract failure was found.
