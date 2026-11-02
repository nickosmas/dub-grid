// @vitest-environment node

/**
 * Migration 115: organizations that stored an earlier default label ("Focus
 * Areas", "Scheduled Departments") follow the product default again, and a
 * custom label is kept. Runs 115 from its file inside BEGIN/ROLLBACK against
 * the seeded local database.
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
    await probe.query(
      "SELECT focus_area_label, department_label FROM public.organizations LIMIT 1",
    );
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
const MIGRATION = readFileSync(migrationPath("115_label_defaults.sql"), "utf8");

describe.skipIf(!reachable)("115 label defaults", () => {
  let db: Client;
  let orgIds: string[] = [];

  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    const { rows } = await db.query<{ id: string }>(
      "SELECT id FROM public.organizations WHERE archived_at IS NULL ORDER BY name LIMIT 2",
    );
    if (rows.length < 2) throw new Error("Needs two seeded organizations. Run npm run db:reset");
    orgIds = rows.map((row) => row.id);
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  async function labels(orgId: string) {
    const { rows } = await db.query<{ focus: string | null; department: string | null }>(
      "SELECT focus_area_label AS focus, department_label AS department FROM public.organizations WHERE id = $1",
      [orgId],
    );
    return rows[0];
  }

  it("resets the earlier defaults and keeps a custom label", async () => {
    const [stored, custom] = orgIds;
    await db.query(
      "UPDATE public.organizations SET focus_area_label = 'Focus Areas', department_label = 'Scheduled Departments' WHERE id = $1",
      [stored],
    );
    await db.query(
      "UPDATE public.organizations SET focus_area_label = 'Wings', department_label = 'Units' WHERE id = $1",
      [custom],
    );

    await db.query(MIGRATION);

    expect(await labels(stored)).toEqual({ focus: null, department: null });
    expect(await labels(custom)).toEqual({ focus: "Wings", department: "Units" });
  });

  it("can run again without changing anything", async () => {
    await db.query(MIGRATION);
    await db.query(MIGRATION);
    const { rows } = await db.query<{ count: string }>(
      "SELECT count(*) FROM public.organizations WHERE focus_area_label = 'Focus Areas' OR department_label = 'Scheduled Departments'",
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});
