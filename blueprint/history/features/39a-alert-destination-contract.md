# Feature: Alert destination contract

**From build-plan:** feature 39a
**Status:** verified

## Goal

Give every alert one answer to "where does tapping this take me?", computed the
same way on web and mobile. An alert is one sentence about something else, so
the destination, not a detail view, is the point of tapping it. This
sub-feature ships only the shared contract and its tests; 39b, 39c, and 39d
wire the surfaces.

## In scope

- `packages/domain/src/alert-destination.ts`, exported from the index:
  `resolveAlertDestination({ type, metadata })` returning
  `{ href: string; label: string } | null`.
- The precedence rule: a metadata `actionUrl` that is a same-origin path wins
  (label from `actionLabel`, else the derived verb); otherwise the type table
  below; otherwise `null`. An `actionUrl` that is not a plain path starting
  with a single `/` is ignored, never followed.
- The type table, with the query parameters it relies on locked as
  load-bearing:

  | Type                                                                                                                                                                            | Metadata read | Destination                                                                            | Label            |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- | ---------------- |
  | `shift_request_new`                                                                                                                                                             | `tab`         | `/schedule?requests=approval` when `tab` is `approval`, else `/schedule?requests=mine` | Open requests    |
  | `shift_request_approved`, `shift_request_rejected`, `shift_request_expired`                                                                                                     |               | `/schedule?requests=mine`                                                              | Open requests    |
  | `schedule_published`                                                                                                                                                            | `startDate`   | `/schedule?date=<startDate>`, `/schedule` without one                                  | Open schedule    |
  | `shift_change`, `schedule_note_published`                                                                                                                                       | `date`        | `/schedule?date=<date>`, `/schedule` without one                                       | Open schedule    |
  | `recurring_shift_updated`, `shift_series_updated`, `recurring_schedules_applied`                                                                                                |               | `/schedule`                                                                            | Open schedule    |
  | `employee_created`, `employee_status_changed`, `employee_profile_changed`                                                                                                       | `empId`       | `/people/<empId>` when it is a UUID, else `/people`                                    | Open person      |
  | `invitation_accepted`                                                                                                                                                           |               | `/people`                                                                              | Open people      |
  | `invitation_received`, `invitation_resent`, `invitation_revoked`, `invitation_expired`                                                                                          |               | `/people?section=invitations`                                                          | Open invitations |
  | `membership_removed`                                                                                                                                                            |               | `/people`                                                                              | Open people      |
  | `admin_permissions_changed`, `member_dept_changed`, `system`                                                                                                                    |               | `/profile`                                                                             | Open profile     |
  | `org_settings_changed`                                                                                                                                                          |               | `/settings`                                                                            | Open settings    |
  | `org_suspended`, `org_unsuspended`, `billing_subscription_changed`, `billing_payment_failed`, `billing_payment_succeeded`, `billing_trial_ending_soon`, `billing_trial_expired` |               | `/settings?section=org-billing`                                                        | Open billing     |
  | `security_email_changed`, `security_password_changed`, `security_mfa_changed`, `security_new_device`, `security_session_revoked`, `impersonation_start`, `impersonation_end`    |               | `/profile?section=security`                                                            | Open security    |
  | `org_created`, `org_trial_started`, `org_archived`, `org_restored`, `org_subscription_converted`, `org_subscription_canceled`, `org_payment_failed`                             |               | none (platform rows keep a Details disclosure in 39b)                                  |                  |

- Dates are validated as `YYYY-MM-DD` and ids as UUIDs before they enter an
  href; anything else falls back to the bare route.
- A parity test on web proving every key of `NOTIFICATION_CATEGORIES`
  (`apps/web/src/features/notifications/server/sender.ts`, the runtime list
  of every type) either resolves to an href or is in the explicit
  platform-only set, so a new type cannot ship without a decision.

## Out of scope

- Any UI change, route change, or query-parameter handling on `/schedule`,
  `/people`, or mobile (39b, 39d).
- The mobile href-to-route map (`openNotificationAction.ts`) and its date or
  person extensions (39d).
- Removing the detail modal, the detail screen, or the `?open=` route (39b,
  39d).
- Text hierarchy and the single toolbar (39b, 39c).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Resolver and its tests.** Add
      `packages/domain/src/alert-destination.ts` with `AlertDestination`,
      `resolveAlertDestination`, the type table, the `actionUrl` precedence
      and path guard, and the date and UUID validation; export from the index;
      rebuild the package. Add `alert-destination.test.ts` covering: `actionUrl`
      wins and carries `actionLabel`; a non-path `actionUrl`
      (`https://…`, `//…`, `javascript:`) is ignored and the type rule applies;
      each row of the table above; a malformed `date` or `empId` falls back to
      the bare route; a platform type returns `null`; an unknown type returns
      `null`. _Done when:_ `npx turbo run test --filter=@dubgrid/domain` passes
      and `npm run type-check` passes.

- [x] **Step 2 - Parity with every produced type.** Add
      `apps/web/src/__tests__/alert-destination.parity.test.ts`: for every key
      of `NOTIFICATION_CATEGORIES`, `resolveAlertDestination({ type, metadata: {} })` is non-null unless the type is in the platform-only set, which is
      asserted to equal exactly the seven `org_*` types; every returned href
      starts with `/` and matches one of the locked routes (`/schedule`,
      `/people`, `/profile`, `/settings`) with only the locked parameters
      (`date`, `requests`, `section`). _Done when:_ the test passes under
      `npm run test:web`, and `npm run lint` is clean.

## Files / areas

- `packages/domain/src/alert-destination.ts` (+ test), `packages/domain/src/index.ts`.
- `apps/web/src/__tests__/alert-destination.parity.test.ts`.

## Data / contracts

- **Load-bearing:** `resolveAlertDestination(alert: { type: string; metadata: Record<string, unknown> | null | undefined }): AlertDestination | null` with
  `AlertDestination = { href: string; label: string }`. 39b and 39d consume it
  as is.
- **Load-bearing query parameters** the destinations rely on and 39b must
  make real: `/schedule?date=YYYY-MM-DD`, `/schedule?requests=mine|approval`,
  `/people?section=invitations|requests`, `/settings?section=org-billing`
  (exists), `/profile?section=security` (exists).
- Hrefs are relative paths only; mobile derives its route from the prefix
  (`/people`, `/requests`, `/schedule`, `/profile`) through the existing map.
- No schema or API change.

## Testing

- Logic tests (gate on): the domain test and the web parity test above.
- Commands: `npx turbo run test --filter=@dubgrid/domain`, `npm run type-check`, `npm run test:web`, `npm run lint`.

## Notes for the AI

- `@dubgrid/domain` stays dependency-free of `@dubgrid/contracts` and of both
  apps; the parity test lives on web where the runtime type list is.
- Treat `metadata.actionUrl` as untrusted input even though the server writes
  it: accept only a path that starts with exactly one `/`.
- The `system` type is shared by role changes and profile-change requests; the
  latter always carry `actionUrl`, so the `/profile` fallback only serves the
  former.
- Rebuild the package after Step 1 (`npm run build --workspace=packages/domain`)
  before running the web parity test.
- No em dashes in code, comments, or copy.
