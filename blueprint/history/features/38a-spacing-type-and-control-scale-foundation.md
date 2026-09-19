# 38a. Spacing, type, and control scale foundation

**Type:** Feature

**Status:** verified

**Build plan:** 38a, first sub-feature of 38 (Mobile UI consistency and
interaction resilience). Foundation for 38b-38f.

## Goal

Give every mobile screen one ramp to draw from, so the later dashboard,
request-flow, and migration work changes screens rather than inventing
numbers. After this feature the shared primitives carry the contract, the
contract is written down, and a lint rule reports what still drifts.

Decisions already made (2026-09-17): ban the 2/6/10/14 sub-grid rather than
adopting it; `Card` titles at 20/600 and the greeting at 28/700.

## Scope

In:

- Type ramp: `display` (28/34, 700) and `title` (20/26, 600) added to
  `mobileTypographyTokens.text`; `AppText` picks them up through
  `keyof typeof mobileText`.
- Control scale: one `mobileControlTokens` height ramp of `sm: 36`, `md: 44`,
  `lg: 52`. `Button` md 48→44, lg 56→52; `SearchBar` 46→44; `AuthField`
  54→52 (the code field 62→52); `SegmentedControl` already 36/44 and reads the
  token; icon controls already 44.
- List rows: `mobileListRowTokens` (`minHeight 44`, `paddingVertical 12`,
  `titleGap 4`) consumed by `PressableRow`.
- Badges fill-only: `CountBadge` drops its border, padding 8×4 (`sm`/`xs`).
  `Chip` is already borderless.
- `Card`: title `title`; title→surface gap 12→8; surface padding 20→16
  (`lg`); `mobileSpacing.sectionGap` 32→24. Skeleton surfaces follow through
  `getCardSurfaceStyle`.
- `BottomSheetModal`: footer `paddingTop` 14→12; body/footer
  `paddingHorizontal` literal → `mobileSpace.xl`; footer `gap` literal →
  `mobileSpace.md`.
- `icon-control-style`: drop the `raised` shadow, keep the stroke (one edge).
- `FilterSheet`: the `16 - SELECTION_ROW_INSET` literal reads
  `mobileSpace.lg`.
- Lint: `design/no-raw-mobile-metrics` (warn) in `eslint-rules/`, applied to
  `apps/mobile/src/**` and `apps/mobile/app/**` excluding tests, `tokens.ts`,
  and `onboarding/components/illustrations/**`. Flags a numeric `fontSize`,
  and a numeric `padding*`, `margin*`, `gap`, `rowGap`, `columnGap` whose
  value is not 0 or on the ramp (4, 8, 12, 16, 20, 24, 32, 40, 48) or a
  negative of one. Reports the count per file so 38d has its checklist.
- `apps/mobile/AGENTS.md`: the Design System tables gain the contract.

Out (later sub-features): dashboard-specific surfaces (hero tiles, status
pill), the schedule/requests/profile literal migration (38d), flipping the
lint rule to error (38d), `ConfirmationModal`/`ScrollableTabStrip`/
`KeyboardDoneAccessory` (38e).

## Build steps

- [x] **1. Tokens: type steps, control scale, row metrics**
  - `packages/design-tokens/src/index.ts`: add `display` and `title` to
    `mobileTypographyTokens.text`; add `mobileControlTokens` and
    `mobileListRowTokens`; `mobileSpacing.sectionGap` 32→24.
  - Re-export through `apps/mobile/src/shared/theme/tokens.ts`.
  - Test: extend the tokens test (or add one) asserting the new steps and that
    every `text` entry's `lineHeight` ≥ `fontSize`.
  - Done when `npm run build:packages` (or the design-tokens turbo filter) and
    the mobile `type-check` pass.

- [x] **2. Controls on the 36/44/52 scale**
  - `Button` SIZE reads `mobileControlTokens`; `SearchBar`, `AuthField`,
    `SegmentedControl` read the same.
  - Tests: Button, SearchBar, SegmentedControl, AuthField suites stay green;
    any height assertions updated to the token.
  - Done when those suites pass.

- [x] **3. Rows, badges, cards, sheet footer, icon control, filter inset**
  - `PressableRow` consumes `mobileListRowTokens`; `CountBadge` fill-only;
    `Card` title/gap/padding; `BottomSheetModal` footer; `icon-control-style`
    single edge; `FilterSheet` inset.
  - Tests: `contrast.test.ts` (badge fill against its label), Screen/Card,
    BottomSheetModal and PressableRow suites stay green.
  - Done when the full mobile suite passes.

- [x] **4. Lint rule and the written contract**
  - `eslint-rules/no-raw-mobile-metrics.mjs` with a unit test in
    `eslint-rules/` (the repo runs rule tests with vitest if any exist;
    otherwise a minimal RuleTester test), wired as `warn` in
    `eslint.config.mjs`.
  - `apps/mobile/AGENTS.md`: replace the Design System table's spacing/size
    rows with the contract from the audit (ramp, control scale, row metrics,
    badge rule, card and section geometry, banned sub-grid).
  - Done when `npm run lint` passes (warnings allowed) and the rule's own
    test passes; record the per-file warning counts in this spec's Outcome.

## Verify

- `npm run test:mobile`, `npm --workspace @dubgrid/mobile run type-check`,
  `npm run lint` (warnings from the new rule are expected; no errors).
- Simulator: Profile, People, Requests and Schedule screens still lay out
  with buttons, search and segmented controls sharing one height; cards read
  with a 20pt title over a 16pt-padded surface; badges have no outline.

## Outcome

- Checkpoint `5d9427d8` on `dev` (2026-09-17), 19 files: design tokens
  (`display`/`title`, `mobileControlTokens`, `mobileListRowTokens`,
  `sectionGap` 24), the mobile token adapter, `Button`, `SearchBar`,
  `AuthField`, `SegmentedControl`, `PressableRow`, `CountBadge`, `Card`
  (`Screen.tsx`), `BottomSheetModal`, `icon-control-style`, `FilterSheet`,
  `eslint-rules/no-raw-mobile-metrics.mjs` + test, `eslint.config.mjs`,
  root `package.json` (`lint:rules`), both `AGENTS.md` files.
- Evidence: design-tokens package 39/39 (six new), full mobile suite
  1128/1128, mobile `type-check` clean, `npm run lint` 0 errors / 347
  warnings, `npm run lint:rules` 7/7, repo-wide type-check and tests green in
  the pre-push hook.
- Lint baseline for 38d (`design/no-raw-mobile-metrics`, 342 warnings in 59
  files): `scheduleScreenStyles.ts` 107, `shiftDetailScreenStyles.ts` 45,
  `requestsScreenStyles.ts` 23, `ProfilePrimitives.tsx` 22, `SplitShift.tsx`
  12, `NotificationsScreen.tsx` 11, `DashboardSkeleton.tsx` 10,
  `ProfileSkeleton.tsx` 8, `MyScheduleCard.tsx` 7, `DashboardHeroCard.tsx` 5,
  `NotificationDetailScreen.tsx` 5, `PeopleScreen.tsx` 5,
  `PendingRequestsCard.tsx` 5, `AuthField.tsx` 4, the rest under 4 each.
- Simulator check pending an authenticated session; the control-height and
  card-geometry changes are visible on every screen once one exists.
