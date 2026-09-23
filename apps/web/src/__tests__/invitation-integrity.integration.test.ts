import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;

async function canReachDatabase(): Promise<boolean> {
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const reachable = await canReachDatabase();
const fixtureIds = {
  userId: randomUUID(),
  invitationId: randomUUID(),
  token: randomUUID(),
};
const fixtureEmail = `invitation-integrity-${fixtureIds.userId}@dubgrid.test`;
let db: Client;
let orgId: string;

async function connectAsInvitee(): Promise<Client> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  await client.query("SET ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: fixtureIds.userId, role: "authenticated", mfa_enrolled: false }),
  ]);
  return client;
}

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
  const organization = await db.query<{ id: string }>(
    "SELECT id FROM public.organizations WHERE archived_at IS NULL LIMIT 1",
  );
  if (!organization.rows[0]) throw new Error("Local Supabase has no active organization");
  orgId = organization.rows[0].id;

  await db.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated',
       'authenticated', $2, crypt('test-password', gen_salt('bf')),
       NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     )`,
    [fixtureIds.userId, fixtureEmail],
  );
  await db.query(
    `INSERT INTO public.invitations (
       id, org_id, email, role_to_assign, token, first_name, last_name
     ) VALUES ($1, $2, $3, 'user', $4, 'Integrity', 'Invitee')`,
    [fixtureIds.invitationId, orgId, fixtureEmail, fixtureIds.token],
  );
});

afterAll(async () => {
  if (!reachable || !db) return;
  try {
    await db.query("DELETE FROM public.invitations WHERE id = $1", [fixtureIds.invitationId]);
    await db.query("DELETE FROM public.organization_memberships WHERE user_id = $1", [
      fixtureIds.userId,
    ]);
    await db.query("DELETE FROM public.employees WHERE user_id = $1", [fixtureIds.userId]);
    await db.query("DELETE FROM public.jwt_refresh_locks WHERE user_id = $1", [fixtureIds.userId]);
    await db.query("DELETE FROM auth.users WHERE id = $1", [fixtureIds.userId]);
  } finally {
    await db.end();
  }
});

describe.runIf(reachable)("invitation integrity (live DB)", () => {
  it("allows one concurrent winner and makes replay mutation-free", async () => {
    const first = await connectAsInvitee();
    const second = await connectAsInvitee();
    try {
      const results = await Promise.allSettled([
        first.query("SELECT public.accept_invitation($1::uuid) AS result", [fixtureIds.token]),
        second.query("SELECT public.accept_invitation($1::uuid) AS result", [fixtureIds.token]),
      ]);

      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => String((result.reason as Error)?.message ?? result.reason));
      const successes = results.filter((result) => result.status === "fulfilled");
      if (successes.length !== 1) {
        throw new Error(`Expected one invitation winner, received: ${failures.join(" | ")}`);
      }
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        reason: { message: expect.stringContaining("INVITATION_INVALID") },
      });

      await expect(
        first.query("SELECT public.accept_invitation($1::uuid)", [fixtureIds.token]),
      ).rejects.toThrow(/INVITATION_INVALID/);

      const counts = await db.query<{
        accepted: string;
        employees: string;
        memberships: string;
      }>(
        `SELECT
           (SELECT count(*) FROM public.invitations WHERE id = $1 AND accepted_at IS NOT NULL) AS accepted,
           (SELECT count(*) FROM public.employees WHERE org_id = $2 AND user_id = $3) AS employees,
           (SELECT count(*) FROM public.organization_memberships WHERE org_id = $2 AND user_id = $3) AS memberships`,
        [fixtureIds.invitationId, orgId, fixtureIds.userId],
      );
      expect(counts.rows[0]).toEqual({ accepted: "1", employees: "1", memberships: "1" });
    } finally {
      await first.end();
      await second.end();
    }
  });

  it("rotates access atomically and restores only the original after delivery failure", async () => {
    await db.query("BEGIN");
    try {
      const original = await db.query<{
        id: string;
        token: string;
        updated_at: string;
      }>(
        `INSERT INTO public.invitations (org_id, email, role_to_assign, first_name, last_name)
         VALUES ($1, $2, 'user', 'Replacement', 'Invitee')
         RETURNING id, token, updated_at::text AS updated_at`,
        [orgId, `replacement-${randomUUID()}@dubgrid.test`],
      );
      const row = original.rows[0];
      const replacement = await db.query<{ result: Record<string, string> }>(
        `SELECT public.replace_pending_invitation_access(
           $1, $2, $3, 'admin', NULL, NULL, NULL
         ) AS result`,
        [orgId, row.id, row.updated_at],
      );
      const replacementId = replacement.rows[0].result.invitation_id;

      expect(replacement.rows[0].result.token).not.toBe(row.token);
      const invitee = await connectAsInvitee();
      try {
        await expect(
          invitee.query("SELECT public.accept_invitation($1::uuid)", [row.token]),
        ).rejects.toThrow(/INVITATION_INVALID/);
      } finally {
        await invitee.end();
      }

      const rollback = await db.query<{ restored: boolean }>(
        `SELECT public.rollback_pending_invitation_access_replacement($1, $2, $3) AS restored`,
        [orgId, row.id, replacementId],
      );
      expect(rollback.rows[0].restored).toBe(true);

      const states = await db.query<{ id: string; live: boolean }>(
        `SELECT id, revoked_at IS NULL AS live
         FROM public.invitations
         WHERE id = ANY($1::uuid[])
         ORDER BY id`,
        [[row.id, replacementId]],
      );
      expect(states.rows.filter((state) => state.live).map((state) => state.id)).toEqual([row.id]);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
