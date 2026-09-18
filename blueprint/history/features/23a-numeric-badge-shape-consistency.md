# Feature: Numeric badge shape consistency

**From build-plan:** feature 23a
**Status:** verified

## Goal

Every numeric count badge in the product (unread alerts, request and tab
counts, open-shift counts, staffing-needed counts, active-filter counts)
renders through one pill contract per platform, so the same value looks the
same on every surface. Today the web `NumericBadge` forces one- and two-digit
values into fixed circles while every other count surface is a pill, so `26`
is a circle in the schedule grid and a pill in the toolbar; on mobile the
filter button uses a fixed 22px circle, the open-shift count adds a border no
other badge has, and the alert dot clamps at `9+` on one screen and `99+` on
another.

Decisions taken at spec review (2026-09-18): bell badges keep `9+`; every
other count clamps at `99+`; `sm` is 16px and `md` 20px on both platforms;
the mobile `CountBadge` label pill stays out of scope.

## In scope

- One shared contract in `@dubgrid/design-tokens`: two sizes, one clamp rule,
  tabular numerals, and a `formatBadgeCount` helper both apps use.
- Web `NumericBadge` rewritten to that contract (always a pill; a one-digit
  value is simply a pill whose content is narrower than its minimum width),
  with named tones, `max` clamping, and a `label` prop for its accessible name.
- Every web count surface routed through it: `Toolbar` (Requests menu, Tools
  and Coverage floating counts), `MembersSection` filter count,
  `AlertsInboxPage` tab counts, `ShiftRequestBoard` tab counts,
  `NotificationBell`, `ScheduleGrid` staffing-needed, and the landing
  `ScheduleGridMockup`. The `.dg-notification-badge` CSS class and the inline
  `borderRadius: "50%"` span are removed.
- A mobile `NumericBadge` primitive in `src/shared/components/` with the same
  sizes and tones, and every mobile count surface routed through it:
  `AlertsHeaderButton`, `ScheduleScreen` alert dot and open-shift count,
  `ScrollableTabStrip`, `SegmentedControl`, `FilterSheet`.
- Accessible labeling: floating badges carry their own label ("26 unread
  alerts"); a count inside a mobile tab or segment is read through the
  control's `accessibilityValue`, and a web tab's text content already
  includes it.
- Qualification of 1, 2, 9, 10, 26, 50, 99, 99+ (from 100) in light and dark
  themes, at 100% and 200% zoom on web and at default and large text scale on
  mobile.

## Out of scope

- Text pills and status badges (`You`, `On Schedule`, role and certification
  pills, request-type labels in the mobile `CountBadge`, urgency labels). They
  are labels, not counts, and keep their current shapes.
- Icon-only status dots with no number.
- Schedule shift pills, print abbreviations, and the shift-category colors the
  schedule grid feeds into its staffing badge (the badge keeps accepting them).
- Where a floating badge is positioned on its parent; placement stays at the
  call site.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the shared contract** - add
      `packages/design-tokens/src/numeric-badge.ts`, exported from the index:
      `NUMERIC_BADGE_MAX = 99`; `formatBadgeCount(count, max = NUMERIC_BADGE_MAX)`
      returning `"99+"` above the max and the plain integer otherwise; and
      `numericBadgeSize = { sm: { size: 16, paddingX: 4 }, md: { size: 20,
paddingX: 6 } }` (`sm` is the floating indicator on an icon button, `md`
      the inline count; `size` is the height and the minimum width). The
      formatter floors non-integers and returns `null` for non-finite input or
      anything at or below zero, which is the primitives' "render nothing"
      signal. Rebuild the packages. _Done when:_ `numeric-badge.test.ts`
      passes for 1, 99, 100, a custom max, 0, -1, 2.7, `NaN`, and `Infinity`;
      both apps type-check against the new export.

- [x] **Step 2 - Web primitive** - rewrite
      `apps/web/src/components/ui/numeric-badge.tsx`: props `count`, `max`,
      `size` (`sm` | `md`), `tone` (`danger` solid red on inverse text, `brand`
      solid brand on inverse, `brandSoft` brand-soft on brand text, `neutral`
      border-light on muted text, `onAccent` translucent white on inherited
      text), `label` (rendered as `aria-label`), plus `className`/`style`
      passthrough for the schedule's category colors. Always `rounded-full`,
      `height` and `min-width` from the size token, horizontal padding from
      `paddingX`, `--dg-fs-badge` at 700, `dg-tabular-nums`, `whitespace-nowrap`,
      `data-numeric-badge` with `data-size` and `data-tone`. Renders nothing for
      a count of zero or less. Delete the digit-length shape switch and its
      `data-shape` attribute. The prop is `count: number` (the old `value`
      accepted a pre-clamped string); update the four existing consumers
      (`ScheduleGrid`, `ShiftRequestBoard`, `NotificationBell`,
      `ScheduleGridMockup`) to pass `count` in this same step so the app keeps
      type-checking, leaving their tones and sizes for Step 3. _Done when:_ the
      rewritten `numeric-badge.test.tsx` proves no `data-shape`, `100` renders
      `99+`, `max={9}` renders `9+`, zero renders nothing, and `label` lands on
      `aria-label`; `npm run type-check` passes.

- [x] **Step 3 - Web call sites** - route the nine surfaces through the
      primitive with the matching tone and size: `Toolbar` (Requests menu
      `neutral md`; Tools and Coverage `danger sm` floating), `MembersSection`
      filter count (`brand sm` floating), `AlertsInboxPage` and
      `ShiftRequestBoard` tab counts (`neutral md`, `onAccent` when the tab is
      active), `NotificationBell` (`danger sm`, `max={9}`: a bell badge keeps
      its `9+` clamp), `ScheduleGrid` and `ScheduleGridMockup` staffing-needed
      (`md` with the category colors passed through `style`). Remove
      `.dg-notification-badge` and `.dg-notification-badge--absolute` from
      `globals.css`, keeping the absolute offsets at the call sites. _Done
      when:_ `grep dg-notification-badge apps/web/src` and `grep 'borderRadius:
"50%"'` return nothing, every count surface carries `data-numeric-badge`,
      the affected component tests pass, and screenshots of the toolbar, the
      alerts tabs, the requests tabs, and a schedule cell with a staffing count
      show pills of one height per size.

- [x] **Step 4 - Mobile primitive** - add
      `apps/mobile/src/shared/components/NumericBadge.tsx`: `count`, `max`,
      `size`, `tone` (`danger` danger on textInverse, `brand` brand on
      textInverse, `brandSoft` brandSoft on brand, `neutral` surface on
      textMuted, `onAccent` `rgba(255,255,255,0.22)` on textInverse), `label`
      (rendered as `accessibilityLabel`), `style` passthrough. `minHeight` and
      `minWidth` from the size token so large text can grow the pill,
      `paddingHorizontal` from `paddingX`, `borderRadius: mobileRadii.pill`,
      `mobileText.badge` for `md` and `mobileText.micro` for `sm`,
      `mobileTabularText`, `includeFontPadding: false`,
      `maxFontSizeMultiplier` of `MAX_FONT_SCALE` for `md` and
      `MAX_FONT_SCALE_FIXED` for `sm` (a floating dot that outgrows its icon
      ring stops pointing at anything). Fill only, no border. Renders nothing
      for zero. _Done when:_ `NumericBadge.test.tsx` proves the clamp, the
      zero case, the accessibility label, and that `sm` and `md` both render
      through the mobile harness.

- [x] **Step 5 - Mobile call sites** - route `AlertsHeaderButton` and the
      `ScheduleScreen` alert dot (`danger sm`, label "N unread alerts",
      `max={9}` on both: bell badges keep the `9+` clamp, so the schedule
      screen's dot moves from `99+` to match the header bell), the
      `ScheduleScreen` open-shift count
      (`brandSoft md`, border removed), `ScrollableTabStrip` and
      `SegmentedControl` counts (`neutral md`, `onAccent` when active or
      selected), and the `FilterSheet` count (`onAccent md`, replacing the
      fixed 22px circle) through the primitive, and delete the local badge
      styles they replace. Expose a tab's or segment's count to assistive tech
      through `accessibilityValue` (the explicit label otherwise hides the
      badge), keeping the bare label as the accessible name per the existing
      naming convention. _Done when:_ no `alertBadge`, `openShiftCountBadge`,
      `badge`/`badgeText` or `filterCountBadge` numeric styles remain in those
      files, the existing tab-strip, segmented-control, filter-sheet, and
      schedule tests pass, and type-check passes.

- [x] **Step 6 - Qualify the matrix** - add `e2e/numeric-badges.spec.ts`
      that signs in as the QA super admin, visits `/alerts`, `/schedule`,
      `/people`, and the requests board, and for every `[data-numeric-badge]`
      sets its text to each of `1 2 9 10 26 50 99 99+` and measures: height
      equals the size token, width is at least the height, border radius is at
      least half the height, and widths never decrease as the value grows; run
      it in light and dark and at the 1440 and 720-wide (200% effective zoom)
      viewports, and fail the run if fewer than three badges were found across
      all routes so an empty page cannot pass it. On mobile, capture
      `scripts/mobile-shot.sh` cells for the requests segmented control, the
      alerts header badge, a schedule open-shift count, and the filter button,
      each in `light-default` and `dark-ax` (eight cells covering both themes
      and both text scales), into `blueprint/reference/mobile/`. Built as ten:
      the requests tab strip and the filter sheet's segmented control are
      different primitives, so both got cells, and the open-shift carousel is a
      staff Home surface, so its cells come from the Android emulator as the
      seeded regular user. _Done when:_ the spec passes and the mobile cells
      are committed and show pills of one shape family with the count fully
      inside the fill.

## Files / areas

- `packages/design-tokens/src/numeric-badge.ts`, `index.ts` - shared contract.
- `apps/web/src/components/ui/numeric-badge.tsx` (+ test),
  `apps/web/src/app/globals.css` - web primitive and removed class.
- `apps/web/src/components/Toolbar.tsx`, `NotificationBell.tsx`,
  `ScheduleGrid.tsx`, `ShiftRequestBoard.tsx`, `staff/MembersSection.tsx`,
  `landing/ScheduleGridMockup.tsx`, `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`
  - web call sites.
- `apps/mobile/src/shared/components/NumericBadge.tsx` (+ test) - mobile
  primitive.
- `apps/mobile/src/shared/navigation/AlertsHeaderButton.tsx`,
  `apps/mobile/src/shared/components/ScrollableTabStrip.tsx`,
  `SegmentedControl.tsx`, `FilterSheet.tsx`,
  `apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx`,
  `scheduleScreenStyles.ts` - mobile call sites.
- `e2e/numeric-badges.spec.ts`, `blueprint/reference/mobile/*.png` -
  qualification.

## Data / contracts

- **Load-bearing:** `formatBadgeCount`, `NUMERIC_BADGE_MAX`, and
  `numericBadgeSize` in `@dubgrid/design-tokens`; both primitives read them.
- **Load-bearing:** `data-numeric-badge`, `data-size`, `data-tone` on the web
  primitive; the e2e spec and future UI audits select on them.
- Web props: `{ count: number; max?: number; size?: "sm" | "md"; tone?:
"danger" | "brand" | "brandSoft" | "neutral" | "onAccent"; label?: string }`
  plus `span` attributes. Mobile mirrors it with `style` instead of
  `className`.
- No schema or API change.

## Testing

- Logic tests (gate on): `formatBadgeCount` in design-tokens; the web and
  mobile primitives' clamp, zero, and label behavior.
- Component tests already covering `Toolbar`, `NotificationBell`,
  `ShiftRequestBoard`, `AlertsInboxPage`, `ScrollableTabStrip`,
  `SegmentedControl`, `FilterSheet`, and `ScheduleScreen` must keep passing;
  update any that asserted `data-shape` or the old class names.
- Browser evidence: the Step 6 e2e spec plus screenshots per Step 3; mobile
  screenshot cells per Step 6. The mobile harness drops `style`, so shape is
  proven by screenshots there, not by unit tests.
- Commands: `npm run type-check`, `npm run test:web`, `npm run test:mobile`,
  `npm run lint`, `npm run build`, and `npx playwright test e2e/numeric-badges.spec.ts`.

## Notes for the AI

- Rebuild packages after Step 1 (`npm run build:packages`) before touching
  either app.
- Web: `NumericBadge` stays a server-safe component (no hooks). Use the
  existing `dg-tabular-nums` utility and semantic color tokens; no local hex.
- Mobile: never set `fontWeight` beside a text token; select weight through
  the token. Keep `mobile*` tokens and `mobileRadii.pill`.
- The mobile `CountBadge` in `features/dashboard/components` is a text label
  pill despite its name; do not fold it into the numeric primitive.
- Keep floating-badge offsets (`top`/`right`) at the call sites; the
  primitive owns the pill, not its placement.
- The schedule grid passes shift-category colors into the staffing badge; keep
  that path through `style` rather than inventing a tone per category.
- Bell badges (web `NotificationBell`, mobile `AlertsHeaderButton` and the
  schedule screen's alert dot) clamp at `9+` (`max={9}`); every other count
  clamps at the shared `99+` default. The user decided this on 2026-09-18.
- No em dashes in code, comments, or copy.
