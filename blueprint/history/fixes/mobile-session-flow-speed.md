# Mobile session flow: fewer requests on resume, sign-in and refresh

**Type:** Fix
**Status:** verified in tests only; nothing was run on a device or simulator

## The problem

The 2026-10-18 speed audit found the mobile client doing avoidable work around
sessions. Each item was confirmed in the code first.

1. **Resume refetched with an expired token.** `NetworkStateProvider` set
   React Query's focus before starting auto-refresh, so every focus refetch
   after a long background carried the expired token and came back 401. The
   query client then retried each 401 twice with the same token, and a query
   function keeps the token of the render that built it.
2. **Foreground burst.** Bootstrap went stale after 30 seconds and refetched on
   every foreground, although realtime keeps it current. The reconnect
   catch-up's `invalidateQueries` cancelled refetches already in flight and
   sent them again. Push registration ran on every foreground, and its
   in-memory dedupe key was `accessToken.slice(0, 12)`, the JWT header, which
   is the same for every account.
3. **Realtime channels rejoined on every token refresh.** The three realtime
   hooks depended on `accessToken`, so each refresh tore the channels down and
   joined them again, losing events in the gap. supabase-js already passes a
   refreshed token to the socket (`_handleTokenChanged` calls
   `realtime.setAuth` on `TOKEN_REFRESHED`, v2.104.1); the app never sets it
   itself.
4. **Every notification insert refetched all of bootstrap**, including the
   new-device alert, which is inserted already read and archived.
5. **A remembered organization blocked the sign-in form** until
   `lookupOrganization` answered.
6. **Two-factor sign-in waited on an audit call.** `recordMobileSignInCompleted`
   was awaited before the handoff, and `finishLogin` wrote the remembered
   organization before starting the bootstrap warm-up.
7. **Warm launch ran in sequence.** The stored session was first read after
   fonts loaded, and Home's queries started only once the tab tree mounted.
8. **Presence was reported on every token refresh**, and the onboarding flag,
   read from device storage, used the online network mode.
9. **Reset finish waited on a local sign-out** that `leaveRecovery` already
   leaves unawaited.

## The fix

1. On becoming active the provider starts auto-refresh, waits for
   `getSession()` (at most 5 seconds), then sets focus, and only if the app is
   still active. `mobileApiRequest` swaps a bearer that has expired, or expires
   within 30 seconds, for the live session's token, only when that token is the
   same person and organization (`sub` and `org_id`); a valid token is sent in
   the same tick as before. Queries no longer retry 401, 403 or 404. Network
   errors were already not retried (they wait for `refetchOnReconnect`), and
   that is unchanged.
2. Bootstrap's `staleTime` is five minutes and the explicit
   `refetchOnWindowFocus: true` is gone, so the default applies: a foreground
   refetches it only once stale. It stays on, rather than off, because realtime
   does not cover everything bootstrap carries (for example the two-factor
   re-enrolment flag) and a backgrounded socket can miss events. Organization
   configuration lives in bootstrap, so it is covered by the same change. The
   reconnect catch-up passes `{ cancelRefetch: false }`. Push registration
   persists the last landed registration (person, organization, Expo token, and
   when) and re-registers only when one of those changes or a day has passed;
   the explicit "turn on" always registers. Turning push off, losing the
   permission, and every sign-out (`disablePushForCurrentDevice`, before its
   network call) forget the record, so the next sign-in registers again. The
   in-memory key is now user id plus organization id.
3. The realtime hooks keep the token in a ref read when an event lands, and
   their effects depend on whether there is a token, the user id and the
   organization id. `RealtimeChangePayload` gained an optional `eventType`.
4. A notification INSERT still refreshes the inbox, facets and detail queries.
   For bootstrap it applies `get_unread_notification_count`'s rule: a row that
   is read, archived, not `in_app`, or for another organization changes
   nothing; otherwise the cached `unreadNotificationCount` goes up by one with
   `setQueryData`. With no cached bootstrap, a bootstrap fetch in flight, or a
   row that lacks the fields, it invalidates as before. UPDATE and DELETE are
   unchanged. The org-scoped map's `notifications` case is unreachable (that
   channel does not watch the table) and was left alone.
5. The credential form shows as soon as the remembered organization is read
   from the device. Sign in stays disabled (button and submit) until the lookup
   confirms it; a failed lookup returns to the subdomain stage with the slug
   and the same error. "Switch organization" invalidates a lookup in flight.
6. `recordMobileSignInCompleted` runs beside the handoff (it never rejects, and
   nothing in the handoff or the presence report depends on its row; the order
   came from d5b28904d, which only added the call). `finishLogin` starts the
   bootstrap warm-up before `saveLastOrg`. The `refreshSession` after
   `mfa.challengeAndVerify` stays: verify does return an aal2 session, but
   whether its hook-issued claims match the refreshed token's cannot be proved
   from client code.
7. `app/_layout.tsx` calls `warmSupabaseSession()` at module load, which
   creates the client and starts `getSession()` while fonts load. When
   bootstrap resolves, `prefetchHomeQueries` starts Home's first queries
   without awaiting: the admin dashboard and own schedule for this week, or a
   staff member's week of shifts and requests in the organization's time zone,
   with the same keys and functions the screens use. The splash gate does it
   once on launch, and `finishLogin` does it once the handoff succeeds.
8. Presence reports at once on a new person, organization or Supabase session
   (sign-in, restore, organization change) and at most every 30 minutes for
   refreshes within one session. A token without `session_id` is keyed on
   itself, as before. A failed report is forgotten so the next token retries.
   The onboarding-flag query uses `networkMode: "always"`.
9. `finishRecovery` no longer awaits the ephemeral client's local sign-out.
   Only `finishRecovery` changed in that file.

Must not break: tokens stay in SecureStore, the cache is still cleared at an
identity boundary, a token swap never crosses person or organization, MFA is
still enforced server-side, and the remembered organization is still confirmed
before any credentials are sent.

## Build steps

- [x] **1. Resume refreshes before refetching.** Focus waits for the session,
      expired bearers use the live same-identity token, 401/403/404 not retried.
- [x] **2. Foreground burst trimmed.** Bootstrap staleness, catch-up keeps
      in-flight refetches, push re-registration throttled with a fixed key.
- [x] **3. Realtime channels survive a refresh.**
- [x] **4. Notification inserts update the count in place.**
- [x] **5. Remembered organization no longer blocks the form.**
- [x] **6. Two-factor handoff runs beside the audit call.**
- [x] **7. Warm launch overlaps session restore and Home's queries.**
- [x] **8. Presence throttled; onboarding flag always runs.**
- [x] **9. Reset finish does not wait on the local sign-out.**

## Verify

- `npx tsc --noEmit -p apps/mobile/tsconfig.json`, ESLint and Prettier on every
  changed file, the focused mobile suites below, and the realtime-core tests.

## Evidence

- Mobile type-check: clean. ESLint and `prettier --check` on every changed
  file: clean. realtime-core: type-check clean, 20 tests pass.
- Focused mobile suites (47 files, 405 tests) pass: every changed test file
  plus `src/entry`, `features/auth/providers`, `features/dashboard` and
  `ProfileNotificationsScreen`.
- The documentation contract flagged three pages whose evidence includes
  `LoginScreen`, `ResetPasswordScreen` and `app/_layout.tsx` (`onboarding`,
  `mobile-navigation`, `security-sessions`). Their text still holds (the
  sign-in steps and the reset sign-out are unchanged), so their fingerprints
  were re-recorded with `npm run docs:fingerprint`; `docs:check` passes.
- Not run on a device or simulator, and the full mobile suite was not run.
  Worth checking on a phone: resume after more than an hour in the background
  (no 401 burst, Home fills without an error toast), the remembered-organization
  form on a slow network, a two-factor sign-in, the alert badge after a new
  notification and after a new-device sign-in, push still arriving after
  signing out and back in, and the reset-password finish.
