# AppSwitch shows a faint border ring around the track when on

**Type:** Fix
**Status:** verified

## The problem

On iOS, `AppSwitch` showed a faint gray ring outlining the whole switch even
in its ON (brand blue) state — visible on "Push to this device" (Notifications)
and every other real toggle in the app, confirmed on an iOS simulator.

`ios_backgroundColor={mobileColors.border}` was added to stop the switch's OFF
state from defaulting to a light grey that misreads as "on" in dark mode. But
on iOS, `ios_backgroundColor` isn't only visible before the switch is toggled
on — UISwitch keeps a thin sliver of it visible around the whole control's
edge in every state, including ON. Because `mobileColors.border` is the app's
dedicated hairline/divider color (chosen to read clearly as a border
elsewhere), it stood out sharply against the brand-blue ON fill instead of
blending in, reading as an unintended outline around the control.

## The fix

Changed `ios_backgroundColor` from `mobileColors.border` to
`mobileColors.surface`. Dark-mode `surface` (`#121214`) is near-black, darker
than the old `border` (`#2E2E33`), so it still can't misread as "on"; in both
themes it matches the surrounding card background so the ring blends in
instead of outlining the control.

## Build steps

- [x] **Step 1 - Remove the visible ring without reintroducing the dark-mode
      OFF bug.** Changed `AppSwitch`'s `ios_backgroundColor` and recorded why in a
      code comment (the ring shows in every state, not just pre-on, which the old
      comment had gotten wrong).

## Verification

- Ground-truth simulator screenshots (`xcrun simctl io screenshot`, cropped
  with `sips` for pixel-level inspection): ON switch shows zero ring after the
  fix (before: a clear gray outline); OFF switch is a clean native-looking
  track with no double-border.
- Dark mode verified by token values rather than a live render (the simulator's
  system dark-mode toggle didn't propagate live to the running app this
  session): dark `surface` (`#121214`) is darker than the old `border`
  (`#2E2E33`), so it still can't read as "on."
- `npm run test:mobile` (full suite): 138 files, 1117 tests pass.
- `npx tsc --noEmit` (apps/mobile): clean.
