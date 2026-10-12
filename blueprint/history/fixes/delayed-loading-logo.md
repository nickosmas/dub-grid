# Fix: Show the schedule loading logo only when loading is slow

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-12

### The problem

`ScheduleLoadingScreen` shows the Shuffle logo the moment the schedule starts
loading. The schedule usually loads fast enough that the animation only
flashes for a moment. The owner wants it shown only when loading is actually
slow (2026-10-12).

### The fix

The standard approach: hold any loading indicator back for a short grace
period, and show it only if the wait outlasts it.

- **New `DelayedReveal`:** renders its children only once `afterMs` has
  passed, then fades them in over 200 ms, so a wait that ends just after the
  delay does not pop. A logo inside it never mounts during a short wait, so
  its animation loop never starts.
- **`ScheduleLoadingScreen`:** wraps its Shuffle logo in a 400 ms reveal. Its
  plain background still covers the page at once, so nothing half-rendered
  shows.
- **The cold-load "Loading your workspace" screen** (`SetupGuard`'s
  `AuthTransitionScreen`): flashed for about 175 ms on a full reload of the
  schedule. `AuthTransitionScreen` gains `revealAfterMs`, and `SetupGuard`
  sets it to 400 ms.

**Must not break:**

- The post-sign-in handoff (`AuthTransitionScreen` with `signing-in`) still
  shows at once: it is a deliberate bridge after the Sign in click.
- Both loading screens still cover the page while their data loads.

### Build steps

1. [x] **Delayed reveal.** Add `DelayedReveal` with a component test using fake
       timers: nothing renders before the delay, the children appear after it, and
       unmounting early never mounts them. Use it at 400 ms in
       `ScheduleLoadingScreen`, and through `revealAfterMs` in `SetupGuard`'s
       workspace screen.
   - Done when the test passes. In the browser, a normal schedule load shows
     neither logo nor text, and a slow one fades the Shuffle in after 400 ms.

### Verify

- The component test, plus `npm run type-check`, `npm run lint`,
  `npm run test` and `npm run build`.
- **Browser:** a normal schedule load shows no logo. With the network
  throttled, Shuffle fades in after about 400 ms.

### Verification evidence

- `npm run type-check`, `npm run lint` and `npm run build` (11/11 tasks)
  pass in the worktree.
- `npm run test` passes (23/23 tasks; web 5377 tests in 616 files, mobile
  1404 in 167), including the new `DelayedReveal` test.
- **Browser,** signed in as `qa-super-admin` on a warm dev server:

  | Load                        | Result                                      |
  | --------------------------- | ------------------------------------------- |
  | Full reload of `/schedule`  | Background only (about 150 ms, then 175 ms) |
  | Dashboard to schedule       | Background only (about 195 ms), no logo     |
  | Slowed by 1.5 s per request | Shuffle fades in at about 410 ms            |

- **Not run:** `npm run test:e2e`.
