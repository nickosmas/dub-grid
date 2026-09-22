// @vitest-environment node

/**
 * Migration 040: `anon` holds no table privilege except the cookie banner's
 * write. Row-level security already refused it every row, so this is the
 * grant behind the policy catching up with the policy.
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

describe.runIf(reachable)("anon holds nothing (live DB)", () => {
  it("leaves exactly one grant, the cookie banner's write", async () => {
    const { rows } = await db.query<{ table_name: string; privilege_type: string }>(
      `SELECT DISTINCT table_name, privilege_type
         FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND grantee = 'anon'
        ORDER BY table_name, privilege_type`,
    );
    expect(rows).toEqual([{ table_name: "cookie_consents", privilege_type: "INSERT" }]);
  });

  it("refuses anon a read of an ordinary table", async () => {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL ROLE anon");
      await expect(db.query("SELECT 1 FROM public.employees LIMIT 1")).rejects.toThrow(
        /permission denied for table employees/,
      );
    } finally {
      await db.query("ROLLBACK");
    }
  });

  it("keeps the authenticated role's access untouched", async () => {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(DISTINCT table_name)::TEXT AS count
         FROM information_schema.table_privileges
        WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT'`,
    );
    expect(Number(rows[0].count)).toBeGreaterThan(30);
  });
});
