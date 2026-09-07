# Compact shift-detail cards

**Type:** Fix
**Status:** implemented; mobile checks passed, root web build blocked
**Authorization:** The user approved the compact prototype, briefly narrowed
implementation to buttons, then explicitly expanded it to everything about the
shift-detail cards. The home hero remains outside this change.

## Scope

Use the shared neutral buttons with leading icons, visible labels, medium size
(48pt minimum height), and pill shape for Drop shift and Swap. Preserve action
order, equal widths, permissions, disabled states, and request behavior.

Apply the home hero's stacked calendar tile, prominent 24pt bold shift titles, time above location,
and value-only metadata rows to both personal and teammate cards. Preserve the
teammate name, category/mentoring badges, split-shift content, and eligibility.
Keep the publication footer to one line; tapping it opens the full information
in the shared bottom sheet. Update the loading placeholder to match.
The date tile matches the home hero's weekday-over-day layout and geometry,
with the same muted gray fill and subtle border as the Your week date tiles.
It keeps primary text for a dark date label in light mode and readable light
text in dark mode.
The calendar sits beside the combined title and metadata column so its height
does not add space between the title and the time/location rows.
For absence cards, the category heading "Absence" uses the 24pt bold title
treatment, and the actual absence name stays in a compact category pill.
General-shift names use the 24pt bold treatment inside their category pills;
ordinary job badges remain compact.
This scoped record preserves the active production-migration spec and existing
completed work in the shared checkout.

## Build steps

- [x] Replace the custom vertical button content and remove its unused styles.
- [x] Apply the approved shift-detail layout and matching loading placeholder.
- [x] Run mobile tests, mobile type check, build, and scoped diff checks.

## Verification

- Full mobile suite: 121 files, 955 tests passed.
- Final focused shift-detail and skeleton tests: 35 passed.
- Mobile TypeScript check passed.
- Expo iOS production export passed (Hermes bundle).
- Formatting and scoped diff checks passed.
- Root build compiled the web app but failed on unrelated existing web
  TypeScript errors in no-floating-async-handler tests, settings/navigation
  tests, permission fixtures, and onboarding StructureStep.
- Native device visual inspection was not performed. Open your own shift and a
  teammate's shift to review the layout; tap the publication line for its full
  timestamp and publisher. Very long publication text ellipsizes in the card.
- No commit or push was made.

## Commit preflight - 2026-09-06

- User requested a safe commit. A card-only patch was isolated from pre-existing
  action-sheet and avatar edits; it has not been staged.
- The current files contain later refinements from another task: restored field
  labels and a primary-colored Swap button. The requested design choice is
  pending before those changes can be included in this task's commit.
- Full mobile rerun passed all 955 tests after a month-swiping timeout passed
  independently. Full workspace verification is not green.
- The lower-concurrency full-workspace rerun finished: 955 mobile tests passed;
  web had 3,012 passing tests and one typography-contract failure. The workspace
  test gate failed.
- Root type check and build failed on five unrelated web TypeScript errors.
- Root lint stopped when another task removed a SectionNotice test file during
  its scan. The shared checkout also advanced to newer commits during validation.
- F-54 remains a fixed P1 finding awaiting the completion gate's re-review.
- No commit or staging mutation was performed by this task. Rebaseline the
  shared checkout and rerun the required checks before resuming the commit.
