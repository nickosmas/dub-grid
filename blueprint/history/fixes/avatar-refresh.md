# People avatar palette and typography

**Type:** Fix
**Status:** implemented; full verification blocked by unrelated web failures
**Authorization:** User approved the iterated 16-color preview and requested implementation in the app, then refined the initials to a slightly smaller size and medium weight during implementation.
**Design reference:** /Users/nickosmas/.codex/visualizations/2026/09/05/01a0730f-e4c8-7ab1-8962-b7e1bb93ea43/avatar-palette.html

This scoped record preserves the unrelated production-migration spec in
`current-feature.md` and existing dialog/access-management changes. Work stays
on `dev`; no commit or push is requested.

## Intended change

- Use the approved softened 16-color palette in the shared design tokens.
- Keep text contrast at least 4.5:1 and pairwise OKLab distance at least 0.05.
  Slightly separate dark-mode pairs that fall below the existing threshold.
- Scale medium-weight initials to 20px text in a 48px avatar, with a 9px minimum
  for the tiny schedule-lock markers. Keep
  avatar dimensions and layout intact, including small presence/lock avatars.
- Use native DM Sans medium on mobile, without synthetic font weights.
- Keep ID-based deterministic assignment and linked-account seed resolution.
  Replacing the palette changes existing assignments once; no identity data changes.

## Build step

- [x] Apply shared colors and proportional typography to people/profile,
      navigation, presence, schedule, dashboard, and illustrative avatar consumers
      on web and mobile. Done when palette checks and relevant consumer checks pass
      and representative sizes render without clipping.

## Verification

Design-token tests/build/typecheck; both app suites and typechecks; web build;
focused rendered avatar evidence when available. Record unrelated baseline
failures separately and do not claim native-device verification from DOM tests.

## Results

- Shared package build/typecheck passed; 33 design-token tests passed, including
  all 16 colors in both themes, AA text contrast, pairwise color separation,
  deterministic seed assignment, and proportional medium typography.
- Mobile suite: 121 files / 953 tests passed. Mobile typecheck passed. After
  the last weight adjustment, the mobile token tests passed again (14 tests).
- Focused web People, Header, ScheduleGrid, presence, and typography tests:
  177 passed. After the final weight adjustment, presence and typography were
  rerun: 27 passed.
- Scoped ESLint, Prettier checks, and `git diff --check` passed. Existing staging
  is byte-for-byte unchanged; no commit or push was made.
- The broad web suite reported 3001 passing tests and two failures. One was
  the obsolete ScheduleGrid micro-text exemption, removed because shared
  typography now owns that size; its focused reruns pass. The remaining
  settings-config department authorization test expects `false` and receives
  `undefined`; this is outside the avatar change.
- Full typecheck and build report six existing web errors in
  `no-floating-async-handler.test.ts`, `SettingsNavigationGuard.test.tsx`,
  `usePermissions.test.ts`, `StructureStep.tsx`,
  `settings-help-tooltips.test.tsx`, and `employee-activity.test.ts`.
  Production compilation succeeded before failing at type checking.

## Visual evidence and limits

- Inspected the running mobile People list and person profile with the new
  palette and enlarged initials, before the final medium-weight refinement.
- Browser samples of the shared palette rendered in both themes at 360px and
  736px widths. Final medium-weight `WW` initials were measured using the app's
  loaded font at every avatar diameter from 20px through 96px and fit inside
  the borders. Native text uses a single line and adjusts to fit when system
  font scaling would otherwise overflow its fixed circle.
- No authenticated web People screenshot or final-weight native screenshot
  is claimed. Dark fills have small lightness changes from the preview to keep
  the existing contrast and separation checks passing.
- Dashboard overtime markers retain their semantic warning colors; their
  initials adopt the shared typography. Pending invitations retain their
  existing neutral treatment.
- Palette replacement changes some people's assigned colors once, while
  preserving deterministic ID-based consistency across consuming surfaces.
- Regular audit/check/try gates are all manual. This change does not run them
  automatically or claim the entire shared checkout is verified.

Evidence logs and screenshots are in
`/Users/nickosmas/.codex/visualizations/2026/09/05/01a0730f-e4c8-7ab1-8962-b7e1bb93ea43/avatar-verification/`.
