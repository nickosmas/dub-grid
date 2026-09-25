// @vitest-environment node

/**
 * F-19: the new sign-in alert keys on the app's first report of a session.
 * The access-token hook creates the session's row at mint, before the app
 * reports it, so the claim must work on a row that already exists. This runs
 * the real hook, then the claim's statement, on the seeded local database
 * inside a transaction that is rolled back.
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

/** The statement `claimNewSignIn` issues, returning whether this report won. */
async function claim(userId: string, sessionId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE public.user_sessions SET platform = 'web'
      WHERE user_id = $1 AND supabase_session_id = $2 AND platform IS NULL`,
    [userId, sessionId],
  );
  return rowCount === 1;
}

describe.runIf(reachable)("new sign-in claim (F-19, live DB)", () => {
  it("wins exactly once on the row the token hook creates at mint", async () => {
    await db.query("BEGIN");
    try {
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM auth.users WHERE email = 'qa-regular@dubgrid.test'`,
      );
      if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
      const userId = rows[0].id;
      const { rows: session } = await db.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
      const sessionId = session[0].id;

      await db.query(`SELECT public.custom_access_token_hook($1::jsonb)`, [
        JSON.stringify({
          user_id: userId,
          claims: { sub: userId, session_id: sessionId, aal: "aal1", role: "authenticated" },
          authentication_method: "password",
        }),
      ]);

      // The row exists before the app reports anything, with no platform.
      const { rows: minted } = await db.query<{ platform: string | null }>(
        `SELECT platform FROM public.user_sessions WHERE supabase_session_id = $1`,
        [sessionId],
      );
      expect(minted).toEqual([{ platform: null }]);

      expect(await claim(userId, sessionId)).toBe(true);
      expect(await claim(userId, sessionId)).toBe(false);

      // A refresh mints again; the hook must not clear what the app recorded.
      await db.query(`SELECT public.custom_access_token_hook($1::jsonb)`, [
        JSON.stringify({
          user_id: userId,
          claims: { sub: userId, session_id: sessionId, aal: "aal1", role: "authenticated" },
          authentication_method: "token_refresh",
        }),
      ]);
      expect(await claim(userId, sessionId)).toBe(false);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
