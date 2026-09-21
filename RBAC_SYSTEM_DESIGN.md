# DUBGRID

## Role-Based Access Control — Full System Design

**Race-Condition-Free Architecture**
Next.js · React · React Native (Expo) · Supabase · Vercel · Turborepo

Version 2.3 | Updated 2026-09-19 | Confidential

> **Monorepo note:** DubGrid is an npm-workspaces + Turborepo monorepo. Two apps —
> `@dubgrid/web` (Next.js 16 App Router, `apps/web`) and `@dubgrid/mobile`
> (Expo SDK 54 / React Native, `apps/mobile`) — sit on top of 11 shared
> `packages/*` libraries. All RBAC-relevant permission logic now lives in the
> platform-neutral **`@dubgrid/authz`** package (`ROLE_LEVEL`, `ALL_PERMS` /
> `READ_ONLY_PERMS`, `VIEW_IMPLICATIONS` / `applyViewImplications`,
> `buildPermissionContext` / `buildPerms`, `extractJwtClaims`,
> `getPermissionsFromSession`), with domain types/enums and the self-action
> guard (`assertNotSelf` / `isSelfAction` / `SelfActionForbiddenError` in
> `packages/domain/src/self-guard.ts`) in **`@dubgrid/domain`**. The five-minute
> sensitive-action assurance policy (`packages/authz/src/assurance.ts`) sits beside
> the permission logic so web and mobile make the same step-up decision. The web app
> consumes these via `apps/web/src/features/permissions/` (`usePermissions.ts`,
> `core`, `client`, `shared`, `index`); the mobile backend orchestration in
> `@dubgrid/mobile-api-core` consumes `@dubgrid/authz` directly. Paths in this
> document reflect the monorepo layout (`apps/web/...`, `apps/web/src/proxy.ts`).
> Route Handlers verify tokens locally (`lib/auth/verify-token.ts`, JWKS/ES256) with a
> Redis revocation check; a live `auth.getUser()` is reserved for sensitive actions and
> the mobile MFA-factor lookup. See `docs/authentication.md` §5a for that contract.

---

## 1. System Overview & Architecture

DubGrid is a multi-tenant SaaS scheduling platform governed by a four-tier RBAC model. This document defines the technical implementation — from database schema to the Vercel edge request proxy — with explicit strategies to eliminate race conditions that can arise during authentication, role changes, and concurrent data writes.

### 1.1 The Four-Tier Hierarchy

| Tier   | Role        | Type          | Scope  | Key Permissions                                                                                   |
| ------ | ----------- | ------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Tier 4 | Gridmaster  | platform_role | Global | God mode: manage all orgs, impersonate any user, view audit logs, create/deactivate organizations |
| Tier 3 | Super Admin | org_role      | Tenant | Org owner: full access, user management, configure admin permissions, all settings                |
| Tier 2 | Admin       | org_role      | Tenant | Configurable: granular per-user permissions set by super admin (see Section 1.3)                  |
| Tier 0 | User        | org_role      | Tenant | Read-only: canViewSchedule + canViewStaff always true, no write access                            |

**Key distinction:** `platform_role` is stored in the `profiles` table (gridmaster or none). `org_role` is stored in `organization_memberships` and is scoped per-organization. A user's **effective role** is the higher of the two — gridmaster overrides any org_role.

### 1.2 The Three Layers of Defense

Security is enforced at three independent layers. Compromising one layer does not grant access — all three must be satisfied simultaneously.

| Layer        | Technology             | Responsibility                                                  | Race Condition Risk                                              |
| ------------ | ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| A — Entryway | Next.js request proxy  | Subdomain routing, JWT role verification, request blocking      | JWT expiry window — mitigated by short TTL + refresh lock        |
| B — Identity | Supabase Custom Claims | Role & org_id baked into JWT, instant permission decisions      | Stale JWT after role change — mitigated by forced refresh flow   |
| C — Vault    | Supabase RLS Policies  | Row-level org isolation, gridmaster bypass policy, write guards | Concurrent writes — mitigated by atomic SQL + optimistic locking |

### 1.3 Admin Permissions Model

Admins (Tier 2) receive a configurable set of permissions stored as JSONB in `organization_memberships.admin_permissions`. Super admins configure these **per-user** (on the People page, via the `PermissionsEditor` surfaced from `UserManagement`). The canonical `AdminPermissions` interface — **26 keys** — is defined in `packages/domain/src/permissions.ts` and consumed everywhere through `@dubgrid/authz`.

> **What "26" counts, and what is delegatable.** The `AdminPermissions` interface holds
> exactly the 26 keys in the table below; these are the only keys ever written to the
> `admin_permissions` JSONB. Of those, two (`canViewSchedule`, `canViewStaff`) are forced
> true for everyone, and one (`canManageOrgSettings`) is super_admin-only: `PermissionsEditor`
> never renders it and always saves it `false`, and `buildPermissionContext` forces it off
> for admins whatever is stored,
> so an admin can actually be granted at most 23 of them. Separately, two further
> capabilities — `canManageUsers` and `canConfigureAdminPermissions` — are **not** part of
> `AdminPermissions`. They are computed on the resolved `PermissionContext`
> (`packages/authz/src/index.ts`) as `isSuperAdmin || isGridmaster`, can never be granted
> to an admin, and never appear in the JSONB.

Permissions are **per-person**, not per-department. Departments do not grant any
permission. `departments.permissions` exists on the schema (a JSONB column whose comment
still describes a management-department template), but no permission-resolution path
reads it. An **admin's** effective permissions =
`ADMIN_DEFAULT_PERMS` + their own `admin_permissions` JSONB, with view-implications applied.
A **user** is `READ_ONLY_PERMS` and nothing else: the JSONB is an admin-tier column
(`check_admin_permission` in SQL reads it for admins only, and the access route nulls it on
demotion), so a user row that still carries one never widens what that member sees.

`canViewSchedule` and `canViewStaff` are **always true** for any authenticated user (including Tier 0 `user`). Every other key defaults per role baseline: a `user` resolves against `READ_ONLY_PERMS` (all `false`) and stays there whatever the row stores, and an `admin` resolves against `ADMIN_DEFAULT_PERMS`, the core scheduling set (`canEditShifts`, `canPublishSchedule`, `canEditNotes`, `canEditScheduleIndicators`, the four recurring-shift keys, and `canViewReports`) with nothing in people management or administration. For an admin, a stored JSONB overrides the baseline key by key in both directions, so an unconfigured admin (or one whose row predates a key) can edit and publish the schedule and see Reports, but cannot manage people until a super admin switches that on. The order below matches the interface definition.

| #   | Category  | Permission                      | Delegatable | Description                                                                              |
| --- | --------- | ------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| 1   | Schedule  | `canViewSchedule`               | Always on   | View the schedule grid (always true for all authed users)                                |
| 2   | Schedule  | `canEditShifts`                 | Yes         | Create, edit, delete schedule cells                                                      |
| 3   | Schedule  | `canPublishSchedule`            | Yes         | Publish draft changes                                                                    |
| 4   | Schedule  | `canApplyRecurringSchedule`     | Yes         | Apply recurring shift templates onto the grid                                            |
| 5   | Notes     | `canEditNotes`                  | Yes         | Manage schedule notes                                                                    |
| 6   | Notes     | `canEditScheduleIndicators`     | Yes         | Manage schedule indicators (gates `schedule_notes` RLS — §4.5)                           |
| 7   | Recurring | `canViewRecurringShifts`        | Yes         | View recurring shift templates                                                           |
| 8   | Recurring | `canManageRecurringShifts`      | Yes         | Configure recurring shift templates                                                      |
| 9   | Recurring | `canManageShiftSeries`          | Yes         | Manage repeating shift series                                                            |
| 10  | Staff     | `canViewStaff`                  | Always on   | View staff roster (always true for all authed users)                                     |
| 11  | Staff     | `canViewEmployeeDetails`        | Yes         | View full employee detail records                                                        |
| 12  | Staff     | `canManageEmployees`            | Yes         | Add, edit, bench, terminate employees                                                    |
| 13  | Config    | `canViewFocusAreas`             | Yes         | View focus areas                                                                         |
| 14  | Config    | `canManageFocusAreas`           | Yes         | Manage focus areas / departments                                                         |
| 15  | Config    | `canViewScheduleDefinitions`    | Yes         | View schedule definitions (shift codes, absence types)                                   |
| 16  | Config    | `canManageScheduleDefinitions`  | Yes         | Manage schedule definitions                                                              |
| 17  | Config    | `canViewIndicatorTypes`         | Yes         | View note/indicator type definitions                                                     |
| 18  | Config    | `canManageIndicatorTypes`       | Yes         | Manage note/indicator type definitions                                                   |
| 19  | Config    | `canManageOrgSettings`          | No          | Edit org name, address, phone, timezone (super_admin only)                               |
| 20  | Config    | `canViewOrgLabels`              | Yes         | View custom terminology labels                                                           |
| 21  | Config    | `canManageOrgLabels`            | Yes         | Edit custom terminology labels                                                           |
| 22  | Coverage  | `canViewCoverageRequirements`   | Yes         | View staffing minimum requirements                                                       |
| 23  | Coverage  | `canManageCoverageRequirements` | Yes         | Manage staffing minimum requirements                                                     |
| 24  | Requests  | `canApproveShiftRequests`       | Yes         | Approve or reject shift pickup/swap requests; a holder's own requests settle on the spot |
| 25  | Dashboard | `canViewDashboardAnalytics`     | Yes         | View dashboard analytics                                                                 |
| 26  | Reports   | `canViewReports`                | Yes         | View and export the operations reports (staff hours, activity, shift categories)         |

**View-implications.** `@dubgrid/authz`'s `applyViewImplications` guarantees that every `canManage*` permission implies its matching `canView*` permission, and that `canViewDashboardAnalytics` follows from any of `canEditShifts`, `canManageEmployees`, `canPublishSchedule`, or `canApproveShiftRequests`. The map lives once, as the exported `VIEW_IMPLICATIONS`; the resolver applies it and `PermissionsEditor` reads it, so a view switch shows as "Included" rather than a live control whenever the resolver would grant it anyway. A membership row only needs to store the `canManage*` flag; the resolved permission set always exposes the corresponding `canView*` as `true`. `canViewReports` is never implied. The view-only baseline (`READ_ONLY_PERMS`) is what a Tier 0 `user` receives.

**Keys that also need Schedule edit.** `canApplyRecurringSchedule` and `canManageShiftSeries` both write grid cells, so the API (`/api/schedule/manage`) requires `canEditShifts` alongside them, as the toolbar already did. `canEditScheduleIndicators` is likewise required alongside `canEditNotes` to write a schedule note, since every note carries an indicator type. The editor bundles each pair, so this only bites a JSONB written outside the editor.

**Always-true permissions.** `canViewSchedule` and `canViewStaff` are forced to `true` for every authenticated user regardless of role or stored JSONB — Tier 0 users can always see the schedule grid and the staff roster.

**Super admin-only (never delegatable to an admin).** `canManageUsers` and
`canConfigureAdminPermissions` are computed (`isSuperAdmin || isGridmaster`) and live only
on `PermissionContext`, never in the JSONB. `canManageOrgSettings` does live in the JSONB
interface but `PermissionsEditor` never renders it and `buildPermissionContext` forces it
off for admins, so it too is reserved for `super_admin` (Tier 3). `canConfigureAdminPermissions`
is what gates the `PermissionsEditor` itself.

**No department-template inheritance.** Earlier revisions of this document described a
"department-template union" where management-type departments contributed permissions.
That behavior was reverted: `buildPermissionContext` resolves a member's effective set
from the role baseline and their own `admin_permissions` JSONB only, then applies
view-implications. It does not read `departments.permissions`; the `unionPermissions`
helper that model used has been removed from `@dubgrid/authz`.

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
  archived_at           TIMESTAMPTZ,            -- soft-delete: revokes access (see §10a)
  suspended_at          TIMESTAMPTZ,            -- gridmaster/billing suspension
  feature_overrides     JSONB NOT NULL DEFAULT '{}'::JSONB,  -- per-org flag overrides, checked before PostHog
  -- Billing / trial (migration 001_schema.sql)
  subscription_status   TEXT,                  -- e.g. 'trialing' | 'active' | 'past_due' | 'canceled'
  trial_started_at      TIMESTAMPTZ,           -- set when the trial clock starts (see §10b)
  trial_ends_at         TIMESTAMPTZ,           -- NULL = trial pending (clock not started yet)
  -- Test-sandbox support (migration 001_schema.sql)
  workspace_kind          public.workspace_kind NOT NULL DEFAULT 'real',
                            -- enum workspace_kind = ('real', 'sandbox'); NOT 'production'
  sandbox_owner_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_source_org_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
                            -- partial UNIQUE index: one active sandbox per owner
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Test sandbox.** A `workspace_kind = 'sandbox'` organization is an isolated
> clone of a production org's config, created via `features/test-sandbox/` +
> `app/api/test-sandbox/` (a `force-dynamic` POST route with CSRF, `apiLimiter`,
> and a server-side admin+ gate on the caller's real source-org role; actions
> `enter` / `reset` / `exit`). Sandboxes are owned by the creating user
> (`sandbox_owner_user_id`, one active sandbox each), entered through a 7-day
> HttpOnly cookie, reaped by the daily `sandbox-cleanup` cron after 14 days, and
> are **rejected for mobile login** by `@dubgrid/mobile-api-core`. The `workspace_kind` enum is
> `('real', 'sandbox')` (default `'real'`) — production orgs are `'real'`, not
> `'production'`.

#### organization_memberships (per-org role + admin permissions)

```sql
CREATE TABLE public.organization_memberships (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID NOT NULL,
  org_id            UUID NOT NULL,
  org_role          org_role NOT NULL DEFAULT 'user',  -- enum: 'super_admin' | 'admin' | 'user'
  admin_permissions JSONB,                             -- null for non-admin roles
  department_ids    BIGINT[] NOT NULL DEFAULT '{}',    -- scheduled/management dept membership (BIGINT ids)
  dept_admin_ids    BIGINT[] NOT NULL DEFAULT '{}',    -- subset of department_ids where user is a dept admin
  archived_at       TIMESTAMPTZ,
  archived_by       UUID,
  onboarding_completed_at  TIMESTAMPTZ,
  tooltip_tours_completed  JSONB NOT NULL DEFAULT '{}'::JSONB,
  schedule_last_viewed_at  TIMESTAMPTZ,
  phone             TEXT,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);
```

> **Note on `dept_admin_ids`.** This column flags the departments where a member is a
> "department admin". Despite the legacy comment on `departments.permissions`, this does
> **not** expand a member's `admin_permissions` (see §1.3 — there is no department-template
> union in the resolution path). It is a membership marker, not a permission grant.

#### role_change_log (Audit + Idempotency)

```sql
CREATE TABLE public.role_change_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id     UUID,          -- nullable since 014: SET NULL when the auth user is deleted
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

| Function                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `change_user_role(p_target_user_id, p_new_role, p_changed_by_id, p_idempotency_key, p_org_id DEFAULT NULL, p_expected_updated_at DEFAULT NULL)` | Atomic role change RPC. **Hard-blocks self-role-change** — if `p_target_user_id = p_changed_by_id` it raises `SELF_ACTION_FORBIDDEN: ...`. Org context is the optional `p_org_id` if supplied, else the target's `profiles.org_id`. `p_expected_updated_at` is an optional optimistic-lock check on the membership row. Also blocks demoting the last super_admin of an org, and (for admin callers) any change to or from a privileged tier (see §3.1). |
| `start_trial_for_org(p_org_id)`                                                                                                                 | Starts the org's 14-day trial. Idempotent (guarded by `trial_ends_at IS NULL`), self-gated to a `super_admin` membership in `p_org_id`, and only fires when `subscription_status = 'trialing'` and the org is not archived/suspended. Called from the genuine web/mobile login flow only — NOT from the JWT hook, `switch_org`, or token refresh (see §10b).                                                                                             |
| `switch_org(target_org_id)`                                                                                                                     | Writes `user_sessions.active_org_id` for the **calling session only** and updates `profiles.org_id` as the default for future sign-ins. Rejects archived/suspended orgs for normal members; gridmasters are exempt. No trial side effect.                                                                                                                                                                                                                |
| `get_my_organizations()`                                                                                                                        | Returns `(org_id, org_name, org_slug, org_role, is_active)`. For normal members it **filters out archived** memberships and orgs; gridmasters get all orgs. There is **no** `workspace_kind` column in the return type.                                                                                                                                                                                                                                  |
| `custom_access_token_hook(event)`                                                                                                               | Auth hook — injects top-level JWT claims, honors `jwt_refresh_locks`, and resolves the per-session effective org (see §5).                                                                                                                                                                                                                                                                                                                               |

> **Self-action guard (`@dubgrid/domain`).** Beyond the SQL-level self-action block,
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

| Property   | Detail                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | Super admin demotes an Admin at 10:00 AM. The Admin's JWT does not expire until 10:15 AM. For 15 minutes the user retains Admin permissions in the request proxy. |
| Severity   | HIGH — active over-privilege window                                                                                                                               |
| Mitigation | Forced JWT invalidation via Supabase custom claims + refresh lock table                                                                                           |

#### Implementation: Atomic Role Change + Forced Refresh

The shape below mirrors the real `change_user_role` in
`002_functions_triggers.sql`. Notable points: it takes an optional `p_org_id` (falling
back to the target's `profiles.org_id`) and an optional `p_expected_updated_at`
optimistic-lock check; the self-action block compares `p_target_user_id = p_changed_by_id`
and raises `SELF_ACTION_FORBIDDEN: ...`; the admin tier guard is **bidirectional** (an
admin can neither promote into nor change a target already in a privileged tier); and a
final guard prevents demoting the **last** super_admin of an org. The actual write path
sets a `app.allow_role_change` session flag so the `guard_org_role_change` trigger (which
otherwise blocks all direct `org_role` writes) lets this one through.

```sql
-- Supabase RPC: change_user_role()
-- Advisory lock + idempotency key for race-condition safety
CREATE OR REPLACE FUNCTION change_user_role(
  p_target_user_id      UUID,
  p_new_role            TEXT,
  p_changed_by_id       UUID,
  p_idempotency_key     TEXT,
  p_org_id              UUID        DEFAULT NULL,  -- explicit org context (multi-org)
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL   -- optimistic lock on membership row
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_role          TEXT;
  v_target_org_id     UUID;
  v_caller_platform_role TEXT;
  v_caller_org_role   TEXT;
BEGIN
  IF p_changed_by_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller identity mismatch';
  END IF;

  -- HARD BLOCK: no one may change their own role (mirrors @dubgrid/domain's
  -- assertNotSelf() at the app boundary).
  IF p_target_user_id = p_changed_by_id THEN
    RAISE EXCEPTION 'SELF_ACTION_FORBIDDEN: you cannot change your own role';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('change_role_' || p_target_user_id::TEXT));

  IF EXISTS (SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- Resolve org: prefer explicit p_org_id, else target's default org.
  v_target_org_id := COALESCE(
    p_org_id,
    (SELECT org_id FROM profiles WHERE id = p_target_user_id)
  );
  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found or has no active organization';
  END IF;

  -- Lock the target membership row; optional optimistic-lock check.
  SELECT org_role::TEXT INTO v_old_role
  FROM organization_memberships
  WHERE user_id = p_target_user_id AND org_id = v_target_org_id
  FOR UPDATE;
  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Target user has no membership for this organization';
  END IF;

  -- Caller role IN THE TARGET ORG (not their active org).
  SELECT p.platform_role::TEXT INTO v_caller_platform_role
  FROM profiles p WHERE p.id = auth.uid();
  SELECT cm.org_role::TEXT INTO v_caller_org_role
  FROM organization_memberships cm
  WHERE cm.user_id = auth.uid() AND cm.org_id = v_target_org_id;

  IF v_caller_platform_role <> 'gridmaster'
     AND COALESCE(v_caller_org_role, 'user') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins and gridmasters can change roles';
  END IF;

  -- Admin tier guard (bidirectional): an admin may not touch a privileged target
  -- nor promote anyone into a privileged tier.
  IF COALESCE(v_caller_org_role, 'user') = 'admin'
     AND (v_old_role IN ('gridmaster','admin','super_admin')
          OR p_new_role IN ('gridmaster','admin','super_admin')) THEN
    RAISE EXCEPTION 'admin cannot change the role of an admin, super_admin, or gridmaster';
  END IF;

  -- Never demote the last super_admin of an org.
  IF v_old_role = 'super_admin' AND p_new_role <> 'super_admin'
     AND (SELECT count(*) FROM organization_memberships
          WHERE org_id = v_target_org_id AND org_role = 'super_admin'
            AND user_id <> p_target_user_id AND archived_at IS NULL) = 0 THEN
    RAISE EXCEPTION 'Cannot demote the last super_admin of an organization';
  END IF;

  -- Authorise the one allowed org_role write path, then apply.
  PERFORM set_config('app.allow_role_change', 'true', true);
  UPDATE organization_memberships SET org_role = p_new_role::org_role
   WHERE user_id = p_target_user_id AND org_id = v_target_org_id;
  UPDATE profiles SET version = version + 1, updated_at = NOW()
   WHERE id = p_target_user_id;

  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds', reason = 'role_change';

  RETURN jsonb_build_object('status','success','from_role',v_old_role,'to_role',p_new_role);
END;
$$;
```

### 3.2 Race Condition: Concurrent Role Promotions

| Property   | Detail                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario   | Two super admins in different browser tabs both try to promote the same User to Admin at the exact same moment. Without a lock, the membership row could be written twice with conflicting state.                                                |
| Severity   | MEDIUM — results in audit log confusion and potential privilege escalation                                                                                                                                                                       |
| Mitigation | `SELECT ... FOR UPDATE` row lock inside the `change_user_role()` RPC ensures only one transaction proceeds at a time. The second caller blocks, then reads the already-updated row and returns "already_applied" if the idempotency key matches. |

### 3.3 Race Condition: Double-Submit on Schedule Writes

| Property   | Detail                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | An Admin clicks "Save Shift" and the network is slow. They click again. Two identical POST requests reach the server within milliseconds of each other. Without a guard, the same shift is inserted twice.                                                                                                                                                                                     |
| Severity   | MEDIUM — duplicate data, confusing UI state                                                                                                                                                                                                                                                                                                                                                    |
| Mitigation | The `schedule_cells` table has a `UNIQUE (emp_id, date)` constraint, so a duplicate insert for the same employee/day collides at the DB level. Combined with the `version` optimistic-lock column, a double-submit cannot create two cells. (There is no `idempotency_key` column on `schedule_cells`; the idempotency-key pattern is used by `role_change_log` and the shift-request tables.) |

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
    throw new OptimisticLockError("Schedule cell was modified by another user. Reload and retry.");
  }
  return data;
};
```

> **Note:** In `apps/web` the browser does not hit `schedule_cells` directly —
> it calls a feature `client/api.ts` that `fetch()`es a Route Handler, which
> runs the optimistic-locked write via `apps/web/src/lib/db/schedule`. The
> `.eq('version', expected)` check shown above is the underlying mechanism.

### 3.5 Race Condition: Gridmaster Impersonation Token Collision

| Property   | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | A Gridmaster opens impersonation sessions for two different tenant users in parallel. If both use the same short-lived token namespace, the second token could overwrite the first, causing cross-tenant data leak.                                                                                                                                                                                                                                                                             |
| Severity   | CRITICAL — cross-tenant data exposure                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Mitigation | Each session gets a unique `session_id` (PK). Stored in a dedicated `impersonation_sessions` table with a 30-minute expiry. The `start_impersonation` RPC refuses to open a second session while one is already active for the gridmaster, a `no_self_impersonation` CHECK blocks impersonating yourself, and the impersonation cookie is **re-verified server-side against this table on every request** (the banner's client-side countdown is cosmetic; expiry is checked with server time). |

```sql
CREATE TABLE public.impersonation_sessions (
  session_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gridmaster_id  UUID NOT NULL,
  target_user_id UUID NOT NULL,
  target_org_id  UUID NOT NULL,
  justification  TEXT NOT NULL DEFAULT '',  -- mandatory reason, supplied to start_impersonation
  ip_address     INET,
  user_agent     TEXT,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT CHECK (end_reason IN ('manual', 'expired', 'navigation')),
  CONSTRAINT no_self_impersonation CHECK (gridmaster_id <> target_user_id)
);
```

> There is no `UNIQUE (gridmaster_id, target_user_id)` constraint; concurrency is bounded
> by the RPC's "one active session per gridmaster" check (it raises if the caller already
> has an unexpired, unended session) plus the per-request server-side re-verification.

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
`check_admin_permission('canEditNotes')` (migration `003_rls_policies.sql`).
`canEditScheduleIndicators` (#6 in §1.3) is a **separate** permission enforced at the
application layer (schedule indicators in `SchedulePageClient` / `ShiftEditPanel`), not
in the `schedule_notes` RLS. `check_admin_permission(p)` returns true for gridmaster,
true for super_admin, and for an admin reads the matching flag out of their
`admin_permissions` JSONB.

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

Custom claims eliminate per-request database round trips for role checks. The role and org_id live directly inside the signed JWT, so the request proxy, the Route Handlers, and the React client can make permission decisions in zero additional queries.

### 5.1 Auth Hook: Inject Claims on Sign-In

The real hook (in `002_functions_triggers.sql`) does three notable things beyond
injecting claims, all reflected below:

1. **Refresh lock → 403, not a downgraded token.** While a `jwt_refresh_locks` row is
   active for the user, the hook returns a `403` error object so Supabase refuses to mint
   a token at all. The client signs out / retries after the lock expires (5s). Expired
   locks are deleted on the way in.
2. **Per-session effective org.** When the auth event carries a `session_id`, the hook
   reads `user_sessions.active_org_id` for that session (eagerly inserting a row frozen at
   `profiles.org_id` on first contact) and uses it as the effective org. This is how two
   devices keep independent org contexts (§10c). With no `session_id`, it falls back to
   `profiles.org_id`.
3. **Archived/suspended/deactivated filtering.** The membership/organization joins drop
   archived orgs (`o.archived_at`), suspended orgs (`o.suspended_at`), and deactivated
   users (`p.deactivated_at`); a missing membership yields no org claims at all (org
   context is stripped). It also writes `org_name` alongside the other claims.
4. **Platform-disabled accounts are refused outright** (migration `021`). A profile with
   `deactivated_at` or `terminated_at` set gets the same 403 "account disabled" envelope
   as a removed employee, before the refresh-lock check, so neither a sign-in nor a
   silent refresh mints a token. Stripping claims alone was not enough: the web proxy's
   profile fallback resolved them again and an open session kept working. A termination
   (`terminate_user_account`, gridmaster only) also archives every membership, marks
   linked employee rows removed, cuts sessions, and arms table guards so no
   organization-side path (invitation, role change, employee reactivation) can let the
   person back in until `reinstate_user_account` clears the flag.

```sql
-- Supabase Auth Hook — runs on every token mint (sign-in AND refresh).
-- Claims are injected at the TOP LEVEL of the JWT (not app_metadata).
-- Must be SECURITY DEFINER, owned by postgres, VOLATILE.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
SET search_path = 'public'
AS $$
DECLARE
  claims       JSONB := event -> 'claims';
  uid          UUID  := COALESCE((event ->> 'user_id')::UUID,
                                  (event -> 'claims' ->> 'sub')::UUID);
  lock_until   TIMESTAMPTZ;
  v_session_id UUID  := NULLIF(event -> 'claims' ->> 'session_id', '')::UUID;
  user_profile RECORD;
BEGIN
  -- Drop expired locks, then refuse to mint a token while a lock is active.
  DELETE FROM public.jwt_refresh_locks WHERE user_id = uid AND locked_until <= NOW();
  SELECT locked_until INTO lock_until
    FROM public.jwt_refresh_locks WHERE user_id = uid AND locked_until > NOW();
  IF lock_until IS NOT NULL THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Your session has expired. Please sign in again.'));
  END IF;

  -- Per-session org isolation: freeze a row at profiles.org_id on first contact.
  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.user_sessions (user_id, supabase_session_id, active_org_id)
    SELECT uid, v_session_id, p.org_id FROM public.profiles p WHERE p.id = uid
    ON CONFLICT (supabase_session_id) DO NOTHING;
  END IF;

  -- Resolve effective org (session active_org_id else profiles.org_id), membership,
  -- and org status in one statement. Archived/suspended orgs + deactivated users drop out.
  SELECT eff.org_id, p.platform_role::TEXT AS platform_role,
         cm.org_role::TEXT AS org_role, o.slug AS org_slug, o.name AS org_name
    INTO user_profile
  FROM public.profiles p
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT s.active_org_id FROM public.user_sessions s
        WHERE s.supabase_session_id = v_session_id AND s.user_id = uid),
      p.org_id) AS org_id) eff
  LEFT JOIN public.organization_memberships cm
    ON cm.user_id = p.id AND cm.org_id = eff.org_id AND cm.archived_at IS NULL
  LEFT JOIN public.organizations o
    ON o.id = eff.org_id AND o.archived_at IS NULL AND o.suspended_at IS NULL
  WHERE p.id = uid AND p.deactivated_at IS NULL;

  IF FOUND THEN
    claims := jsonb_set(claims, '{platform_role}',
                        to_jsonb(COALESCE(user_profile.platform_role, 'none')));
    IF user_profile.org_id IS NOT NULL AND user_profile.org_role IS NOT NULL
       AND user_profile.org_slug IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_role}', to_jsonb(user_profile.org_role));
      claims := jsonb_set(claims, '{org_id}',   to_jsonb(user_profile.org_id::TEXT));
      claims := jsonb_set(claims, '{org_slug}', to_jsonb(user_profile.org_slug));
      claims := jsonb_set(claims, '{org_name}', to_jsonb(COALESCE(user_profile.org_name,'')));
    ELSE
      claims := jsonb_set(claims, '{org_role}', '"user"');
      claims := claims - 'org_id' - 'org_slug' - 'org_name';
    END IF;
  ELSE
    claims := jsonb_set(claims, '{platform_role}', '"none"');
    claims := jsonb_set(claims, '{org_role}',      '"user"');
    claims := claims - 'org_id' - 'org_slug' - 'org_name';
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

> **The trial clock is NOT started here.** The hook fires on every token mint, including
> refresh, and sees the session's resolved org (not the subdomain the user logged into),
> so it cannot reliably target the right org. Trials start from the login flow via
> `start_trial_for_org` (see §10b).

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
  "org_name": "Acme Health",
  "session_id": "sess_...",
  "aud": "authenticated"
}
```

> **Claims are at the TOP LEVEL** of the JWT, NOT inside `app_metadata`. This is critical — the request proxy reads `payload.platform_role`, not `payload.app_metadata.role`.

---

## 6. Request Proxy

The Next.js request proxy (`apps/web/src/proxy.ts`) runs on every page request before the route renders. Beyond JWT verification and subdomain-based role routing it also:

- **Org access check (archived + suspended + billing)** — looks up `suspended_at`,
  `archived_at`, `subscription_status`, and `trial_ends_at` for the caller's org,
  using a **Redis (Upstash) cache with a ~30 s TTL** (`cacheThrough` / `TTL.MIDDLEWARE`).
  An archived org revokes access exactly like a suspended one; expired-trial / lapsed-
  billing orgs are bounced to the billing screen. Gridmasters and impersonation sessions
  are exempt from these checks (they must still reach suspended orgs).
- **Impersonation cookie handling** — reads the `dubgrid-impersonation` cookie, re-verifies
  it server-side, and threads the impersonated identity through so downstream guards and
  headers reflect the target user. Navigating to `/gridmaster` auto-ends impersonation.
  The gridmaster's own JWT is unchanged; RLS still sees full access.
- **CSP** — sets a per-request nonce-based Content-Security-Policy on the authenticated
  (force-dynamic) app and a `'unsafe-inline'` policy on static/public pages.
- **`jwtVerify` → `decodeJwt` fallback** — see the security note below; this fallback is load-bearing and must not be removed.
- **Claim backfill from DB** — if the verified/decoded claims are missing `platform_role`
  or `org_role`, the request proxy resolves them from `profiles` + `organization_memberships`
  (Redis-cached) rather than denying the request.

Post-login gating that is **not** in the request proxy — onboarding/setup state — is enforced
client-side by `OnboardingGate` (`apps/web/src/components/onboarding/OnboardingGate.tsx`),
which reads the `@/features/onboarding/client` guards (`fetchOnboardingStatus`,
`isOnboardingComplete`, `getOnboardingPhase`, `freezeOnboardingPhase`). While setup is
incomplete it renders the wizard inline on every route (and a setup-pending screen for
non-setup-capable members). The `markAuthTransition()` flag + `<AuthSplash>` bridge the
auth-settle gap so the gate / route guards do not bounce a just-logged-in user to
`/login`.

### 6.1 Subdomain Routing Logic

| Subdomain                       | Allowed Roles                   | Redirect on Failure    |
| ------------------------------- | ------------------------------- | ---------------------- |
| `gridmaster.dubgrid.com`        | gridmaster only                 | Redirect → `/login`    |
| `{slug}.dubgrid.com/people`     | all authenticated org users     | (no role redirect)     |
| `{slug}.dubgrid.com/settings`   | admin, super_admin, gridmaster  | Redirect → `/schedule` |
| `{slug}.dubgrid.com/gridmaster` | gridmaster only                 | Redirect → `/schedule` |
| `{slug}.dubgrid.com/schedule`   | all authenticated org users     | Redirect → `/login`    |
| `dubgrid.com`                   | unauthenticated (public routes) | N/A                    |

> **`/people` is NOT gated by role in the request proxy.** Any authenticated org member can
> open it (the comment in `proxy.ts` says so explicitly); employee mutations are
> gated deeper by `canManageEmployees` at the API + RLS layer. Only `/settings` is gated
> to `admin` level and above in the request proxy (page-level guards still enforce
> per-section permissions). The staff roster route is `/people`
> (`apps/web/src/app/people/page.tsx`, `people/[id]/page.tsx`) — the legacy `/staff`
> route no longer exists. The staff-configuration settings sub-route is
> `/settings/staff-config`.
>
> Public routes that skip auth entirely (matched before any role check): `/`, `/login`,
> `/privacy`, `/terms`, `/cookie-policy`, `/accept-invite`, `/request-demo`,
> `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/*`, and `/api/*`.

### 6.2 Middleware Implementation

```ts
// apps/web/src/proxy.ts (Vercel Edge Runtime)
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { createServerClient } from "@supabase/ssr";

// JWKS keyset — fetches public keys from Supabase's JWKS endpoint.
// Supports ES256 (asymmetric) JWT signing.
function getJwks() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
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
  return claims.platform_role === "gridmaster" ? "gridmaster" : (claims.org_role ?? "user");
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const pathname = req.nextUrl.pathname;
  const subdomain = parseHost(host).subdomain;

  // Public routes — no auth required (full list in apps/web/src/proxy.ts)
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/cookie-policy" ||
    pathname === "/accept-invite" ||
    pathname === "/request-demo" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Read session via @supabase/ssr (handles multi-chunk cookies)
  const supabase = createServerClient(/* ... cookie config ... */);
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
    // (see apps/web/src/proxy.ts for full implementation)
  }

  const effectiveRole = calculateEffectiveRole(claims);
  const level = ROLE_HIERARCHY[effectiveRole] ?? 0;

  // Route guards
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // NOTE: /people is intentionally NOT gated here — any authed org member can
  // view it; employee mutations are gated by canManageEmployees at API + RLS.
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
> The edge request proxy provides latency-optimized routing and UX-level gating. It is NOT the security layer — that role belongs exclusively to Supabase RLS (Section 4). A sophisticated attacker who bypasses the proxy still hits RLS, which cannot be bypassed from the client.
>
> **The `jwtVerify` → `decodeJwt` fallback MUST stay.** `jwtVerify` against the
> remote JWKS can fail in production (key-fetch hiccups, clock skew, transient
> network errors). When it does, the request proxy falls back to the _unverified_
> `decodeJwt` for **non-gridmaster** users — because RLS, not the proxy, is the
> real security boundary, and locking every admin/user out on a JWKS blip is
> unacceptable. Gridmaster is the one exception: a `platform_role: 'gridmaster'`
> claim coming from an unverified token is rejected outright. Removing this
> fallback has previously broken all admin/user logins — do not "tighten" it.

---

## 7. React Frontend Architecture

The React layer enforces role-aware rendering using a single source of truth: the parsed JWT claims combined with admin permissions fetched from the database. The actual permission math — claim extraction, view-implications, role levels — lives in the platform-neutral **`@dubgrid/authz`** package so that both `apps/web` and `apps/mobile`/`@dubgrid/mobile-api-core` resolve permissions identically. The web app's `apps/web/src/features/permissions/` directory (`core`, `client`, `shared`, `index`, `usePermissions.ts`) is a thin wrapper over `@dubgrid/authz`.

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
    mutationFn: async (params: { targetUserId: string; newRole: OrganizationRole }) => {
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
        old.map((m: any) => (m.id === vars.targetUserId ? { ...m, org_role: vars.newRole } : m)),
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

| Feature                 | Implementation                                                         | Race Condition Guard                                     |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Global Org Monitor      | Dashboard with org health metrics — active users, member count, status | Read-only — no race risk                                 |
| User Management         | Platform-wide user list across all organizations                       | Role changes via idempotent RPC                          |
| User Impersonation      | `start_impersonation` row + verified cookie; mandatory justification   | RPC blocks a 2nd concurrent session + self-impersonation |
| Org Creation            | Create new organizations with slug validation                          | UNIQUE slug constraint                                   |
| Org Archiving           | Set `organizations.archived_at = NOW()` (also revokes member access)   | Concurrent-toggle safe; access revoked everywhere        |
| Global Audit Log Viewer | SELECT from `role_change_log` (all orgs visible to gridmaster)         | Append-only table — no mutation risk                     |
| Admin Permission Config | Configure per-admin permissions via `PermissionsEditor`                | Optimistic locking on membership row                     |

### 8.2 Impersonation Flow

```ts
// 1. Gridmaster initiates impersonation. justification is MANDATORY; the RPC
//    refuses a second concurrent session and blocks self-impersonation.
const { data: session } = await supabase.rpc("start_impersonation", {
  p_target_user_id: "usr_xyz...",
  p_justification: "Investigating scheduling bug in ticket #1234",
  // p_ip_address, p_user_agent, p_target_org_id are optional
});

// 2. RPC creates an impersonation_sessions row (30-min expiry).
// 3. The impersonation context rides in the dubgrid-impersonation cookie,
//    which the request proxy re-verifies server-side against the DB on every request.
// 4. Navigating to /gridmaster auto-ends the session (end_reason = 'navigation').

// End impersonation (or it auto-expires after 30 min).
await supabase.rpc("end_impersonation", { p_session_id: session.session_id });
```

---

## 9. Summary: Race Condition Prevention Matrix

| Race Condition                | Trigger                                           | Layer     | Mechanism                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale JWT after role change   | Role demoted but old JWT still valid              | Auth + DB | Force session invalidation via admin API + jwt_refresh_locks                                                                                                          |
| Concurrent role promotions    | Two super admins promote same user simultaneously | DB        | `SELECT FOR UPDATE` row lock inside SECURITY DEFINER RPC                                                                                                              |
| Duplicate shift submission    | Network retry / double-click                      | DB        | UNIQUE `(emp_id, date)` on `schedule_cells` + `version` optimistic lock                                                                                               |
| Optimistic lock violation     | Two admins edit same schedule cell                | App + DB  | `.eq('version', expected)` Supabase query + UI error handling                                                                                                         |
| Impersonation token collision | Gridmaster opens two sessions in parallel         | DB        | `start_impersonation` rejects a 2nd active session; `no_self_impersonation` CHECK                                                                                     |
| Cross-tenant data read        | RLS bypass attempt via URL manipulation           | DB        | RLS `org_id = caller_org_id()` enforced at SQL execution                                                                                                              |
| Admin self role change        | Admin tries to set own role = super_admin         | App + DB  | `change_user_role` raises `SELF_ACTION_FORBIDDEN` if target = caller; `assertNotSelf` blocks at app boundary; RPC also enforces caller tier + last-super_admin guards |
| Privilege escalation via UI   | Frontend hides buttons; API called directly       | DB        | RLS `WITH CHECK` prevents inserts/updates outside role permission                                                                                                     |
| Audit log tampering           | Admin tries to delete/edit audit record           | DB        | No UPDATE or DELETE RLS policy exists on `role_change_log`                                                                                                            |

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
> **Forced re-auth** (role change / org suspension): every device must pick up the new
> privilege state. DubGrid does **not** call a privileged `admin.signOut` Edge Function for
> this. Instead a `jwt_refresh_locks` row makes the JWT hook return a `403` on the next
> token mint (forcing re-auth after a role change), and for a suspended/archived org the
> hook strips org claims while the request proxy denies access — so no stale token can keep
> elevated access.

### 10.2 user_sessions Table (Track Devices Individually)

```sql
CREATE TABLE public.user_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,
  org_id              UUID,            -- audit snapshot of last-seen JWT org (not authoritative)
  active_org_id       UUID,            -- AUTHORITATIVE per-session org read by the JWT hook
  supabase_session_id UUID UNIQUE,     -- correlates web/mobile sessions to the auth session_id
  platform            TEXT,            -- 'web' | 'ios' | 'android'
  app_version         TEXT,
  device_label        TEXT,
  ip_address          INET,
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refresh_token_hash  TEXT UNIQUE      -- nullable: switch_org may create a row before track-session runs
);
```

> `active_org_id` is the linchpin of per-session org isolation (§10c): the JWT hook reads
> it to resolve which org a given device's token is scoped to. `refresh_token_hash` is
> **nullable** (not `NOT NULL`), because `switch_org` can upsert a row before the client
> first reports its device.

### 10.3 Voluntary Logout: Local Scope, Swift, No Splash

The real hook (`apps/web/src/hooks/useLogout.ts`) signs out `scope: "local"`, sweeps all
`dg_*` session/local keys (view-as-user, onboarding flags, auth-transition) while
preserving device prefs, and **always** lands on `/login` from a `finally` block so a
thrown `signOut` can never strand the user. Logout is deliberately swift with no
`<AuthSplash>` (unlike login).

```ts
// apps/web/src/hooks/useLogout.ts (shape)
async function signOutLocal(redirectTo = "/login"): Promise<void> {
  try {
    await signOutFromBrowser("local"); // scope: "local" — this browser only
    clearAllDgState(); // sweep dg_* keys, keep device prefs
    queryClient.clear();
  } finally {
    window.location.replace(redirectTo); // always reach /login, even on error
  }
}
```

### 10.4 Logout Decision Matrix

| Trigger                             | Scope  | Mechanism                                                                      | Other Devices Affected?                       |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------ | --------------------------------------------- |
| User clicks "Sign Out"              | local  | `supabase.auth.signOut({ scope: 'local' })`                                    | No — all other sessions remain                |
| User clicks "Sign out all devices"  | others | `supabase.auth.signOut({ scope: 'others' })`                                   | Yes — all other sessions revoked              |
| Super admin demotes/changes role    | forced | `jwt_refresh_locks` row → JWT hook returns 403 on next mint; user must re-auth | Yes — every device re-auths with the new role |
| Org suspended/archived              | forced | JWT hook strips org claims + middleware denies access on next request          | Yes — all sessions lose access                |
| Session revoked via Active Sessions | single | revoke the target device's session (Profile → sessions)                        | Only the targeted device                      |
| JWT expires naturally               | n/a    | Token not renewed — next request hits middleware                               | No — each JWT independent                     |

### 10a. Organization Soft-Delete (`archived_at` revokes access)

A super_admin can self-delete their organization from Settings → Danger Zone. The delete
is a **soft-delete**: it sets `organizations.archived_at`, and that timestamp is treated as
an access-revoking signal everywhere:

- **Middleware** denies access to an archived org (same path as a suspended org).
- **JWT hook** strips org claims when `o.archived_at IS NOT NULL` on the next token mint.
- **`get_my_organizations`** filters archived orgs out of a normal member's org list.
- **`switch_org`** refuses to switch a normal member into an archived org.

A gridmaster can restore an org by clearing `archived_at`. (The Activity Log lives under
Settings; the legacy `/staff` route was removed.)

### 10b. Trial Activation (first super_admin LOGIN only)

An org's 14-day trial clock starts on the **first genuine super_admin login**, never on
token refresh, automatic org reconciliation, or `switch_org`. `trial_ends_at IS NULL`
means "trial pending" (clock not started); `packages/domain/src/billing.ts` maps the
`trialing` + NULL-`trial_ends_at` combination to billing state `trial_pending`, which
gates non-super_admins out until a super_admin activates it.

Activation goes through the `start_trial_for_org(p_org_id)` RPC, called from the real
web/mobile login flow. It is idempotent (`trial_ends_at IS NULL` guard), self-gated to a
`super_admin` membership in the target org, and only fires when `subscription_status =
'trialing'` and the org is not archived/suspended. It sets both `trial_started_at` and
`trial_ends_at = now() + 14 days`. Keep the 14-day interval in sync with
`DEFAULT_TRIAL_DAYS` in `packages/domain/src/billing.ts`.

### 10c. Per-Session Org Isolation (`active_org_id`)

Each device's JWT is scoped to its own org. `user_sessions.active_org_id` (keyed by the
auth `session_id`) is authoritative: the JWT hook resolves the effective org from the
calling session's `active_org_id`, falling back to `profiles.org_id` when none is set.
`switch_org` writes `active_org_id` for the **calling session only** (and updates
`profiles.org_id` as the default for future fresh sign-ins) so a switch on one device does
not leak into another device's session. Because `caller_org_id()` is JWT-baked per
session, a sibling tab's `switch_org` cannot change what another session can read, and RLS
enforces the final boundary.

---

## 11. Invite-Only Registration

Self-signup is completely disabled. Every user account must be created through an invitation issued by a super admin or gridmaster. A rogue actor who reaches the Supabase sign-up endpoint without a valid invite token is rejected before a profile row is ever created.

### 11.1 Disable Public Sign-Up

In Supabase Dashboard → Authentication → Providers → Email: set "Enable email signup" to OFF. The only account-creation path is `/api/invitations/register`, which runs with the service role and creates the invitee pre-confirmed; the browser never calls `supabase.auth.signUp()`.

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
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_name     TEXT,                          -- app-only invites: invitee details
  last_name      TEXT,                          --   stored before account creation
  phone          TEXT,
  department_ids BIGINT[] NOT NULL DEFAULT '{}',
  dept_admin_ids BIGINT[] NOT NULL DEFAULT '{}' -- depts where invitee becomes a dept admin
);

-- Partial UNIQUE: only one PENDING invite per email per org; historical
-- accepted/revoked rows for the same email are allowed.
CREATE UNIQUE INDEX one_pending_invite_per_email
  ON public.invitations (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
```

> Acceptance goes through the hardened `accept_invitation(p_token)` RPC: a `FOR UPDATE`
> row lock plus explicit checks for already-accepted, revoked, expired, **and recipient
> email match** (`lower(user_email) <> lower(invite.email)` is rejected).

### 11.3 Invitation Flow

| Step | Actor       | Action                                                                   |
| ---- | ----------- | ------------------------------------------------------------------------ |
| 1    | Super Admin | Fills "Invite User" form: selects employee, enters email + role          |
| 2    | Server      | Inserts `invitations` row with `employee_id` FK, returns token           |
| 3    | API Route   | `/api/send-invite-email` sends invitation via Resend                     |
| 4    | Invitee     | Clicks link → arrives at `/accept-invite?token=<uuid>`                   |
| 5    | Accept Flow | Validates token, creates Supabase auth user, sets `employees.user_id`    |
| 6    | Auth Hook   | JWT issued with `platform_role`, `org_role`, `org_id`, `org_slug` claims |
| 7    | Invitee     | Redirected to their org dashboard, fully authenticated                   |

### 11.4 Invitation Edge Cases

| Scenario                            | Behavior                                      | Mechanism                                      |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Duplicate invite to same email      | Old expired invite cleaned up, new one issued | DELETE expired + INSERT with UNIQUE constraint |
| User clicks expired link            | Returns error — invite expired                | `expires_at` check in validation               |
| User clicks already-used link       | Returns error — already accepted              | `accepted_at IS NULL` check                    |
| Two users race to accept same token | First UPDATE wins; second gets no row back    | Atomic UPDATE ... WHERE accepted_at IS NULL    |
| Admin revokes before user accepts   | Returns error — revoked                       | `revoked_at IS NULL` check                     |
| Employee already has linked account | Invite blocked — user_id already set          | Pre-check in invite creation                   |

---

## 12. Implemented Security Features (Since v1.0)

The following features have been implemented since the initial RBAC design:

### 12.1 Password Reset Flow

Self-service password reset is fully implemented with security best practices:

1. **Forgot Password** (`/forgot-password`) — the page posts to `POST /api/auth/recovery-request`, which rate-limits by source IP, target email hash, and a global surge limit, writes a security audit event, and then calls Supabase `resetPasswordForEmail()`. Always shows "Check your email" regardless of whether the email exists. Mobile uses the same handler and completes the reset in-app with the emailed 6-digit code.
2. **Reset Password** (`/reset-password`) — Token-validated form with:
   - Password strength meter (4 levels: too short → weak → fair → strong)
   - Minimum 10-character requirement
   - Confirmation field with match validation
   - 5-second timeout fallback for invalid/expired tokens
   - Automatic local sign-out after successful reset
3. **Auth components** in `apps/web/src/components/auth/`: `PasswordInput` (show/hide toggle), `PasswordStrength` (visual meter), `AuthCard` (consistent layout)

### 12.2 Email Verification

Invited accounts are created **pre-confirmed** by `/api/invitations/register` (service role, `email_confirm: true`), so the invitation link itself proves the address and no second email is sent. `/verify-email` remains only for accounts that are genuinely unconfirmed:

- **Verify Email** (`/verify-email`) — Displays verification status with optional `?email=` param
- Resend button with 60-second cooldown to prevent abuse
- Listens for `SIGNED_IN` auth event to auto-redirect when verified
- Email enumeration protection (same UI regardless of email validity)

### 12.3 Rate Limiting

All public-facing API routes are rate-limited via Upstash Redis (`apps/web/src/lib/rate-limit.ts`):

| Limiter                 | Window    | Key                 | Applied To                                                                                   |
| ----------------------- | --------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `apiLimiter`            | 10 / 10s  | user id (or IP)     | general protected mutations (org settings/access/role-change, etc.)                          |
| `inviteLimiter`         | 100 / 1h  | user id (per-actor) | `/api/send-invite-email`                                                                     |
| `emailTargetLimiter`    | 5 / 1h    | `hashEmail(target)` | layered onto invite + gridmaster password-reset so one actor can't email-bomb a single inbox |
| `demoLimiter`           | 3 / 1h    | IP                  | `/api/request-demo`                                                                          |
| `passwordResetLimiter`  | 5 / 15m   | `hashEmail(email)`  | recovery requests (web + mobile) and gridmaster password reset, per target address           |
| `loginLimiter`          | 15 / 15m  | `hashEmail(email)`  | login (app-level brute-force protection; `LOGIN_EMAIL_LIMIT_PER_15_MIN`)                     |
| `loginIpLimiter`        | 120 / 1m  | source IP           | login burst ceiling for shared-office users (`LOGIN_IP_LIMIT_PER_MINUTE`)                    |
| `loginSurgeLimiter`     | 500 / 10s | global              | login load shedding during sign-in spikes (`LOGIN_GLOBAL_LIMIT_PER_10_SECONDS`)              |
| `recoverySurgeLimiter`  | 100 / 10s | global              | recovery-request abuse and provider protection                                               |
| `scheduleReviewLimiter` | 60 / 10s  | user id             | publish/discard review dialogs (higher headroom)                                             |

`checkRateLimit` **fails closed** in production (returns a 503-signalling `misconfigured`
flag) when Upstash Redis is unconfigured or unreachable; in development it allows through.

### 12.4 Branded Email Templates

Every email is a react-email component under `apps/web/src/emails/` (transactional emails plus, under `emails/auth/`, the ten Supabase auth templates including the MFA enrolled/unenrolled and password/email-changed security notices). `npm --workspace @dubgrid/web run email:build` compiles the auth set to `supabase/templates/*.html` and `npm run auth:templates:push` syncs them to the linked remote project. `apps/web/src/lib/email.ts` keeps only the header-safety helpers (`sanitizeHeaderValue`, `emailBaseUrl`).

### 12.5 CSRF Protection

Mutating Route Handlers call `validateCsrfOrigin(req)` (`apps/web/src/lib/csrf.ts`), which
checks the request `Origin` header's root domain against the request host's root domain
(so any `*.dubgrid.com` subdomain is accepted, but a foreign origin is rejected) and fails
closed in production when the header is absent. The app uses no Server Actions; every
mutating route is inventoried by `apps/web/src/__tests__/auth-integrity-entry-points.test.ts`,
which fails if a browser-facing mutation lacks the check or a non-browser exception
(mobile bearer, webhook, cron) is unclassified.

### 12.6 MFA and Sensitive-Action Reauthentication

Multi-factor authentication is fully built on both platforms: web (`MFASetup.tsx`,
QR + manual secret) and mobile (`ProfileSecurityScreen`), both driving one shared
lifecycle handler (`POST /api/account/mfa-lifecycle`, `POST /api/mobile/v1/profile/mfa-lifecycle`)
with `enroll`, `remove`, `reauthenticate`, and `cleanup` actions over user-scoped
Supabase factor calls (never Auth Admin factor mutations). `/api/account/mfa-status`
persists the enrolled flag after a verified enrollment.

Enforcement is **account-based**: once a verified TOTP factor exists, sign-in requires
the challenge on web and mobile, the mobile API rejects AAL1 tokens for that account,
and sensitive actions require fresh AAL2 proof. Accounts without a factor present a
fresh password proof for the same actions. The five-minute window is derived from the
signed JWT `amr` timestamps in `packages/authz/src/assurance.ts` and enforced by
`requireSensitiveActionAuth` (web) / `requireMobileSensitiveActionAuth` (mobile) on
factor and credential changes, other-session revocation, data export, account and
organization deletion, and approving another person's account deletion; the web
`StepUpDialog` and the mobile step-up flow satisfy it. `docs/mfa-provider-boundary.md`
records the hosted-provider qualification and the accepted limit that direct calls to
Supabase's own factor-removal endpoint follow the provider's AAL2 rule, not DubGrid's
five-minute window.

What remains advisory: gridmaster/super_admin/admin accounts without a verified factor
get a dismissible in-app nag (`MfaNagBanner`), not a hard block (see §13.1), a
deliberate choice to avoid locking out existing admins.

---

## 13. Recommended Features Not Yet Implemented

The following features are recommended before a production launch.

### 13.1 Priority 1 — Security (Implement Before Launch)

#### Multi-Factor Authentication (MFA): Done, Enforcement Account-Based

| Property         | Detail                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status           | Enrollment, challenge, unenrollment, and the five-minute sensitive-action step-up are built on web and mobile (see §12.6). An enrolled account cannot sign in or act sensitively without its factor.                        |
| Gap              | Role-based enforcement is a dismissible nag for gridmaster/super_admin/admin accounts without a verified factor, not a hard block; a compromised password alone still grants such an account full access until they enroll. |
| Recommendation   | If a hard requirement is wanted later, gate `/settings` and `/gridmaster` in `proxy.ts` behind AAL2 for privileged roles — deliberately not done now to avoid locking out existing accounts.                                |
| Supabase support | Built-in via `supabase.auth.mfa.enroll()` / `challengeAndVerify()` / `unenroll()`; provider-boundary limits in `docs/mfa-provider-boundary.md`                                                                              |

#### Failed Login Attempt Tracking & Account Lockout: Rate-Limit Based

| Property       | Detail                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status         | Login is bounded per email (15/15m), per source IP (120/min), and globally (500/10s), failing closed in production; failures return a generic 401 and throttles are security-audited (§12.3). |
| Gap            | No persistent per-account lockout with an email-based unlock; the sliding windows expire on their own.                                                                                        |
| Recommendation | Only if abuse evidence warrants it: add failed-attempt tracking with a lockout and email unlock on top of the existing limits.                                                                |

#### IP Allowlisting for Gridmaster

| Property       | Detail                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| Gap            | Any authenticated Gridmaster can access from any IP, including a stolen laptop.         |
| Recommendation | Add a `gridmaster_allowed_ips` table. Middleware checks `req.ip` against the allowlist. |

### 13.2 Priority 2 — User Lifecycle

Soft delete for both users (`profiles.deactivated_at`) and organizations
(`organizations.archived_at`) already shipped — see §10a for orgs and the
`deactivated_at`-aware queries referenced throughout §6/§9. No open gap
here.

### 13.3 Priority 3 — Operational

#### Refresh Token Rotation & Reuse Detection: Configured Locally, Plus App-Side Revocation

| Property       | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status         | `supabase/config.toml` enables refresh token rotation with a 10-second reuse interval locally; the hosted project's setting lives in the Supabase dashboard. Independently, Route Handlers consult Redis revocation markers on every request, `POST /api/auth/sign-out` with `global` scope revokes every session, and a forced logout or gridmaster demotion wipes the tracked session rows (migration `016` cuts direct queries off with them). |
| Recommendation | Confirm rotation is enabled on the hosted project during the production migration gate.                                                                                                                                                                                                                                                                                                                                                           |

#### Role Change Notifications: Done

| Property | Detail                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | The access routes dispatch a `role_changed` notification (`features/notifications/server/events.ts`) to the affected member; permission-only changes list the flags that flipped in the Activity Log. |

#### GDPR / Data Export Compliance — Implemented

| Property | Detail                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | **Done.** Users can request a full export of their personal data; companion account-deletion / erasure routes also exist (`/api/auth/data-export`, `/api/auth/delete-account`, `/api/auth/gdpr-erase`, plus `/api/account/change-requests`). |
| Notes    | The export assembles all of a user's rows into a JSON archive. Listed here for completeness — no further work required for the export path itself.                                                                                           |

### 13.4 Feature Priority Summary

| Priority | Feature                                  | Status                            | Risk if Skipped                                                                                                                                                    |
| -------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | MFA for Gridmaster & Super Admin         | **Done, account-based**           | Enrollment, challenge, and five-minute step-up done (web + mobile); role enforcement is a dismissible nag → takeover still possible for an admin who never enrolls |
| P1       | Failed login tracking & lockout          | **Done as rate limits**           | Per-email, per-IP, and global login limits fail closed; no persistent per-account lockout                                                                          |
| P1       | IP allowlisting for Gridmaster           | Not done                          | Stolen credentials = full platform access                                                                                                                          |
| ~~P1~~   | ~~Password reset flow~~                  | ✅ Done                           | ~~Users locked out permanently if password lost~~                                                                                                                  |
| ~~P2~~   | ~~Email verification~~                   | ✅ Done                           | ~~Unverified accounts receive org roles~~                                                                                                                          |
| ~~P2~~   | ~~Rate limiting on API routes~~          | ✅ Done                           | ~~Abuse of public endpoints~~                                                                                                                                      |
| ~~P2~~   | ~~Soft delete (users & orgs)~~           | ✅ Done                           | ~~Accidental permanent data loss~~ — see §10a and `profiles.deactivated_at`                                                                                        |
| P3       | Refresh token rotation + reuse detection | Local config + revocation markers | Confirm the hosted setting at the migration gate                                                                                                                   |
| ~~P3~~   | ~~Role change notifications~~            | ✅ Done                           | ~~Silent UX — confused users after demotion~~                                                                                                                      |
| ~~P3~~   | ~~GDPR data export~~                     | ✅ Done                           | ~~Legal compliance gap in EU/UK markets~~                                                                                                                          |

---

_DubGrid — Confidential_
