# Fix: Mobile online flag can stay offline

**Type:** Fix
**Status:** verified

## The problem

On 2026-09-27 the iOS simulator app sat with React Query's `onlineManager` at
offline while requests still worked, after several idle hours. Queries in the
default `online` network mode paused before sending, so screens waited forever;
only a relaunch recovered. (The sign-in warm-up was made immune in
`mobile-sign-in-navigates-twice`, but every other query is still exposed.)

What `/debug` established:

- **Confirmed:** `NetworkStateProvider` is the only `expo-network` subscriber
  and removes its listener on unmount. expo-network 8.0.8 then cancels its one
  `NWPathMonitor` (`OnStopObserving` → `monitor.cancel()`) and, when a listener
  returns, calls `start()` on that same cancelled monitor. A restarted
  cancelled monitor never reports again (reproduced with a standalone Swift
  script on macOS's Network framework). So any remount of the provider (a
  development hot reload, or the root error boundary's retry) leaves the app
  deaf to network changes for the rest of the process.
- **Likely, unproven:** the provider changes the flag only on events and never
  re-reads the state on foreground, so once the flag is wrong nothing corrects
  it. Two routes to "stuck offline" fit: an offline event whose online event
  never arrives, or the mount-time probe reading offline (it does when the
  native path lookup exceeds 5 seconds) on a monitor that is already dead.

## The fix

- Subscribe to expo-network once per process from a small module in
  `apps/mobile/src/shared/lib/`, and never remove that subscription.
  `NetworkStateProvider` listens to the module instead, so a remount adds and
  removes only a JS listener and the native monitor is never cancelled.
- Re-read the network state (`getNetworkStateAsync`) whenever the app becomes
  active while the flag reads offline, and apply an online reading through the
  same path as events (including the stability delay), so a wrong offline flag
  corrects itself on the next foreground. An offline reading is not applied:
  the native probe also reads offline when it times out, and a wrong online
  flag corrects itself through failing requests and events.

It must not break:

- the provider's existing behavior: the 2s probe budget that lets the splash
  lift, the 1.5s reconnect stability delay, `focusManager` and Supabase
  auto-refresh wiring on AppState, and `useNetworkStatus` for the toast
  provider;
- web, where `Platform.OS === "web"` skips the AppState work today.

Out of scope: switching the flag online when a request succeeds while it reads
offline, patching expo-network itself, and Android-specific verification
beyond the shared code path.

## Build steps

- [x] **Step 1 - one lifetime subscription and a foreground re-check.**
  - Add the shared subscription module with a unit test.
  - `NetworkStateProvider` uses it and re-probes on becoming active.
  - _Done when:_ tests show that mounting, unmounting and remounting the
    provider subscribes to expo-network exactly once and never removes it;
    that a provider mounted after a remount still receives network events;
    and that an app-active transition re-reads the state and restores online
    after the flag read offline (through the stability delay) but never takes
    an online app offline, with the existing `NetworkStateProvider` tests still passing.

## Verify

- **Tests:** `npm run type-check`, `npm run test:mobile`, `npm run lint`.
- **Simulator:** on a worktree Metro, force a remount with a hot reload, then
  set `onlineManager` offline through the Hermes inspector and send the app to
  the background and back; the inspector should read `online: true` again.

## Outcome

Completed 2026-09-27.

- `subscribeToNetworkState` (`apps/mobile/src/shared/lib/network-state-source.ts`)
  holds one expo-network subscription for the life of the process;
  `NetworkStateProvider` listens through it, so a remount no longer cancels
  the native monitor.
- On becoming active, the provider re-reads the network whenever React
  Query's `onlineManager` reads offline and applies an online reading through
  the stability delay. It keys on `onlineManager` rather than its own record,
  which the simulator check showed to be necessary: with the flag forced
  offline behind the provider's back, the first version stayed offline after a
  foreground and the final one recovered.
- Simulator (iPhone 17, iOS 26.0, worktree Metro): after a hot reload
  remounted the provider, `onlineManager.setOnline(false)` through the Hermes
  inspector, then Settings and back to the app, read `online: true`.

Not verified: the original stuck state after hours idle (needs the Mac to
sleep), Android, and whether expo-network behaves the same inside the iOS
runtime as the Swift reproduction did on macOS.
