# DUBGRID

## Role-Based Access Control — Full System Design

**Race-Condition-Free Architecture**
React · Supabase · Vercel

Version 2.0 | Confidential

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

Admins (Tier 2) receive a configurable set of permissions stored as JSONB in `organization_memberships.admin_permissions`. Super admins configure these per-user. All default to `false` except canViewSchedule and canViewStaff (always true for all authenticated users).

| Category   | Permission                     | Delegatable | Description                                           |
| ---------- | ------------------------------ | ----------- | ----------------------------------------------------- |
| Schedule   | `canViewSchedule`              | Always on   | View the schedule grid (always true)                  |
| Schedule   | `canEditShifts`                | Yes         | Create, edit, delete shift entries                    |
| Schedule   | `canPublishSchedule`           | Yes         | Publish draft changes                                 |
| Schedule   | `canApplyRecurringSchedule`    | Yes         | Apply recurring shift templates                       |
| Notes      | `canEditNotes`                 | Yes         | Manage schedule notes/indicators                      |
| Recurring  | `canManageRecurringShifts`     | Yes         | Configure recurring shift templates                   |
| Recurring  | `canManageShiftSeries`         | Yes         | Manage repeating shift series                         |
| Staff      | `canViewStaff`                 | Always on   | View staff roster (always true)                       |
| Staff      | `canManageEmployees`           | Yes         | Add, edit, bench, terminate employees                 |
| Config     | `canManageFocusAreas`          | Yes         | Manage focus areas / departments                      |
| Config     | `canManageShiftCodes`          | Yes         | Manage shift code definitions                         |
| Config     | `canManageIndicatorTypes`      | Yes         | Manage note/indicator type definitions                |
| Config     | `canManageOrgSettings`         | No          | Edit org name, address, phone, timezone (super_admin only) |
| Config     | `canManageOrgLabels`           | Yes         | Edit custom terminology labels                        |
| Coverage   | `canManageCoverageRequirements`| Yes         | Manage staffing minimum requirements                  |
| Requests   | `canApproveShiftRequests`      | Yes         | Approve or reject shift pickup/swap requests          |

**Super admin-only (never delegatable):** `canManageUsers`, `canConfigureAdminPermissions`, `canManageOrgSettings`

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
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### organization_memberships (per-org role + admin permissions)

```sql
CREATE TABLE public.organization_memberships (
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_role          org_role NOT NULL DEFAULT 'user',  -- enum: 'super_admin' | 'admin' | 'user'
  admin_permissions JSONB,                             -- null for non-admin roles
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);
```

#### role_change_log (Audit + Idempotency)

```sql
CREATE TABLE public.role_change_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  UUID NOT NULL REFERENCES auth.users(id),
  changed_by_id   UUID NOT NULL REFERENCES auth.users(id),
  org_id          UUID REFERENCES organizations(id),
  from_role       TEXT NOT NULL,
  to_role         TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON role_change_log (idempotency_key);
CREATE INDEX ON role_change_log (target_user_id, created_at DESC);
```

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
-- (enforced by PRIMARY KEY on organization_memberships)

-- Enforce role hierarchy via RLS + SECURITY DEFINER RPCs
-- (see Sections 3 and 4)
```

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
-- Runs inside a single serializable transaction
CREATE OR REPLACE FUNCTION change_user_role(
  p_target_user_id  UUID,
  p_new_role        org_role,
  p_changed_by_id   UUID,
  p_org_id          UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_role   org_role;
  v_caller_role org_role;
BEGIN
  -- 1. Idempotency check (prevents duplicate network retries)
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 2. Lock the target row (prevents concurrent promotions)
  SELECT org_role INTO v_old_role
    FROM organization_memberships
   WHERE user_id = p_target_user_id AND org_id = p_org_id
     FOR UPDATE;

  -- 3. Verify caller has permission to make this change
  SELECT org_role INTO v_caller_role
    FROM organization_memberships
   WHERE user_id = p_changed_by_id AND org_id = p_org_id;

  IF v_caller_role = 'admin' THEN
    RAISE EXCEPTION 'admin cannot change roles — super_admin only';
  END IF;

  -- 4. Apply the role change
  UPDATE organization_memberships
     SET org_role = p_new_role,
         admin_permissions = CASE
           WHEN p_new_role = 'admin' THEN COALESCE(admin_permissions, '{}')
           ELSE NULL  -- clear permissions when demoting to user
         END
   WHERE user_id = p_target_user_id AND org_id = p_org_id;

  -- 5. Write audit log
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, org_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, p_org_id, v_old_role::TEXT, p_new_role::TEXT, p_idempotency_key);

  -- 6. Write JWT refresh lock (blocks new token issuance for 5s)
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds';

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
-- shifts table with optimistic lock
CREATE TABLE public.shifts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  employee_id      INTEGER NOT NULL REFERENCES employees(id),
  date             DATE NOT NULL,
  shift_code_ids   INTEGER[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  version          BIGINT NOT NULL DEFAULT 0,
  idempotency_key  TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_duplicate_submission UNIQUE (org_id, idempotency_key)
);
```

### 3.4 Race Condition: Optimistic Lock Violation on Update

When an Admin edits a shift that another Admin just modified, the second write must be rejected — not silently overwrite the first.

```ts
// Frontend React mutation (using React Query)
const updateShift = async ({ shiftId, changes, expectedVersion }) => {
  const { data, error } = await supabase
    .from("shifts")
    .update({ ...changes, version: expectedVersion + 1 })
    .eq("id", shiftId)
    .eq("version", expectedVersion) // <-- optimistic lock check
    .select()
    .single();

  if (!data) {
    throw new OptimisticLockError(
      "Shift was modified by another user. Reload and retry.",
    );
  }
  return data;
};
```

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
ALTER TABLE shifts                    ENABLE ROW LEVEL SECURITY;
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

### 4.2 Shifts Table Policies

```sql
-- SELECT: users see only their org (or gridmaster sees all)
CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (
    is_gridmaster()
    OR org_id = caller_org_id()
  );

-- INSERT: admin with canEditShifts or super_admin in same org
CREATE POLICY "shifts_insert" ON shifts FOR INSERT
  WITH CHECK (
    org_id = caller_org_id()
    AND caller_org_role() IN ('super_admin', 'admin')
  );

-- UPDATE: admin with canEditShifts or super_admin; row must belong to same org
CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING  (org_id = caller_org_id())
  WITH CHECK (
    org_id = caller_org_id()
    AND caller_org_role() IN ('super_admin', 'admin')
  );

-- DELETE: super_admin or gridmaster only
CREATE POLICY "shifts_delete" ON shifts FOR DELETE
  USING (
    is_gridmaster()
    OR (org_id = caller_org_id() AND caller_org_role() = 'super_admin')
  );
```

> **Note:** Fine-grained admin permission checks (e.g., `canEditShifts`) are enforced at the application layer in addition to RLS. RLS provides the org-isolation guarantee; the application layer enforces which specific actions an admin can perform within their org.

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

-- Super admins can read their own org's log; gridmaster reads all
CREATE POLICY "audit_select" ON role_change_log FOR SELECT
  USING (
    is_gridmaster()
    OR org_id = caller_org_id()
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

The middleware runs at the CDN edge — geographically closest to the user — before any backend compute is invoked. It performs JWT verification and subdomain-based role routing.

### 6.1 Subdomain Routing Logic

| Subdomain                     | Allowed Roles                     | Redirect on Failure        |
| ----------------------------- | --------------------------------- | -------------------------- |
| `gridmaster.dubgrid.com`      | gridmaster only                   | Redirect → `/login`        |
| `{slug}.dubgrid.com/staff`    | admin+, super_admin, gridmaster   | Redirect → `/schedule`     |
| `{slug}.dubgrid.com/settings` | admin+, super_admin, gridmaster   | Redirect → `/schedule`     |
| `{slug}.dubgrid.com/schedule` | all authenticated org users       | Redirect → `/login`        |
| `dubgrid.com`                 | unauthenticated (public routes)   | N/A                        |

### 6.2 Middleware Implementation

```ts
// middleware.ts (Vercel Edge Runtime)
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt } from "jose";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET
);

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
    pathname === "/gridmaster/login" ||
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

  // Verify JWT — read top-level claims
  let claims: JWTClaims;
  try {
    const { payload } = await jwtVerify(session.access_token, SUPABASE_JWT_SECRET);
    claims = payload as JWTClaims;
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
    // (see middleware.ts for full implementation)
  }

  const effectiveRole = calculateEffectiveRole(claims);
  const level = ROLE_HIERARCHY[effectiveRole] ?? 0;

  // Route guards
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/staff") && level < 2) {
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

---

## 7. React Frontend Architecture

The React layer enforces role-aware rendering using a single source of truth: the parsed JWT claims combined with admin permissions fetched from the database.

### 7.1 Auth Context & Permission Hook

```ts
// hooks/usePermissions.ts
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
// hooks/useRoleChange.ts
import { v4 as uuidv4 } from "uuid";
import { useMutation } from "@tanstack/react-query";

export function useRoleChange() {
  return useMutation({
    mutationFn: async (params: {
      targetUserId: string;
      newRole: OrganizationRole;
      orgId: string;
    }) => {
      const idempotencyKey = uuidv4();

      const { data, error } = await supabase.rpc("change_user_role", {
        p_target_user_id: params.targetUserId,
        p_new_role: params.newRole,
        p_org_id: params.orgId,
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
| Org Deactivation        | Set `organizations.is_active = false` in transaction                         | `SELECT FOR UPDATE` prevents concurrent toggles |
| Global Audit Log Viewer | SELECT from `role_change_log` with no org_id filter                          | Append-only table — no mutation risk            |
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
| Duplicate shift submission    | Network retry / double-click                        | DB        | UNIQUE `(org_id, idempotency_key)` constraint on shifts table      |
| Optimistic lock violation     | Two admins edit same shift                          | App + DB  | `.eq('version', expected)` Supabase query + UI error handling      |
| Impersonation token collision | Gridmaster opens two sessions in parallel           | DB        | UNIQUE `(gridmaster_id, target_user_id)` on impersonation_sessions |
| Cross-tenant data read        | RLS bypass attempt via URL manipulation             | DB        | RLS `org_id = caller_org_id()` enforced at SQL execution           |
| Admin self-promotion          | Admin tries to set own role = super_admin           | DB        | SECURITY DEFINER RPC checks caller role before applying change     |
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
// hooks/useLogout.ts
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
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by       UUID REFERENCES auth.users(id),
  email            TEXT NOT NULL,
  employee_id      INTEGER REFERENCES employees(id),     -- links to existing employee record
  role_to_assign   org_role NOT NULL DEFAULT 'user',
  token            UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  accepted_at      TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_pending_invite UNIQUE (org_id, email)
);

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

## 12. Recommended Features Not Yet Implemented

The following features are absent from the current design but are recommended before a production launch.

### 12.1 Priority 1 — Security (Implement Before Launch)

#### Multi-Factor Authentication (MFA)

| Property         | Detail                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Gap              | Any user whose password is compromised gives an attacker full access. Gridmaster and super admin accounts are high-value targets. |
| Recommendation   | Enforce TOTP (Supabase MFA) for gridmaster and super_admin. Prompt admin/user roles to enroll optionally.             |
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

### 12.2 Priority 2 — User Lifecycle

#### Soft Delete for Users and Orgs

| Property       | Detail                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Gap            | Hard deletes cascade through all tables with no recovery path.                                                      |
| Recommendation | Add `deleted_at TIMESTAMPTZ` to profiles and organizations. RLS adds `AND deleted_at IS NULL` to all queries.       |

#### Email Verification Gate

| Property       | Detail                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Gap            | A user could be assigned a role before verifying their email address.                                              |
| Recommendation | In the auth hook, check `email_confirmed_at`. If null, inject minimal claims.                                      |

### 12.3 Priority 3 — Operational

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

#### GDPR / Data Export Compliance

| Property       | Detail                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Gap            | No mechanism for a user to request all their personal data.                                                                |
| Recommendation | Add a data export RPC that assembles all user rows into a JSON archive.                                                    |

### 12.4 Feature Priority Summary

| Priority | Feature                                  | Risk if Skipped                                      |
| -------- | ---------------------------------------- | ---------------------------------------------------- |
| P1       | MFA for Gridmaster & Super Admin         | Account takeover via password compromise             |
| P1       | Failed login tracking & lockout          | Brute-force attacks succeed silently                 |
| P1       | IP allowlisting for Gridmaster           | Stolen credentials = full platform access            |
| P2       | Soft delete (users & orgs)               | Accidental permanent data loss                       |
| P2       | Email verification gate                  | Unverified accounts receive org roles                |
| P3       | Refresh token rotation + reuse detection | Stolen tokens usable indefinitely                    |
| P3       | Role change notifications                | Silent UX — confused users after demotion            |
| P3       | GDPR data export                         | Legal compliance gap in EU/UK markets                |

---

_DubGrid — Confidential_
