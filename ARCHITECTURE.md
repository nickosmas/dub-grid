# DubGrid — System Architecture

---

## 1. Overview

DubGrid is a multi-tenant employee scheduling platform built for care facilities. The system replaces spreadsheet-based scheduling with a real-time collaborative web application plus a companion mobile app, supporting multiple organizations, each isolated by subdomain.

DubGrid is a **monorepo** — npm workspaces orchestrated by Turborepo — containing two apps (`apps/web`, `apps/mobile`), nine shared packages (`packages/*`), and the Supabase project (`supabase/`). The web app is the source of truth for all business logic and the database; the mobile app is a thin client that talks only to a versioned mobile API surface served by the web app.

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
│                    Vercel Edge Middleware                         │
│  JWT verification · Subdomain routing · RBAC route guards         │
│  Org-suspension check · Headers: x-dubgrid-org-id / -org-slug     │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js App Router  (apps/web)                       │
│  Server Components · Route Handlers (/api/*, /api/mobile/v1/*)    │
│  features/*/server · lib/db/* server data-access barrel           │
│  packages: authz · contracts · data-access · db-types ·           │
│            domain · schedule-core · mobile-api-core               │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                  │
│  PostgreSQL · Auth (JWT + Custom Claims) · Realtime · RLS         │
│  4-file migration strategy · Row-level org isolation              │
└─────────────────────────────────────────────────────────────────┘

External services: Stripe (billing) · Resend (email) · PostHog (analytics)
Sentry (errors) · Upstash Redis (cache + rate limiting) · Vercel Analytics
Expo push notifications
```

---

## 2. Monorepo & Workspace Structure

DubGrid uses **npm workspaces** (`apps/*`, `packages/*`) orchestrated by **Turborepo**. Toolchain: Node 22.13, npm 10.9.2.

### Apps

| Workspace | Package name | Stack | Path |
| --------- | ------------ | ----- | ---- |
| Web | `@dubgrid/web` | Next.js 16 App Router, React 19, Tailwind v4 | `apps/web` |
| Mobile | `@dubgrid/mobile` | Expo SDK 54, React Native, Expo Router | `apps/mobile` |

### Shared Packages

All nine packages are private, versioned `0.1.0`, ESM, and build with `tsc` to `dist/`.

| Package | Purpose | Depends on |
| ------- | ------- | ---------- |
| `@dubgrid/domain` | Platform-neutral domain types/enums + pure logic. `Organization` (incl. `workspaceKind` / `sandbox*`), `AdminPermissions` (25 perms), role enums, billing types, `requests`, `staff`, `self-guard.ts` (`SelfActionForbiddenError`, `assertNotSelf`, `isSelfAction`). | none |
| `@dubgrid/contracts` | Zod schemas + inferred types for cross-app API contracts. Re-exports `schedule`, `mobile`, `staff`; exposes a `./mobile` subpath. | `zod` |
| `@dubgrid/db-types` | DB-row TS types (`DbOrganization`, etc.): `catalog`, `organization`, `requests`, `schedule`, `staff`. | `contracts`, `domain` |
| `@dubgrid/authz` | Permission logic: `ROLE_LEVEL`, `ALL_PERMS` / `READ_ONLY_PERMS`, `applyViewImplications`, `unionPermissions`, `buildPermissionContext` / `buildPerms`, `extractJwtClaims`, `getPermissionsFromSession`. | `domain`, `@supabase/supabase-js` |
| `@dubgrid/schedule-core` | Schedule transformation / calculation logic. | `contracts` |
| `@dubgrid/data-access` | Supabase query + data-mapping layer; currently powers the shared mobile data layer. | `contracts`, `db-types`, `domain`, `@supabase/supabase-js` |
| `@dubgrid/mobile-api-core` | Framework-neutral mobile backend orchestration consumed by web's `/api/mobile/v1` routes. Modules: `auth`, `people-status`, `push`, `read`, `shift-requests`, `setup`, `organization`, `write`. Rejects sandbox organizations for mobile login. | `authz`, `contracts`, `domain`, `schedule-core`, `@supabase/supabase-js` |
| `@dubgrid/api-client` | Platform-neutral HTTP client primitives: `createHeaders`, `appendQueryParams`, `createJsonApiRequest`, `ApiResponseError`. | none |
| `@dubgrid/design-tokens` | Shared design values. | none |

### Dependency Boundaries

```
apps/web    consumes →  authz · contracts · data-access · db-types ·
                        design-tokens · domain · mobile-api-core
apps/mobile consumes →  api-client · contracts · design-tokens · schedule-core
```

The mobile app intentionally has **no** dependency on Supabase packages or server-only logic — it reaches the backend exclusively through HTTP. The web app is the only workspace that touches the database directly.

---

## 3. Multi-Tenant Architecture

### Subdomain-Based Routing

Every organization gets a unique subdomain. The middleware resolves the subdomain to an org context before any page renders.

| URL Pattern                      | Resolution                       |
| -------------------------------- | -------------------------------- |
| `acme.dubgrid.com/schedule`      | Org "Acme", schedule page        |
| `gridmaster.dubgrid.com`         | Gridmaster command center        |
| `dubgrid.com`                    | Landing page (public)            |
| `dubgrid.local:3000` (dev)       | Local development (no subdomain) |

### Org Isolation

Tenant isolation is enforced at three levels:

1. **Middleware** — Verifies the user's JWT `org_slug` matches the subdomain. Redirects on mismatch. Also performs a Redis-cached org-suspension check.
2. **Application** — All data queries (server-side) include `org_id` from the authenticated session.
3. **Database (RLS)** — Every table policy filters by `caller_org_id()`, extracted from the JWT. Even if application code is buggy, RLS prevents cross-tenant data access. **RLS is the real security boundary** — middleware is a fast first filter, not the sole gate.

### Local Development

Subdomains are simulated using `dubgrid.local` entries in `/etc/hosts`. The `parseHost()` utility in `apps/web/src/lib/subdomain.ts` handles both production (`org.dubgrid.com`) and local (`dubgrid.local:3000`) hostname formats.

---

## 4. Authentication & Authorization

### Three Security Layers

| Layer | Where | What It Does | Failure Mode |
| ----- | ----- | ------------ | ------------ |
| **Edge Middleware** (`apps/web/middleware.ts`) | Vercel CDN edge | JWT verification, role-based route blocking, subdomain enforcement, org-suspension check | Redirects to `/login` |
| **Custom JWT Claims** | Supabase auth hook | Injects `platform_role`, `org_role`, `org_id`, `org_slug` into JWT at sign-in | User gets default `user` role |
| **Row-Level Security** | PostgreSQL | Every query filtered by `caller_org_id()` and role checks | Query returns empty / blocked |

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
    │                Per-user configurable permissions (25 flags)
    ▼
User (0) ───────── org_role = 'user'
                     Read-only (canViewSchedule + canViewStaff)
```

**Effective role** is calculated as: if `platform_role === 'gridmaster'`, role is gridmaster; otherwise, use `org_role`. The gridmaster portal is never called the "admin portal".

### Admin Permission Model

Instead of fixed role-based capabilities, admins have **25 individually configurable permissions** stored as JSONB in `organization_memberships.admin_permissions`. The canonical `AdminPermissions` interface lives in `packages/domain/src/permissions.ts`; permission logic lives in `@dubgrid/authz`.

The 25 permissions, in interface order:

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
13 canViewFocusAreas
```

Model rules:

- `canViewSchedule` and `canViewStaff` (*) are always true for any authenticated user.
- **View implications** — `canManage*` implies the matching `canView*`. Applied by `applyViewImplications` in `@dubgrid/authz`.
- **Department template union** — management departments define permission templates; members inherit permissions via union across their departments (most permissive wins, `unionPermissions`).
- Super admins toggle these per user via the AdminPermissionsEditor component.
- Always super-admin-only and **not delegable**: `canManageUsers`, `canConfigureAdminPermissions`, `canManageOrgSettings`.

This design lets organizations create specialized admin roles (e.g. a "Schedule Manager" who can edit shifts but not manage employees) without new database roles.

### Password Reset & Email Verification

The authentication system includes complete self-service flows:

- **Forgot Password** (`/forgot-password`) — Email-based password reset via Supabase `resetPasswordForEmail()`. Includes email enumeration protection (always shows success regardless of email existence).
- **Reset Password** (`/reset-password`) — Token-validated form with password strength meter (4 levels). Minimum 10 characters. Signs out user after reset.
- **Email Verification** (`/verify-email`) — Verification page with resend button (60-second cooldown). Auto-redirects on successful verification via auth event listener.

All auth pages use the `AuthCard` layout component (`PageShell` + `Card`) and `PasswordInput` / `PasswordStrength` reusable components from `apps/web/src/components/auth/`.

---

## 5. Database Design

### Migration Strategy

All schema lives in exactly **4 files** under `supabase/migrations/`. New tables, columns, or constraints are added to the appropriate file — never create additional migration files.

| File | Contents |
| ---- | -------- |
| `001_schema.sql` | Enums, tables, foreign keys, indexes, realtime subscriptions |
| `002_functions_triggers.sql` | Functions, triggers, auth hooks, RPCs |
| `003_rls_policies.sql` | RLS enable statements + all policies |
| `004_grants.sql` | Grants for anon, authenticated, service_role, supabase_auth_admin |

**Rationale:** Consolidating migrations into 4 files eliminates ordering issues, makes the full schema readable in one pass, and simplifies the `db:reset` workflow. Supabase runs these in alphabetical order.

Seeds: root `seed.ts` orchestrates the SQL seed fixtures `supabase/seed_arden_wood.sql`, `supabase/seed_calm_haven.sql`, and `supabase/seed_gridmaster.sql`.

### Schema Overview

**Core Domain:**

```
organizations ──────┐   (+ workspace_kind, sandbox_source_org_id,
  │                  │     sandbox_owner_user_id, sandbox_expires_at,
  │                  │     sandbox_template_version)
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
  ├── jobs           │
  ├── shift_categories (a.k.a. shift_codes)
  ├── coverage_requirements
  ├── certifications │
  ├── organization_roles
  ├── indicator_types│
  ├── schedule_notes │
  └── shift_requests │
                     │
profiles ────────────┘ (via org_id)
  │
  └── organization_memberships
        (per-org role + admin_permissions + department_ids[]
         + landing_card_dismissed_at + onboarding_step_telemetry)
```

**Concurrent-edit locks:** `schedule_draft_sessions` and `recurring_shifts_draft_sessions` hold per-cell locks for collaborative editing.

**Security & Audit:**

```
role_change_log         — immutable audit trail, idempotency_key UNIQUE
jwt_refresh_locks       — blocks JWT refresh for 5s after role change
invitations             — invite-only registration, 72h expiry, employee_id FK
impersonation_sessions  — gridmaster impersonation, 30-min expiry
user_sessions           — per-device session tracking
publish_history         — schedule publish audit trail
```

### Key Schema Patterns

- **Canonical schedule state** — dated schedule truth lives in `schedule_cells`, `schedule_cell_snapshots`, and `schedule_cell_segments` (there is no flat `shifts` table). Recurring and series templates store only `ScheduleCellState` JSON in `recurring_shifts.state` and `shift_series.state`; derived assignment IDs and labels are read-model compatibility only.
- **Two-type departments** — `departments.type` is `scheduled` or `management`. Scheduled departments organize the schedule grid; management departments define admin-permission templates. Focus areas are children of departments.
- **Workspace kind / sandboxes** — `organizations.workspace_kind` is `production` or `sandbox`. Sandbox orgs clone a source org's config (`sandbox_source_org_id`), are owned by their creator (`sandbox_owner_user_id`), expire after 30 days (`sandbox_expires_at`), carry a `sandbox_template_version`, and are excluded from mobile login.
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

`apps/web/src/lib/db/` is a barrel (`lib/db/index.ts`) over domain modules: `shared`, `types`, `mappers`, `organizations`, `config`, `employees`, `shifts`, `schedule`, `invitations`, `requests`, `notifications`, `sessions`, `admin`, `access`. The old single `src/lib/db.ts` file no longer exists. Other `apps/web/src/lib/*` modules (besides `lib/db/`) are thin compatibility shims.

For the mobile API surface, Route Handlers under `/api/mobile/v1/*` delegate to `@dubgrid/mobile-api-core` (which in turn uses `@dubgrid/data-access` for queries) — see §7.

This pattern provides type safety via row mappers (snake_case → camelCase), centralized authorization, and a single place for optimistic locking, idempotency, and audit logic.

### State Management

| State Type | Managed By | Example |
| ---------- | ---------- | ------- |
| Server data | React Query | Employees, schedule cells, org config, coverage requirements |
| Auth/session | Supabase Auth + `usePermissions` hook | JWT claims, admin permissions |
| UI state | React `useState` | Modal open/close, selected date, active tab |
| Real-time | Supabase Realtime | Schedule changes, cell locks, presence |
| URL state | Next.js router | Active route, query params |

**No global state store** (no Redux, Zustand). React Query handles server-state caching and synchronization; component-local state handles UI concerns.

### Routing

All routes are **simple page files** (no catch-all routes) so Vercel can statically prerender them. Selected routes:

- Public/auth: `/`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/verify`, `/accept-invite`, `/request-demo`, `/privacy`, `/terms`, `/cookie-policy`, `/billing-required`
- App: `/dashboard`, `/schedule`, `/people`, `/people/[id]`, `/reports`, `/profile`, `/settings`, `/settings/staff-config`
- Gridmaster: `/gridmaster`

> The legacy `/staff` route no longer exists — it is `/people` (`apps/web/src/app/people/page.tsx`, `people/[id]/page.tsx`). The staff settings sub-route is `/settings/staff-config`.

### Onboarding

Onboarding renders **inline via a client gate** — there is no standalone `/setup` route. Components live in `apps/web/src/components/onboarding/`:

- `OnboardingGate.tsx` — wraps the app; checks billing lock → onboarding status → org setup. Non-admins on an unconfigured org get `SetupPendingScreen`.
- `OnboardingWizard.tsx` — role-aware step lists:
  - super_admin + unconfigured org → **SETUP**: `welcome → identity → structure → schedule → invite-team → completion`
  - super_admin + configured org → **ORIENTATION**: `welcome → sa-orientation → completion`
  - admin → `welcome → orientation → completion`
  - user → `welcome → completion`
- `WizardShell.tsx` — shared full-screen overlay chrome.
- `useOnboardingState.ts` — step state machine; persists step to localStorage, `completeOnboarding()` seeds React Query cache.
- `steps/*` — `WelcomeStep`, `IdentityStep` (org general + labels), `StructureStep` (departments + roles + certifications, requires ≥1 dept), `ScheduleStep` (display mode + shift categories + jobs, requires ≥1 category + ≥1 job), `InviteTeamStep`, `CompletionStep`, plus `CompositeSection.tsx` for grouping legacy settings panels.
- `PersonaLandingCard.tsx` — post-onboarding "Next steps" dashboard card; dismissable (persists to `organization_memberships.landing_card_dismissed_at`).

Telemetry flows through `apps/web/src/lib/onboarding-telemetry.ts` (PostHog wrappers).

### Test Sandbox

`apps/web/src/features/test-sandbox/` + `app/api/test-sandbox/` implement a "test sandbox": cloning an org's config into an isolated `workspace_kind='sandbox'` org with a 30-day TTL. The API route is a `force-dynamic` POST guarded by CSRF + rate limiting (`testSandboxLimiter`); actions are `create` / `reset` / `archive`.

### Styling Architecture

Tailwind v4 is the foundation, layered with shared style modules and `@dubgrid/design-tokens`:

| File | Purpose |
| ---- | ------- |
| `apps/web/src/lib/palette.ts` | Static hex values matching CSS custom properties, for JS inline styles. |
| `apps/web/src/lib/colors.ts` | Color presets for jobs, shifts, focus areas; draft border + designation badge colors. |
| `apps/web/src/lib/styles.ts` | Shared CSS-in-JS style objects for consistent layouts. |
| `apps/web/src/lib/email.ts` | Branded HTML email templates with sanitization utilities. |

Two parallel button/input vocabularies coexist by design: `dg-btn-*` / `dg-input` inside the authenticated app, and `dg-auth-*` for public auth flows. See `CLAUDE.md` for the full design-system conventions.

---

## 7. Mobile App Architecture (`apps/mobile`)

The mobile app is an **Expo SDK 54 / React Native** app using **Expo Router**. It is a thin client: all business logic and data access stay in the web app.

### Routing

Expo Router routes under `apps/mobile/app/`:

- `_layout.tsx`, `index.tsx`, `alerts.tsx`, `shift/[employeeId]/[date].tsx`
- `(auth)/login.tsx`, `(auth)/onboarding.tsx`
- `(tabs)/_layout.tsx` with tab stacks `me/`, `people/`, `team/`, `requests/`, `profile/` (`index` / `work` / `account` / `security`)

### Feature Folders

`apps/mobile/src/features/` — `auth`, `schedule`, `people`, `profile`, `shift-requests`, `notifications`, and `onboarding` (a new 3-slide first-launch intro carousel, unrelated to the web onboarding wizard). `apps/mobile/src/shared/` holds `providers`, `navigation`, `components`, `theme`, `hooks`, and `lib`.

### Backend Communication

The mobile app talks **only** to the web app's versioned mobile API at `/api/mobile/v1/*` (base URL `EXPO_PUBLIC_API_BASE_URL`). It never touches Supabase directly.

```
mobile screen
  → src/shared/lib/api.ts            (built on @dubgrid/api-client)
    → HTTPS  /api/mobile/v1/*        (Route Handlers in apps/web)
      → @dubgrid/mobile-api-core     (auth, read, write, push, …)
        → @dubgrid/data-access → Supabase (RLS-enforced)
```

`src/shared/lib/api.ts` provides a 15-second timeout, bearer-token auth, Zod response parsing via `@dubgrid/contracts`, and an `onAuthFailure` hook. `@dubgrid/mobile-api-core` rejects sandbox organizations for mobile login.

### Mobile API Surface (`/api/mobile/v1/*`)

The mobile API exposes its own Route Handlers under `apps/web/src/app/api/mobile/v1/`, including:

- **Bootstrap & auth:** `/bootstrap`, `/auth/login`, `/auth/organization`
- **Schedule:** `/me/schedule`, `/org/schedule`
- **People:** `/people`, `/people/[id]`, `/people/[id]/status`, `/people/[id]/invitation`
- **Profile:** `/profile`, `/profile/phone`, `/profile/account`, `/profile/sessions`, `/profile/change-requests`, `/profile/change-requests/[id]`, `/profile/notification-preferences`
- **Notifications:** `/notifications`, `/notifications/[id]`, `/notifications/read-all`
- **Shift requests:** `/shift-requests`, `/shift-requests/[id]`, `/shift-requests/swap-options`
- **Device/session:** `/push-tokens`, `/session-presence`

---

## 8. Real-Time Collaboration

### Supabase Realtime

DubGrid uses Supabase Realtime for three purposes:

1. **Schedule sync** — when one user edits a schedule cell, all other users viewing the same schedule see the change immediately via Postgres Changes (CDC) subscriptions. CDC events also drive React Query cache invalidation on config tables.
2. **Cell locks** — when a user opens a cell edit panel, a Realtime Presence broadcast marks that cell as "being edited." Other users see a lock indicator and cannot edit the same cell.
3. **Presence avatars** — active users on the schedule page are shown via avatar indicators.

### Conflict Resolution

- **Optimistic locking** prevents data loss: if two users edit the same cell, the second save fails with a version mismatch and the user is prompted to reload.
- **Cell locks** reduce conflict frequency: users see which cells are occupied before attempting edits.
- **Real-time sync** keeps all clients up to date, shrinking the conflict window. A stale-data banner warns when the realtime connection is lost.

---

## 9. Deployment Architecture

### Vercel (apps/web)

- **Edge Middleware** — runs at the CDN edge for low-latency RBAC, subdomain routing, and org-suspension checks.
- **Static Prerendering** — all routes use simple page files (no catch-all routes) to enable static optimization.
- **Security Headers** — HSTS, X-Frame-Options, CSP, and others configured in `apps/web/next.config.ts`.

### Supabase

- **Hosted PostgreSQL** — managed database with automatic backups.
- **Auth** — email/password with the custom access token hook for JWT claims.
- **Realtime** — WebSocket connections for live schedule sync.
- **RLS** — row-level security enforced at the database level.

### Mobile (apps/mobile)

- Built and distributed via Expo. Configured against a deployed web app through `EXPO_PUBLIC_API_BASE_URL`. Push notifications delivered via Expo's push service.

### Third-Party Integrations

| Service | Use |
| ------- | --- |
| **Stripe** | Billing, subscriptions, checkout, webhooks |
| **Resend** | Transactional email (invites, demo requests, notifications) |
| **PostHog** | Product analytics, onboarding telemetry |
| **Sentry** | Error monitoring |
| **Upstash Redis** | Caching (org-suspension lookups) + rate limiting |
| **Vercel Analytics** | Web performance / traffic analytics |
| **Expo** | Mobile builds + push notifications |

### Environment Configuration

| Variable | Purpose | Scope |
| -------- | ------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | web: client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | web: client + server |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (CSRF origin check) | web: client + server |
| ~~`SUPABASE_JWT_SECRET`~~ | _Removed_ — JWT verification uses JWKS (ES256) via Supabase's `.well-known/jwks.json` | — |
| `RESEND_API_KEY` | Email sending via Resend | web: server only |
| `UPSTASH_REDIS_REST_URL` | Redis backend (cache + rate limiting) | web: server only |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token | web: server only |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe billing + webhook verification | web: server only |
| PostHog / Sentry keys | Analytics + error monitoring | web: per provider config |
| `EXPO_PUBLIC_API_BASE_URL` | Base URL the mobile app calls for `/api/mobile/v1/*` | mobile: client |

---

## 10. Key Design Decisions

| Decision | Rationale |
| -------- | --------- |
| **Monorepo (npm workspaces + Turborepo)** | Web and mobile share domain types, contracts, and permission logic via versioned packages. One source of truth for business rules; the mobile app stays a thin client with no DB access. |
| **4-file migration strategy** | Eliminates migration ordering issues, makes the full schema readable, simplifies resets. Trade-off: merge conflicts on a team, but acceptable at current size. |
| **Subdomain-based multi-tenancy** | Strongest tenant isolation — org context is in the URL, not a query parameter. Prevents accidental cross-tenant data access. |
| **JWT claims at top level** | Middleware reads `payload.platform_role` directly. Avoids the `app_metadata` nesting Supabase defaults to, which is harder to parse at the edge. |
| **RLS as the real security boundary** | Middleware is a fast first filter that can fail; RLS at the database is the authoritative gate. Middleware keeps a `decodeJwt` fallback for non-gridmaster users so a `jwtVerify` failure never locks legitimate users out. |
| **Per-user admin permissions (JSONB)** | More flexible than fixed roles. 25 individually-toggled flags, with `canManage*` implying `canView*` and management-department templates merged by union. Organizations build custom permission profiles without schema changes. |
| **Browser never touches data tables** | All app data flows browser → `features/*/client/api.ts` → Route Handler → `lib/db/*`. Centralizes authorization and keeps Supabase access server-side; mobile follows the same shape via `/api/mobile/v1/*` → `mobile-api-core`. |
| **No global state store** | React Query handles server state; local state handles UI. Avoids Redux/Zustand boilerplate for a primarily server-data-driven app. |
| **Optimistic locking over pessimistic** | Allows concurrent editing without blocking. Lock violations are rare (cell locks reduce conflicts further) and the UX beats waiting for locks. |
| **Simple routes (no catch-all)** | Vercel statically prerenders simple routes at build time. Catch-all routes (`[[...slug]]`) force dynamic serverless rendering. |
| **Invite-only registration** | Care facilities control who has access. No public sign-up; invitations link to existing employee records. |
| **Three security layers** | Defense in depth: middleware for speed, JWT claims for identity, RLS for correctness. Any single layer can fail without compromising security. |

---

_DubGrid — Confidential_
