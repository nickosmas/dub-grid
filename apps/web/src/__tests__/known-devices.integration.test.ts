// @vitest-environment node

/**
 * Migration 048: a password change forgets every device the user signed in
 * from, so the next sign-in from any of them alerts again, and signed-in
 * users can read none of it. Runs the migration and its checks on the seeded
 * local database inside a transaction that is rolled back, so a database that
 * has not applied 048 yet is left as it was.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../../supabase/migrations/048_user_known_devices.sql"),
  "utf8",
);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

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

async function userId(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1`, [
    email,
  ]);
  if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
  return rows[0]!.id;
}

async function knownDevices(user: string): Promise<string[]> {
  const { rows } = await db.query<{ device_hash: string }>(
    `SELECT device_hash FROM public.user_known_devices WHERE user_id = $1 ORDER BY device_hash`,
    [user],
  );
  return rows.map((row) => row.device_hash);
}

describe.runIf(reachable)("known devices (048, live DB)", () => {
  it("forgets a user's devices when their password changes, and no one else's", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const regular = await userId("qa-regular@dubgrid.test");
      const other = await userId("qa-super-admin@dubgrid.test");
      await db.query(
        `INSERT INTO public.user_known_devices (user_id, device_hash, platform)
         VALUES ($1, $3, 'web'), ($1, $4, 'ios'), ($2, $3, 'web')`,
        [regular, other, HASH_A, HASH_B],
      );

      // Another column changing is not a password change.
      await db.query(`UPDATE auth.users SET updated_at = now() WHERE id = $1`, [regular]);
      expect(await knownDevices(regular)).toEqual([HASH_A, HASH_B]);

      await db.query(
        `UPDATE auth.users SET encrypted_password = crypt('A-new-password-1', gen_salt('bf'))
          WHERE id = $1`,
        [regular],
      );
      expect(await knownDevices(regular)).toEqual([]);
      expect(await knownDevices(other)).toEqual([HASH_A]);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("is invisible to signed-in users", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      await db.query("SET LOCAL ROLE authenticated");
      await expect(db.query(`SELECT 1 FROM public.user_known_devices LIMIT 1`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
