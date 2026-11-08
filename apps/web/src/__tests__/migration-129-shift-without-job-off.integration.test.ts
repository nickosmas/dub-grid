// @vitest-environment node

/**
 * Migration 129: with shifts without a job turned off (Settings > Jobs), no
 * draft write adds one, and a cell that already holds one keeps it. Each case
 * runs 129 from its file inside BEGIN/ROLLBACK against the seeded local
 * database, on a person created inside the transaction.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";
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
    await probe.query("SELECT 1 FROM public.schedule_cell_snapshots LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const MIGRATION = readFileSync(migrationPath("129_shift_without_job_off.sql"), "utf8");
const OFF = /Shifts without a job are off for this organization/;

interface Fixture {
  orgId: string;
  today: string;
  shiftId: number;
  otherShiftId: number;
  focusAreaId: number;
  jobId: number;
  shiftOnlyJobId: number;
  adminId: string;
}

let db: Client;
let fx: Fixture;
let empId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (!rows[0]) throw new Error(`No seed row for: ${sql}. Run npm run db:reset`);
  return rows[0] as T;
}

async function loadFixture(): Promise<Fixture> {
  const org = await one<{ id: string; today: string }>(
    `SELECT id, to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const shifts = await db.query<{ id: number; fa: number }>(
    `SELECT s.id, s.focus_area_id AS fa FROM public.shift_categories s
      WHERE s.org_id = $1 AND s.archived_at IS NULL
        AND s.focus_area_id = (
          SELECT focus_area_id FROM public.shift_categories
           WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
           GROUP BY focus_area_id HAVING count(*) > 1 ORDER BY focus_area_id LIMIT 1)
      ORDER BY s.id LIMIT 2`,
    [org.id],
  );
  const [shift, otherShift] = shifts.rows;
  if (!shift || !otherShift) throw new Error("No focus area with two shifts. Run npm run db:reset");
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND system_key IS NULL AND $2 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [org.id, shift.id],
  );
  const shiftOnly = await one<{ id: number }>(
    `SELECT id FROM public.jobs WHERE org_id = $1 AND system_key = 'default_shift_job'`,
    [org.id],
  );
  const admin = await one<{ id: string }>(
    `SELECT u.id FROM auth.users u
       JOIN public.organization_memberships m ON m.user_id = u.id AND m.org_id = $1
      WHERE u.email = 'qa-admin@dubgrid.test' AND m.archived_at IS NULL`,
    [org.id],
  );
  return {
    orgId: org.id,
    today: org.today,
    shiftId: Number(shift.id),
    otherShiftId: Number(otherShift.id),
    focusAreaId: Number(shift.fa),
    jobId: Number(job.id),
    shiftOnlyJobId: Number(shiftOnly.id),
    adminId: admin.id,
  };
}

function day(offset: number): string {
  const date = new Date(`${fx.today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createPerson(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.employees
       (org_id, employee_number, first_name, last_name, seniority, focus_area_ids)
     VALUES ($1,
       (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
       'Shift Only', 'Fixture', 9999, ARRAY[$2]::bigint[])
     RETURNING id`,
    [fx.orgId, fx.focusAreaId],
  );
  return rows[0].id;
}

async function setShiftsWithoutJob(enabled: boolean) {
  await db.query(`UPDATE public.organizations SET default_shift_enabled = $2 WHERE id = $1`, [
    fx.orgId,
    enabled,
  ]);
}

/** Writes a shift without a job straight into the cell, as earlier saves left it. */
async function hold(date: string, kind: "draft" | "published", shiftId = fx.shiftId) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3)
     ON CONFLICT (emp_id, date) DO UPDATE SET date = EXCLUDED.date
     RETURNING id`,
    [fx.orgId, empId, date],
  );
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [rows[0].id, fx.orgId, kind, [shiftId], [fx.shiftOnlyJobId]],
  );
}

async function asAdmin() {
  await actAsAuthenticated(db, {
    sub: fx.adminId,
    role: "authenticated",
    org_id: fx.orgId,
    org_role: "admin",
    platform_role: "none",
  });
}

async function asSuperuser() {
  await db.query(`RESET ROLE`);
  await db.query(`SELECT set_config('request.jwt.claims', '', true)`);
}

/** Runs `sql` as the Admin in a savepoint and returns the error it raised, if any. */
async function attempt(sql: string, params: unknown[] = []): Promise<Error | null> {
  await asAdmin();
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
    return error as Error;
  } finally {
    await asSuperuser();
  }
}

function saveDraft(date: string, jobId: number, shiftId = fx.shiftId) {
  return attempt(
    `SELECT public.write_schedule_cell_snapshot(
       $1, $2, $3::date, 'draft', 'worked', $4::bigint[], $5::bigint[])`,
    [fx.orgId, empId, date, [shiftId], [jobId]],
  );
}

describe.skipIf(!reachable)("129 shifts without a job turned off", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    fx = await loadFixture();
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
    await db.query(MIGRATION);
    empId = await createPerson();
    await setShiftsWithoutJob(false);
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refuses a new shift without a job and saves one with a job", async () => {
    expect(await saveDraft(day(1), fx.shiftOnlyJobId)).toMatchObject({
      message: expect.stringMatching(OFF),
    });
    expect(await saveDraft(day(1), fx.jobId)).toBeNull();
  });

  it("keeps one the cell already holds, published or in the draft", async () => {
    await hold(day(2), "published");
    await hold(day(3), "draft");
    expect(await saveDraft(day(2), fx.shiftOnlyJobId)).toBeNull();
    expect(await saveDraft(day(3), fx.shiftOnlyJobId)).toBeNull();
  });

  it("refuses changing a held one to another shift without a job", async () => {
    await hold(day(2), "published");
    expect(await saveDraft(day(2), fx.shiftOnlyJobId, fx.otherShiftId)).toMatchObject({
      message: expect.stringMatching(OFF),
    });
  });

  it("refuses moving one to another day", async () => {
    await hold(day(4), "published");
    const error = await attempt(
      `SELECT public.move_shift($1, $2, $3::date, $2, $4::date, 'worked',
         $5::bigint[], $6::bigint[])`,
      [fx.orgId, empId, day(4), day(5), [fx.shiftId], [fx.shiftOnlyJobId]],
    );
    expect(error).toMatchObject({ message: expect.stringMatching(OFF) });
  });

  it("saves a new one while they're allowed", async () => {
    await setShiftsWithoutJob(true);
    expect(await saveDraft(day(1), fx.shiftOnlyJobId)).toBeNull();
  });

  it("leaves one out of Import Previous Schedule, with its reason", async () => {
    await hold(day(7), "published");
    await asAdmin();
    const { rows } = await db.query<{ emp_id: string; outcome: string; reason: string | null }>(
      `SELECT emp_id, outcome, reason
         FROM public.import_previous_schedule($1, $2::date, $2::date, $3::date, $3::date, TRUE)`,
      [fx.orgId, day(7), day(14)],
    );
    await asSuperuser();
    expect(rows.filter((row) => row.emp_id === empId)).toEqual([
      { emp_id: empId, outcome: "skipped", reason: "shift_without_job_off" },
    ]);
  });

  it("counts what stays for the settings dialog, from today on", async () => {
    const usage = async () =>
      (
        await db.query<{
          upcoming_shifts: number;
          recurring_days: number;
          coverage_requirements: number;
        }>(`SELECT * FROM public.shift_without_job_usage($1)`, [fx.orgId])
      ).rows[0];
    const before = await usage();
    await hold(day(-1), "published");
    await hold(day(2), "published");
    await hold(day(3), "draft");
    await db.query(
      `INSERT INTO public.recurring_shifts (org_id, emp_id, day_of_week, state)
       VALUES ($1, $2, 1, jsonb_build_object('kind', 'worked', 'segments',
         jsonb_build_array(jsonb_build_object('shiftId', $3::bigint, 'jobId', $4::bigint, 'position', 0))))`,
      [fx.orgId, empId, fx.shiftId, fx.shiftOnlyJobId],
    );

    expect(await usage()).toEqual({
      upcoming_shifts: before.upcoming_shifts + 2,
      recurring_days: before.recurring_days + 1,
      coverage_requirements: before.coverage_requirements,
    });
  });

  it("refuses volunteering for an open shift without a job", async () => {
    const volunteer = () =>
      attempt(
        `SELECT public.volunteer_for_open_shift($1, $2, $3::date, $4::bigint[], $5::bigint[], $6)`,
        [fx.orgId, empId, day(1), [fx.shiftId], [fx.shiftOnlyJobId], fx.focusAreaId],
      );
    expect(await volunteer()).toMatchObject({ message: expect.stringMatching(OFF) });
    await setShiftsWithoutJob(true);
    // Allowed, it goes on to the usual checks: this person is the Admin's to schedule, not theirs.
    expect((await volunteer())?.message ?? "").not.toMatch(OFF);
  });
});
