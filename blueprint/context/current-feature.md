# Employee contact columns are server-owned

**Type:** Fix

**Fixes:** F-08 (archived as `runtime-resilience-webhook-deeplinks-paging-realtime/F-08`), F-21, F-22

**Status:** verified

## The problem

- **F-08.** `members_select_employees` (`003_rls_policies.sql:269`) gates rows
  on the organization alone, so any member can read a colleague's `phone`,
  `email`, `contact_notes` and `status_note` straight through the data API
  with their own JWT, and the same columns ride along in the Realtime CDC
  payload for `employees` (the table is `REPLICA IDENTITY FULL` and every
  member subscribes to it). Every application path already masks them:
  `/api/employees/manage` returns the masked shape unless the caller is a
  gridmaster, super admin, or holds `canViewEmployeeDetails` or
  `canManageEmployees` (`route.ts:223`), `/api/organization/directory`
  applies the same rule, the mobile person endpoint masks likewise, and
  mobile never queries a table directly. `@/lib/db` is behind an
  architecture-boundary allowlist and no UI file imports it.
- **F-21.** Moving `draft_changed` onto the editor topic (commit `02ae73cc`)
  also deleted the four comment lines that introduced the `editing_cell`
  handler in `SchedulePageClient.tsx`.
- **F-22.** The editor draft topic admits `canEditNotes` (matching the 013
  send policy), so a note editor without `canEditShifts` receives
  `draft_changed` diffs carrying draft _cells_ and the client applies them,
  while `fetchShifts` redacts draft cells for that same member and migration
  035's snapshot policy refuses them.

## The fix

- **F-08: migration `036_employee_contact_columns_server_owned.sql`.**
  Revoke the table-level `SELECT` on `public.employees` from `authenticated`
  and grant back every column except `phone`, `email`, `contact_notes` and
  `status_note` (the 004 table grant covers every column and a column-level
  revoke cannot narrow it, the same shape as 033 and 034 on `profiles`). The
  service role keeps full select, so every route, RPC and definer function
  is unchanged; RLS policy expressions may reference columns the caller
  cannot select, so `members_select_employees` and the write policies stay
  as they are. A new column added later is not granted by default, which is
  the safe direction.
- **F-22.** The draft-topic receiver applies the `shifts` half of a
  `draft_changed` payload only when the viewer holds `canEditShifts`; the
  `notes` half and the payload-less refetch are unchanged, so a note editor
  still gets note diffs and never a draft cell the read path would redact.
- **F-21.** Restore the comment above the `editing_cell` handler.

Must not break: the people list, person detail, directory, export, import,
bulk actions, invitations, the mobile people and person endpoints,
contact-conflict checks, the auth hook, the cron jobs, the seed, and the
Realtime invalidation feed (only the payload's contact columns go away, and
the hook keys off the table name).

## Build steps

- [x] **1. Migration 036 with text and live tests (F-08)** - the revoke and
      the column grant, checksum, doc range. Done when
      `db:migrations:check` and a clean reset pass, the text test pins the
      granted list and the absence of the four columns, and a live test
      shows an authenticated member (regular, admin with
      `canViewEmployeeDetails`, and super admin alike) refused on each
      contact column, still reading the rest, and the service role reading
      everything.
- [x] **2. Note editors ignore draft cell diffs, and the restored comment
      (F-22, F-21)** - the client hunk and its test. Done when the test
      shows a `draft_changed` payload carrying `shifts` applied for a shift
      editor and ignored for a note-only editor, with the note half applied
      in both cases, and the comment is back.

## Verify

- `npm run type-check`, `npm run lint`, `npm run test:web`,
  `npm run test:mobile`, the live integration tests, a clean
  `supabase db reset`.
- Data API with a member's JWT: `GET /rest/v1/employees?select=phone` is
  refused for a regular member, an admin holding `canViewEmployeeDetails`
  and a super admin; `select=first_name,last_name,status` still returns.
- Browser: `/people` still lists staff and shows contact details to a
  manager and hides them from a regular user; an employee update made by a
  manager reaches a regular user's Realtime feed without the contact
  columns in the payload (read the websocket frames).
- `/audit` afterwards.
