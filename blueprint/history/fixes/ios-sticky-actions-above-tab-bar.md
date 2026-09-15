# Keep iOS sticky actions above the tab bar

**Type:** Fix
**Status:** verified

## The problem

On iOS, sticky bottom action buttons were obscured by the native tab bar on some
pages. `Screen` rendered its persistent footer as a sibling below the scroll
view, so the scroll view's automatic native tab-bar inset could not protect that
footer. The shared footer calculation assumed an iOS tab bar was already
represented by `useSafeAreaInsets().bottom`, while nested People, Profile, and
Schedule routes also used a mix of `tabbed` and `stack` padding modes. The
result depended on route shape instead of whether a tab bar was actually
visible.

## The fix

Gave `Screen` one explicit shared contract for whether a persistent bottom bar
is present: a new `NativeTabBarPresenceProvider` wraps the `(tabs)` native-tab
tree and reports `true` only there, `false` everywhere else (root-level pushed
routes such as `/person/[id]` and `/shift/[employeeId]`, where the tab bar is
genuinely gone). `getFooterBottomPadding` in `screen-layout.ts` uses that signal:
when an iOS native tab bar is visible, a sticky footer clears the tab bar's
occupied height, the device safe area, and normal breathing room; when hidden,
stack and modal screens retain only their home-indicator clearance. Android's
existing floating-tab-bar calculation is unchanged.

## Build steps

- [x] **Step 1 - Correct shared sticky-footer clearance and affected callers.**
      Added `useNativeTabBarPresence()` and threaded it through `Screen` and
      `getFooterBottomPadding`; added regression coverage for iOS tab-visible
      vs. tab-hidden footer clearance and the existing Android behavior; audited
      every `Screen` footer caller against its actual route nesting.

## Verification

- `screen-layout.test.ts` + `Screen.test.tsx` (focused): 25/25 pass.
- `npm run test:mobile` (full suite): 138 files, 1117 tests pass.
- `npx tsc --noEmit` (apps/mobile): clean.
- Caller audit: `AddPersonScreen`, `ProfilePasswordScreen`, `ProfileWorkScreen`
  (pushed inside `(tabs)` stacks, tab bar visible) use `bottomPaddingMode="tabbed"`;
  `PersonDetailScreen` (`/person/[id]`) and `ShiftDetailScreen`
  (`/shift/[employeeId]`, both root-level, tab bar hidden) use
  `bottomPaddingMode="stack"`. Consent/app-lock/auth footers go through
  `BottomSheetModal` or `AuthShell`, not `Screen`, and never have a tab bar to
  clear.
- Manual simulator pass (Add person, Person details/edit, Profile work, Change
  password, shift-detail; tab-visible and tab-hidden; keyboard open/closed;
  normal and enlarged text) was not run in this session — outstanding.
