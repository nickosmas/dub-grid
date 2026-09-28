// @vitest-environment node

/**
 * Migration 074: the database records every password change Auth stores, so
 * the record no longer rests on a reason the client sends (F-05). Each case
 * runs 074 from its file inside BEGIN/ROLLBACK against the local database.
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
    await probe.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
const MIGRATION = readFileSync(migrationPath("074_password_change_recorded.sql"), "utf8");

let db: Client;
let userId: string;

async function passwordRows() {
  const { rows } = await db.query<{
    actor_id: string;
    org_id: string | null;
    resource_type: string;
    resource_id: string;
    details: Record<string, string>;
  }>(
    `SELECT actor_id, org_id, resource_type, resource_id, details FROM public.audit_log
      WHERE action = 'security.auth.password' AND resource_id = $1`,
    [userId],
  );
  return rows;
}

describe.runIf(reachable)("password changes are recorded by the database (074, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM auth.users WHERE email = 'qa-regular@dubgrid.test'`,
    );
    if (rows.length === 0) throw new Error("Local QA fixtures missing; run npm run db:reset");
    userId = rows[0]!.id;
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("records a new password once, with the person as actor and no organization", async () => {
    await db.query(
      `UPDATE auth.users SET encrypted_password = crypt('another-password', gen_salt('bf'))
        WHERE id = $1`,
      [userId],
    );

    expect(await passwordRows()).toEqual([
      {
        actor_id: userId,
        org_id: null,
        resource_type: "user",
        resource_id: userId,
        details: { outcome: "succeeded", reason: "password_changed" },
      },
    ]);
  });

  it("records nothing when the password is written back unchanged", async () => {
    await db.query(`UPDATE auth.users SET encrypted_password = encrypted_password WHERE id = $1`, [
      userId,
    ]);
    await db.query(`UPDATE auth.users SET email_confirmed_at = email_confirmed_at WHERE id = $1`, [
      userId,
    ]);

    expect(await passwordRows()).toEqual([]);
  });

  it("gives no role a way to call the recorder directly", async () => {
    const { rows } = await db.query<{ role: string; allowed: boolean }>(
      `SELECT role, has_function_privilege(role, 'public.record_password_change()', 'EXECUTE') AS allowed
         FROM unnest(ARRAY['anon', 'authenticated']) AS role`,
    );
    expect(rows.every((row) => !row.allowed)).toBe(true);
  });
});
