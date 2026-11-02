# Current Feature

## Label example hints

**Type:** Fix
**Status:** verified
**Branch:** `claude/label-example-hints` (cloud session; merges into `dev` by pull request)

## The problem

The Areas label has one-tap preset chips under its text field (#283), and Certifications and Roles have short hints ("e.g. Certifications, Designations"). The owner found a text field beside a row of chips confusing, and prefers the plain field with a hint, enriched with more examples, for all three labels (owner, 2026-11-02, after reviewing chip, combobox and text-hint prototypes).

## The fix

- Each label is a plain text field whose hint lists examples, from one shared list per label in `packages/domain`:
  - **Areas:** e.g. Areas, Units, Wings, Halls, Floors, Neighborhoods, Locations ("Desks" dropped, owner).
  - **Certifications:** e.g. Certifications, Credentials, Licenses, Qualifications, Designations, Skill Levels, Training.
  - **Roles:** e.g. Roles, Positions, Responsibilities, Duties, Titles.
- The chips go: `AreaLabelPresets` and its test are deleted, and Settings > Labels (which onboarding reuses) and the Gridmaster setup wizard show the hints instead.
- **Must not break:** how labels are saved (blank or the default stores `NULL`), the placeholders showing the default, label limits, and field validation.

## Build steps

### 1. Shared examples and the hints

- [x] Built and approved

- `packages/domain`: the example lists for all three labels and a helper that writes the hint line; a test pins the three lines.
- Settings > Labels and the setup wizard show the hint under each field; the chips component and its test are removed.

**Done when:** web and domain tests, type-check and lint pass, and no file imports `AreaLabelPresets`.

### 2. Public docs

- [x] Built and approved

- `docs/configuration/terminology.mdx` lists the new examples and drops the one-tap sentence; fingerprints refreshed.

**Done when:** `npm run docs:check:closed` passes.

## Verify

- `npm run type-check`, `npm run lint`, `npx prettier --check .`, `npm run test` (web, domain) and `npm run build` pass, then CI on the PR.
- Settings > Labels shows three plain fields, each with its "e.g." line, and no chips.

## Completion notes

- Checks in the cloud session: domain tests (291 passed), the web Settings, wizard and related tests, web and mobile type-check, lint on the changed files, `npx prettier --check .` and `npm run docs:check:closed`. The full suites, build and E2E run in CI on the PR.
- The owner reviewed chip, combobox and text-hint prototypes and chose the text hints, without "Desks".
