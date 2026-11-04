# Fix: The app no longer says it has no connection while the internet works

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-false-offline`

## The problem

On a working connection the owner kept seeing the "Network connection issue"
toast and "Couldn't load dashboard" with a check-your-connection message, and
pages were sometimes slow to load (2026-11-04, iPhone on 5G).

Two causes, either enough on its own:

- A request that dropped at the connection level was never retried: it was
  left to React Query's reconnect refetch, which only runs when the app's
  online flag goes from offline to online. iOS often drops the first request
  after a wake or a network handover, so the page showed its error and kept it.
- The online flag went offline on the first offline reading from iOS's path
  monitor (`expo-network`, which reports reachable as connected). A handover
  reports that for a moment. Offline, the toast showed, pages with nothing
  loaded showed the offline error, and every query paused until the flag came
  back after its 1.5-second stability wait.

## The fix

- A dropped request is retried twice, like a server failure. React Query
  pauses retries while the app is offline.
- An offline reading must last 3 seconds before the app goes offline; an
  online reading in that time cancels it. The first reading at launch still
  applies at once.
- Any server answer, whatever its status, marks the app online at once
  (`reportServerReached`), dropping a pending offline reading.
- The public mobile navigation page says the banner waits a few seconds and a
  dropped request is tried again first.

## Evidence

- Mobile: all 1,581 tests pass, type-check and lint clean. New tests: a brief
  offline reading is ridden out, a lasting one goes offline after 3 seconds,
  a server answer restores online at once, a dropped request is retried twice.
- Not reproduced: the network drops were inferred from the code and the
  symptoms, not captured from the phone. Production answered normally when
  timed (about 0.15 s warm, 4.5 s cold).
