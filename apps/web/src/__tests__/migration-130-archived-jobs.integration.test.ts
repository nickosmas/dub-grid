// @vitest-environment node

/**
 * Migration 130: an archived job stays on the cells that hold it and takes no
 * new work, and requests on shifts that already use one still settle. Each
 * case runs 129 and 130 from their files inside BEGIN/ROLLBACK against the
 * seeded local database, on jobs and people created inside the transaction.
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

const MIGRATIONS = [
  readFileSync(migrationPath("129_shift_without_job_off.sql"), "utf8"),
  readFileSync(migrationPath("130_archived_jobs_stay_on_history.sql"), "utf8"),
];
const ARCHIVED = /An archived job stays on the shifts that already have it/;
// What 082's strict resolver says about an archived job.
const NOT_FOUND = /schedule state jobs were not found/;

interface Fixture {
  orgId: string;
  today: string;
  shiftId: number;
  focusAreaId: number;
  adminId: string;
  adminEmpId: string;
}

let db: Client;
let fx: Fixture;
let personA: string;
let personB: string;
let archivedJobId: number;
let activeJobId: number;

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
  const shift = await one<{ id: number; fa: number }>(
    `SELECT id, focus_area_id AS fa FROM public.shift_categories
      WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
      ORDER BY id LIMIT 1`,
    [org.id],
  );
  const admin = await one<{ id: string; emp_id: string }>(
    `SELECT u.id, e.id AS emp_id FROM auth.users u
       JOIN public.organization_memberships m ON m.user_id = u.id AND m.org_id = $1
       JOIN public.employees e ON e.user_id = u.id AND e.org_id = $1
      WHERE u.email = 'qa-admin@dubgrid.test' AND m.archived_at IS NULL`,
    [org.id],
  );
  return {
    orgId: org.id,
    today: org.today,
    shiftId: Number(shift.id),
    focusAreaId: Number(shift.fa),
    adminId: admin.id,
    adminEmpId: admin.emp_id,
  };
}

function day(offset: number): string {
  const date = new Date(`${fx.today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createJob(name: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO public.jobs (org_id, name, abbr, assignment_mode, applicable_shift_ids, focus_area_ids)
     VALUES ($1, $2, 'ARC', 'with_shift', ARRAY[$3]::bigint[], ARRAY[$4]::bigint[])
     RETURNING id`,
    [fx.orgId, name, fx.shiftId, fx.focusAreaId],
  );
  return Number(rows[0].id);
}

async function archive(jobId: number) {
  await db.query(`UPDATE public.jobs SET archived_at = now() WHERE id = $1`, [jobId]);
}

async function createPerson(lastName: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.employees
       (org_id, employee_number, first_name, last_name, seniority, focus_area_ids)
     VALUES ($1,
       (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
       'Archived Job', $2, 9999, ARRAY[$3]::bigint[])
     RETURNING id`,
    [fx.orgId, lastName, fx.focusAreaId],
  );
  return rows[0].id;
}

/** Writes a shift straight into the cell, as earlier saves left it. */
async function hold(empId: string, date: string, kind: "draft" | "published", jobId: number) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3)
     ON CONFLICT (emp_id, date) DO UPDATE SET date = EXCLUDED.date
     RETURNING id`,
    [fx.orgId, empId, date],
  );
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [rows[0].id, fx.orgId, kind, [fx.shiftId], [jobId]],
  );
}

function workedState(jobId: number) {
  return {
    kind: "worked",
    focusAreaId: fx.focusAreaId,
    segments: [{ shiftId: fx.shiftId, jobId, position: 0, isMentored: false }],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: null,
    fromRecurring: false,
  };
}

async function insertRequest(values: {
  status: "open" | "pending_approval";
  requester: string;
  date: string;
  jobId: number;
  target?: string;
}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.shift_requests
       (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
        target_emp_id, target_shift_date, expires_at)
     VALUES ($1, 'pickup', $2, $3, $4::date, $5::jsonb, $6, $7::date, now() + interval '3 days')
     RETURNING id`,
    [
      fx.orgId,
      values.status,
      values.requester,
      values.date,
      JSON.stringify(workedState(values.jobId)),
      values.target ?? null,
      values.target ? values.date : null,
    ],
  );
  return rows[0].id;
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

/** Runs `sql` in a savepoint, as the Admin unless told otherwise, and returns the error it raised. */
async function attempt(
  sql: string,
  params: unknown[] = [],
  as: "admin" | "superuser" = "admin",
): Promise<Error | null> {
  if (as === "admin") await asAdmin();
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

function saveDraft(empId: string, date: string, jobId: number, customStart: string | null = null) {
  return attempt(
    `SELECT public.write_schedule_cell_snapshot(
       $1, $2, $3::date, 'draft', 'worked', $4::bigint[], $5::bigint[], NULL, $6)`,
    [fx.orgId, empId, date, [fx.shiftId], [jobId], customStart],
  );
}

function messageOf(error: Error | null): string {
  return error?.message ?? "";
}

describe.skipIf(!reachable)("130 archived jobs stay on history", () => {
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
    for (const migration of MIGRATIONS) await db.query(migration);
    archivedJobId = await createJob(`Archived job fixture ${Date.now()}`);
    activeJobId = await createJob(`Active job fixture ${Date.now()}`);
    personA = await createPerson("A");
    personB = await createPerson("B");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("refuses an archived job on a cell that doesn't hold it, and saves an active one", async () => {
    await archive(archivedJobId);
    expect(await saveDraft(personA, day(1), archivedJobId)).toMatchObject({
      message: expect.stringMatching(ARCHIVED),
    });
    expect(await saveDraft(personA, day(1), activeJobId)).toBeNull();
  });

  it("keeps one the cell already holds, published or in the draft, so its times can change", async () => {
    await hold(personA, day(2), "published", archivedJobId);
    await hold(personA, day(3), "draft", archivedJobId);
    await archive(archivedJobId);
    expect(await saveDraft(personA, day(2), archivedJobId, "08:00")).toBeNull();
    expect(await saveDraft(personA, day(3), archivedJobId, "08:00")).toBeNull();
  });

  it("refuses dragging one to another day", async () => {
    await hold(personA, day(4), "published", archivedJobId);
    await archive(archivedJobId);
    const error = await attempt(
      `SELECT public.move_shift($1, $2, $3::date, $2, $4::date, 'worked',
         $5::bigint[], $6::bigint[])`,
      [fx.orgId, personA, day(4), day(5), [fx.shiftId], [archivedJobId]],
    );
    expect(error).toMatchObject({ message: expect.stringMatching(ARCHIVED) });
  });

  it("lets someone claim a pickup of a shift that uses one", async () => {
    const request = await insertRequest({
      status: "open",
      requester: personA,
      date: day(2),
      jobId: archivedJobId,
    });
    await archive(archivedJobId);
    // Before 130 it stopped at the archived job.
    const error = await attempt(
      `SELECT public.claim_shift_request_unguarded($1, $2)`,
      [request, personB],
      "superuser",
    );
    expect(messageOf(error)).not.toMatch(NOT_FOUND);
    expect(error).toBeNull();
    const { rows } = await db.query<{ status: string; target_emp_id: string }>(
      `SELECT status, target_emp_id FROM public.shift_requests WHERE id = $1`,
      [request],
    );
    expect(rows[0]).toEqual({ status: "pending_approval", target_emp_id: personB });
  });

  it("lets the person asked answer a pickup of a shift that uses one", async () => {
    const request = await insertRequest({
      status: "open",
      requester: personA,
      date: day(2),
      jobId: archivedJobId,
      target: fx.adminEmpId,
    });
    await archive(archivedJobId);
    // It goes on to compare the request with the published schedule, which
    // this fixture never wrote.
    const error = await attempt(`SELECT public.respond_to_shift_request($1, $2, TRUE)`, [
      request,
      fx.adminEmpId,
    ]);
    expect(messageOf(error)).not.toMatch(NOT_FOUND);
    expect(messageOf(error)).toMatch(/has been modified since the request was created/);
  });

  it("lets others volunteer on a day someone's pending request uses one", async () => {
    await db.query(
      `INSERT INTO public.coverage_requirements (org_id, focus_area_id, job_id, preferred_shift_id, min_staff)
       VALUES ($1, $2, $3, $4, 3)`,
      [fx.orgId, fx.focusAreaId, activeJobId, fx.shiftId],
    );
    await db.query(
      `UPDATE public.employees SET focus_area_ids = array_append(focus_area_ids, $2::bigint)
        WHERE id = $1 AND NOT ($2::bigint = ANY(focus_area_ids))`,
      [fx.adminEmpId, fx.focusAreaId],
    );
    // The seed may already schedule the volunteer that day.
    await db.query(`DELETE FROM public.schedule_cells WHERE emp_id = $1 AND date = $2::date`, [
      fx.adminEmpId,
      day(3),
    ]);
    await db.query(
      `DELETE FROM public.shift_requests
        WHERE (requester_emp_id = $1 AND requester_shift_date = $2::date)
           OR (target_emp_id = $1 AND target_shift_date = $2::date)`,
      [fx.adminEmpId, day(3)],
    );
    await insertRequest({
      status: "pending_approval",
      requester: personA,
      date: day(3),
      jobId: archivedJobId,
    });
    await archive(archivedJobId);

    const error = await attempt(
      `SELECT public.volunteer_for_open_shift($1, $2, $3::date, $4::bigint[], $5::bigint[], $6)`,
      [fx.orgId, fx.adminEmpId, day(3), [fx.shiftId], [activeJobId], fx.focusAreaId],
    );
    expect(messageOf(error)).not.toMatch(NOT_FOUND);
    expect(error).toBeNull();
  });

  it("refuses volunteering for an open shift with an archived job", async () => {
    await archive(archivedJobId);
    const error = await attempt(
      `SELECT public.volunteer_for_open_shift($1, $2, $3::date, $4::bigint[], $5::bigint[], $6)`,
      [fx.orgId, fx.adminEmpId, day(3), [fx.shiftId], [archivedJobId], fx.focusAreaId],
    );
    expect(error).toMatchObject({ message: expect.stringMatching(ARCHIVED) });
  });

  it("leaves one out of Import Previous Schedule, with its reason", async () => {
    await hold(personA, day(7), "published", archivedJobId);
    await archive(archivedJobId);
    await asAdmin();
    const { rows } = await db.query<{ emp_id: string; outcome: string; reason: string | null }>(
      `SELECT emp_id, outcome, reason
         FROM public.import_previous_schedule($1, $2::date, $2::date, $3::date, $3::date, TRUE)`,
      [fx.orgId, day(7), day(14)],
    );
    await asSuperuser();
    expect(rows.filter((row) => row.emp_id === personA)).toEqual([
      { emp_id: personA, outcome: "skipped", reason: "archived_job" },
    ]);
  });

  it("edits a repeating series that already has one, and adds it to no other", async () => {
    const series = async (jobId: number) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.shift_series (org_id, emp_id, state, frequency, start_date)
           VALUES ($1, $2, $3::jsonb, 'weekly', $4::date) RETURNING id`,
          [fx.orgId, personA, JSON.stringify(workedState(jobId)), day(1)],
        )
      ).rows[0].id;
    const holding = await series(archivedJobId);
    const other = await series(activeJobId);
    await archive(archivedJobId);

    const edit = (seriesId: string, jobId: number) =>
      attempt(`SELECT public.update_series_all_shifts($1, $2, $3::jsonb)`, [
        seriesId,
        fx.orgId,
        JSON.stringify({ ...workedState(jobId), customStartTime: "08:00" }),
      ]);
    expect(await edit(holding, archivedJobId)).toBeNull();
    expect(await edit(other, archivedJobId)).toMatchObject({
      message: expect.stringMatching(ARCHIVED),
    });
  });
});
