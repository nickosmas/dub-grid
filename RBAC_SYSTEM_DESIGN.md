# DUBGRID

## Role-Based Access Control — Full System Design

**Race-Condition-Free Architecture**
React · Supabase · Vercel

Version 1.0 | Confidential

---

## 1. System Overview & Architecture

Dubgrid is a multi-tenant SaaS scheduling platform governed by a five-tier RBAC model. This document defines the complete technical implementation — from database schema to Vercel Edge Middleware — with explicit strategies to eliminate every class of race condition that can arise during authentication, role promotion, and concurrent data writes.

### 1.1 The Five-Tier Hierarchy

| Tier   | Role       | Scope  | Key Permissions                                                                                      |
| ------ | ---------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Tier 4 | Gridmaster | Global | God Mode: manage all orgs, reset any password, view global revenue & analytics, impersonate any user |
| Tier 3 | Admin      | Tenant | Owner: manage org billing, branding, promote/demote own staff up to Tier 2                           |
| Tier 2 | Scheduler  | Tenant | Editor: create/edit schedules, assign shifts, manage standard user profiles                          |
| Tier 1 | Supervisor | Tenant | Commenter: read-only schedule access + add feedback notes to cells                                   |
| Tier 0 | User       | Tenant | Reader: strictly read-only access to own org schedule                                                |

### 1.2 The Three Layers of Defense

Security is enforced at three independent layers. Compromising one layer does not grant access — all three must be satisfied simultaneously.

| Layer        | Technology             | Responsibility                                                  | Race Condition Risk                                              |
| ------------ | ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| A — Entryway | Vercel Edge Middleware | Subdomain routing, JWT role verification, request blocking      | JWT expiry window — mitigated by short TTL + refresh lock        |
| B — Identity | Supabase Custom Claims | Role & org_id baked into JWT, instant permission decisions      | Stale JWT after role change — mitigated by forced refresh flow   |
| C — Vault    | Supabase RLS Policies  | Row-level org isolation, Gridmaster bypass policy, write guards | Concurrent writes — mitigated by atomic SQL + optimistic locking |

---

## 2. Database Schema (Race-Condition-Safe)

Every table is designed with constraints that make invalid states unrepresentable at the database level — the strongest possible guarantee against race conditions.

### 2.1 Core Tables

#### profiles (extends auth.users)

```sql
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('gridmaster','admin','scheduler','supervisor','user')),
  version       BIGINT NOT NULL DEFAULT 0,          -- optimistic lock counter
  role_locked   BOOLEAN NOT NULL DEFAULT FALSE,     -- prevents concurrent promotions
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_gridmaster CHECK (
    role <> 'gridmaster' OR org_id IS NULL           -- gridmaster has no org
  )
);

-- Auto-bump updated_at on every row change
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

#### organizations

```sql
CREATE TABLE public.organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,                -- e.g. "org"
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free'
               CHECK (plan IN ('free','pro','enterprise')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  version      BIGINT NOT NULL DEFAULT 0,          -- optimistic lock
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### role_change_log (Audit + Idempotency)

```sql
CREATE TABLE public.role_change_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  UUID NOT NULL REFERENCES auth.users(id),
  changed_by_id   UUID NOT NULL REFERENCES auth.users(id),
  from_role       TEXT NOT NULL,
  to_role         TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,             -- prevents duplicate promotions
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast duplicate-check lookups
CREATE INDEX ON role_change_log (idempotency_key);
CREATE INDEX ON role_change_log (target_user_id, created_at DESC);
```

#### jwt_refresh_locks (Prevents Stale JWT Race)

```sql
CREATE TABLE public.jwt_refresh_locks (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_until TIMESTAMPTZ NOT NULL,
  reason       TEXT                                 -- e.g. "role_change"
);
```

### 2.2 Critical Database Constraints

> ⚠ **Why Constraints Beat Application-Level Checks**
>
> Application code can have race conditions. A CHECK constraint or UNIQUE index at the database level is evaluated inside a single atomic transaction — it is physically impossible for two concurrent requests to violate it simultaneously.
>
> **Rule:** Every invariant that must always be true goes in the schema. Application logic only handles "happy path" routing.

```sql
-- Prevent any tenant from having two admins promoted simultaneously
CREATE UNIQUE INDEX one_admin_per_org
  ON profiles(org_id)
  WHERE role = 'admin' AND org_id IS NOT NULL;

-- Note: remove this index if multiple admins per org are desired.
-- Replace with a partial unique index on (org_id, role) if needed.

-- Enforce role hierarchy: scheduler cannot promote to admin
-- This is enforced via RLS policy (see Section 4).
```

---

## 3. Race Condition Catalog & Mitigations

This section enumerates every race condition that can occur in an RBAC system of this complexity and documents the precise mitigation for each.

### 3.1 Race Condition: Stale JWT After Role Change

| Property   | Detail                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | Admin demotes a Scheduler at 10:00 AM. The Scheduler's JWT does not expire until 10:15 AM. For 15 minutes the user retains Scheduler permissions in Edge Middleware. |
| Severity   | HIGH — active over-privilege window                                                                                                                                  |
| Mitigation | Forced JWT invalidation via Supabase custom claims + refresh lock table                                                                                              |

#### Implementation: Atomic Role Change + Forced Refresh

```sql
-- Supabase RPC: change_user_role()
-- Runs inside a single serializable transaction
CREATE OR REPLACE FUNCTION change_user_role(
  p_target_user_id  UUID,
  p_new_role        TEXT,
  p_changed_by_id   UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_role   TEXT;
  v_caller_role TEXT;
  v_org_id     UUID;
BEGIN
  -- 1. Idempotency check (prevents duplicate network retries)
  IF EXISTS (
    SELECT 1 FROM role_change_log WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  -- 2. Lock the target row (prevents concurrent promotions)
  SELECT role, org_id INTO v_old_role, v_org_id
    FROM profiles
   WHERE id = p_target_user_id
     FOR UPDATE;              -- row-level advisory lock

  -- 3. Verify caller has permission to make this change
  SELECT role INTO v_caller_role FROM profiles WHERE id = p_changed_by_id;

  IF v_caller_role = 'admin' AND p_new_role IN ('gridmaster', 'admin') THEN
    RAISE EXCEPTION 'admin cannot promote to admin or gridmaster';
  END IF;

  -- 4. Apply the role change
  UPDATE profiles
     SET role = p_new_role,
         version = version + 1,
         updated_at = NOW()
   WHERE id = p_target_user_id;

  -- 5. Write audit log
  INSERT INTO role_change_log
    (target_user_id, changed_by_id, from_role, to_role, idempotency_key)
  VALUES
    (p_target_user_id, p_changed_by_id, v_old_role, p_new_role, p_idempotency_key);

  -- 6. Write JWT refresh lock (blocks new token issuance for 5s)
  INSERT INTO jwt_refresh_locks (user_id, locked_until, reason)
    VALUES (p_target_user_id, NOW() + INTERVAL '5 seconds', 'role_change')
  ON CONFLICT (user_id) DO UPDATE
    SET locked_until = NOW() + INTERVAL '5 seconds';

  -- 7. Invalidate JWT via Supabase Admin API (called from Edge Function)
  -- See Section 5.2 for the Edge Function implementation.

  RETURN jsonb_build_object(
    'status', 'success',
    'from_role', v_old_role,
    'to_role', p_new_role
  );
END;
$$;
```

### 3.2 Race Condition: Concurrent Role Promotions

| Property   | Detail                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario   | Two Admins in different browser tabs both try to promote the same User to Scheduler at the exact same moment. Without a lock, the user's role row could be written twice with conflicting state.                                                 |
| Severity   | MEDIUM — results in audit log confusion and potential privilege escalation                                                                                                                                                                       |
| Mitigation | `SELECT ... FOR UPDATE` row lock inside the `change_user_role()` RPC ensures only one transaction proceeds at a time. The second caller blocks, then reads the already-updated row and returns "already_applied" if the idempotency key matches. |

### 3.3 Race Condition: Double-Submit on Schedule Writes

| Property   | Detail                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario   | A Scheduler clicks "Save Shift" and the network is slow. They click again. Two identical POST requests reach the server within milliseconds of each other. Without a guard, the same shift is inserted twice. |
| Severity   | MEDIUM — duplicate data, confusing UI state                                                                                                                                                                   |
| Mitigation | Optimistic locking via version column + client-side idempotency key. Supabase unique constraint on `(org_id, shift_date, user_id, idempotency_key)` prevents duplicate insertion.                             |

```sql
-- shifts table with optimistic lock
CREATE TABLE public.shifts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  shift_date       DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  version          BIGINT NOT NULL DEFAULT 0,
  idempotency_key  TEXT,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_duplicate_submission UNIQUE (org_id, idempotency_key)
);

-- Frontend generates key: `shift-${userId}-${date}-${Date.now()}`
-- Same key on retry = DB silently ignores the duplicate (ON CONFLICT DO NOTHING)
```

### 3.4 Race Condition: Optimistic Lock Violation on Update

When a Scheduler edits a shift that another Scheduler just modified, the second write must be rejected — not silently overwrite the first.

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
    // version mismatch = someone else edited it
    throw new OptimisticLockError(
      "Shift was modified by another user. Reload and retry.",
    );
  }
  return data;
};

// React Query config: auto-retry ONLY for network errors, not lock errors
useQuery({
  retry: (count, err) => !(err instanceof OptimisticLockError) && count < 3,
});
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

-- Auto-delete expired sessions
CREATE INDEX ON impersonation_sessions (expires_at);

-- Cron job (pg_cron): every 5 minutes
SELECT cron.schedule('cleanup-impersonation', '*/5 * * * *',
  $$DELETE FROM impersonation_sessions WHERE expires_at < NOW()$$);
```

---

## 4. Supabase RLS Policies

Row Level Security is the final and non-bypassable layer. Even if a user manipulates the JWT or the frontend, the RLS policies enforce correct access at the SQL execution level.

### 4.1 Enable RLS on All Tables

```sql
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_change_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Helper function: extract custom claim from JWT
CREATE OR REPLACE FUNCTION auth.user_org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.user_role() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.is_gridmaster() RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'gridmaster';
$$ LANGUAGE sql STABLE;
```

### 4.2 Shifts Table Policies

```sql
-- SELECT: users see only their org (or gridmaster sees all)
CREATE POLICY "shifts_select" ON shifts FOR SELECT
  USING (
    auth.is_gridmaster()
    OR org_id = auth.user_org_id()
  );

-- INSERT: only scheduler or higher in same org
CREATE POLICY "shifts_insert" ON shifts FOR INSERT
  WITH CHECK (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('scheduler', 'admin', 'gridmaster')
  );

-- UPDATE: only scheduler or higher; row must belong to same org
CREATE POLICY "shifts_update" ON shifts FOR UPDATE
  USING  (org_id = auth.user_org_id())
  WITH CHECK (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('scheduler', 'admin', 'gridmaster')
  );

-- DELETE: admin or gridmaster only
CREATE POLICY "shifts_delete" ON shifts FOR DELETE
  USING (
    auth.is_gridmaster()
    OR (org_id = auth.user_org_id() AND auth.user_role() = 'admin')
  );
```

### 4.3 Profiles Table Policies

```sql
-- Users can read their own profile + all profiles in same org
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (
    auth.is_gridmaster()
    OR id = auth.uid()
    OR org_id = auth.user_org_id()
  );

-- Role changes ONLY via change_user_role() RPC (SECURITY DEFINER)
-- Direct UPDATE on role column is blocked for all non-gridmaster
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())  -- cannot change own role
  );

CREATE POLICY "profiles_update_gridmaster" ON profiles FOR UPDATE
  USING  (auth.is_gridmaster())
  WITH CHECK (auth.is_gridmaster());
```

### 4.4 Role Change Log Policies

```sql
-- Immutable audit trail: insert only, no updates or deletes
CREATE POLICY "audit_insert" ON role_change_log FOR INSERT
  WITH CHECK (
    auth.user_role() IN ('admin', 'gridmaster')
  );

-- Admins can read their own org's log; gridmaster reads all
CREATE POLICY "audit_select" ON role_change_log FOR SELECT
  USING (
    auth.is_gridmaster()
    OR EXISTS (
      SELECT 1 FROM profiles
       WHERE id = target_user_id
         AND org_id = auth.user_org_id()
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
CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(
  event JSONB
) RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_user_id  UUID := (event->>'user_id')::UUID;
  v_role     TEXT;
  v_org_id   UUID;
BEGIN
  SELECT role, org_id
    INTO v_role, v_org_id
    FROM public.profiles
   WHERE id = v_user_id;

  -- Inject into app_metadata (not user_metadata — cannot be self-modified)
  RETURN jsonb_set(
    event,
    '{claims,app_metadata}',
    jsonb_build_object(
      'role',   COALESCE(v_role, 'user'),
      'org_id', v_org_id::TEXT
    )
  );
END;
$$;

-- Register hook in Supabase Dashboard → Auth → Hooks
```

### 5.2 Edge Function: Force JWT Invalidation After Role Change

When a role changes, the currently-issued JWT is immediately invalidated by revoking all sessions for that user. The next request forces re-authentication with a fresh JWT containing the new role.

```ts
// supabase/functions/invalidate-user-session/index.ts
import { createClient } from "@supabase/supabase-js";

export default async (req: Request): Promise<Response> => {
  const { target_user_id, reason } = await req.json();

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Invalidate all active refresh tokens for this user
  const { error } = await adminClient.auth.admin.signOut(
    target_user_id,
    "others",
  );

  if (error) return new Response(JSON.stringify({ error }), { status: 500 });

  // Log the invalidation
  await adminClient.from("audit_log").insert({
    action: "session_invalidated",
    target_user_id,
    reason,
    triggered_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
};
```

### 5.3 JWT Payload Structure

```json
{
  "sub": "usr_abc123...", // Supabase user ID
  "iat": 1720000000, // issued at
  "exp": 1720003600, // expires in 1 hour (keep short)
  "app_metadata": {
    "role": "scheduler", // injected by auth hook
    "org_id": "org_xyz789..." // injected by auth hook
  },
  "aud": "authenticated"
}

// ⚠ user_metadata is user-editable — NEVER store role there
// ✅ app_metadata is service-role-only — safe for claims
```

---

## 6. Vercel Edge Middleware

The middleware runs at the CDN edge — geographically closest to the user — before any backend compute is invoked. It performs JWT verification and subdomain-based role routing in under 5ms.

### 6.1 Subdomain Routing Logic

> **Allowed Subdomains:** Only two subdomain patterns are permitted:
>
> - `gridmaster.dubgrid.com` — Gridmaster-only admin panel
> - `{org-slug}.dubgrid.com` — Tenant-scoped access (e.g. `org.dubgrid.com`)
>
> All other subdomains are rejected at the middleware level.

| Subdomain                     | Allowed Roles                      | Redirect on Failure              |
| ----------------------------- | ---------------------------------- | -------------------------------- |
| `gridmaster.dubgrid.com`      | gridmaster only                    | Sign-out → `login.dubgrid.com`   |
| `{slug}.dubgrid.com/settings` | admin, gridmaster                  | Redirect → `/{slug}/dashboard`   |
| `{slug}.dubgrid.com/schedule` | scheduler, admin, gridmaster       | Redirect → `/{slug}/view`        |
| `{slug}.dubgrid.com/view`     | supervisor, user (all tenant)      | Redirect → `login.dubgrid.com`   |
| `login.dubgrid.com`           | unauthenticated (redirect if auth) | Redirect → appropriate dashboard |

### 6.2 Middleware Implementation

```ts
// middleware.ts (Vercel Edge Runtime)
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SUPABASE_JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET,
);

const ROLE_HIERARCHY: Record<string, number> = {
  gridmaster: 4,
  admin: 3,
  scheduler: 2,
  supervisor: 1,
  user: 0,
};

// Only these subdomain slugs are allowed
const ALLOWED_SUBDOMAINS = new Set(["gridmaster", "login"]);

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const token = req.cookies.get("sb-access-token")?.value;
  const pathname = req.nextUrl.pathname;
  const subdomain = host.split(".")[0];

  // ── Reject unknown subdomains ───────────────────────────────────
  // Allow 'gridmaster', 'login', or any valid org slug from the database.
  // Static check for reserved subdomains; org slugs are validated downstream.
  if (!ALLOWED_SUBDOMAINS.has(subdomain)) {
    // Subdomain must be a valid org slug — validated by tenant routing below.
    // If no org is found, the tenant page returns 404.
  }

  // ── Unauthenticated short-circuit ───────────────────────────────
  if (!token) return redirectToLogin(req);

  // ── Verify JWT signature + expiry ────────────────────────────────
  let claims: { role: string; org_id: string };
  try {
    const { payload } = await jwtVerify(token, SUPABASE_JWT_SECRET);
    claims = (payload as any).app_metadata;
  } catch {
    // Expired or tampered JWT — hard redirect
    return redirectToLogin(req);
  }

  const { role, org_id } = claims;

  // ── Gridmaster subdomain: gridmaster only ────────────────────────
  if (subdomain === "gridmaster") {
    if (role !== "gridmaster") return redirectToLogin(req);
    return NextResponse.next();
  }

  // ── Tenant subdomains (org slug) ─────────────────────────────────
  const orgSlug = subdomain;

  // Gridmaster bypass: can access any tenant subdomain
  if (role === "gridmaster") return NextResponse.next();

  // Tenant-scoped route guards
  if (pathname.startsWith("/settings") && ROLE_HIERARCHY[role] < 3) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (pathname.startsWith("/schedule") && ROLE_HIERARCHY[role] < 2) {
    return NextResponse.redirect(new URL("/view", req.url));
  }

  // Inject verified role into request headers for downstream use
  const res = NextResponse.next();
  res.headers.set("x-dubgrid-role", role);
  res.headers.set("x-dubgrid-org-id", org_id);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
};
```

> 🔒 **Security Note: Middleware is not the last line of defense**
>
> The Edge Middleware provides latency-optimized routing and UX-level gating. It is NOT the security layer — that role belongs exclusively to Supabase RLS (Section 4). A sophisticated attacker who bypasses middleware still hits RLS, which cannot be bypassed from the client.
>
> This two-layer model gives you both speed (edge) and correctness (database).

---

## 7. React Frontend Architecture

The React layer enforces role-aware rendering using a single source of truth: the parsed JWT claims. No extra API calls are needed for UI permission checks.

### 7.1 Auth Context & Permission Hook

```ts
// hooks/usePermissions.ts
import { useSessionContext } from "@supabase/auth-helpers-react";

const ROLE_LEVEL: Record<string, number> = {
  gridmaster: 4,
  admin: 3,
  scheduler: 2,
  supervisor: 1,
  user: 0,
};

export function usePermissions() {
  const { session } = useSessionContext();
  const claims = session?.user?.app_metadata ?? {};
  const role = (claims.role as string) ?? "user";
  const orgId = claims.org_id as string | null;
  const level = ROLE_LEVEL[role] ?? 0;

  return {
    role,
    orgId,
    level,
    isGridmaster: level >= 4,
    canManageOrg: level >= 3, // admin+
    canEditSchedule: level >= 2, // scheduler+
    canAddNotes: level >= 1, // supervisor+
    canRead: level >= 0, // everyone
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}
```

### 7.2 Conditional UI Rendering (Functional Silos)

```tsx
// components/ScheduleToolbar.tsx
export function ScheduleToolbar() {
  const { canEditSchedule, canManageOrg, canAddNotes } = usePermissions();

  return (
    <Toolbar>
      {/* Every tier can see their schedule */}
      <ViewButton />

      {/* Supervisor+ can add notes */}
      {canAddNotes && <AddNoteButton />}

      {/* Scheduler+ can create/edit shifts */}
      {canEditSchedule && (
        <>
          <CreateShiftButton />
          <EditShiftButton />
        </>
      )}

      {/* Admin+ can access org settings */}
      {canManageOrg && <OrgSettingsButton />}
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
    mutationFn: async (params: { targetUserId: string; newRole: string }) => {
      const idempotencyKey = uuidv4(); // unique per click = no double-submit

      const { data, error } = await supabase.rpc("change_user_role", {
        p_target_user_id: params.targetUserId,
        p_new_role: params.newRole,
        p_changed_by_id: supabase.auth.user()!.id,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;
      return data;
    },
    // Optimistic update: immediately reflect new role in UI
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["org-members"] });
      const prev = queryClient.getQueryData(["org-members"]);
      queryClient.setQueryData(["org-members"], (old: any) =>
        old.map((m: any) =>
          m.id === vars.targetUserId ? { ...m, role: vars.newRole } : m,
        ),
      );
      return { prev };
    },
    // Rollback on error (e.g. RLS rejection, lock violation)
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
| Global Org Monitor      | Dashboard with org health metrics — active users, last login, billing status | Read-only — no race risk                        |
| Account Unlock          | Clear lockout flags via `change_user_role()` RPC                             | Idempotency key prevents double-unlock          |
| Password Reset          | Supabase `admin.generateLink()` — sends reset email                          | One-time tokens expire in 1 hour                |
| User Impersonation      | Create `impersonation_sessions` row, receive scoped JWT                      | UNIQUE constraint prevents collision            |
| Org Deactivation        | Set `organizations.is_active = false` in transaction                         | `SELECT FOR UPDATE` prevents concurrent toggles |
| Global Audit Log Viewer | SELECT from `role_change_log` with no org_id filter                          | Append-only table — no mutation risk            |

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

| Race Condition                | Trigger                                        | Layer     | Mechanism                                                          |
| ----------------------------- | ---------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Stale JWT after role change   | Role demoted but old JWT still valid           | Auth + DB | Force session invalidation via admin API + jwt_refresh_locks       |
| Concurrent role promotions    | Two admins promote same user simultaneously    | DB        | `SELECT FOR UPDATE` row lock inside SECURITY DEFINER RPC           |
| Duplicate shift submission    | Network retry / double-click                   | DB        | UNIQUE `(org_id, idempotency_key)` constraint on shifts table      |
| Optimistic lock violation     | Two schedulers edit same shift                 | App + DB  | `.eq('version', expected)` Supabase query + UI error handling      |
| Impersonation token collision | Gridmaster opens two sessions in parallel      | DB        | UNIQUE `(gridmaster_id, target_user_id)` on impersonation_sessions |
| Cross-tenant data read        | RLS bypass attempt via URL manipulation        | DB        | RLS `org_id = auth.user_org_id()` enforced at SQL execution        |
| Admin self-promotion          | Admin tries to set own role = admin/gridmaster | DB        | SECURITY DEFINER RPC checks caller role before applying change     |
| Privilege escalation via UI   | Frontend hides buttons; API called directly    | DB        | RLS `WITH CHECK` prevents inserts/updates outside role permission  |
| Audit log tampering           | Admin tries to delete/edit audit record        | DB        | No UPDATE or DELETE RLS policy exists on `role_change_log`         |

> ✅ **Design Principle: Make Invalid States Unrepresentable**
>
> Every race condition in this system is prevented at the lowest possible layer — preferably the database schema itself. When an invariant is enforced by a CHECK constraint, UNIQUE index, or missing RLS policy, it is impossible to violate it regardless of what the application layer does.
>
> Application logic (React, Vercel Middleware) adds performance, UX polish, and early rejection. **Database constraints are the law.**

---

## 10. Per-Device Logout (Browser A ≠ Browser B)

The original design used `signOut(userId, 'others')` for all logout events. This signs out every session globally — meaning logging out in Browser A also kills Browser B. This section corrects that with a scoped session model.

### 10.1 Root Cause

> ⚠ **The Problem: Two Logout Paths Need Different Scopes**
>
> **Voluntary Logout** (user clicks "Sign Out"): should only destroy the current browser's session. Other devices remain active.
>
> **Forced Logout** (role change / account suspension): MUST destroy all sessions — the user's privilege has changed and no stale session can be tolerated.
>
> The original design used global revocation for both. The fix: route each case through the correct Supabase signOut scope.

### 10.2 user_sessions Table (Track Devices Individually)

```sql
CREATE TABLE public.user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_label    TEXT,                          -- e.g. "Chrome on macOS"
  ip_address      INET,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Supabase refresh token ID for targeted revocation
  refresh_token_hash  TEXT UNIQUE NOT NULL
);

CREATE INDEX ON user_sessions (user_id, last_active_at DESC);

-- RLS: users can only see their own sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_sessions_only" ON user_sessions
  USING (user_id = auth.uid());
```

### 10.3 Voluntary Logout: Local Scope Only

When the user clicks "Sign Out", only the current browser's refresh token is cleared. All other sessions continue uninterrupted.

```ts
// hooks/useLogout.ts
export function useLogout() {
  const supabase = useSupabaseClient();

  return async () => {
    // scope: "local" = only clears THIS browser's session
    // Browser B, Phone, etc. remain fully logged in
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (!error) {
      // Clean up local state
      queryClient.clear();
      router.push("/login");
    }
  };
}

// ✅ scope: "local"   → only this tab/browser
// ⚠ scope: "global"  → ALL devices (use only for forced logout)
// ⚠ scope: "others"  → all OTHER devices except current (use for "sign out everywhere else")
```

### 10.4 Forced Logout: Global Scope (Role Changes Only)

The `invalidate-user-session` Edge Function (Section 5.2) is updated to use global scope exclusively for security-triggered events.

```ts
// supabase/functions/invalidate-user-session/index.ts  (updated)
export default async (req: Request): Promise<Response> => {
  const { target_user_id, reason, scope } = await req.json();

  // Only "role_change" and "account_suspended" use global revocation
  const FORCED_LOGOUT_REASONS = [
    "role_change",
    "account_suspended",
    "security_incident",
  ];

  const revokeScope = FORCED_LOGOUT_REASONS.includes(reason)
    ? "global"
    : "local";

  if (revokeScope === "global") {
    // Revoke ALL sessions for this user across every device
    await adminClient.auth.admin.signOut(target_user_id, "others");
  }

  // "local" forced logouts are handled client-side only — no server action needed

  await adminClient.from("audit_log").insert({
    action: "session_invalidated",
    target_user_id,
    reason,
    scope: revokeScope,
    triggered_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ status: "ok", scope: revokeScope }), {
    status: 200,
  });
};
```

### 10.5 "Active Sessions" UI (Self-Service Device Management)

Users can view and revoke individual sessions from their account settings page.

```tsx
// components/ActiveSessions.tsx
export function ActiveSessions() {
  const { data: sessions } = useQuery({
    queryKey: ["my-sessions"],
    queryFn: () =>
      supabase
        .from("user_sessions")
        .select("*")
        .order("last_active_at", { ascending: false }),
  });

  const revokeSession = async (refreshTokenHash: string) => {
    // Mark session as revoked in user_sessions table
    await supabase
      .from("user_sessions")
      .delete()
      .eq("refresh_token_hash", refreshTokenHash);
    // Supabase will reject the next refresh attempt for this token
  };

  return (
    <ul>
      {sessions?.data?.map((s) => (
        <li key={s.id}>
          <span>
            {s.device_label} — Last active {formatRelative(s.last_active_at)}
          </span>
          <button onClick={() => revokeSession(s.refresh_token_hash)}>
            Sign out this device
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### 10.6 Logout Decision Matrix

| Trigger                             | Scope  | Mechanism                                        | Other Devices Affected?          |
| ----------------------------------- | ------ | ------------------------------------------------ | -------------------------------- |
| User clicks "Sign Out"              | local  | `supabase.auth.signOut({ scope: 'local' })`      | No — all other sessions remain   |
| User clicks "Sign out all devices"  | others | `supabase.auth.signOut({ scope: 'others' })`     | Yes — all other sessions revoked |
| Admin demotes/changes role          | global | Edge Function → `admin.signOut(uid, 'others')`   | Yes — forced, security-required  |
| Account suspended by Gridmaster     | global | Edge Function → `admin.signOut(uid, 'others')`   | Yes — forced, security-required  |
| Session revoked via Active Sessions | single | DELETE from user_sessions by refresh_token_hash  | Only the targeted device         |
| JWT expires naturally               | n/a    | Token not renewed — next request hits middleware | No — each JWT independent        |

---

## 11. Recommended Features Not Yet Implemented

The following features are absent from the current design but are strongly recommended before a production launch. They are ordered by priority.

### 11.1 Priority 1 — Security (Implement Before Launch)

#### Multi-Factor Authentication (MFA)

| Property         | Detail                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap              | Any user whose password is compromised gives an attacker full access. Gridmaster and Admin accounts are especially high-value targets.                                                                           |
| Recommendation   | Enforce TOTP (Supabase MFA) for Tier 3+ roles. Prompt Tier 0–2 users to enroll optionally. Gate the `gridmaster.dubgrid.com` subdomain at the middleware level: reject JWTs where `amr` does not contain "totp". |
| Supabase support | Built-in via `supabase.auth.mfa.enroll()` / `challenge()` / `verify()`                                                                                                                                           |

#### Failed Login Attempt Tracking & Account Lockout

| Property            | Detail                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap                 | No rate limit or lockout exists on the authentication endpoint. A brute-force attack can try unlimited passwords.                                                                              |
| Recommendation      | Add a `failed_login_attempts` table. After 5 failures within 15 minutes, set `profile.role_locked = true` and require email-based unlock. Log all failures with IP address in the audit table. |
| Race condition note | Use an atomic counter: `UPDATE profiles SET failed_attempts = failed_attempts + 1` — never read-then-write.                                                                                    |

#### IP Allowlisting for Gridmaster

| Property       | Detail                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap            | Any authenticated Gridmaster can access `gridmaster.dubgrid.com` from any IP, including a stolen laptop.                                                                    |
| Recommendation | Add a `gridmaster_allowed_ips` table. Vercel Middleware checks `req.ip` against the allowlist before processing the Gridmaster JWT. Unknown IPs trigger an email challenge. |

### 11.2 Priority 2 — User Lifecycle (Implement in First Month)

#### Soft Delete for Users and Orgs

| Property       | Detail                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gap            | Hard deletes cascade through all tables. A deleted org loses all schedule history with no recovery path.                                                                                         |
| Recommendation | Add `deleted_at TIMESTAMPTZ` to profiles and organizations. RLS policies add `AND deleted_at IS NULL` to all queries. A Gridmaster-only RPC handles permanent purge after a 30-day grace period. |

#### Email Verification Gate

| Property       | Detail                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap            | A user can be assigned a role before verifying their email address. An attacker could use a fake email to gain org membership.                                                                    |
| Recommendation | In the auth hook (Section 5.1), check `event.user.email_confirmed_at`. If null, inject `role: "unverified"` into the JWT regardless of the profiles row. RLS treats "unverified" as read-nothing. |

### 11.3 Priority 3 — Operational (Implement Within 3 Months)

#### Refresh Token Rotation & Reuse Detection

| Property       | Detail                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap            | If a refresh token is stolen (e.g. via XSS), the attacker can silently obtain new access tokens indefinitely.                                                                                                                     |
| Recommendation | Enable Supabase's built-in refresh token rotation. Each use of a refresh token invalidates it and issues a new one. If an old token is presented again (reuse), Supabase detects the theft and revokes the entire session family. |

#### Real-Time Presence (Who Is Viewing This Schedule)

| Property       | Detail                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gap            | Two Schedulers can unknowingly edit the same shift simultaneously, only discovering the conflict on save (optimistic lock error).                                                                            |
| Recommendation | Use Supabase Realtime Presence to broadcast which user is currently viewing each schedule. Show avatar indicators on cells being edited. This reduces optimistic lock collisions from conflicts to warnings. |
| Implementation | `supabase.channel('schedule:' + orgId).track({ user_id, viewing_shift_id })`                                                                                                                                 |

#### Notification System for Role Changes

| Property       | Detail                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap            | When a user is promoted or demoted, they receive no communication. Their next page refresh simply behaves differently with no explanation.                                                                                 |
| Recommendation | Trigger an email and in-app notification from the `change_user_role()` RPC. Add a `notifications` table. In-app banner: "Your role has been updated to Scheduler by [Admin Name]." Include a link to the new capabilities. |

#### GDPR / Data Export Compliance

| Property       | Detail                                                                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gap            | No mechanism exists for a user to request or receive all their personal data, which is legally required in many jurisdictions.                                                                                                                                                    |
| Recommendation | Add a `data_export_requests` table. A Gridmaster or the user themselves can trigger an export. A Supabase Edge Function assembles all rows associated with the user across all tables into a JSON archive and emails a signed download URL. Auto-delete the archive after 7 days. |

### 11.4 Feature Priority Summary

| Priority | Feature                                  | Risk if Skipped                                      |
| -------- | ---------------------------------------- | ---------------------------------------------------- |
| P1       | MFA for Gridmaster & Admin               | Account takeover via password compromise             |
| P1       | Failed login tracking & lockout          | Brute-force attacks succeed silently                 |
| P1       | IP allowlisting for Gridmaster           | Stolen Gridmaster credentials = full platform access |
| P2       | Soft delete (users & orgs)               | Accidental permanent data loss                       |
| P2       | Email verification gate                  | Unverified accounts receive org roles                |
| P3       | Refresh token rotation + reuse detection | Stolen tokens usable indefinitely                    |
| P3       | Real-time presence on schedule           | Frequent optimistic lock collisions                  |
| P3       | Role change notifications                | Silent UX — confused users after demotion            |
| P3       | GDPR data export                         | Legal compliance gap in EU/UK markets                |

---

## 12. Invite-Only Registration

Self-signup is completely disabled. Every user account must be created through an Admin-issued invitation. A rogue actor who reaches the Supabase sign-up endpoint without a valid invite token is rejected before a profile row is ever created.

### 12.1 Disable Public Sign-Up in Supabase

> 🔒 **First Line of Defense: Turn Off the Public Endpoint**
>
> In Supabase Dashboard → Authentication → Providers → Email: set "Enable email signup" to OFF.
>
> This makes `supabase.auth.signUp()` return an error for any call not initiated through the invite flow. It is the bluntest and most reliable control — no code can be written incorrectly around it.

### 12.2 org_invitations Table

```sql
CREATE TABLE public.org_invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by       UUID NOT NULL REFERENCES auth.users(id),
  email            TEXT NOT NULL,
  role_to_assign   TEXT NOT NULL
                   CHECK (role_to_assign IN ('scheduler', 'supervisor', 'user')),
  token            UUID NOT NULL DEFAULT gen_random_uuid(),  -- the secret in the link
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  accepted_at      TIMESTAMPTZ,                              -- NULL = pending
  revoked_at       TIMESTAMPTZ,                              -- NULL = still valid
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent the same email from having two open invites to the same org
  CONSTRAINT one_pending_invite UNIQUE (org_id, email)
);

-- Admins cannot invite gridmaster or admin — enforced by CHECK above
-- Gridmaster invitations are handled separately via a Gridmaster-only RPC

CREATE INDEX ON org_invitations (token);          -- fast token lookup on sign-up
CREATE INDEX ON org_invitations (org_id, email);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations for their own org only
CREATE POLICY "invitations_select" ON org_invitations FOR SELECT
  USING (
    auth.is_gridmaster()
    OR (org_id = auth.user_org_id() AND auth.user_role() = 'admin')
  );

CREATE POLICY "invitations_insert" ON org_invitations FOR INSERT
  WITH CHECK (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('admin', 'gridmaster')
    AND role_to_assign NOT IN ('admin', 'gridmaster')  -- admins cannot create admin invites
  );

-- Allow admins to revoke (soft-delete) pending invites
CREATE POLICY "invitations_revoke" ON org_invitations FOR UPDATE
  USING (
    org_id = auth.user_org_id()
    AND auth.user_role() IN ('admin', 'gridmaster')
    AND accepted_at IS NULL                             -- cannot revoke already-accepted invites
  )
  WITH CHECK (revoked_at IS NOT NULL);                 -- can only set revoked_at, nothing else
```

### 12.3 Admin Sends Invitation (RPC)

```sql
-- Supabase RPC: send_invitation()
-- Called from the Admin's "Invite User" form
CREATE OR REPLACE FUNCTION send_invitation(
  p_email          TEXT,
  p_role           TEXT,
  p_org_id         UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token    UUID;
  v_invite   org_invitations;
BEGIN
  -- 1. Clean up any expired, unaccepted prior invite for this email+org
  DELETE FROM org_invitations
   WHERE org_id = p_org_id
     AND email  = p_email
     AND accepted_at IS NULL
     AND expires_at < NOW();

  -- 2. Insert new invite (UNIQUE constraint blocks duplicate open invites)
  INSERT INTO org_invitations (org_id, invited_by, email, role_to_assign)
    VALUES (p_org_id, auth.uid(), p_email, p_role)
  RETURNING * INTO v_invite;

  -- 3. Return token to Edge Function which sends the invite email
  --    Email link: https://{slug}.dubgrid.com/accept-invite?token={v_invite.token}
  RETURN jsonb_build_object(
    'token',      v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$;
```

### 12.4 User Accepts Invitation (Sign-Up Flow)

The invite link directs the user to a sign-up page pre-populated with their email. The token is kept in the URL and validated server-side before Supabase creates the account.

```ts
// supabase/functions/accept-invite/index.ts
// Called by the sign-up form BEFORE supabase.auth.signUp()

export default async (req: Request): Promise<Response> => {
  const { token, email, password } = await req.json();

  // 1. Validate the token — atomic claim to prevent double-use
  const { data: invite, error } = await adminClient
    .from("org_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", token)
    .eq("email", email.toLowerCase()) // email must match invite
    .is("accepted_at", null) // not already used
    .is("revoked_at", null) // not revoked
    .gt("expires_at", new Date().toISOString()) // not expired
    .select()
    .single();

  // If no row returned: token invalid, expired, wrong email, or already used
  if (error || !invite) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired invitation" }),
      { status: 400 },
    );
  }

  // 2. Token is now consumed — create the Supabase auth user
  //    Using service role key bypasses the "sign-up disabled" setting
  const { data: authUser, error: signUpError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // pre-confirmed since they clicked an email link
      app_metadata: {
        // baked directly into first JWT
        role: invite.role_to_assign,
        org_id: invite.org_id,
      },
    });

  if (signUpError) {
    // Roll back the accepted_at claim so the invite can be reused
    await adminClient
      .from("org_invitations")
      .update({ accepted_at: null })
      .eq("token", token);

    return new Response(JSON.stringify({ error: signUpError.message }), {
      status: 500,
    });
  }

  // 3. Create the profiles row
  await adminClient.from("profiles").insert({
    id: authUser.user.id,
    org_id: invite.org_id,
    role: invite.role_to_assign,
  });

  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
};
```

### 12.5 Vercel Middleware: Block Direct Sign-Up Attempts

Even with Supabase sign-up disabled, the `/sign-up` route should be blocked at the edge to prevent any accidental re-enable from exposing a gap.

```ts
// In middleware.ts — add before the tenant routing block

// Block any direct access to sign-up page without a valid token in query string
if (pathname === "/sign-up") {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    // No token = not coming from an invite link
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Token presence is checked — full validation happens in the Edge Function
  return NextResponse.next();
}
```

### 12.6 Invitation Lifecycle & Edge Cases

| Scenario                            | Behavior                                         | Mechanism                                                                       |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Admin invites email already in org  | RPC returns error: user already a member         | Pre-check: `SELECT 1 FROM profiles WHERE email = p_email AND org_id = p_org_id` |
| Admin sends duplicate invite        | Old expired invite deleted, new one issued       | DELETE expired + INSERT with UNIQUE constraint                                  |
| User clicks expired link            | Edge Function returns 400 — invite expired       | `.gt('expires_at', NOW())` check in update query                                |
| User clicks already-used link       | Edge Function returns 400 — already used         | `.is('accepted_at', null)` check in update query                                |
| Two users race to accept same token | First UPDATE wins; second gets no row back = 400 | Atomic `UPDATE ... WHERE accepted_at IS NULL RETURNING *`                       |
| Admin revokes before user accepts   | Edge Function returns 400 — revoked              | `.is('revoked_at', null)` check in update query                                 |
| Email domain mismatch               | Edge Function returns 400 — email mismatch       | `.eq('email', email.toLowerCase())` in update query                             |
| Gridmaster creates an Admin invite  | Allowed via Gridmaster-only RPC                  | Admin invite RPC uses different CHECK — admin/gridmaster roles permitted        |

### 12.7 Invitation Flow Diagram

| Step | Actor         | Action                                                                      |
| ---- | ------------- | --------------------------------------------------------------------------- |
| 1    | Admin         | Fills "Invite User" form: email + role                                      |
| 2    | RPC           | Inserts `org_invitations` row, returns token                                |
| 3    | Edge Function | Sends email: "You have been invited to [Org Name] on Dubgrid — Accept"      |
| 4    | Invitee       | Clicks link → arrives at `/sign-up?token=<uuid>`                            |
| 5    | Middleware    | Confirms token query param is present — allows page to render               |
| 6    | Invitee       | Enters password and submits form                                            |
| 7    | Edge Function | Atomically claims token → creates auth user via admin API → inserts profile |
| 8    | Auth Hook     | JWT issued with role + org_id already in `app_metadata`                     |
| 9    | Invitee       | Redirected to their org dashboard, fully authenticated                      |
