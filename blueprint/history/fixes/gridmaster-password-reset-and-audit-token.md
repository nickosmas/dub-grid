# Gridmaster password reset delivery and audit token secrecy

**Type:** Fix (findings F-84, F-85)

**Status:** verified

## The problem

- F-84: `/api/gridmaster/password-reset` called `auth.admin.generateLink`,
  which mints a link and never sends it, then reported success and wrote a
  `user.password_reset_sent` audit row.
- F-85: the `org.created` audit row spread the whole `superAdmin` object into
  `details`, including the raw invitation token that
  `/api/invitations/register` accepts as a credential.

## The fix

- Send with `resetPasswordForEmail` like the user-facing recovery route, and
  audit only after the send succeeds.
- Log `{ kind, displayName, email }` for the super admin; keep the token in the
  response only. Migration 024 scrubs existing rows.

## Evidence

- `password-reset/route.test.ts` (3 pass), `organizations/manage/route.test.ts`
  (10 pass, new token-secrecy case).
- Migration 024 dry-run inside a rolled-back transaction on the local DB:
  3 `org.created` rows cleaned, 0 remaining.
