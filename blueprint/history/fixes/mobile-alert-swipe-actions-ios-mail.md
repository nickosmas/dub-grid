# Current Feature

**Title:** Mobile alert swipe actions in the iOS Mail idiom

**Type:** Fix

**Status:** verified

## The problem

Swiping an alert row left in the mobile app reveals two full-height
rectangular blocks (a brand-blue "Unread" and a gray "Archive") glued to the
row's edge (`apps/mobile/src/features/notifications/components/NotificationRow.tsx`,
`renderRightActions` and the `actions` / `action` styles). iOS Mail, which the
list otherwise imitates, treats the swiped row as a rounded card sliding away
from the edge and shows each action as a round button with its label beneath,
sitting on the page background. The user wants that treatment.

## The fix

Keep `ReanimatedSwipeable`, the two actions, the shared open-row registry, and
the accessibility labels. Change only how the reveal looks:

- The row content becomes a card as it moves: an `Animated.View` wrapper whose
  corner radius grows to `mobileRadii.card` and whose fill goes from the row's
  resting color (page background, or `brandSoft` for an unread row) to
  `surfaceSecondary` as the swipe `progress` goes 0 to 1. The wrapper owns the
  row background from now on; `PressableRow` keeps only its pressed highlight,
  clipped by the wrapper's radius.
- Each action is a `mobileControl.lg` circle (`mobileRadii.pill`) holding its
  icon, with the label below in `mobileText.label` on `textSecondary`. Read /
  Unread keeps the brand fill with `onBrandText`; Archive / Restore keeps
  `controlNeutralBg` with `textPrimary`. The circles scale and fade in with the
  swipe so they arrive rather than sit there.
- The actions sit on the page background with even spacing; the reveal width
  is two 72pt slots plus the leading gap, and the open threshold stays half a
  slot.
- `progress` reaches the card through a `useAnimatedReaction` inside the
  actions component copying it into a shared value the wrapper reads, since
  the library only hands `progress` to `renderRightActions`. All worklet math
  is `interpolate` / `interpolateColor`, no captured JS functions.

Must not break: `NotificationsScreen.test.tsx` (presses the swipe actions
through the vitest stub, which renders `renderRightActions` with no arguments,
so the actions component must tolerate a missing `progress`), the one-open-row
registry, and text scaling (labels keep `MAX_FONT_SCALE`).

## Build steps

- [x] **Step 1 - Card reveal and round actions.** Rewrite the reveal in
      `NotificationRow.tsx` as described; no other files change except the
      recaptured `alerts-swipe-ios-light-default-admin` cell, a new
      `alerts-swipe-ios-dark-ax-admin` cell, and their README rows. _Done when:_
      `npm run test:mobile` and `npm run type-check` pass; on the simulator a
      left swipe shows the row as a rounded card sliding left with two round,
      labeled buttons on the page background in light/default and
      dark/accessibility-extra-large; tapping Read or Archive still acts and
      closes the row.

## Verify

- `npm run type-check`, `npm run test:mobile`, `npm run lint`
- Simulator: Alerts screen, swipe a row left, compare with iOS Mail; tap each
  action; open a second row and confirm the first closes.
