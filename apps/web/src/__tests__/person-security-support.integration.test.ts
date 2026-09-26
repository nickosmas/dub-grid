// @vitest-environment node

/**
 * Migration 059: the two-factor re-enrollment flag and a surrogate id on known
 * devices. Runs the migration on the seeded local database inside a
 * transaction that is rolled back, so a database without 059 is left as it was.
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
  path.resolve(__dirname, "../../../../supabase/migrations/059_person_security_support.sql"),
  "utf8",
);

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

describe.runIf(reachable)("person security support (059, live DB)", () => {
  it("gives every known device its own id", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const user = await userId("qa-regular@dubgrid.test");
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.user_known_devices (user_id, device_hash, platform)
         VALUES ($1, $2, 'web'), ($1, $3, 'ios') RETURNING id`,
        [user, "c".repeat(64), "d".repeat(64)],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!.id).not.toBe(rows[1]!.id);
      await expect(
        db.query(`UPDATE public.user_known_devices SET id = $1 WHERE id = $2`, [
          rows[0]!.id,
          rows[1]!.id,
        ]),
      ).rejects.toThrow(/duplicate key/);
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("stores the re-enrollment flag, which a signed-in user cannot clear", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const user = await userId("qa-regular@dubgrid.test");
      await db.query(`UPDATE public.profiles SET mfa_reenroll_required_at = now() WHERE id = $1`, [
        user,
      ]);
      await db.query("SET LOCAL ROLE authenticated");
      await expect(
        db.query(`UPDATE public.profiles SET mfa_reenroll_required_at = NULL WHERE id = $1`, [
          user,
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
