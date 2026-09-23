// @vitest-environment node

/**
 * Migrations 033 and 034 (audit findings F-04, F-05, F-06, F-21): rules the routes enforce
 * now hold at the row level too. Every case runs inside BEGIN/ROLLBACK on
 * the seeded local database and simulates the caller the way PostgREST
 * does, so it is the policies and grants that answer, not the routes.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

type Member = { userId: string; email: string; orgRole: "admin" | "super_admin" | "user" };

interface Fixture {
  orgId: string;
  admin: Member;
  superAdmin: Member;
  member: Member;
}

let db: Client;

async function loadMember(orgId: string, email: string): Promise<Member> {
  const { rows } = await db.query<{ id: string; org_role: Member["orgRole"] }>(
    `SELECT u.id, m.org_role
       FROM auth.users u
       JOIN public.organization_memberships m ON m.user_id = u.id AND m.org_id = $1
      WHERE u.email = $2`,
    [orgId, email],
  );
  if (rows.length === 0) throw new Error(`${email} is not seeded on Calm Haven`);
  return { userId: rows[0].id, email, orgRole: rows[0].org_role };
}

async function loadFixture(): Promise<Fixture> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  if (rows.length === 0) throw new Error("Calm Haven is not seeded, run npm run db:reset");
  const orgId = rows[0].id;
  return {
    orgId,
    admin: await loadMember(orgId, "qa-admin@dubgrid.test"),
    superAdmin: await loadMember(orgId, "qa-super-admin@dubgrid.test"),
    member: await loadMember(orgId, "qa-regular@dubgrid.test"),
  };
}

async function asUser(member: Member, orgId: string): Promise<void> {
  const claims = JSON.stringify({
    sub: member.userId,
    role: "authenticated",
    mfa_enrolled: false,
    org_id: orgId,
    org_role: member.orgRole,
    platform_role: "none",
  });
  await db.query(`SET LOCAL ROLE authenticated`);
  await db.query(`SET LOCAL request.jwt.claims = '${claims}'`);
}

async function asSuperuser(): Promise<void> {
  await db.query(`RESET ROLE`).catch(() => undefined);
  await db.query(`RESET request.jwt.claims`).catch(() => undefined);
}

/** Runs a statement expected to raise without aborting the outer transaction. */
async function expectRaise(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  await db.query("SAVEPOINT expected_failure");
  try {
    await expect(run()).rejects.toThrow(pattern);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT expected_failure");
    await asSuperuser();
  }
}

async function insertInvitation(
  fx: Fixture,
  inviter: Member,
  role: Member["orgRole"],
  email: string,
): Promise<string> {
  const { rows } = await db.query<{ token: string }>(
    `INSERT INTO public.invitations (org_id, invited_by, email, role_to_assign, first_name, last_name)
     VALUES ($1, $2, $3, $4, 'Invited', 'Person') RETURNING token`,
    [fx.orgId, inviter.userId, email, role],
  );
  return rows[0].token;
}

/** Makes the regular QA member a stranger to Calm Haven so they can accept an invitation. */
async function detachMember(fx: Fixture): Promise<void> {
  await db.query(`DELETE FROM public.organization_memberships WHERE user_id = $1 AND org_id = $2`, [
    fx.member.userId,
    fx.orgId,
  ]);
  // Acceptance creates a fresh staff row for the invitee, so the seeded one
  // must give up both the account link and the email it would collide on.
  await db.query(
    `UPDATE public.employees SET user_id = NULL, email = '' WHERE user_id = $1 AND org_id = $2`,
    [fx.member.userId, fx.orgId],
  );
  await db.query(`UPDATE public.profiles SET org_id = NULL WHERE id = $1`, [fx.member.userId]);
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

describe.runIf(reachable)("invitation role ceiling (F-04, live DB)", () => {
  it("refuses an admin's direct super-admin invitation and accepts a super admin's", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();

      await expectRaise(async () => {
        await asUser(fx.admin, fx.orgId);
        await insertInvitation(fx, fx.admin, "super_admin", "ceiling@example.test");
      }, /row-level security/);

      await asUser(fx.admin, fx.orgId);
      await insertInvitation(fx, fx.admin, "admin", "peer@example.test");
      await asSuperuser();

      await asUser(fx.superAdmin, fx.orgId);
      await insertInvitation(fx, fx.superAdmin, "super_admin", "owner@example.test");
      await asSuperuser();

      const { rows } = await db.query<{ email: string }>(
        `SELECT email FROM public.invitations WHERE org_id = $1 AND email LIKE '%@example.test' ORDER BY email`,
        [fx.orgId],
      );
      expect(rows.map((row) => row.email)).toEqual(["owner@example.test", "peer@example.test"]);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("will not honour a super-admin invitation whose inviter has since been demoted", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const token = await insertInvitation(fx, fx.superAdmin, "super_admin", fx.member.email);
      await detachMember(fx);
      await db.query(`SELECT set_config('app.allow_role_change', 'true', true)`);
      await db.query(
        `UPDATE public.organization_memberships SET org_role = 'admin'
          WHERE user_id = $1 AND org_id = $2`,
        [fx.superAdmin.userId, fx.orgId],
      );

      await expectRaise(async () => {
        await asUser({ ...fx.member, orgRole: "user" }, fx.orgId);
        await db.query(`SELECT public.accept_invitation($1)`, [token]);
      }, /INVITATION_INVALID/);

      const { rows } = await db.query(
        `SELECT 1 FROM public.organization_memberships WHERE user_id = $1 AND org_id = $2`,
        [fx.member.userId, fx.orgId],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("still grants a super-admin invitation while the inviter holds the tier", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      const token = await insertInvitation(fx, fx.superAdmin, "super_admin", fx.member.email);
      await detachMember(fx);

      await asUser({ ...fx.member, orgRole: "user" }, fx.orgId);
      await db.query(`SELECT public.accept_invitation($1)`, [token]);
      await asSuperuser();

      const { rows } = await db.query<{ org_role: string }>(
        `SELECT org_role FROM public.organization_memberships WHERE user_id = $1 AND org_id = $2`,
        [fx.member.userId, fx.orgId],
      );
      expect(rows.map((row) => row.org_role)).toEqual(["super_admin"]);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});

describe.runIf(reachable)("profile lifecycle columns (F-05, live DB)", () => {
  it("lets a people manager rename a colleague but not touch account controls", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();

      await asUser(fx.admin, fx.orgId);
      const renamed = await db.query(
        `UPDATE public.profiles SET first_name = 'Renamed', updated_at = now()
          WHERE id = $1 AND org_id = $2 RETURNING first_name`,
        [fx.member.userId, fx.orgId],
      );
      await asSuperuser();
      expect(renamed.rows).toEqual([{ first_name: "Renamed" }]);

      for (const column of ["deactivated_at", "terminated_at", "scheduled_deletion_at"]) {
        await expectRaise(async () => {
          await asUser(fx.admin, fx.orgId);
          await db.query(`UPDATE public.profiles SET ${column} = now() WHERE id = $1`, [
            fx.member.userId,
          ]);
        }, /permission denied for table profiles/);
      }
      // Consent is recorded by the terms route through the service role;
      // a member forging a colleague's (or their own) acceptance is refused.
      for (const who of [fx.admin, fx.member]) {
        await expectRaise(async () => {
          await asUser(who, fx.orgId);
          await db.query(
            `UPDATE public.profiles SET terms_accepted_at = now(), terms_version = 'forged'
              WHERE id = $1`,
            [fx.member.userId],
          );
        }, /permission denied for table profiles/);
      }
      await expectRaise(async () => {
        await asUser(fx.superAdmin, fx.orgId);
        await db.query(`UPDATE public.profiles SET platform_role = 'gridmaster' WHERE id = $1`, [
          fx.member.userId,
        ]);
      }, /permission denied for table profiles/);

      const { rows } = await db.query<{ deactivated_at: string | null; platform_role: string }>(
        `SELECT deactivated_at, platform_role FROM public.profiles WHERE id = $1`,
        [fx.member.userId],
      );
      expect(rows[0]).toEqual({ deactivated_at: null, platform_role: "none" });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps the platform paths that own those columns working", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      // The gridmaster routes write through the service role.
      await db.query(`SET LOCAL ROLE service_role`);
      const { rows } = await db.query<{ deactivated_at: string }>(
        `UPDATE public.profiles SET deactivated_at = now(), deactivated_by = $2
          WHERE id = $1 RETURNING deactivated_at`,
        [fx.member.userId, fx.superAdmin.userId],
      );
      expect(rows[0].deactivated_at).not.toBeNull();
      // The terms route records acceptance the same way.
      const { rows: accepted } = await db.query<{ terms_version: string }>(
        `UPDATE public.profiles SET terms_accepted_at = now(), terms_version = 'live-test'
          WHERE id = $1 RETURNING terms_version`,
        [fx.member.userId],
      );
      expect(accepted).toEqual([{ terms_version: "live-test" }]);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});

describe.runIf(reachable)("session rows are server-owned (F-06, live DB)", () => {
  it("lets a member read their own sessions but never write one", async () => {
    await db.query("BEGIN");
    try {
      const fx = await loadFixture();
      await db.query(`SET LOCAL ROLE service_role`);
      const { rows: seeded } = await db.query<{ id: string }>(
        `INSERT INTO public.user_sessions (user_id, org_id, supabase_session_id, platform)
         VALUES ($1, $2, gen_random_uuid(), 'web') RETURNING id`,
        [fx.member.userId, fx.orgId],
      );
      await asSuperuser();

      await asUser(fx.member, fx.orgId);
      const { rows: mine } = await db.query<{ id: string }>(
        `SELECT id FROM public.user_sessions WHERE user_id = $1`,
        [fx.member.userId],
      );
      expect(mine.map((row) => row.id)).toContain(seeded[0].id);
      const { rows: others } = await db.query(
        `SELECT id FROM public.user_sessions WHERE user_id = $1`,
        [fx.admin.userId],
      );
      expect(others).toHaveLength(0);
      await asSuperuser();

      // The revoked-session replay: a client recreating its own row.
      await expectRaise(async () => {
        await asUser(fx.member, fx.orgId);
        await db.query(
          `INSERT INTO public.user_sessions (user_id, org_id, supabase_session_id, platform)
           VALUES ($1, $2, gen_random_uuid(), 'web')`,
          [fx.member.userId, fx.orgId],
        );
      }, /row-level security/);
      // No delete policy exists, so the statement matches nothing rather
      // than raising; the row must still be there afterwards.
      await asUser(fx.member, fx.orgId);
      const deleted = await db.query(`DELETE FROM public.user_sessions WHERE id = $1`, [
        seeded[0].id,
      ]);
      expect(deleted.rowCount).toBe(0);
      await asSuperuser();
      const { rowCount: stillThere } = await db.query(
        `SELECT 1 FROM public.user_sessions WHERE id = $1`,
        [seeded[0].id],
      );
      expect(stillThere).toBe(1);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
