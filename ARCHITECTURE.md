# DubGrid — System Architecture

---

## 1. Overview

DubGrid is a multi-tenant employee scheduling platform built for care facilities. The system replaces spreadsheet-based scheduling with a real-time collaborative web application supporting multiple organizations, each isolated by subdomain.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│  React 19 + Next.js 16 + TanStack React Query + @dnd-kit       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Edge Middleware                         │
│  JWT verification · Subdomain routing · RBAC route guards        │
│  Headers: x-dubgrid-role, x-dubgrid-org-id, x-dubgrid-org-slug │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js App Router                            │
│  Server Components · API Routes · Static Prerendering            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase                                  │
│  PostgreSQL · Auth (JWT + Custom Claims) · Realtime · RLS        │
│  4-file migration strategy · Row-level org isolation             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenant Architecture

### Subdomain-Based Routing

Every organization gets a unique subdomain. The middleware resolves the subdomain to an org context before any page renders.

| URL Pattern                      | Resolution                    |
| -------------------------------- | ----------------------------- |
| `acme.dubgrid.com/schedule`      | Org "Acme", schedule page     |
| `gridmaster.dubgrid.com`         | Gridmaster command center     |
| `dubgrid.com`                    | Landing page (public)         |
| `dubgrid.local:3000` (dev)       | Local development (no subdomain) |

### Org Isolation

Tenant isolation is enforced at three levels:

1. **Middleware** — Verifies the user's JWT `org_slug` matches the subdomain. Redirects on mismatch.
2. **Application** — All data queries include `org_id` from the authenticated session.
3. **Database (RLS)** — Every table policy filters by `caller_org_id()`, extracted from the JWT. Even if application code is buggy, RLS prevents cross-tenant data access.

### Local Development

Subdomains are simulated using `dubgrid.local` entries in `/etc/hosts`. The `parseHost()` utility in `src/lib/subdomain.ts` handles both production (`org.dubgrid.com`) and local (`dubgrid.local:3000`) hostname formats.

---

## 3. Authentication & Authorization

### Three Security Layers

| Layer | Where | What It Does | Failure Mode |
| ----- | ----- | ------------ | ------------ |
| **Edge Middleware** | Vercel CDN edge | JWT verification, role-based route blocking, subdomain enforcement | Redirects to `/login` |
| **Custom JWT Claims** | Supabase auth hook | Injects `platform_role`, `org_role`, `org_id`, `org_slug` into JWT at sign-in | User gets default `user` role |
| **Row-Level Security** | PostgreSQL | Every query filtered by `caller_org_id()` and role checks | Query returns empty / blocked |

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
    │                Global access, all orgs
    ▼
Super Admin (3) ── org_role = 'super_admin'
    │                Full org access, manages users + permissions
    ▼
Admin (2) ──────── org_role = 'admin'
    │                Configurable per-user permissions (16 flags)
    ▼
User (0) ───────── org_role = 'user'
                     Read-only (canViewSchedule + canViewStaff)
```

**Effective role** is calculated as: if `platform_role === 'gridmaster'`, role is gridmaster; otherwise, use `org_role`.

### Admin Permission Model

Instead of fixed role-based capabilities, admins have 16 individually configurable permissions stored as JSONB in `organization_memberships.admin_permissions`. Super admins toggle these per user via the AdminPermissionsEditor component.

This design allows organizations to create specialized admin roles (e.g., "Schedule Manager" who can edit shifts but not manage employees) without requiring new database roles.

### Password Reset & Email Verification

The authentication system includes complete self-service flows:

- **Forgot Password** (`/forgot-password`) — Email-based password reset via Supabase `resetPasswordForEmail()`. Includes email enumeration protection (always shows success regardless of email existence).
- **Reset Password** (`/reset-password`) — Token-validated form with password strength meter (4 levels: too short, weak, fair, strong). Minimum 10 characters. Signs out user after reset.
- **Email Verification** (`/verify-email`) — Verification page with resend button (60-second cooldown). Auto-redirects on successful verification via auth event listener.

All auth pages use the `AuthCard` layout component (`PageShell` + `Card`) and `PasswordInput`/`PasswordStrength` reusable components from `src/components/auth/`.

---

## 4. Database Design

### Migration Strategy

All schema lives in exactly **4 files**. New tables, columns, or constraints are added to the appropriate file — never create additional migration files.

| File | Contents |
| ---- | -------- |
| `001_schema.sql` | Enums, tables, foreign keys, indexes, realtime subscriptions |
| `002_functions_triggers.sql` | Functions, triggers, auth hooks, RPCs |
| `003_rls_policies.sql` | RLS enable statements + all policies |
| `004_grants.sql` | Grants for anon, authenticated, service_role, supabase_auth_admin |

**Rationale:** Consolidating migrations into 4 files eliminates ordering issues, makes the full schema readable in one pass, and simplifies the `db:reset` workflow. Supabase runs these in alphabetical order.

### Schema Overview

**Core Domain:**

```
organizations ──────┐
  │                  │
  ├── employees ─────┤
  │     │            │
  │     ├── shifts   │
  │     ├── recurring_shifts
  │     └── shift_series
  │                  │
  ├── focus_areas    │
  ├── shift_codes    │
  ├── shift_categories
  ├── coverage_requirements
  ├── certifications │
  ├── organization_roles
  ├── indicator_types│
  ├── schedule_notes │
  └── shift_requests │
                     │
profiles ────────────┘ (via org_id)
  │
  └── organization_memberships (per-org role + admin_permissions)
```

**Security & Audit:**

```
role_change_log         — immutable audit trail, idempotency_key UNIQUE
jwt_refresh_locks       — blocks JWT refresh for 5s after role change
invitations             — invite-only registration, 72h expiry, employee_id FK
impersonation_sessions  — gridmaster impersonation, 30-min expiry
user_sessions           — per-device session tracking
```

### Key Design Patterns

- **Optimistic Locking** — `shifts.version` column prevents concurrent overwrites. The update query includes `.eq('version', expected)` — a version mismatch means another user edited first.
- **Idempotency Keys** — `role_change_log.idempotency_key` and `shifts.idempotency_key` prevent duplicate writes from network retries.
- **Draft/Published Status** — Shifts and notes have a `status` column (`draft` | `published`). Drafts are only visible to editors; publish promotes all drafts atomically.
- **Soft Status on Employees** — Employees use `status` (active/benched/terminated) rather than hard deletes, preserving historical schedule data.

---

## 5. Frontend Architecture

### Component Philosophy

- **Server Components by default** — Only add `'use client'` when the component needs hooks, event handlers, or browser APIs
- **Push `'use client'` to leaves** — Keep data fetching in Server Components; only interactive UI elements are client components
- **Composition over prop-drilling** — Components are composed via children, not deeply nested props

### State Management

| State Type | Managed By | Example |
| ---------- | ---------- | ------- |
| Server data | React Query | Employees, shifts, org config, coverage requirements |
| Auth/session | Supabase Auth + usePermissions hook | JWT claims, admin permissions |
| UI state | React useState | Modal open/close, selected date, active tab |
| Real-time | Supabase Realtime | Schedule changes, cell locks, presence |
| URL state | Next.js router | Active route, query params |

**No global state store** (no Redux, Zustand, etc.). React Query handles server state caching and synchronization. Component-local state handles UI concerns.

### Custom Hooks

All hooks are barrel-exported from `src/hooks/index.ts`.

| Hook | Purpose |
| ---- | ------- |
| `usePermissions` | Decodes JWT, fetches admin_permissions from DB, provides `can(permission)` helper. Exports `getPermissionsFromSession()` and `clearPermsCache()` |
| `useOrganizationData` | Fetches org config, focus areas, shift codes, categories, coverage requirements. Exports `clearOrgDataCache()` |
| `useEmployees` | Employee list with filtering, search, and pagination. Exports `clearEmployeeCache()` |
| `useCellLocks` | Real-time cell lock/occupancy via Supabase Realtime subscriptions |
| `useShiftRequests` | Shift pickup/swap requests with status management |
| `useRoleChange` | React Query mutation for changing user roles (idempotent) with `generateIdempotencyKey()` |
| `useLogout` | Scoped logout (local vs global) with auth provider integration |
| `useMediaQuery` | Responsive breakpoint detection. Exports breakpoint constants: `MOBILE`, `TABLET`, `SMALL_DESKTOP`, `DESKTOP` |

### Data Access Layer

All Supabase queries are centralized in `src/lib/db.ts`. Components never call `supabase.from()` directly — they go through typed functions:

```ts
// src/lib/db.ts
export async function fetchShifts(orgId: string, dateRange: DateRange) { ... }
export async function createShift(data: ShiftInput) { ... }
export async function updateShift(id: string, data: Partial<ShiftInput>, expectedVersion: number) { ... }
export async function publishSchedule(orgId: string, dateRange: DateRange) { ... }
```

This pattern provides:
- Type safety via row mappers (DB snake_case → TS camelCase)
- Centralized error handling
- Single place to add optimistic locking, idempotency, and audit logic

### Styling Architecture

DubGrid uses a layered approach to styling with Tailwind v4 as the foundation:

| File | Purpose |
| ---- | ------- |
| `src/lib/palette.ts` | Static hex values matching CSS custom properties, used for JS inline styles. Defines backgrounds, borders, text, brand, state, and grid colors. |
| `src/lib/colors.ts` | Predefined color presets for shift codes and focus areas (18 color pairs). Draft border colors. Designation badge colors. |
| `src/lib/styles.ts` | Shared CSS-in-JS style objects for consistent layouts (section cards, table headers/cells, form labels, role badge colors). |
| `src/lib/email.ts` | Branded HTML email templates with header, wrapper, and sanitization utilities. Used by invite and demo request API routes. |

---

## 6. Real-Time Collaboration

### Supabase Realtime

DubGrid uses Supabase Realtime for three purposes:

1. **Schedule Sync** — When one user edits a shift, all other users viewing the same schedule see the change immediately via Postgres Changes subscriptions.

2. **Cell Locks** — When a user opens a shift edit panel, a Realtime Presence broadcast marks that cell as "being edited." Other users see a lock indicator and cannot edit the same cell.

3. **Presence Avatars** — Active users on the schedule page are shown via avatar indicators, so team members know who else is currently viewing.

### Conflict Resolution

- **Optimistic locking** prevents data loss: if two users edit the same shift, the second save fails with a version mismatch error and the user is prompted to reload.
- **Cell locks** reduce conflict frequency: users see which cells are occupied before attempting edits.
- **Real-time sync** keeps all clients up to date, reducing the window for conflicts.

---

## 7. Deployment Architecture

### Vercel

- **Edge Middleware** — Runs at CDN edge for low-latency RBAC and subdomain routing
- **Static Prerendering** — All routes use simple page files (no catch-all routes) to enable static optimization
- **Security Headers** — HSTS, X-Frame-Options, CSP, and other headers configured in `next.config.ts`

### Supabase

- **Hosted PostgreSQL** — Managed database with automatic backups
- **Auth** — Email/password with custom access token hook for JWT claims
- **Realtime** — WebSocket connections for live schedule sync
- **RLS** — Row-level security enforced at the database level

### Environment Configuration

| Variable | Purpose | Scope |
| -------- | ------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Client + Server |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (CSRF origin check) | Client + Server |
| `SUPABASE_JWT_SECRET` | JWT verification secret | Server only (middleware) |
| `RESEND_API_KEY` | Email sending via Resend | Server only (API routes) |
| `UPSTASH_REDIS_REST_URL` | Rate limiting Redis backend | Server only (API routes) |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting Redis auth | Server only (API routes) |

---

## 8. Key Design Decisions

| Decision | Rationale |
| -------- | --------- |
| **4-file migration strategy** | Eliminates migration ordering issues, makes full schema readable, simplifies resets. Trade-off: merge conflicts on team, but acceptable at current team size. |
| **Subdomain-based multi-tenancy** | Strongest tenant isolation — org context is in the URL, not a query parameter. Prevents accidental cross-tenant data access. |
| **JWT claims at top level** | Middleware reads `payload.platform_role` directly. Avoids the `app_metadata` nesting that Supabase defaults to, which is harder to parse at the edge. |
| **Per-user admin permissions (JSONB)** | More flexible than fixed roles. Organizations can create custom permission profiles without schema changes. 16 flags cover all current capabilities. |
| **No global state store** | React Query handles server state; local state handles UI. Avoids the complexity and boilerplate of Redux/Zustand for an app that is primarily server-data driven. |
| **Optimistic locking over pessimistic** | Allows concurrent editing without blocking. Lock violations are rare in practice (shown by cell lock feature reducing conflicts). Better UX than waiting for locks. |
| **Simple routes (no catch-all)** | Vercel statically prerenders simple routes at build time. Catch-all routes (`[[...slug]]`) force dynamic serverless rendering, which is slower and more expensive. |
| **Invite-only registration** | Care facilities control who has access. No public sign-up means no unauthorized users. Invitations link to existing employee records. |
| **Consolidated data access layer** | All DB queries in `src/lib/db.ts` with typed row mappers. Prevents scattered Supabase calls, ensures consistent error handling and type safety. |
| **Three security layers** | Defense in depth: middleware for speed, JWT claims for identity, RLS for correctness. Any single layer can fail without compromising security. |

---

_DubGrid — Confidential_
