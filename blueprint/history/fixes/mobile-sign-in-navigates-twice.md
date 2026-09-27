# Fix: Mobile sign-in navigates twice

**Type:** Fix
**Status:** verified

## The problem

A mobile sign-in leaves the form for a blank page, slides the tab screen in,
then slides Home in a second time before anything is drawn. Measured
2026-09-26 on the iPhone 17 simulator (iOS 26.0) against the local stack, three
sign-ins as the QA Super Admin in Calm Haven:

- The form disappears 0.4s after the tap and the page stays blank for 2.4 to
  2.8s, across two slide-in animations, before the dashboard skeleton.
- The built-in timing harness counts one login, one bootstrap and one presence
  request each time, so the double loading is navigation, not requests.

Causes, confirmed in code and in the recording:

1. **The session flip navigates before bootstrap.** auth-js 2.104.1
   `_setSession` fetches `/auth/v1/user`, then emits `SIGNED_IN` before it
   resolves (`GoTrueClient.js:2823-2836`). `AuthSessionProvider` commits the
   session at once, and two screens react to the new token before
   `finishLogin` has even started its bootstrap prefetch:
   - on the launch path, `app/index.tsx` stops rendering the form (`:51`) and
     its effect replaces to `/(tabs)/home` (`:30`);
   - on the `/login` route, `LoginScreen` renders `<Redirect>` (`:201`).
2. **`finishLogin` navigates again.** After the prefetch it calls
   `router.replace(postLoginDestination)` (`LoginScreen.tsx:238`). Home's stack
   is already showing `index`, so the replace builds a route with a new key and
   Home remounts with a second slide-in (expo-router 6.0.24 `linkTo`,
   `@react-navigation/routers` 7.x `REPLACE`).
3. **The prefetch never gated the navigation.** It was added in `874e1005` so
   "the tab tree never arrives without" bootstrap, but the flip in cause 1
   always happens first. The tests mock `useSessionState`, so the token never
   flips there and the early navigation never showed.

## The fix

The screen that submitted the credentials owns the navigation after a sign-in.
It keeps the form, with the button's pending state, on screen until bootstrap
is cached, then navigates once. Bootstrap no longer waits for `setSession`.

- A small sign-in handoff store in `apps/mobile/src/features/auth/lib/` marks a
  handoff pending, owned by the screen instance that began it, so another
  instance ending cannot clear someone else's handoff.
- `finishLogin` begins the handoff, starts the bootstrap prefetch with the
  token from the login response, and runs `setSession` alongside it. Once both
  settle it calls `router.replace` once. The handoff ends when the screen
  unmounts (the replace removes it) or on a failure, never straight after the
  replace, so no screen sees the token with the handoff already over and
  navigates again.
- While a handoff is pending, `LoginScreen` renders the form rather than
  `<Redirect>`, and the launch route renders the form rather than nothing and
  skips its own replace.
- If `setSession` fails, nothing navigates, the warmed bootstrap entry is
  removed, the handoff ends and the error shows as today.
- The warm-up is sent whatever the query library's online flag says. That
  flag can read offline after the device sleeps while requests still work,
  and a paused fetch never settles, so waiting on it held the form forever
  (seen on the simulator during Step 2); the request's own 15s timeout always
  settles it.

It must not break:

- **Warm restore:** the launch route still sends a restored session to Home.
- **Redirects:** `next` still routes a fresh sign-in to the protected route
  that asked, and a visitor who is already signed in and opens `/login` is
  still redirected.
- **Two-factor sign-in:** the pending session stays out of storage until the
  code verifies, and the sign-in completion record still precedes the handoff.
- **Failures:** a failed bootstrap warm-up still hands off (the tab gate
  reports it), and a stalled `setSession` still recovers through the existing
  deadline.
- **Presence and timing:** presence stays owned by `AuthSessionProvider` (one
  request), and the timing harness still marks one authenticated navigation.

Out of scope, recorded as follow-ups:

- The bootstrap refetch after a first sign-in from a new device: the server's
  new-device alert inserts a notification, which the account realtime channel
  turns into a bootstrap invalidation. The alert is inserted read and archived,
  so the refetch is invisible (81ms locally).
- All five tabs mounting and fetching their data at sign-in, which keeps the
  development build's JavaScript thread busy for about a second.
- `setSession`'s own `/auth/v1/user` request, which now runs beside bootstrap
  instead of before it but is not removed.
- The double presence request seen under heavy load in the 2026-09-26 Android
  rehearsal (the 15s client timeout and retry; see F-78).

## Build steps

- [x] **Step 1 - the sign-in screen owns one navigation.**
  - Add the handoff store with a unit test.
  - `finishLogin` runs the bootstrap prefetch and `setSession` together,
    then replaces once; the form stays through the session flip; failures end
    the handoff and navigate nowhere.
  - The submit button stays pending until the screen unmounts on success.
  - _Done when:_ `LoginScreen` tests show that bootstrap is requested before
    `setSession` resolves, that `router.replace` is called exactly once and
    only after both settle, that a session flip during the handoff renders no
    redirect and keeps the pending button, that a `setSession` error navigates
    nowhere and removes the warmed bootstrap entry, that a failed bootstrap
    still navigates once, and that the handoff completes while the query
    client believes it is offline; the existing two-factor and stall tests
    pass.
- [x] **Step 2 - the launch route defers to a pending handoff.**
  - `app/index.tsx` renders the form and skips its replace while a handoff
    is pending; warm restore is unchanged.
  - The iOS tab layout renders once more when its entrance transition ends.
    Created mid-slide, the native tab bar lays its labels out truncated
    ("Sc…") and keeps them; bootstrap arriving after the tabs mounted used to
    supply the render that re-laid them out, and after this fix it is warm.
    Found on the simulator during this step; Android's JS tab bar is not
    affected.
  - _Done when:_ `index-route` tests show the form (and no replace) for a
    session during a pending handoff, no replace from an unfocused launch
    route after the handoff ends, and the unchanged warm-restore replace; a
    tabs-layout test shows the entrance renders the tab bar again; a
    simulator recording of a sign-in from the launch route and one from
    `/login` each shows the form until one slide-in and Home's skeleton or
    content straight after, with the harness counting one login, one
    bootstrap and one presence request.

## Verify

- **Tests:** `npm run type-check`, `npm run test:mobile`, `npm run lint`.
- **Simulator:** repeat the 2026-09-26 capture (`web-perf` and
  `mobile-measure` in `.claude/launch.json`, a screen recording, ffmpeg scene
  frames) for both entry paths. Success is one slide-in, no blank page between
  the form and Home, and the harness's request counts unchanged at 1/1/1.

## Outcome

Completed 2026-09-27, verified on the iPhone 17 simulator (iOS 26.0) against
the local stack as the QA Super Admin in Calm Haven, from a worktree Metro.

| Measure                             | Before (3 sign-ins)                    | After (4 sign-ins)                 |
| ----------------------------------- | -------------------------------------- | ---------------------------------- |
| Navigations after one sign-in       | 2 (the session flip, then the replace) | 1                                  |
| Screen between the form and Home    | blank for 2.4 to 2.8s, two slide-ins   | the form, pending, under one slide |
| Harness `cold_sign_in`              | 1.90 to 2.82s                          | 1.22 to 1.53s                      |
| Requests (login/bootstrap/presence) | 1/1/1                                  | 1/1/1                              |

Two defects surfaced during Step 2 and were fixed in this work:

- A bootstrap warm-up paused by the query library's online flag, which read
  offline after the simulator sat idle while requests still worked, held the
  form forever; the warm-up now uses `networkMode: "always"`.
- Created mid-slide, the iOS native tab bar kept truncated labels; the tab
  layout now renders once more when its entrance ends.

Not verified: a physical iPhone or other iOS versions for the tab-bar render,
Android (no emulator), and the two-factor path beyond unit tests. The stale
online flag after sleep may affect other screens and is left for its own fix.
