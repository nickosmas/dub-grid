// @vitest-environment node

/**
 * Migration 043 (feature 41a1): the inviter recorded on an invitation is
 * checked when the row is written, not just when it is used, and a
 * service-role caller can no longer create an invitation with no inviter.
 *
 * Every case runs inside BEGIN/ROLLBACK against the local database and builds
 * its own organization, so it needs no seed. The routes are bypassed entirely:
 * it is the functions that answer.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa41";
const SUPER_ADMIN = "11111111-1111-4111-8111-11111111ab41";
const ADMIN = "22222222-2222-4222-8222-22222222ab41";
const INVITEE = "33333333-3333-4333-8333-33333333ab41";

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

async function seedFixture(): Promise<void> {
  await asSuperuser();
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'sa41@test.com'),($2,'admin41@test.com'),($3,'invitee41@test.com')`,
    [SUPER_ADMIN, ADMIN, INVITEE],
  );
  await db.query(
    `INSERT INTO organizations (id, name, slug, workspace_kind) VALUES ($1,'Ceiling Test','ceiling-41','real')`,
    [ORG],
  );
  await db.query(
    `INSERT INTO profiles (id, org_id, platform_role) VALUES ($1,$3,'none'),($2,$3,'none')
     ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, platform_role = EXCLUDED.platform_role`,
    [SUPER_ADMIN, ADMIN, ORG],
  );
  await db.query(`SELECT set_config('app.allow_role_change','true',true)`);
  await db.query(
    `INSERT INTO organization_memberships (user_id, org_id, org_role, admin_permissions)
     VALUES ($1,$3,'super_admin','{}'),($2,$3,'admin','{"canManageEmployees":true}')`,
    [SUPER_ADMIN, ADMIN, ORG],
  );
}

async function sendInvitation(role: string, inviter: string | null): Promise<string> {
  const { rows } = await db.query(
    `SELECT send_invitation('invitee41@test.com',$1,$2,NULL,'Ada','Byron',NULL,'{}','{}',$3) AS result`,
    [role, ORG, inviter],
  );
  return rows[0].result.invitation_id as string;
}

describe.skipIf(!reachable)("invitation inviter verification (migration 043, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });
  afterAll(async () => {
    await db?.end().catch(() => undefined);
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await seedFixture();
  });
  afterEach(async () => {
    await db.query("ROLLBACK").catch(() => undefined);
  });

  it("refuses a super-admin invitation whose stated inviter is only an admin", async () => {
    await asServiceRole();
    await expect(sendInvitation("super_admin", ADMIN)).rejects.toThrow(/INVITATION_TIER_DENIED/);
  });

  it("still lets that admin invite at the admin tier", async () => {
    await asServiceRole();
    await expect(sendInvitation("admin", ADMIN)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it("refuses an invitation that states no inviter at all", async () => {
    await asServiceRole();
    // auth.uid() is NULL on this path, so an unstated inviter stays NULL and
    // acceptance could never honour it.
    await expect(sendInvitation("user", null)).rejects.toThrow(/INVITATION_TIER_DENIED/);
  });

  it("records the stated inviter, so the invitation can be accepted", async () => {
    await asServiceRole();
    const invitationId = await sendInvitation("super_admin", SUPER_ADMIN);

    await asSuperuser();
    const { rows } = await db.query(`SELECT invited_by, token FROM invitations WHERE id = $1`, [
      invitationId,
    ]);
    expect(rows[0].invited_by).toBe(SUPER_ADMIN);

    await db.query(`SET LOCAL ROLE authenticated`);
    await db.query(
      `SET LOCAL request.jwt.claims = '{"sub":"${INVITEE}","role":"authenticated","platform_role":"none","mfa_enrolled":false}'`,
    );
    const accepted = await db.query(`SELECT accept_invitation($1) AS result`, [rows[0].token]);
    expect(accepted.rows[0].result.status).toBe("accepted");
    expect(accepted.rows[0].result.role).toBe("super_admin");
  });

  it("refuses the replace path when the inviter it is handed lacks the tier", async () => {
    await asServiceRole();
    const invitationId = await sendInvitation("user", SUPER_ADMIN);
    const { rows } = await db.query(
      // As text: a round trip through a JS Date drops the microseconds the
      // optimistic check compares.
      `SELECT updated_at::TEXT AS updated_at FROM invitations WHERE id = $1`,
      [invitationId],
    );

    // The raised exception aborts the transaction, so the attempt runs inside
    // a savepoint and the row can still be read afterwards.
    await db.query("SAVEPOINT attempt");
    await expect(
      db.query(
        `SELECT replace_pending_invitation_access($1,$2,$3::TIMESTAMPTZ,'super_admin',$4,'{}','{}')`,
        [ORG, invitationId, rows[0].updated_at, ADMIN],
      ),
    ).rejects.toThrow(/INVITATION_TIER_DENIED/);
    await db.query("ROLLBACK TO SAVEPOINT attempt");

    await asSuperuser();
    const after = await db.query(
      `SELECT role_to_assign, revoked_at FROM invitations WHERE id = $1`,
      [invitationId],
    );
    // Refused before the revoke, so the original invitation is still pending.
    expect(after.rows[0].role_to_assign).toBe("user");
    expect(after.rows[0].revoked_at).toBeNull();
  });

  it("lets a super admin replace access to the super-admin tier", async () => {
    await asServiceRole();
    const invitationId = await sendInvitation("user", SUPER_ADMIN);
    const { rows } = await db.query(
      // As text: a round trip through a JS Date drops the microseconds the
      // optimistic check compares.
      `SELECT updated_at::TEXT AS updated_at FROM invitations WHERE id = $1`,
      [invitationId],
    );

    const replaced = await db.query(
      `SELECT replace_pending_invitation_access($1,$2,$3::TIMESTAMPTZ,'super_admin',$4,'{}','{}') AS result`,
      [ORG, invitationId, rows[0].updated_at, SUPER_ADMIN],
    );
    expect(replaced.rows[0].result.invitation_id).toBeTruthy();
  });

  it("accepts every tier, not only super_admin", async () => {
    for (const role of ["user", "admin", "super_admin"]) {
      await db.query("SAVEPOINT tier");
      await asServiceRole();
      const invitationId = await sendInvitation(role, SUPER_ADMIN);
      await asSuperuser();
      const { rows } = await db.query(`SELECT token FROM invitations WHERE id = $1`, [
        invitationId,
      ]);
      await db.query(`SET LOCAL ROLE authenticated`);
      await db.query(
        `SET LOCAL request.jwt.claims = '{"sub":"${INVITEE}","role":"authenticated","platform_role":"none","mfa_enrolled":false}'`,
      );
      const accepted = await db.query(`SELECT accept_invitation($1) AS result`, [rows[0].token]);
      expect(accepted.rows[0].result.role, `${role} could not be accepted`).toBe(role);
      await asSuperuser();
      await db.query("ROLLBACK TO SAVEPOINT tier");
    }
  });
});
