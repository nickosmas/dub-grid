/**
 * Cross-tenant RLS isolation regression test.
 *
 * Anchors the invariant that a user signed into Org A can never read Org B's
 * data through the authenticated REST API, even when:
 *   - The user is a legitimate member of both orgs.
 *   - profiles.org_id still points at the wrong org (signup default that
 *     switch_org intentionally no longer mutates).
 *
 * This is the exact scenario that produced the original cross-tenant leak:
 * caller_org_id() used to read profiles.org_id, which drifted out of sync
 * with the JWT after switch_org stopped updating it. The fix made
 * caller_org_id() read auth.jwt() ->> 'org_id' instead.
 *
 * Skipped when LOCAL_SUPABASE_URL is unset (CI without a running Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
import { authenticatedSecurityDefinerAllowlist } from "./helpers/sql-inventory";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_EMAIL = process.env.LOCAL_SUPABASE_SUPER_ADMIN_EMAIL ?? "qa-super-admin@dubgrid.test";
const TEST_PASSWORD = process.env.LOCAL_SUPABASE_SUPER_ADMIN_PASSWORD ?? "password123";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

async function probeSupabase(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Malformed JWT");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as Record<string, unknown>;
}

async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`signIn failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function rpc(
  accessToken: string,
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`rpc ${name} failed: ${res.status} ${await res.text()}`);
  }
}

async function refreshSession(refreshToken: string): Promise<{ accessToken: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

async function listOrgIdsForUser(accessToken: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organization_memberships?select=org_id&archived_at=is.null`,
    {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`memberships fetch failed: ${res.status}`);
  }
  const rows = (await res.json()) as Array<{ org_id: string }>;
  return rows.map((r) => r.org_id);
}

async function fetchEmployeesViaRls(accessToken: string): Promise<Array<{ org_id: string }>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=org_id`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`employees fetch failed: ${res.status}`);
  }
  return (await res.json()) as Array<{ org_id: string }>;
}

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const supabaseReachable = await probeSupabase();
const dbReachable = await probeDb();

describe.runIf(supabaseReachable)("cross-tenant RLS isolation", () => {
  it("RLS scopes authenticated reads to the JWT's org_id, even after switch_org leaves profiles.org_id stale", async () => {
    const { accessToken, refreshToken } = await signIn();
    const initialClaims = decodeJwtClaims(accessToken);
    const initialOrgId = initialClaims.org_id as string;
    expect(typeof initialOrgId).toBe("string");

    // Pick any OTHER org this user is a member of as the switch target.
    const orgIds = await listOrgIdsForUser(accessToken);
    const targetOrgId = orgIds.find((id) => id !== initialOrgId);
    if (!targetOrgId) {
      // Single-org user — nothing meaningful to test here.
      return;
    }

    // Session-scoped switch: queues a pending_org_switch row, consumed by
    // the next refresh. profiles.org_id is intentionally NOT mutated.
    await rpc(accessToken, "switch_org", { target_org_id: targetOrgId });

    const { accessToken: refreshed } = await refreshSession(refreshToken);
    const refreshedClaims = decodeJwtClaims(refreshed);
    expect(refreshedClaims.org_id).toBe(targetOrgId);

    // The acid test: query an RLS-gated table. Every row must belong to
    // the JWT's current org (targetOrgId). If caller_org_id() ever drifts
    // back to reading profiles.org_id, this assertion fails — which is
    // precisely the regression we're guarding against.
    const employees = await fetchEmployeesViaRls(refreshed);
    const distinctOrgIds = new Set(employees.map((e) => e.org_id));
    expect(distinctOrgIds.size).toBeLessThanOrEqual(1);
    if (distinctOrgIds.size === 1) {
      expect([...distinctOrgIds][0]).toBe(targetOrgId);
    }
  });
});

/**
 * SQL-layer tests for caller_org_id() / caller_org_role(). These probe the
 * helpers directly by setting request.jwt.claims so we can exercise the two
 * branches that the HTTP-level test above can't reach:
 *
 *   1. Fallback path: legacy/service-role tokens with no org_id claim must
 *      still return profiles.org_id, otherwise SSR and pre-deploy tokens
 *      lose every RLS read at once.
 *
 *   2. Divergent state: a sibling device's switch_org mutates profiles.org_id
 *      while THIS session's JWT still carries the original org_id. That is
 *      the precise shape that made mobile alerts disappear — the helper must
 *      honor the JWT, not the row.
 */
let sqlDb: Client;

beforeAll(async () => {
  if (!dbReachable) return;
  sqlDb = new Client(DB_CONFIG);
  await sqlDb.connect();
});

afterAll(async () => {
  if (!dbReachable || !sqlDb) return;
  await sqlDb.end().catch(() => undefined);
});

/**
 * Pick a fresh (userId, profiles.org_id, otherOrgId) tuple at test time. We
 * read it inside each `it` (not in beforeAll) because the cross-tenant HTTP
 * test above mutates profiles.org_id via switch_org, so any state captured
 * at file-load time goes stale. We avoid that user explicitly — TEST_EMAIL —
 * and prefer a user that exists only in the SQL fixtures.
 */
async function pickSqlFixture(): Promise<{
  userId: string;
  profileOrgId: string;
  otherOrgId: string | null;
}> {
  const { rows: profileRows } = await sqlDb.query<{
    id: string;
    org_id: string;
  }>(
    `SELECT p.id, p.org_id
       FROM public.profiles p
       JOIN public.organization_memberships m
         ON m.user_id = p.id AND m.org_id = p.org_id AND m.archived_at IS NULL
       JOIN auth.users u ON u.id = p.id
      WHERE p.org_id IS NOT NULL AND u.email <> $1
      LIMIT 1`,
    [TEST_EMAIL],
  );
  if (profileRows.length === 0) {
    throw new Error(
      "No seeded profile with a matching membership — run npm run db:reset && npm run seed first",
    );
  }
  const userId = profileRows[0].id;
  const profileOrgId = profileRows[0].org_id;

  const { rows: otherOrgRows } = await sqlDb.query<{ id: string }>(
    `SELECT id FROM public.organizations
      WHERE archived_at IS NULL AND id <> $1 LIMIT 1`,
    [profileOrgId],
  );
  return {
    userId,
    profileOrgId,
    otherOrgId: otherOrgRows[0]?.id ?? null,
  };
}

async function setJwtClaims(claims: Record<string, unknown>): Promise<void> {
  await actAsAuthenticated(sqlDb, claims);
}

async function resetJwt(): Promise<void> {
  await sqlDb.query(`RESET ROLE`);
  await sqlDb.query(`RESET request.jwt.claims`);
}

describe.runIf(dbReachable)("caller_org_id / caller_org_role SQL layer", () => {
  it("keeps the live RLS, search_path, and function grants aligned with the inventory", async () => {
    const { rows: unprotectedTables } = await sqlDb.query<{ table_name: string }>(`
      SELECT class.relname AS table_name
      FROM pg_class AS class
      JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public'
        AND class.relkind = 'r'
        AND NOT class.relrowsecurity
      ORDER BY class.relname
    `);
    expect(unprotectedTables).toEqual([]);

    const { rows: policylessTables } = await sqlDb.query<{ table_name: string }>(`
      SELECT class.relname AS table_name
      FROM pg_class AS class
      JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
      LEFT JOIN pg_policy AS policy ON policy.polrelid = class.oid
      WHERE namespace.nspname = 'public'
        AND class.relkind = 'r'
      GROUP BY class.relname
      HAVING COUNT(policy.polname) = 0
      ORDER BY class.relname
    `);
    expect(policylessTables.map((row) => row.table_name)).toEqual(["calendar_feed_tokens"]);

    const { rows: unsafeSearchPaths } = await sqlDb.query<{ function_name: string }>(`
      SELECT procedure.oid::regprocedure::text AS function_name
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.prosecdef
        AND NOT COALESCE(procedure.proconfig, '{}'::TEXT[]) @> ARRAY['search_path=public']
      ORDER BY function_name
    `);
    expect(unsafeSearchPaths).toEqual([]);

    const { rows: anonymousFunctions } = await sqlDb.query<{ function_name: string }>(`
      SELECT procedure.oid::regprocedure::text AS function_name
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND has_function_privilege('anon', procedure.oid, 'EXECUTE')
      ORDER BY function_name
    `);
    expect(anonymousFunctions).toEqual([]);

    const { rows: authenticatedFunctions } = await sqlDb.query<{ function_name: string }>(`
      SELECT DISTINCT procedure.proname AS function_name
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.prosecdef
        AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      ORDER BY function_name
    `);
    expect(authenticatedFunctions.map((row) => row.function_name)).toEqual(
      authenticatedSecurityDefinerAllowlist(),
    );
  });

  // This test used to assert the opposite — that a claim-less JWT falls back to
  // profiles.org_id — and that fallback was a cross-tenant read leak, not a
  // feature. The access-token hook strips org_id precisely when the membership
  // is invalid (archived membership, archived or suspended org, deactivated
  // user), and "remove from organization" is a soft archive that leaves
  // profiles.org_id pointing at the org. So a removed member's own token fell
  // through to the org they had just been removed from and kept full SELECT
  // over every table whose policy reads caller_org_id() — permanently, as a
  // non-member. Resolving to NULL is what makes those policies match no rows.
  it("resolves to no organization when the JWT carries no org_id claim", async () => {
    const { userId } = await pickSqlFixture();
    await sqlDb.query("BEGIN");
    try {
      // The claim shape of a token the hook has refused org context to.
      await setJwtClaims({ sub: userId, role: "authenticated" });

      const { rows } = await sqlDb.query<{
        cid: string | null;
        crole: string | null;
      }>(
        `SELECT public.caller_org_id()::text AS cid,
                public.caller_org_role()::text AS crole`,
      );
      expect(rows[0].cid).toBeNull();
      // And the role degrades with it: caller_org_role joins memberships on
      // caller_org_id(), so a NULL org can only produce the 'user' floor.
      expect(rows[0].crole).toBe("user");
    } finally {
      await sqlDb.query("ROLLBACK");
      await resetJwt();
    }
  });

  // The end-to-end shape of the leak, against a real database: a member whose
  // membership is archived (what removal actually does) can no longer reach the
  // org's rows through the policies that trust caller_org_id().
  it("stops resolving an org for a member whose membership was archived", async () => {
    const { userId, profileOrgId } = await pickSqlFixture();
    await sqlDb.query("BEGIN");
    try {
      await sqlDb.query(
        `UPDATE public.organization_memberships
            SET archived_at = NOW()
          WHERE user_id = $1 AND org_id = $2`,
        [userId, profileOrgId],
      );

      // The trigger clears the profile default, so even a fresh sign-in has no
      // org to inherit.
      const { rows: profileRows } = await sqlDb.query<{ org_id: string | null }>(
        `SELECT org_id::text AS org_id FROM public.profiles WHERE id = $1`,
        [userId],
      );
      expect(profileRows[0].org_id).toBeNull();

      // An outstanding token still carries the old org_id claim, but the live
      // membership guard makes it resolve to nothing immediately.
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        org_id: profileOrgId,
        org_role: "user",
      });
      const { rows } = await sqlDb.query<{ cid: string | null }>(
        `SELECT public.caller_org_id()::text AS cid`,
      );
      expect(rows[0].cid).toBeNull();
    } finally {
      await sqlDb.query("ROLLBACK");
      await resetJwt();
    }
  });

  it("honors the JWT org_id even when profiles.org_id has been flipped by a sibling device", async () => {
    const { userId, profileOrgId, otherOrgId } = await pickSqlFixture();
    if (!otherOrgId) {
      // Single-org seed — can't simulate the divergence. Skip rather than
      // assert against a degenerate case.
      return;
    }
    await sqlDb.query("BEGIN");
    try {
      // Simulate the side-effect from switch_org running on another device:
      // profiles.org_id flips to the OTHER org, while this session's JWT
      // still carries the original org_id.
      await sqlDb.query(`UPDATE public.profiles SET org_id = $1 WHERE id = $2`, [
        otherOrgId,
        userId,
      ]);

      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        org_id: profileOrgId,
        org_role: "user",
      });

      const { rows } = await sqlDb.query<{ cid: string }>(
        `SELECT public.caller_org_id()::text AS cid`,
      );
      // Must match the JWT, not the row. Before the fix this returned
      // otherOrgId — which is exactly what made mobile alerts disappear.
      expect(rows[0].cid).toBe(profileOrgId);
    } finally {
      await sqlDb.query("ROLLBACK");
      await resetJwt();
    }
  });

  it("denies direct reads and writes after the JWT session row is revoked", async () => {
    const { userId, profileOrgId, otherOrgId } = await pickSqlFixture();
    if (!otherOrgId) return;

    const sessionId = "c86048a9-a369-49dd-9db7-e1b81edba078";
    await sqlDb.query("BEGIN");
    try {
      await sqlDb.query(
        `INSERT INTO public.user_sessions (user_id, supabase_session_id, active_org_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (supabase_session_id) DO UPDATE
           SET user_id = EXCLUDED.user_id, active_org_id = EXCLUDED.active_org_id`,
        [userId, sessionId, profileOrgId],
      );
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        session_id: sessionId,
        org_id: profileOrgId,
        org_role: "user",
      });

      const before = await sqlDb.query<{ org_id: string | null }>(
        `SELECT public.caller_org_id()::text AS org_id`,
      );
      expect(before.rows[0].org_id).toBe(profileOrgId);

      await sqlDb.query("RESET ROLE");
      await sqlDb.query(`DELETE FROM public.user_sessions WHERE supabase_session_id = $1`, [
        sessionId,
      ]);
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        session_id: sessionId,
        org_id: profileOrgId,
        org_role: "user",
      });

      const after = await sqlDb.query<{ org_id: string | null }>(
        `SELECT public.caller_org_id()::text AS org_id`,
      );
      expect(after.rows[0].org_id).toBeNull();

      const crossTenantRead = await sqlDb.query(
        `SELECT id FROM public.employees WHERE org_id = $1`,
        [otherOrgId],
      );
      expect(crossTenantRead.rowCount).toBe(0);

      const crossTenantWrite = await sqlDb.query(
        `UPDATE public.employees SET first_name = first_name WHERE org_id = $1`,
        [otherOrgId],
      );
      expect(crossTenantWrite.rowCount).toBe(0);
    } finally {
      await sqlDb.query("ROLLBACK");
      await resetJwt();
    }
  });

  it("denies direct tenant access when the account or organization is unavailable", async () => {
    const { userId, profileOrgId } = await pickSqlFixture();
    await sqlDb.query("BEGIN");
    try {
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        org_id: profileOrgId,
        org_role: "user",
      });

      await sqlDb.query("RESET ROLE");
      await sqlDb.query(`UPDATE public.organizations SET suspended_at = NOW() WHERE id = $1`, [
        profileOrgId,
      ]);
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        org_id: profileOrgId,
        org_role: "user",
      });
      const suspended = await sqlDb.query<{ org_id: string | null }>(
        `SELECT public.caller_org_id()::text AS org_id`,
      );
      expect(suspended.rows[0].org_id).toBeNull();

      await sqlDb.query("RESET ROLE");
      await sqlDb.query(`UPDATE public.organizations SET suspended_at = NULL WHERE id = $1`, [
        profileOrgId,
      ]);
      await sqlDb.query(`UPDATE public.profiles SET deactivated_at = NOW() WHERE id = $1`, [
        userId,
      ]);
      await setJwtClaims({
        sub: userId,
        role: "authenticated",
        org_id: profileOrgId,
        org_role: "user",
      });
      const deactivated = await sqlDb.query<{ org_id: string | null }>(
        `SELECT public.caller_org_id()::text AS org_id`,
      );
      expect(deactivated.rows[0].org_id).toBeNull();
    } finally {
      await sqlDb.query("ROLLBACK");
      await resetJwt();
    }
  });
});
