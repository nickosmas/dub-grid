// @vitest-environment node

/**
 * Migration 091: job preferences live in a table only the service role can
 * use. Runs 091 from its file inside BEGIN/ROLLBACK against the seeded local
 * database. Skipped when the local Postgres is unreachable.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
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
const MIGRATION = readFileSync(migrationPath("091_job_preferences.sql"), "utf8");

let db: Client;
let employee: { id: string; org_id: string };

describe.runIf(reachable)("job preferences (091, live DB)", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    const { rows } = await db.query<{ id: string; org_id: string }>(
      "SELECT id, org_id FROM public.employees ORDER BY id LIMIT 1",
    );
    employee = rows[0];
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("keeps one preference per person, only or prefers, with at least one job", async () => {
    await db.query(
      `INSERT INTO public.employee_job_preferences (employee_id, org_id, mode, job_ids)
       VALUES ($1, $2, 'only', ARRAY[1, 2])`,
      [employee.id, employee.org_id],
    );
    await expect(
      db.query(
        `INSERT INTO public.employee_job_preferences (employee_id, org_id, mode, job_ids)
         VALUES ($1, $2, 'prefers', ARRAY[3])`,
        [employee.id, employee.org_id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("refuses an unknown mode and an empty list", async () => {
    await db.query("SAVEPOINT bad_mode");
    await expect(
      db.query(
        `INSERT INTO public.employee_job_preferences (employee_id, org_id, mode, job_ids)
         VALUES ($1, $2, 'never', ARRAY[1])`,
        [employee.id, employee.org_id],
      ),
    ).rejects.toThrow(/check constraint/);
    await db.query("ROLLBACK TO SAVEPOINT bad_mode");
    await expect(
      db.query(
        `INSERT INTO public.employee_job_preferences (employee_id, org_id, mode, job_ids)
         VALUES ($1, $2, 'only', ARRAY[]::BIGINT[])`,
        [employee.id, employee.org_id],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("is closed to the browser roles and open to the service role", async () => {
    const { rows } = await db.query<{ role: string; can_select: boolean; can_insert: boolean }>(
      `SELECT role,
              has_table_privilege(role, 'public.employee_job_preferences', 'SELECT') AS can_select,
              has_table_privilege(role, 'public.employee_job_preferences', 'INSERT') AS can_insert
         FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role`,
    );
    expect(rows).toEqual([
      { role: "anon", can_select: false, can_insert: false },
      { role: "authenticated", can_select: false, can_insert: false },
      { role: "service_role", can_select: true, can_insert: true },
    ]);
    const { rows: rls } = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employee_job_preferences'::regclass",
    );
    expect(rls[0].relrowsecurity).toBe(true);
  });

  it("goes when the person goes", async () => {
    await db.query(
      `INSERT INTO public.employee_job_preferences (employee_id, org_id, mode, job_ids)
       VALUES ($1, $2, 'only', ARRAY[1])`,
      [employee.id, employee.org_id],
    );
    const { rows } = await db.query(
      `SELECT confdeltype FROM pg_constraint
        WHERE conrelid = 'public.employee_job_preferences'::regclass
          AND confrelid = 'public.employees'::regclass`,
    );
    expect(rows[0].confdeltype).toBe("c");
  });
});
