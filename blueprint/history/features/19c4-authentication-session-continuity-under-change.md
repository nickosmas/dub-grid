# Feature: Authentication session continuity under change

**From build-plan:** feature 19c4
**Status:** verified

## Goal

Keep the authenticated web and mobile apps correct and usable while session
state changes underneath them. Cross-tab auth events, access-token rotation,
foreground resume, and organization switching must never resurrect an older
session, flash or reuse another identity's or organization's data, discard safe
same-identity content, or leave the user in a partially switched state.

## In scope

- Define one continuity contract for the transition classes this feature owns:
  same user and organization with a rotated token, signed in to signed out,
  signed out to signed in, different user, and same user switching organization.
- Make the newest authoritative auth event win over older asynchronous session
  restoration or verification work on web and mobile.
- Verify and repair Supabase cross-tab propagation for sign-in, sign-out, token
  refresh, and organization-claim changes in supported web browsers.
- Preserve mounted UI and tenant-correct React Query data when only the token
  rotates. Cancel and remove old authenticated work before a user or
  organization boundary becomes visible.
- Replace raw access-token identity in mobile authenticated query and
  invalidation keys with a shared stable user-and-organization identity while
  continuing to send the current token only inside request functions. This
  includes closing the behavior tracked by finding F-30.
- Make foreground and resume refreshes coalesce with existing React Query and
  Supabase owners so one transition cannot create duplicate refreshes, stale
  completions, navigation resets, or false logout.
- Make web and mobile organization switching safe when the switch RPC succeeds
  but token refresh, local persistence, cache teardown, or navigation is delayed
  or fails. Never continue rendering the previous organization after the
  server-side active organization has moved.
- Use Calm Haven for local browser and native runtime qualification.

## Out of scope

- The broader tenant, session, MFA, redirect, CSRF, rate-limit, replay,
  enumeration, audit, and RLS security review in feature 19d. This feature must
  preserve those boundaries and may repair a directly exposed continuity flaw,
  but it does not certify the full security surface.
- The durable role, state, browser, and native-device release matrix in feature
  19e. This feature records a focused continuity matrix that 19e can reuse.
- New authentication methods, new organization-switching capabilities, visual
  redesign, background synchronization, service workers, persistent offline
  data, or changes to onboarding and billing policy.
- General mobile cache optimization unrelated to identity continuity, including
  list virtualization findings F-04 and F-31.
- Production or staging traffic, production data, deployment, Supabase schema
  changes, application-store work, or production migration activity.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Lock the continuity and cache-identity contract** - Inventory
      every existing web and mobile owner for initial restore, auth events,
      foreground focus, token refresh, organization switching, cache clearing,
      realtime teardown, and navigation. Add the smallest shared mobile
      identity/key helpers needed to classify `(userId, orgId)` independently
      of the token string, plus a checked-in focused scenario matrix. Define
      last-event-wins ordering, cancellation, cache retention, cache removal,
      and recovery behavior for each transition class. _Done when:_ focused
      tests prove readable, unreadable, missing, rotated, different-user, and
      different-organization token identities; the matrix assigns exactly one
      owner to every transition and states which data is retained, cancelled,
      cleared, or reloaded.
- [x] **Step 2 - Make web auth events ordered and cross-tab safe** - Guard the
      initial restore and asynchronous auth-event verification so an older
      completion cannot overwrite a later sign-in, sign-out, token refresh, or
      organization change. Add an authenticated cache/realtime boundary inside
      the existing provider tree: retain data for a token-only rotation, but
      cancel and clear it before exposing a different user or organization.
      Preserve the existing hard-navigation requirement for organization
      changes and immediate protected-route exit on sign-out. _Done when:_
      tests force restore-after-sign-out, verification-after-newer-event,
      repeated refresh, different-user sign-in, and cross-tab organization
      change orderings; the newest event always wins, token-only refresh causes
      no content reset, and identity or organization changes clear old queries
      and realtime subscriptions exactly once before navigation.
- [x] **Step 3 - Close web organization-switch partial states** - Harden the
      consolidated login switch and browser MFA switch paths for the point where
      `switch_org` has succeeded but the refreshed session or client handoff has
      not. Coalesce duplicate switch attempts, keep an explicit bounded
      transition or recovery surface active, and either finish on the newly
      minted organization token or fail closed without rendering the old
      organization's cached app. Ensure another tab receiving the new
      organization claim follows the same boundary. _Done when:_ route and
      component tests cover success, double activation, delayed refresh,
      refresh failure after successful RPC, stale completion, and a second tab;
      no case returns to interactive old-organization content or leaves a
      permanently busy transition.
- [x] **Step 4 - Make mobile session events and foreground resume ordered** -
      Extend `AuthSessionProvider` and the existing focus/network integration so
      startup restore, Supabase auth events, token refresh, app backgrounding,
      foreground resume, and forced sign-out obey the same newest-event-wins
      contract. Keep a valid same-user, same-organization session and mounted
      navigation during rotation or resume; cancel stale restoration and avoid
      duplicate presence registration or bootstrap refresh. _Done when:_ tests
      force restore-after-sign-out, restore-after-newer-token, repeated auth
      events, background-to-active bursts, slow refresh, refresh failure, and
      terminal sign-out; same-identity content stays mounted, stale work cannot
      revive a session, and each owned refresh/registration runs at most once.
- [x] **Step 5 - Stabilize core mobile query identities** - Migrate bootstrap,
      dashboard, schedule, and shift-request read keys to the stable
      authenticated user-and-organization identity plus their real range,
      scope, and history parameters. Keep the latest access token in each
      request closure, pass cancellation where supported, and retain deliberate
      placeholder data only within the same identity and organization. _Done
      when:_ bootstrap, dashboard, schedule, ranged-request, and infinite-history
      tests prove that token rotation keeps the same keys and safe data, while a
      user or organization change produces disjoint keys and cancels obsolete
      requests; none of these read keys contains the raw token.
- [x] **Step 6 - Stabilize mobile account and directory query identities** -
      Migrate people, person detail, management users, profile, sessions,
      organization status, notification preferences, notifications,
      notification detail, and notification facets to the same stable identity
      contract. Preserve resource ids, filters, search, pagination, and other
      real key parameters. _Done when:_ representative ordinary, detail,
      filtered, and infinite-query tests prove rotation preserves the correct
      cache entry, account or organization changes cannot reuse it, and a
      structural guard prevents authenticated mobile read keys from placing the
      raw access-token variable back into cache identity.
- [x] **Step 7 - Align mobile writes, invalidation, realtime, and switching** -
      Update optimistic writes, mutation cache updates, invalidation helpers,
      realtime invalidation, unread-count updates, and organization switching
      to address the stable keys from Steps 5 and 6. Make the organization switch one
      guarded transition: after the RPC succeeds, wait for the matching refreshed
      session identity before releasing cache teardown and navigation; a
      persistence or refresh failure cannot expose old tenant data or strand the
      overlay. _Done when:_ tests cover mutation success and rollback before and
      after token rotation, realtime invalidation under a rotated token,
      concurrent switch taps, delayed auth-event propagation, refresh failure
      after successful RPC, SecureStore failure, and successful switch; old-org
      data is unreachable and the destination renders only after its session
      identity is authoritative.
- [x] **Step 8 - Qualify the focused continuity matrix** - Run deterministic
      interleaving tests and the full applicable verification suite. In real
      Calm Haven Chromium, exercise two tabs for sign-in/sign-out, token refresh,
      and organization switching while watching URLs, visible identity, query
      traffic, console errors, and stale content. On the Android 17 emulator,
      exercise background/resume, forced refresh, sign-out, and an organization
      switch while watching navigation and native logs. Record exact observed
      evidence and disclose any event or platform state that cannot be forced
      honestly. _Done when:_ every focused matrix row has automated or disclosed
      manual evidence; no tested path revives stale auth, flashes another user or
      organization, resets UI for a token-only refresh, duplicates owned work,
      or remains stuck, and focused tests, full web/mobile tests, type check,
      lint, build, and relevant Playwright tests pass.

## Files / areas

- `apps/web/src/components/AuthProvider.tsx`, `QueryProvider.tsx`, protected
  route and auth-transition integration, and focused tests.
- `apps/web/src/features/account/client/`, `apps/web/src/lib/browser-auth.ts`,
  organization-switch routes and login/MFA orchestration, plus Playwright auth
  helpers/specs.
- `apps/mobile/src/shared/providers/AuthSessionProvider.tsx` and
  `NetworkStateProvider.tsx`, `apps/mobile/src/shared/lib/auth-reset.ts`, token
  claim helpers, query client, API transport, and tests.
- Mobile bootstrap, dashboard, schedule, requests, people, profile,
  organization-status, notifications, mutation, realtime invalidation, unread
  cache, and organization-switch query consumers.
- `docs/operations/` for the focused continuity matrix and reproduction notes.
- `blueprint/context/findings.md` only through the normal audit workflow when
  F-30 is repaired and later re-reviewed; implementation must not self-close it.

## Data / contracts

- No database schema or migration is expected.
- The stable client cache identity is the access token's readable `sub` plus
  `org_id` claims. Signature verification and authorization remain server
  responsibilities; decoded claims grant no access.
- A raw access token is request authorization, never durable cache identity.
  It stays out of authenticated mobile query keys and stored diagnostic output.
- Same `(sub, org_id)` with a new token retains safe cache and navigation state.
  A changed `sub`, changed `org_id`, sign-out, unreadable replacement identity,
  or explicit impersonation boundary cancels old work and makes old cached data
  unreachable before the new state is interactive.
- Auth events and restore/verification work use a monotonic generation or an
  equivalent explicit ordering guard. Only the latest generation may commit
  session, user, cache-boundary, telemetry, or navigation state.
- Organization switching remains session-scoped and continues to use
  `switch_org` as the authorization boundary followed by a required session
  refresh. An RPC success without a matching refreshed token is an incomplete
  transition, never a successful switch and never permission to keep showing
  old tenant data.
- Existing mobile and web API response shapes, cookies, SecureStore values,
  onboarding state, billing gates, MFA assurance, and server-side authorization
  remain compatible.
- Continuity logs and evidence may record fixed scenario names, durations,
  event types, request counts, and opaque test labels only. Never record access
  or refresh tokens, credentials, email addresses, user ids, organization ids,
  request bodies, or arbitrary headers.

## Testing

- Unit-test token-to-identity parsing and query-key construction for rotation,
  account change, organization change, absent claims, and malformed tokens.
- Use deferred promises to prove last-event-wins behavior for web initial
  restore and verification, mobile restore and auth events, and partial
  organization switches. Assert committed state and actual request counts, not
  render counts.
- Web tests must prove query cancellation/clearing and realtime teardown occur
  on sign-out, different-user sign-in, and organization change, but not on a
  same-user, same-organization token refresh.
- Mobile regression tests must cover stable keys across ordinary, detail,
  ranged, and infinite queries, plus matching mutation and realtime invalidation
  behavior. Add a structural guard so new authenticated query keys cannot place
  the raw access-token variable back into cache identity.
- Test foreground focus bursts with fake timers only around owned debounce or
  deadline logic and restore real timers after each case.
- Playwright-test two Calm Haven browser pages for cross-tab sign-out and
  organization-claim propagation, including a delayed older completion that
  must not overwrite the latest state. Inspect console output and failed
  requests.
- Manually exercise Calm Haven on Android 17 for background/resume, forced token
  refresh, sign-out, and organization switching. Record what is directly
  observed and disclose native state that cannot be controlled honestly.
- Final verification commands: focused Vitest targets, `npm run test:web`,
  `npm run test:mobile`, `npm run type-check`, `npm run lint`, `npm run build`,
  and the relevant `npm run test:e2e` target. Do not send traffic to staging or
  production.

## Notes for the AI

- Start with the inventory and reproduce a race before replacing working auth
  infrastructure. Supabase already propagates browser auth storage events and
  React Query already deduplicates requests; add ordering and boundary ownership
  around those mechanisms rather than creating a second event bus.
- Treat the identity comparison, not the auth event name alone, as decisive.
  `SIGNED_IN` can replay for an existing session, `TOKEN_REFRESHED` can carry an
  organization change, and two event types can describe the same identity.
- Never clear safe same-identity data merely because the access-token string
  changed. Conversely, never use `keepPreviousData` across a user or
  organization boundary.
- Keep the current token in each query function so the server sees fresh
  authorization even while the stable key stays unchanged. Ensure refetch or
  invalidation observes the latest token rather than a stale closure.
- Preserve the hard web reload after an organization change unless direct
  evidence proves every server component and singleton rebinds safely. The
  current documentation identifies that reload as load-bearing.
- Query cancellation is part of tenant safety. Clearing a cache without
  cancelling requests first can let an old completion write back after the
  boundary.
- Do not silently sign out on a recoverable refresh or resume failure. Keep the
  current verified content with explicit recovery where it remains safe; only a
  terminal auth event or unreadable changed identity can take the anonymous
  path.
- F-30 remains `open` during implementation. `/implement` may mark it `fixed`
  with evidence; only a later `/audit` may close it.
- Keep the implementation serial and re-check ownership before every step. The
  three modified planning files in the shared checkout are the approved
  scheduler-roadmap update and must not be swept into a feature checkpoint.
