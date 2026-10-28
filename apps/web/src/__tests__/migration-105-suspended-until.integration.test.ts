// @vitest-environment node

/**
 * Migration 105: a suspension's end (51g3) lives in suspended_until, goes
 * with the suspension, and is named in the hook's sign-in refusal. A
 * suspension planned for later is 103's planned change with status
 * `suspended`: it locks no day, carries no absence, puts a replaced planned
 * Away's absence days back, and is cleared by the job's one update that
 * suspends them, which closes their open requests (102). Each case runs 103
 * to 105 from their files inside BEGIN/ROLLBACK against the seeded local
 * database.
 *
 * Skipped when the local Postgres is unreachable (CI without Supabase).
 */

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { ACCOUNT_SUSPENDED_MESSAGE, suspendedUntilFromMessage } from "@dubgrid/domain";
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
  "103_planned_status_change.sql",
  "104_planned_last_day.sql",
  "105_suspended_until.sql",
].map((name) => readFileSync(migrationPath(name), "utf8"));

interface Fixture {
  orgId: string;
  /** A Calm Haven employee with an account, for the hook. */
  linkedEmpId: string;
  userId: string;
  shiftId: number;
  jobId: number;
  focusAreaId: number;
  vacationId: number;
  sickId: number;
  today: string;
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
  const { id: orgId, today } = await one<{ id: string; today: string }>(
    `SELECT id, to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM public.organizations WHERE slug = 'calmhaven'`,
  );
  const linked = await one<{ empId: string; userId: string }>(
    `SELECT e.id AS "empId", e.user_id AS "userId"
       FROM public.employees e
       JOIN public.profiles p ON p.id = e.user_id AND p.org_id = e.org_id
      WHERE e.org_id = $1 AND e.status = 'active' AND e.archived_at IS NULL
        AND p.deactivated_at IS NULL AND p.terminated_at IS NULL
      ORDER BY e.seniority LIMIT 1`,
    [orgId],
  );
  const shift = await one<{ id: number; fa: number }>(
    `SELECT id, focus_area_id AS fa FROM public.shift_categories
      WHERE org_id = $1 AND archived_at IS NULL AND focus_area_id IS NOT NULL
      ORDER BY id LIMIT 1`,
    [orgId],
  );
  const job = await one<{ id: number }>(
    `SELECT id FROM public.jobs
      WHERE org_id = $1 AND archived_at IS NULL AND assignment_mode = 'with_shift'
        AND $2 = ANY(applicable_shift_ids)
      ORDER BY id LIMIT 1`,
    [orgId, shift.id],
  );
  const [vacation, sick] = (
    await db.query<{ id: number }>(
      `SELECT id FROM public.absence_types
        WHERE org_id = $1 AND archived_at IS NULL ORDER BY id OFFSET 1 LIMIT 2`,
      [orgId],
    )
  ).rows;
  return {
    orgId,
    today,
    linkedEmpId: linked.empId,
    userId: linked.userId,
    shiftId: Number(shift.id),
    jobId: Number(job.id),
    focusAreaId: Number(shift.fa),
    vacationId: Number(vacation.id),
    sickId: Number(sick.id),
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
       'Suspended', 'Fixture', 9999, ARRAY[$2]::bigint[])
     RETURNING id`,
    [fx.orgId, fx.focusAreaId],
  );
  return rows[0].id;
}

async function cellOn(date: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.schedule_cells (org_id, emp_id, date) VALUES ($1, $2, $3) RETURNING id`,
    [fx.orgId, empId, date],
  );
  return rows[0].id;
}

async function publishedWorkFrom(from: number, to: number) {
  for (let offset = from; offset <= to; offset++) {
    await db.query(
      `SELECT public.sync_schedule_cell_snapshot($1, $2, 'published', 'worked', NULL, NULL, NULL,
         $3::bigint[], $4::bigint[])`,
      [await cellOn(day(offset)), fx.orgId, [fx.shiftId], [fx.jobId]],
    );
  }
}

/** Each day's draft state, as "kind" or "absence:<type>", or null with no draft. */
async function drafts(from: number, to: number): Promise<(string | null)[]> {
  const { rows } = await db.query<{ date: string; state: string }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date,
            CASE WHEN s.state_kind = 'absence' THEN 'absence:' || s.absence_type_id
                 ELSE s.state_kind END AS state
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id AND s.snapshot_kind = 'draft'
      WHERE c.emp_id = $1`,
    [empId],
  );
  const result: (string | null)[] = [];
  for (let offset = from; offset <= to; offset++) {
    result.push(rows.find((row) => row.date === day(offset))?.state ?? null);
  }
  return result;
}

async function planSuspension(from: string, until: string | null) {
  await db.query(
    `UPDATE public.employees
        SET planned_status = 'suspended', planned_from = $2, planned_until = $3,
            planned_absence_type_id = NULL
      WHERE id = $1`,
    [empId, from, until],
  );
}

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

type HookResult = { claims?: Record<string, unknown>; error?: { message: string } };

async function mint(): Promise<HookResult> {
  const { rows } = await db.query<{ result: HookResult }>(
    `SELECT public.custom_access_token_hook($1::jsonb) AS result`,
    [
      JSON.stringify({
        user_id: fx.userId,
        claims: { sub: fx.userId, aal: "aal1", role: "authenticated" },
        authentication_method: "password",
      }),
    ],
  );
  return rows[0].result;
}

describe.skipIf(!reachable)("105 suspended until", () => {
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
    await db.query(`DELETE FROM public.jwt_refresh_locks WHERE user_id = $1`, [fx.userId]);
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("names a suspension's end in the sign-in refusal, and keeps the sentinel without one", async () => {
    await db.query(
      `UPDATE public.employees SET suspended_at = now(), suspended_until = $2 WHERE id = $1`,
      [fx.linkedEmpId, day(10)],
    );
    const withEnd = await mint();
    expect(withEnd.error?.message).toBe(`${ACCOUNT_SUSPENDED_MESSAGE} Until ${day(10)}.`);
    expect(suspendedUntilFromMessage(withEnd.error?.message)).toBe(day(10));

    await db.query(`UPDATE public.employees SET suspended_until = NULL WHERE id = $1`, [
      fx.linkedEmpId,
    ]);
    expect((await mint()).error?.message).toBe(ACCOUNT_SUSPENDED_MESSAGE);
  });

  it("ends the end date with the suspension, and refuses one without a suspension", async () => {
    await db.query(
      `UPDATE public.employees SET suspended_at = now(), suspended_until = $2 WHERE id = $1`,
      [empId, day(10)],
    );
    await db.query(`UPDATE public.employees SET suspended_at = NULL WHERE id = $1`, [empId]);
    expect(
      await one(`SELECT suspended_until FROM public.employees WHERE id = $1`, [empId]),
    ).toEqual({ suspended_until: null });

    expect(
      await attempt(`UPDATE public.employees SET suspended_until = $2 WHERE id = $1`, [
        empId,
        day(10),
      ]),
    ).toMatchObject({
      message: expect.stringMatching(/employees_suspended_until_needs_suspension/),
    });
  });

  it("locks no day and clears nothing when a suspension is planned", async () => {
    await publishedWorkFrom(3, 6);

    await planSuspension(day(4), day(6));

    expect(await drafts(3, 6)).toEqual([null, null, null, null]);
    for (const offset of [4, 5, 40]) {
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT public.employee_schedulable_on($1, $2::date) AS ok`,
        [empId, day(offset)],
      );
      expect(rows[0].ok).toBe(true);
    }
  });

  it("refuses an absence on a planned suspension", async () => {
    expect(
      await attempt(
        `UPDATE public.employees
            SET planned_status = 'suspended', planned_from = $2, planned_until = $3,
                planned_absence_type_id = $4
          WHERE id = $1`,
        [empId, day(4), day(8), fx.vacationId],
      ),
    ).toMatchObject({
      message: expect.stringMatching(/employees_planned_suspension_has_no_absence/),
    });
  });

  it("puts a planned away's absence days back when a planned suspension replaces it", async () => {
    await publishedWorkFrom(4, 6);
    await db.query(
      `UPDATE public.employees
          SET planned_status = 'away', planned_from = $2, planned_until = $3,
              planned_absence_type_id = $4
        WHERE id = $1`,
      [empId, day(4), day(7), fx.vacationId],
    );
    expect(await drafts(4, 6)).toEqual(Array(3).fill(`absence:${fx.vacationId}`));

    await planSuspension(day(4), null);

    expect(await drafts(4, 6)).toEqual([null, null, null]);
  });

  it("starts through the one update that suspends them, clearing the plan and closing requests", async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.shift_requests
         (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
          absence_type_id)
       VALUES ($1, 'calloff', 'open', $2, $3, '{}'::jsonb, $4) RETURNING id`,
      [fx.orgId, empId, day(9), fx.sickId],
    );
    await planSuspension(day(0), day(8));

    // The job's update, as a manual Suspend makes it, with the plan's end.
    await db.query(
      `UPDATE public.employees
          SET suspended_at = now(), suspended_until = planned_until
        WHERE id = $1`,
      [empId],
    );

    expect(
      await one(
        `SELECT planned_status AS "plannedStatus",
                to_char(suspended_until, 'YYYY-MM-DD') AS "suspendedUntil"
           FROM public.employees WHERE id = $1`,
        [empId],
      ),
    ).toEqual({ plannedStatus: null, suspendedUntil: day(8) });
    expect(
      await one(`SELECT status FROM public.shift_requests WHERE id = $1`, [rows[0].id]),
    ).toEqual({ status: "expired" });
  });
});
