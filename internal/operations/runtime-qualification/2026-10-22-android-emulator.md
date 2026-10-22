# Runtime qualification: Android emulator

> Point-in-time evidence from a virtual device. It does not stand in for the
> mandatory physical Android pass (40e4b), and the documentation gate does
> not count it.

- **Device:** Pixel 7 Pro emulator (`Pixel_7_Pro_API_33`), Android 13, API
  33, Google Play image, arm64 (virtual). Started for the second half of the
  run with `-memory 4096`: at the AVD's own 1.5 GB, Android itself stopped
  responding ("Process system isn't responding") while the host was loaded.
- **Native build:** the Debug APK installed on that AVD on 2026-09-26. It
  predates the 2026-10-19 store-readiness changes to `apps/mobile/app.json`
  and the 2026-09-28 Expo patch bump, so this run qualifies the JavaScript of
  the commit below on that binary, not a fresh native build.
- **JavaScript:** served by Metro from the `feature/40e4-native-qualification`
  worktree at 02fc63c2 (`debug_http_host` 10.0.2.2:8082), whose
  `apps/mobile` and `packages/` match `dev` at 8dab203c
- **Backend:** the same seeded throwaway stack and production web build as
  the iOS record, reached at 10.0.2.2
- **Network:** the emulator's Wi-Fi kept dropping and reconnecting, which
  disconnected Metro and reloaded the app twice, so Wi-Fi was turned off and
  the emulated cellular link (speed full, no added delay) carried the run.
  Wi-Fi was turned back on afterwards.
- **Accounts:** the seeded QA accounts in Calm Haven

## Roles

| Role                 | Account          | Observed                                                                                                                                          |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                 | `qa-regular`     | Sign-in, Home (next shift, week, 40h), Requests, People, Profile, Profile details, Alerts                                                         |
| Management-only user | `qa-management`  | Sign-in, Home (on duty, open shifts with Claim, 44.5h)                                                                                            |
| Admin                | `qa-admin`       | Sign-in, admin Home (Your schedule, Coverage, pending approvals); Profile lists Tech as a management department                                   |
| Super admin          | `qa-super-admin` | Sign-in, admin Home (Your schedule, Coverage, 1 pending approval), Requests approval queue with a pending swap and a pickup; nothing was approved |

## States

| State      | Observed                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loaded     | Every role's Home and the screens above                                                                                                                                                                                           |
| Loading    | Alerts showed its skeleton list while the API process was paused; the admin Home showed its dashboard skeleton after sign-in; the Sign in button showed its spinner while the request ran                                         |
| Empty      | Requests > Available for `qa-regular`: "No requests yet"; the admin Coverage card: "Coverage requirements not configured"                                                                                                         |
| Error      | Profile with the API stopped: "Could not load profile" with Try again and Force sign out; Alerts whose request outlived the pause: "Could not load alerts"; a sign-in during a network drop: the "Network connection issue" toast |
| Offline    | Cellular data turned off: People read "Could not load people. You're offline. Check your internet connection and try again." with Try again                                                                                       |
| Retry      | Turning data back on refetched People by itself; Try again loaded Profile after the API restarted and Alerts after it resumed; the sign-in succeeded on a second tap after the network drop                                       |
| Cold start | The app force-stopped and relaunched as `qa-regular`: launch splash, the DubGrid startup screen, then Home with the session restored and no sign-in                                                                               |

## Notes

- While the admin Home was still filling in, the Coverage card read
  "0 pending approval" beside a pending swap and the Week segment drew
  without its label; both settled to "1 pending approval" and "Week" within
  seconds. Not recorded as a finding.
- The first `qa-regular` sign-in created its session on the server, but the
  app reloaded when the emulator lost Metro, before Home appeared. The
  relaunch restored that session.
- Metro's SecureStore size warning appears here too (F-128). Dev builds also
  showed LogBox notices for realtime channel errors after the network drops;
  the channels reconnected.

## Counts

The manifest entry counts one check per role and per state: passed when it
was observed as described, skipped when it could not be produced on this
device. Nothing failed.
