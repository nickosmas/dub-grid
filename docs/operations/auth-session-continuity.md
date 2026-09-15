# Authentication session continuity

This document locks the ownership, ordering, cache, and recovery contract for
Blueprint feature 19c4. Runtime qualification uses local Calm Haven fixtures
only.

## Identity contract

Client continuity decisions compare the authenticated identity carried by the
access token:

- `sub` identifies the signed-in user;
- `org_id` identifies that session's active organization and may be absent for
  a platform Gridmaster;
- the token string authorizes a request but is not cache identity because
  Supabase rotates it during a live session;
- an absent token is anonymous, while a present token whose `sub` cannot be read
  is unreadable. Those are distinct transition states;
- decoded claims are only client-side routing and cache metadata. The server
  still verifies the token and enforces authorization and organization scope.

For any asynchronous restore, verification, refresh, or switch, only the newest
generation may commit session, user, cache-boundary, telemetry, or navigation
state. Cancellation from a newer generation is not a network failure and does
not sign the user out.

## Transition matrix

| Transition                                            | Authoritative commit owner                                                                            | Safe state to retain                                  | Work to cancel or remove                                                                    | Navigation or recovery                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| No session to signed in                               | Web `AuthProvider`; mobile `AuthSessionProvider`                                                      | Public form state until successful handoff            | Older anonymous restore or verification                                                     | Enter the authenticated destination only after the session is authoritative                      |
| Restore overlaps sign-out                             | Web `AuthProvider`; mobile `AuthSessionProvider`                                                      | Signed-out state                                      | Pending restore, verification, requests, authenticated cache, realtime channels             | Web protected routes leave immediately; mobile replaces with login                               |
| Same `sub` and `org_id`, new token                    | Web `AuthProvider`; mobile `AuthSessionProvider`                                                      | Mounted navigation, query data, scroll and form state | Superseded auth work only                                                                   | No navigation or blocking loading state; requests use the latest token                           |
| Different `sub`                                       | Web authenticated cache boundary; mobile `AuthSessionProvider` plus root query client                 | Nothing from the prior account                        | All old authenticated requests, query data, realtime channels, and presence ownership       | Start the new account from its own authenticated entry state                                     |
| Same `sub`, different `org_id`                        | Initiating organization-switch flow; receiving tabs use the auth/cache boundary                       | Only organization-neutral preferences                 | Old-organization requests, query data, realtime channels, permissions, and navigation state | Web hard reloads on the new organization; mobile enters Home after the matching session arrives  |
| Present but unreadable replacement token              | Web `AuthProvider`; mobile `AuthSessionProvider`                                                      | No authenticated tenant data                          | Pending authenticated work and caches                                                       | Fail closed into the existing bounded session-recovery path                                      |
| Foreground with unchanged identity                    | Mobile `NetworkStateProvider` owns focus; Supabase owns token refresh; React Query owns stale refetch | Current mounted content and safe cache                | Duplicate focus, refresh, or bootstrap attempts                                             | Stay on the current screen; surface only existing non-blocking recovery                          |
| `switch_org` succeeds but refresh or handoff does not | The initiating web or mobile switch flow                                                              | Organization-neutral presentation only                | Old-organization interactive content and requests                                           | Keep a bounded switch/recovery surface until the matching token arrives or the flow fails closed |

## Current owner inventory

| Platform area                            | Single owner to preserve                                                     | Current behavior                                                                                                               | 19c4 action                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Web initial restore and auth-event state | `AuthProvider`                                                               | Restores with a 12-second limit and subscribes to Supabase auth changes                                                        | Add generation ordering so an older restore or verification cannot overwrite a newer event     |
| Web cross-tab event delivery             | Supabase browser auth storage synchronization                                | Delivers auth events to each tab's `AuthProvider`                                                                              | Test real two-tab delivery; do not add a second broadcast bus                                  |
| Web authenticated cache boundary         | Auth-aware child inside `QueryProvider`                                      | Explicit login switches and goodbye teardown clear queries, but passive cross-tab identity changes have no central cache owner | Cancel then clear on user or organization change; retain on token-only rotation                |
| Web realtime teardown                    | The authenticated cache boundary coordinating existing Supabase channels     | Ordinary route unmount and explicit teardown remove channels                                                                   | Remove old-identity channels before the new identity or organization is interactive            |
| Web organization switch                  | Login orchestration for password flow; `OrgLogin` for post-MFA flow          | Calls `switch_org`, refreshes the session, clears cache, then hard navigates                                                   | Guard duplicate and partial switches; never resume old-organization content after RPC success  |
| Web protected navigation                 | `ProtectedRoute` for sign-out; organization-switch initiator for hard reload | Leaves protected content after auth loss and hard reloads after a known switch                                                 | Keep those owners and make passive cross-tab organization changes use the same hard boundary   |
| Mobile initial restore and auth events   | `AuthSessionProvider`                                                        | Coalesces restore, cancels it on an auth event, and registers each observed token                                              | Extend ordering coverage and distinguish token rotation from identity change                   |
| Mobile foreground focus                  | `NetworkStateProvider`                                                       | Converts real AppState changes into React Query focus changes                                                                  | Keep it the only focus owner and prove repeated resume signals coalesce                        |
| Mobile token refresh                     | Supabase Auth with `autoRefreshToken`                                        | Emits the refreshed session through `AuthSessionProvider`                                                                      | Preserve navigation and stable query identity while request closures adopt the new token       |
| Mobile authenticated query identity      | `getMobileAuthIdentityKey` plus resource-specific query factories            | Bootstrap uses stable claims; most other query keys contain the raw token                                                      | Migrate reads, writes, and invalidators without changing server authorization                  |
| Mobile realtime invalidation             | `MobileRealtimeProvider` and its three existing hooks                        | Rebuilds channels from the active session and invalidates token-keyed queries                                                  | Repoint invalidation at stable keys and prevent old-organization channels surviving a boundary |
| Mobile sign-out and forced expiry        | `handleExpiredMobileSession`                                                 | Clears queries, signs out when owned, replaces session, then routes to login                                                   | Preserve single-flight teardown and ensure stale auth work cannot repopulate state             |
| Mobile organization switch               | `ProfileScreen.handleSwitchOrganization`                                     | Calls `switch_org`, refreshes, clears queries, and routes Home                                                                 | Wait for the matching session identity and fail closed after any post-RPC failure              |

## Focused qualification matrix

| Scenario                                                    | Automated proof                                                          | Runtime proof                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Older web restore resolves after cross-tab sign-out         | Deferred-promise `AuthProvider` test                                     | Two Calm Haven Chromium tabs                                                                 |
| Older web verification resolves after a newer token or user | Deferred-promise `AuthProvider` test                                     | Synthetic browser event ordering only if it can be forced without exposing tokens            |
| Web token-only refresh                                      | Provider and cache-boundary tests                                        | Calm Haven Chromium with mounted content and request-count inspection                        |
| Web organization claim changes in another tab               | Provider/cache/navigation test                                           | Two Calm Haven Chromium tabs, checking URL, visible organization, console, and requests      |
| Mobile restore resolves after a newer auth event            | Deferred-promise `AuthSessionProvider` test                              | Android 17 only where the event can be forced honestly                                       |
| Mobile token rotation                                       | Stable-key tests across ordinary, ranged, detail, and infinite queries   | Android 17 with the current screen retained                                                  |
| Mobile background and foreground burst                      | `NetworkStateProvider`, auth provider, and bootstrap request-count tests | Android 17 background/resume with native logs                                                |
| Mobile organization switch with delayed session propagation | Switch, cache, navigation, and realtime tests                            | Android 17 Calm Haven switch to another authorized local organization                        |
| Post-RPC refresh or persistence failure                     | Web and mobile deferred-failure tests                                    | Automated evidence unless the provider failure can be induced locally without remote traffic |

## Evidence rules

- Count underlying auth, query, refresh, and registration calls rather than
  component renders.
- Use deferred promises for ordering and fake timers only for owned deadlines or
  coalescing windows.
- Inspect old and new cache keys, cancellation, realtime channel cleanup,
  navigation, console output, and native logs.
- Evidence may record fixed scenario names, event types, durations, and counts.
  Never record credentials, access or refresh tokens, email addresses, user or
  organization identifiers, request bodies, or arbitrary headers.
- Do not send fault-injection traffic to staging or production.

## Qualification evidence — 2026-09-09

### Automated

- Focused web continuity tests passed: 4 files and 39 tests covering ordered
  auth events, authenticated cache boundaries, stable session identity, and
  login/organization-switch recovery.
- Focused mobile continuity tests passed: 10 files and 96 tests covering stable
  authenticated keys, realtime and account invalidation, optimistic writes,
  foreground focus, auth-event ordering, unread state, and organization
  switching.
- Calm Haven Chromium continuity tests passed: 6 Playwright cases covering the
  two-page sign-out boundary, degraded-network recovery, and login behavior.
  The two-page case asserts both URLs and visible protected content, captures
  unexpected console errors, and rejects unexpected HTTP failures.
- The complete web suite passed: 390 files and 3,303 tests.
- The mobile and shared-package suite passed, including 132 mobile files and
  1,075 mobile tests. Type-check, lint, and the production web build also
  passed. Lint reported five existing warnings and no errors.

### Runtime observations and disclosed gaps

- In a real Chrome Dev profile, a second Calm Haven tab displayed the expected
  organization, signed-in person, role, and dashboard data. Signing out in that
  tab reached `/goodbye`; opening a protected route in the same browser profile
  then reached `/login` without showing stale dashboard content.
- The already-open first Chrome Dev tab could not be inspected after sign-out
  because the browser extension surface stopped accepting automation. The
  deterministic two-page Playwright case supplies the cross-tab assertion; no
  separate manual claim is made for that first tab.
- A request dispatched immediately before shared-session revocation can finish
  with a `401` from the organization bootstrap endpoint. The authenticated
  boundary cancels and discards that response before protected content can
  render. Feature-flag fetching now stops on auth loss, eliminating the other
  teardown request observed during qualification.
- Token-only refresh and a cross-tab organization-claim change were not forced
  manually because doing so safely would require manipulating session material.
  Their provider, cache-boundary, stable-key, and deferred-switch cases are the
  recorded evidence.
- An Android 17 emulator displayed the Calm Haven mobile sign-in screen, but
  its embedded Running Devices surface was not operable through the available
  accessibility automation. No manual claim is made for background/resume,
  forced refresh, sign-out, or organization switching on that emulator. The
  focused mobile cases cover their ordering, coalescing, cache, realtime,
  persistence-failure, and navigation contracts; native gesture and log
  observation remains a disclosed manual-device gap for the release matrix.
