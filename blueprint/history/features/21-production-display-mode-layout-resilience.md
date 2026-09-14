# Feature: Production display-mode layout resilience

**From build-plan:** feature 21
**Status:** verified

## Goal

Keep the Settings display-mode choices fully visible and selectable at supported
desktop widths and browser zoom levels, and make every Settings data table start
from the Departments screen's standard width, grow when content or edit-only
controls need room, and distribute its visible columns across the full surface.

## In scope

- Let display-mode choice copy wrap inside its own card instead of forcing the
  two-column grid wider than its container.
- Keep both preview cards and their sample grids bounded by the Settings panel
  at desktop widths, narrower desktop viewports, and browser zoom.
- Render role names as ordinary table text in read-only mode, not category
  pills, while retaining the full accessible name.
- Derive string-list table width from the visible columns and their real content,
  with a larger envelope only while edit-only controls are present.
- Distribute billing activity columns across its full table and let the dense
  organization activity table use all available Settings width.
- Cover empty, short, long, one-column, multi-column, read-only, edit, narrow,
  and maximum-width states without introducing page overflow.
- Use the Departments screen's standard 1120-pixel content width as the minimum
  desktop table/card envelope; edit and dense modes may grow to the section cap.
- Keep every page title and subtitle anchored to the same left edge as its data
  table, including when read and edit modes use different maximum widths.
- Distribute visible columns equitably across the entire table width; reserve
  fixed narrow tracks only for edit handles and row actions.
- Wrap and auto-grow long editable name fields so their complete values remain
  visible without widening one column or introducing horizontal field scrolling.
- Add regressions for the layout contract and existing selection behavior.

## Out of scope

- Changing display-mode persistence, preview data, shift rendering, or compact
  label behavior.
- Redesigning role editing, role requirements, departments, or eligibility
  semantics.
- Changing mobile organization settings, which are deliberately web-only.
- Treating responsive Settings forms, editors, and configuration card grids as
  data tables; their existing responsive form behavior remains unchanged.
- Altering the global button no-wrap rule.

## Build loop

Continuous Mode implements these steps serially, self-reviews each diff, runs
the complete verification gate, archives the result, and creates one local
`dev` commit. It does not push or deploy.

## Build steps

- [x] **Step 1 - Lock the responsive layout contract** - add focused assertions
      that choice copy can wrap without creating intrinsic overflow, both cards
      remain width-bounded, role names render as plain text, and the read-only
      Roles table uses a bounded column envelope. _Done when:_ the new assertions
      fail on the current production-layout implementation while the existing
      selection and save tests remain intact.
- [x] **Step 2 - Repair display-mode and Roles layout** - constrain the display
      choices at the card and grid boundaries, replace the read-only role-name
      pill with typographic table text, and give the role table a bounded
      responsive width. _Done when:_ long descriptions wrap,
      neither display choice clips its sibling or sample, and role rows align in
      a standard-width readable table without changing edit controls.
- [x] **Step 3 - Generalize adaptive Settings table sizing** - calculate the
      table/card envelope from the columns and content actually rendered, expand
      string-list tables only when edit controls need the room, distribute
      billing history columns across their table, and reserve full width for the
      dense activity log. _Done when:_ the same sizing rule covers all Settings
      data tables and an edge-case matrix proves the Departments-width floor,
      density growth, caps, narrow safety, and mode awareness.
- [x] **Step 4 - Verify production-shaped behavior** - run focused Settings
      tests, inspect both affected Settings sections at normal and zoomed/narrow
      desktop sizes when runtime access is available, then run the complete
      project tests, type-check, lint, formatting, and production build. _Done
      when:_ layout and selection are observable, all automated gates pass, and
      no P0 or P1 finding blocks completion.

## Files / areas

- `apps/web/src/components/settings/DisplayMode.tsx`
- `apps/web/src/components/settings/StringListSettings.tsx`
- `apps/web/src/components/settings/settings-table-layout.ts`
- `apps/web/src/components/settings/BillingSettings.tsx`
- `apps/web/src/components/activity/ActivityTable.tsx`
- `apps/web/src/components/settings/__tests__/StringListSettingsDepartments.test.tsx`
- `apps/web/src/components/settings/__tests__/settings-table-layout.test.ts`
- `apps/web/src/__tests__/SettingsDirtySaveControls.test.tsx`
- `e2e/settings-layout.spec.ts`

## Data / contracts

- `ShiftDisplayMode` values and `saveOrganizationSettingsWithRecovery` input are
  unchanged.
- Role names remain complete text content; only their read-only presentation
  changes from a category pill to table typography.
- Role editing, schedule eligibility, department, and certification values keep
  their current persistence and authorization paths.
- The layout must contain intrinsic widths locally rather than weakening the
  app-wide one-line button-label contract.

## Testing

- Display-mode coverage asserts bounded grid/card styles, wrapping descriptions,
  both choices, selection, cancel, and save behavior.
- Adaptive-table coverage exercises sparse and dense column sets, short and long
  content, read/edit modes, empty values, viewport caps, and the full-width dense
  activity-table contract.
- Roles coverage asserts plain role-name text, no role-name category pill,
  equitable aligned tracks, edit-only expansion, complete auto-growing name
  fields, and unchanged requirements.
- Final gates: `npm run test`, `npm run type-check`, `npm run lint`,
  `npm run format:check`, and `npm run build`.

## Notes for the AI

- Fix the intrinsic sizing at the display choice itself. Do not remove the
  global no-wrap protection from real action buttons.
- Keep the two display choices side by side when the container can support them;
  allow the layout to collapse naturally only when it cannot.
- Do not turn role requirements or the org-wide department marker into plain
  text as part of the role-name change.
- Apply the adaptive contract only to tabular data. A field grid whose columns
  are form controls remains a responsive form, not a table-sizing candidate.

## Verification evidence

- `npm run test`: 22/22 tasks passed; web 427 files and 3,655 tests passed.
- `npm run type-check`: 24/24 tasks plus root TypeScript check passed.
- `npm run lint`: 0 errors; 5 pre-existing warnings.
- `npm run format:check`: all files matched Prettier formatting.
- `npm run build`: 11/11 production build tasks passed.
- `npx playwright test e2e/settings-layout.spec.ts --project=chromium`:
  authenticated Calm Haven checks passed at 1280, 900, and 800 pixels, including
  page containment, title/table alignment, equal column distribution, read/edit
  sizing, and complete long-name field visibility.
