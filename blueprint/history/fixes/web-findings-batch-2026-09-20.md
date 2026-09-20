# Web findings F-42, F-45, F-55, F-67, F-68

**Type:** Fix (findings F-42, F-45, F-55, F-67, F-68)

**Status:** verified

## The fixes

- F-42: MembersSection tests flush the invitations commit; 0 act warnings.
- F-45: the user dashboard's top grid stacks at tablet width like the shell.
- F-55: delete-dependency checks count schedule usage with one RPC
  (migration 025) instead of loading every cell; dead lib copies removed.
- F-67: the read-only shift panel is announced as "Shift details".
- F-68: SetupGuard shows the workspace transition while the bootstrap loads
  cold instead of a blank shell.

## Evidence

- Unit: MembersSection (31, no warnings), UserDashboard (19), ShiftEditPanel
  (51), settings config route (22), SetupGuard (2). Web type-check and lint
  clean; `db:migrations:check` lists 025.
- Migration 025 dry run on the local seed: RPC count equals the previous
  in-memory count for three organizations.
- Not exercised: the e2e role-variance spec's updated matcher (unit test
  covers the accessible name).
