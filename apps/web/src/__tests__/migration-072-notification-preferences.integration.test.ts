// @vitest-environment node

/**
 * Migration 072: notification preferences merge inside one upsert, so two
 * saves at the same moment keep each other's categories (F-20).
 *
 * The concurrent case needs the function committed, so it runs against the
 * migrated local database (`npm run db:reset` applies 072) with a throwaway
 * user id, which it removes. The other cases run 072 from its file inside
 * BEGIN/ROLLBACK.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
const MIGRATION = readFileSync(migrationPath("072_notification_preferences_merge.sql"), "utf8");
const on = { in_app: true, email: true };
const off = { in_app: false, email: false };

let db: Client;
let other: Client;

async function merge(client: Client, userId: string, prefs: object) {
  const { rows } = await client.query<{ prefs: Record<string, unknown> }>(
    `SELECT public.merge_notification_preferences($1, $2::jsonb) AS prefs`,
    [userId, JSON.stringify(prefs)],
  );
  return rows[0]!.prefs;
}

describe.runIf(reachable)("notification preferences merge in the database (072, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    other = new Client(DB_CONFIG);
    await Promise.all([db.connect(), other.connect()]);
  });

  afterAll(async () => {
    await Promise.all([db?.end(), other?.end()]);
  });

  it("keeps the categories a save does not mention and never stores security", async () => {
    const userId = randomUUID();
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      await merge(db, userId, { billing: off, schedule: on, security: off });
      const saved = await merge(db, userId, { schedule: off, system: on });

      expect(saved).toEqual({ billing: off, schedule: off, system: on });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("lets only the service role call it", async () => {
    await db.query("BEGIN");
    try {
      await db.query(MIGRATION);
      const { rows } = await db.query<{ role: string; allowed: boolean }>(
        `SELECT role, has_function_privilege(role, 'public.merge_notification_preferences(uuid, jsonb)', 'EXECUTE') AS allowed
           FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`,
      );
      expect(Object.fromEntries(rows.map((row) => [row.role, row.allowed]))).toEqual({
        anon: false,
        authenticated: false,
        service_role: true,
      });
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps both of two concurrent saves", async () => {
    const userId = randomUUID();
    try {
      await db.query("BEGIN");
      await merge(db, userId, { schedule: off });
      // The second save waits on the first's row, then merges over it.
      const second = merge(other, userId, { billing: off });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await db.query("COMMIT");

      expect(await second).toEqual({ billing: off, schedule: off });
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.query(`DELETE FROM public.notification_preferences WHERE user_id = $1`, [userId]);
    }
  });
});
