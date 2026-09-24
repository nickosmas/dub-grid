# DubGrid — API Reference

The browser never queries Supabase data tables directly: every application read and write goes through a Route Handler (`features/*/client/api.ts` → `/api/*` → `lib/db/*` → Supabase under RLS), and the mobile app reaches the same backend through the versioned `/api/mobile/v1/*` surface. Supabase Auth and Realtime are the only services the clients talk to directly.

All routes live under `apps/web/src/app/api/`.

---

## Authentication

Authenticated endpoints require a valid Supabase session cookie (`sb-*-auth-token`). The Next.js request proxy verifies JWT claims and injects `x-dubgrid-role`, `x-dubgrid-org-id`, and `x-dubgrid-org-slug` headers into every request.

The mobile API (`/api/mobile/v1/*`) uses a Bearer token in the `Authorization` header instead of cookies.

---

## Endpoints

154 Route Handler files: 114 web routes plus 40 under `/api/mobile/v1/`. Every mutating browser-facing route calls `validateCsrfOrigin`; every authenticated route re-verifies the session locally (`lib/api-auth.ts`) instead of trusting the request proxy.

### Public

| Method | Path                         | Purpose                                                                       | Rate Limit                                                                                           |
| ------ | ---------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                | Health check (DB reachability)                                                | None                                                                                                 |
| GET    | `/api/validate-domain`       | Check whether an org subdomain slug exists (Redis-cached)                     | IP-based (`apiLimiter`)                                                                              |
| POST   | `/api/request-demo`          | Demo request form submission (landing page)                                   | `demoLimiter` (3/hr per IP)                                                                          |
| POST   | `/api/auth/login`            | Email/password login; consolidates the org switch and trial start server-side | `loginLimiter` per email hash + `loginIpLimiter` per IP + `loginSurgeLimiter` global                 |
| POST   | `/api/auth/recovery-request` | Request a password-recovery email (generic response, security-audited)        | `apiLimiter` per source IP + `passwordResetLimiter` per target email + `recoverySurgeLimiter` global |
| POST   | `/api/consent`               | Record cookie consent preference                                              | None                                                                                                 |
| GET    | `/api/invitations/lookup`    | Look up a live invitation by token (uniform 404 for any dead token)           | None                                                                                                 |
| POST   | `/api/invitations/register`  | Create the invitee's pre-confirmed auth account (token is the credential)     | `apiLimiter` per IP + `emailTargetLimiter` per address                                               |
| POST   | `/api/users/check-email`     | Check email availability for supported public flows                           | `apiLimiter` per IP                                                                                  |
| POST   | `/api/stripe/webhook`        | Stripe webhook handler (signature-verified, replay-idempotent)                | None                                                                                                 |

### Scheduled jobs (`Authorization: Bearer $CRON_SECRET`)

| Method | Path                        | Purpose                                                                         | Schedule                                         |
| ------ | --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET    | `/api/cron/expire-requests` | Expire stale shift requests and pending invitations, notify the affected people | Hourly, `cron-expire-requests.yml` GitHub Action |
| GET    | `/api/cron/trial-expiry`    | Send trial-ending-soon and trial-expired billing notifications                  | Daily, `apps/web/vercel.json`                    |
| GET    | `/api/cron/sandbox-cleanup` | Delete abandoned test sandboxes (older than 14 days)                            | Daily, `apps/web/vercel.json`                    |

Each cron is also behind a `platform_feature_flags` kill switch (`cron_expire_requests`, `cron_trial_expiry`, `cron_sandbox_cleanup`).

---

### Auth and Session

| Method | Path                       | Purpose                                                                                                                      |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auth/organizations`  | List organizations the caller belongs to                                                                                     |
| POST   | `/api/auth/organizations`  | Switch active organization (calls `switch_org` RPC)                                                                          |
| POST   | `/api/auth/start-trial`    | Start 14-day trial on first super_admin login (calls `start_trial_for_org` RPC)                                              |
| POST   | `/api/auth/track-session`  | Record per-device session entry                                                                                              |
| POST   | `/api/auth/sign-out`       | Server-side sign-out: local scope writes the revocation marker; `global`/`others` scope requires fresh sensitive-action auth |
| GET    | `/api/auth/data-export`    | GDPR personal data export (JSON download); requires fresh sensitive-action auth                                              |
| POST   | `/api/auth/gdpr-erase`     | GDPR full data anonymization; requires fresh sensitive-action auth                                                           |
| DELETE | `/api/auth/delete-account` | Delete the authenticated user's account (super admins only; everyone else requests it); requires fresh sensitive-action auth |
| POST   | `/api/invitations/accept`  | Accept a pending invitation and complete registration                                                                        |
| GET    | `/api/trial-welcome`       | Check whether to show the trial welcome modal (held until onboarding completes)                                              |
| POST   | `/api/trial-welcome`       | Send trial welcome email via Resend (claimed atomically, sent once)                                                          |
| GET    | `/api/feature-flags`       | Client-visible subset of the platform kill switches                                                                          |

---

### Account

| Method                 | Path                                    | Purpose                                                                                  |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET                    | `/api/account/self`                     | Return the caller's profile + membership                                                 |
| GET                    | `/api/account/identity`                 | Return the caller's auth identity info                                                   |
| GET                    | `/api/account/org-context`              | Return the caller's current org context                                                  |
| GET                    | `/api/account/permissions`              | Return the caller's resolved permission set (impersonation-aware)                        |
| PATCH                  | `/api/account/profile`                  | Update display name, avatar, etc.                                                        |
| PATCH                  | `/api/account/profile/phone`            | Update phone number                                                                      |
| GET                    | `/api/account/change-requests`          | List pending profile change requests                                                     |
| POST                   | `/api/account/change-requests`          | Submit a profile change request                                                          |
| PATCH                  | `/api/account/change-requests/[id]`     | Approve or reject a change request                                                       |
| GET                    | `/api/account/sessions`                 | List the caller's active sessions                                                        |
| DELETE                 | `/api/account/sessions`                 | Revoke a session (other sessions require fresh sensitive-action auth)                    |
| POST                   | `/api/account/logout-cleanup`           | Clean up server state on logout                                                          |
| POST                   | `/api/account/mfa-status`               | Persist MFA status after a verified enrollment                                           |
| POST                   | `/api/account/mfa-lifecycle`            | `enroll`, `remove`, `reauthenticate`, or `cleanup` a TOTP factor (five-minute assurance) |
| POST                   | `/api/account/credential-assurance`     | Preflight a password or email change against the five-minute sensitive-action policy     |
| GET, POST, PUT, DELETE | `/api/account/calendar-subscription`    | Read, issue, rotate, or revoke the caller's private calendar feed token                  |
| GET                    | `/api/account/notification-preferences` | Get notification preferences                                                             |
| PUT                    | `/api/account/notification-preferences` | Update notification preferences                                                          |
| GET                    | `/api/account/terms`                    | Check whether the caller has accepted current terms                                      |
| POST                   | `/api/account/terms`                    | Record terms acceptance                                                                  |

---

### Organization

| Method | Path                                    | Purpose                                                                                    |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/organization/bootstrap`           | Load all org-scoped config for the current session                                         |
| GET    | `/api/organization/access-status`       | Report whether the organization gate would still hold this caller (recovery poll)          |
| GET    | `/api/organization/directory`           | Paginated staff directory (calls `get_org_directory` RPC)                                  |
| GET    | `/api/organization/employee-count`      | Return headcount for the org                                                               |
| GET    | `/api/organizations/users`              | List users in the org                                                                      |
| PATCH  | `/api/organizations/access`             | Update membership (role, permissions, departments)                                         |
| DELETE | `/api/organizations/access`             | Remove a user from the org                                                                 |
| PATCH  | `/api/organizations/app-only-user`      | Update an app-only member's details (target must be an active member of the effective org) |
| POST   | `/api/organizations/delete`             | Soft-delete the caller's org (super_admin only, fresh sensitive-action auth)               |
| GET    | `/api/organizations/invitations`        | List pending invitations                                                                   |
| POST   | `/api/organizations/invitations`        | Create an invitation                                                                       |
| PATCH  | `/api/organizations/invitations`        | Update an invitation (access changes replace the token atomically)                         |
| DELETE | `/api/organizations/invitations`        | Revoke an invitation                                                                       |
| POST   | `/api/organizations/invitations/create` | Create an invitation and email its link; a failed send creates nothing                     |
| POST   | `/api/organizations/role-change`        | Change a member's org role                                                                 |
| PUT    | `/api/organizations/settings`           | Update org settings                                                                        |
| GET    | `/api/onboarding`                       | Get onboarding state                                                                       |
| POST   | `/api/onboarding`                       | Advance or complete onboarding step                                                        |
| GET    | `/api/settings/config`                  | Read org-level config overrides                                                            |
| POST   | `/api/settings/config`                  | Update org-level config overrides                                                          |

---

### Employees

| Method | Path                               | Purpose                                                                                                                                            |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/employees/manage`            | Create or update an employee record                                                                                                                |
| POST   | `/api/employees/status`            | Update employee status (active/benched/terminated)                                                                                                 |
| PATCH  | `/api/employees/identity`          | Update employee identity fields                                                                                                                    |
| POST   | `/api/employees/check-email`       | Pre-flight duplicate check for an invite or management-access email                                                                                |
| POST   | `/api/employees/check-phone`       | Pre-flight duplicate check for an invite phone number                                                                                              |
| GET    | `/api/people/change-requests`      | List pending people change requests (account deletions are listed for super admins only)                                                           |
| PATCH  | `/api/people/change-requests/[id]` | Approve or reject a people change request (only a super admin decides an account deletion, and approving one requires fresh sensitive-action auth) |
| POST   | `/api/import/employees`            | Bulk-import employees from CSV (blocks exact duplicates, warns on similar names)                                                                   |

---

### Schedule

| Method | Path                                   | Purpose                                                                                            |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | `/api/schedule/manage`                 | Write schedule cell changes (draft + publish); recurring/series keys also require `canEditShifts`  |
| POST   | `/api/shifts/publish`                  | Publish a draft schedule range                                                                     |
| POST   | `/api/shifts/discard`                  | Discard unpublished draft cells                                                                    |
| POST   | `/api/shifts/repeat-overwrites`        | Detect conflicts before applying a recurring shift                                                 |
| GET    | `/api/schedule/published-ranges`       | List published date ranges (`publishedBy` withheld from viewers who cannot open publish history)   |
| GET    | `/api/schedule/publish-history`        | Full publish history (management read)                                                             |
| GET    | `/api/schedule/publish-history/recent` | Most-recent publish entries (`publishedBy` withheld from viewers who cannot open publish history)  |
| POST   | `/api/schedule/actor-names`            | Resolve actor display names for publish history (org-scoped ids only)                              |
| GET    | `/api/schedule/presence-profiles`      | Display details for the editors currently present on the schedule                                  |
| GET    | `/api/schedule/editor-sessions`        | Report the caller's schedule editor session state (also allowed during setup or a locked org)      |
| POST   | `/api/schedule/editor-sessions`        | End one of the caller's own editor sessions (tombstoned in `schedule_editor_session_terminations`) |
| POST   | `/api/schedule/recurring`              | Apply recurring shift templates to a date range                                                    |
| POST   | `/api/schedule/requests`               | Create a shift request (pickup/swap/calloff)                                                       |

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

### Reports, Export, and Calendar

| Method | Path                             | Purpose                                                                                                                |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/reports/operations`        | Operational reports data (`canViewReports`); options-only mode fills the filter dropdowns without computing the report |
| GET    | `/api/reports/operations/export` | Export operations report (CSV)                                                                                         |
| GET    | `/api/export`                    | Schedule export (PDF/CSV); staff export requires `canViewEmployeeDetails`                                              |
| GET    | `/api/calendar`                  | iCalendar (.ics) export of the authenticated user's schedule                                                           |
| GET    | `/api/calendar/feed/[token]`     | Token-authenticated `.ics` subscription feed for calendar apps (published shifts only)                                 |

---

### Dashboard

| Method | Path                       | Purpose                                |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/api/dashboard/analytics` | Aggregated analytics for the dashboard |
| GET    | `/api/billing`             | Billing status and subscription info   |

---

### Invitations and Email

| Method | Path                        | Purpose                            |
| ------ | --------------------------- | ---------------------------------- |
| POST   | `/api/notify-impersonation` | Log impersonation start/end events |

---

### Stripe Billing

| Method | Path                            | Purpose                                     |
| ------ | ------------------------------- | ------------------------------------------- |
| POST   | `/api/stripe/create-checkout`   | Create a Stripe Checkout session            |
| POST   | `/api/stripe/checkout-complete` | Handle post-checkout success                |
| POST   | `/api/stripe/billing-portal`    | Redirect to the Stripe Customer Portal      |
| POST   | `/api/stripe/webhook`           | Stripe webhook handler (signature-verified) |

All four are behind the `stripe` platform kill switch (503 when disabled).

---

### Test Sandbox

| Method | Path                | Purpose                                                                                          |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| POST   | `/api/test-sandbox` | `enter`, `reset`, or `exit` a test sandbox (admin+ by real source-org role, CSRF + rate-limited) |

---

### Gridmaster Only

All gridmaster routes require `platform_role = 'gridmaster'` in the JWT. They are served by `apps/web/src/features/gridmaster/`.

| Method         | Path                                          | Purpose                                                                                                                                                     |
| -------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/api/gridmaster/overview`                    | High-level platform overview                                                                                                                                |
| GET            | `/api/gridmaster/dashboard`                   | Gridmaster dashboard data                                                                                                                                   |
| GET, POST      | `/api/gridmaster/accounts`                    | List and manage gridmaster accounts                                                                                                                         |
| GET            | `/api/gridmaster/users`                       | Search all users across orgs                                                                                                                                |
| PATCH          | `/api/gridmaster/users`                       | Update a user's platform state                                                                                                                              |
| GET            | `/api/gridmaster/users/[userId]/memberships`  | All org memberships for a user                                                                                                                              |
| POST           | `/api/gridmaster/users/[userId]/force-logout` | Terminate all sessions for a user (fresh sensitive-action auth)                                                                                             |
| POST           | `/api/gridmaster/users/[userId]/terminate`    | Terminate an account platform-wide: memberships archived, employee rows removed, sessions cut, org-side reinstatement blocked (fresh sensitive-action auth) |
| POST           | `/api/gridmaster/users/[userId]/reinstate`    | Lift a platform termination; access is granted again explicitly by a gridmaster (fresh sensitive-action auth)                                               |
| POST           | `/api/gridmaster/organizations/manage`        | Manage org lifecycle (suspend, restore, archive)                                                                                                            |
| GET            | `/api/gridmaster/invitations`                 | List invitations across all orgs                                                                                                                            |
| GET            | `/api/gridmaster/audit-log`                   | Paginated audit log for a period                                                                                                                            |
| GET            | `/api/gridmaster/audit-log/day-counts`        | Per-day event counts for the period navigator                                                                                                               |
| GET            | `/api/gridmaster/audit-log/full`              | Full unfiltered audit log                                                                                                                                   |
| POST           | `/api/gridmaster/audit-log/export`            | Export audit log to CSV                                                                                                                                     |
| GET            | `/api/gridmaster/billing`                     | Billing overview across all orgs                                                                                                                            |
| POST           | `/api/gridmaster/subscription`                | Manage an org's subscription tier                                                                                                                           |
| POST           | `/api/gridmaster/stripe-sync`                 | Force-sync Stripe data for an org                                                                                                                           |
| GET            | `/api/gridmaster/org-health`                  | Org health metrics                                                                                                                                          |
| GET            | `/api/gridmaster/compliance`                  | Compliance report                                                                                                                                           |
| GET            | `/api/gridmaster/security`                    | Security overview                                                                                                                                           |
| GET            | `/api/gridmaster/security/sessions`           | Active sessions across orgs                                                                                                                                 |
| POST           | `/api/gridmaster/password-reset`              | Force a password reset for any user                                                                                                                         |
| GET            | `/api/gridmaster/impersonation`               | Impersonation history                                                                                                                                       |
| POST           | `/api/gridmaster/impersonation`               | Start an impersonation session                                                                                                                              |
| GET            | `/api/gridmaster/schedule`                    | Schedule data across orgs                                                                                                                                   |
| GET, POST, PUT | `/api/gridmaster/platform-flags`              | Read, create, or flip the platform kill switches (invalidates Redis and the Next data cache)                                                                |

The org-scoped Activity Log and per-person Activity pages read the same audit registry through `/api/gridmaster/audit-log` and `/audit-log/day-counts` with an organization-scoped audience; the route authorizes by audience, not only by platform role.

---

## Mobile API (v1)

The mobile app (Expo) communicates exclusively with these endpoints. All routes are under `apps/web/src/app/api/mobile/v1/` and delegate to `apps/web/src/features/mobile/server/routes/`, which in turn use `@dubgrid/mobile-api-core`. Authentication uses a Bearer token (no cookies); `requireMobileAuth` verifies it locally, checks revocation, and honors the `mobile_api` kill switch. Sandboxes are excluded from mobile login. Routes that a web client might also call answer `OPTIONS` for CORS.

### Auth and Bootstrap

| Method | Path                                   | Purpose                                                                                   |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `/api/mobile/v1/auth/login`            | Email/password login, returns session token (or a required-MFA challenge)                 |
| POST   | `/api/mobile/v1/auth/recovery-request` | Request a password-recovery email (same handler and limits as the web route)              |
| POST   | `/api/mobile/v1/auth/sign-out`         | Bearer twin of `/api/auth/sign-out`: local writes the marker; bulk needs fresh assurance  |
| GET    | `/api/mobile/v1/auth/organization`     | Get the caller's current org context                                                      |
| GET    | `/api/mobile/v1/bootstrap`             | Load all data required on app launch (permissions, terminology, `acceptedCurrentTerms`)   |
| GET    | `/api/mobile/v1/org-status`            | Why the organization is unavailable; detail only for roles that own billing or the tenant |
| GET    | `/api/mobile/v1/dashboard`             | Canonical dashboard payload (coverage, open shifts, drafts) for the current week          |

### Schedule

| Method | Path                          | Purpose                                |
| ------ | ----------------------------- | -------------------------------------- |
| GET    | `/api/mobile/v1/me/schedule`  | Authenticated user's upcoming shifts   |
| GET    | `/api/mobile/v1/org/schedule` | Full org schedule for authorized users |

### Shift Requests

| Method | Path                                         | Purpose                                         |
| ------ | -------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/mobile/v1/shift-requests`              | List shift requests (pickup/swap/calloff)       |
| POST   | `/api/mobile/v1/shift-requests`              | Create a shift request                          |
| PATCH  | `/api/mobile/v1/shift-requests/[id]`         | Respond to, resolve, claim, or cancel a request |
| GET    | `/api/mobile/v1/shift-requests/history`      | The caller's resolved request history           |
| GET    | `/api/mobile/v1/shift-requests/swap-options` | List eligible shifts for a swap request         |

### People

| Method              | Path                                           | Purpose                                                     |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| GET                 | `/api/mobile/v1/people`                        | Paginated people directory                                  |
| POST                | `/api/mobile/v1/people`                        | Add a staff member (`canManageEmployees`)                   |
| POST                | `/api/mobile/v1/people/contact-check`          | Pre-flight duplicate email/phone check for the person forms |
| GET                 | `/api/mobile/v1/people/[id]`                   | Person detail (fields redacted by the caller's permissions) |
| PATCH               | `/api/mobile/v1/people/[id]`                   | Update a person record                                      |
| PATCH               | `/api/mobile/v1/people/[id]/status`            | Update employee status                                      |
| PATCH               | `/api/mobile/v1/people/[id]/access`            | Change the person's org role (member or pending invitation) |
| POST, PATCH, DELETE | `/api/mobile/v1/people/[id]/invitation`        | Send, resend, or revoke an invitation for a person          |
| PUT, DELETE         | `/api/mobile/v1/people/[id]/management-access` | Grant or revoke management access (departments only)        |

### Management Users

| Method      | Path                                                    | Purpose                                |
| ----------- | ------------------------------------------------------- | -------------------------------------- |
| GET, POST   | `/api/mobile/v1/management-users`                       | List or create mobile management users |
| PUT, DELETE | `/api/mobile/v1/management-users/[personId]`            | Update or remove a management user     |
| POST        | `/api/mobile/v1/management-users/[personId]/invitation` | Send a management-user invitation      |

### Notifications

| Method | Path                                    | Purpose                                       |
| ------ | --------------------------------------- | --------------------------------------------- |
| GET    | `/api/mobile/v1/notifications`          | Paginated notification inbox                  |
| GET    | `/api/mobile/v1/notifications/facets`   | Inbox facet counts                            |
| PATCH  | `/api/mobile/v1/notifications/[id]`     | Mark single notification read/unread/archived |
| POST   | `/api/mobile/v1/notifications/actions`  | Bulk read/unread/archive/delete operations    |
| POST   | `/api/mobile/v1/notifications/read-all` | Mark all notifications read                   |

### Profile

| Method   | Path                                              | Purpose                                                                                              |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET      | `/api/mobile/v1/profile`                          | Authenticated user's profile                                                                         |
| PATCH    | `/api/mobile/v1/profile/account`                  | Update account fields                                                                                |
| PATCH    | `/api/mobile/v1/profile/phone`                    | Update phone number                                                                                  |
| PATCH    | `/api/mobile/v1/profile/mfa-status`               | Persist post-enrollment MFA status                                                                   |
| POST     | `/api/mobile/v1/profile/mfa-lifecycle`            | `enroll`, `remove`, `reauthenticate`, or `cleanup` a TOTP factor                                     |
| POST     | `/api/mobile/v1/profile/credential-assurance`     | Preflight a credential change against the five-minute sensitive-action policy                        |
| POST     | `/api/mobile/v1/profile/terms`                    | Record acceptance of the current terms version                                                       |
| GET      | `/api/mobile/v1/profile/change-requests`          | List pending change requests                                                                         |
| POST     | `/api/mobile/v1/profile/change-requests`          | Submit a change request                                                                              |
| PATCH    | `/api/mobile/v1/profile/change-requests/[id]`     | Approve or reject a change request (account deletions: super admin plus fresh sensitive-action auth) |
| GET, PUT | `/api/mobile/v1/profile/notification-preferences` | Get/set notification preferences                                                                     |
| GET      | `/api/mobile/v1/profile/sessions`                 | List active sessions                                                                                 |
| DELETE   | `/api/mobile/v1/profile/sessions`                 | Revoke a session                                                                                     |

### Device and Presence

| Method | Path                              | Purpose                       |
| ------ | --------------------------------- | ----------------------------- |
| POST   | `/api/mobile/v1/push-tokens`      | Register an Expo push token   |
| POST   | `/api/mobile/v1/session-presence` | Update session presence state |

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

| RPC                                                        | Purpose                                                                          | Auth          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| `publish_schedule`                                         | Publish a draft schedule range                                                   | Admin+        |
| `create_shift_series`                                      | Create a recurring shift series                                                  | Admin+        |
| `update_series_all_shifts`                                 | Batch-update all shifts in a series                                              | Admin+        |
| `delete_shift_series`                                      | Remove a shift series                                                            | Admin+        |
| `move_shift`                                               | Move a shift to a different slot                                                 | Admin+        |
| `upsert_recurring_shift`                                   | Create or update a recurring shift template                                      | Admin+        |
| `delete_schedule_cell_draft`                               | Discard a draft cell                                                             | Admin+        |
| `write_schedule_cell_snapshot`                             | Upsert a cell's draft or published snapshot (the source of truth for cell state) | Admin+        |
| `get_schedule_cell_snapshot_payload`                       | Read a cell's current snapshot payload                                           | Authenticated |
| `import_previous_schedule`                                 | Copy a previous period's published cells into the draft                          | Admin+        |
| `set_job_shift_overrides`                                  | Save per-job shift overrides                                                     | Admin+        |
| `get_publish_history`                                      | Paginated publish history                                                        | Management    |
| `get_schedule_last_viewed` / `update_schedule_last_viewed` | Per-member schedule last-viewed marker                                           | Authenticated |

### Shift Requests

| RPC                          | Purpose                                                                                                                                                                          | Auth            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `create_shift_request`       | Create a pickup/swap/calloff request                                                                                                                                             | Authenticated   |
| `respond_to_shift_request`   | Accept or decline a shift request                                                                                                                                                | Authenticated   |
| `resolve_shift_request`      | Approve or reject a shift request                                                                                                                                                | Admin+          |
| `auto_approve_shift_request` | Approve a request just entered into the queue when the requester or the accepting party can approve shift requests; returns the approver and note, or NULL when nobody qualifies | Party or admin+ |
| `cancel_shift_request`       | Cancel a pending request                                                                                                                                                         | Authenticated   |
| `claim_shift_request`        | Claim an open pickup request                                                                                                                                                     | Authenticated   |
| `volunteer_for_open_shift`   | Volunteer for an open shift                                                                                                                                                      | Authenticated   |

Every transition into `pending_approval` (a call-off, a volunteer, a claim, an
accepted swap or targeted pickup) is followed by `auto_approve_shift_request`
on the same session. When an approver is party to the request it is approved
on their behalf with the note `Auto-approved: <name> can approve shift
requests`, and the create and update responses on `/api/schedule/requests` and
`/api/mobile/v1/shift-requests` carry `autoApproved: true`. A gridmaster
impersonating a member never settles anything, and any failure leaves the
request in the queue exactly as before.

### Notifications

| RPC                                                                                                                                     | Purpose                                                                                        | Auth          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------- |
| `get_notifications`                                                                                                                     | Keyset-paginated inbox with filters and search                                                 | Authenticated |
| `get_notification_facets`                                                                                                               | Facet counts for inbox filters                                                                 | Authenticated |
| `get_unread_notification_count`                                                                                                         | Unread badge count                                                                             | Authenticated |
| `mark_notification_read`                                                                                                                | Mark a single notification read                                                                | Authenticated |
| `mark_all_notifications_read`                                                                                                           | Mark all notifications read                                                                    | Authenticated |
| `mark_notification_read_with_unread_count` / `mark_all_notifications_read_with_unread_count` / `mutate_notifications_with_unread_count` | Atomic mobile mutations that return the unread count from the same transaction (migration 008) | Authenticated |

### Org and People

| RPC                                 | Purpose                                                                                     | Auth                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------- |
| `get_org_users`                     | List members with roles and permissions                                                     | Admin+                |
| `get_org_directory`                 | Staff directory (paginated)                                                                 | Authenticated         |
| `send_invitation`                   | Issue an invitation token                                                                   | Admin+                |
| `replace_pending_invitation_access` | Replace a live invitation's access level atomically (old token stops working)               | Admin+                |
| `accept_invitation`                 | Accept and consume an invitation token (row-locked, single use, recipient email must match) | Authenticated invitee |
| `update_mobile_employee_with_audit` | Mobile employee update plus audit row in one transaction (migration 009)                    | Admin+                |
| `remove_focus_area_from_employees`  | Bulk-remove a focus area from staff                                                         | Admin+                |

### Gridmaster Queries

| RPC                           | Purpose                                                                                      | Auth            |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `get_all_users_with_profiles` | All users across all orgs                                                                    | Gridmaster only |
| `get_gridmaster_accounts`     | All gridmaster-role accounts                                                                 | Gridmaster only |
| `get_audit_log`               | Platform-wide audit log                                                                      | Gridmaster only |
| `get_filtered_audit_log`      | Audience-filtered audit log for the org Activity Log and per-person activity (migration 007) | Management      |
| `get_tenant_stats`            | Per-org statistics                                                                           | Gridmaster only |

---

## Rate Limiting

Rate limits are enforced via Upstash Redis sliding windows. The limiters are defined in `apps/web/src/lib/rate-limit.ts`. `checkRateLimit` fails closed (503) in production when Redis is unconfigured or unreachable, and allows through in development unless `RATE_LIMIT_IN_DEV` is set.

| Limiter                 | Scope                        | Window | Limit                                     | Used On                                                |
| ----------------------- | ---------------------------- | ------ | ----------------------------------------- | ------------------------------------------------------ |
| `loginLimiter`          | Per email (SHA-256 hash)     | 15 min | 15 (`LOGIN_EMAIL_LIMIT_PER_15_MIN`)       | `/api/auth/login`, mobile login                        |
| `loginIpLimiter`        | Per source IP                | 1 min  | 120 (`LOGIN_IP_LIMIT_PER_MINUTE`)         | `/api/auth/login`, mobile login                        |
| `loginSurgeLimiter`     | Global                       | 10 sec | 500 (`LOGIN_GLOBAL_LIMIT_PER_10_SECONDS`) | `/api/auth/login`, mobile login (load shedding)        |
| `passwordResetLimiter`  | Per target email hash        | 15 min | 5 requests                                | Recovery requests, gridmaster password reset           |
| `recoverySurgeLimiter`  | Global                       | 10 sec | 100 requests                              | Recovery requests                                      |
| `demoLimiter`           | Per IP                       | 1 hour | 3 requests                                | `/api/request-demo`                                    |
| `inviteLimiter`         | Per acting user              | 1 hour | 100 requests                              | `/api/organizations/invitations/create`                |
| `emailTargetLimiter`    | Per recipient address        | 1 hour | 5 requests                                | Email-sending routes                                   |
| `scheduleReviewLimiter` | Per user                     | 10 sec | 60 requests                               | Schedule review endpoints                              |
| `apiLimiter`            | Per user (or IP when public) | 10 sec | 10 requests                               | General authenticated and public routes, MFA lifecycle |

Rate-limited responses return HTTP 429 with a `Retry-After` header, which the clients honor before any automatic retry.

---

## Security

All API routes include:

- **Input validation** via Zod schemas at the server boundary
- **CSRF protection** via Origin header validation on all mutation endpoints (`validateCsrfOrigin`)
- **Auth verification** - session or bearer token checked before any data access
- **Org scoping** - all queries filter by the caller's `org_id`; all UPDATE queries include an `org_id` WHERE clause
- **Sandbox guard** - destructive org mutations check `forbidIfSandboxCookie` to prevent sandbox-to-real-org privilege escalation
- **Self-action guards** - users cannot demote, bench, terminate, or remove their own account; admins cannot modify admin/super_admin/gridmaster roles
- **Sensitive-action assurance** - MFA changes, credential updates, other-session revocation, data export, and account or organization deletion require a human authentication step within the last five minutes (`requireSensitiveActionAuth`; AAL2 when a verified TOTP factor exists, otherwise a fresh password proof)
- **Live authorization** - every authenticated request is checked against a signature-verified, non-revoked session and the caller's current membership in exactly one live organization; stale org claims and archived memberships fail closed
- **Security audit events** - recovery requests, step-up outcomes, and other security-relevant results are written through `lib/auth/security-audit.ts` without recording secrets

For the full security model, see [RBAC_SYSTEM_DESIGN.md](../RBAC_SYSTEM_DESIGN.md).

---

_DubGrid — Confidential_
