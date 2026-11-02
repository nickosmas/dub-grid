// @vitest-environment node

/**
 * Migration 113: an invite can carry an Admin's permissions, and accepting it
 * writes them onto the new membership. Any other tier ignores them, and an
 * invite without them leaves the membership's permissions empty, which the
 * resolver reads as the standard Admin set. Runs 113 inside BEGIN/ROLLBACK.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { migrationPath } from "./helpers/sql-inventory";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    await probe.query("SELECT 1 FROM public.invitations LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const MIGRATION = readFileSync(migrationPath("113_invite_admin_permissions.sql"), "utf8");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0113";
const SUPER_ADMIN = "11111111-1111-4111-8111-111111110113";
const INVITEE = "33333333-3333-4333-8333-333333330113";

let db: Client;

async function asServiceRole(): Promise<void> {
  await db.query("RESET ROLE");
  await db.query(`SET LOCAL ROLE service_role`);
  await db.query(`SET LOCAL request.jwt.claims = '{"role":"service_role"}'`);
}

async function asSuperuser(): Promise<void> {
  await db.query("RESET ROLE").catch(() => undefined);
  await db.query("RESET request.jwt.claims").catch(() => undefined);
}

async function asInvitee(): Promise<void> {
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(
    `SET LOCAL request.jwt.claims = '{"sub":"${INVITEE}","role":"authenticated","platform_role":"none","mfa_enrolled":false}'`,
  );
}

async function seedFixture(): Promise<void> {
  await asSuperuser();
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'sa113@test.com'),($2,'invitee113@test.com')`,
    [SUPER_ADMIN, INVITEE],
  );
  await db.query(
    `INSERT INTO organizations (id, name, slug, workspace_kind) VALUES ($1,'Permissions Test','perms-113','real')`,
    [ORG],
  );
  await db.query(
    `INSERT INTO profiles (id, org_id, platform_role) VALUES ($1,$2,'none')
     ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, platform_role = EXCLUDED.platform_role`,
    [SUPER_ADMIN, ORG],
  );
  await db.query(`SELECT set_config('app.allow_role_change','true',true)`);
  await db.query(
    `INSERT INTO organization_memberships (user_id, org_id, org_role, admin_permissions)
     VALUES ($1,$2,'super_admin','{}')`,
    [SUPER_ADMIN, ORG],
  );
}

/** Sends an invite the way the server does, then stores `permissions` on it. */
async function invite(role: string, permissions: Record<string, boolean> | null): Promise<string> {
  await asServiceRole();
  const { rows } = await db.query(
    `SELECT send_invitation('invitee113@test.com',$1,$2,NULL,'Ada','Byron',NULL,'{}','{}',$3) AS result`,
    [role, ORG, SUPER_ADMIN],
  );
  const id = rows[0].result.invitation_id as string;
  if (permissions) {
    await db.query(`UPDATE invitations SET admin_permissions = $2 WHERE id = $1`, [
      id,
      JSON.stringify(permissions),
    ]);
  }
  await asSuperuser();
  const token = await db.query(`SELECT token FROM invitations WHERE id = $1`, [id]);
  return token.rows[0].token as string;
}

async function accept(token: string): Promise<void> {
  await asInvitee();
  const { rows } = await db.query(`SELECT accept_invitation($1) AS result`, [token]);
  expect(rows[0].result.status).toBe("accepted");
  await asSuperuser();
}

async function membershipPermissions(): Promise<unknown> {
  const { rows } = await db.query(
    `SELECT admin_permissions FROM organization_memberships WHERE user_id = $1 AND org_id = $2`,
    [INVITEE, ORG],
  );
  return rows[0]?.admin_permissions;
}

describe.skipIf(!reachable)("113 invite admin permissions (live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });
  afterAll(async () => {
    await db?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    await seedFixture();
  });
  afterEach(async () => {
    await db.query("ROLLBACK").catch(() => undefined);
  });

  it("gives an invited Admin the permissions chosen before the invite", async () => {
    const chosen = { canEditShifts: true, canViewReports: false, canManageEmployees: true };
    await accept(await invite("admin", chosen));
    expect(await membershipPermissions()).toEqual(chosen);
  });

  it("leaves them empty, the standard set, when none were chosen", async () => {
    await accept(await invite("admin", null));
    expect(await membershipPermissions()).toBeNull();
  });

  it("ignores permissions on an invite for another tier", async () => {
    await accept(await invite("user", { canEditShifts: true }));
    expect(await membershipPermissions()).toBeNull();
  });

  it("only stores an object", async () => {
    await asServiceRole();
    const { rows } = await db.query(
      `SELECT send_invitation('invitee113@test.com','admin',$1,NULL,'Ada','Byron',NULL,'{}','{}',$2) AS result`,
      [ORG, SUPER_ADMIN],
    );
    await expect(
      db.query(`UPDATE invitations SET admin_permissions = '[1]' WHERE id = $1`, [
        rows[0].result.invitation_id,
      ]),
    ).rejects.toThrow(/invitations_admin_permissions_is_object/);
  });
});
