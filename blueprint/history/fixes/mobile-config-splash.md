# Mobile hangs on the launch splash when its configuration is invalid

**Type:** Fix
**Status:** verified

## The problem

When `validateMobileEnv` (`apps/mobile/src/shared/lib/env.ts`) rejects the
build's configuration, the app stays on the native launch splash forever. The
`ConfigurationScreen` that explains the problem renders underneath it and is
never seen.

`apps/mobile/app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` at
module load. On a valid configuration `StartupSplashGate` calls
`SplashScreen.hideAsync()` when it mounts. On an invalid one,
`RootLayoutContent` renders `ConfigurationScreen` in place of the providers, so
the gate never mounts and nothing releases the native splash. The root
`ErrorBoundary` hides it itself; the configuration path does not.

Found on 2026-10-21 while pointing a simulator at a throwaway local stack with
an `sb_publishable_` key, which `isHostedSupabaseKey` treats as a hosted key
against a local URL.

## The fix

`ConfigurationScreen` releases the native splash when it mounts, as the gate
does on the normal path. It is the only thing on screen in that case, so the
screen that is shown owns the hide.

Must not change:

- the env rules in `env.ts` (deliberate)
- the valid path: `StartupSplashGate` stays the only splash owner there
- the ordering: fonts and the stored theme still load before anything shows

## Build steps

1. [x] Hide the native splash from `ConfigurationScreen` on mount, and cover it
       in `RootLayout.test.tsx`.
       **Done when:** the invalid-env test asserts `SplashScreen.hideAsync` was
       called and fails without the change; the valid-env tests still pass.

## Verify

- `npm run test:mobile`, `npm run type-check`, `npm run lint` pass.
- On an iOS simulator, with `apps/mobile/.env.local` pointing at a local
  Supabase URL and an `sb_publishable_` key, the app opens on "Mobile
  configuration needs attention" instead of the launch image.

## Evidence (2026-10-21)

- The invalid-env test in `RootLayout.test.tsx` fails without the change
  (`hideAsync` called 0 times) and passes with it.
- `npm run test:mobile`: 175 files, 1502 tests pass. Mobile `type-check` and
  `eslint` on both changed files pass.
- iPhone 16 Pro Max simulator (iOS 18.6) on a worktree Metro, with a local URL
  and an `sb_publishable_` key: without the change it stays on the launch
  image; with it, "Mobile configuration needs attention" shows with "Sign-in
  access - This build mixes local and hosted services."
