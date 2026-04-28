# Mobile App Agent Instructions

Scope: `apps/mobile`, package `@dubgrid/mobile`.

This app uses Expo SDK 54 with Expo Router. File-based routes live in
`apps/mobile/app`, and feature code lives under `apps/mobile/src`.

## Verified Commands

- Dev: `npm --workspace @dubgrid/mobile run dev`.
- LAN dev: `npm --workspace @dubgrid/mobile run lan`.
- Tunnel dev: `npm --workspace @dubgrid/mobile run phone`.
- Web dev: `npm --workspace @dubgrid/mobile run web`.
- Test: `npm --workspace @dubgrid/mobile run test`.
- Typecheck: `npm --workspace @dubgrid/mobile run type-check`.
- Root mobile plus contracts tests: `npm run test:mobile`.
- Native run commands: `npm --workspace @dubgrid/mobile run ios` and
  `npm --workspace @dubgrid/mobile run android`.

## Routing and Navigation Rules

- Follow the existing Expo Router setup in `apps/mobile/app`.
- Use existing route groups like `(auth)` and `(tabs)`.
- Preserve native stack/tab conventions already in route `_layout.tsx` files.
- Do not replace Expo Router with a new navigation architecture unless
  explicitly requested.

## Platform and API Rules

- Do not use browser-only APIs such as `window`, `document`, or `localStorage`
  in native runtime code unless guarded for web and covered by tests.
- Use Expo or React Native APIs for native behavior.
- Use `expo-secure-store` for native persisted secrets/session data; treat
  web-only storage as a platform-specific fallback.
- Guard platform-specific code with `Platform.OS` or existing helpers.
- Keep shared API payloads aligned with `@dubgrid/contracts` and
  `@dubgrid/api-client`.
- The mobile app reaches the backend through `EXPO_PUBLIC_API_BASE_URL`; do not
  hardcode environment-specific hosts in source.

## App Config and Secrets

- Treat `apps/mobile/app.json`, `metro.config.js`, `babel.config.js`,
  bundle IDs, package names, schemes, permissions, notification config,
  EAS/OTA settings, and native build settings as high risk.
- Verified app identifiers are `scheme: dubgridmobile`,
  iOS bundle ID `com.dubgrid.mobile`, and Android package
  `com.dubgrid.mobile`.
- `EXPO_PUBLIC_*` variables are bundled and visible to users. Never put secrets
  in Expo config, mobile env files, or client code.
- Do not print or inspect `apps/mobile/.env.local` unless explicitly necessary;
  use `apps/mobile/.env.example` for variable names.

## UI Rules

- Follow existing screen/component patterns in `apps/mobile/src/features` and
  `apps/mobile/src/shared`.
- Preserve accessibility labels, touch targets, loading/error states, and
  offline/network states.
- Prefer existing shared primitives before adding new components.
- Avoid layout changes outside the requested screen or component.

## Verification

- For mobile UI, navigation, or state changes, run
  `npm --workspace @dubgrid/mobile run test`.
- For TypeScript or shared-package changes, run
  `npm --workspace @dubgrid/mobile run type-check`.
- For mobile API contract changes, run `npm run test:mobile` and relevant web
  mobile API tests.
