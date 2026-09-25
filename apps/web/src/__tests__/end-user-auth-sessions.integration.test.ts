// @vitest-environment node

/**
 * F-21 (migration 046): ending someone's sessions deletes their provider
 * sessions, and their refresh tokens with them, so no refresh can restore
 * access. Runs on the seeded local database inside a rolled-back transaction.
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
let db: Client;

beforeAll(async () => {
  if (!reachable) return;
  db = new Client(DB_CONFIG);
  await db.connect();
});

afterAll(async () => {
  await db?.end().catch(() => undefined);
});

async function openSession(userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, now(), now()) RETURNING id`,
    [userId],
  );
  await db.query(
    `INSERT INTO auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid()::text, $1, false, now(), now(), $2)`,
    [userId, rows[0].id],
  );
  return rows[0].id;
}

async function liveRefreshTokens(sessionIds: string[]): Promise<string[]> {
  const { rows } = await db.query<{ session_id: string }>(
    `SELECT DISTINCT session_id::text FROM auth.refresh_tokens WHERE session_id = ANY($1::uuid[])`,
    [sessionIds],
  );
  return rows.map((row) => row.session_id).sort();
}

describe.runIf(reachable)("end_user_auth_sessions (F-21, live DB)", () => {
  it("deletes the user's sessions and refresh tokens, sparing one when asked", async () => {
    await db.query("BEGIN");
    try {
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM auth.users WHERE email IN ('qa-regular@dubgrid.test', 'qa-admin@dubgrid.test')
         ORDER BY email`,
      );
      if (rows.length < 2) throw new Error("Local QA fixtures missing; run npm run db:reset");
      const [admin, member] = rows.map((row) => row.id);

      const kept = await openSession(member);
      const ended = await openSession(member);
      const bystander = await openSession(admin);

      await db.query(`SET LOCAL ROLE service_role`);
      await db.query(`SELECT public.end_user_auth_sessions($1, $2)`, [member, kept]);
      await db.query(`RESET ROLE`);
      expect(await liveRefreshTokens([kept, ended, bystander])).toEqual([kept, bystander].sort());

      await db.query(`SET LOCAL ROLE service_role`);
      await db.query(`SELECT public.end_user_auth_sessions($1)`, [member]);
      await db.query(`RESET ROLE`);
      expect(await liveRefreshTokens([kept, bystander])).toEqual([bystander]);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("is not callable by a signed-in user", async () => {
    await db.query("BEGIN");
    try {
      await db.query(`SET LOCAL ROLE authenticated`);
      await expect(
        db.query(`SELECT public.end_user_auth_sessions(gen_random_uuid())`),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
