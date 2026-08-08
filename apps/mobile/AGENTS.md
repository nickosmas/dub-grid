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
      navigation/
      providers/                    # AuthSessionProvider
      theme/
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

## UI Rules

- Follow existing screen/component patterns in `src/features` and `src/shared`.
- Preserve accessibility labels, touch targets (minimum 44pt), loading/error states,
  and offline/network handling.
- Use existing shared primitives before adding new components.
- Avoid layout changes outside the requested screen or component.

## Verification

- UI, navigation, or state changes: `npm --workspace @dubgrid/mobile run test`.
- TypeScript or shared-package changes: `npm --workspace @dubgrid/mobile run type-check`.
- Mobile API contract changes: `npm run test:mobile` + relevant web mobile API tests.
