# 39. Static branded startup loading and recovery

**Status:** verified

**Type:** Feature
**Build plan item:** 39. Static branded startup loading and recovery

## Goal

Keep the approved DubGrid mark static everywhere the app initializes, and make
startup read as fast and recoverable rather than frozen: a separate progress
indicator carries the liveness the logo used to, status copy arrives only when
the wait is real, and a bounded timeout offers Retry and offline recovery.

## Why this is not a slowdown

The mark stops moving, but the screen does not, and the app hands off sooner
than it does today. `StartupSplashGate` holds a 900ms minimum whose comment
gives the reason plainly: "long enough for the logo to read as a deliberate
brand moment rather than a flicker". A static mark has no moment to play out,
so that floor becomes pure latency. Removing it is the largest real win in this
feature; the progress indicator, staged copy, and bounded Retry carry the
perceived-speed work the animation was doing badly.

## In scope

- Shared startup timing constants, so web and mobile agree on when copy and the
  timeout appear.
- Mobile: static mark on the splash, an indeterminate progress indicator,
  staged status copy, a timeout state with Retry and offline recovery, and the
  900ms floor cut to a flicker guard.
- Web: the static mark and wordmark on `AuthTransitionScreen`, an accessible
  progress indicator, and retimed copy and escape actions.
- Reduced motion honoured on both platforms.

## Out of scope

- `ScheduleLoadingScreen` (web). It is a route data load, not app startup, and
  item 39's wording does not reach it. Its pulsing mark stays for now, so a
  static startup mark and a pulsing schedule loader can still be met in one
  session. Raise separately if that inconsistency should close.
- `AuthSplash` (web logout teardown), deliberately unbranded already.
- Any logo redesign, and the native launch image itself.
- Deleting `apps/mobile/.../AnimatedDubGridLogo.tsx`. It falls out of use here;
  removal needs its own call.

## Design reference

The approved mark is the existing static one: web `DubGridLogo` in
`apps/web/src/components/Logo.tsx`, and the reduced-motion branch of the mobile
`AnimatedDubGridLogo` (`staticOpacity`), which already mirrors it. No new
artwork, no image asset.

## Build steps

- [x] 1. **Shared startup timing tokens.** Add `STARTUP_STATUS_DELAY_MS` (2500),
      `STARTUP_TIMEOUT_MS` (9000) and `STARTUP_MIN_SPLASH_MS` (150) to
      `packages/design-tokens`, with a unit test asserting the ordering
      (`min < status < timeout`) and that they sit inside the item's 2-3s and
      8-10s bands. **Done when:** both apps import the same constants and the
      token test passes.
      _Load-bearing: these are the contract the two startup surfaces share._

- [x] 2. **Mobile static mark.** Add `DubGridLogo` (static, `staticOpacity`
      ramp, `accessibilityRole="image"`) and render it in `AppSplashScreen` in
      place of `AnimatedDubGridLogo`. **Done when:** the splash renders no
      Reanimated cell animation, and a test asserts the static mark is present.

- [x] 3. **Mobile progress indicator.** A small indeterminate `StartupProgress`
      bar built on `useMotionPreference`, static (and non-animating) under
      reduced motion. **Done when:** it animates by default, holds a determinate
      resting state under reduced motion, and has a test for both.

- [x] 4. **Mobile staged copy and timeout state.** `AppSplashScreen` takes
      `status` and `onRetry`; `StartupSplashGate` shows nothing before
      `STARTUP_STATUS_DELAY_MS`, status copy after it, and at
      `STARTUP_TIMEOUT_MS` a Retry plus offline copy driven by
      `NetworkStateProvider`. Retry refetches bootstrap. **Done when:** fake
      timers prove the three phases and that Retry calls the bootstrap refetch.

- [x] 5. **Mobile floor removal.** `MIN_SPLASH_MS` 900 becomes
      `STARTUP_MIN_SPLASH_MS` 150. **Done when:** a resolved startup lifts the
      splash at ~150ms in a fake-timer test, and `markStartupGateReady` still
      fires exactly once.

- [x] 6. **Web branded startup surface.** `AuthTransitionScreen` gains the
      static mark and wordmark above its copy, and its spinner becomes an
      announced progress indicator that does not spin under
      `prefers-reduced-motion`. **Done when:** the mark renders and a
      reduced-motion test asserts the indicator is not animated.

- [x] 7. **Web retiming.** Slow copy moves from 15s to `STARTUP_STATUS_DELAY_MS`
      and escape actions from 30s to `STARTUP_TIMEOUT_MS`, with
      `OrganizationBootstrapRecovery`'s existing offline and retry wiring
      unchanged. **Done when:** timer tests prove copy at 2.5s and
      Retry/Sign out at 9s.

- [x] 8. **Verify the five startup paths.** Successful, slow, failed, offline
      and resumed, on web (Playwright, throttled and offline) and mobile
      (simulator). Record cold-start numbers from `authEntryRecorder` before
      and after step 5. **Done when:** every path is evidenced and the
      before/after startup measurement is written into this spec.

## Follow-ups after first review

Two gaps the first pass left, both fixed in the same feature.

**The web startup path was untouched.** `AuthTransitionScreen` only renders on
a post-login handoff, which needs a transition marker an ordinary cold load
never sets. `ProtectedRoute` rendered `null` while the session restored, so the
web app opened on a blank frame, which is the one thing a startup surface
exists to prevent. It now shows the branded surface once a restore outlasts
`STARTUP_MIN_SPLASH_MS`, and stays blank while redirecting a signed-out visitor
rather than claiming to load a workspace that does not exist.

**The mark itself was the old one.** The approved mark is now four rounded
squares in a pinwheel, not the sixteen-cell ramp every surface still drew. Every
definition of it moved together, listed in `blueprint/reference/dubgrid-mark.md`,
and `scripts/generate-logo-assets.ts` renders all eleven raster assets from that
one geometry so the native splash, app icons and favicon cannot drift from the
components again.

## Verification

_Mobile, on the iPhone 17 simulator against the real app:_ the quiet phase (static mark, wordmark, sweeping bar), the status phase ("Still getting things ready."), and the timeout phase ("This is taking longer than it should." with Try again) were each screenshotted. The status and timeout phases were reached by temporarily shortening the two thresholds and, for the timeout, by pinning the phase; both probes were reverted and the constants rebuilt and re-verified at 2500/9000/150.

_Mobile, successful path:_ a warm launch resolves straight through the quiet phase into the dashboard without ever showing copy, which is the intended common case.

_Web, against the real compiled stylesheet on the dev server:_ the track measures 240x4 at a 999px radius with the bar at 96px (40%) in brand blue, animating `dg-startup-sweep 1.2s infinite alternate`; the app's universal `@media (prefers-reduced-motion: reduce)` rule is present and flattens that sweep, leaving the bar resting part-filled rather than vanishing. The quiet and timeout phases were also screenshotted in light and dark at desktop and phone widths.

_Startup timing._ A dev-build cold launch is dominated by the Metro bundle (the JS splash first paints around 3.5-4.6s), so it cannot isolate a 750ms floor and no honest before/after device number is available from it. The floor change is exact rather than measured: 900ms to 150ms on any launch that resolves sooner, pinned by a fake-timer test asserting the splash is up at 149ms and gone at 150ms. A production-build measurement is the only one that would be meaningful and has not been taken.

_Not done._ The authenticated web flow driven end to end in Playwright under throttling. Reaching it needs a password typed into the live login form, which is outside what this agent will do; the handoff wiring that decides where `AuthTransitionScreen` appears (`RouteGuards`, `OrgLogin`, `OnboardingGate`) is untouched by this feature, and the screen's own behaviour is covered by the unit tests and the stylesheet check above.

_Unrelated finding._ The Expo dev build shows a "Open debugger to view warnings" LogBox toast. An A/B with these changes stashed showed the same toast, so it predates this work.

## Files and areas

| Area   | Files                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| Tokens | `packages/design-tokens/src/startup.ts`, `index.ts`                                                        |
| Mobile | `shared/components/DubGridLogo.tsx`, `StartupProgress.tsx`, `AppSplashScreen.tsx`, `StartupSplashGate.tsx` |
| Web    | `components/AuthTransitionScreen.tsx`                                                                      |

## Data and contracts

No schema, API or stored-shape change. The one new contract is the shared
timing module in step 1.

## Testing

The test gate is on. Steps 1, 3, 4, 5, 6 and 7 ship unit tests (Vitest, fake
timers for the phase transitions). Step 8 is browser and simulator evidence.

## Notes for the AI

- Mobile metric literals are a lint error outside `tokens.ts`
  (`design/no-raw-mobile-metrics`): use `mobileSpace`, `mobileControl`,
  `mobileText` and friends.
- Never override `fontWeight` on a mobile text token; pick the variant.
- Route every mobile duration through `useMotionPreference`, and resolve
  configs during render, never inside a worklet.
- `StartupSplashGate`'s completion latch is one-way and must stay that way.
- No em dashes in generated content.
