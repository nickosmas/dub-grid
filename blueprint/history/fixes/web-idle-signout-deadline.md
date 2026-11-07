# Fix: Web idle sign-out keeps one deadline

**Type:** Fix
**Status:** complete
**Branch:** `fix/idle-signout-deadline`

## The problem

The web app should sign someone out after 30 idle minutes, but a session left
alone for much longer stayed signed in (owner, 2026-11-07, in a private
window). `InactivityGuard` and `useIdleTimer` enforce it in the open tab only,
and:

1. **Coming back counts as activity, even past the deadline.** Expiry rides
   on a `setTimeout`, which stops while a laptop sleeps and runs late in a
   hidden or frozen tab. The first mouse move on return resets the clock to
   now without checking whether 30 minutes already passed. The wake check
   runs only on `visibilitychange` or `pageshow`, which a window left on
   screen through sleep never fires.
2. **A reload or new tab starts a fresh 30 minutes.** The last activity time
   isn't kept anywhere, so reopening the site an hour later is still signed
   in.
3. **Moving the mouse dismisses the "Still there?" warning.** On a shared
   computer, a passer-by keeps someone else's session open.

Nothing on the server ends an idle web session (no Supabase time-box or
inactivity timeout, on purpose for mobile; F-204). That stays out of scope.

## The fix

Agreed behaviour (owner, 2026-11-07):

- One deadline, 30 minutes after the last activity, shared by every tab of
  the session and kept across reloads in `localStorage`, tied to the auth
  session's id so a new sign-in starts fresh.
- Activity counts only before the warning. A mouse move, key press or
  another tab's message after the deadline signs out instead of reviving
  the session; one inside the last minute leaves the warning up.
- The warning shows 60 seconds before. Only **Stay signed in** (or Escape)
  extends, and it closes the warning in every tab. **Sign out now** signs out.
- The countdown is read from the deadline. Screen readers hear the warning
  once and again at 10 seconds, not every second.

## Steps

- [x] 1. `useIdleTimer`: read and write the shared last-activity time (per
      session), check the deadline before counting activity, and ignore
      activity during the warning. Tests for waking with a mouse move,
      reloading past the deadline, a new session, and the warning.
- [x] 2. `InactivityGuard`: pass the session id, describe the popup body,
      and announce only at the start and at 10 seconds. The public
      Security and sessions page says what the timeout covers.
- [x] 3. Type-check, lint, tests, and a browser check of the popup.

## Done when

- Activity after the deadline signs out rather than resetting.
- A reload past the deadline signs out; a reload before it continues the
  same clock; a new sign-in starts a fresh 30 minutes.
- During the warning, mouse and keyboard activity don't close it; Stay
  signed in does, in every tab.

## Evidence

- `useIdleTimer.test.ts` (14) and `idle-broadcast.test.ts` (4) pass; the 7
  new hook tests fail on the old hook.
- Headless Chromium against the worktree's dev server and the local stack:
  a reload 50s before the deadline shows the warning in both open tabs;
  mouse moves and a key press leave it up; Stay signed in closes it in both
  tabs and moves the shared clock; Escape closes it; a mouse move after a
  31-minute clock jump with no timer fired lands on
  `/goodbye?reason=inactivity`; a reload past the deadline does the same; a
  new sign-in with the previous session's time still stored starts fresh.
- Type-check, lint on the changed files, and `docs:check` pass.

## Not in this fix

- Returning to the same page after signing in again. It needs a checked
  `next` through the login route, the two-factor path and the apex domain
  hop, and should only apply when the same person signs back in; a follow-up.
- A server-side idle limit for web sessions (F-204).
