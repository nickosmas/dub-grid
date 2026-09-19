# DubGrid — System Architecture

---

## 1. Overview

DubGrid is a multi-tenant employee scheduling platform built for care facilities. The system replaces spreadsheet-based scheduling with a real-time collaborative web application plus a companion mobile app, supporting multiple organizations, each isolated by subdomain.

DubGrid is a **monorepo** — npm workspaces orchestrated by Turborepo — containing two apps (`apps/web`, `apps/mobile`), eleven shared packages (`packages/*`), and the Supabase project (`supabase/`). The web app is the source of truth for all business logic and the database; the mobile app is a thin client that talks only to a versioned mobile API surface served by the web app.

```
┌──────────────────────────────┐      ┌──────────────────────────────┐
│   apps/web  (browser)        │      │   apps/mobile (Expo / RN)    │
│   Next.js 16 · React 19      │      │   Expo SDK 54 · Expo Router  │
│   Tailwind v4 · React Query  │      │   React Query · @dubgrid/    │
│   @dnd-kit                   │      │   api-client + contracts     │
└──────────────┬───────────────┘      └──────────────┬───────────────┘
               │                                     │
               │  (browser → own /api/* routes)      │ (HTTPS → /api/mobile/v1/*)
               ▼                                     │
┌─────────────────────────────────────────────────────────────────┐
│            Next.js request proxy (apps/web/src/proxy.ts)          │
│  JWT verification · Subdomain routing · RBAC route guards         │
│  Org-suspension check · Headers: x-dubgrid-org-id / -org-slug     │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js App Router  (apps/web)                       │
│  Server Components · Route Handlers (/api/*, /api/mobile/v1/*)    │
│  features/*/server · lib/db/* server data-access barrel           │
│  packages: authz · client-errors · contracts · data-access ·      │
│    db-types · design-tokens · domain · mobile-api-core ·          │
│    realtime-core · schedule-core                                  │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                  │
│  PostgreSQL · Auth (JWT + Custom Claims) · Realtime · RLS         │
│  Ordered forward migrations (001-020) · Row-level org isolation   │
└─────────────────────────────────────────────────────────────────┘

External services: Stripe (billing) · Resend (email) · PostHog (analytics)
Sentry (errors) · Upstash Redis (cache + rate limiting) · Vercel Analytics
Expo push notifications
```

---

## 2. Monorepo & Workspace Structure

DubGrid uses **npm workspaces** (`apps/*`, `packages/*`) orchestrated by **Turborepo**. Toolchain: Node 22.x (`.nvmrc` 22.13.0), npm 10.9.2.

### Apps

| Workspace | Package name      | Stack                                        | Path          |
| --------- | ----------------- | -------------------------------------------- | ------------- |
| Web       | `@dubgrid/web`    | Next.js 16 App Router, React 19, Tailwind v4 | `apps/web`    |
| Mobile    | `@dubgrid/mobile` | Expo SDK 54, React Native, Expo Router       | `apps/mobile` |

### Shared Packages

All eleven packages are private, versioned `0.1.0`, ESM, and build with `tsc` to `dist/` (`npm run build:packages`).

| Package                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                   | Depends on                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@dubgrid/domain`          | Platform-neutral domain types/enums + pure logic. `Organization` (incl. `workspaceKind` / `sandbox*`), `AdminPermissions` (26 perms), role enums, billing types, `requests`, `staff`, `password` rules, `terms`, `alert-destination` (the shared alert resolver), `notification-metadata`, `self-guard.ts` (`SelfActionForbiddenError`, `assertNotSelf`, `isSelfAction`).                 | none                                                                     |
| `@dubgrid/contracts`       | Zod schemas + inferred types for cross-app API contracts. One `.` export re-exporting `schedule`, `mobile`, `staff`, and `mfa` (there is no `./mobile` subpath).                                                                                                                                                                                                                          | `zod`                                                                    |
| `@dubgrid/db-types`        | DB-row TS types (`DbOrganization`, etc.): `catalog`, `organization`, `requests`, `schedule`, `staff`.                                                                                                                                                                                                                                                                                     | `contracts`, `domain`                                                    |
| `@dubgrid/authz`           | Permission logic: `ROLE_LEVEL`, `ALL_PERMS` / `READ_ONLY_PERMS` / `ADMIN_DEFAULT_PERMS`, `VIEW_IMPLICATIONS` / `applyViewImplications`, `buildPermissionContext` / `buildPerms`, `extractJwtClaims`, `getPermissionsFromSession`, plus `assurance.ts` (the five-minute sensitive-action policy shared by web and mobile).                                                                 | `domain`, `@supabase/supabase-js`                                        |
| `@dubgrid/schedule-core`   | Schedule transformation / calculation logic: coverage engine, hours and pay-period math, open-shift derivation, request assembly, segment alignment, team-schedule shaping. Used by the web dashboard, the mobile API, and the mobile app.                                                                                                                                                | `contracts`, `domain`                                                    |
| `@dubgrid/data-access`     | Supabase query + data-mapping layer; currently powers the shared mobile data layer.                                                                                                                                                                                                                                                                                                       | `contracts`, `db-types`, `domain`, `@supabase/supabase-js`               |
| `@dubgrid/mobile-api-core` | Framework-neutral mobile backend orchestration consumed by web's `/api/mobile/v1` routes. Modules: `auth`, `dashboard`, `organization`, `people-status`, `push`, `read`, `setup`, `shift-requests`, `write`. Rejects sandbox organizations for mobile login.                                                                                                                              | `authz`, `contracts`, `domain`, `schedule-core`, `@supabase/supabase-js` |
| `@dubgrid/api-client`      | Platform-neutral HTTP client primitives: `createHeaders`, `appendQueryParams`, `createJsonApiRequest`, `ApiResponseError`.                                                                                                                                                                                                                                                                | none                                                                     |
| `@dubgrid/client-errors`   | Shared client-facing error translation (friendly-copy pattern tables, network-error detection, `formatClientErrorMessage`) plus the degraded-network auth recovery policy (`isRetryableAuthRecoveryError`, `getAuthRecoveryRetryDelay`, `createAuthRecoverySingleFlight`: bounded exponential backoff, `Retry-After` precedence, one shared in-flight attempt). Both apps delegate to it. | none                                                                     |
| `@dubgrid/design-tokens`   | Shared design values: avatar tone and typography, elevation, gradients, icon tone, job-chip tone, numeric-badge contract, pill colors, motion, the animated mark, and the `mobile*` spacing/type/control ramps.                                                                                                                                                                           | none                                                                     |
| `@dubgrid/realtime-core`   | Shared Supabase Realtime primitives: org-scoped channel names, reference-counted org subscriptions, Postgres-changes helpers, and a debounced invalidation flusher. Both apps' org/account/shift-request/notification realtime hooks are built on it.                                                                                                                                     | `@supabase/supabase-js`                                                  |

### Dependency Boundaries

```
apps/web    consumes →  authz · client-errors · contracts · data-access ·
                        db-types · design-tokens · domain · mobile-api-core ·
                        realtime-core · schedule-core
apps/mobile consumes →  api-client · client-errors · contracts ·
                        design-tokens · domain · realtime-core · schedule-core
```

The mobile app never reads or writes Supabase data tables: all data goes over HTTP to `/api/mobile/v1/*`. It does depend on `@supabase/supabase-js` for Supabase Auth itself (sign-in, session restoration, TOTP, the in-app recovery OTP) and for Realtime subscriptions through `@dubgrid/realtime-core`. The web app is the only workspace that touches the database directly.

---

## 3. Multi-Tenant Architecture

### Subdomain-Based Routing

Every organization gets a unique subdomain. The request proxy resolves the subdomain to an org context before any page renders.

| URL Pattern                 | Resolution                       |
| --------------------------- | -------------------------------- |
| `acme.dubgrid.com/schedule` | Org "Acme", schedule page        |
| `gridmaster.dubgrid.com`    | Gridmaster command center        |
| `dubgrid.com`               | Landing page (public)            |
| `dubgrid.local:3000` (dev)  | Local development (no subdomain) |

### Org Isolation

Tenant isolation is enforced at three levels:

1. **Request proxy** — Verifies the user's JWT `org_slug` matches the subdomain. Redirects on mismatch. Also performs a Redis-cached org-suspension check. Route Handlers re-verify independently (`lib/api-auth.ts`): local ES256 verification against Supabase's JWKS plus a Redis revocation check for ordinary requests; only sensitive actions (`requireLiveAuthenticatedSession`) and the mobile MFA-factor check go back to Supabase Auth.
2. **Application** — All data queries (server-side) include `org_id` from the authenticated session.
3. **Database (RLS)** — Every table policy filters by `caller_org_id()`, extracted from the JWT. Even if application code is buggy, RLS prevents cross-tenant data access. **RLS is the real security boundary** — the request proxy is a fast first filter, not the sole gate.

### Local Development

Subdomains are simulated using `dubgrid.local` entries in `/etc/hosts`. The `parseHost()` utility in `apps/web/src/lib/subdomain.ts` handles both production (`org.dubgrid.com`) and local (`dubgrid.local:3000`) hostname formats.

---

## 4. Authentication & Authorization

### Three Security Layers

| Layer                                               | Where              | What It Does                                                                                              | Failure Mode                  |
| --------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Next.js request proxy** (`apps/web/src/proxy.ts`) | Every page request | JWT verification, role-based route blocking, subdomain enforcement, org-suspension check, per-request CSP | Redirects to `/login`         |
| **Custom JWT Claims**                               | Supabase auth hook | Injects `platform_role`, `org_role`, `org_id`, `org_slug` into JWT at sign-in                             | User gets default `user` role |
| **Row-Level Security**                              | PostgreSQL         | Every query filtered by `caller_org_id()` and role checks                                                 | Query returns empty / blocked |

> **Middleware JWT fallback:** the `jwtVerify` catch block falls back to `decodeJwt` (unverified) for non-gridmaster users — `jwtVerify` can fail in production, and RLS is the real boundary. Gridmaster is always blocked from unverified tokens. This fallback must never be removed.

### JWT Claims Structure

Claims are written at the **top level** of the JWT payload by `custom_access_token_hook` — NOT inside `app_metadata`:

```json
{
  "sub": "user-uuid",
  "platform_role": "none",
  "org_role": "admin",
  "org_id": "org-uuid",
  "org_slug": "acme"
}
```

### Role Hierarchy

```
Gridmaster (4) ─── platform_role = 'gridmaster'
    │                Global access, all orgs · route /gridmaster
    ▼
Super Admin (3) ── org_role = 'super_admin'
    │                Full org access, manages users + permissions
    ▼
Admin (2) ──────── org_role = 'admin'
    │                Per-user configurable permissions (26 flags)
    ▼
User (0) ───────── org_role = 'user'
                     Read-only (canViewSchedule + canViewStaff)
```

**Effective role** is calculated as: if `platform_role === 'gridmaster'`, role is gridmaster; otherwise, use `org_role`. The gridmaster portal is never called the "admin portal".

### Admin Permission Model

Instead of fixed role-based capabilities, admins have **26 individually configurable permissions** stored as JSONB in `organization_memberships.admin_permissions`. The canonical `AdminPermissions` interface lives in `packages/domain/src/permissions.ts`; permission logic lives in `@dubgrid/authz`.

The 26 permissions, in interface order:

```
1  canViewSchedule*           14 canManageFocusAreas
2  canEditShifts              15 canViewScheduleDefinitions
3  canPublishSchedule         16 canManageScheduleDefinitions
4  canApplyRecurringSchedule  17 canViewIndicatorTypes
5  canEditNotes               18 canManageIndicatorTypes
6  canEditScheduleIndicators  19 canManageOrgSettings
7  canViewRecurringShifts     20 canViewOrgLabels
8  canManageRecurringShifts   21 canManageOrgLabels
9  canManageShiftSeries       22 canViewCoverageRequirements
10 canViewStaff*              23 canManageCoverageRequirements
11 canViewEmployeeDetails     24 canApproveShiftRequests
12 canManageEmployees         25 canViewDashboardAnalytics
13 canViewFocusAreas          26 canViewReports
```

Model rules:

- `canViewSchedule` and `canViewStaff` (*) are always true for any authenticated user.
- **View implications** - `canManage*` implies the matching `canView*`. Applied by `applyViewImplications` in `@dubgrid/authz`.
- **Role baselines** - a `user` resolves against `READ_ONLY_PERMS` (all `false`); an `admin` resolves against `ADMIN_DEFAULT_PERMS` (schedule editing and publishing, notes and indicators, recurring shifts, Reports, no people management or administration). A stored JSONB overrides the baseline key by key, and a `user`-role member never inherits a stored set.
- **Per-person, not per-department** - a member's effective permissions are their `org_role` baseline plus the per-person `admin_permissions` set on the People page. Departments do **not** grant permissions; `departments.permissions` is vestigial. (An earlier department-template union model was reverted and its `unionPermissions` helper removed from `@dubgrid/authz`.)
- Super admins toggle these per user via the `PermissionsEditor` component (`apps/web/src/components/PermissionsEditor.tsx`), which reads the same `VIEW_IMPLICATIONS` map the resolver applies so an implied view shows as "Included" rather than a switch.
- Always super-admin-only and **not delegable**: `canManageUsers`, `canConfigureAdminPermissions`, `canManageOrgSettings`.
- **Paired keys at the API** - `canApplyRecurringSchedule` and `canManageShiftSeries` also require `canEditShifts`; writing a schedule note requires `canEditScheduleIndicators` alongside `canEditNotes`.

This design lets organizations create specialized admin roles (e.g. a "Schedule Manager" who can edit shifts but not manage employees) without new database roles.

### Password Reset, Email Verification, and MFA

The authentication system includes complete self-service flows:

- **Forgot Password** (`/forgot-password`) - the browser posts to `POST /api/auth/recovery-request`, which applies source, per-target, and global rate limits, writes a security audit event, and only then calls Supabase `resetPasswordForEmail()`. The response is generic (always success) so account existence is never revealed. Mobile uses the same handler at `/api/mobile/v1/auth/recovery-request` and completes the reset in-app with a 6-digit code (`verifyOtp`).
- **Reset Password** (`/reset-password`) - Token-validated form with password strength meter (4 levels). Password rules live once in `@dubgrid/domain` (`password.ts`). Signs the user out after reset.
- **Email Verification** (`/verify-email`) - Invited accounts are created pre-confirmed by `/api/invitations/register`, so this page only serves accounts that are genuinely unconfirmed (resend with a 60-second cooldown, auto-redirect on the `SIGNED_IN` event).
- **MFA (TOTP)** - enrollment, verification, and removal run through `POST /api/account/mfa-lifecycle` (mobile: `/api/mobile/v1/profile/mfa-lifecycle`), one shared handler with `enroll`, `remove`, `reauthenticate`, and `cleanup` actions. Enforcement is account-based: once a verified factor exists, sign-in requires the TOTP challenge and sensitive actions require fresh AAL2 proof. Accounts without a factor get a dismissible nag banner, not a hard block. See `docs/mfa-provider-boundary.md`.
- **Sensitive-action reauthentication** - `@dubgrid/authz`'s `assurance.ts` defines a five-minute fresh-auth window derived from the JWT's `amr` timestamps. Route Handlers call `requireSensitiveActionAuth` before MFA changes, credential updates (`POST /api/account/credential-assurance` preflights Supabase `updateUser`), session revocation, data export, and account or organization deletion; the web `StepUpDialog` and the mobile step-up flow satisfy it.

All auth pages use the `AuthCard` layout component (`PageShell` + `Card`) and `PasswordInput` / `PasswordStrength` reusable components from `apps/web/src/components/auth/`.

### Post-Login Soft Navigation

Login redirects with a soft `router.replace("/dashboard")` (not a hard `window.location` change). A `markAuthTransition()` flag (`apps/web/src/lib/auth-transition.ts`) plus an `<AuthSplash>` bridge the gap while the auth session settles, so the route guards do not bounce a freshly-authenticated user back to `/login`. Logout is the opposite: fast, no splash, and always redirects to `/login` in a `finally`.

### Trial Activation

A new organization's 14-day trial clock starts on the **first super admin login**, via the idempotent `start_trial_for_org(p_org_id)` RPC called from the web and mobile login flows (it self-gates to super admins). Until the trial starts, the org is in a `trial_pending` billing state that gates non-super-admins. `GET /api/trial-welcome` reports whether the one-time welcome modal should show for the super admin and lazily sends the "trial started" email exactly once, claiming the send atomically against `organizations.trial_welcome_email_sent_at` to avoid duplicates under polling. The modal is held back until onboarding completes so it does not collide with the setup wizard on that same first sign-in. The email is the react-email `TrialWelcomeEmail` component.

### Per-Session Org Isolation

`user_sessions.active_org_id` drives the JWT org claims per session, so the `switch_org` RPC only changes the org context for the calling device. `profiles.org_id` is just the default org applied to new sign-ins. Org soft-delete (super admin self-delete from the Settings danger zone) sets `organizations.archived_at`, which revokes access across middleware, `get_my_organizations`, the JWT hook, and `switch_org`.

---

## 5. Database Design

### Migration Strategy

Database history is an immutable, ordered migration stream under `supabase/migrations/`. Migrations `001`-`004` are the frozen baseline; every later schema change is a new, retry-safe `NNN_snake_case.sql` at the next number (currently through `022`), and `checksums.sha256` locks every reviewed file (`npm run db:migrations:check`). Never edit an applied migration and never mirror a change back into the baseline.

| File                         | Contents                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_schema.sql`             | Baseline: enums, tables, foreign keys, indexes, realtime                                                                                                                                                                                                                                                                                                 |
| `002_functions_triggers.sql` | Baseline: functions, triggers, auth hooks, RPCs                                                                                                                                                                                                                                                                                                          |
| `003_rls_policies.sql`       | Baseline: RLS enable statements + all policies                                                                                                                                                                                                                                                                                                           |
| `004_grants.sql`             | Baseline: grants for anon, authenticated, service_role, supabase_auth_admin                                                                                                                                                                                                                                                                              |
| `005`-`020`                  | Forward migrations: live-membership guard, atomic notification and mobile-employee mutations, calendar feed tokens, invitation replacement and hardened acceptance, schedule editor session terminations, schedule notes requiring a shift, authorization and effective-tenant hardening, the scheduler-staffed call-off trigger and its publish repairs |

Migrations are applied by ledger (`supabase db push`, Supabase branching, or the local `db:reset`), never by dropping and replaying the schema on production. `supabase/patches/` holds historical one-time production patches as evidence only. The runbook is `docs/operations/production-migration-safety.md`; `npm run db:migrations:inspect` is the read-only ledger and invariant check.

Seeds: root `seed.ts` orchestrates the SQL seed fixtures `supabase/seed_arden_wood.sql`, `supabase/seed_calm_haven.sql`, and `supabase/seed_gridmaster.sql` (local, staging, and preview branches only; never production).

### Schema Overview

**Core Domain:**

```
organizations ──────┐   (+ workspace_kind, sandbox_source_org_id,
  │                  │     sandbox_owner_user_id)
  ├── departments ───┤   two-type model: 'scheduled' + 'management'
  │     └── focus_areas (children of departments)
  │                  │
  ├── employees ─────┤
  │     │            │
  │     ├── schedule_cells
  │     │     ├── schedule_cell_snapshots
  │     │     └── schedule_cell_segments
  │     ├── recurring_shifts
  │     └── shift_series
  │                  │
  ├── jobs (+ job_shift_overrides)
  ├── shift_categories (a.k.a. shift_codes)
  ├── coverage_requirements
  ├── certifications │
  ├── organization_roles
  ├── indicator_types│
  ├── schedule_notes │  (a note cannot exist without a shift on its cell)
  ├── absence_types  │
  ├── shift_requests │
  ├── notifications (+ notification_preferences)
  ├── profile_change_requests
  ├── calendar_feed_tokens
  └── subscriptions  │
                     │
profiles ────────────┘ (via org_id)
  │
  └── organization_memberships
        (per-org role + admin_permissions + department_ids[]
         + dept_admin_ids[] + onboarding_completed_at
         + tooltip_tours_completed + schedule_last_viewed_at)
```

**Draft sessions:** `schedule_draft_sessions` and `recurring_shifts_draft_sessions` persist a scheduler's unpublished draft window so it survives across browser sessions. They are not locks: concurrent editing is coordinated by Realtime presence (§8) and protected by the optimistic version check.

**Security & Audit:**

```
role_change_log                      - immutable audit trail, idempotency_key UNIQUE
jwt_refresh_locks                    - blocks JWT refresh for 5s after role change
invitations                          - invite-only registration, 72h expiry, employee_id FK
impersonation_sessions               - gridmaster impersonation, 30-min expiry
user_sessions                        - per-device session tracking, active_org_id per session
schedule_editor_session_terminations - owner-only tombstones for ended schedule editor sessions
publish_history + schedule_publish_changes - schedule publish audit trail and per-cell diffs
audit_log                            - org and platform activity (people, access, invitations)
stripe_processed_events              - webhook replay idempotency
platform_feature_flags               - gridmaster kill switches (stripe, resend_email, mobile_api, crons, ...)
terms_acceptances / cookie_consents  - legal and consent audit trail
mobile_device_tokens                 - Expo push tokens per device
```

42 tables in total; every one has RLS enabled.

### Key Schema Patterns

- **Canonical schedule state** — dated schedule truth lives in `schedule_cells`, `schedule_cell_snapshots`, and `schedule_cell_segments` (there is no flat `shifts` table). Recurring and series templates store only `ScheduleCellState` JSON in `recurring_shifts.state` and `shift_series.state`; derived assignment IDs and labels are read-model compatibility only.
- **Two-type departments** — `departments.type` is `scheduled` or `management`. Scheduled departments organize the schedule grid; management departments group operations staff. (`departments.permissions` exists for management departments but is vestigial: permissions are per-person, not granted by departments.) Focus areas are children of departments.
- **Workspace kind / sandboxes** — `organizations.workspace_kind` is `real` or `sandbox`. Sandbox orgs clone a source org's config (`sandbox_source_org_id`), are owned by their creator (`sandbox_owner_user_id`, one active sandbox per user enforced by a partial unique index), and are excluded from mobile login. There is no expiry column: the sandbox cookie lives 7 days and the daily `sandbox-cleanup` cron deletes sandboxes older than 14 days.
- **Optimistic locking** — `schedule_cells.version` prevents concurrent overwrites. Writes include the expected version; a mismatch means another user edited first.
- **Idempotency keys** — `role_change_log.idempotency_key` prevents duplicate role/audit writes from network retries.
- **Draft/published status** — schedule cells store separate draft and published snapshots. Drafts are visible only to schedulers; publish promotes drafts atomically.
- **Soft status on employees** — employees use `status` (active/benched/terminated) rather than hard deletes, preserving historical schedule data.

---

## 6. Web App Architecture (`apps/web`)

### Component Philosophy

- **Server Components by default** — only add `'use client'` when the component needs hooks, event handlers, or browser APIs.
- **Push `'use client'` to leaves** — keep data fetching in Server Components / Route Handlers; only interactive UI elements are client components.
- **Composition over prop-drilling** — components are composed via children, not deeply nested props.

### Feature-Folder Layout

Each UI feature lives in `apps/web/src/features/<feature>/` with up to `client/`, `server/`, and `shared/` subfolders:

- `client/` — client components and `client/api.ts`, which exposes typed functions that `fetch()` the app's own Route Handlers.
- `server/` — server-only logic invoked by Route Handlers.
- `shared/` — types and helpers used by both sides.

`apps/web/src/features/permissions/` wraps `@dubgrid/authz` (`core`, `client`, `shared`, `index`, `usePermissions.ts`). `docs/architecture/folder-structure.md` describes this layout in detail.

### Data Access Pattern

The browser **never touches Supabase data tables directly** for application domains. Data flows through Route Handlers to a server-side data-access barrel:

```
browser
  → features/*/client/api.ts          (typed fetch wrappers)
    → /api/* Route Handler            (auth + authorization checks)
      → apps/web/src/lib/db/*         (server data-access barrel)
        → Supabase (RLS-enforced)
```

`apps/web/src/lib/db/` is a barrel (`lib/db/index.ts`) over domain modules: `shared`, `types`, `mappers`, `organizations`, `config`, `employees`, `shifts`, `schedule`, `publish-history`, `invitations`, `requests`, `sessions`, `admin`, `access`. Notification reads and writes live in `features/notifications/server/`. The old single `src/lib/db.ts` file no longer exists. The rest of `apps/web/src/lib/*` holds the cross-cutting server and client utilities (auth verification and revocation under `lib/auth/`, audit registry under `lib/audit/`, `api-auth`, `csrf`, `cache`, `rate-limit`, `env` / `env.server`, `feature-flags`, `stripe`, `sentry`, and the schedule, staff, and dashboard calculation helpers).

For the mobile API surface, Route Handlers under `/api/mobile/v1/*` delegate to `@dubgrid/mobile-api-core` (which in turn uses `@dubgrid/data-access` for queries) — see §7.

This pattern provides type safety via row mappers (snake_case → camelCase), centralized authorization, and a single place for optimistic locking, idempotency, and audit logic.

### State Management

| State Type   | Managed By                            | Example                                                      |
| ------------ | ------------------------------------- | ------------------------------------------------------------ |
| Server data  | React Query                           | Employees, schedule cells, org config, coverage requirements |
| Auth/session | Supabase Auth + `usePermissions` hook | JWT claims, admin permissions                                |
| UI state     | React `useState`                      | Modal open/close, selected date, active tab                  |
| Real-time    | Supabase Realtime                     | Schedule changes, editor presence, config invalidation       |
| URL state    | Next.js router                        | Active route, query params                                   |

**No global state store** (no Redux, Zustand). React Query handles server-state caching and synchronization; component-local state handles UI concerns.

### Routing

All routes are **simple page files** (no catch-all routes) so Vercel can statically prerender them. Selected routes:

- Public: `/`, `/request-demo`, `/privacy`, `/terms`, `/cookie-policy` (top-level under `apps/web/src/app/`)
- Auth, under the `(app)` route group: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, `/auth/confirm`, `/auth/verify`, `/accept-invite`, `/accept-terms`, `/goodbye`, `/billing-required`, `/onboarding`
- App, under `(app)`: `/dashboard`, `/schedule`, `/people`, `/people/[id]`, `/alerts`, `/reports`, `/profile`, `/account`, `/settings` (sections via `?section=`; `/settings/staff-config` only redirects there)
- Gridmaster: `/gridmaster`

> The legacy `/staff` route no longer exists — it is `/people` (`apps/web/src/app/(app)/people/page.tsx`, `people/[id]/page.tsx`). The alerts inbox is `/alerts`, not `/notifications`.

### Onboarding

Onboarding renders **inline via a client gate** — there is no standalone `/setup` route (`/onboarding` is the polling page for an invited member whose organization is not ready yet). Components live in `apps/web/src/components/onboarding/`:

- `OnboardingGate.tsx` - wraps the app; waits for bootstrap data from the effective organization, then checks billing lock → onboarding status → org setup. Non-admins on an unconfigured org get `SetupPendingScreen`; a failed or slow bootstrap gets `OrganizationBootstrapRecovery` rather than an empty shell. Completion is durable per member and organization (`organization_memberships.onboarding_completed_at`), so a completed member is never returned to onboarding by a stale response.
- `OnboardingWizard.tsx` - role-aware step lists:
  - super_admin + unconfigured org → **SETUP**: `welcome → identity → structure → schedule → invite-team → completion`
  - super_admin + configured org → **ORIENTATION**: `welcome → sa-orientation → completion`
  - admin → `welcome → orientation → completion`
  - user → `welcome → completion`
- `WizardShell.tsx` - shared full-screen overlay chrome.
- `useOnboardingState.ts` - step state machine; persists step to localStorage, `completeOnboarding()` seeds React Query cache.
- `steps/*` - `WelcomeStep`, `IdentityStep` (org general + labels), `StructureStep` (departments + roles + certifications, requires ≥1 dept), `ScheduleStep` (display mode + shift categories + jobs, requires ≥1 category + ≥1 job), `InviteTeamStep`, `CompletionStep`, plus `CompositeSection.tsx` for grouping legacy settings panels.
- `DashboardChecklist.tsx` (`components/dashboard/`) - the setup checklist the dashboard shows a super admin while the organization is still being configured.

(The former `PersonaLandingCard`, its `landing_card_dismissed_at` column, and the `onboarding-telemetry.ts` PostHog wrappers no longer exist.)

### Test Sandbox

`apps/web/src/features/test-sandbox/server.ts` + `app/api/test-sandbox/route.ts` implement a cookie-based "test sandbox": it clones a super admin's source org config into an isolated `workspace_kind='sandbox'` org and enters that org via an HttpOnly cookie (`dubgrid-sandbox`), rather than a JWT refresh or subdomain hop. The auth layer rewrites `claims.org_id` to the sandbox while the cookie is present.

The `force-dynamic` POST is guarded by a CSRF origin check and a server-side admin+ gate (the caller's real role in the source org, never the cookie-widened claim), and its actions are `enter` (reuse an existing sandbox or create a fresh clone), `reset` (wipe and re-clone for a clean slate), and `exit` (delete the user's sandboxes and clear the cookie). The sandbox cookie is HttpOnly, `sameSite=lax`, `secure` in production, and lives 7 days. Sandboxes are owned by the creating user (one active sandbox each), are excluded from mobile login, and are garbage-collected by the daily `/api/cron/sandbox-cleanup` job once they are 14 days old.

### Styling Architecture

Tailwind v4 is the foundation, layered with shared style modules and `@dubgrid/design-tokens`:

| File                           | Purpose                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/globals.css` | Tailwind v4 `@theme` tokens, the `dg-*` class vocabulary, dark-mode-first neutral ramps (hue-neutral light, zinc dark).                        |
| `packages/design-tokens`       | Avatar tone, elevation, gradients, icon tone, numeric-badge and pill contracts shared with mobile.                                             |
| `apps/web/src/lib/colors.ts`   | Color presets for jobs, shifts, focus areas; draft border + designation badge colors.                                                          |
| `apps/web/src/lib/styles.ts`   | Shared CSS-in-JS style objects for consistent layouts.                                                                                         |
| `apps/web/src/emails/`         | react-email components for transactional + Supabase auth emails (`email:dev` previews, `email:build` regenerates `supabase/templates/*.html`). |
| `apps/web/src/lib/email.ts`    | Small email helpers (`sanitizeHeaderValue`, `emailBaseUrl`) — the HTML now lives in `src/emails/`.                                             |

`dg-btn-*` is the one button vocabulary everywhere (authenticated app, public auth flows, landing page); the old `dg-auth-submit` pill is retired. Input and label vocabularies differ by surface: `dg-input` / `dg-label` / `dg-form-error` inside the authenticated app, `dg-auth-input` / `dg-auth-link` / `dg-auth-heading` in the public auth flows. Product UI uses Inter (`var(--font-sans)`); DM Sans is reserved for the wordmark and landing headings (`dg-font-brand-heading`); operational figures use `dg-tabular-nums`. Shared primitives (`PageContainer`, `Modal`, `ConfirmDialog`, `EmptyState`, `CustomSelect`, `NumberField`, `Switch`, `EditorActionRow`, `SectionCard`, `NumericBadge`, `StatusPill`) live under `apps/web/src/components/` and `components/ui/`. See `apps/web/AGENTS.md` for the full design-system conventions.

---

## 7. Mobile App Architecture (`apps/mobile`)

The mobile app is an **Expo SDK 54 / React Native** app using **Expo Router**. It is a thin client: all business logic and data access stay in the web app.

### Routing

Expo Router routes under `apps/mobile/app/`:

- `_layout.tsx` (fonts, providers, consent and terms gates, `ErrorBoundary`), `index.tsx`, `+not-found.tsx`
- `(auth)/login.tsx`, `(auth)/forgot-password.tsx`, `(auth)/reset-password.tsx`, `(auth)/onboarding.tsx`
- `(tabs)/_layout.tsx` (+ `.android` / `.web` variants) with tab stacks `home/` (index plus `my-schedule`, `open-shifts`, `pending-approvals`, `coverage`, `staff-hours`, `activity` drill-ins), `team/`, `people/` (`index`, `add`, `[id]`), `requests/`, `profile/` (`index`, `work`, `account`, `security`, `password`, `two-factor`, `sessions`, `notifications`, `privacy`)
- `alerts/index.tsx`, `alerts/[id].tsx` (a push tap or old deep link forwards on to the alert's subject), `person/[id]/index.tsx`, `person/[id]/schedule.tsx`, `shift/[employeeId]/[date].tsx`

### Feature Folders

`apps/mobile/src/features/` — `auth`, `consent`, `dashboard`, `notifications`, `onboarding` (a 3-slide first-launch intro carousel, unrelated to the web onboarding wizard), `people`, `profile`, `schedule`, and `shift-requests`. `apps/mobile/src/shared/` holds `providers`, `navigation`, `components`, `theme`, `motion`, `hooks`, and `lib`. Every number on a mobile screen comes from the `mobile*` token ramps in `@dubgrid/design-tokens` (enforced by the `design/no-raw-mobile-metrics` lint rule), and every text goes through `shared/components/Text`, which caps OS text scaling (`MAX_FONT_SCALE` 1.5x, `MAX_FONT_SCALE_COMPACT` 1.2x for control labels, chrome fixed).

### Backend Communication

The mobile app talks **only** to the web app's versioned mobile API at `/api/mobile/v1/*` (base URL `EXPO_PUBLIC_API_BASE_URL`). It never touches Supabase directly.

```
mobile screen
  → src/shared/lib/api.ts            (built on @dubgrid/api-client)
    → HTTPS  /api/mobile/v1/*        (Route Handlers in apps/web)
      → @dubgrid/mobile-api-core     (auth, read, write, push, …)
        → @dubgrid/data-access → Supabase (RLS-enforced)
```

`src/shared/lib/api.ts` provides a 15-second timeout, bearer-token auth, Zod response parsing via `@dubgrid/contracts`, bounded automatic retry for idempotent reads (`@dubgrid/client-errors` owns the retry policy and honors `Retry-After`), and an `onAuthFailure` hook. `@dubgrid/mobile-api-core` rejects sandbox organizations for mobile login, and `requireMobileAuth` honors the `mobile_api` platform kill switch.

### Mobile API Surface (`/api/mobile/v1/*`)

The mobile API exposes its own Route Handlers under `apps/web/src/app/api/mobile/v1/`, including:

- **Bootstrap & auth:** `/bootstrap`, `/auth/login`, `/auth/organization`, `/auth/recovery-request`, `/org-status`
- **Dashboard & schedule:** `/dashboard`, `/me/schedule`, `/org/schedule`
- **People:** `/people`, `/people/[id]`, `/people/[id]/status`, `/people/[id]/access`, `/people/[id]/invitation`, `/people/[id]/management-access`, `/people/contact-check`, `/management-users`, `/management-users/[personId]`, `/management-users/[personId]/invitation`
- **Profile:** `/profile`, `/profile/phone`, `/profile/account`, `/profile/sessions`, `/profile/change-requests`, `/profile/change-requests/[id]`, `/profile/notification-preferences`, `/profile/terms`, `/profile/mfa-status`, `/profile/mfa-lifecycle`, `/profile/credential-assurance`
- **Notifications:** `/notifications`, `/notifications/[id]`, `/notifications/facets`, `/notifications/actions`, `/notifications/read-all`
- **Shift requests:** `/shift-requests`, `/shift-requests/[id]`, `/shift-requests/history`, `/shift-requests/swap-options`
- **Device/session:** `/push-tokens`, `/session-presence`

The full method-by-method list is in `docs/api-reference.md`.

---

## 8. Real-Time Collaboration

### Supabase Realtime

DubGrid uses Supabase Realtime for three purposes:

1. **Schedule sync** - when one user edits a schedule cell, all other users viewing the same schedule see the change immediately via Postgres Changes (CDC) subscriptions. CDC events also drive React Query cache invalidation on config tables through the reference-counted, org-scoped subscriptions in `@dubgrid/realtime-core` (`useOrgRealtimeInvalidation` on web, the shared org/shift-request/notification hooks on mobile), so each table has one channel per organization rather than one per hook.
2. **Editor presence** - `useSchedulePresence` publishes each editor's identity once and paces an `editing_cell` broadcast, so other schedulers see a non-blocking "being edited" marker on that cell. Peer positions expire on their own, so a crashed tab leaves nothing behind, and nothing consults a position before allowing an edit. (Advisory cell locking was removed on 2026-09-04: its trigger-driven broadcasts stopped delivering after a few hops and stranded editors behind takeover dialogs.) Editor display details are fetched on demand from `/api/schedule/presence-profiles` rather than broadcast.
3. **Presence avatars** - active users on the schedule page are shown via avatar indicators; a persistent same-account session on another device is called out, and editor sessions can be ended explicitly (`/api/schedule/editor-sessions`, tombstoned in `schedule_editor_session_terminations`).

### Conflict Resolution

- **Optimistic locking** prevents data loss: if two users edit the same cell, the second save fails with a version mismatch and the user is prompted to reload.
- **Editor presence** reduces conflict frequency: users see which cells someone else is in before attempting edits, without being blocked.
- **Real-time sync** keeps all clients up to date, shrinking the conflict window. A stale-data banner warns when the realtime connection is lost.

---

## 9. Deployment Architecture

### Vercel (apps/web)

- **Request proxy** - `apps/web/src/proxy.ts` runs on every page request for RBAC, subdomain routing, org-suspension checks, and the per-request CSP. `apps/web/vercel.json` pins the region and schedules the `trial-expiry` and `sandbox-cleanup` crons; `expire-requests` runs hourly from a GitHub Action.
- **Static Prerendering** - all routes use simple page files (no catch-all routes) to enable static optimization.
- **Security Headers** - static headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) are configured in `apps/web/next.config.ts`. The per-request Content-Security-Policy is built in `apps/web/src/proxy.ts`: authenticated pages get a nonce + `strict-dynamic` policy in production.

### Supabase

- **Hosted PostgreSQL** — managed database with automatic backups.
- **Auth** — email/password with the custom access token hook for JWT claims.
- **Realtime** — WebSocket connections for live schedule sync.
- **RLS** — row-level security enforced at the database level.

### Mobile (apps/mobile)

- Built and distributed via Expo (bundle id / package `com.dubgrid.mobile`, scheme `dubgridmobile`). Configured against a deployed web app through `EXPO_PUBLIC_API_BASE_URL`. Push notifications delivered via Expo's push service. `react-native-screens` is pinned above Expo SDK 54's version for the iOS 26 native back button fix.

### Third-Party Integrations

| Service              | Use                                                         |
| -------------------- | ----------------------------------------------------------- |
| **Stripe**           | Billing, subscriptions, checkout, webhooks                  |
| **Resend**           | Transactional email (invites, demo requests, notifications) |
| **PostHog**          | Product analytics, onboarding telemetry                     |
| **Sentry**           | Error monitoring                                            |
| **Upstash Redis**    | Caching (org-suspension lookups) + rate limiting            |
| **Vercel Analytics** | Web performance / traffic analytics                         |
| **Expo**             | Mobile builds + push notifications                          |

### Environment Configuration

| Variable                                                                                           | Purpose                                                                               | Scope                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                                                                         | Supabase API URL                                                                      | web: client + server     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                             | Supabase publishable key                                                              | web: client + server     |
| `SUPABASE_SECRET_KEY`                                                                              | Supabase secret (service-role) key                                                    | web: server only         |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_BASE_DOMAIN`                                                 | Public site URL (CSRF origin check) and the base domain for subdomain routing         | web: client + server     |
| ~~`SUPABASE_JWT_SECRET`~~                                                                          | _Removed_ — JWT verification uses JWKS (ES256) via Supabase's `.well-known/jwks.json` | —                        |
| `CRON_SECRET`                                                                                      | Bearer token the cron routes require                                                  | web: server only         |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL`                                                             | Email sending via Resend                                                              | web: server only         |
| `EXPO_ACCESS_TOKEN`                                                                                | Expo push notifications                                                               | web: server only         |
| `UPSTASH_REDIS_REST_URL`                                                                           | Redis backend (cache, rate limiting, session revocation)                              | web: server only         |
| `UPSTASH_REDIS_REST_TOKEN`                                                                         | Redis auth token                                                                      | web: server only         |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID_MONTHLY`                          | Stripe billing + webhook verification                                                 | web: server only         |
| `LOGIN_EMAIL_LIMIT_PER_15_MIN` / `LOGIN_IP_LIMIT_PER_MINUTE` / `LOGIN_GLOBAL_LIMIT_PER_10_SECONDS` | Optional overrides for the login limiters                                             | web: server only         |
| PostHog / Sentry keys                                                                              | Analytics + error monitoring                                                          | web: per provider config |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                | Supabase Auth and Realtime from the mobile app                                        | mobile: client           |
| `EXPO_PUBLIC_API_BASE_URL`                                                                         | Base URL the mobile app calls for `/api/mobile/v1/*`                                  | mobile: client           |

The complete list with rotation procedures is in `docs/secrets-rotation.md`. Server variables are validated by `apps/web/src/lib/env.server.ts`, public ones by `apps/web/src/lib/env.ts`.

---

## 10. Key Design Decisions

| Decision                                  | Rationale                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Monorepo (npm workspaces + Turborepo)** | Web and mobile share domain types, contracts, and permission logic via versioned packages. One source of truth for business rules; the mobile app stays a thin client with no DB access.                                                                                                               |
| **Immutable ordered migrations**          | `001`-`004` are a frozen baseline and every later change is a new retry-safe numbered file locked by checksum, applied by ledger. The earlier "keep the schema in four hand-maintained files" rule was retired after mirrored edits drifted five migrations; production is never reset and replayed.   |
| **Subdomain-based multi-tenancy**         | Strongest tenant isolation — org context is in the URL, not a query parameter. Prevents accidental cross-tenant data access.                                                                                                                                                                           |
| **JWT claims at top level**               | Middleware reads `payload.platform_role` directly. Avoids the `app_metadata` nesting Supabase defaults to, which is harder to parse at the edge.                                                                                                                                                       |
| **RLS as the real security boundary**     | The request proxy is a fast first filter that can fail; RLS at the database is the authoritative gate. The proxy keeps a `decodeJwt` fallback for non-gridmaster users so a `jwtVerify` failure never locks legitimate users out.                                                                      |
| **Per-person admin permissions (JSONB)**  | More flexible than fixed roles. 26 individually-toggled flags set per person on the People page, with `canManage*` implying `canView*` and a scheduling baseline for unconfigured admins. Departments do not grant permissions. Organizations build custom permission profiles without schema changes. |
| **Browser never touches data tables**     | All app data flows browser → `features/*/client/api.ts` → Route Handler → `lib/db/*`. Centralizes authorization and keeps Supabase access server-side; mobile follows the same shape via `/api/mobile/v1/*` → `mobile-api-core`.                                                                       |
| **No global state store**                 | React Query handles server state; local state handles UI. Avoids Redux/Zustand boilerplate for a primarily server-data-driven app.                                                                                                                                                                     |
| **Optimistic locking over pessimistic**   | Allows concurrent editing without blocking. Version conflicts are rare (editor presence shows who is where) and the UX beats waiting for locks; advisory cell leases were tried and removed.                                                                                                           |
| **Simple routes (no catch-all)**          | Vercel statically prerenders simple routes at build time. Catch-all routes (`[[...slug]]`) force dynamic serverless rendering.                                                                                                                                                                         |
| **Invite-only registration**              | Care facilities control who has access. No public sign-up; invitations link to existing employee records.                                                                                                                                                                                              |
| **Three security layers**                 | Defense in depth: request proxy for speed, JWT claims for identity, RLS for correctness. Any single layer can fail without compromising security.                                                                                                                                                      |

---

_DubGrid — Confidential_
