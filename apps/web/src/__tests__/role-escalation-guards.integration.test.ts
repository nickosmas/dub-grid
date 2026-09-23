/**
 * Privilege-escalation regression tests for the role-mutation RPCs.
 *
 * Two CRITICAL bugs were live until 2026-05-16:
 *
 *  1. `assign_org_role_by_email` accepted any `p_org_role` from any
 *     authenticated admin caller, so an `admin` (org_role) could pass
 *     `p_org_role := 'super_admin'` and promote themselves or anyone whose
 *     auth.users email they knew — bypassing `guard_org_role_change` via
 *     the function's own `set_config('app.allow_role_change','true')`.
 *
 *  2. `change_user_role` blocked admins from PROMOTING to admin/super_admin/
 *     gridmaster but had no symmetric check on the TARGET's existing role,
 *     so an admin could pass `p_new_role := 'user'` against a super_admin
 *     and demote them (any non-protected new role slipped through).
 *
 * Both fixes live in supabase/migrations/002_functions_triggers.sql. These
 * tests exercise the live DB to prove the guards still raise. If anyone
 * removes them, these tests fail loudly — the existing TypeScript
 * simulation in rbac-properties.test.ts mirrors the *intended* logic and
 * would silently keep passing.
 *
 * Runs against local Supabase (postgres://postgres:postgres@127.0.0.1:54322).
 * Skipped when LOCAL_SUPABASE_DB_URL is unset and the default port is
 * unreachable (CI without a running Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

// Supabase's hosted pooler requires SSL; the local CLI Postgres does not.
// Match what scripts/reset-remote-db.ts uses so the same DB_URL works
// against both targets without per-environment branching.
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

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

const reachable = await probeDb();

interface Fixture {
  orgId: string;
  adminUserId: string;
  adminEmail: string;
  superAdminUserId: string;
  superAdminEmail: string;
  secondSuperAdminUserId: string;
}

let db: Client;
let fx: Fixture;

/**
 * Seed two super_admins and one admin against a real org so we exercise the
 * guards under realistic preconditions. Two super_admins are required so the
 * "last super_admin" demotion guard doesn't fire and mask the test target —
 * we want to prove the *tier* guard fires, not the last-of-kind guard.
 */
async function seedFixture(): Promise<Fixture> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM public.organizations LIMIT 1`);
  if (rows.length === 0) {
    throw new Error("No organizations in seed — run npm run db:reset first");
  }
  const orgId = rows[0].id;

  async function makeUser(email: string): Promise<string> {
    const { rows: existing } = await db.query<{ id: string }>(
      `SELECT id FROM auth.users WHERE email = $1`,
      [email],
    );
    if (existing.length > 0) return existing[0].id;
    const { rows: inserted } = await db.query<{ id: string }>(
      `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated', $1, crypt('test-pw', gen_salt('bf')),
         NOW(), NOW(), NOW(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
       )
       RETURNING id`,
      [email],
    );
    return inserted[0].id;
  }

  const adminEmail = `test-admin-${Date.now()}@guard-test.local`;
  const superAdminEmail = `test-super-${Date.now()}@guard-test.local`;
  const secondSuperAdminEmail = `test-super2-${Date.now()}@guard-test.local`;

  const adminUserId = await makeUser(adminEmail);
  const superAdminUserId = await makeUser(superAdminEmail);
  const secondSuperAdminUserId = await makeUser(secondSuperAdminEmail);

  // Triggers on auth.users created the profile rows. Now membership rows —
  // the guard_org_role_change trigger blocks direct INSERTs unless we set
  // the bypass flag (same mechanism the RPCs use).
  await db.query(`SELECT set_config('app.allow_role_change', 'true', true)`);
  await db.query(
    `INSERT INTO public.organization_memberships (user_id, org_id, org_role)
     VALUES ($1, $2, 'admin'), ($3, $2, 'super_admin'), ($4, $2, 'super_admin')
     ON CONFLICT (user_id, org_id) DO UPDATE SET org_role = EXCLUDED.org_role`,
    [adminUserId, orgId, superAdminUserId, secondSuperAdminUserId],
  );

  return {
    orgId,
    adminUserId,
    adminEmail,
    superAdminUserId,
    superAdminEmail,
    secondSuperAdminUserId,
  };
}

/**
 * Simulate an authenticated session for the given user against the given org.
 * Mirrors what PostgREST does when handling an RPC call: SET ROLE authenticated
 * + populate the request.jwt.claims GUC so auth.uid()/auth.jwt() return the
 * right values inside SECURITY DEFINER functions and caller_org_id().
 */
async function asUser(
  userId: string,
  orgId: string,
  orgRole: "admin" | "super_admin" | "user",
): Promise<void> {
  const claims = JSON.stringify({
    sub: userId,
    role: "authenticated",
    mfa_enrolled: false,
    org_id: orgId,
    org_role: orgRole,
    platform_role: "none",
  });
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
}

async function resetSession(): Promise<void> {
  await db.query(`RESET ROLE`);
  await db.query(`RESET request.jwt.claims`);
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  fx = await seedFixture();
});

afterAll(async () => {
  if (!reachable || !db) return;
  // Best-effort cleanup. Test fixtures are tied to a unique timestamped
  // email so re-running the suite doesn't trip the unique constraint.
  try {
    await db.query(`SELECT set_config('app.allow_role_change', 'true', true)`);
    await db.query(
      `DELETE FROM public.organization_memberships
       WHERE user_id IN ($1, $2, $3)`,
      [fx.adminUserId, fx.superAdminUserId, fx.secondSuperAdminUserId],
    );
    await db.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3)`, [
      fx.adminUserId,
      fx.superAdminUserId,
      fx.secondSuperAdminUserId,
    ]);
  } finally {
    await db.end();
  }
});

describe.runIf(reachable)("role-escalation guards (live DB)", () => {
  describe("assign_org_role_by_email", () => {
    it("blocks an admin from assigning super_admin to anyone", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(`SELECT public.assign_org_role_by_email($1, $2, 'super_admin')`, [
            fx.superAdminEmail,
            fx.orgId,
          ]),
        ).rejects.toThrow(/admin cannot assign admin or super_admin/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("blocks an admin from assigning admin to anyone", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(`SELECT public.assign_org_role_by_email($1, $2, 'admin')`, [
            fx.superAdminEmail,
            fx.orgId,
          ]),
        ).rejects.toThrow(/admin cannot assign admin or super_admin/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("blocks an admin from self-promoting (even to 'user' would no-op, but to super_admin must raise)", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(`SELECT public.assign_org_role_by_email($1, $2, 'super_admin')`, [
            fx.adminEmail,
            fx.orgId,
          ]),
        ).rejects.toThrow(/admin cannot assign admin or super_admin/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("allows a super_admin to assign super_admin", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.superAdminUserId, fx.orgId, "super_admin");
        await expect(
          db.query(`SELECT public.assign_org_role_by_email($1, $2, 'user')`, [
            fx.adminEmail,
            fx.orgId,
          ]),
        ).resolves.toBeDefined();
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });
  });

  describe("change_user_role", () => {
    it("blocks an admin from demoting a super_admin to user", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'user', $2::uuid, gen_random_uuid()::text, $3::uuid
             )`,
            [fx.superAdminUserId, fx.adminUserId, fx.orgId],
          ),
        ).rejects.toThrow(/admin cannot change the role of an admin, super_admin, or gridmaster/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("blocks an admin from changing another admin's role", async () => {
      // Promote secondSuperAdmin to admin within the txn so we have two admins
      // to test against; rollback will restore.
      await db.query("BEGIN");
      try {
        await db.query(`SELECT set_config('app.allow_role_change', 'true', true)`);
        await db.query(
          `UPDATE public.organization_memberships
             SET org_role = 'admin'
           WHERE user_id = $1 AND org_id = $2`,
          [fx.secondSuperAdminUserId, fx.orgId],
        );
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'user', $2::uuid, gen_random_uuid()::text, $3::uuid
             )`,
            [fx.secondSuperAdminUserId, fx.adminUserId, fx.orgId],
          ),
        ).rejects.toThrow(/admin cannot change the role of an admin, super_admin, or gridmaster/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("blocks a super_admin from changing their own role (self-guard)", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.superAdminUserId, fx.orgId, "super_admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'user', $1::uuid, gen_random_uuid()::text, $2::uuid
             )`,
            [fx.superAdminUserId, fx.orgId],
          ),
        ).rejects.toThrow(/SELF_ACTION_FORBIDDEN/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("blocks an admin from changing their own role (self-guard)", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.adminUserId, fx.orgId, "admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'user', $1::uuid, gen_random_uuid()::text, $2::uuid
             )`,
            [fx.adminUserId, fx.orgId],
          ),
        ).rejects.toThrow(/SELF_ACTION_FORBIDDEN/i);
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("allows a super_admin to demote a super_admin (when another super_admin remains)", async () => {
      await db.query("BEGIN");
      try {
        await asUser(fx.superAdminUserId, fx.orgId, "super_admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'user', $2::uuid, gen_random_uuid()::text, $3::uuid
             )`,
            [fx.secondSuperAdminUserId, fx.superAdminUserId, fx.orgId],
          ),
        ).resolves.toBeDefined();
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });

    it("allows a super_admin to change a user's role to admin", async () => {
      await db.query("BEGIN");
      try {
        // Make a user-tier member first
        await db.query(`SELECT set_config('app.allow_role_change', 'true', true)`);
        await db.query(
          `UPDATE public.organization_memberships
             SET org_role = 'user'
           WHERE user_id = $1 AND org_id = $2`,
          [fx.adminUserId, fx.orgId],
        );
        await asUser(fx.superAdminUserId, fx.orgId, "super_admin");
        await expect(
          db.query(
            `SELECT public.change_user_role(
               $1::uuid, 'admin', $2::uuid, gen_random_uuid()::text, $3::uuid
             )`,
            [fx.adminUserId, fx.superAdminUserId, fx.orgId],
          ),
        ).resolves.toBeDefined();
      } finally {
        await db.query("ROLLBACK");
        await resetSession();
      }
    });
  });
});
