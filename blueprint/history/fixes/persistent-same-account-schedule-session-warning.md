# Persistent same-account schedule-session warning

**Type:** Fix

**Status:** verified

## The problem

The schedule hides same-account sessions from the distinct-person online count,
but exposes them only as temporary cell-lock avatars. The collision dialog is
created only after the user clicks the exact cell being edited elsewhere. An
idle second tab or device therefore produces no warning or session controls,
and a released cell lock makes the only visible clue disappear immediately.

Users need a persistent schedule-level warning whenever another editor session
for their account is present, without counting themselves as another person or
weakening cell-level collision protection.

## The fix

Keep same-account editor sessions separate from `onlineUsers` and expose their
opaque editor-session IDs as owner-only schedule presence. While at least one
other session is present, show a persistent warning with the number of other
schedule sessions and actions to `End other schedule sessions` or `Sign out
this device`. Use the established red danger treatment so the conflict stands
out, and do not offer a dismiss action while those sessions remain.

Ending other sessions must atomically store durable termination markers for the
bounded set of currently present same-account editor sessions before sending
acknowledged notifications. It must end only those schedule editors, release
their locks, and leave every remote authentication session signed in. Preserve
the existing targeted `Use this tab` cell-collision flow, distinct-person
online count, optimistic database conflicts, and degraded-Realtime warning.

## Build steps

- [x] Expose same-account schedule sessions and render the persistent warning.
      Done when another idle or editing tab/device for the current account is
      never included in `onlineUsers`, is represented once by editor-session
      ID, immediately shows the schedule-level warning and correct session
      count, keeps cell avatars as lock affordances, and removes the warning
      only after all other same-account schedule sessions leave or end.
- [x] Add safe owner-only bulk schedule-session termination. Done when
      `End other schedule sessions` records all currently detected target
      markers atomically before acknowledged broadcasts, rejects the current
      session, foreign users, invalid organization context, and unbounded
      input, leaves remote authentication intact, makes every ended editor
      read-only with the unsaved-work warning, and retains the targeted cell
      takeover plus local `Sign out this device` behavior.

## Verify

- Focused hook, warning-component, client API, route, SQL, and cell-lock tests
  cover session grouping, counts, atomic owner-only termination, current-session
  rejection, foreign-user rejection, lock release, reconnect, and retained
  authentication.
- `rtk npm run type-check`
- `rtk npm run test:web`
- `rtk npm run build`
- Authenticated `/schedule` browser checks with two idle same-account tabs,
  multiple same-account editors, and a distinct second user prove the warning,
  actions, online count, ended-editor behavior, and unchanged cell collisions.

## Evidence

Recorded 2026-09-03.

| Gate                 | Result                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `npm run type-check` | 24/24 tasks successful                                                                       |
| `npm run test:web`   | 346 files, 2791 tests, 0 failures                                                            |
| `npm run build`      | exit 0, 11/11 tasks successful                                                               |
| Focused suites       | 32/32 across `useCellLocks`, `ScheduleSessionDialogs`, `editor-sessions/route`, `client/api` |

Authenticated two-tab browser run against local Supabase (`pacific-wellness.localhost:3000`,
`qa-super-admin@dubgrid.test`), 6/6 checks:

- single tab shows no same-account warning
- second tab shows the persistent warning, reading `open in 1 other tab or device`
- warning offers both `End other schedule sessions` and `Sign out this device`
- the same-account session is not counted in the distinct-person online count
- `POST /api/schedule/editor-sessions` returned 200 with `endedEditorSessionIds`,
  the warning cleared on the acting tab, and the terminated tab's own GET returned
  `{"ended":true}`
- authentication survived termination: the ended session still loaded `/dashboard`
  rather than being bounced to `/login`

Not covered by the browser run: the distinct-second-user cell-collision path. That
path is unchanged by this diff and is covered by the focused `useCellLocks`,
`PresenceAvatars`, and `cell-lock-preflight` suites.

## Notes

`endScheduleEditorSession` (single target) is retained as a thin wrapper over the
new `endScheduleEditorSessions` (array), so the targeted `Use this tab` cell
takeover keeps working against the array-only route contract.

Auth is cookie-backed via `createBrowserClient`, so all tabs in one browser
profile share a single Supabase auth session. There is no per-tab auth identity
to revoke, which is why termination operates on per-mount editor-session UUIDs
rather than auth sessions, and why `Sign out this device` necessarily ends the
whole browser profile's session rather than one tab.
