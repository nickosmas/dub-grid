# Mobile App Agent Instructions

Scope: `apps/mobile`, package `@dubgrid/mobile`.

Expo SDK 54 with Expo Router. File-based routes in `apps/mobile/app`.
Feature code in `apps/mobile/src`.

## Verified Commands

- Dev: `npm --workspace @dubgrid/mobile run dev`
- LAN dev: `npm --workspace @dubgrid/mobile run lan`
- Tunnel dev: `npm --workspace @dubgrid/mobile run phone`
- Web dev: `npm --workspace @dubgrid/mobile run web`
- Test: `npm --workspace @dubgrid/mobile run test`
- Typecheck: `npm --workspace @dubgrid/mobile run type-check`
- iOS: `npm --workspace @dubgrid/mobile run ios`
- Android: `npm --workspace @dubgrid/mobile run android`
- Root mobile + contracts tests: `npm run test:mobile`

First-run state is device-local storage, not DB state, so `npm run db:reset`
never clears it: `hasSeenOnboarding` (`shared/lib/session.ts`) and the cookie
consent choice (`features/consent/lib/consent.ts`). After a local reset, either
long-press the wordmark on the login screen (`__DEV__`-only: clears both, routes
back to onboarding, and re-opens the consent sheet) or run
`npm run db:reset:mobile` from the repo root, which best-effort clears app
storage on a booted Android emulator via `adb`.

## Directory Map

```
apps/mobile/
  app/                              # Expo Router file-based routes
    _layout.tsx                     # Root layout (fonts, providers, auth, consent + terms gates, ErrorBoundary)
    index.tsx                       # Entry redirect
    +not-found.tsx                  # Unmatched-route fallback
    (auth)/
      login.tsx
      forgot-password.tsx           # Native reset request (was a web hand-off)
      reset-password.tsx            # Code entry + new password
      onboarding.tsx
    (tabs)/
      _layout.tsx  _layout.android.tsx  _layout.web.tsx
      home/  people/  profile/  requests/  team/
    alerts/
    shift/
  src/
    features/
      auth/                         # Auth flow, MobileRealtimeProvider
      consent/                      # ConsentGate + TermsGate
      notifications/
      onboarding/                   # Onboarding screens/components
      people/
      profile/
      schedule/
      shift-requests/
    shared/
      components/                   # Shared primitives (ConfigurationScreen, etc.)
      hooks/
      lib/                          # env.ts, query-client, error helpers
      motion/                       # useMotionPreference, usePressAnimation,
                                    #   AnimatedListItem, Collapsible
      navigation/
      providers/                    # AuthSessionProvider
      theme/                        # tokens.ts adapter + useElevation
```

## App Identifiers (High Risk)

- Scheme: `dubgridmobile`
- iOS bundle ID: `com.dubgrid.mobile`
- Android package: `com.dubgrid.mobile`
- `app.json`, `metro.config.js`, `babel.config.js`, EAS/OTA settings, native build
  config, and Expo scheme are all high-risk. Explain changes before applying.

## Deliberately Web-Only Feature Areas

Reports, billing/subscription management, the Gridmaster portal, the
permissions editor, and org-level settings panels (departments, jobs,
absence types, schedule rules, coverage, activity log) have no mobile
surface, front or backend, by design — these are admin/config-heavy
workflows that reasonably stay desktop-only. Don't treat their absence as
a gap to fill; confirm with the user before adding any of them to mobile.

## Password Reset (spans mobile + email templates)

Mobile resets in-app rather than opening the web page. The flow is
`resetPasswordForEmail` → a 6-digit code from the email → `verifyOtp({ type:
"recovery" })` → `updateUser` → `signOut({ scope: "global" })`. No deep link and
no `additional_redirect_urls` entry is involved.

- **Use `createEphemeralSupabaseClient()` for every call in this flow.**
  `verifyOtp` returns a real session; on the persistent client it lands in
  SecureStore, `AuthSessionProvider` picks it up, and `LoginScreen`'s
  `if (accessToken) return <Redirect href="/(tabs)/home" />` drops the user into
  the tab tree mid-reset with no organization session. `ResetPasswordScreen.test.tsx`
  asserts `getSupabaseClient` is never called — keep that guard.
- The code comes from `{{ .Token }}` in `supabase/templates/recovery.html`,
  generated from `apps/web/src/emails/auth/RecoveryEmail.tsx` via
  `npm --workspace @dubgrid/web run email:build`. The template keeps
  `{{ .ConfirmationURL }}` too, because web still follows the link.
- **Changing that template requires updating remote Supabase's template in the
  dashboard**; `supabase/templates/*.html` is local config only.
- The request step advances even when the address has no account
  (anti-enumeration). Only rate limiting and network failures surface inline.
- **Strength rules and match checking live in `@dubgrid/domain`
  (`packages/domain/src/password.ts`), not per-app.** Web and mobile previously
  enforced different bars from byte-duplicated rule sets. Use
  `isPasswordAcceptable` and `getPasswordMismatchError`; the latter returns null
  while the confirmation is empty, so the warning appears as the user diverges
  rather than on submit.

## Gates and Boundaries

Three things wrap the authed app in `app/_layout.tsx`, in this order:

- **`ConsentGate`** — cookie/analytics consent. Keep `CONSENT_VERSION` in
  lockstep with web's `CookieConsent.tsx`.
- **`TermsGate`** — blocks until the user has accepted `CURRENT_TERMS_VERSION`
  (`@dubgrid/domain`). Web enforces this by redirecting to `/accept-terms` at
  login; mobile signs in through its own endpoint, so it gates in-place off the
  `acceptedCurrentTerms` flag in bootstrap. That flag defaults to `true` so a
  stale server response can never lock anyone out. The sheet covers the whole
  app, so it must always offer **Sign out** alongside Accept — declining has to
  be possible, and there is no screen underneath to escape to.
- **`ErrorBoundary`** — exported from `app/_layout.tsx` and from
  `app/(tabs)/_layout.tsx`, both rendering `RouteErrorScreen`. Without these a
  single render throw takes the whole app down. There is no crash-reporting SDK
  on mobile.

`useTabsGate` is the only auth guard, and it wraps `(tabs)` only. The web tab
layout (`_layout.web.tsx`) must call it rather than re-deriving the rules —
a second copy silently drifted once.

Sign-out must revoke this device's push token **before** dropping the session
(`disablePushForCurrentDevice` in `shared/lib/auth-reset.ts`), or the phone
keeps receiving the previous user's notifications.

## Platform Rules

- Do not use browser-only APIs (`window`, `document`, `localStorage`) in native
  runtime code unless guarded with `Platform.OS` and covered by tests.
- Use Expo or React Native APIs for native behavior.
- Use `expo-secure-store` for native persisted secrets/session data.
- Open DubGrid web pages (policies, billing) with `openInAppBrowser`
  (`shared/lib/inAppBrowser.ts`), not `Linking.openURL` — reading a policy
  should not evict the user from the app. `Linking` stays for `tel:`/`mailto:`
  and anything genuinely meant to hand off to another app.
- Guard platform-specific code with `Platform.OS` or existing helpers.
- Never set `fontFamily` on `<TextInput>` unless the font is guaranteed loaded —
  an unknown family makes Android `EditText` non-interactive.

## API and Contract Rules

- Backend reached via `EXPO_PUBLIC_API_BASE_URL`. Never hardcode environment hosts.
- Keep request/response payloads aligned with `@dubgrid/contracts` and
  `@dubgrid/api-client`.
- When mobile API contract changes, run `npm run test:mobile` AND check web mobile routes.

## Secrets

- `EXPO_PUBLIC_*` is bundled and user-visible. Never put secrets there.
- Use `apps/mobile/.env.example` for variable names only.
- Do not read or print `apps/mobile/.env.local`.

## Design System

Tokens live in `packages/design-tokens` with a `mobile*` prefix and are
re-exported through `src/shared/theme/tokens.ts`. That adapter is the only
import path screens should use. **The package is shared with `apps/web`** — add
`mobile*`-prefixed groups rather than changing existing tokens.

### Reach for these before inventing anything

| Need                        | Use                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Any text                    | `<AppText variant tone>` — carries a theme-correct color by default                         |
| Any button                  | `<Button>` — solid fill, no border, pill, sizes `sm`/`md`/`lg`, `iconOnly`                  |
| A pressable list row        | `<PressableRow>` — background highlight on iOS, ripple on Android                           |
| A scrolling tab strip       | `<ScrollableTabStrip>` — pill tabs, optional count badges, scrolls the active tab into view |
| A pressable that is neither | `usePressAnimation()`                                                                       |
| Status/metadata/filter pill | `<Chip>`                                                                                    |
| Segmented toggle            | `<SegmentedControl>`                                                                        |
| Shadow                      | `mobileElevation(level, isDark)` or `useElevation(level)`                                   |
| Duration / spring / easing  | `useMotionPreference()` — never a raw number                                                |
| Soft brand wash             | `<GradientBackdrop kind>`                                                                   |
| List entrance               | `<AnimatedListItem index>`                                                                  |
| Show/hide a block           | `<Collapsible open>`                                                                        |
| Bottom sheet                | `<BottomSheetModal>` (`dismissDisabled` for blocking gates)                                 |
| Auth screen frame           | `<AuthShell>` + `<AuthField>`                                                               |
| Loading placeholder         | a `*Skeleton` colocated with the screen, built on `shared/components/skeleton`              |
| Which state a screen is in  | `useMobileContentState({ hasData, isLoading, error, isEmpty })`                             |

### Skeletons

Primitives live in `src/shared/components/skeleton`: `SkeletonBlock`,
`SkeletonCircle`, `SkeletonIcon`, `SkeletonLine`, `SkeletonPill`,
`SkeletonCardSurface`, `SkeletonGroup`. Compositions are per screen, colocated
in that feature's `components/` folder. Three rules:

- **A skeleton reuses the real screen's own styles**, not a copy of its numbers
  (`ScheduleMeSkeleton` imports `scheduleScreenStyles`, `SkeletonCardSurface`
  shares `getCardSurfaceStyle` with `Card`). A copy drifts the first time a
  padding changes and nothing catches it. Use `SkeletonLine variant="body"`
  rather than a hardcoded height: it sizes the bar from the typography token
  and reserves the token's full line height, so no swap shifts the layout.
- **One skeleton per screen, shown once.** Every query the first paint needs
  folds into that screen's single `contentState` — including its `hasData`, or
  the gate clears while a folded query is still in flight. A nested skeleton
  inside a section is always wrong: it paints a second wave _after_ the page
  skeleton has already gone. A parent that picks between two screens must not
  guess while it is still loading either: `app/(tabs)/home/index.tsx` used to
  fall through to the personal schedule until bootstrap named the role, so an
  admin got that screen's skeleton and then the dashboard's.
- **Whatever appears in `isLoading` must appear in `hasData` too.** They are
  the two halves of one question, and the gate leaves `loading` as soon as
  _either_ says it can. A query in only `isLoading` clears the skeleton with
  its own data still missing, and whatever the screen derives from it renders
  wrong for a frame — `PersonDetailScreen` flashed "Person not found" this way,
  because the person is gated on a bootstrap permission.
- **Nothing the render branches on may be synced in an effect.** Effects run
  after the paint, so an effect-derived value is one frame behind the data it
  mirrors, and the branch above it paints the wrong state first. Derive during
  render, or adjust state during render with the stored-previous-value pattern
  (`PersonDetailScreen`'s edit draft). This is the React rule in the root
  `CLAUDE.md`, and a terminal state flashing before content is what breaking it
  looks like.
- **Never branch on a raw `isLoading`.** Go through `useMobileContentState`
  and render on `showSkeleton` (or `useSkeletonGate` where there is no error or
  empty state to model). Its `hasData` means "the query resolved"; pass
  `isEmpty` separately on any screen whose query key carries a search or filter.

Animation is one app-wide clock (`useSkeletonWave`, a module-level
`makeMutable`) driving a single band of light across the window, so every block
sweeps in phase. It is off entirely under reduce motion.

### Rules

- **Buttons and chips are solid, borderless and pill-shaped.** Every tone. Do
  not add `borderWidth` back.
- **Soft control fills come from `controlNeutralBg` / `controlSecondaryBg`,
  not `surfaceSecondary` / `brandSoft`.** The shared tokens measure ~1.04:1
  against the page, which is not a perceivable edge for a borderless control.
  `controlSecondaryFg` pairs with the secondary fill: the standard `brand` blue
  on it measures 4.02:1 and fails AA. `src/shared/theme/contrast.test.ts` pins
  all of this.
- **`iconOnly` buttons must not carry vertical padding.** The fixed width/height
  is the box; padding on top of it squeezes the content below the glyph's line
  height and `overflow: "hidden"` clips it.
- **`fullWidth` defaults to true for text buttons.** A button inside a row that
  positions with `alignItems` needs `fullWidth={false}`, because
  `alignSelf: "stretch"` on the child wins.
- **Cards are borderless in light mode with `mobileElevation("card")`, and keep
  the hairline `borderSubtle` in dark mode** — a shadow is invisible against a
  near-black page, so the edge is what separates card from background.
- **Never override `fontWeight` on a `mobileText` token.** Each token names a
  specific DM Sans family file, so changing only the weight leaves family and
  weight disagreeing: iOS honors the family, Android may synthesize a fake
  weight. Use `mobileTextWeighted(variant, weight)`, which moves both.
- **Route every duration through `useMotionPreference().d()`.** It returns 0
  when the OS reduce-motion setting is on, which is what makes that setting
  apply app-wide from one place.
- **Call `d`/`spring`/`timing` during render, never inside a worklet.** They are
  plain functions, and Reanimated serializes a captured non-worklet function as
  a remote-function _object_ — so `useAnimatedStyle(() => ({ opacity:
withTiming(1, timing("emphasized", 200)) }))` throws `timing is not a function
(it is Object)` on the UI thread and takes the whole app down. Resolve the
  config first (`useMemo`, since it returns a fresh object) and let the worklet
  close over the value. The unit tests cannot catch this: the harness stubs
  Reanimated, so worklets run as ordinary JS and the call succeeds.
- **iOS scales on press; Android does not.** Material's ripple _is_ the state
  layer, and scaling on top of it reads as a rendering bug. `usePressAnimation`
  already handles this — don't add a scale on Android.
- **There is no SVG or blur dependency, deliberately.** `react-native-svg` is a
  native module whose `src/utils/fetchData.ts` imports `buffer` without
  declaring it, so Metro fails to resolve it; `expo-blur` is iOS-only anyway
  (Android's `dimezisBlurView` snapshots and blurs every frame and janks on
  mid-range devices). Vector art is built from views plus
  `expo-linear-gradient`; frosted surfaces use `surface` + elevation. Adding
  either back means a dev-client rebuild, and `react-native-svg` also needs
  `buffer` installed explicitly.
- **Android `elevation` needs an opaque background** and reorders sibling z
  order. Never apply a level to a transparent wrapper.
- Style factories that use elevation take `(mobileColors, isDark)`; keep the
  `createStyles` + `useMemo` idiom.
- **Never put `flex: 1` on a child of an auto-width row** (`alignSelf:
"flex-start"` / `"center"`). Yoga collapses it to zero width and the control
  renders empty. Measure with `onLayout` instead — that is what
  `SegmentedControl` and `ScrollableTabStrip` do, and both had to be fixed after
  shipping this exact bug.

## UI Rules

- Follow existing screen/component patterns in `src/features` and `src/shared`.
- Preserve accessibility labels, touch targets (minimum 44pt), loading/error states,
  and offline/network handling.
- Use existing shared primitives before adding new components.
- Avoid layout changes outside the requested screen or component.

## Test Harness Gotchas

- **Native modules are aliased to shims in `vitest.config.mts`**, not mocked per
  test. A new native dependency needs a shim there or every file that
  transitively imports it fails to collect.
- **`src/test/reanimated-stub.tsx` is an allowlist.** A Reanimated API it does
  not export is `undefined` at import time in every test that reaches it. Add
  the export before using the API.
- **`src/test/native.tsx` is a partial react-native emulation** that most screen
  tests swap in via `vi.mock("react-native", …)`. Vitest's mock proxy _throws_ on
  accessing an export it lacks, so only wrap primitives that module also
  provides.
- **The `style` prop is dropped before reaching the DOM.** Styles are not
  assertable, which makes visual change cheap but means style logic worth
  pinning has to be extracted as a pure function (see `getTextToneColors`).
- **`npm test` does not rebuild `packages/`.** Run `npm run build:packages` from
  the repo root after any token change or you will chase phantom failures.

## Verification

- UI, navigation, or state changes: `npm --workspace @dubgrid/mobile run test`.
- TypeScript or shared-package changes: `npm --workspace @dubgrid/mobile run type-check`.
- Mobile API contract changes: `npm run test:mobile` + relevant web mobile API tests.
