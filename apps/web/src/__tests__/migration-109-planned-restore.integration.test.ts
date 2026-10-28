// @vitest-environment node

/**
 * Migration 109: an Offboarded person can hold a planned return (51l),
 * `planned_status = 'active'` with no end or absence. It is the only plan an
 * Offboarded person can hold and no Active person can hold it; it stays while
 * they're Offboarded, leaves their days unschedulable, and ends when they're
 * restored. Each case runs 103 to 109's plan files inside BEGIN/ROLLBACK on a
 * person created inside the transaction.
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

const MIGRATION = readFileSync(migrationPath("109_planned_restore.sql"), "utf8");

let db: Client;
let orgId: string;
let today: string;
let focusAreaId: number;
let empId: string;

function day(offset: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createPerson(status: "active" | "removed"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.employees
       (org_id, employee_number, first_name, last_name, seniority, focus_area_ids, status,
        archived_at)
     VALUES ($1,
       (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
       'Returning', 'Fixture', 9999, ARRAY[$2]::bigint[], $3::text::public.employee_status,
       CASE WHEN $3::text = 'removed' THEN now() END)
     RETURNING id`,
    [orgId, focusAreaId, status],
  );
  return rows[0].id;
}

async function planReturn(from: string, until: string | null = null): Promise<void> {
  await db.query(
    `UPDATE public.employees
        SET planned_status = 'active', planned_from = $2, planned_until = $3
      WHERE id = $1`,
    [empId, from, until],
  );
}

async function plan(): Promise<{ status: string | null; from: string | null }> {
  const { rows } = await db.query<{ status: string | null; from: string | null }>(
    `SELECT planned_status AS status, to_char(planned_from, 'YYYY-MM-DD') AS "from"
       FROM public.employees WHERE id = $1`,
    [empId],
  );
  return rows[0];
}

async function schedulable(date: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT public.employee_schedulable_on($1, $2::date) AS ok`,
    [empId, date],
  );
  return rows[0].ok;
}

/** Runs `sql` in a savepoint and returns the error it raised, if any. */
async function attempt(sql: string, params: unknown[] = []): Promise<Error | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    return error as Error;
  }
}

describe.skipIf(!reachable)("109 planned restore", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    const { rows } = await db.query<{ id: string; today: string }>(
      `SELECT id, to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
         FROM public.organizations WHERE slug = 'calmhaven'`,
    );
    if (!rows[0]) throw new Error("No Calm Haven seed. Run npm run db:reset");
    ({ id: orgId, today } = rows[0]);
    const { rows: areas } = await db.query<{ id: number }>(
      `SELECT focus_area_id AS id FROM public.shift_categories
        WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
        ORDER BY id LIMIT 1`,
      [orgId],
    );
    focusAreaId = Number(areas[0].id);
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

  it("keeps a planned return on an Offboarded person, who stays unschedulable", async () => {
    empId = await createPerson("removed");

    await planReturn(day(5));

    expect(await plan()).toEqual({ status: "active", from: day(5) });
    for (const offset of [0, 5, 30]) expect(await schedulable(day(offset))).toBe(false);

    // An ordinary edit of the Offboarded record leaves the plan alone.
    await db.query(`UPDATE public.employees SET status_note = 'moved away' WHERE id = $1`, [empId]);
    expect(await plan()).toEqual({ status: "active", from: day(5) });
  });

  it("ends the plan when they're restored", async () => {
    empId = await createPerson("removed");
    await planReturn(day(5));

    await db.query(
      `UPDATE public.employees SET status = 'active', archived_at = NULL WHERE id = $1`,
      [empId],
    );

    expect(await plan()).toEqual({ status: null, from: null });
    expect(await schedulable(day(0))).toBe(true);
  });

  it("refuses a planned return with an end", async () => {
    empId = await createPerson("removed");
    expect(
      await attempt(
        `UPDATE public.employees
            SET planned_status = 'active', planned_from = $2, planned_until = $3
          WHERE id = $1`,
        [empId, day(5), day(9)],
      ),
    ).toMatchObject({ message: expect.stringMatching(/employees_planned_return_has_no_end/) });
  });

  it("drops a planned return for someone not Offboarded, and other plans for someone who is", async () => {
    empId = await createPerson("active");
    await db.query(
      `UPDATE public.employees SET planned_status = 'active', planned_from = $2 WHERE id = $1`,
      [empId, day(5)],
    );
    expect(await plan()).toEqual({ status: null, from: null });

    empId = await createPerson("removed");
    await db.query(
      `UPDATE public.employees SET planned_status = 'away', planned_from = $2 WHERE id = $1`,
      [empId, day(5)],
    );
    expect(await plan()).toEqual({ status: null, from: null });
  });

  it("still lets an Active person plan a last day, and offboarding ends it", async () => {
    empId = await createPerson("active");
    await db.query(
      `UPDATE public.employees SET planned_status = 'removed', planned_from = $2 WHERE id = $1`,
      [empId, day(5)],
    );
    expect(await plan()).toEqual({ status: "removed", from: day(5) });

    await db.query(
      `UPDATE public.employees SET status = 'removed', archived_at = now() WHERE id = $1`,
      [empId],
    );
    expect(await plan()).toEqual({ status: null, from: null });
  });
});
