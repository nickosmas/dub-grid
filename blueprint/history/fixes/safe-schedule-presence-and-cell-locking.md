# Safe schedule presence and cell locking

**Type:** Fix

**Status:** verified

## The problem

The schedule can show the current user as an additional online editor when
another tab for the same account is merely present. Same-account editing is not
treated consistently as a hard lock, and some range or bulk mutations do not
preflight every affected cell. The schedule Realtime channel is also public and
its reliable-broadcast queue does not request server acknowledgement.

Users need a safe way to take over a cell from only their own remote
schedule-editing session. This must not revoke that remote login, terminate
another person's session, or replace optimistic database version checks with a
server-side lock lease.

## The fix

Count distinct other people in the online indicator and hide idle sessions for
the current account. Treat an active same-account editor as a real cell lock,
including note-only editors, and route all cell, range, and series mutations
through one lock preflight immediately before mutation.

Add an RLS-protected termination ledger for opaque schedule editor session IDs.
Only the owning user can end a session. Store the marker before broadcasting so
termination survives missed messages and reconnects. The collision warning
offers `Use this tab`, `Cancel`, and `Sign out this device`. Using this tab
ends only the conflicting schedule editor, while signing out ends only the
current device. An ended editor releases presence, stops editing, and explains
that unsaved local work was not saved. Remote device revocation remains
exclusively in Profile Security.

Make only the schedule Realtime channel private with acknowledged broadcasts,
live-organization authorization, and presence keyed by editor session. Keep
existing optimistic version conflicts authoritative and allow scheduling to
continue with a visible warning when Realtime is unavailable.

## Build steps

- [x] Correct presence grouping and lock ownership. Done when one tab never
      counts itself, idle same-account tabs are hidden, another account counts
      once per person, and active same-account and note-only editors hard-lock
      the whole cell with explicit ownership metadata.
- [x] Enforce locks across every schedule mutation path. Done when direct,
      drag, paste, clear, bulk, publish, discard, import, auto-fill, and
      series-wide mutations use the same owner-aware message and recheck their
      complete target set immediately before mutation.
- [x] Add secure owner-only schedule-session takeover. Done when an active
      same-account collision warns `Open in another tab or device` and offers
      `Use this tab`, `Cancel`, and `Sign out this device`; takeover stores
      the durable marker before an acknowledged notification, every client
      removes the ended session and its locks, the target cannot retrack or save
      after reconnect or visibility restoration, and neither takeover nor
      current-device sign-out revokes a remote login.
- [x] Harden the schedule Realtime channel and database rollout. Done when the
      channel is private with broadcast acknowledgement and per-session
      presence, `realtime.messages` and termination-ledger RLS enforce live
      organization membership and owner-only termination, canonical schema/RLS
      plus idempotent migration `013` agree, and the reset script applies every
      numbered migration without changing legacy `schedule_draft_sessions`.
- [x] Verify degraded and real multi-session behavior. Done when focused logic
      and SQL tests, web type-check, the full web suite, build, and authenticated
      two-tab, two-device, and two-user browser checks prove the count, locks,
      termination, reconnect, unsaved-edit warning, and Realtime-failure paths.

## Verify

- `rtk npx vitest run --config apps/web/vitest.config.mts apps/web/src/__tests__/useCellLocks.test.ts apps/web/src/__tests__/PresenceAvatars.test.tsx apps/web/src/__tests__/schedule-editor-visibility.test.ts apps/web/src/__tests__/useReliableRealtimeBroadcasts.test.ts`
- Focused tests added for lock preflight, termination ownership, channel config,
  migration policy, reconnect, and degraded Realtime behavior
- `rtk npx tsc --noEmit --project apps/web/tsconfig.json`
- `rtk npm run test:web`
- `rtk npm run build`
- Authenticated `/schedule` checks with shared-login tabs, separate device
  sessions, and a second user
