# DUBGRID

## Role-Based Access Control — Full System Design

**Race-Condition-Free Architecture**
Next.js · React · React Native (Expo) · Supabase · Vercel · Turborepo

Version 2.1 | Updated 2026-05-14 | Confidential

> **Monorepo note:** DubGrid is an npm-workspaces + Turborepo monorepo. Two apps —
> `@dubgrid/web` (Next.js 16 App Router, `apps/web`) and `@dubgrid/mobile`
> (Expo SDK 54 / React Native, `apps/mobile`) — sit on top of 9 shared
> `packages/*` libraries. All RBAC-relevant permission logic now lives in the
> platform-neutral **`@dubgrid/authz`** package (`ROLE_LEVEL`, `ALL_PERMS` /
> `READ_ONLY_PERMS`, `applyViewImplications`, `unionPermissions`,
> `buildPermissionContext` / `buildPerms`, `extractJwtClaims`,
> `getPermissionsFromSession`), with domain types/enums and the self-action
> guard (`assertNotSelf` / `isSelfAction` / `SelfActionForbiddenError` in
> `packages/domain/src/self-guard.ts`) in **`@dubgrid/domain`**. The web app
> consumes these via `apps/web/src/features/permissions/` (`usePermissions.ts`,
> `core`, `client`, `shared`, `index`); the mobile backend orchestration in
> `@dubgrid/mobile-api-core` consumes `@dubgrid/authz` directly. Paths in this
> document reflect the monorepo layout (`apps/web/...`, `apps/web/middleware.ts`).

---

## 1. System Overview & Architecture

DubGrid is a multi-tenant SaaS scheduling platform governed by a four-tier RBAC model. This document defines the complete technical implementation — from database schema to Vercel Edge Middleware — with explicit strategies to eliminate every class of race condition that can arise during authentication, role changes, and concurrent data writes.

### 1.1 The Four-Tier Hierarchy

| Tier   | Role        | Type          | Scope    | Key Permissions                                                                                      |
| ------ | ----------- | ------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Tier 4 | Gridmaster  | platform_role | Global   | God mode: manage all orgs, impersonate any user, view audit logs, create/deactivate organizations    |
| Tier 3 | Super Admin | org_role      | Tenant   | Org owner: full access, user management, configure admin permissions, all settings                   |
| Tier 2 | Admin       | org_role      | Tenant   | Configurable: granular per-user permissions set by super admin (see Section 1.3)                     |
| Tier 0 | User        | org_role      | Tenant   | Read-only: canViewSchedule + canViewStaff always true, no write access                               |

**Key distinction:** `platform_role` is stored in the `profiles` table (gridmaster or none). `org_role` is stored in `organization_memberships` and is scoped per-organization. A user's **effective role** is the higher of the two — gridmaster overrides any org_role.

### 1.2 The Three Layers of Defense

Security is enforced at three independent layers. Compromising one layer does not grant access — all three must be satisfied simultaneously.

| Layer        | Technology             | Responsibility                                                  | Race Condition Risk                                              |
| ------------ | ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| A — Entryway | Vercel Edge Middleware | Subdomain routing, JWT role verification, request blocking      | JWT expiry window — mitigated by short TTL + refresh lock        |
| B — Identity | Supabase Custom Claims | Role & org_id baked into JWT, instant permission decisions      | Stale JWT after role change — mitigated by forced refresh flow   |
| C — Vault    | Supabase RLS Policies  | Row-level org isolation, gridmaster bypass policy, write guards | Concurrent writes — mitigated by atomic SQL + optimistic locking |

### 1.3 Admin Permissions Model

Admins (Tier 2) receive a configurable set of permissions stored as JSONB in `organization_memberships.admin_permissions`. Super admins configure these per-user. The canonical `AdminPermissions` interface — **25 permissions** — is defined in `packages/domain/src/permissions.ts` and consumed everywhere through `@dubgrid/authz`.

All permissions default to `false` **except** `canViewSchedule` and `canViewStaff`, which are **always true** for any authenticated user (including Tier 0 `user`). The order below matches the interface definition.

| #  | Category   | Permission                       | Delegatable | Description                                                    |
| -- | ---------- | -------------------------------- | ----------- | -------------------------------------------------------------- |
| 1  | Schedule   | `canViewSchedule`                | Always on   | View the schedule grid (always true for all authed users)      |
| 2  | Schedule   | `canEditShifts`                  | Yes         | Create, edit, delete schedule cells                            |
| 3  | Schedule   | `canPublishSchedule`             | Yes         | Publish draft changes                                          |
| 4  | Schedule   | `canApplyRecurringSchedule`      | Yes         | Apply recurring shift templates onto the grid                  |
| 5  | Notes      | `canEditNotes`                   | Yes         | Manage schedule notes                                          |
| 6  | Notes      | `canEditScheduleIndicators`      | Yes         | Manage schedule indicators (gates `schedule_notes` RLS — §4.5) |
| 7  | Recurring  | `canViewRecurringShifts`         | Yes         | View recurring shift templates                                 |
| 8  | Recurring  | `canManageRecurringShifts`       | Yes         | Configure recurring shift templates                            |
| 9  | Recurring  | `canManageShiftSeries`           | Yes         | Manage repeating shift series                                  |
| 10 | Staff      | `canViewStaff`                   | Always on   | View staff roster (always true for all authed users)           |
| 11 | Staff      | `canViewEmployeeDetails`         | Yes         | View full employee detail records                              |
| 12 | Staff      | `canManageEmployees`             | Yes         | Add, edit, bench, terminate employees                          |
| 13 | Config     | `canViewFocusAreas`              | Yes         | View focus areas                                               |
| 14 | Config     | `canManageFocusAreas`            | Yes         | Manage focus areas / departments                               |
| 15 | Config     | `canViewScheduleDefinitions`     | Yes         | View schedule definitions (shift codes, absence types)         |
| 16 | Config     | `canManageScheduleDefinitions`   | Yes         | Manage schedule definitions                                    |
| 17 | Config     | `canViewIndicatorTypes`          | Yes         | View note/indicator type definitions                           |
| 18 | Config     | `canManageIndicatorTypes`        | Yes         | Manage note/indicator type definitions                         |
| 19 | Config     | `canManageOrgSettings`           | No          | Edit org name, address, phone, timezone (super_admin only)     |
| 20 | Config     | `canViewOrgLabels`               | Yes         | View custom terminology labels                                 |
| 21 | Config     | `canManageOrgLabels`             | Yes         | Edit custom terminology labels                                 |
| 22 | Coverage   | `canViewCoverageRequirements`    | Yes         | View staffing minimum requirements                             |
| 23 | Coverage   | `canManageCoverageRequirements`  | Yes         | Manage staffing minimum requirements                           |
| 24 | Requests   | `canApproveShiftRequests`        | Yes         | Approve or reject shift pickup/swap requests                   |
| 25 | Dashboard  | `canViewDashboardAnalytics`      | Yes         | View dashboard analytics                                       |

**View-implications.** `@dubgrid/authz`'s `applyViewImplications` guarantees that every `canManage*` permission implies its matching `canView*` permission. A membership row only needs to store the `canManage*` flag; the resolved permission set always exposes the corresponding `canView*` as `true`. The view-only baseline (`READ_ONLY_PERMS`) is what a Tier 0 `user` receives.

**Always-true permissions.** `canViewSchedule` and `canViewStaff` are forced to `true` for every authenticated user regardless of role or stored JSONB — Tier 0 users can always see the schedule grid and the staff roster.

**Super admin-only (never delegatable).** `canManageUsers`, `canConfigureAdminPermissions`, and `canManageOrgSettings` can never be granted to an `admin` — they are reserved for `super_admin` (Tier 3) and cannot be set in the `admin_permissions` JSONB. `canConfigureAdminPermissions` is what gates the AdminPermissionsEditor itself.

**Department-template union inheritance.** Management-type departments (`departments.type = 'management'`) define a `permissions` JSONB template. A member who belongs to one or more management departments inherits the **union** of their per-user `admin_permissions` and every department template — most-permissive-wins, computed by `@dubgrid/authz`'s `unionPermissions`. `buildPermissionContext` assembles the final effective set: role baseline → JSONB → department-template union → view-implications.

---

## 2. Database Schema (Race-Condition-Safe)

Every table is designed with constraints that make invalid states unrepresentable at the database level — the strongest possible guarantee against race conditions.

### 2.1 Core Tables

#### profiles (extends auth.users)

```sql
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  platform_role platform_role NOT NULL DEFAULT 'none',  -- enum: 'gridmaster' | 'none'
  version       BIGINT NOT NULL DEFAULT 0,              -- optimistic lock counter
  role_locked   BOOLEAN NOT NULL DEFAULT FALSE,         -- prevents concurrent promotions
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_gridmaster CHECK (
    platform_role <> 'gridmaster' OR org_id IS NULL     -- gridmaster has no org
  )
);
```

#### organizations

```sql
CREATE TABLE public.organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  address               TEXT,
  phone                 TEXT,
  timezone              TEXT NOT NULL DEFAULT 'America/Chicago',
  employee_count        INTEGER,
  focus_area_label      TEXT NOT NULL DEFAULT 'Focus Areas',
  certification_label   TEXT NOT NULL DEFAULT 'Certifications',
  role_label            TEXT NOT NULL DEFAULT 'Roles',
  logo_url              TEXT,
  app_name              TEXT DEFAULT 'DubGrid',
  theme_config          JSONB DEFAULT '{}'::JSONB,
  landing_page_config   JSONB DEFAULT '{}'::JSONB,
  archived_at           TIMESTAMPTZ,
  -- Test-sandbox support (migration 001_schema.sql)
  workspace_kind          TEXT NOT NULL DEFAULT 'production'
                            CHECK (workspace_kind IN ('production', 'sandbox')),
  sandbox_source_org_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  sandbox_owner_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sandbox_expires_at      TIMESTAMPTZ,            -- 30-day TTL for sandbox orgs
  sandbox_template_version TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Test sandbox.** A `workspace_kind = 'sandbox'` organization is an isolated
> clone of a production org's config, created via `features/test-sandbox/` +
> `app/api/test-sandbox/` (a `force-dynamic` POST route with CSRF + rate
> limiting via `testSandboxLimiter`; actions `create` / `reset` / `archive`).
> Sandboxes carry a 30-day TTL (`sandbox_expires_at`), are owned by the
> creating user (`sandbox_owner_user_id`), and are **rejected for mobile
> login** by `@dubgrid/mobile-api-core`. `get_my_organizations` returns a
> `workspace_kind` column so callers can distinguish them.

#### organization_memberships (per-org role + admin permissions)

```sql
CREATE TABLE public.organization_memberships (
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_role          org_role NOT NULL DEFAULT 'user',  -- enum: 'super_admin' | 'admin' | 'user'
  admin_permissions JSONB,                             -- null for non-admin roles
  department_ids    UUID[],                            -- management/scheduled dept membership
  archived_at       TIMESTAMPTZ,
  landing_card_dismissed_at  TIMESTAMPTZ,              -- PersonaLandingCard dismissal (migration 001)
  onboarding_step_telemetry  JSONB NOT NULL DEFAULT '{}'::JSONB,  -- per-step onboarding telemetry
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);
```

#### role_change_log (Audit + Idempotency)

```sql
CREATE TABLE public.role_change_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id     UUID NOT NULL,
  changed_by_id      UUID,
  from_role          TEXT NOT NULL,
  to_role            TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL UNIQUE,
  change_type        TEXT NOT NULL DEFAULT 'role_change',
  permissions_before JSONB,
  permissions_after  JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_change_type CHECK (change_type IN ('role_change', 'permission_change'))
);

CREATE INDEX ON role_change_log (idempotency_key);
CREATE INDEX ON role_change_log (target_user_id, created_at DESC);
```

> **Note:** The `role_change_log` table does not have an `org_id` column. The org context is derived from the target user's profile at query time. The `change_type` and `permissions_before`/`permissions_after` columns support logging both role changes and admin permission changes.

#### jwt_refresh_locks (Prevents Stale JWT Race)

```sql
CREATE TABLE public.jwt_refresh_locks (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL,
  reason       TEXT
);
```

### 2.2 Critical Database Constraints

> **Why Constraints Beat Application-Level Checks**
>
> Application code can have race conditions. A CHECK constraint or UNIQUE index at the database level is evaluated inside a single atomic transaction — it is physically impossible for two concurrent requests to violate it simultaneously.
>
> **Rule:** Every invariant that must always be true goes in the schema. Application logic only handles "happy path" routing.

```sql
-- org_role enum: only valid org-level roles
CREATE TYPE org_role AS ENUM ('super_admin', 'admin', 'user');

-- platform_role enum: only valid platform-level roles
CREATE TYPE platform_role AS ENUM ('gridmaster', 'none');

-- One membership per user per org
-- (enforced by UNIQUE constraint on (user_id, org_id) in organization_memberships)

-- Enforce role hierarchy via RLS + SECURITY DEFINER RPCs
-- (see Sections 3 and 4)
```

### 2.3 RBAC & Lifecycle SQL Functions (migration 002_functions_triggers.sql)

| Function | Notes |
| -------- | ----- |
| `change_user_role(p_target_user_id, p_new_role, p_changed_by_id, p_idempotency_key)` | Atomic role change RPC. **Hard-blocks self-role-change** — if `p_target_user_id = auth.uid()` the function raises `P0001`. Org is derived from the target's profile; there is no `p_org_id` parameter (see §3.1). |
| `complete_onboarding(...)` | Marks an org/membership onboarding complete. Now **idempotent** — re-invoking after completion is a no-op rather than an error, so a double-submit from the wizard cannot fail. |
| `dismiss_landing_card(p_org_id)` | New `SECURITY DEFINER` function. Sets `organization_memberships.landing_card_dismissed_at = NOW()` for the calling user in the given org — backs the dismissable `PersonaLandingCard`. |
| `get_my_organizations()` | Return type now includes a `workspace_kind` column and **filters out archived** memberships/orgs, so callers see only live workspaces and can tell sandbox from production. |
| `custom_access_token_hook(event)` | Auth hook — injects top-level JWT claims (see §5). |

> **Self-action guard (`@dubgrid/domain`).** Beyond the SQL-level `P0001` block,
> the platform-neutral `packages/domain/src/self-guard.ts` exports
> `assertNotSelf(actorId, targetId)` (throws `SelfActionForbiddenError`) and the
> predicate `isSelfAction(actorId, targetId)`. Web Route Handlers and
> `@dubgrid/mobile-api-core` call these before issuing self-targeting role /
> permission mutations so the request is rejected at the app boundary as well
> as at the database — defense in depth for "admin edits their own role".

---

## 3. Race Condition Catalog & Mitigations

This section enumerates every race condition that can occur in an RBAC system of this complexity and documents the precise mitigation for each.

### 3.1 Race Condition: Stale JWT After Role Change

| Property   | Detail                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | Super admin demotes an Admin at 10:00 AM. The Admin's JWT does not expire until 10:15 AM. For 15 minutes the user retains Admin permissions in Edge Middleware.                 |
| Severity   | HIGH — active over-privilege window                                                                                                                                             |
| Mitigation | Forced JWT invalidation via Supabase custom claims + refresh lock table                                                                                                         |

#### Implementation: Atomic Role Change + Forced Refresh

```sql
-- Supabase RPC: change_user_role()
-- Uses advisory lock + idempotency key for race-condition safety
CREATE OR REPLACE FUNCTION change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role          TEXT;
  v_target_org_id     UUID;
  v_caller_platform_role TEXT;
  v_caller_org_role   TEXT;
  v_caller_org_id     UUID;
BEGIN
  -- 0. Verify caller identity matches auth.uid()
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- 0a. HARD BLOCK: no one may change their own role (P0001).
  -- Mirrors @dubgrid/domain's assertNotSelf() at the app boundary.
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Users cannot change their own role'
      USING ERRCODE = 'P0001';
  END IF;

  -- 1. Advisory lock prevents concurrent role changes for same user
  PERFORM pg_advisory_xact_lock(hashtext('change_role_' || p_target_user_id::TEXT));

  -- 2. Idempotency check (prevents duplicate network retries)
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 3. Derive target user's org from their profile (not passed as param)
  SELECT org_id INTO v_target_org_id
  FROM profiles WHERE id = p_target_user_id;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active organization';
  END IF;

  -- 4. Lock the target row (prevents concurrent promotions)
  SELECT org_role::TEXT INTO v_old_role
  FROM organization_memberships
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id
  FOR UPDATE;

  -- 5. Verify caller permissions (platform_role + org_role checks)
  SELECT p.platform_role::TEXT, p.org_id
  INTO v_caller_platform_role, v_caller_org_id
  FROM profiles p WHERE p.id = auth.uid();

  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_caller_org_id;

  -- Non-gridmaster must be admin+ and in same org
  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_org_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  IF v_caller_platform_role <> 'gridmaster'
     AND (v_caller_org_id IS NULL OR v_caller_org_id <> v_target_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot change roles for users outside your organization';
  END IF;

  -- Admin cannot promote to admin/super_admin/gridmaster
  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND p_new_role IN ('gridmaster', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin, super_admin, or gridmaster';
  END IF;

  -- 6. Apply the role change
  UPDATE organization_memberships
  SET org_role = p_new_role::org_role
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id;

  UPDATE profiles
  SET version = version + 1, updated_at = NOW()
  WHERE id = p_target_user_id;

  -- 7. Write audit log (no org_id column — derived at query time)
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 8. Write JWT refresh lock (blocks new token issuance for 5s)
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds', reason = 'role_change';

  RETURN jsonb_build_object(
    'status', 'success',
    'from_role', v_old_role,
    'to_role', p_new_role
  );
END;
$$;
```

### 3.2 Race Condition: Concurrent Role Promotions

| Property   | Detail                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | Two super admins in different browser tabs both try to promote the same User to Admin at the exact same moment. Without a lock, the membership row could be written twice with conflicting state.                                                   |
| Severity   | MEDIUM — results in audit log confusion and potential privilege escalation                                                                                                                                                                          |
| Mitigation | `SELECT ... FOR UPDATE` row lock inside the `change_user_role()` RPC ensures only one transaction proceeds at a time. The second caller blocks, then reads the already-updated row and returns "already_applied" if the idempotency key matches.    |

### 3.3 Race Condition: Double-Submit on Schedule Writes

| Property   | Detail                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | An Admin clicks "Save Shift" and the network is slow. They click again. Two identical POST requests reach the server within milliseconds of each other. Without a guard, the same shift is inserted twice.    |
| Severity   | MEDIUM — duplicate data, confusing UI state                                                                                                                                                                   |
| Mitigation | Optimistic locking via version column + client-side idempotency key. Supabase unique constraint on `(org_id, idempotency_key)` prevents duplicate insertion.                                                  |

```sql
-- canonical schedule cell with optimistic lock (unique on emp_id + date)
CREATE TABLE public.schedule_cells (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id         UUID NOT NULL,
  date           DATE NOT NULL,
  org_id         UUID NOT NULL,
  version        BIGINT NOT NULL DEFAULT 0,
  series_id      UUID,
  from_recurring BOOLEAN NOT NULL DEFAULT false,
  focus_area_id  BIGINT,
  created_by     UUID,
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (emp_id, date)
);
```

> **Note:** Draft and published state now live in `schedule_cell_snapshots`, with ordered work segments in `schedule_cell_segments`. Deletions are represented as a draft snapshot whose `state_kind` is `deleted`.

### 3.4 Race Condition: Optimistic Lock Violation on Update

When an Admin edits a schedule cell that another Admin just modified, the second write must be rejected — not silently overwrite the first.

```ts
// Frontend React mutation (using React Query)
const updateScheduleCell = async ({ cellId, changes, expectedVersion }) => {
  const { data, error } = await supabase
    .from("schedule_cells")
    .update({ ...changes, version: expectedVersion + 1 })
    .eq("id", cellId)
    .eq("version", expectedVersion) // <-- optimistic lock check
    .select()
    .single();

  if (!data) {
    throw new OptimisticLockError(
      "Schedule cell was modified by another user. Reload and retry.",
    );
  }
  return data;
};
```

> **Note:** In `apps/web` the browser does not hit `schedule_cells` directly —
> it calls a feature `client/api.ts` that `fetch()`es a Route Handler, which
> runs the optimistic-locked write via `apps/web/src/lib/db/schedule`. The
> `.eq('version', expected)` check shown above is the underlying mechanism.

### 3.5 Race Condition: Gridmaster Impersonation Token Collision

| Property   | Detail                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | A Gridmaster opens impersonation sessions for two different tenant users in parallel. If both use the same short-lived token namespace, the second token could overwrite the first, causing cross-tenant data leak.                                                    |
| Severity   | CRITICAL — cross-tenant data exposure                                                                                                                                                                                                                                  |
| Mitigation | Each impersonation session gets a cryptographically unique session_id scoped to `(gridmaster_id + target_user_id + timestamp)`. Stored in a dedicated `impersonation_sessions` table with a 30-minute expiry. RLS on all tables checks for active impersonation scope. |

```sql
CREATE TABLE public.impersonation_sessions (
  session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gridmaster_id    UUID NOT NULL REFERENCES auth.users(id),
  target_user_id   UUID NOT NULL REFERENCES auth.users(id),
  target_org_id    UUID NOT NULL REFERENCES organizations(id),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_active_session_per_target UNIQUE (gridmaster_id, target_user_id)
);

CREATE INDEX ON impersonation_sessions (expires_at);
```

---

## 4. Supabase RLS Policies

Row Level Security is the final and non-bypassable layer. Even if a user manipulates the JWT or the frontend, the RLS policies enforce correct access at the SQL execution level.

### 4.1 Enable RLS on All Tables

```sql
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_cells            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_cell_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_cell_segments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_change_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations               ENABLE ROW LEVEL SECURITY;

-- Helper functions: extract custom claims from JWT
-- Claims are at the TOP LEVEL of the JWT, NOT inside app_metadata
CREATE OR REPLACE FUNCTION caller_org_id() RETURNS UUID AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::UUID,
    NULL
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION caller_org_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'org_role',
    'user'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION caller_platform_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'platform_role',
    'none'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_gridmaster() RETURNS BOOLEAN AS $$
  SELECT caller_platform_role() = 'gridmaster';
$$ LANGUAGE sql STABLE;
```

### 4.2 Schedule Cell Table Policies

Schedule state is **not** a flat `shifts` table. The canonical cell record lives
in `schedule_cells`; draft/published state lives in `schedule_cell_snapshots`,
with ordered work segments in `schedule_cell_segments`. The same org-isolation
pattern is applied to each; `schedule_cells` is shown below.

```sql
-- SELECT: users see only their org (or gridmaster sees all)
CREATE POLICY "schedule_cells_select" ON schedule_cells FOR SELECT
  USING (
    is_gridmaster()
    OR org_id = caller_org_id()
  );

-- INSERT: admin with canEditShifts or super_admin in same org
CREATE POLICY "schedule_cells_insert" ON schedule_cells FOR INSERT
  WITH CHECK (
    org_id = caller_org_id()
    AND caller_org_role() IN ('super_admin', 'admin')
  );

-- UPDATE: admin with canEditShifts or super_admin; row must belong to same org
CREATE POLICY "schedule_cells_update" ON schedule_cells FOR UPDATE
  USING  (org_id = caller_org_id())
  WITH CHECK (
    org_id = caller_org_id()
    AND caller_org_role() IN ('super_admin', 'admin')
  );

-- DELETE: super_admin or gridmaster only
-- (in practice a "delete" is usually a draft snapshot with state_kind = 'deleted')
CREATE POLICY "schedule_cells_delete" ON schedule_cells FOR DELETE
  USING (
    is_gridmaster()
    OR (org_id = caller_org_id() AND caller_org_role() = 'super_admin')
  );
```

> **Note:** Fine-grained admin permission checks (e.g., `canEditShifts`) are enforced at the application layer in addition to RLS. RLS provides the org-isolation guarantee; the application layer enforces which specific actions an admin can perform within their org.

### 4.2a Schedule Notes Policies

The `schedule_notes` table's `INSERT` / `UPDATE` / `DELETE` policies gate on
`check_admin_permission('canEditScheduleIndicators')` (migration
`003_rls_policies.sql`). This **changed** from the older `canEditNotes` gate —
indicator editing is now its own permission (#6 in §1.3), distinct from
`canEditNotes` (#5).

### 4.3 Profiles Table Policies

```sql
-- Users can read their own profile + all profiles in same org
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (
    is_gridmaster()
    OR id = auth.uid()
    OR org_id = caller_org_id()
  );

-- Role changes ONLY via change_user_role() RPC (SECURITY DEFINER)
-- Direct UPDATE on platform_role column is blocked for all non-gridmaster
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND platform_role = (SELECT platform_role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_update_gridmaster" ON profiles FOR UPDATE
  USING  (is_gridmaster())
  WITH CHECK (is_gridmaster());
```

### 4.4 Role Change Log Policies

```sql
-- Immutable audit trail: insert only, no updates or deletes
CREATE POLICY "audit_insert" ON role_change_log FOR INSERT
  WITH CHECK (
    caller_org_role() = 'super_admin'
    OR is_gridmaster()
  );

-- Super admins can read logs for users in their org (via profiles join); gridmaster reads all
CREATE POLICY "audit_select" ON role_change_log FOR SELECT
  USING (
    is_gridmaster()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = target_user_id AND org_id = caller_org_id()
    )
  );

-- No UPDATE or DELETE policies = physically impossible to alter audit trail
```

---

## 5. Supabase Custom JWT Claims

Custom claims eliminate per-request database round trips for role checks. The role and org_id live directly inside the signed JWT, so Vercel Edge Middleware and the React client can make permission decisions in zero additional queries.

### 5.1 Auth Hook: Inject Claims on Sign-In

```sql
-- Supabase Auth Hook (Database Function)
-- Runs after every successful sign-in, before JWT is issued
-- Claims are injected at the TOP LEVEL of the JWT (not app_metadata)
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_user_id       UUID := (event->>'user_id')::UUID;
  v_platform_role TEXT;
  v_org_id        UUID;
  v_org_role      TEXT;
  v_org_slug      TEXT;
  v_claims        JSONB;
  v_locked_until  TIMESTAMPTZ;
BEGIN
  -- Check for JWT refresh lock (blocks token issuance for 5s after role change)
  SELECT locked_until INTO v_locked_until
    FROM jwt_refresh_locks
   WHERE user_id = v_user_id;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    -- Lock active: issue a minimal JWT without elevated claims
    -- The client will retry after the lock expires
    v_claims := event->'claims';
    v_claims := jsonb_set(v_claims, '{platform_role}', '"none"');
    v_claims := jsonb_set(v_claims, '{org_role}', '"user"');
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- Clean up expired lock
  IF v_locked_until IS NOT NULL THEN
    DELETE FROM jwt_refresh_locks WHERE user_id = v_user_id;
  END IF;

  -- Fetch platform role
  SELECT platform_role::TEXT, org_id
    INTO v_platform_role, v_org_id
    FROM profiles
   WHERE id = v_user_id;

  -- Fetch org membership
  SELECT om.org_role::TEXT, o.slug
    INTO v_org_role, v_org_slug
    FROM organization_memberships om
    JOIN organizations o ON o.id = om.org_id
   WHERE om.user_id = v_user_id
     AND om.org_id = v_org_id;

  -- Inject claims at TOP LEVEL of JWT payload
  v_claims := event->'claims';
  v_claims := jsonb_set(v_claims, '{platform_role}', to_jsonb(COALESCE(v_platform_role, 'none')));
  v_claims := jsonb_set(v_claims, '{org_role}', to_jsonb(COALESCE(v_org_role, 'user')));
  IF v_org_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{org_id}', to_jsonb(v_org_id::TEXT));
  END IF;
  IF v_org_slug IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{org_slug}', to_jsonb(v_org_slug));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;
```

### 5.2 JWT Payload Structure

```json
{
  "sub": "usr_abc123...",
  "iat": 1720000000,
  "exp": 1720003600,
  "platform_role": "none",
  "org_role": "admin",
  "org_id": "org_xyz789...",
  "org_slug": "acme",
  "aud": "authenticated"
}
```

> **Claims are at the TOP LEVEL** of the JWT, NOT inside `app_metadata`. This is critical — the middleware reads `payload.platform_role`, not `payload.app_metadata.role`.

---

## 6. Vercel Edge Middleware

The middleware (`apps/web/middleware.ts`) runs at the CDN edge — geographically closest to the user — before any backend compute is invoked. Beyond JWT verification and subdomain-based role routing it also:

- **Org-suspension check** — looks up whether the caller's org is suspended/archived, using a **Redis (Upstash) cache with a ~30 s TTL** to avoid a DB round trip on every request. A suspended org's users are bounced to a billing/suspended screen.
- **Impersonation cookie handling** — reads the gridmaster impersonation cookie/header and threads the impersonation context through so downstream RLS and Route Handlers see the impersonated identity.
- **`jwtVerify` → `decodeJwt` fallback** — see the security note below; this fallback is load-bearing and must not be removed.

### 6.1 Subdomain Routing Logic

| Subdomain                     | Allowed Roles                     | Redirect on Failure        |
| ----------------------------- | --------------------------------- | -------------------------- |
| `gridmaster.dubgrid.com`      | gridmaster only                   | Redirect → `/login`        |
| `{slug}.dubgrid.com/people`   | admin+, super_admin, gridmaster   | Redirect → `/schedule`     |
| `{slug}.dubgrid.com/settings` | admin+, super_admin, gridmaster   | Redirect → `/schedule`     |
| `{slug}.dubgrid.com/schedule` | all authenticated org users       | Redirect → `/login`        |
| `dubgrid.com`                 | unauthenticated (public routes)   | N/A                        |

> The staff roster route is `/people` (`apps/web/src/app/people/page.tsx`,
> `people/[id]/page.tsx`) — the legacy `/staff` route no longer exists. The
> staff-configuration settings sub-route is `/settings/staff-config`.

### 6.2 Middleware Implementation

```ts
// apps/web/middleware.ts (Vercel Edge Runtime)
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { createServerClient } from "@supabase/ssr";

// JWKS keyset — fetches public keys from Supabase's JWKS endpoint.
// Supports ES256 (asymmetric) JWT signing.
function getJwks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
  );
}

const ROLE_HIERARCHY: Record<string, number> = {
  gridmaster: 4,
  super_admin: 3,
  admin: 2,
  user: 0,
};

interface JWTClaims {
  platform_role?: string;
  org_role?: string;
  org_id?: string;
  org_slug?: string;
}

// Effective role: gridmaster platform_role overrides org_role
function calculateEffectiveRole(claims: JWTClaims): string {
  return claims.platform_role === "gridmaster"
    ? "gridmaster"
    : claims.org_role ?? "user";
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const pathname = req.nextUrl.pathname;
  const subdomain = parseHost(host).subdomain;

  // Public routes — no auth required
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/accept-invite" ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Read session via @supabase/ssr (handles multi-chunk cookies)
  const supabase = createServerClient(/* ... cookie config ... */);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  // Verify JWT via JWKS — read top-level claims
  let claims: JWTClaims;
  try {
    const jwks = getJwks();
    if (jwks) {
      const { payload } = await jwtVerify(session.access_token, jwks);
      claims = payload as JWTClaims;
    } else {
      claims = decodeJwt(session.access_token) as JWTClaims;
    }
  } catch {
    // Fallback to unverified decode (RLS enforces real security)
    // Never trust gridmaster from unverified tokens
    claims = decodeJwt(session.access_token) as JWTClaims;
    if (claims.platform_role === "gridmaster") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Fallback: if claims are missing, resolve from DB
  if (!claims.platform_role || !claims.org_role) {
    // Fetch from profiles + organization_memberships
    // (see apps/web/middleware.ts for full implementation)
  }

  const effectiveRole = calculateEffectiveRole(claims);
  const level = ROLE_HIERARCHY[effectiveRole] ?? 0;

  // Route guards
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/people") && level < 2) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  if (pathname.startsWith("/settings") && level < 2) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  if (pathname.startsWith("/gridmaster") && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Keep org-scoped users on their org subdomain
  if (effectiveRole !== "gridmaster" && claims.org_slug) {
    const expectedHost = buildSubdomainHost(claims.org_slug, parsedHost);
    if (host !== expectedHost) {
      const url = new URL(req.url);
      url.host = expectedHost;
      return NextResponse.redirect(url);
    }
  }

  // Inject verified role into request headers
  const res = NextResponse.next();
  res.headers.set("x-dubgrid-role", effectiveRole);
  res.headers.set("x-dubgrid-org-id", claims.org_id ?? "");
  res.headers.set("x-dubgrid-org-slug", claims.org_slug ?? "");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico|api).*)"],
};
```

> **Security Note: Middleware is not the last line of defense**
>
> The Edge Middleware provides latency-optimized routing and UX-level gating. It is NOT the security layer — that role belongs exclusively to Supabase RLS (Section 4). A sophisticated attacker who bypasses middleware still hits RLS, which cannot be bypassed from the client.
>
> **The `jwtVerify` → `decodeJwt` fallback MUST stay.** `jwtVerify` against the
> remote JWKS can fail in production (key-fetch hiccups, clock skew, transient
> network errors). When it does, the middleware falls back to the *unverified*
> `decodeJwt` for **non-gridmaster** users — because RLS, not middleware, is the
> real security boundary, and locking every admin/user out on a JWKS blip is
> unacceptable. Gridmaster is the one exception: a `platform_role: 'gridmaster'`
> claim coming from an unverified token is rejected outright. Removing this
> fallback has previously broken all admin/user logins — do not "tighten" it.

---

## 7. React Frontend Architecture

The React layer enforces role-aware rendering using a single source of truth: the parsed JWT claims combined with admin permissions fetched from the database. The actual permission math — claim extraction, view-implications, department-template unions, role levels — lives in the platform-neutral **`@dubgrid/authz`** package so that both `apps/web` and `apps/mobile`/`@dubgrid/mobile-api-core` resolve permissions identically. The web app's `apps/web/src/features/permissions/` directory (`core`, `client`, `shared`, `index`, `usePermissions.ts`) is a thin wrapper over `@dubgrid/authz`.

### 7.1 Auth Context & Permission Hook

```ts
// apps/web/src/features/permissions/usePermissions.ts
// Thin wrapper over @dubgrid/authz: getPermissionsFromSession / extractJwtClaims
// / buildPermissionContext do the heavy lifting; this hook adapts them to React.
import { decodeJwt } from "jose";

export function usePermissions() {
  // Decode JWT from the Supabase session
  const token = session?.access_token;
  const payload = token ? decodeJwt(token) : null;

  // Read top-level claims
  const platformRole = (payload?.platform_role as string) ?? "none";
  const orgRole = (payload?.org_role as string) ?? "user";
  const orgId = payload?.org_id as string | undefined;

  // Calculate effective role
  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : orgRole;
  const level = ROLE_HIERARCHY[effectiveRole] ?? 0;

  // For admin users: fetch admin_permissions from DB
  // (cached via React Query)
  const adminPermissions = useAdminPermissions(orgId, effectiveRole);

  return {
    effectiveRole,
    level,
    orgId,
    isGridmaster: platformRole === "gridmaster",
    isSuperAdmin: orgRole === "super_admin",
    isAdmin: orgRole === "admin",
    // Permission check: super_admin always true, admin checks permissions
    can: (permission: keyof AdminPermissions) => {
      if (level >= 3) return true; // super_admin+
      if (level < 2) return false; // user has no write permissions
      return adminPermissions?.[permission] ?? false;
    },
  };
}
```

### 7.2 Conditional UI Rendering

```tsx
// components/ScheduleToolbar.tsx
export function ScheduleToolbar() {
  const { can, isGridmaster } = usePermissions();

  return (
    <Toolbar>
      {/* Every tier can view the schedule */}
      <ViewButton />

      {/* Admins with canEditShifts can create/edit shifts */}
      {can("canEditShifts") && (
        <>
          <CreateShiftButton />
          <EditShiftButton />
        </>
      )}

      {/* Admins with canPublishSchedule can publish */}
      {can("canPublishSchedule") && <PublishButton />}

      {/* Admins with canEditNotes can add notes */}
      {can("canEditNotes") && <AddNoteButton />}

      {/* Admins with canApplyRecurringSchedule can apply templates */}
      {can("canApplyRecurringSchedule") && <ApplyRecurringButton />}
    </Toolbar>
  );
}
```

### 7.3 Role Change Mutation (Frontend)

```ts
// apps/web/src/features/permissions/useRoleChange.ts
import { v4 as uuidv4 } from "uuid";
import { useMutation } from "@tanstack/react-query";

export function useRoleChange() {
  return useMutation({
    mutationFn: async (params: {
      targetUserId: string;
      newRole: OrganizationRole;
    }) => {
      const idempotencyKey = uuidv4();

      // NOTE: no p_org_id — the RPC derives the target's org from their
      // profile (see §3.1). Passing an org would be both redundant and a
      // cross-org-tampering vector.
      const { data, error } = await supabase.rpc("change_user_role", {
        p_target_user_id: params.targetUserId,
        p_new_role: params.newRole,
        p_changed_by_id: session.user.id,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;
      return data;
    },
    // Optimistic update
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["org-members"] });
      const prev = queryClient.getQueryData(["org-members"]);
      queryClient.setQueryData(["org-members"], (old: any) =>
        old.map((m: any) =>
          m.id === vars.targetUserId ? { ...m, org_role: vars.newRole } : m,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(["org-members"], ctx?.prev);
    },
  });
}
```

---

## 8. Gridmaster Command Center

The Gridmaster dashboard provides global platform oversight without routing through individual tenant RLS paths. All Gridmaster actions are logged.

### 8.1 Capabilities

| Feature                 | Implementation                                                               | Race Condition Guard                            |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Global Org Monitor      | Dashboard with org health metrics — active users, member count, status       | Read-only — no race risk                        |
| User Management         | Platform-wide user list across all organizations                             | Role changes via idempotent RPC                 |
| User Impersonation      | Create `impersonation_sessions` row, receive scoped JWT                      | UNIQUE constraint prevents collision            |
| Org Creation            | Create new organizations with slug validation                                | UNIQUE slug constraint                          |
| Org Archiving           | Set `organizations.archived_at = NOW()` in transaction                       | `SELECT FOR UPDATE` prevents concurrent toggles |
| Global Audit Log Viewer | SELECT from `role_change_log` (all orgs visible to gridmaster)               | Append-only table — no mutation risk            |
| Admin Permission Config | Configure per-admin permissions via AdminPermissionsEditor                   | Optimistic locking on membership row            |

### 8.2 Impersonation Flow

```ts
// 1. Gridmaster initiates impersonation
const { data: session } = await supabase.rpc("start_impersonation", {
  p_target_user_id: "usr_xyz...",
});

// 2. RPC creates impersonation_sessions row and returns scoped token
// 3. Gridmaster's client stores session_id in memory (not localStorage)
// 4. All subsequent API calls include X-Impersonation-Session header
// 5. RLS checks for active session with matching session_id

// End impersonation (or it auto-expires after 30 min)
await supabase.rpc("end_impersonation", { p_session_id: session.session_id });
```

---

## 9. Summary: Race Condition Prevention Matrix

| Race Condition                | Trigger                                             | Layer     | Mechanism                                                          |
| ----------------------------- | --------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Stale JWT after role change   | Role demoted but old JWT still valid                | Auth + DB | Force session invalidation via admin API + jwt_refresh_locks       |
| Concurrent role promotions    | Two super admins promote same user simultaneously   | DB        | `SELECT FOR UPDATE` row lock inside SECURITY DEFINER RPC           |
| Duplicate shift submission    | Network retry / double-click                        | DB        | UNIQUE `(org_id, idempotency_key)` + `(emp_id, date)` on `schedule_cells` |
| Optimistic lock violation     | Two admins edit same schedule cell                  | App + DB  | `.eq('version', expected)` Supabase query + UI error handling      |
| Impersonation token collision | Gridmaster opens two sessions in parallel           | DB        | UNIQUE `(gridmaster_id, target_user_id)` on impersonation_sessions |
| Cross-tenant data read        | RLS bypass attempt via URL manipulation             | DB        | RLS `org_id = caller_org_id()` enforced at SQL execution           |
| Admin self-promotion          | Admin tries to set own role = super_admin           | App + DB  | `change_user_role` raises `P0001` if target = caller; `assertNotSelf` blocks at app boundary; RPC also checks caller role |
| Privilege escalation via UI   | Frontend hides buttons; API called directly         | DB        | RLS `WITH CHECK` prevents inserts/updates outside role permission  |
| Audit log tampering           | Admin tries to delete/edit audit record             | DB        | No UPDATE or DELETE RLS policy exists on `role_change_log`         |

> **Design Principle: Make Invalid States Unrepresentable**
>
> Every race condition in this system is prevented at the lowest possible layer — preferably the database schema itself. When an invariant is enforced by a CHECK constraint, UNIQUE index, or missing RLS policy, it is impossible to violate it regardless of what the application layer does.
>
> Application logic (React, Vercel Middleware) adds performance, UX polish, and early rejection. **Database constraints are the law.**

---

## 10. Per-Device Logout (Browser A ≠ Browser B)

### 10.1 Root Cause

> **The Problem: Two Logout Paths Need Different Scopes**
>
> **Voluntary Logout** (user clicks "Sign Out"): should only destroy the current browser's session. Other devices remain active.
>
> **Forced Logout** (role change / account suspension): MUST destroy all sessions — the user's privilege has changed and no stale session can be tolerated.

### 10.2 user_sessions Table (Track Devices Individually)

```sql
CREATE TABLE public.user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_label    TEXT,
  ip_address      INET,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refresh_token_hash  TEXT UNIQUE NOT NULL
);

CREATE INDEX ON user_sessions (user_id, last_active_at DESC);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_sessions_only" ON user_sessions
  USING (user_id = auth.uid());
```

### 10.3 Voluntary Logout: Local Scope Only

```ts
// apps/web/src/features/auth (logout hook)
export function useLogout() {
  return async () => {
    // scope: "local" = only clears THIS browser's session
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (!error) {
      queryClient.clear();
      router.push("/login");
    }
  };
}
```

### 10.4 Logout Decision Matrix

| Trigger                             | Scope  | Mechanism                                        | Other Devices Affected?          |
| ----------------------------------- | ------ | ------------------------------------------------ | -------------------------------- |
| User clicks "Sign Out"              | local  | `supabase.auth.signOut({ scope: 'local' })`      | No — all other sessions remain   |
| User clicks "Sign out all devices"  | others | `supabase.auth.signOut({ scope: 'others' })`     | Yes — all other sessions revoked |
| Super admin demotes/changes role    | global | Edge Function → `admin.signOut(uid, 'others')`   | Yes — forced, security-required  |
| Account suspended by Gridmaster     | global | Edge Function → `admin.signOut(uid, 'others')`   | Yes — forced, security-required  |
| Session revoked via Active Sessions | single | DELETE from user_sessions by refresh_token_hash  | Only the targeted device         |
| JWT expires naturally               | n/a    | Token not renewed — next request hits middleware | No — each JWT independent        |

---

## 11. Invite-Only Registration

Self-signup is completely disabled. Every user account must be created through an invitation issued by a super admin or gridmaster. A rogue actor who reaches the Supabase sign-up endpoint without a valid invite token is rejected before a profile row is ever created.

### 11.1 Disable Public Sign-Up

In Supabase Dashboard → Authentication → Providers → Email: set "Enable email signup" to OFF. This makes `supabase.auth.signUp()` return an error for any call not initiated through the invite flow.

### 11.2 invitations Table

```sql
CREATE TABLE public.invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  invited_by     UUID,
  email          TEXT NOT NULL,
  employee_id    UUID,                                    -- links to existing employee record
  role_to_assign org_role NOT NULL DEFAULT 'user',
  token          UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '72 hours',
  accepted_at    TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one pending (non-accepted, non-revoked) invitation per email per org
CREATE INDEX ON invitations (token);
CREATE INDEX ON invitations (org_id, email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
```

### 11.3 Invitation Flow

| Step | Actor         | Action                                                                      |
| ---- | ------------- | --------------------------------------------------------------------------- |
| 1    | Super Admin   | Fills "Invite User" form: selects employee, enters email + role             |
| 2    | Server        | Inserts `invitations` row with `employee_id` FK, returns token              |
| 3    | API Route     | `/api/send-invite-email` sends invitation via Resend                        |
| 4    | Invitee       | Clicks link → arrives at `/accept-invite?token=<uuid>`                      |
| 5    | Accept Flow   | Validates token, creates Supabase auth user, sets `employees.user_id`       |
| 6    | Auth Hook     | JWT issued with `platform_role`, `org_role`, `org_id`, `org_slug` claims    |
| 7    | Invitee       | Redirected to their org dashboard, fully authenticated                      |

### 11.4 Invitation Edge Cases

| Scenario                            | Behavior                                         | Mechanism                                          |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Duplicate invite to same email      | Old expired invite cleaned up, new one issued     | DELETE expired + INSERT with UNIQUE constraint      |
| User clicks expired link            | Returns error — invite expired                    | `expires_at` check in validation                   |
| User clicks already-used link       | Returns error — already accepted                  | `accepted_at IS NULL` check                        |
| Two users race to accept same token | First UPDATE wins; second gets no row back        | Atomic UPDATE ... WHERE accepted_at IS NULL         |
| Admin revokes before user accepts   | Returns error — revoked                           | `revoked_at IS NULL` check                         |
| Employee already has linked account | Invite blocked — user_id already set              | Pre-check in invite creation                       |

---

## 12. Implemented Security Features (Since v1.0)

The following features have been implemented since the initial RBAC design:

### 12.1 Password Reset Flow

Self-service password reset is fully implemented with security best practices:

1. **Forgot Password** (`/forgot-password`) — User enters email, Supabase sends reset link via `resetPasswordForEmail()`. Includes email enumeration protection: always shows "Check your email" regardless of whether the email exists in the system.
2. **Reset Password** (`/reset-password`) — Token-validated form with:
   - Password strength meter (4 levels: too short → weak → fair → strong)
   - Minimum 10-character requirement
   - Confirmation field with match validation
   - 5-second timeout fallback for invalid/expired tokens
   - Automatic local sign-out after successful reset
3. **Auth components** in `apps/web/src/components/auth/`: `PasswordInput` (show/hide toggle), `PasswordStrength` (visual meter), `AuthCard` (consistent layout)

### 12.2 Email Verification

New accounts created via invitation acceptance go through email verification:

- **Verify Email** (`/verify-email`) — Displays verification status with optional `?email=` param
- Resend button with 60-second cooldown to prevent abuse
- Listens for `SIGNED_IN` auth event to auto-redirect when verified
- Email enumeration protection (same UI regardless of email validity)

### 12.3 Rate Limiting

All public-facing API routes are rate-limited via Upstash Redis (`apps/web/src/lib/rate-limit.ts`):

| Limiter | Scope | Applied To |
| ------- | ----- | ---------- |
| `apiLimiter` | IP-based | `/api/validate-domain`, `/api/notify-impersonation` |
| `inviteLimiter` | Org-based (`invite:${orgId}`) | `/api/send-invite-email` — 200/h per org, shared across all super-admins in the org |
| `demoLimiter` | IP-based | `/api/request-demo` |

### 12.4 Branded Email Templates

Shared email template system in `apps/web/src/lib/email.ts`:
- `sanitizeHeaderValue()` — Prevents email header injection (strips CRLF, null bytes)
- `escapeHtml()` — Prevents XSS in email content
- `emailWrapper()` — Branded HTML template with DubGrid header, card layout, responsive design
- Used by invitation emails and demo request notifications

### 12.5 CSRF Protection

API routes that accept mutations validate the `Origin` header against `NEXT_PUBLIC_SITE_URL`. Server Actions include built-in CSRF protection via Next.js.

### 12.6 MFA Status Endpoint (Partial)

Multi-factor authentication is **partially implemented**. The
`/api/account/mfa-status` Route Handler reports whether the current user has
MFA enrolled (backed by `profiles.mfa_enabled` and Supabase's MFA factors), and
the mobile profile/security surface and web account screens read it. Full
enforcement — *requiring* TOTP for gridmaster and super_admin, plus an
enrollment flow — is still outstanding (see §13.1).

---

## 13. Recommended Features Not Yet Implemented

The following features are recommended before a production launch.

### 13.1 Priority 1 — Security (Implement Before Launch)

#### Multi-Factor Authentication (MFA) — Partially Implemented

| Property         | Detail                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Status           | **Partial.** An `/api/account/mfa-status` endpoint exists and surfaces enrollment state to web + mobile (see §12.6). Enrollment flow and role-based *enforcement* are not done. |
| Gap              | Until enrollment is enforced, any user whose password is compromised gives an attacker full access. Gridmaster and super admin accounts are high-value targets. |
| Recommendation   | Build the enrollment flow and enforce TOTP (Supabase MFA) for gridmaster and super_admin. Prompt admin/user roles to enroll optionally. |
| Supabase support | Built-in via `supabase.auth.mfa.enroll()` / `challenge()` / `verify()`                                                |

#### Failed Login Attempt Tracking & Account Lockout

| Property            | Detail                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Gap                 | No rate limit or lockout on the authentication endpoint. Brute-force attacks can try unlimited passwords.        |
| Recommendation      | Add failed attempt tracking. After 5 failures within 15 minutes, lock account and require email-based unlock.    |

#### IP Allowlisting for Gridmaster

| Property       | Detail                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Gap            | Any authenticated Gridmaster can access from any IP, including a stolen laptop.                               |
| Recommendation | Add a `gridmaster_allowed_ips` table. Middleware checks `req.ip` against the allowlist.                      |

### 13.2 Priority 2 — User Lifecycle

#### Soft Delete for Users and Orgs

| Property       | Detail                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Gap            | Hard deletes cascade through all tables with no recovery path.                                                      |
| Recommendation | Add `deleted_at TIMESTAMPTZ` to profiles and organizations. RLS adds `AND deleted_at IS NULL` to all queries.       |

### 13.3 Priority 3 — Operational

#### Refresh Token Rotation & Reuse Detection

| Property       | Detail                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Gap            | If a refresh token is stolen, the attacker can obtain new access tokens indefinitely.                                      |
| Recommendation | Enable Supabase's built-in refresh token rotation. Reuse detection revokes the entire session family on theft detection.   |

#### Role Change Notifications

| Property       | Detail                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Gap            | When a user is promoted or demoted, they receive no communication.                                                         |
| Recommendation | Trigger an email and in-app notification from the role change flow.                                                        |

#### GDPR / Data Export Compliance — Implemented

| Property       | Detail                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Status         | **Done.** Users can request a full export of their personal data; companion account-deletion / erasure routes also exist (`/api/auth/data-export`, `/api/auth/delete-account`, `/api/auth/gdpr-erase`, plus `/api/account/change-requests`). |
| Notes          | The export assembles all of a user's rows into a JSON archive. Listed here for completeness — no further work required for the export path itself. |

### 13.4 Feature Priority Summary

| Priority | Feature                                  | Status      | Risk if Skipped                                      |
| -------- | ---------------------------------------- | ----------- | ---------------------------------------------------- |
| P1       | MFA for Gridmaster & Super Admin         | **Partial** | Status endpoint exists; enrollment + enforcement still missing → account takeover via password compromise |
| P1       | Failed login tracking & lockout          | Not done    | Brute-force attacks succeed silently                 |
| P1       | IP allowlisting for Gridmaster           | Not done    | Stolen credentials = full platform access            |
| ~~P1~~   | ~~Password reset flow~~                  | ✅ Done     | ~~Users locked out permanently if password lost~~    |
| ~~P2~~   | ~~Email verification~~                   | ✅ Done     | ~~Unverified accounts receive org roles~~            |
| ~~P2~~   | ~~Rate limiting on API routes~~          | ✅ Done     | ~~Abuse of public endpoints~~                        |
| P2       | Soft delete (users & orgs)               | Not done    | Accidental permanent data loss                       |
| P3       | Refresh token rotation + reuse detection | Not done    | Stolen tokens usable indefinitely                    |
| P3       | Role change notifications                | Not done    | Silent UX — confused users after demotion            |
| ~~P3~~   | ~~GDPR data export~~                     | ✅ Done     | ~~Legal compliance gap in EU/UK markets~~            |

---

_DubGrid — Confidential_
