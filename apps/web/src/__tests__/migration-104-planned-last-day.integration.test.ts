// @vitest-environment node

/**
 * Migration 104: a planned last day (51g2) locks every day after it for an
 * Active person, clears those days in the draft and closes their open
 * requests when it is planned, puts a replaced planned Away's absence days
 * back, and leaves the schedule to 067's clearing when the job offboards
 * them. Each case runs 103 and 104 from their files inside BEGIN/ROLLBACK
 * against the seeded local database, on a person created inside the
 * transaction so no other suite's cells are touched.
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
    await probe.query("SELECT 1 FROM public.schedule_cell_snapshots LIMIT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();

const REFUSED = /Employee not found, archived, or inactive/;
const MIGRATIONS = ["103_planned_status_change.sql", "104_planned_last_day.sql"].map((name) =>
  readFileSync(migrationPath(name), "utf8"),
);

interface Fixture {
  orgId: string;
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
       'Leaving', 'Fixture', 9999, ARRAY[$2]::bigint[])
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

async function writeWorked(cellId: string, kind: "draft" | "published") {
  await db.query(
    `SELECT public.sync_schedule_cell_snapshot($1, $2, $3, 'worked', NULL, NULL, NULL,
       $4::bigint[], $5::bigint[])`,
    [cellId, fx.orgId, kind, [fx.shiftId], [fx.jobId]],
  );
}

/** A last day `lastDay` days from today: stored as offboarded from the day after. */
async function planLastDay(lastDay: number) {
  await db.query(
    `UPDATE public.employees
        SET planned_status = 'removed', planned_from = $2, planned_until = NULL,
            planned_absence_type_id = NULL
      WHERE id = $1`,
    [empId, day(lastDay + 1)],
  );
}

async function planAway(from: string, until: string | null, absenceTypeId: number | null) {
  await db.query(
    `UPDATE public.employees
        SET planned_status = 'away', planned_from = $2, planned_until = $3,
            planned_absence_type_id = $4
      WHERE id = $1`,
    [empId, from, until, absenceTypeId],
  );
}

async function employee(): Promise<Record<string, unknown>> {
  return one(
    `SELECT status, archived_at IS NOT NULL AS archived, planned_status AS "plannedStatus"
       FROM public.employees WHERE id = $1`,
    [empId],
  );
}

async function publishedWorkFrom(from: number, to: number) {
  for (let offset = from; offset <= to; offset++) {
    await writeWorked(await cellOn(day(offset)), "published");
  }
}

type DayState = { draft: string | null; published: string | null } | null;

/** Each day's draft and published state, as "kind" or "absence:<type>". */
async function days(from: number, to: number): Promise<DayState[]> {
  const { rows } = await db.query<{ date: string; kind: string; state: string }>(
    `SELECT to_char(c.date, 'YYYY-MM-DD') AS date, s.snapshot_kind AS kind,
            CASE WHEN s.state_kind = 'absence' THEN 'absence:' || s.absence_type_id
                 ELSE s.state_kind END AS state
       FROM public.schedule_cells c
       JOIN public.schedule_cell_snapshots s ON s.cell_id = c.id
      WHERE c.emp_id = $1`,
    [empId],
  );
  const cells = new Set(
    (
      await db.query<{ date: string }>(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date FROM public.schedule_cells WHERE emp_id = $1`,
        [empId],
      )
    ).rows.map((row) => row.date),
  );
  const result: DayState[] = [];
  for (let offset = from; offset <= to; offset++) {
    const date = day(offset);
    if (!cells.has(date)) {
      result.push(null);
      continue;
    }
    const of = (kind: string) =>
      rows.find((row) => row.date === date && row.kind === kind)?.state ?? null;
    result.push({ draft: of("draft"), published: of("published") });
  }
  return result;
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

describe.skipIf(!reachable)("104 last day", () => {
  const vacation = () => `absence:${fx.vacationId}`;
  const worked = { draft: null, published: "worked" };
  const cleared = { draft: "deleted", published: "worked" };

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
    empId = await createPerson();
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("takes a shift on the last day and refuses one on any day after it", async () => {
    await planLastDay(5);

    await writeWorked(await cellOn(day(5)), "draft");
    for (const offset of [6, 40]) {
      const after = await cellOn(day(offset));
      expect(
        await attempt(
          `SELECT public.sync_schedule_cell_snapshot($1, $2, 'draft', 'worked', NULL, NULL, NULL,
             $3::bigint[], $4::bigint[])`,
          [after, fx.orgId, [fx.shiftId], [fx.jobId]],
        ),
      ).toMatchObject({ message: expect.stringMatching(REFUSED) });
    }
    // A recurring template asks about no day in particular, so it may exist.
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT public.employee_schedulable_on($1, 'infinity') AS ok`,
      [empId],
    );
    expect(rows[0].ok).toBe(true);
  });

  it("refuses a last day with an end date", async () => {
    expect(
      await attempt(
        `UPDATE public.employees
            SET planned_status = 'removed', planned_from = $2, planned_until = $3
          WHERE id = $1`,
        [empId, day(5), day(9)],
      ),
    ).toMatchObject({ message: expect.stringMatching(/employees_planned_removal_has_no_end/) });
  });

  it("clears only the days after the last day, and leaves them cleared when it moves later or is cancelled", async () => {
    await publishedWorkFrom(4, 8);

    await planLastDay(5);
    expect(await days(4, 8)).toEqual([worked, worked, cleared, cleared, cleared]);
    expect(await employee()).toEqual({
      status: "active",
      archived: false,
      plannedStatus: "removed",
    });

    await planLastDay(6);
    expect(await days(4, 8)).toEqual([worked, worked, cleared, cleared, cleared]);

    await db.query(`UPDATE public.employees SET planned_status = NULL WHERE id = $1`, [empId]);
    expect(await days(4, 8)).toEqual([worked, worked, cleared, cleared, cleared]);
  });

  it("clears more days when the last day moves earlier", async () => {
    await publishedWorkFrom(4, 8);
    await planLastDay(6);

    await planLastDay(4);

    expect(await days(4, 8)).toEqual([worked, cleared, cleared, cleared, cleared]);
  });

  it("puts a planned away's absence days back when a last day replaces it", async () => {
    await publishedWorkFrom(4, 8);
    await planAway(day(4), day(7), fx.vacationId);
    expect((await days(4, 8)).slice(0, 3)).toEqual([
      { draft: vacation(), published: "worked" },
      { draft: vacation(), published: "worked" },
      { draft: vacation(), published: "worked" },
    ]);

    await planLastDay(6);

    expect(await days(4, 8)).toEqual([worked, worked, worked, cleared, cleared]);
  });

  it("closes open requests for days after the last day only", async () => {
    const request = async (date: string) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.shift_requests
             (org_id, type, status, requester_emp_id, requester_shift_date, requester_state,
              absence_type_id)
           VALUES ($1, 'calloff', 'open', $2, $3, '{}'::jsonb, $4) RETURNING id`,
          [fx.orgId, empId, date, fx.sickId],
        )
      ).rows[0].id;
    const onLastDay = await request(day(5));
    const after = await request(day(6));

    await planLastDay(5);

    const status = async (id: string) =>
      (
        await one<{ status: string }>(`SELECT status FROM public.shift_requests WHERE id = $1`, [
          id,
        ])
      ).status;
    expect(await status(onLastDay)).toBe("open");
    expect(await status(after)).toBe("expired");
  });

  it("offboards through the ordinary update on the day and leaves the past alone", async () => {
    await publishedWorkFrom(-1, 2);
    await planLastDay(-1);

    // The job's update, as a manual Offboard makes it.
    await db.query(
      `UPDATE public.employees
          SET status = 'removed', archived_at = now(), status_note = 'Moved away'
        WHERE id = $1`,
      [empId],
    );

    expect(await employee()).toEqual({ status: "removed", archived: true, plannedStatus: null });
    expect(await days(-1, 2)).toEqual([worked, cleared, cleared, cleared]);
  });

  it("keeps no last day for someone suspended, away or offboarded", async () => {
    for (const change of [
      "suspended_at = now()",
      "status = 'inactive'",
      "status = 'removed', archived_at = now()",
    ]) {
      await db.query("SAVEPOINT change");
      await planLastDay(5);
      await db.query(`UPDATE public.employees SET ${change} WHERE id = $1`, [empId]);
      expect((await employee()).plannedStatus).toBeNull();
      await db.query("ROLLBACK TO SAVEPOINT change");
    }
  });
});
