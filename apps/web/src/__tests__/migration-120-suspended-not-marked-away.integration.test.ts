// @vitest-environment node

/**
 * Migration 120: the database refuses marking a suspended person away, or
 * planning time away for them, while offboarding them still ends the
 * suspension and suspending still cancels time away already planned. Each
 * case runs 120 from its file inside BEGIN/ROLLBACK against the seeded local
 * database.
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
    await probe.query("SELECT 1 FROM public.employees LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const MIGRATION = readFileSync(migrationPath("120_suspended_not_marked_away.sql"), "utf8");

let db: Client;
let empId: string;

async function person() {
  const { rows } = await db.query<{
    status: string;
    suspended: boolean;
    planned_status: string | null;
  }>(
    `SELECT status, suspended_at IS NOT NULL AS suspended, planned_status
       FROM public.employees WHERE id = $1`,
    [empId],
  );
  return rows[0];
}

const update = (set: string) =>
  db.query(`UPDATE public.employees SET ${set} WHERE id = $1`, [empId]);

async function expectRefused(set: string, pattern: RegExp) {
  await db.query("SAVEPOINT refused");
  try {
    await expect(update(set)).rejects.toThrow(pattern);
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT refused");
  }
}

describe.skipIf(!reachable)("120 a suspended person can't be marked away", () => {
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
    const { rows } = await db.query<{ id: string }>(
      `SELECT e.id FROM public.employees e
         JOIN public.organizations o ON o.id = e.org_id
        WHERE o.slug = 'calmhaven' AND e.status = 'active' AND e.archived_at IS NULL
          AND e.user_id IS NOT NULL AND e.suspended_at IS NULL AND e.planned_status IS NULL
        ORDER BY e.employee_number LIMIT 1`,
    );
    if (!rows[0]) throw new Error("No active Calm Haven member seeded. Run npm run db:reset");
    empId = rows[0].id;
    await update("suspended_at = now()");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refuses marking them away, with or without a return date", async () => {
    await expectRefused("status = 'inactive'", /suspended person can't be marked away/);
    await expectRefused(
      "status = 'inactive', away_until = current_date + 7",
      /suspended person can't be marked away/,
    );
    expect(await person()).toEqual({ status: "active", suspended: true, planned_status: null });
  });

  it("refuses planning time away for them", async () => {
    await expectRefused(
      "planned_status = 'away', planned_from = current_date + 3",
      /can't have time away planned/,
    );
  });

  it("marks them away when the same change lifts the suspension", async () => {
    await update("status = 'inactive', suspended_at = NULL");

    expect(await person()).toEqual({ status: "inactive", suspended: false, planned_status: null });
  });

  it("still offboards them, ending the suspension", async () => {
    await update("status = 'removed', archived_at = now()");

    expect(await person()).toEqual({ status: "removed", suspended: false, planned_status: null });
  });

  it("still cancels time away planned before the suspension", async () => {
    await update("suspended_at = NULL");
    await update("planned_status = 'away', planned_from = current_date + 3");

    await update("suspended_at = now()");

    expect(await person()).toEqual({ status: "active", suspended: true, planned_status: null });
  });
});
