# Runtime qualification: iOS Simulator

> Point-in-time evidence from a virtual device. It does not stand in for the
> physical iPhone pass (40e4b), and the documentation gate does not count it.

- **Device:** iPhone 17 Pro Max simulator, iOS 26.2 (virtual)
- **Native build:** the Debug build in Xcode's DerivedData, built 2026-09-18
  with Xcode build 17F113, installed fresh for this run. It predates the
  2026-10-19 store-readiness changes to `apps/mobile/app.json` (privacy
  manifest, permission strings, the Face ID plugin) and the 2026-09-28 Expo
  patch bump, so this run qualifies the JavaScript of the commit below on
  that binary, not a fresh native build.
- **JavaScript:** served by Metro from the `feature/40e4-native-qualification`
  worktree at 02fc63c2, whose `apps/mobile` and `packages/` match `dev` at
  8dab203c
- **Backend:** the seeded throwaway Supabase stack on 55321 (the one 40e3
  used), and the production web build (the mobile API) on port 3003 with the
  local Upstash-compatible store; no `apps/web/.env.local`, so email and
  error reporting were off
- **Accounts:** the seeded QA accounts in Calm Haven

## Roles

| Role                 | Account          | Observed                                                                                                                       |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| User                 | `qa-regular`     | Sign-in, Home (next shift, week, 40h), Schedule day view by focus area, Requests, People, Profile, Alerts, Security & sessions |
| Management-only user | `qa-management`  | Sign-in, Home (on duty, open shifts with Claim, 44.5h), People; Profile lists Tech as a management department                  |
| Admin                | `qa-admin`       | Sign-in, admin Home (Your schedule, Coverage, pending approvals); Profile                                                      |
| Super admin          | `qa-super-admin` | Sign-in, admin Home (Open shifts empty state), Requests approval queue with a pending swap and a pickup; nothing was approved  |

## States

| State      | Observed                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loaded     | Every role's Home and the tabs above                                                                                                                                                   |
| Loading    | Alerts showed its skeleton list while the API process was paused (`kill -STOP`), then the list once it resumed                                                                         |
| Empty      | Requests > Available for `qa-regular`: "No requests yet"; the admin Coverage card: "Coverage requirements not configured"; the super admin's Open shifts: "No open shifts right now"   |
| Error      | Security & sessions with the API stopped: "Could not load security" with Try again; a sign-in while the rate limiter was unreachable: "We're having trouble completing that right now" |
| Retry      | Try again on Security & sessions after the API restarted loaded the screen; the sign-in succeeded on a second tap once the rate limiter was reachable                                  |
| Cold start | The app terminated and relaunched as `qa-regular`: launch splash, bundle load, the DubGrid startup screen, then Home with the session restored and no sign-in                          |
| Offline    | Not exercised. The simulator shares the Mac's network, which would cut off the backend and other sessions on this machine                                                              |

## Notes

- Metro warned on each sign-in that the stored session is larger than
  SecureStore's 2,048-byte guidance. The session was stored and restored on
  cold start; recorded as F-128.
- Typing into the email field through the simulator's synthetic keyboard
  dropped characters when sent in one burst; sent in short chunks it was
  exact. That is the input tool's speed, not something a person can type.
- The cloned `apps/mobile/node_modules` carried a stray nested
  `node_modules/node_modules` (also present in the main checkout since
  2026-10-18), which made Metro bundle a second copy of Expo Router and broke
  Android startup with a link preview context error. It was removed from the
  worktree's clone before any evidence was taken.

## Counts

The manifest entry counts one check per role and per state: passed when it
was observed as described, skipped when it could not be produced on this
device. Nothing failed.
