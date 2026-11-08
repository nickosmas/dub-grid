// @vitest-environment node

/**
 * F-204 (128): the token hook refuses to renew a web session nobody has used
 * for 35 minutes, never a mobile one, and touch_web_session keeps an active
 * web session alive without reviving an idle one. Runs the real functions on
 * the seeded local database inside a transaction that is rolled back.
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

interface HookResult {
  claims?: Record<string, unknown>;
  error?: { http_code: number; message: string };
}

async function mint(userId: string, sessionId: string): Promise<HookResult> {
  const { rows } = await db.query<{ result: HookResult }>(
    `SELECT public.custom_access_token_hook($1::jsonb) AS result`,
    [
      JSON.stringify({
        user_id: userId,
        claims: { sub: userId, session_id: sessionId, aal: "aal1", role: "authenticated" },
        authentication_method: "password",
      }),
    ],
  );
  return rows[0].result;
}

async function newSession(platform: string | null, idleMinutes: number) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = 'qa-regular@dubgrid.test'`,
  );
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  const userId = rows[0].id;
  const { rows: session } = await db.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
  const sessionId = session[0].id;
  // The first mint creates the row, as a sign-in does.
  expect((await mint(userId, sessionId)).error).toBeUndefined();
  await db.query(
    `UPDATE public.user_sessions
        SET platform = $3, last_active_at = NOW() - make_interval(mins => $4)
      WHERE user_id = $1 AND supabase_session_id = $2`,
    [userId, sessionId, platform, idleMinutes],
  );
  return { userId, sessionId };
}

async function touchAs(userId: string, sessionId: string): Promise<void> {
  await db.query("SAVEPOINT touch");
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, session_id: sessionId, role: "authenticated" }),
  ]);
  await db.query("SET LOCAL ROLE authenticated");
  await db.query("SELECT public.touch_web_session()");
  await db.query("RESET ROLE");
  await db.query("RELEASE SAVEPOINT touch");
}

async function idleMinutes(sessionId: string): Promise<number> {
  const { rows } = await db.query<{ minutes: number }>(
    `SELECT EXTRACT(EPOCH FROM NOW() - last_active_at) / 60 AS minutes
       FROM public.user_sessions WHERE supabase_session_id = $1`,
    [sessionId],
  );
  return Number(rows[0].minutes);
}

describe.runIf(reachable)("web session idle limit (F-204, live DB)", () => {
  async function inTransaction(run: () => Promise<void>) {
    await db.query("BEGIN");
    try {
      await run();
    } finally {
      await db.query("ROLLBACK");
    }
  }

  it("refuses to renew a web session idle past the limit", () =>
    inTransaction(async () => {
      const { userId, sessionId } = await newSession("web", 40);
      expect(await mint(userId, sessionId)).toEqual({
        error: { http_code: 403, message: "Your session has expired. Please sign in again." },
      });
    }));

  it("renews a web session used within the limit", () =>
    inTransaction(async () => {
      const { userId, sessionId } = await newSession("web", 30);
      expect((await mint(userId, sessionId)).claims).toBeDefined();
    }));

  it.each(["ios", "android", null])("never limits a %s session", (platform) =>
    inTransaction(async () => {
      const { userId, sessionId } = await newSession(platform, 60 * 24 * 30);
      expect((await mint(userId, sessionId)).claims).toBeDefined();
    }),
  );

  it("records activity on the caller's own web session", () =>
    inTransaction(async () => {
      const { userId, sessionId } = await newSession("web", 10);
      await touchAs(userId, sessionId);
      expect(await idleMinutes(sessionId)).toBeLessThan(1);
    }));

  it("does not revive a web session already past the limit", () =>
    inTransaction(async () => {
      const { userId, sessionId } = await newSession("web", 40);
      await touchAs(userId, sessionId);
      expect(await idleMinutes(sessionId)).toBeGreaterThan(39);
    }));

  it("leaves another person's session alone", () =>
    inTransaction(async () => {
      const { sessionId } = await newSession("web", 10);
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM auth.users WHERE email = 'qa-super-admin@dubgrid.test'`,
      );
      await touchAs(rows[0].id, sessionId);
      expect(await idleMinutes(sessionId)).toBeGreaterThan(9);
    }));
});
