# Resilient schedule presence with a detailed online roster

**Type:** Fix

**Status:** verified

## The problem

Two related gaps in schedule presence.

**Presence disappears on transient disconnects.** Hiding a tab already keeps
presence alive: `visibilitychange` clears the editing cell but does not untrack.
The real loss vector is a backgrounded tab whose WebSocket is throttled and
dropped. The server expires that presence, every other client receives a
`leave`, and the avatar vanishes until the tab is focused again or the channel
re-subscribes. Editors read that as "they left" when the person is still there.

Supabase emits the same `leave` event for a deliberate `untrack()` and for a
dropped connection, so a receiver cannot currently tell a real exit from a blip.

**The online indicator carries almost no information.** The `N online` label is
not interactive, and the per-avatar tooltip shows only a name, an `editing`
word, and a session count. There is no way to see who is present, what they are
doing, or how to reach them without leaving the schedule.

## The fix

Publish presence as early as possible and reflect departures immediately.
Presence identity comes from the already-loaded auth user rather than the tail
of the schedule fetch, so an editor appears the moment they open the schedule
and cell locking works from the first click. A session that leaves presence is
removed at once, so navigating away or signing out reflects straight away.

Make the `N online` label a hover target that opens a roster card listing every
online editor, each with initials avatar, name, session count, org role, and
email.
Role and email are fetched on demand for the currently present user ids through
an org-scoped authenticated endpoint, so personal data stays behind auth and
never rides the Realtime presence payload. Keep the existing per-avatar tooltip
and every current cell-lock behavior unchanged.

## Build steps

- [x] Make presence appear and disappear immediately. Done when an editor is
      published as soon as they open the schedule rather than after the grid
      load, a session that leaves presence is removed at once on every other
      client, a departed editor's cell lock is released with it, and cell locks
      plus same-account session handling are unchanged.
- [x] Render the roster card. Done when hovering the `N online` label opens a
      card listing every online editor with avatar, name and session count, the
      card is keyboard reachable and dismissible with Escape, and the existing
      per-avatar tooltip still works.
- [x] Serve org-scoped presence profiles and show role and email in the card.
      Done when an authenticated endpoint returns display profiles only for the
      caller's own organization, rejects foreign or unscoped organization ids,
      returns nothing for users outside the org, is fetched only when the card
      opens and cached per session, renders role and email in the card, and
      degrades to name-only when the lookup fails or a user has no linked
      employee record.

## Verify

- Focused tests cover explicit-leave removal, grace-window expiry, reconnect
  restoring live state, roster grouping and counts, and endpoint org scoping
  plus foreign-org rejection.
- `rtk npm run type-check`
- `rtk npm run test:web`
- `rtk npm run build`
- Authenticated `/schedule` browser checks with two distinct users prove the
  avatar survives a simulated disconnect as `away`, disappears immediately on a
  deliberate exit, and that the roster card shows correct people, states, and
  profile details.

## Notes

Email lives on `employees.email` and org role on
`organization_memberships.org_role`; neither sits on `profiles`, and an online
user with no linked employee record legitimately has no email to show. There is
no avatar image anywhere in the schema, so the card uses the existing generated
initials and gradient.

## Evidence

Recorded 2026-09-03. Not yet committed at time of writing.

| Gate                            | Result                            |
| ------------------------------- | --------------------------------- |
| `npm run test:web`              | 348 files, 2830 tests, 0 failures |
| `npm run type-check`            | clean                             |
| `npm run build`                 | 11/11 tasks successful            |
| `presence-profiles` route tests | 12/12                             |
| Live two-user browser run       | 10/10                             |

Browser run used two distinct signed-in users in separate contexts
(`qa-super-admin@dubgrid.test` and a new `qa-editor@dubgrid.test`) against local
Supabase. It proved the roster opens on hover, names the other editor, shows the
org role and email served by the endpoint, fetches profiles exactly once and only
on open, reuses the cache on reopen, makes no viewing/editing claim, and clears
the avatar at once when the other editor navigates away in-app.

## Notes on defects found and fixed during the build

Two regressions were introduced in the first build step and caught before
completion, both reported from live use:

- The deliberate-leave handler wrote into the permanent force-ended tombstone
  set. Because the editor session id is a component ref that survives channel
  effect re-runs, any peer that saw an `editor_left` then ignored that editor's
  presence and every later cell lock for the life of the page. Deliberate leaves
  now use a separate expiring marker; a lock broadcast clears it.
- Marking a session away blanked its `editingCell`, and a reconnect reporting a
  lower lock revision kept the blanked copy, so an active editor rendered as
  merely viewing. Away now sets only the marker, and `lockedCells` skips away
  sessions instead, which releases the lock without destroying state.

A third latent hazard was avoided while adding the busy-cell override: the grid
already passes a 4th `trigger` argument to `handleCellClick`, so a positional
override flag would have received a truthy `"click"` and disabled cell locking on
every click. The override is a named option on an internal function instead.

The viewing/editing label was removed from the roster and tooltip at the user's
request: presence only flags a cell while an edit panel is open, so genuine
editing frequently reads as viewing. The claim is omitted rather than shown
wrong.

## Design reversals during the build

Two decisions were made and then reversed on the user's direction. Both are
recorded because the reasoning matters more than the outcome.

**A 90 second "away" grace window was built, then removed.** It held a
disconnected session's avatar, dimmed, so a throttled background tab did not
appear to leave. It needed an `editor_left` broadcast to tell a deliberate exit
from a dropped socket, and that broadcast caused a serious defect: the channel
effect announces a leave on teardown, React Strict Mode runs that teardown on
every mount in development, and the editor session id is a component ref that
survives the remount, so every peer tombstoned a still-live session and ignored
its presence and cell locks. The user then asked for immediate reflection
instead, which removed the grace window, the away state, the broadcast, and the
tombstone together. Presence is authoritative again, and that entire class of
defect no longer has a mechanism to occur through.

**A viewing/editing label was built, then removed.** Presence only marks a cell
as being edited while an edit panel is open, so ordinary editing frequently read
as "viewing". The claim was omitted rather than shown wrong.

## Defects found and fixed during the build

- The deliberate-leave handler wrote into the permanent force-ended tombstone
  set, so any peer that saw an `editor_left` ignored that editor's presence and
  every later cell lock for the life of the page. Superseded by removing the
  broadcast entirely.
- Marking a session away blanked its `editingCell`, and a reconnect reporting a
  lower lock revision kept the blanked copy, so an active editor rendered as
  merely viewing. Superseded by the same removal.
- `currentUser` was resolved at the tail of the schedule fetch, so every page
  load had a window where no avatar was published and `lockCell` silently took
  no lock at all. Identity now comes from the auth user immediately.
- Presence tracking was gated behind an awaited termination round trip in three
  places. That check untracks an ended session itself, so it never needed to be
  a gate; it now runs concurrently.
- Adding a busy-cell override nearly introduced a silent failure: the grid
  already passes a 4th `trigger` argument to `handleCellClick`, so a positional
  override flag would have received a truthy `"click"` and disabled cell locking
  on every click. It is a named option on an internal function instead.
