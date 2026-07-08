# DubGrid — API Reference

DubGrid uses a thin API surface. Most read operations go directly through the Supabase client (RLS-protected). Route Handlers cover operations that require server-side logic, external service calls, file generation, or public access.

All routes live under `apps/web/src/app/api/`.

---

## Authentication

Authenticated endpoints require a valid Supabase session cookie (`sb-*-auth-token`). The edge middleware verifies JWT claims and injects `x-dubgrid-role`, `x-dubgrid-org-id`, and `x-dubgrid-org-slug` headers into every request.

The mobile API (`/api/mobile/v1/*`) uses a Bearer token in the `Authorization` header instead of cookies.

---

## Endpoints

### Public

| Method | Path                      | Purpose                                             | Rate Limit                             |
| ------ | ------------------------- | --------------------------------------------------- | -------------------------------------- |
| GET    | `/api/health`             | Health check                                        | None                                   |
| GET    | `/api/validate-domain`    | Check whether an org subdomain slug exists          | IP-based (`apiLimiter`)                |
| POST   | `/api/request-demo`       | Demo request form submission (landing page)         | `demoLimiter` (3/hr per IP)            |
| POST   | `/api/auth/login`         | Email/password login with brute-force protection    | `loginLimiter` (15/15m per email hash) |
| POST   | `/api/consent`            | Record cookie consent preference                    | None                                   |
| GET    | `/api/invitations/lookup` | Look up an invitation by token (accept-invite page) | None                                   |

---

### Auth and Session

| Method | Path                       | Purpose                                                                         |
| ------ | -------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/auth/organizations`  | List organizations the caller belongs to                                        |
| POST   | `/api/auth/organizations`  | Switch active organization (calls `switch_org` RPC)                             |
| POST   | `/api/auth/start-trial`    | Start 14-day trial on first super_admin login (calls `start_trial_for_org` RPC) |
| POST   | `/api/auth/track-session`  | Record per-device session entry                                                 |
| GET    | `/api/auth/data-export`    | GDPR personal data export (JSON download)                                       |
| POST   | `/api/auth/gdpr-erase`     | GDPR full data anonymization                                                    |
| DELETE | `/api/auth/delete-account` | Delete the authenticated user's account                                         |
| POST   | `/api/invitations/accept`  | Accept a pending invitation and complete registration                           |
| GET    | `/api/trial-welcome`       | Check whether to show the trial welcome modal                                   |
| POST   | `/api/trial-welcome`       | Send trial welcome email via Resend                                             |

---

### Account

| Method | Path                                    | Purpose                                             |
| ------ | --------------------------------------- | --------------------------------------------------- |
| GET    | `/api/account/self`                     | Return the caller's profile + membership            |
| GET    | `/api/account/identity`                 | Return the caller's auth identity info              |
| GET    | `/api/account/org-context`              | Return the caller's current org context             |
| GET    | `/api/account/permissions`              | Return the caller's resolved permission set         |
| PATCH  | `/api/account/profile`                  | Update display name, avatar, etc.                   |
| PATCH  | `/api/account/profile/phone`            | Update phone number                                 |
| GET    | `/api/account/change-requests`          | List pending profile change requests                |
| POST   | `/api/account/change-requests`          | Submit a profile change request                     |
| PATCH  | `/api/account/change-requests/[id]`     | Approve or reject a change request                  |
| GET    | `/api/account/sessions`                 | List the caller's active sessions                   |
| DELETE | `/api/account/sessions`                 | Revoke a session                                    |
| POST   | `/api/account/logout-cleanup`           | Clean up server state on logout                     |
| POST   | `/api/account/mfa-status`               | Update MFA status after enrollment                  |
| GET    | `/api/account/notification-preferences` | Get notification preferences                        |
| PUT    | `/api/account/notification-preferences` | Update notification preferences                     |
| GET    | `/api/account/terms`                    | Check whether the caller has accepted current terms |
| POST   | `/api/account/terms`                    | Record terms acceptance                             |

---

### Organization

| Method | Path                                    | Purpose                                                   |
| ------ | --------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/organization/bootstrap`           | Load all org-scoped config for the current session        |
| GET    | `/api/organization/directory`           | Paginated staff directory (calls `get_org_directory` RPC) |
| GET    | `/api/organization/employee-count`      | Return headcount for the org                              |
| GET    | `/api/organizations/users`              | List users in the org                                     |
| PATCH  | `/api/organizations/access`             | Update membership (role, permissions, departments)        |
| DELETE | `/api/organizations/access`             | Remove a user from the org                                |
| PATCH  | `/api/organizations/app-only-user`      | Toggle app-only status for a member                       |
| POST   | `/api/organizations/delete`             | Soft-delete the caller's org (super_admin only)           |
| GET    | `/api/organizations/invitations`        | List pending invitations                                  |
| POST   | `/api/organizations/invitations`        | Create an invitation                                      |
| PATCH  | `/api/organizations/invitations`        | Update an invitation                                      |
| DELETE | `/api/organizations/invitations`        | Revoke an invitation                                      |
| POST   | `/api/organizations/invitations/create` | Create and optionally send an invitation                  |
| POST   | `/api/organizations/role-change`        | Change a member's org role                                |
| PUT    | `/api/organizations/settings`           | Update org settings                                       |
| GET    | `/api/onboarding`                       | Get onboarding state                                      |
| POST   | `/api/onboarding`                       | Advance or complete onboarding step                       |
| PUT    | `/api/settings/config`                  | —                                                         |
| GET    | `/api/settings/config`                  | Read/write org-level config overrides                     |

---

### Employees

| Method | Path                                 | Purpose                                            |
| ------ | ------------------------------------ | -------------------------------------------------- |
| POST   | `/api/employees/manage`              | Create or update an employee record                |
| POST   | `/api/employees/status`              | Update employee status (active/benched/terminated) |
| PATCH  | `/api/employees/identity`            | Update employee identity fields                    |
| POST   | `/api/employees/from-user`           | Create an employee record from an existing user    |
| POST   | `/api/employees/from-user/reconcile` | Reconcile user-to-employee link                    |
| POST   | `/api/employees/link-user`           | Link an employee record to a user account          |
| POST   | `/api/employees/link-user/reconcile` | Reconcile employee-to-user link                    |
| GET    | `/api/people/change-requests`        | List pending people change requests                |
| PATCH  | `/api/people/change-requests/[id]`   | Approve or reject a people change request          |
| POST   | `/api/import/employees`              | Bulk-import employees from CSV                     |

---

### Schedule

| Method | Path                                   | Purpose                                            |
| ------ | -------------------------------------- | -------------------------------------------------- |
| POST   | `/api/schedule/manage`                 | Write schedule cell changes (draft + publish)      |
| POST   | `/api/shifts/publish`                  | Publish a draft schedule range                     |
| POST   | `/api/shifts/discard`                  | Discard unpublished draft cells                    |
| POST   | `/api/shifts/repeat-overwrites`        | Detect conflicts before applying a recurring shift |
| GET    | `/api/schedule/published-ranges`       | List published date ranges                         |
| GET    | `/api/schedule/publish-history`        | Full publish history                               |
| GET    | `/api/schedule/publish-history/recent` | Most-recent publish entries                        |
| POST   | `/api/schedule/actor-names`            | Resolve actor display names for publish history    |
| POST   | `/api/schedule/recurring`              | Apply recurring shift templates to a date range    |
| POST   | `/api/schedule/requests`               | Create a shift request (pickup/swap/calloff)       |

---

### Notifications

| Method | Path                        | Purpose                                                |
| ------ | --------------------------- | ------------------------------------------------------ |
| GET    | `/api/notifications`        | Paginated notification inbox (keyset cursor + filters) |
| PATCH  | `/api/notifications`        | Mark single notification read/unread/archived          |
| GET    | `/api/notifications/facets` | Return inbox facet counts                              |
| POST   | `/api/notifications/search` | Full-text search across notifications                  |
| POST   | `/api/notifications/bulk`   | Bulk read/unread/archive/delete operations             |
| POST   | `/api/send-notification`    | Dispatch an in-app or email notification               |

---

### Reports and Export

| Method | Path                             | Purpose                                      |
| ------ | -------------------------------- | -------------------------------------------- |
| GET    | `/api/reports/operations`        | Operational reports data                     |
| GET    | `/api/reports/operations/export` | Export operations report (CSV)               |
| GET    | `/api/export`                    | Schedule export (PDF/CSV)                    |
| GET    | `/api/calendar`                  | iCalendar (.ics) export of a user's schedule |

---

### Dashboard

| Method | Path                       | Purpose                                |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/api/dashboard/analytics` | Aggregated analytics for the dashboard |
| GET    | `/api/billing`             | Billing status and subscription info   |

---

### Invitations and Email

| Method | Path                        | Purpose                                                 |
| ------ | --------------------------- | ------------------------------------------------------- |
| POST   | `/api/send-invite-email`    | Send invitation email via Resend (rate-limited per org) |
| POST   | `/api/notify-impersonation` | Log impersonation start/end events                      |

---

### Stripe Billing

| Method | Path                            | Purpose                                     |
| ------ | ------------------------------- | ------------------------------------------- |
| POST   | `/api/stripe/create-checkout`   | Create a Stripe Checkout session            |
| POST   | `/api/stripe/checkout-complete` | Handle post-checkout success                |
| POST   | `/api/stripe/billing-portal`    | Redirect to the Stripe Customer Portal      |
| POST   | `/api/stripe/webhook`           | Stripe webhook handler (signature-verified) |

---

### Test Sandbox

| Method | Path                | Purpose                                                |
| ------ | ------------------- | ------------------------------------------------------ |
| POST   | `/api/test-sandbox` | Create or destroy a test sandbox (CSRF + rate-limited) |

---

### Gridmaster Only

All gridmaster routes require `platform_role = 'gridmaster'` in the JWT. They are served by `apps/web/src/features/gridmaster/`.

| Method    | Path                                          | Purpose                                          |
| --------- | --------------------------------------------- | ------------------------------------------------ |
| GET       | `/api/gridmaster/overview`                    | High-level platform overview                     |
| GET       | `/api/gridmaster/dashboard`                   | Gridmaster dashboard data                        |
| GET, POST | `/api/gridmaster/accounts`                    | List and manage gridmaster accounts              |
| GET       | `/api/gridmaster/users`                       | Search all users across orgs                     |
| PATCH     | `/api/gridmaster/users`                       | Update a user's platform state                   |
| GET       | `/api/gridmaster/users/[userId]/memberships`  | All org memberships for a user                   |
| POST      | `/api/gridmaster/users/[userId]/force-logout` | Terminate all sessions for a user                |
| GET       | `/api/gridmaster/organizations/manage`        | —                                                |
| POST      | `/api/gridmaster/organizations/manage`        | Manage org lifecycle (suspend, restore, archive) |
| GET       | `/api/gridmaster/invitations`                 | List invitations across all orgs                 |
| GET       | `/api/gridmaster/audit-log`                   | Paginated audit log                              |
| GET       | `/api/gridmaster/audit-log/full`              | Full unfiltered audit log                        |
| POST      | `/api/gridmaster/audit-log/export`            | Export audit log to CSV                          |
| GET       | `/api/gridmaster/billing`                     | Billing overview across all orgs                 |
| POST      | `/api/gridmaster/subscription`                | Manage an org's subscription tier                |
| POST      | `/api/gridmaster/stripe-sync`                 | Force-sync Stripe data for an org                |
| GET       | `/api/gridmaster/org-health`                  | Org health metrics                               |
| GET       | `/api/gridmaster/compliance`                  | Compliance report                                |
| GET       | `/api/gridmaster/security`                    | Security overview                                |
| GET       | `/api/gridmaster/security/sessions`           | Active sessions across orgs                      |
| POST      | `/api/gridmaster/delete-org`                  | Hard-delete an org (gridmaster only)             |
| POST      | `/api/gridmaster/password-reset`              | Force a password reset for any user              |
| GET       | `/api/gridmaster/impersonation`               | Impersonation history                            |
| POST      | `/api/gridmaster/impersonation`               | Start an impersonation session                   |
| GET       | `/api/gridmaster/schedule`                    | Schedule data across orgs                        |

---

## Mobile API (v1)

The mobile app (Expo) communicates exclusively with these endpoints. All routes are under `apps/web/src/app/api/mobile/v1/` and delegate to `apps/web/src/features/mobile/server/routes/`. Authentication uses a Bearer token (no cookies). Sandboxes are excluded from mobile login.

### Auth and Bootstrap

| Method | Path                               | Purpose                                     |
| ------ | ---------------------------------- | ------------------------------------------- |
| POST   | `/api/mobile/v1/auth/login`        | Email/password login, returns session token |
| GET    | `/api/mobile/v1/auth/organization` | Get the caller's current org context        |
| GET    | `/api/mobile/v1/bootstrap`         | Load all data required on app launch        |

### Schedule

| Method | Path                          | Purpose                                |
| ------ | ----------------------------- | -------------------------------------- |
| GET    | `/api/mobile/v1/me/schedule`  | Authenticated user's upcoming shifts   |
| GET    | `/api/mobile/v1/org/schedule` | Full org schedule for authorized users |

### Shift Requests

| Method | Path                                         | Purpose                                    |
| ------ | -------------------------------------------- | ------------------------------------------ |
| GET    | `/api/mobile/v1/shift-requests`              | List shift requests (pickup/swap/calloff)  |
| POST   | `/api/mobile/v1/shift-requests`              | Create a shift request                     |
| PATCH  | `/api/mobile/v1/shift-requests/[id]`         | Approve, reject, or cancel a shift request |
| GET    | `/api/mobile/v1/shift-requests/swap-options` | List eligible shifts for a swap request    |

### People

| Method      | Path                                    | Purpose                                     |
| ----------- | --------------------------------------- | ------------------------------------------- |
| GET         | `/api/mobile/v1/people`                 | Paginated people directory                  |
| GET         | `/api/mobile/v1/people/[id]`            | Person detail                               |
| PATCH       | `/api/mobile/v1/people/[id]`            | Update a person record                      |
| PATCH       | `/api/mobile/v1/people/[id]/status`     | Update employee status                      |
| POST/DELETE | `/api/mobile/v1/people/[id]/invitation` | Create or revoke an invitation for a person |

### Notifications

| Method | Path                                    | Purpose                                       |
| ------ | --------------------------------------- | --------------------------------------------- |
| GET    | `/api/mobile/v1/notifications`          | Paginated notification inbox                  |
| GET    | `/api/mobile/v1/notifications/facets`   | Inbox facet counts                            |
| PATCH  | `/api/mobile/v1/notifications/[id]`     | Mark single notification read/unread/archived |
| POST   | `/api/mobile/v1/notifications/actions`  | Bulk read/unread/archive/delete operations    |
| POST   | `/api/mobile/v1/notifications/read-all` | Mark all notifications read                   |

### Profile

| Method   | Path                                              | Purpose                            |
| -------- | ------------------------------------------------- | ---------------------------------- |
| GET      | `/api/mobile/v1/profile`                          | Authenticated user's profile       |
| PATCH    | `/api/mobile/v1/profile/account`                  | Update account fields              |
| PATCH    | `/api/mobile/v1/profile/phone`                    | Update phone number                |
| GET      | `/api/mobile/v1/profile/change-requests`          | List pending change requests       |
| POST     | `/api/mobile/v1/profile/change-requests`          | Submit a change request            |
| PATCH    | `/api/mobile/v1/profile/change-requests/[id]`     | Approve or reject a change request |
| GET, PUT | `/api/mobile/v1/profile/notification-preferences` | Get/set notification preferences   |
| GET      | `/api/mobile/v1/profile/sessions`                 | List active sessions               |
| DELETE   | `/api/mobile/v1/profile/sessions`                 | Revoke a session                   |

### Device and Presence

| Method      | Path                              | Purpose                       |
| ----------- | --------------------------------- | ----------------------------- |
| POST        | `/api/mobile/v1/push-tokens`      | Register an Expo push token   |
| POST/DELETE | `/api/mobile/v1/session-presence` | Update session presence state |

---

## Key Supabase RPCs

These RPC calls are made from Route Handlers and use the caller's session or the service role. Grouped by domain.

### Auth and Session

| RPC                    | Purpose                                           | Auth            |
| ---------------------- | ------------------------------------------------- | --------------- |
| `get_my_organizations` | List orgs the caller is a member of               | Authenticated   |
| `switch_org`           | Change the active org for the current session     | Authenticated   |
| `start_trial_for_org`  | Start 14-day trial (idempotent, super_admin only) | Authenticated   |
| `complete_onboarding`  | Mark onboarding complete (idempotent)             | Authenticated   |
| `force_logout_user`    | Terminate all sessions for a target user          | Gridmaster only |
| `gdpr_erase_user_data` | Anonymize all personal data for a user            | Service role    |

### Roles and Permissions

| RPC                                  | Purpose                                                          | Auth            |
| ------------------------------------ | ---------------------------------------------------------------- | --------------- |
| `change_user_role`                   | Change a member's org role (advisory-locked, blocks self-change) | Admin+          |
| `assign_org_role_by_email`           | Assign org role by email (onboarding flow)                       | Super_admin     |
| `promote_gridmaster_by_email`        | Grant gridmaster platform role                                   | Gridmaster only |
| `demote_gridmaster_account`          | Revoke gridmaster platform role                                  | Gridmaster only |
| `set_gridmaster_account_deactivated` | Deactivate a gridmaster account                                  | Gridmaster only |

### Impersonation

| RPC                         | Purpose                                            | Auth            |
| --------------------------- | -------------------------------------------------- | --------------- |
| `start_impersonation`       | Begin a 30-minute gridmaster impersonation session | Gridmaster only |
| `end_impersonation`         | End the active impersonation session               | Gridmaster only |
| `get_impersonation_history` | Audit log of impersonation events                  | Gridmaster only |

### Schedule

| RPC                          | Purpose                                     | Auth          |
| ---------------------------- | ------------------------------------------- | ------------- |
| `publish_schedule`           | Publish a draft schedule range              | Admin+        |
| `apply_recurring_schedules`  | Materialize recurring templates into shifts | Admin+        |
| `create_shift_series`        | Create a recurring shift series             | Admin+        |
| `update_series_all_shifts`   | Batch-update all shifts in a series         | Admin+        |
| `delete_shift_series`        | Remove a shift series                       | Admin+        |
| `move_shift`                 | Move a shift to a different slot            | Admin+        |
| `upsert_recurring_shift`     | Create or update a recurring shift template | Admin+        |
| `delete_schedule_cell_draft` | Discard a draft cell                        | Admin+        |
| `get_publish_history`        | Paginated publish history                   | Authenticated |

### Shift Requests

| RPC                        | Purpose                              | Auth          |
| -------------------------- | ------------------------------------ | ------------- |
| `create_shift_request`     | Create a pickup/swap/calloff request | Authenticated |
| `respond_to_shift_request` | Accept or decline a shift request    | Authenticated |
| `resolve_shift_request`    | Approve or reject a shift request    | Admin+        |
| `cancel_shift_request`     | Cancel a pending request             | Authenticated |
| `claim_shift_request`      | Claim an open pickup request         | Authenticated |
| `volunteer_for_open_shift` | Volunteer for an open shift          | Authenticated |

### Notifications

| RPC                             | Purpose                                        | Auth          |
| ------------------------------- | ---------------------------------------------- | ------------- |
| `get_notifications`             | Keyset-paginated inbox with filters and search | Authenticated |
| `get_notification_facets`       | Facet counts for inbox filters                 | Authenticated |
| `get_unread_notification_count` | Unread badge count                             | Authenticated |
| `mark_notification_read`        | Mark a single notification read                | Authenticated |
| `mark_all_notifications_read`   | Mark all notifications read                    | Authenticated |

### Org and People

| RPC                                | Purpose                                    | Auth            |
| ---------------------------------- | ------------------------------------------ | --------------- |
| `get_org_users`                    | List members with roles and permissions    | Admin+          |
| `get_org_directory`                | Staff directory (paginated)                | Authenticated   |
| `send_invitation`                  | Issue an invitation token                  | Admin+          |
| `accept_invitation`                | Accept and consume an invitation token     | Unauthenticated |
| `link_employee_to_user`            | Link an existing employee record to a user | Admin+          |
| `remove_focus_area_from_employees` | Bulk-remove a focus area from staff        | Admin+          |

### Gridmaster Queries

| RPC                           | Purpose                      | Auth            |
| ----------------------------- | ---------------------------- | --------------- |
| `get_all_users_with_profiles` | All users across all orgs    | Gridmaster only |
| `get_gridmaster_accounts`     | All gridmaster-role accounts | Gridmaster only |
| `get_audit_log`               | Platform-wide audit log      | Gridmaster only |
| `get_tenant_stats`            | Per-org statistics           | Gridmaster only |
| `get_system_stats`            | Platform-wide statistics     | Gridmaster only |

---

## Rate Limiting

Rate limits are enforced via Upstash Redis. The limiters are defined in `apps/web/src/lib/rate-limit.ts`.

| Limiter                 | Scope                      | Window | Limit        | Used On                      |
| ----------------------- | -------------------------- | ------ | ------------ | ---------------------------- |
| `loginLimiter`          | Per email (SHA-256 hash)   | 15 min | 15 requests  | `/api/auth/login`            |
| `demoLimiter`           | Per IP                     | 1 hour | 3 requests   | `/api/request-demo`          |
| `inviteLimiter`         | Per org (`invite:<orgId>`) | 1 hour | 100 requests | `/api/send-invite-email`     |
| `emailTargetLimiter`    | Per recipient address      | 1 hour | 5 requests   | Email-sending routes         |
| `passwordResetLimiter`  | Per user                   | 15 min | 5 requests   | Gridmaster password reset    |
| `scheduleReviewLimiter` | Per user                   | 10 sec | 60 requests  | Schedule review endpoints    |
| `apiLimiter`            | Per user                   | 10 sec | 10 requests  | General authenticated routes |

Rate-limited responses return HTTP 429 with a `Retry-After` header.

---

## Security

All API routes include:

- **Input validation** via Zod schemas at the server boundary
- **CSRF protection** via Origin header validation on all mutation endpoints (`validateCsrfOrigin`)
- **Auth verification** — session or bearer token checked before any data access
- **Org scoping** — all queries filter by the caller's `org_id`; all UPDATE queries include an `org_id` WHERE clause
- **Sandbox guard** — destructive org mutations check `forbidIfSandboxCookie` to prevent sandbox-to-real-org privilege escalation
- **Self-action guards** — users cannot demote, bench, terminate, or remove their own account; admins cannot modify admin/super_admin/gridmaster roles

For the full security model, see [RBAC_SYSTEM_DESIGN.md](../RBAC_SYSTEM_DESIGN.md).

---

_DubGrid — Confidential_
